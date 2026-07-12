package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 管理端：用户(普通用户、管理员)查询
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UsersManageVO {
    private Long id;//普通用户id或管理员id
    private String username;//用户名
    private String avatar;//头像
    private String nickname;//昵称
    private String phone;//电话号
    private String email;//邮箱
    private Integer creditScore;//信誉分
    private Integer status;//账号状态：启用1 禁用0
    private Integer isDelete;//注销状态：未注销0 已注销1
    private LocalDateTime updateTime;//最后操作时间
}
