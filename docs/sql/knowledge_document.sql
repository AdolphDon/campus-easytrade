-- ============================================================
-- 知识库文档记录表
-- 管理端上传到 RAG 知识库的文档元数据
-- 实际文件内容被向量化后存储在 ChromaDB（Python 端管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS `knowledge_document` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `file_name`   VARCHAR(255) NOT NULL                COMMENT '文件名称',
    `file_size`   BIGINT       DEFAULT 0               COMMENT '文件大小（字节）',
    `md5`         VARCHAR(64)  NOT NULL                COMMENT '文件内容MD5（去重用）',
    `content`     TEXT                                  COMMENT '文件文本内容（预览用，存前5000字）',
    `chunk_count` INT          DEFAULT 0               COMMENT '分块数量',
    `status`      TINYINT      DEFAULT 0               COMMENT '状态：0=正常 1=已删除',
    `operator`    VARCHAR(50)  DEFAULT ''              COMMENT '上传者',
    `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_md5` (`md5`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库文档记录表';
