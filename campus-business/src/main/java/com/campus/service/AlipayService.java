package com.campus.service;

import java.util.Map;

public interface AlipayService {


    /**
     * 生成支付宝支付二维码（统一支付：一次提交对应一个 paymentNo，汇总所有订单金额）
     * @param paymentNo 支付单号
     * @return 二维码字符串（前端用qrcode.js渲染）
     */
    String createQrCode(String paymentNo);

    /**
     * 处理支付宝异步通知回调
     * @param params 支付宝回调参数
     * @return "success"或"fail"
     */
    String handlePayNotify(Map<String, String> params);

    /**
     * 模拟支付成功（测试用，跳过支付宝回调直接标记已支付并触发扣库存）
     * @param paymentNo 支付单号
     */
    void mockPaySuccess(String paymentNo);
}
