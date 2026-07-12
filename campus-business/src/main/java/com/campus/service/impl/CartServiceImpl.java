package com.campus.service.impl;

import cn.hutool.core.lang.TypeReference;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.campus.dto.CartPageQueryDTO;
import com.campus.dto.GoodsAddressDTO;
import com.campus.entity.Cart;
import com.campus.entity.Goods;
import com.campus.entity.GoodsImage;
import com.campus.entity.User;
import com.campus.exception.BusinessException;
import com.campus.entity.AddressBook;
import com.campus.entity.Dormitory;
import com.campus.mapper.AddressBookMapper;
import com.campus.mapper.DormitoryMapper;
import com.campus.mapper.CartMapper;
import com.campus.mapper.GoodsImageMapper;
import com.campus.mapper.GoodsMapper;
import com.campus.mapper.UserMapper;
import com.campus.result.PageResult;
import com.campus.service.CartService;
import com.campus.vo.CartGroupVO;
import com.campus.vo.CartVO;
import com.campus.vo.CheckoutValidateVO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.vo.GoodsAddressVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.campus.constant.DeletedStatus;
import com.campus.constant.UserStatus;

import java.util.HashMap;
import java.util.Objects;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.campus.constant.GoodsStatus.AUDIT_STATUS_PASS;
import static com.campus.constant.GoodsStatus.goodsSHELF_ON;
import static com.campus.constant.SelectedStatus.SELECTED;
import static com.campus.constant.SelectedStatus.UNSELECTED;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Service
@RequiredArgsConstructor
public class CartServiceImpl implements CartService {

    private final CartMapper cartMapper;
    private final GoodsMapper goodsMapper;
    private final GoodsImageMapper goodsImageMapper;
    private final UserMapper userMapper;
    private final AddressBookMapper addressBookMapper;
    private final DormitoryMapper dormitoryMapper;
    private final StringRedisTemplate redisTemplate;

    private static final String CONFIRM_ORDER_ADDRESS_PREFIX = "confirmOrderAddress:";

    private void evictCartListCache(Long userId) {
        redisTemplate.delete("cartList:" + userId);
    }

