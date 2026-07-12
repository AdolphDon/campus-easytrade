package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * 信誉积分变更-管理员调整
 */
@Data
public class CreditAdjustDTO {

    @NotNull(message = "调整分值不能为空")
    private Integer changeValue;//调整分值，可正可负

    @NotBlank(message = "调整原因不能为空")
    private String reason;//调整原因
}