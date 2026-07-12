package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 商品分类信息实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("category")
public class Category {

    //标记主键字段，并且指定主键生成策略为主键自增
    @TableId(type = IdType.AUTO)
    private Long id;
    //分类名称
    private String name;
    //排序（数字越小越靠前）
    private Integer sort;
    //状态：0=禁用，1=正常
    private Integer status;
    //逻辑删除：0未删除1已经删除
    private Integer deleted;
}
