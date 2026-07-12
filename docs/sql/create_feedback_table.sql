CREATE TABLE feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    category TINYINT NOT NULL DEFAULT 0 COMMENT '反馈类别：0-功能建议 1-Bug报告 2-投诉举报 3-其他',
    content VARCHAR(2000) NOT NULL COMMENT '反馈内容',
    images VARCHAR(2000) DEFAULT NULL COMMENT '图片附件（多个用逗号分隔）',
    contact VARCHAR(100) DEFAULT NULL COMMENT '联系方式（手机/邮箱）',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0-未删除 1-已删除',

    INDEX idx_user_id (user_id),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='意见反馈表';
