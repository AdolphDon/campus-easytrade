package com.campus.mq;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.constant.OrderStatus;
import com.campus.entity.Cart;
import com.campus.entity.Goods;
import com.campus.entity.Order;
import com.campus.entity.OrderItem;
import com.campus.mapper.CartMapper;
import com.campus.mapper.GoodsMapper;
import com.campus.mapper.OrderItemMapper;
import com.campus.mapper.OrderMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static com.campus.constant.GoodsStatus.goodsSALE_SOLD;
import static com.campus.constant.GoodsStatus.goodsSHELF_OFF;

/**
 * 支付成功异步消费者：MySQL扣库存 + 购物车清理
 * 订单状态已在回调中同步更新，此处只处理非核心业务
 */
@Slf4j
@Component
@RequiredArgsConstructor
@RocketMQMessageListener(
        topic = "order-pay-success-topic",
        consumerGroup = "order-pay-success-group"
)
public class PaySuccessConsumer implements RocketMQListener<String> {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final CartMapper cartMapper;
    private final GoodsMapper goodsMapper;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final CacheManager cacheManager;

    private static final String PAY_SUCCESS_KEY_PREFIX = "pay:success:";

    @Transactional(rollbackFor = Exception.class)
    public void onMessage(String message) {
        //解析JSON消息
        String paymentNo;
        try {
            Map map = objectMapper.readValue(message, Map.class);
            paymentNo = (String) map.get("paymentNo");
        } catch (JsonProcessingException e) {
            log.error("支付成功消息解析失败: message={}", message, e);
            return;
        }

        //1.幂等检查:setIfAbsent原子操作：key不存在才写入，过期时间1天
        String idempotentKey = PAY_SUCCESS_KEY_PREFIX + paymentNo;
        Boolean set = redisTemplate.opsForValue().setIfAbsent(idempotentKey, "1", 1, TimeUnit.DAYS);
        if (Boolean.FALSE.equals(set)) {
            log.info("支付消息已处理过，跳过: paymentNo={}", paymentNo);
            return;
        }

        //2.查询已支付的订单
        List<Order> orders = orderMapper.selectList(
                Wrappers.lambdaQuery(Order.class)
                        .eq(Order::getPaymentNo, paymentNo)
                        .eq(Order::getStatus, OrderStatus.PAID));
        if (orders.isEmpty()) {
            log.warn("未找到已支付订单: paymentNo={}", paymentNo);
            return;
        }

        //批量查询所有OrderItems（替代循环内N+1）
        List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
        List<OrderItem> allItems = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class).in(OrderItem::getOrderId, orderIds));
        Map<Long, List<OrderItem>> itemMap = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        //3.MySQL正式扣减库存（逐条检查影响行数，无法合并）
        Set<Long> stockDeductedGoodsIds = new LinkedHashSet<>();
        for (Order order : orders) {
            List<OrderItem> items = itemMap.getOrDefault(order.getId(), Collections.emptyList());
            for (OrderItem item : items) {
                int affected = goodsMapper.decreaseStock(item.getGoodsId(), item.getQuantity());
                if (affected == 0) {
                    log.error("库存扣减失败，可能库存不足: goodsId={}, quantity={}",
                            item.getGoodsId(), item.getQuantity());
                    throw new RuntimeException("库存扣减失败: goodsId=" + item.getGoodsId());
                }
                stockDeductedGoodsIds.add(item.getGoodsId());
            }
        }

        //4.批量查询已扣减库存的商品，处理已售罄下架
        if (!stockDeductedGoodsIds.isEmpty()) {
            List<Goods> goodsList = goodsMapper.selectBatchIds(new ArrayList<>(stockDeductedGoodsIds));
            List<Long> soldOutIds = new ArrayList<>();
            Set<Long> sellerIds = new HashSet<>();
            for (Goods goods : goodsList) {
                if (goods.getStock() <= 0) {
                    soldOutIds.add(goods.getId());
                    sellerIds.add(goods.getUserId());
                }
            }
            //批量更新售罄商品状态
            if (!soldOutIds.isEmpty()) {
                goodsMapper.update(null,
                        Wrappers.lambdaUpdate(Goods.class)
                                .set(Goods::getSaleStatus, goodsSALE_SOLD)
                                .set(Goods::getSoldTime, LocalDateTime.now())
                                .set(Goods::getShelfStatus, goodsSHELF_OFF)
                                .in(Goods::getId, soldOutIds));
            }
            //批量清除卖家统计数据缓存
            Cache statsCache = cacheManager.getCache("userGoodsStats");
            if (statsCache != null) {
                for (Long sellerId : sellerIds) {
                    statsCache.evict(sellerId);
                }
            }
        }

        //5.批量处理购物车
        for (Order order : orders) {
            List<OrderItem> items = itemMap.getOrDefault(order.getId(), Collections.emptyList());
            if (items.isEmpty()) continue;

            //批量查询该用户的所有关联购物车记录（替代循环内逐条selectOne）
            List<Long> goodsIdList = items.stream().map(OrderItem::getGoodsId).collect(Collectors.toList());
            List<Cart> cartList = cartMapper.selectList(
                    Wrappers.lambdaQuery(Cart.class)
                            .eq(Cart::getUserId, order.getUserId())
                            .in(Cart::getGoodsId, goodsIdList));
            Map<Long, Cart> cartMap = cartList.stream()
                    .collect(Collectors.toMap(Cart::getGoodsId, c -> c));

            List<Long> deleteCartIds = new ArrayList<>();
            for (OrderItem item : items) {
                Cart cart = cartMap.get(item.getGoodsId());
                if (cart == null) continue;
                if (item.getQuantity() >= cart.getQuantity()) {
                    deleteCartIds.add(cart.getId());
                } else {
                    cart.setQuantity(cart.getQuantity() - item.getQuantity());
                    cartMapper.updateById(cart);
                }
            }
            //批量删除已清空的购物车记录
            if (!deleteCartIds.isEmpty()) {
                cartMapper.delete(Wrappers.lambdaQuery(Cart.class).in(Cart::getId, deleteCartIds));
            }
        }
    }
}
