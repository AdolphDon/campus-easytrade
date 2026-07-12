package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 知识库文档展示：管理端查看已上传的文档列表
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeDocumentVO {
    private Long id;//文档ID
    private String fileName;//文件名称
    private Long fileSize;//文件大小(字节)
    private String fileSizeDisplay;//文件大小(格式化)
    private Integer chunkCount;//分块数量
    private String md5;//MD5值
    private Integer status;//状态：0=正常，1=已删除
    private String operator;//上传者
    private LocalDateTime createTime;//创建时间
}
