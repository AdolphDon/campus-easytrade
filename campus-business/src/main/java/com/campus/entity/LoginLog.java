package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 登录日志实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("login_log")
public class LoginLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    //用户id
    private Long userId;

    //登录用户名
    private String username;

    //登录IP
    private String loginIp;

    //浏览器信息
    private String userAgent;

    //登录时间
    private LocalDateTime loginTime;

    //登录结果：0=失败，1=成功
    private Integer loginResult;

    //失败原因
    private String failReason;
}