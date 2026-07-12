package com.campus.task;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.campus.constant.OrderStatus;
import com.campus.entity.Goods;
import com.campus.entity.Order;
import com.campus.entity.OrderItem;
import com.campus.mapper.GoodsMapper;
import com.campus.mapper.OrderItemMapper;
import com.campus.mapper.OrderMapper;
import com.campus.service.RedisStockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.CacheManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * ②取消订单兜底链路-系统定时任务：自动取消超时未支付订单
 * 兜底策略：即使RocketMQ延迟消息丢失或未送达，此定时任务也能确保订单最终被取消
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCancelTask {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final GoodsMapper goodsMapper;
    private final RedisStockService redisStockService;
    private final CacheManager cacheManager;

    //RocketMQ的延迟等级4理论就是30分钟，为了避免并发冲突多给2秒余量
    private static final int TIMEOUT_MINUTES = 30;
    private static final int BUFFER_SECONDS = 2;//缓冲时间

    /**
     * 每30秒执行一次：取消超时未支付的订单+回滚Redis库存
     */
    @Transactional(rollbackFor = Exception.class)//加上事务回滚保障【库存回补+订单取消】数据一致
    @Scheduled(fixedRate = 30000)
    public void autoCancelExpiredOrders() {
        long start = System.currentTimeMillis();
        //1.查询所有超时未支付的订单：status=0待支付 AND createTime < 当前时间-30分钟
        //deadline超时时间点：当前时间减去30分钟再减去2秒缓冲容错时间
        LocalDateTime deadline = LocalDateTime.now().minusMinutes(TIMEOUT_MINUTES).minusSeconds(BUFFER_SECONDS);
        List<Order> expiredOrders = orderMapper.selectList(
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getStatus, OrderStatus.PENDING_PAY)//待付款
                        .le(Order::getCreateTime, deadline));//创建时间 ≤ 超时时间
        if (expiredOrders.isEmpty()) {
            return;
        }
        //真正取消了订单才驱逐缓存，避免每30秒无脑清空
        //通过Spring统一缓存管理器CacheManager，清空指定名称缓存下所有Key
        cacheManager.getCache("orderDetail").clear();
        cacheManager.getCache("paymentGroupDetail").clear();
        //2.逐笔取消：修改订单状态 + 批量回滚Redis库存
        for (Order order : expiredOrders) {
            try {
                List<OrderItem> items = orderItemMapper.selectList(
                        new LambdaQueryWrapper<OrderItem>()
                                .eq(OrderItem::getOrderId, order.getId()));
                //批量查询MySQL最新库存（用于cap上限）
                Set<Long> goodsIdSet = items.stream().map(OrderItem::getGoodsId).collect(Collectors.toSet());
                Map<Long, Goods> goodsMap = goodsIdSet.isEmpty() ? Collections.emptyMap() :
                        goodsMapper.selectBatchIds(new ArrayList<>(goodsIdSet))
                                .stream().collect(Collectors.toMap(Goods::getId, g -> g));
                //批量回补Redis库存（一次网络IO，自动cap at MySQL总库存）
                //LinkedHashMap会保留元素插入顺序，遍历的时候和你put进去的顺序完全一致
                Map<Long, Integer> quantityMap = new LinkedHashMap<>();
                Map<Long, Integer> maxStockMap = new LinkedHashMap<>();
                for (OrderItem item : items) {
                    quantityMap.merge(item.getGoodsId(), item.getQuantity(), Integer::sum);
                    if (!maxStockMap.containsKey(item.getGoodsId())) {
                        Goods g = goodsMap.get(item.getGoodsId());
                        maxStockMap.put(item.getGoodsId(), g != null ? g.getStock() : Integer.MAX_VALUE);
                    }
                }
                if (!quantityMap.isEmpty()) {
                    redisStockService.incrStockLua(quantityMap, maxStockMap);
                }
                //修改订单状态为已取消
                order.setStatus(OrderStatus.ORDER_CANCELLED);
                orderMapper.updateById(order);
                //同步更新订单详情状态为已取消
                for (OrderItem item : items) {
                    item.setStatus(OrderStatus.CANCELLED);
                    orderItemMapper.updateById(item);
                }
            } catch (Exception e) {
                log.error("自动取消订单异常: orderNo={}", order.getOrderNo(), e);
            }
        }
    }
}
