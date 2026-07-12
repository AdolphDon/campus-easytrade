package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.config.AlipayConfig;
import com.campus.dto.OrderQueryDTO;
import com.campus.entity.*;
import com.campus.exception.BusinessException;
import com.campus.mapper.*;
import com.campus.result.PageResult;
import com.campus.service.AsyncService;
import com.campus.service.OrderService;
import com.campus.service.RedisStockService;
import com.campus.vo.*;
import cn.hutool.core.lang.Snowflake;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.lang.TypeReference;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

import static com.campus.constant.GoodsStatus.AUDIT_STATUS_PASS;
import static com.campus.constant.GoodsStatus.goodsSHELF_ON;
import static com.campus.constant.OrderStatus.PENDING_PAY;
import static com.campus.constant.OrderStatus.PAID;
import static com.campus.constant.OrderStatus.SHIPPED;
import static com.campus.constant.OrderStatus.COMPLETED;
import static com.campus.constant.OrderStatus.CANCELLED;
import static com.campus.constant.OrderStatus.ORDER_COMPLETED;
import static com.campus.constant.OrderStatus.ORDER_CANCELLED;
import static com.campus.constant.SelectedStatus.SELECTED;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final CartMapper cartMapper;
    private final GoodsMapper goodsMapper;
    private final GoodsImageMapper goodsImageMapper;
    private final UserMapper userMapper;
    private final AddressBookMapper addressBookMapper;
    private final DormitoryMapper dormitoryMapper;
    private final RedisStockService redisStockService;
    private final AsyncService orderAsyncService;
    private final AlipayConfig alipayConfig;
    private final CacheManager cacheManager;
    private final StringRedisTemplate redisTemplate;

    private void evictOrderListCache(Long userId) {
        redisTemplate.delete("orderList:" + userId);
    }

    private void evictPaymentGroupCaches(String paymentNo, Long userId) {
        redisTemplate.delete("paymentGroupDetail::" + paymentNo + ":" + userId);
        redisTemplate.delete("orderAddress::" + paymentNo + ":" + userId + ":sell");
        redisTemplate.delete("orderAddress::" + paymentNo + ":" + userId + ":buy");
    }

    private void evictOrderDetailCache(Long itemId, Long userId) {
        redisTemplate.delete("orderDetail::" + itemId + ":" + userId + ":sell");
        redisTemplate.delete("orderDetail::" + itemId + ":" + userId + ":buy");
    }
    //Snowflake算法生成唯一ID
    private static final Snowflake SNOWFLAKE = IdUtil.getSnowflake(1, 1);

    //状态中文映射（OrderItem 展示用）
    private static final Map<Integer, String> STATUS_TEXT = new HashMap<>();

    static {
        STATUS_TEXT.put(0, "待付款");
        STATUS_TEXT.put(1, "待发货");
        STATUS_TEXT.put(2, "待收货");
        STATUS_TEXT.put(3, "已完成");
        STATUS_TEXT.put(4, "已取消");
        STATUS_TEXT.put(5, "退款中");
        STATUS_TEXT.put(6, "已退款");
    }

    //Order 表状态中文映射
    private static final Map<Integer, String> STATUS_TEXT_ORDER = new HashMap<>();

    static {
        STATUS_TEXT_ORDER.put(0, "待付款");
        STATUS_TEXT_ORDER.put(1, "已付款");
        STATUS_TEXT_ORDER.put(2, "已完成");
        STATUS_TEXT_ORDER.put(3, "已取消");
    }

    /**
     * 三步合一：校验状态 + Lua原子扣减 + 创建订单 + 发送延迟消息
     * 前端点击"去支付"时调用，成功后返回订单Id、订单号和paymentNo，再调/pay/create传入paymentNo生成统一二维码
     * @param userId
     * @param paymentMethod 支付方式:1-支付宝 2-微信
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public List<OrderSubmitVO> submitOrder(Long userId, Integer paymentMethod, Long addressId) {
        //1.获取用户选中的购物车商品
        List<Cart> cartList = cartMapper.selectList(
                Wrappers.lambdaQuery(Cart.class)
                        .eq(Cart::getUserId, userId)
                        .eq(Cart::getSelected, SELECTED));
        if (cartList.isEmpty()) {
            throw new BusinessException("请选择要购买的商品");
        }

        //校验是否绑定学校
        User currentUser = userMapper.selectById(userId);
        if (currentUser == null || currentUser.getSchoolId() == null) {
            throw new BusinessException("请先绑定学校后再进行结算");
        }

        //2.提取商品id、商品信息
        List<Long> goodsIds = cartList.stream().map(Cart::getGoodsId).collect(Collectors.toList());
        Map<Long, Goods> goodsMap = goodsMapper.selectBatchIds(goodsIds)
                .stream().collect(Collectors.toMap(Goods::getId, g -> g));

        List<GoodsImage> imgList = goodsImageMapper.selectList(
                Wrappers.lambdaQuery(GoodsImage.class)
                        .in(GoodsImage::getGoodsId, goodsIds)
                        .eq(GoodsImage::getSort, 0));
        Map<Long, String> imgMap = imgList.stream()
                .collect(Collectors.toMap(GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));

        //3.校验商品状态
        for (Cart cart : cartList) {
            Goods goods = goodsMap.get(cart.getGoodsId());
            if (goods == null) throw new BusinessException("商品不存在");
            if (!AUDIT_STATUS_PASS.equals(goods.getAuditStatus()))
                throw new BusinessException(goods.getName() + "审核未通过，暂不可购买");
            if (!goodsSHELF_ON.equals(goods.getShelfStatus()))
                throw new BusinessException(goods.getName() + "已下架");
        }

        //4.预查库存（Redis缓存缺失时自动从数据库加载）
        Map<Long, Integer> realTimeStock = redisStockService.getRealTimeStock(goodsIds);
        for (Cart cart : cartList) {
            if (realTimeStock.get(cart.getGoodsId()) == null) {
                Goods goods = goodsMap.get(cart.getGoodsId());
                if (goods != null && goods.getStock() != null) {
                    redisStockService.initStock(goods.getId(), goods.getStock());
                    realTimeStock.put(cart.getGoodsId(), goods.getStock());
                }
            }
        }
        List<String> failGoodsNames = new ArrayList<>();
        for (Cart cart : cartList) {
            Integer available = realTimeStock.get(cart.getGoodsId());
            if (available == null || available < cart.getQuantity()) {
                Goods g = goodsMap.get(cart.getGoodsId());
                failGoodsNames.add((g != null ? g.getName() : "ID:" + cart.getGoodsId())
                        + "[库存" + (available == null ? 0 : available) + ", 需求" + cart.getQuantity() + "]");
            }
        }
        if (!failGoodsNames.isEmpty()) {
            throw new BusinessException("以下商品库存不足: " + String.join("; ", failGoodsNames));
        }

        //5.Redis Lua原子预占库存
        Map<Long, Integer> quantityMap = new LinkedHashMap<>();
        for (Cart cart : cartList) {
            quantityMap.put(cart.getGoodsId(), cart.getQuantity());
        }
        if (!redisStockService.decrStockLua(quantityMap)) {
            log.warn("Lua预占库存失败(高并发竞争): userId={}", userId);
            throw new BusinessException("商品库存不足，请重新选择");
        }

        //6.按卖家分组拆单
        Map<Long, List<Cart>> sellerGroup = cartList.stream()
                .collect(Collectors.groupingBy(cart -> goodsMap.get(cart.getGoodsId()).getUserId()));

        List<OrderSubmitVO> resultList = new ArrayList<>();
        String paymentNo = String.valueOf(SNOWFLAKE.nextId());

        for (Map.Entry<Long, List<Cart>> entry : sellerGroup.entrySet()) {
            Long sellerId = entry.getKey();
            List<Cart> sellerCarts = entry.getValue();
            String orderNo = String.valueOf(SNOWFLAKE.nextId());

            BigDecimal total = BigDecimal.ZERO;
            for (Cart cart : sellerCarts) {
                Goods goods = goodsMap.get(cart.getGoodsId());
                if (goods != null) {
                    total = total.add(goods.getPrice().multiply(BigDecimal.valueOf(cart.getQuantity())));
                }
            }

            Order order = Order.builder()
                    .orderNo(orderNo)
                    .paymentNo(paymentNo)
                    .userId(userId)
                    .totalAmount(total)
                    .paymentMethod(paymentMethod)
                    .status(PENDING_PAY)
                    .build();
            orderMapper.insert(order);

            for (Cart cart : sellerCarts) {
                Goods goods = goodsMap.get(cart.getGoodsId());
                if (goods == null) continue;
                BigDecimal subtotal = goods.getPrice().multiply(BigDecimal.valueOf(cart.getQuantity()));
                OrderItem item = OrderItem.builder()
                        .orderId(order.getId())
                        .goodsId(goods.getId())
                        .sellerId(goods.getUserId())
                        .goodsName(goods.getName())
                        .goodsImage(imgMap.get(goods.getId()))
                        .price(goods.getPrice())
                        .quantity(cart.getQuantity())
                        .subtotal(subtotal)
                        .tradeType(goods.getTransactionType())
                        .addressId(goods.getTransactionType() == 1 ? addressId : null)
                        .settleStatus(0)
                        .status(PENDING_PAY)
                        .build();
                orderItemMapper.insert(item);
            }

            resultList.add(OrderSubmitVO.builder()
                    .orderId(order.getId())
                    .orderNo(orderNo)
                    .paymentNo(paymentNo)
                    .build());
        }

        //异步发送延迟消息
        orderAsyncService.processPostOrder(resultList.stream().map(OrderSubmitVO::getOrderNo).collect(Collectors.toList()));

        evictOrderListCache(userId);

        return resultList;
    }

    /**
     * 查询订单状态(前端轮询用):用户扫码支付后根据订单状态执行关闭二维码弹窗，跳转订单详情页or关闭二维码弹窗，提示"订单已取消"
     * @param orderNo
     * @return
     */
    public OrderStatusVO getOrderStatus(String orderNo) {
        //根据订单号查询订单
        Order order = orderMapper.selectOne(
                Wrappers.lambdaQuery(Order.class).eq(Order::getOrderNo, orderNo));
        if (order == null) return null;
        //封装订单id、订单号、状态、总金额
        return OrderStatusVO.builder()
                .orderId(order.getId())
                .orderNo(order.getOrderNo())
                .status(order.getStatus())
                .totalAmount(order.getTotalAmount())
                .build();
    }

    /**
     * 手动取消订单：用户点击支付弹窗的"取消"时调用，立即释放Redis库存，无需等30分钟超时兜底
     * @param paymentNo 支付单号，取消该单下所有待付款订单
     * @param userId
     */
    @Caching(evict = {
            @CacheEvict(value = "userGoodsStats", key = "#userId")
    })
    @Transactional(rollbackFor = Exception.class)
    public void cancelOrder(String paymentNo, Long userId) {
        //查询当前用户待付款的订单
        List<Order> orders = orderMapper.selectList(
                Wrappers.lambdaQuery(Order.class)
                        .eq(Order::getPaymentNo, paymentNo)
                        .eq(Order::getUserId, userId)
                        .eq(Order::getStatus, PENDING_PAY));
        if (orders.isEmpty()) {
            throw new BusinessException("没有可取消的订单");
        }

        //批量查询所有OrderItems（替代循环内逐条查询）
        List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
        List<OrderItem> allItems = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class).in(OrderItem::getOrderId, orderIds));
        Map<Long, List<OrderItem>> itemMap = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        //批量查询所有关联商品库存信息（替代循环内逐条查询）
        Set<Long> allGoodsIds = allItems.stream().map(OrderItem::getGoodsId).collect(Collectors.toSet());
        Map<Long, Goods> goodsMap = allGoodsIds.isEmpty() ? Collections.emptyMap() :
                goodsMapper.selectBatchIds(new ArrayList<>(allGoodsIds))
                        .stream().collect(Collectors.toMap(Goods::getId, g -> g));

        //汇总所有商品的库存回补数量（一次Lua调用）
        Map<Long, Integer> quantityMap = new LinkedHashMap<>();
        Map<Long, Integer> maxStockMap = new LinkedHashMap<>();
        for (OrderItem item : allItems) {
            quantityMap.merge(item.getGoodsId(), item.getQuantity(), Integer::sum);
            if (!maxStockMap.containsKey(item.getGoodsId())) {
                Goods g = goodsMap.get(item.getGoodsId());
                maxStockMap.put(item.getGoodsId(), g != null ? g.getStock() : Integer.MAX_VALUE);
            }
        }

        //批量更新订单状态为已取消
        orderMapper.update(null,
                Wrappers.lambdaUpdate(Order.class)
                        .set(Order::getStatus, ORDER_CANCELLED)
                        .in(Order::getId, orderIds));

        //批量更新订单详情状态为已取消
        orderItemMapper.update(null,
                Wrappers.lambdaUpdate(OrderItem.class)
                        .set(OrderItem::getStatus, CANCELLED)
                        .in(OrderItem::getOrderId, orderIds));

        //批量回补Redis库存（一次网络IO，自动cap at MySQL总库存）
        if (!quantityMap.isEmpty()) {
            redisStockService.incrStockLua(quantityMap, maxStockMap);
        }

        //清除订单相关缓存
        for (Order order : orders) {
            evictPaymentGroupCaches(paymentNo, userId);
            List<OrderItem> items = itemMap.getOrDefault(order.getId(), Collections.emptyList());
            for (OrderItem item : items) {
                evictOrderDetailCache(item.getId(), userId);
                evictOrderDetailCache(item.getId(), item.getSellerId());
                evictOrderListCache(item.getSellerId());
            }
        }
        evictOrderListCache(userId);
    }

    /**
     * 统一订单商品列表（我买到的or我卖出的）
     * @param userId 当前用户ID
     * @param dto
     * @return
     */
    @Transactional(readOnly = true)
    public PageResult<OrderListVO> listOrders(Long userId, OrderQueryDTO dto) {
        // Hash缓存：key = orderList:<userId>, field = dto.toString()
        String hashKey = "orderList:" + userId;
        String field = dto.toString();
        Object cached = redisTemplate.opsForHash().get(hashKey, field);
        if (cached != null) {
            return JSONUtil.toBean((String) cached, new TypeReference<PageResult<OrderListVO>>() {}, false);
        }

        Page<Order> page = new Page<>(dto.getPageNum(), dto.getPageSize());
        LambdaQueryWrapper<Order> wrapper = Wrappers.lambdaQuery(Order.class);

        //角色筛选：【我卖出的】【我买到的】
        if ("sell".equals(dto.getRole())) {
            //通过订单明细表查找当前用户作为卖家的订单
            List<OrderItem> sellerItems = orderItemMapper.selectList(
                    Wrappers.lambdaQuery(OrderItem.class)
                            .select(OrderItem::getOrderId)
                            .eq(OrderItem::getSellerId, userId));
            List<Long> sellOrderIds = sellerItems.stream()
                    .map(OrderItem::getOrderId).distinct().collect(Collectors.toList());
            if (sellOrderIds.isEmpty()) {
                return new PageResult<>(Collections.emptyList(), 0L,
                        page.getSize(), page.getCurrent(), 0L);
            }
            wrapper.in(Order::getId, sellOrderIds);
        } else {
            wrapper.eq(Order::getUserId, userId);
        }

        //tab筛选（从订单明细状态查询）
        if (dto.getTab() != null) {
            List<OrderItem> tabItems = orderItemMapper.selectList(
                    Wrappers.lambdaQuery(OrderItem.class)
                            .select(OrderItem::getOrderId)
                            .eq(OrderItem::getStatus, dto.getTab()));
            List<Long> tabOrderIds = tabItems.stream()
                    .map(OrderItem::getOrderId).distinct().collect(Collectors.toList());
            if (tabOrderIds.isEmpty()) {
                return new PageResult<>(Collections.emptyList(), 0L,
                        page.getSize(), page.getCurrent(), 0L);
            }
            wrapper.in(Order::getId, tabOrderIds);
        }

        //关键词按商品名称搜索
        if (StrUtil.isNotBlank(dto.getKeyword())) {
            //根据模糊字段查询订单详情表并返回关联订单id
            List<OrderItem> matchedItems = orderItemMapper.selectList(
                    Wrappers.lambdaQuery(OrderItem.class)
                            .select(OrderItem::getOrderId)
                            .like(OrderItem::getGoodsName, dto.getKeyword()));
            //关联订单id列表
            List<Long> matchedOrderIds = matchedItems.stream()
                    .map(OrderItem::getOrderId).distinct().collect(Collectors.toList());
            if (matchedOrderIds.isEmpty()) {
                return new PageResult<>(Collections.emptyList(), 0L,
                        page.getSize(), page.getCurrent(), 0L);
            }
            //如果进行模糊查询了则从下列订单id中查
            wrapper.in(Order::getId, matchedOrderIds);
        }

        wrapper.orderByDesc(Order::getId);//按照订单id进行降序排列
        Page<Order> orderPage = orderMapper.selectPage(page, wrapper);
        //orderList：订单表信息列
        List<Order> orderList = orderPage.getRecords();
        if (orderList.isEmpty()) {
            return new PageResult<>(Collections.emptyList(), orderPage.getTotal(),
                    orderPage.getSize(), orderPage.getCurrent(), orderPage.getPages());
        }

        //批量查所有关联的OrderItem（前置查询，用于获取卖家ID和后续组装）
        List<Long> orderIds = orderList.stream().map(Order::getId).collect(Collectors.toList());
        List<OrderItem> allItems = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class).in(OrderItem::getOrderId, orderIds));
        //itemMap<关联订单id，订单明细列表>
        Map<Long, List<OrderItem>> itemMap = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        //按role只查对方用户信息
        List<Long> userIds = new ArrayList<>();
        for (Order o : orderList) {
            if ("sell".equals(dto.getRole())) {
                if (o.getUserId() != null) userIds.add(o.getUserId());
            } else {
                List<OrderItem> oItems = itemMap.getOrDefault(o.getId(), Collections.emptyList());
                if (!oItems.isEmpty() && oItems.get(0).getSellerId() != null) {
                    userIds.add(oItems.get(0).getSellerId());
                }
            }
        }
        //userMap<用户id，用户信息>
        Map<Long, User> userMap = userIds.isEmpty() ? Collections.emptyMap() :
                userMapper.selectBatchIds(userIds.stream().distinct().collect(Collectors.toList()))
                        .stream().collect(Collectors.toMap(User::getId, u -> u));

        //交易方式中文映射
        Map<Integer, String> tradeTypeMap = new HashMap<>();
        tradeTypeMap.put(1, "卖家上门");
        tradeTypeMap.put(2, "买家自提");
        tradeTypeMap.put(3, "自行协商");

        //扁平组装：一个 OrderItem → 一个 OrderListVO
        List<OrderListVO> voList = new ArrayList<>();
        for (Order order : orderList) {
            List<OrderItem> items = itemMap.getOrDefault(order.getId(), Collections.emptyList());
            Long counterpartyUserId = "sell".equals(dto.getRole()) ? order.getUserId()
                    : (items.isEmpty() ? null : items.get(0).getSellerId());
            //counterparty当前商品的卖家or买家
            User counterparty = userMap.get(counterpartyUserId);

            for (OrderItem item : items) {
                BigDecimal subtotal = item.getPrice() != null && item.getQuantity() != null
                        ? item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity()))
                        : null;
                BigDecimal commission = subtotal != null
                        ? subtotal.multiply(BigDecimal.valueOf(alipayConfig.getCommissionRatio()))
                        : null;
                BigDecimal sellerIncome = subtotal != null && commission != null
                        ? subtotal.subtract(commission)
                        : null;

                voList.add(OrderListVO.builder()
                        .orderId(order.getId())
                        //对方信息
                        .counterpartyId(counterparty != null ? counterparty.getId() : null)
                        .counterpartyNickname(counterparty != null ? (counterparty.getNickname() != null ? counterparty.getNickname() : counterparty.getUsername()) : null)
                        .counterpartyAvatar(counterparty != null ? counterparty.getAvatar() : null)
                        //商品信息
                        .goodsId(item.getGoodsId())
                        .orderItemId(item.getId())
                        .goodsName(item.getGoodsName())
                        .goodsImage(item.getGoodsImage())
                        .price(item.getPrice())
                        .quantity(item.getQuantity())
                        .tradeTypeText(tradeTypeMap.getOrDefault(item.getTradeType(), "未知"))
                        //计算平台抽成和卖家实收（commissionRatio=0.05）
                        .commission(commission)
                        .sellerIncome(sellerIncome)
                        //订单状态（取自订单明细）
                        .status(item.getStatus())
                        .statusText(STATUS_TEXT.getOrDefault(item.getStatus(), "未知"))
                        //支付单号
                        .paymentNo(order.getPaymentNo())
                        .build());
            }
        }

        PageResult<OrderListVO> result = new PageResult<>(voList, orderPage.getTotal(),
                orderPage.getSize(), orderPage.getCurrent(), orderPage.getPages());
        redisTemplate.opsForHash().put(hashKey, field, JSONUtil.toJsonStr(result));
        return result;
    }

    /**
     * 订单详情（role=sell|buy 用于前端区分买家/卖家视角）
     * @param orderId 订单ID
     * @param userId 当前用户ID（防越权）
     * @param role sell-我卖出的 / buy-我买到的
     * @return
     */
    @Transactional(readOnly = true)
    public OrderDetailVO getOrderDetail(Long orderId, Long itemId, Long userId, String role) {
        Order order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在");
        }

        //越权校验：只有买家或卖家才能查看
        if (!userId.equals(order.getUserId())) {
            //查指定订单商品（获取卖家ID用于越权校验）
            OrderItem authItem = orderItemMapper.selectOne(
                    Wrappers.lambdaQuery(OrderItem.class)
                            .eq(OrderItem::getOrderId, orderId)
                            .eq(OrderItem::getId, itemId));
            if (authItem == null || !userId.equals(authItem.getSellerId())) {
                throw new BusinessException("无权查看该订单");
            }
        }

        //查卖家+买家信息
        User buyer = userMapper.selectById(order.getUserId());

        //查指定订单商品
        OrderItem item = orderItemMapper.selectOne(
                Wrappers.lambdaQuery(OrderItem.class)
                        .eq(OrderItem::getOrderId, orderId)
                        .eq(OrderItem::getId, itemId));
        if (item == null) {
            throw new BusinessException("订单商品不存在");
        }

        User seller = userMapper.selectById(item.getSellerId());

        //交易方式中文映射
        Map<Integer, String> tradeTypeMap = new HashMap<>();
        tradeTypeMap.put(1, "卖家上门");
        tradeTypeMap.put(2, "买家自提");
        tradeTypeMap.put(3, "自行协商");

        //对方信息：卖家的视角看买家，买家的视角看卖家
        User counterparty = "sell".equals(role) ? buyer : seller;

        BigDecimal subtotal = item != null && item.getPrice() != null && item.getQuantity() != null
                ? item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity()))
                : null;
        BigDecimal commission = subtotal != null
                ? subtotal.multiply(BigDecimal.valueOf(alipayConfig.getCommissionRatio()))
                : null;
        BigDecimal sellerIncome = subtotal != null && commission != null
                ? subtotal.subtract(commission)
                : null;

        return OrderDetailVO.builder()
                .orderId(order.getId())
                .orderNo(order.getOrderNo())
                .paymentNo(order.getPaymentNo())
                .alipayTradeNo(order.getAlipayTradeNo())
                .status(item != null ? item.getStatus() : order.getStatus())
                .statusText(STATUS_TEXT.getOrDefault(item != null && item.getStatus() != null ? item.getStatus() : order.getStatus(), "未知"))
                .totalAmount(item != null ? item.getSubtotal() : order.getTotalAmount())
                .createTime(order.getCreateTime())
                .payTime(order.getPayTime())
                .counterpartyId(counterparty != null ? counterparty.getId() : null)
                .counterpartyNickname(counterparty != null ? (counterparty.getNickname() != null ? counterparty.getNickname() : counterparty.getUsername()) : null)
                .counterpartyAvatar(counterparty != null ? counterparty.getAvatar() : null)
                //商品信息
                .goodsId(item != null ? item.getGoodsId() : null)
                .orderItemId(item != null ? item.getId() : null)
                .goodsName(item != null ? item.getGoodsName() : null)
                .goodsImage(item != null ? item.getGoodsImage() : null)
                .price(item != null ? item.getPrice() : null)
                .quantity(item != null ? item.getQuantity() : null)
                .subtotal(item != null ? item.getSubtotal() : null)
                .tradeType(item != null ? item.getTradeType() : null)
                .tradeTypeText(item != null ? tradeTypeMap.getOrDefault(item.getTradeType(), "未知") : null)
                //平台抽成和卖家实收
                .commission(commission)
                .sellerIncome(sellerIncome)
                .build();
    }

    /**
     * 大订单详情：一个支付单下所有订单及其商品（仅买家视角）
     */
    @Transactional(readOnly = true)
    public PaymentGroupVO getPaymentGroupDetail(String paymentNo, Long userId) {
        //查询该支付单下所有订单
        List<Order> orders = orderMapper.selectList(
                Wrappers.lambdaQuery(Order.class).eq(Order::getPaymentNo, paymentNo));
        if (orders.isEmpty()) {
            throw new BusinessException("支付单不存在");
        }

        //越权校验：当前用户必须是买家
        boolean isBuyer = orders.stream().anyMatch(o -> userId.equals(o.getUserId()));
        if (!isBuyer) {
            throw new BusinessException("无权查看该支付单");
        }

        //汇总金额
        BigDecimal totalAmount = orders.stream()
                .map(Order::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        //取第一个订单的信息作为顶层订单公共信息
        Order first = orders.get(0);

        //交易方式中文映射
        Map<Integer, String> tradeTypeMap = new HashMap<>();
        tradeTypeMap.put(1, "卖家上门");
        tradeTypeMap.put(2, "买家自提");
        tradeTypeMap.put(3, "自行协商");

        //批量查询所有OrderItems（替代循环内N+1）
        List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
        List<OrderItem> allItems = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class).in(OrderItem::getOrderId, orderIds));
        Map<Long, List<OrderItem>> itemMap = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        //批量查询卖家信息
        Set<Long> sellerIds = allItems.stream()
                .map(OrderItem::getSellerId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, User> sellerMap = sellerIds.isEmpty() ? Collections.emptyMap() :
                userMapper.selectBatchIds(new ArrayList<>(sellerIds))
                        .stream().collect(Collectors.toMap(User::getId, u -> u));

        //组装卖家分组列表
        List<PaymentGroupSellerVO> sellerVOs = new ArrayList<>();
        for (Order order : orders) {
            List<OrderItem> items = itemMap.getOrDefault(order.getId(), Collections.emptyList());

            Long sellerId = items.isEmpty() ? null : items.get(0).getSellerId();
            User seller = sellerMap.get(sellerId);

            List<PaymentGroupGoodsVO> goodsVOs = items.stream()
                    .map(item -> PaymentGroupGoodsVO.builder()
                            .goodsId(item.getGoodsId())
                            .goodsName(item.getGoodsName())
                            .goodsImage(item.getGoodsImage())
                            .price(item.getPrice())
                            .quantity(item.getQuantity())
                            .subtotal(item.getSubtotal())
                            .tradeTypeText(tradeTypeMap.getOrDefault(item.getTradeType(), "未知"))
                            .status(item.getStatus())
                            .statusText(STATUS_TEXT.getOrDefault(item.getStatus(), "未知"))
                            .build())
                    .collect(Collectors.toList());

            sellerVOs.add(PaymentGroupSellerVO.builder()
                    .counterpartyId(seller != null ? seller.getId() : null)
                    .counterpartyNickname(seller != null ? (seller.getNickname() != null ? seller.getNickname() : seller.getUsername()) : null)
                    .counterpartyAvatar(seller != null ? seller.getAvatar() : null)
                    .items(goodsVOs)
                    .build());
        }

        return PaymentGroupVO.builder()
                .orderId(first.getId())
                .orderNo(first.getOrderNo())
                .paymentNo(paymentNo)
                .alipayTradeNo(first.getAlipayTradeNo())
                .status(first.getStatus())
                .statusText(STATUS_TEXT_ORDER.getOrDefault(first.getStatus(), "未知"))
                .totalAmount(totalAmount)
                .createTime(first.getCreateTime())
                .payTime(first.getPayTime())
                .sellers(sellerVOs)
                .build();
    }

    /**
     * 获取订单商品地址（关联订单底部展示）
     * role=sell 返回卖家上门商品的买家默认地址
     * role=buy  返回买家自提商品的卖家取货地址
     */
    @Transactional(readOnly = true)
    public List<GoodsAddressVO> getOrderAddresses(String paymentNo, Long userId, String role) {
        List<Order> orders = orderMapper.selectList(
                Wrappers.lambdaQuery(Order.class).eq(Order::getPaymentNo, paymentNo));
        if (orders.isEmpty()) {
            throw new BusinessException("支付单不存在");
        }

        boolean isBuyer = orders.stream().anyMatch(o -> userId.equals(o.getUserId()));
        boolean isSeller = false;
        if (!isBuyer) {
            List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
            isSeller = orderItemMapper.selectCount(
                    Wrappers.lambdaQuery(OrderItem.class)
                            .in(OrderItem::getOrderId, orderIds)
                            .eq(OrderItem::getSellerId, userId)) > 0;
        }
        if (!isBuyer && !isSeller) {
            throw new BusinessException("无权查看");
        }

        List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
        List<OrderItem> items = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class).in(OrderItem::getOrderId, orderIds));

        Integer targetType = "sell".equals(role) ? 1 : 2;
        List<OrderItem> targetItems = items.stream()
                .filter(i -> targetType.equals(i.getTradeType()))
                .collect(Collectors.toList());
        if (targetItems.isEmpty()) return Collections.emptyList();

        Map<Long, Goods> goodsMap = goodsMapper.selectBatchIds(
                        targetItems.stream().map(OrderItem::getGoodsId).collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(Goods::getId, g -> g));

        //查地址
        Map<Long, AddressBook> addrMap;
        if ("sell".equals(role)) {
            //卖家上门：查订单明细中绑定的收货地址
            Set<Long> addrIds = targetItems.stream()
                    .map(OrderItem::getAddressId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            addrMap = addrIds.isEmpty() ? Collections.emptyMap() :
                    addressBookMapper.selectBatchIds(addrIds)
                            .stream().collect(Collectors.toMap(AddressBook::getId, a -> a));
        } else {
            //买家自提：查商品关联的取货地址
            Set<Long> addressIds = targetItems.stream()
                    .map(i -> {
                        Goods g = goodsMap.get(i.getGoodsId());
                        return g != null ? g.getAddressId() : null;
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            addrMap = addressBookMapper.selectBatchIds(addressIds)
                    .stream().collect(Collectors.toMap(AddressBook::getId, a -> a));
        }

        //查宿舍楼名称
        Set<Long> dormIds = addrMap.values().stream()
                .map(AddressBook::getDormitoryId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> dormMap = dormIds.isEmpty() ? Collections.emptyMap() :
                dormitoryMapper.selectBatchIds(dormIds)
                        .stream().collect(Collectors.toMap(Dormitory::getId, Dormitory::getName));

        List<GoodsAddressVO> result = new ArrayList<>();
        for (OrderItem item : targetItems) {
            AddressBook addr;
            if ("sell".equals(role)) {
                addr = addrMap.get(item.getAddressId());
            } else {
                Goods goods = goodsMap.get(item.getGoodsId());
                if (goods == null || goods.getAddressId() == null) continue;
                addr = addrMap.get(goods.getAddressId());
            }
            if (addr == null) continue;

            GoodsAddressVO vo = new GoodsAddressVO();
            vo.setGoodsId(item.getGoodsId());
            vo.setGoodsName(item.getGoodsName());
            vo.setDormitoryName(dormMap.getOrDefault(addr.getDormitoryId(), ""));
            vo.setDetailAddress(addr.getDetailAddress());
            vo.setName(addr.getName());
            vo.setPhone(addr.getPhone());
            result.add(vo);
        }

        return result;
    }

    /**
     * 卖家发货：校验当前用户是否为该订单明细的卖家，并将订单明细状态更新为已发货
     * @param itemId 订单明细ID
     * @param userId 当前用户ID
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "userGoodsStats", key = "#userId")
    public void shipOrder(Long itemId, Long userId) {
        //查询订单明细
        OrderItem item = orderItemMapper.selectById(itemId);
        if (item == null) {
            throw new BusinessException("订单商品不存在");
        }

        //校验当前用户是否为卖家
        if (!userId.equals(item.getSellerId())) {
            throw new BusinessException("无权操作该订单");
        }

        //校验订单明细状态是否为已付款
        if (!PAID.equals(item.getStatus())) {
            throw new BusinessException("当前订单状态不支持发货");
        }

        //更新订单明细状态为已发货
        item.setStatus(SHIPPED);
        orderItemMapper.updateById(item);

        //清除订单相关缓存
        Order order = orderMapper.selectById(item.getOrderId());
        evictOrderDetailCache(itemId, userId);
        evictOrderDetailCache(itemId, order.getUserId());
        evictPaymentGroupCaches(order.getPaymentNo(), order.getUserId());
        evictPaymentGroupCaches(order.getPaymentNo(), userId);
        evictOrderListCache(order.getUserId());
        evictOrderListCache(userId);

        log.info("卖家发货成功: itemId={}, orderId={}, userId={}", itemId, item.getOrderId(), userId);
    }

    /**
     * 买家收货：校验买家身份 → 更新订单明细为已完成 → 卖家分账 → 判断是否全单完成
     * @param itemId 订单明细ID
     * @param userId 当前用户ID
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "userGoodsStats", key = "#userId")
    })
    public void receiveOrder(Long itemId, Long userId) {
        //查询订单明细
        OrderItem item = orderItemMapper.selectById(itemId);
        if (item == null) {
            throw new BusinessException("订单商品不存在");
        }

        //查询关联订单
        Order order = orderMapper.selectById(item.getOrderId());
        if (order == null) {
            throw new BusinessException("订单不存在");
        }

        //校验当前用户是否为买家
        if (!userId.equals(order.getUserId())) {
            throw new BusinessException("无权操作该订单");
        }

        //校验订单明细状态是否为已发货
        if (!SHIPPED.equals(item.getStatus())) {
            throw new BusinessException("当前订单状态不支持确认收货");
        }

        //更新订单明细状态为已完成
        item.setStatus(COMPLETED);
        orderItemMapper.updateById(item);

        //计算平台佣金和卖家实收
        BigDecimal subtotal = item.getSubtotal() != null ? item.getSubtotal() : BigDecimal.ZERO;
        BigDecimal commissionRatio = BigDecimal.valueOf(alipayConfig.getCommissionRatio() != null ? alipayConfig.getCommissionRatio() : 0.05);
        BigDecimal commission = subtotal.multiply(commissionRatio).setScale(2, BigDecimal.ROUND_HALF_UP);
        BigDecimal sellerIncome = subtotal.subtract(commission).setScale(2, BigDecimal.ROUND_HALF_UP);

        item.setCommission(commission);
        item.setSellerIncome(sellerIncome);
        item.setSettleStatus(1);
        orderItemMapper.updateById(item);

        //卖家分账：将 sellerIncome 加到卖家余额
        userMapper.addBalance(item.getSellerId(), sellerIncome);

        //查询该订单下所有订单明细是否全部已完成
        List<OrderItem> allItems = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class).eq(OrderItem::getOrderId, order.getId()));
        boolean allCompleted = allItems.stream().allMatch(i -> COMPLETED.equals(i.getStatus()));
        if (allCompleted) {
            order.setStatus(ORDER_COMPLETED);
            orderMapper.updateById(order);
        }

        //清除订单相关缓存
        evictOrderDetailCache(itemId, userId);
        evictOrderDetailCache(itemId, item.getSellerId());
        evictPaymentGroupCaches(order.getPaymentNo(), userId);
        evictPaymentGroupCaches(order.getPaymentNo(), item.getSellerId());
        evictOrderListCache(userId);
        evictOrderListCache(item.getSellerId());

        //精确清除卖家统计数据缓存
        Cache statsCache = cacheManager.getCache("userGoodsStats");
        if (statsCache != null) {
            statsCache.evict(item.getSellerId());
        }
    }
}
