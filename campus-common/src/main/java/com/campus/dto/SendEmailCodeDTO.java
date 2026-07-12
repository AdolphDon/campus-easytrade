package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.*;

/**
 * 发送邮箱验证码请求
 */
@Data
public class SendEmailCodeDTO {

    //validation依赖带来的功能：Java校验框架,专门用来做前端传参校验
    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    @Pattern(regexp = "^[1-9][0-9]{4,}@qq\\.com$", message = "仅支持QQ邮箱")
    private String email;

    @NotNull(message = "验证类型不能为空")
    //用于限制数字类型
    @Min(value = 1, message = "验证类型无效")
    @Max(value = 4, message = "验证类型无效")
    private Integer type;  // 1=注册，2=找回密码，3=绑定邮箱，4=验证身份
}
