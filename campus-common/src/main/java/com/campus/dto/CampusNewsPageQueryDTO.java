package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 校园资讯(管理端、用户端)
 */
@Data
public class CampusNewsPageQueryDTO {
    private Integer pageNum = 1;
    @Max(100)
    private Integer pageSize = 10;
    private Long categoryId;//分类id
    private String keyword;//关键词【仅用于管理端】、
    private Integer status = 1;//账号状态：启用1 禁用0
    private Integer deleted = 0;//注销状态：未注销0 已注销1
}
