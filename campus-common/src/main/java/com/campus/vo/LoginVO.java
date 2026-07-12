package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 登录响应:直接拿到用户所有信息，登陆成功后直接渲染，无需二次请求
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginVO {

    private Long userId;
    private String nickname;//昵称
    private String avatar;//头像
    private Integer role;//0=管理员，1=普通用户
    private String token;//JWT Token
    private Integer creditScore;//信誉分
    private BigDecimal balance;//账户余额
}
