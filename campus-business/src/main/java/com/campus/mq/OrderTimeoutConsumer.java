package com.campus.mq;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.constant.OrderStatus;
import com.campus.entity.Order;
import com.campus.entity.OrderItem;
import com.campus.mapper.OrderItemMapper;
import com.campus.mapper.OrderMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * ①取消订单主链路-订单超时未支付取消消费者
 * RocketMQ消息监听器：监听 order-timeout-cancel-topic，收到订单号后取消订单 + 释放Redis库存
 * 当order-timeout-cancel-topic上有消息到达时，RocketMQ 框架自动触发它的 onMessage()方法
 */
@Slf4j
@Component
@RequiredArgsConstructor
@RocketMQMessageListener(
        topic = "order-timeout-cancel-topic",
        consumerGroup = "order-timeout-cancel-group"
)
public class OrderTimeoutConsumer implements RocketMQListener<String> {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final StringRedisTemplate redisTemplate;

    /**
     * 消费消息-对超时订单处理、变更订单表、释放Redis库存
     * @param orderNo
     */
    public void onMessage(String orderNo) {
        //查询订单
        Order order = orderMapper.selectOne(
                Wrappers.lambdaQuery(Order.class).eq(Order::getOrderNo, orderNo));
        if (order == null) {
            log.warn("订单不存在: orderNo={}", orderNo);
            return;
        }

        //非待付款状态不处理（已支付、已取消等）
        if (!OrderStatus.PENDING_PAY.equals(order.getStatus())) {
            log.info("订单状态已变更，跳过取消: orderNo={}, status={}", orderNo, order.getStatus());
            return;
        }
        //取消订单
        order.setStatus(OrderStatus.ORDER_CANCELLED);
        orderMapper.updateById(order);
        //释放Redis预占库存
        List<OrderItem> items = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class).eq(OrderItem::getOrderId, order.getId()));
        for (OrderItem item : items) {
            redisTemplate.opsForValue().increment(
                    "stock:goods:" + item.getGoodsId(), item.getQuantity());
        }
        //同步更新订单详情状态为已取消（批量）
        orderItemMapper.update(null,
                Wrappers.lambdaUpdate(OrderItem.class)
                        .set(OrderItem::getStatus, OrderStatus.CANCELLED)
                        .eq(OrderItem::getOrderId, order.getId()));
        //清除订单相关缓存
        for (OrderItem item : items) {
            evictOrderDetailCache(item.getId(), order.getUserId());
            evictOrderDetailCache(item.getId(), item.getSellerId());
            evictOrderListCache(item.getSellerId());
        }
        evictPaymentGroupCaches(order.getPaymentNo(), order.getUserId());
        evictOrderListCache(order.getUserId());
    }

    private void evictOrderListCache(Long userId) {
        redisTemplate.delete("orderList:" + userId);
    }

    private void evictPaymentGroupCaches(String paymentNo, Long userId) {
        redisTemplate.delete("paymentGroupDetail::" + paymentNo + ":" + userId);
    }

    private void evictOrderDetailCache(Long itemId, Long userId) {
        redisTemplate.delete("orderDetail::" + itemId + ":" + userId + ":sell");
        redisTemplate.delete("orderDetail::" + itemId + ":" + userId + ":buy");
    }
}
