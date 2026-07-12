-- ============================================================
-- 新增 payment_no 支付单号（v3.0 统一支付）
-- 同一次提交拆出的多个订单共享同一个 payment_no
-- 前端只调一次 /pay/create，传入 paymentNo，汇总所有关联订单金额生成一个二维码
-- ============================================================
ALTER TABLE `order`
    ADD COLUMN `payment_no` VARCHAR(64) NOT NULL COMMENT '支付单号（同一次提交共享，统一支付）' AFTER `order_no`;

-- 支付单号需要索引（AlipayServiceImpl.createQrCode 按 payment_no 查询）
ALTER TABLE `order`
    ADD KEY `idx_payment_no` (`payment_no`);
