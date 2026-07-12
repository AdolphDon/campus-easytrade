package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * 发布or编辑平台公告与平台动态
 */
@Data
public class AnnouncementEditDTO {

    @NotBlank(message = "发布者不能为空")
    private String publisher;//发布者

    @NotBlank(message = "公告内容不能为空")
    private String content;//公告内容

    @NotNull(message = "所属分类不能为空")
    private Integer type;//类型：1=公告，2=平台动态
}