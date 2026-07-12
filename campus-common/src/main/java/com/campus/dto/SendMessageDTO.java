package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * 发送消息请求
 */
@Data
public class SendMessageDTO {

    @NotNull(message = "会话ID不能为空")
    private Long sessionId;

    @NotNull(message = "接收方用户ID不能为空")
    private Long receiverId;

    @NotBlank(message = "消息内容不能为空")
    private String content;

    private String msgType;//消息类型

    private Long goodsId;//发商品卡片时关联的商品id
}
