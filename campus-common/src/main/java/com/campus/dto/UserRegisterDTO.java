package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Email;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

/**
 * 用户注册请求
 */
@Data
public class UserRegisterDTO {

    //validation依赖带来的功能：Java校验框架,专门用来做前端传参校验
    @NotBlank(message = "用户名不能为空")
    //用于限制字符串类型
    @Size(min = 3, max = 20, message = "用户名长度需在3-20个字符之间")
    //@Pattern：自己写正则，校验自定义格式（手机号、身份证、密码等）
    @Pattern(regexp = "^[a-zA-Z0-9_]+$", message = "用户名只能包含字母、数字和下划线")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 20, message = "密码长度需在6-20个字符之间")
    private String password;

    @NotBlank(message = "确认密码不能为空")
    private String confirmPassword;

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    private String phone;

    @NotBlank(message = "邮箱不能为空")
    //@Email：自带校验，专门校验邮箱
    @Email(message = "邮箱格式不正确")
    @Pattern(regexp = "^[1-9][0-9]{4,}@qq\\.com$", message = "仅支持QQ邮箱")
    private String email;

    @NotBlank(message = "验证码不能为空")
    @Size(min = 6, max = 6, message = "验证码为6位数字")
    private String emailCode;

    @NotBlank(message = "昵称不能为空")
    @Size(max = 20, message = "昵称长度不能超过20个字符")
    private String nickname;

    /**
     * 判断密码和确认密码是否一致：一样返回返回true，不一样返回false
     */
    public boolean isPasswordMatch() {
        return password != null && password.equals(confirmPassword);
    }
}
