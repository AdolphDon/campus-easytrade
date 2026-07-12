-- =====================================================
-- 性能优化：高频查询字段添加索引
-- 执行方法：mysql -u root -p campus-easytrade < add_performance_indexes.sql
-- =====================================================

-- goods 表：商品列表查询（shelf_status + sale_status + audit_status + deleted 组合过滤）
ALTER TABLE `goods` ADD INDEX `idx_goods_status` (`deleted`, `shelf_status`, `sale_status`, `audit_status`);
ALTER TABLE `goods` ADD INDEX `idx_goods_user_id` (`user_id`, `deleted`);
ALTER TABLE `goods` ADD INDEX `idx_goods_category_id` (`category_id`, `deleted`);
ALTER TABLE `goods` ADD INDEX `idx_goods_school_id` (`school_id`, `deleted`);

-- order 表：买家订单列表
ALTER TABLE `order` ADD INDEX `idx_order_user_id` (`user_id`, `deleted`);

-- order_item 表：卖家订单列表 + 订单详情查询
ALTER TABLE `order_item` ADD INDEX `idx_order_item_seller_id` (`seller_id`, `deleted`);
ALTER TABLE `order_item` ADD INDEX `idx_order_item_order_id` (`order_id`);

-- chat_session 表：会话列表查询
ALTER TABLE `chat_session` ADD INDEX `idx_chat_session_participant_a` (`participant_a`, `deleted_a`);
ALTER TABLE `chat_session` ADD INDEX `idx_chat_session_participant_b` (`participant_b`, `deleted_b`);

-- chat_message 表：消息列表查询
ALTER TABLE `chat_message` ADD INDEX `idx_chat_message_session_id` (`session_id`, `create_time`);

-- goods_collect 表：收藏状态查询
ALTER TABLE `goods_collect` ADD INDEX `idx_collect_user_goods` (`user_id`, `goods_id`);

-- cart 表：购物车列表查询
ALTER TABLE `cart` ADD INDEX `idx_cart_user_id` (`user_id`);
