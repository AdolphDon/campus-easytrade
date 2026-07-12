package com.campus.service;

import java.util.List;

/**
 * 异步通知服务：核心DB与非核心DB分离
 * 下单后非核心操作：RocketMQ延迟消息
 */
public interface AsyncService {

    /**
     * 异步处理下单后的非核心操作
     * @param orderNos 生成的订单号列表
     */
    void processPostOrder(List<String> orderNos);

    /**
     * 异步发送支付成功消息，触发订单状态更新 + MySQL扣库存 + 购物车清理
     * @param paymentNo 支付单号
     * @param alipayTradeNo 支付宝交易号
     */
    void sendPaySuccess(String paymentNo, String alipayTradeNo);
}
