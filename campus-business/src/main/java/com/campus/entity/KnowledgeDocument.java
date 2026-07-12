package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 知识库文档记录实体类
 * 管理端上传到RAG知识库的文档元数据，实际向量存储在ChromaDB中
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("knowledge_document")
public class KnowledgeDocument {

    @TableId(type = IdType.AUTO)
    private Long id;//主键ID
    @TableField("content")
    private String content;//文件文本内容(用于预览，存前5000字)

    private String fileName;//文件名称
    private Long fileSize;//文件大小(字节)
    private String md5;//文件内容MD5值(去重用)
    private Integer chunkCount;//文本被分割成的块数
    private Integer status;//状态：0=正常 1=已删除
    private String operator;//上传者
    private LocalDateTime createTime;//创建时间
    private LocalDateTime updateTime;//更新时间
}
