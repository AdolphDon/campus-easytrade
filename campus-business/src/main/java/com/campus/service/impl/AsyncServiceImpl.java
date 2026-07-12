package com.campus.service.impl;

import com.campus.service.AsyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 订单异步服务实现：将非核心DB操作与核心DB操作分离
 * 通过@Async异步执行，提升下单接口响应速度
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncServiceImpl implements AsyncService {

    @Autowired(required = false)
    private org.apache.rocketmq.spring.core.RocketMQTemplate rocketMQTemplate;

    /**
     * 异步处理下单后的非核心操作-在mq中消费消息并执行取消订单操作
     * 包含：发送RocketMQ延迟消息(30分钟未支付自动取消)
     * @param orderNos 生成的订单号列表
     */
    @Async
    public void processPostOrder(List<String> orderNos) {
        //1.为每笔订单发送RocketMQ延迟消息(30分钟未支付自动取消)
        for (String orderNo : orderNos) {
            sendDelayMessage(orderNo);
        }
    }

    /**
     * 发送RocketMQ延迟消息(level 4 = 30min)
     */
    private void sendDelayMessage(String orderNo) {
        if (rocketMQTemplate == null) {
            log.warn("RocketMQ未配置，跳过延迟消息: orderNo={}", orderNo);
            return;
        }
        try {//对于非核心操作这种由于网络波动造成的异常需要用try-catch检测
            rocketMQTemplate.syncSend(
                    "order-timeout-cancel-topic",//消息主题(消费者监听这个)
                    MessageBuilder.withPayload(orderNo).build(),//消息内容:订单号
                    3000, 16);//超时时间3秒、延迟等级：16 = 30分钟
        } catch (Exception e) {//这里只能打印日志进行人工兜底，不允许抛异常，如果抛异常则非核心业务搞崩核心业务
            log.warn("RocketMQ延迟消息发送失败，订单超时将不会被自动取消: orderNo={}, err={}", orderNo, e.getMessage());
        }
    }

    /**
     * 异步发送支付成功消息，PaySuccessConsumer消费后执行订单状态更新 + MySQL扣库存 + 购物车清理
     * 消息格式：JSON {"paymentNo":"xxx","alipayTradeNo":"xxx"}
     */
    @Async
    public void sendPaySuccess(String paymentNo, String alipayTradeNo) {
        if (rocketMQTemplate == null) {
            log.warn("RocketMQ未配置，跳过支付成功消息: paymentNo={}", paymentNo);
            return;
        }
        try {
            String msg = String.format("{\"paymentNo\":\"%s\",\"alipayTradeNo\":\"%s\"}", paymentNo, alipayTradeNo);
            rocketMQTemplate.convertAndSend("order-pay-success-topic", msg);
        } catch (Exception e) {
            log.error("支付成功消息发送失败，需人工兜底: paymentNo={}, err={}", paymentNo, e.getMessage());
        }
    }
}
