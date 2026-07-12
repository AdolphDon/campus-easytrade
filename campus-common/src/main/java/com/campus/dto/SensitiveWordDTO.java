package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

/**
 * 敏感词管理 DTO
 */
@Data
public class SensitiveWordDTO {

    @NotBlank(message = "敏感词不能为空")
    private String word;
}
