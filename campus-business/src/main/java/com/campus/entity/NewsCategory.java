package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 校园资讯分类实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("news_category")
public class NewsCategory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;//分类名称

    private Integer sort;//排序

    //状态：0=禁用，1=正常
    private Integer status;
    //逻辑删除：0未删除1已经删除
    private Integer deleted;
}