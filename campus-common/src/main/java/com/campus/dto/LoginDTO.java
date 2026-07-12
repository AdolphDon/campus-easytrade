package com.campus.dto;

import lombok.Data;
import javax.validation.constraints.NotBlank;

/**
 * 登录请求
 */
@Data
public class LoginDTO {

    //validation依赖带来的功能：Java校验框架,专门用来做前端传参校验-这个字段不能为空、不能只填空格，否则后端直接报错：用户名不能为空
    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;
}
