package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 聊一聊会话实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("chat_session")
public class ChatSession {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long participantA;//参与者A(较小的用户id)
    private Long participantB;//参与者B(较大的用户id)
    private String lastMessage;//最后一条消息摘要
    private LocalDateTime lastTime;//最后一条消息时间
    private Integer unreadCountA;//A的未读数
    private Integer unreadCountB;//B的未读数
    private Integer deletedA;//A是否删除:0删除 1已删
    private Integer deletedB;//B是否删除:0删除 1已删
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
