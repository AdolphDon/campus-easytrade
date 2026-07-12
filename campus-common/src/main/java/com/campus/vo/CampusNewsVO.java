package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 校园资讯统一返回数据（适用用户端与管理端）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampusNewsVO {

    private Long id;
    private String title;
    private String content;
    private String coverImage;
    private String publisherName;
    private LocalDateTime createTime;
    private Long categoryId;
    //========== 管理端专用字段：用户端不返回 ==========
    private String categoryName;
    private String publisherUserName;
    private Integer status;
    private Integer deleted;
}
