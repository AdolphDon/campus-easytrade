package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * 发布or编辑校园资讯
 */
@Data
public class CampusNewsEditDTO {

    @NotBlank(message = "资讯标题不能为空")
    private String title;//资讯标题

    @NotBlank(message = "资讯内容不能为空")
    private String content;//资讯内容

    @NotBlank(message = "封面图片不能为空")
    private String coverImage;//封面图片

    @NotNull(message = "所属分类不能为空")
    private Long categoryId;//分类ID

    @NotBlank(message = "发布者昵称不能为空")
    private String publisherName;//发布者昵称
}