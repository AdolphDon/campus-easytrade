package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

/**
 * 商品申诉提交 DTO
 * 用于前端提交申诉内容
 */
@Data
public class GoodsAppealSubmitDTO {

    @NotBlank(message = "申诉内容不能为空")
    @Size(min = 10, max = 500, message = "申诉内容长度必须在 10~500 个字符之间")
    private String appealContent;//申诉内容
}
