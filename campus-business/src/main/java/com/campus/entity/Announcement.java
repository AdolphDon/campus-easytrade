package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 平台公告与平台动态实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("announcement")
public class Announcement {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String publisher;//发布者
    private String content;//公告内容
    private Integer type;//类型：1=公告，2=平台动态
    private LocalDateTime publishTime;//发布时间
    private Long publisherId;//发布者ID
    private LocalDateTime updateTime;
    private Integer deleted;//是否删除 0-未删除 1-已删除
}
