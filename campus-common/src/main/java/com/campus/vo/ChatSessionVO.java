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
public class ChatSessionVO {

    private Long sessionId;//本次会话id

    private Long otherUserId;//对方的用户ID

    private String otherNickname;//对方的昵称

    private String otherAvatar;//对方的头像

    private String lastMessage;//最后一条消息摘要内容

    private LocalDateTime lastTime;//最后一条消息的时间

    private Integer unreadCount;//当前用户在该会话的未读消息数
}
