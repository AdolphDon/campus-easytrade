package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessageVO {

    private Long id;

    private Long sessionId;//所属会话id

    private Long senderId;//发送者用户id

    private String content;//消息内容

    private String msgType;//消息类型：1文字 2图片 3商品卡片

    private Long goodsId;//关联商品id，仅当消息类型为商品卡片时实现

    private Boolean isMine;//是否是自己发送的消息（用于前端区分左右气泡）

    private LocalDateTime createTime;
}
