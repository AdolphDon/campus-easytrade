package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

/**
 * 禁用请求
 */
@Data
public class UserBanDTO {

    private Integer banDays;//0=永久禁用

    @NotBlank(message = "禁用原因不能为空")
    private String banReason;//禁用原因
}
