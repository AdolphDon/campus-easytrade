package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 聊一聊信息实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("chat_message")
public class ChatMessage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long sessionId;//所属会话id
    private Long senderId;//发送者用户id
    private String content;//消息内容
    private String msgType;//消息类型：1文字 2图片 3商品卡片
    private Long goodsId;//关联商品id，仅当消息类型为商品卡片时实现
    private Integer readStatus;//消息读取状态：0未读 1已读
    private LocalDateTime createTime;
}
