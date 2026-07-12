-- ============================================================
-- 订单明细新增 address_id 收货地址ID（v3.0 卖家上门地址快照）
-- tradeType=1（卖家上门）时，绑定买家提交订单时选中的收货地址
-- 防止买家后续修改默认地址导致卖家看到的配送地址错误
-- ============================================================
ALTER TABLE `order_item`
    ADD COLUMN `address_id` BIGINT DEFAULT NULL COMMENT '买家收货地址ID（tradeType=1卖家上门时使用）' AFTER `trade_type`;
