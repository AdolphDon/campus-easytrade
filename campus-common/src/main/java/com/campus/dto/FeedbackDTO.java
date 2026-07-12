package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class FeedbackDTO {

    @NotNull(message = "反馈类别不能为空")
    private Integer category;

    @NotBlank(message = "反馈内容不能为空")
    private String content;

    private String images;

    private String contact;
}
