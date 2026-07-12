package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 用户信息实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("user")//告诉MyBatis-Plus这个实体类对应数据库哪张表
public class User {

    //标记主键字段，并且指定主键生成策略为主键自增
    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;

    private String password;

    //昵称
    private String nickname;

    //头像
    private String avatar;

    //背景图
    private String background;
    private String location;//所属地
    private String intro;//个人简介
    private Integer gender;//性别 1=男 2=女 3=未知
    private LocalDate birthday;
    private String email;
    private String phone;
    //邮箱是否验证：0=未验证，1=已验证
    private Integer emailVerified;
    //角色：0=管理员，1=普通用户
    private Integer role;
    //状态：0=禁用，1=正常
    private Integer status;
    //信誉分
    private Integer creditScore;
    //账户余额
    private BigDecimal balance;
    //冻结金额
    private BigDecimal frozenBalance;
    //支付宝商户id：用于吊起统一支付宝二维码
    private String alipayUserId;
    //当前所在大学ID
    private Long schoolId;
    //最后登录时间
    private LocalDateTime lastLoginTime;
    //最后登录IP地址
    private String lastLoginIp;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    //逻辑删除：0未删除1已经删除
    private Integer deleted;
}