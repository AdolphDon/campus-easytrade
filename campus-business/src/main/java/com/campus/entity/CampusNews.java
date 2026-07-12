package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 校园资讯实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("campus_news")
public class CampusNews {

    @TableId(type = IdType.AUTO)
    private Long id;
    //资讯标题
    private String title;
    //资讯内容
    private String content;
    //封面图片
    private String coverImage;
    //分类ID
    private Long categoryId;
    //发布者ID
    private Long publisherId;
    //发布者昵称
    private String publisherName;
    //状态 1-启用 0-禁用
    private Integer status;
    //是否删除 0-未删除 1-已删除
    private Integer deleted;
    //创建时间
    private LocalDateTime createTime;
}
