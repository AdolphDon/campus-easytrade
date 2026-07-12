package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

/**
 * 管理端待人工与待申诉审核-驳回/拦截原因
 */
@Data
public class GoodsRejectDTO {

    @NotBlank(message = "驳回原因不能为空")
    private String interceptReason;
}
