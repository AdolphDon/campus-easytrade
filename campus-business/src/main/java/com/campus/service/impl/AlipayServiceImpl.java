package com.campus.service.impl;

import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayTradePrecreateRequest;
import com.alipay.api.response.AlipayTradePrecreateResponse;
import com.alipay.api.internal.util.AlipaySignature;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.config.AlipayConfig;
import com.campus.entity.Order;
import com.campus.entity.OrderItem;
import com.campus.exception.BusinessException;
import com.campus.mapper.OrderItemMapper;
import com.campus.mapper.OrderMapper;
import com.campus.service.AlipayService;
import com.campus.service.AsyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static com.campus.constant.OrderStatus.PENDING_PAY;
import static com.campus.constant.OrderStatus.PAID;
import static com.campus.constant.OrderStatus.ORDER_CANCELLED;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlipayServiceImpl implements AlipayService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final AlipayClient alipayClient;
    private final AlipayConfig alipayConfig;
    private final AsyncService asyncService;
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

    /**
     * 生成支付宝支付二维码(统一支付：按paymentNo汇总所有订单金额，一次性生成二维码)
     */
    public String createQrCode(String paymentNo) {
        //查询该支付单号关联的所有订单
        List<Order> orders = orderMapper.selectList(
                Wrappers.lambdaQuery(Order.class).eq(Order::getPaymentNo, paymentNo));
        if (orders.isEmpty()) {
            throw new BusinessException("支付单不存在");
        }

        //校验所有订单状态均为待付款
        for (Order order : orders) {
            if (!PENDING_PAY.equals(order.getStatus())) {
                throw new BusinessException("订单" + order.getOrderNo() + "状态异常，无法支付");
            }
        }

        //汇总所有订单总金额
        BigDecimal totalAmount = orders.stream()
                .map(Order::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);//从0开始累加金额
        //取第一个订单的商品名称作为支付主题
        String subject = orders.size() == 1
                ? "校易帮-订单" + orders.get(0).getOrderNo()
                : "校易帮-合并支付(" + orders.size() + "笔订单)";

        //调用支付宝预创建接口
        try {
            AlipayTradePrecreateRequest req = new AlipayTradePrecreateRequest();
            req.setNotifyUrl(alipayConfig.getNotifyUrl());

            com.alipay.api.domain.AlipayTradePrecreateModel model =
                    new com.alipay.api.domain.AlipayTradePrecreateModel();
            model.setOutTradeNo(paymentNo);//用paymengtNo作为支付宝交易号
            model.setTotalAmount(totalAmount.toString());
            model.setSubject(subject);
            model.setTimeoutExpress("30m");
            req.setBizModel(model);

            AlipayTradePrecreateResponse resp = alipayClient.execute(req);
            if (!resp.isSuccess()) {
                log.error("支付宝预创建失败: paymentNo={}, totalAmount={}, code={}, msg={}",
                        paymentNo, totalAmount, resp.getCode(), resp.getMsg());
                throw new BusinessException("支付创建失败，请稍后重试");
            }

            log.info("支付宝二维码生成成功: paymentNo={}, orderCount={}, totalAmount={}",
                    paymentNo, orders.size(), totalAmount);
            return resp.getQrCode();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("支付宝预创建异常: paymentNo={}", paymentNo, e);
            throw new BusinessException("支付创建失败，请稍后重试");
        }
    }

    /**
     * 支付宝异步通知回调(这个接口不是前端调用的，是支付宝服务器主动POST回调)
     * 同步更新订单/订单明细为已支付，异步MQ扣库存+清理购物车
     * @param params 支付宝回调参数
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public String handlePayNotify(Map<String, String> params) {
        try {
            //1.验签
            boolean signVerified = AlipaySignature.rsaCheckV1(
                    params, alipayConfig.getAlipayPublicKey(), "UTF-8", "RSA2");
            if (!signVerified) {
                log.error("支付宝回调验签失败");
                return "fail";
            }

            //2.只处理交易成功状态
            String tradeStatus = params.get("trade_status");
            if (!"TRADE_SUCCESS".equals(tradeStatus)) {
                return "success";
            }

            //3.获取支付单号
            String paymentNo = params.get("out_trade_no");
            String alipayTradeNo = params.get("trade_no");

            List<Order> orders = orderMapper.selectList(
                    Wrappers.lambdaQuery(Order.class).eq(Order::getPaymentNo, paymentNo));
            if (orders.isEmpty()) {
                log.warn("支付单不存在: paymentNo={}", paymentNo);
                return "success";
            }

            //筛选可更新的订单（待支付或已取消）
            List<Order> updatableOrders = new ArrayList<>();
            for (Order order : orders) {
                if (!PENDING_PAY.equals(order.getStatus()) && !ORDER_CANCELLED.equals(order.getStatus())) {
                    continue;
                }
                if (ORDER_CANCELLED.equals(order.getStatus())) {
                    log.warn("订单已取消但收到支付回调，强制恢复为已支付: orderNo={}, alipayTradeNo={}",
                            order.getOrderNo(), alipayTradeNo);
                }
                order.setStatus(PAID);
                order.setPayTime(LocalDateTime.now());
                order.setAlipayTradeNo(alipayTradeNo);
                updatableOrders.add(order);
            }

            //批量更新订单状态
            for (Order order : updatableOrders) {
                orderMapper.updateById(order);
            }

            if (!updatableOrders.isEmpty()) {
                //批量更新订单明细状态为已付款
                List<Long> updatableOrderIds = updatableOrders.stream().map(Order::getId).collect(Collectors.toList());
                orderItemMapper.update(null,
                        Wrappers.lambdaUpdate(OrderItem.class)
                                .set(OrderItem::getStatus, PAID)
                                .in(OrderItem::getOrderId, updatableOrderIds));
            }

            //4.异步MQ扣库存+清理购物车
            asyncService.sendPaySuccess(paymentNo, alipayTradeNo);

            //批量查询所有OrderItems（替代循环内N+1，用于缓存清除）
            List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
            List<OrderItem> allItems = orderItemMapper.selectList(
                    Wrappers.lambdaQuery(OrderItem.class)
                            .select(OrderItem::getId, OrderItem::getSellerId, OrderItem::getOrderId)
                            .in(OrderItem::getOrderId, orderIds));
            Map<Long, List<OrderItem>> itemMap = allItems.stream()
                    .collect(Collectors.groupingBy(OrderItem::getOrderId));

            //批量清除买家+卖家的统计数据缓存
            Cache statsCache = cacheManager.getCache("userGoodsStats");
            if (statsCache != null) {
                for (Order o : orders) {
                    statsCache.evict(o.getUserId());
                    List<OrderItem> items = itemMap.getOrDefault(o.getId(), Collections.emptyList());
                    for (OrderItem oi : items) {
                        if (oi.getSellerId() != null) {
                            statsCache.evict(oi.getSellerId());
                        }
                    }
                }
            }

            //清除订单相关缓存
            for (Order o : orders) {
                List<OrderItem> items = itemMap.getOrDefault(o.getId(), Collections.emptyList());
                for (OrderItem oi : items) {
                    evictOrderDetailCache(oi.getId(), o.getUserId());
                    if (oi.getSellerId() != null) {
                        evictOrderDetailCache(oi.getId(), oi.getSellerId());
                    }
                }
                evictOrderListCache(o.getUserId());
                evictPaymentGroupCaches(paymentNo, o.getUserId());
            }

            return "success";
        } catch (Exception e) {
            log.error("支付宝回调处理异常", e);
            return "fail";
        }
    }

    /**
     * 模拟支付成功（测试用，代替支付宝回调，只更新订单状态+发MQ）
     * submitOrder已做完校验和Redis预占，此处不再重复
     * @param paymentNo 支付单号
     */
    @Transactional(rollbackFor = Exception.class)
    public void mockPaySuccess(String paymentNo) {
        List<Order> orders = orderMapper.selectList(
                Wrappers.lambdaQuery(Order.class)
                        .eq(Order::getPaymentNo, paymentNo)
                        .eq(Order::getStatus, PENDING_PAY));
        if (orders.isEmpty()) {
            log.warn("模拟支付：没有待支付的订单: paymentNo={}", paymentNo);
            return;
        }

        String mockTradeNo = "MOCK" + System.currentTimeMillis();

        //批量更新订单状态
        for (Order order : orders) {
            order.setStatus(PAID);
            order.setPayTime(LocalDateTime.now());
            order.setAlipayTradeNo(mockTradeNo);
            orderMapper.updateById(order);
        }

        //批量更新订单明细状态为已付款
        List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
        orderItemMapper.update(null,
                Wrappers.lambdaUpdate(OrderItem.class)
                        .set(OrderItem::getStatus, PAID)
                        .in(OrderItem::getOrderId, orderIds));

        //批量查询所有OrderItems（替代循环内N+1）
        List<OrderItem> allItems = orderItemMapper.selectList(
                Wrappers.lambdaQuery(OrderItem.class)
                        .select(OrderItem::getId, OrderItem::getSellerId, OrderItem::getOrderId)
                        .in(OrderItem::getOrderId, orderIds));
        Map<Long, List<OrderItem>> itemMap = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        //批量清除买家+卖家的统计数据缓存
        Cache statsCache = cacheManager.getCache("userGoodsStats");
        if (statsCache != null) {
            for (Order o : orders) {
                statsCache.evict(o.getUserId());
                List<OrderItem> items = itemMap.getOrDefault(o.getId(), Collections.emptyList());
                for (OrderItem oi : items) {
                    if (oi.getSellerId() != null) {
                        statsCache.evict(oi.getSellerId());
                    }
                }
            }
        }

        //清除订单相关缓存
        for (Order o : orders) {
            List<OrderItem> items = itemMap.getOrDefault(o.getId(), Collections.emptyList());
            for (OrderItem oi : items) {
                evictOrderDetailCache(oi.getId(), o.getUserId());
                if (oi.getSellerId() != null) {
                    evictOrderDetailCache(oi.getId(), oi.getSellerId());
                }
            }
            evictOrderListCache(o.getUserId());
            evictPaymentGroupCaches(paymentNo, o.getUserId());
        }

        //异步MQ扣库存+清理购物车
        asyncService.sendPaySuccess(paymentNo, mockTradeNo);
    }
}
