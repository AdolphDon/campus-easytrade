package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 管理端：用户(普通用户、管理员)查询
 */
@Data
public class UsersPageQueryDTO {
    private Integer pageNum = 1;
    @Max(100)
    private Integer pageSize = 10;
    private String keyword;//用户名/邮箱/手机号搜索
    private Integer status;//账号状态：启用1 禁用0
    private Integer isDelete;//注销状态：未注销0 已注销1
}
