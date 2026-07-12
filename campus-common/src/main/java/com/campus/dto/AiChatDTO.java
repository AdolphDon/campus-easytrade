package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

/**
 * AI对话传入参数
 */
@Data
public class AiChatDTO {

    @NotBlank(message = "问题不能为空")
    private String input;//用户提问内容
}