    /**
     * 查询当前用户的购物车列表(按卖家分组，分页)
     */
    @Transactional(readOnly = true)
    public PageResult<CartGroupVO> listCart(CartPageQueryDTO dto,Long userId) {
        //Hash缓存：key = cartList:<userId>, field = dto.toString()
        String hashKey = "cartList:" + userId;
        String field = dto.toString();
        Object cached = redisTemplate.opsForHash().get(hashKey, field);
        if (cached != null) {
            return JSONUtil.toBean((String) cached, new TypeReference<PageResult<CartGroupVO>>() {}, false);
        }

        //①有关键词查购物车中关键词商品，无关键词查全部购物车商品
        //根据当前用户id分页查询购物车记录
        Page<Cart> page = new Page<>(dto.getPageNum(), dto.getPageSize());
        LambdaQueryWrapper<Cart> wrapper = Wrappers.lambdaQuery(Cart.class)
                .eq(Cart::getUserId, userId);

        //根据商品表搜名称关键词匹配的商品-并转化为商品id
        if (StrUtil.isNotBlank(dto.getKeyword())) {
            List<Goods> matchedGoods = goodsMapper.selectList(
                    new LambdaQueryWrapper<Goods>()
                            .select(Goods::getId)
                            .like(Goods::getName, dto.getKeyword())
            );
            //提取商品ID:将关键词搜索出来的商品列表使用流式转换且只取id并收集转化为long类型的列表[列表->列表]
            List<Long> matchedGoodsIds = matchedGoods.stream().map(Goods::getId).collect(Collectors.toList());
            if (matchedGoodsIds.isEmpty()) {
                //搜不到商品直接返回空列表：分别对应统一分页返回中的列表数据、总条条数、每页条数、当前页、总页数
                return new PageResult<>(Collections.emptyList(), 0L,
                        page.getSize(), page.getCurrent(), 0L);
            }
            //购物车只保留这些商品：关键词搜索的商品id列表在购物车表中有的
            wrapper.in(Cart::getGoodsId, matchedGoodsIds);
        }

        //按购物车ID倒序(最新加入的放前面)
        wrapper.orderByDesc(Cart::getId);
        Page<Cart> cartPage = cartMapper.selectPage(page, wrapper);
        //-------------------------------------------------------------------------------------------------------

        //购物车商品列表(只有购物车表中的商品基础数据)
        List<Cart> cartList = cartPage.getRecords();
        if (cartList.isEmpty()) {
            //列表无商品直接返回空列表：
            return new PageResult<>(Collections.emptyList(), cartPage.getTotal(),
                    cartPage.getSize(), cartPage.getCurrent(), cartPage.getPages());
        }

        //提取购物车商品id
        List<Long> goodsIds = cartList.stream().map(Cart::getGoodsId).collect(Collectors.toList());
        //获取商品全部信息
        List<Goods> goodsList = goodsMapper.selectBatchIds(goodsIds);

        //① Map<key 商品id : value 商品本身数据>
        Map<Long, Goods> goodsMap = goodsList.stream().collect(Collectors.toMap(Goods::getId, g -> g));

        //同步购物车数量与勾选状态：超库存自动修正，已下架/未审核通过自动取消勾选
        List<Long> unselectCartIds = new ArrayList<>();
        for (Cart cart : cartList) {
            Goods goods = goodsMap.get(cart.getGoodsId());
            if (goods == null) continue;
            if (cart.getQuantity() > goods.getStock()) {
                cart.setQuantity(goods.getStock());
                cartMapper.updateById(cart);
            }
            boolean statusOk = AUDIT_STATUS_PASS.equals(goods.getAuditStatus()) && goodsSHELF_ON.equals(goods.getShelfStatus());
            if (!statusOk && SELECTED.equals(cart.getSelected())) {
                cart.setSelected(UNSELECTED);
                unselectCartIds.add(cart.getId());
            }
        }
        //批量取消勾选异常商品
        if (!unselectCartIds.isEmpty()) {
            cartMapper.update(null,
                    Wrappers.lambdaUpdate(Cart.class)
                            .set(Cart::getSelected, UNSELECTED)
                            .in(Cart::getId, unselectCartIds));
        }

        //批量查询商品首图(sort=0)
        LambdaQueryWrapper<GoodsImage> imgWrapper = Wrappers.lambdaQuery(GoodsImage.class)
                .in(GoodsImage::getGoodsId, goodsIds)//按goodsIds列表中id查询[101,102,103,104,105]
                .eq(GoodsImage::getSort, 0);
        List<GoodsImage> images = goodsImageMapper.selectList(imgWrapper);
        //② Map<key 商品id : value 首图地址>
        Map<Long, String> imageMap = images.stream()//{101：图片地址 102：图片地址}
                .collect(Collectors.toMap
                        //防止脏数据导致重复key报错,一个商品id如果对应两张图片，保留新的去掉旧的
                        (GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));

        //批量查询自提地址信息
        Map<Long, String> addressDormitoryMap = new HashMap<>();
        List<Long> addressIds = goodsList.stream().map(Goods::getAddressId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if (!addressIds.isEmpty()) {
            List<AddressBook> addrList = addressBookMapper.selectBatchIds(addressIds);
            List<Long> dormitoryIds = addrList.stream().map(AddressBook::getDormitoryId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
            if (!dormitoryIds.isEmpty()) {
                Map<Long, String> dormMap = dormitoryMapper.selectBatchIds(dormitoryIds).stream().collect(Collectors.toMap(Dormitory::getId, Dormitory::getName));
                for (AddressBook addr : addrList) {
                    String dormName = dormMap.get(addr.getDormitoryId());
                    if (dormName != null) addressDormitoryMap.put(addr.getId(), dormName);
                }
            }
        }

        //组装CartVO并按照卖家分组存入CartGroupVO中-LinkedHashMap(保证遍历顺序和插入顺序完全一致的Map)
        Map<Long, List<CartVO>> sellerGroupMap = new LinkedHashMap<>();

        //cartList:购物车商品基础信息列表 goodsMap:<key 商品id : value 商品全部信息> imageMap:<key 商品ID : value 图片地址>
        for (Cart cart : cartList) {
            Goods goods = goodsMap.get(cart.getGoodsId());
            if (goods == null) continue;

            //购物车商品基本数据开始封装
            CartVO vo = CartVO.builder()
                    .id(cart.getId())
                    .goodsId(cart.getGoodsId())
                    .quantity(cart.getQuantity())
                    .selected(cart.getSelected())
                    .goodsName(goods.getName())
                    .firstImage(imageMap.get(cart.getGoodsId()))
                    .price(goods.getPrice())
                    .stock(goods.getStock())
                    .auditStatus(goods.getAuditStatus())
                    .shelfStatus(goods.getShelfStatus())
                    .tradeType(goods.getTransactionType())
                    .addressId(goods.getAddressId())
                    .addressDormitory(addressDormitoryMap.get(goods.getAddressId()))
                    .build();

            //卖家商品分组开始封装：
            //computeIfAbsent:去map里看看有没有这个卖家【如果有→直接返回已有的列表】【如果没有→创建一个新的空列表】并添加商品数据
            //示例:【用户id：商品A】->【用户id：商品A、商品B】->【用户id：商品A、商品B、商品C】
            sellerGroupMap.computeIfAbsent(goods.getUserId(), k -> new ArrayList<>()).add(vo);
        }

        if (sellerGroupMap.isEmpty()) {
            //无信息直接返回空列表：
            return new PageResult<>(Collections.emptyList(), cartPage.getTotal(),
                    cartPage.getSize(), cartPage.getCurrent(), cartPage.getPages());
        }

        //批量查询卖家信息：相较于在循环中根据用户id挨个查用户信息，一次性查完可以提高效率
        Map<Long, User> sellerMap = userMapper.selectBatchIds(sellerGroupMap.keySet())
                .stream().collect(Collectors.toMap(User::getId, u -> u));

        //组装CartGroupVO(按购物车顺序保持卖家顺序)
        List<CartGroupVO> groupList = new ArrayList<>();
        //entrySet():把map里所有的【键+值】 打包成一个集合-(一个entry=一个键值对)
        for (Map.Entry<Long, List<CartVO>> entry : sellerGroupMap.entrySet()) {
            User seller = sellerMap.get(entry.getKey());
            if (seller == null) continue;
            groupList.add(CartGroupVO.builder()
                    .sellerId(seller.getId())//存入卖家id
                    .sellerNickname(seller.getNickname() != null ? seller.getNickname() : seller.getUsername())//存入卖家昵称
                    .sellerAvatar(seller.getAvatar())//存入卖家头像
                    .items(entry.getValue())//存入用户id所对应的商品信息
                    .build());
        }

        PageResult<CartGroupVO> result = new PageResult<>(groupList, cartPage.getTotal(),
                cartPage.getSize(), cartPage.getCurrent(), cartPage.getPages());
        redisTemplate.opsForHash().put(hashKey, field, JSONUtil.toJsonStr(result));
        return result;
    }

    /**
     * 添加商品到购物车
     * @param goodsId 商品ID
     * @param quantity 数量
     */
    @Transactional(rollbackFor = Exception.class)
    public void addCart(Long goodsId, Integer quantity) {
        //校验用户是否被禁用或是否已注销
        User user = userMapper.selectById(getCurrentUserId());
        if (user == null || DeletedStatus.DELETED.equals(user.getDeleted()) || UserStatus.userDISABLE.equals(user.getStatus())) {
            throw new BusinessException("账号异常，无法操作");
        }

        //校验商品是否存在
        Goods goods = goodsMapper.selectById(goodsId);
        if (goods == null) {
            throw new BusinessException("商品不存在");
        }

        //校验不能购买自己的商品
        if (goods.getUserId().equals(getCurrentUserId())) {
            throw new BusinessException("无法添加自己的商品到购物车");
        }

        //校验数量
        if (quantity == null || quantity < 1) {
            quantity = 1;
        }

        //查询购物车是否已存在该商品
        LambdaQueryWrapper<Cart> wrapper = Wrappers.lambdaQuery(Cart.class)
                .eq(Cart::getUserId, getCurrentUserId())
                .eq(Cart::getGoodsId, goodsId);
        Cart existCart = cartMapper.selectOne(wrapper);

        if (existCart != null) {
            //已存在则增加数量，但不能超过库存-(购物车商品数量+添加进购物车商品数量)和库存商品数量小的设置为购物车中该商品数量
            int newQty = existCart.getQuantity() + quantity;
            existCart.setQuantity(Math.min(newQty, goods.getStock()));

            cartMapper.updateById(existCart);
        } else {
            //不存在则新增，数量不能超过库存-添加进购物车商品数量和库存商品数量小的设置为购物车中该商品数量
            int finalQty = Math.min(quantity, goods.getStock());
            Cart cart = Cart.builder()
                    .userId(getCurrentUserId())
                    .goodsId(goodsId)
                    .quantity(finalQty)
                    .selected(UNSELECTED)//默认不选中
                    .build();
            cartMapper.insert(cart);
        }
        evictCartListCache(getCurrentUserId());
    }

    /**
     * 批量删除购物车记录
     * @param ids 购物车记录id列表
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteCart(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessException("请选择要删除的商品");
        }

        //校验删除的商品是否属于当前用户
        LambdaQueryWrapper<Cart> wrapper = Wrappers.lambdaQuery(Cart.class)
                .eq(Cart::getUserId, getCurrentUserId())
                .in(Cart::getId, ids);
        Long count = cartMapper.selectCount(wrapper);
        if (count == null || count != ids.size()) {
            throw new BusinessException("参数异常");
        }
        cartMapper.delete(wrapper);
        evictCartListCache(getCurrentUserId());
    }

    /**
     * 修改购物车商品数量
     * @param goodsId 商品id
     * @param quantity 更新后的数量
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateCartQuantity(Long goodsId, Integer quantity) {
        if (goodsId == null || quantity == null || quantity < 1) {
            throw new BusinessException("参数异常");
        }

        //查询购物车记录
        LambdaQueryWrapper<Cart> wrapper = Wrappers.lambdaQuery(Cart.class)
                .eq(Cart::getUserId, getCurrentUserId())
                .eq(Cart::getGoodsId, goodsId);
        Cart cart = cartMapper.selectOne(wrapper);
        if (cart == null) {
            throw new BusinessException("购物车记录不存在");
        }

        //查询商品库存
        Goods goods = goodsMapper.selectById(goodsId);
        if (goods == null) {
            throw new BusinessException("商品不存在");
        }

        //数量不能超过库存
        if (quantity > goods.getStock()) {
            quantity = goods.getStock();
        }

        cart.setQuantity(quantity);
        cartMapper.updateById(cart);
        evictCartListCache(getCurrentUserId());
    }

    /**
     * 勾选/取消勾选购物车商品
     * @param goodsIds 要取反勾选状态的商品id列表
     * @return 异常提示信息，无异常返回null
     */
    @Transactional(rollbackFor = Exception.class)
    public String selectCart(List<Long> goodsIds) {
        if (goodsIds == null || goodsIds.isEmpty()) return null;

        //批量查询购物车记录
        LambdaQueryWrapper<Cart> cartWrapper = Wrappers.lambdaQuery(Cart.class)
                .eq(Cart::getUserId, getCurrentUserId())
                .in(Cart::getGoodsId, goodsIds);
        Map<Long, Cart> cartMap = cartMapper.selectList(cartWrapper)
                .stream().collect(Collectors.toMap(Cart::getGoodsId, c -> c));

        //批量查询商品最新状态
        List<Goods> goodsList = goodsMapper.selectBatchIds(goodsIds);
        Map<Long, Goods> goodsMap = goodsList.stream().collect(Collectors.toMap(Goods::getId, g -> g));
        List<String> messages = new ArrayList<>();

        List<Long> toSelectIds = new ArrayList<>();
        List<Long> toUnselectIds = new ArrayList<>();

        for (Long goodsId : goodsIds) {
            Cart cart = cartMap.get(goodsId);
            if (cart == null) continue;

            if (UNSELECTED.equals(cart.getSelected())) {
                //未勾选→要勾选：校验商品状态
                Goods goods = goodsMap.get(goodsId);
                if (goods == null) continue;
                boolean statusOk = AUDIT_STATUS_PASS.equals(goods.getAuditStatus())
                        && goodsSHELF_ON.equals(goods.getShelfStatus());
                if (!statusOk) {
                    String reason = !AUDIT_STATUS_PASS.equals(goods.getAuditStatus())
                            ? "暂无法勾选" : "已下架无法勾选";
                    messages.add(goods.getName() + reason);
                    continue;
                }
                if (goods.getStock() == null || goods.getStock() <= 0) {
                    messages.add(goods.getName() + "已售空无法勾选");
                    continue;
                }
                toSelectIds.add(cart.getId());
            } else {
                //已勾选→取消勾选：直接设为未选中
                toUnselectIds.add(cart.getId());
            }
        }

        //批量更新勾选状态
        if (!toSelectIds.isEmpty()) {
            cartMapper.update(null,
                    Wrappers.lambdaUpdate(Cart.class)
                            .set(Cart::getSelected, SELECTED)
                            .in(Cart::getId, toSelectIds));
        }
        if (!toUnselectIds.isEmpty()) {
            cartMapper.update(null,
                    Wrappers.lambdaUpdate(Cart.class)
                            .set(Cart::getSelected, UNSELECTED)
                            .in(Cart::getId, toUnselectIds));
        }

        if (messages.isEmpty()) {
            evictCartListCache(getCurrentUserId());
            return null;
        }
        evictCartListCache(getCurrentUserId());
        return String.join("；", messages);
    }

    /**
     * 获取确认订单里交易方式为买家自提的商品的地址
     */
    @Transactional(readOnly = true)
    public List<GoodsAddressVO> getGoodsAddress(GoodsAddressDTO dto) {
        // ... existing code unchanged ...
        if (dto.getGoodsIdList() == null || dto.getGoodsIdList().isEmpty()) {
            return Collections.emptyList();
        }

        List<Goods> goodsList = goodsMapper.selectBatchIds(dto.getGoodsIdList());
        if (goodsList.isEmpty()) {
            return Collections.emptyList();
        }

        goodsList = goodsList.stream().filter(g -> g.getTransactionType() != null && g.getTransactionType() == 2).collect(Collectors.toList());
        if (goodsList.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> addressIds = goodsList.stream()
                .map(Goods::getAddressId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        Map<Long, AddressBook> addressMap = addressBookMapper.selectBatchIds(addressIds)
                .stream().collect(Collectors.toMap(AddressBook::getId, a -> a));

        List<Long> dormitoryIds = addressMap.values().stream()
                .map(AddressBook::getDormitoryId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, String> dormitoryMap = dormitoryIds.isEmpty() ? new HashMap<>() :
                dormitoryMapper.selectBatchIds(dormitoryIds)
                        .stream().collect(Collectors.toMap(Dormitory::getId, Dormitory::getName));

        List<GoodsAddressVO> resultList = goodsList.stream().map(goods -> {
            GoodsAddressVO vo = new GoodsAddressVO();
            vo.setGoodsId(goods.getId());
            vo.setGoodsName(goods.getName());
            AddressBook addr = addressMap.get(goods.getAddressId());
            if (addr != null) {
                vo.setDetailAddress(addr.getDetailAddress());
                vo.setName(addr.getName());
                vo.setPhone(addr.getPhone());
                vo.setDormitoryName(dormitoryMap.getOrDefault(addr.getDormitoryId(), ""));
            }
            return vo;
        }).collect(Collectors.toList());

        return resultList;
    }

    /**
     * 获取确认订单地址（Hash 缓存，O(1) 逐用户删除）
     */
    @Transactional(readOnly = true)
    public List<GoodsAddressVO> getGoodsAddressCached(GoodsAddressDTO dto) {
        Long userId = getCurrentUserId();
        String hashKey = CONFIRM_ORDER_ADDRESS_PREFIX + userId;
        String field = dto.toString();

        String cached = (String) redisTemplate.opsForHash().get(hashKey, field);
        if (cached != null) {
            return JSONUtil.parseArray(cached).toList(GoodsAddressVO.class);
        }

        List<GoodsAddressVO> result = getGoodsAddress(dto);
        redisTemplate.opsForHash().put(hashKey, field, JSONUtil.toJsonStr(result));
        return result;
    }

    /**
     * 结算前校验：检查勾选商品的库存/上下架状态，自动修正异常数据
     * @param goodsIds 勾选的商品id列表
     * @return CheckoutValidateVO，包含异常提示信息和是否需要买家地址
     */
    @Transactional(rollbackFor = Exception.class)
    public CheckoutValidateVO checkoutValidate(List<Long> goodsIds) {
        if (goodsIds == null || goodsIds.isEmpty()) {
            return new CheckoutValidateVO("请选择要结算的商品", false);
        }

        //查询当前用户购物车中勾选的商品
        LambdaQueryWrapper<Cart> cartWrapper = Wrappers.lambdaQuery(Cart.class)
                .eq(Cart::getUserId, getCurrentUserId())
                .eq(Cart::getSelected, SELECTED)
                .in(Cart::getGoodsId, goodsIds);
        List<Cart> cartList = cartMapper.selectList(cartWrapper);
        if (cartList.isEmpty()) {
            return new CheckoutValidateVO("请选择要结算的商品", false);
        }

        //批量查询商品最新信息
        List<Goods> goodsList = goodsMapper.selectBatchIds(goodsIds);
        Map<Long, Goods> goodsMap = goodsList.stream().collect(Collectors.toMap(Goods::getId, g -> g));

        List<String> messages = new ArrayList<>();
        List<Long> unselectCartIds = new ArrayList<>();

        for (Cart cart : cartList) {
            Goods goods = goodsMap.get(cart.getGoodsId());
            if (goods == null) {
                messages.add("商品：" + cart.getId() + "不存在");
                continue;
            }

            //检查审核状态和上架状态
            boolean statusOk = AUDIT_STATUS_PASS.equals(goods.getAuditStatus())
                    && goodsSHELF_ON.equals(goods.getShelfStatus());
            if (!statusOk) {
                messages.add(goods.getName() + "已下架");
                //下架商品取消勾选
                cart.setSelected(UNSELECTED);
                unselectCartIds.add(cart.getId());
                continue;
            }

            //检查库存
            if (cart.getQuantity() > goods.getStock()) {
                messages.add(goods.getName() + "库存不足（现有" + goods.getStock() + "件）");
                //超库存自动修正
                cart.setQuantity(goods.getStock());
                cartMapper.updateById(cart);
            }
        }

        //批量取消勾选下架商品
        if (!unselectCartIds.isEmpty()) {
            cartMapper.update(null,
                    Wrappers.lambdaUpdate(Cart.class)
                            .set(Cart::getSelected, UNSELECTED)
                            .in(Cart::getId, unselectCartIds));
        }

        //去重
        List<String> distinctMsgs = messages.stream().distinct().collect(Collectors.toList());

        //检查勾选商品中是否有卖家上门(transactionType=1)的交易方式
        boolean hasSellerDelivery = goodsList.stream()
                .anyMatch(g -> g.getTransactionType() != null && g.getTransactionType() == 1);

        if (distinctMsgs.isEmpty()) {
            return new CheckoutValidateVO(null, hasSellerDelivery);
        }
        return new CheckoutValidateVO(String.join("；", distinctMsgs) + "，请刷新购物车", hasSellerDelivery);
    }
}
