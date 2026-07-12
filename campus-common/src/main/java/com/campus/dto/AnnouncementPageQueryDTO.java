package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 通用查询平台公告与平台动态
 */
@Data
public class AnnouncementPageQueryDTO {
    private Integer pageNum = 1;
    @Max(100)
    private Integer pageSize = 10;
    private Integer type;//类型筛选：null=全部，1=公告，2=动态
    private Integer deleted;//删除状态：null=全部，0=未删除，1=已删除
}