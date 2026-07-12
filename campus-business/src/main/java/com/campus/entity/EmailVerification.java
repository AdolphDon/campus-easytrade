package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;


/**
 * 邮箱验证码实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("email_verification")
public class EmailVerification {

    //标记主键字段，并且指定主键生成策略为主键自增
    @TableId(type = IdType.AUTO)
    private Long id;

    //用户的邮箱：123456@qq.com
    private String email;

    //验证码：6位数字，如123456
    private String code;

    //验证类型：1=注册，2=找回密码，3=绑定邮箱 4=验证身份
    private Integer type;

    //过期时间：比如5分钟后失效
    private LocalDateTime expireTime;

    //是否已使用：0=未使用，1=已使用
    private Integer used;

    private LocalDateTime createTime;
}

