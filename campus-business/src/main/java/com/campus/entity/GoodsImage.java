package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 商品图片信息实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("goods_image")
public class GoodsImage {

    //标记主键字段，并且指定主键生成策略为主键自增
    @TableId(type = IdType.AUTO)
    private Long id;

    //商品ID
    private Long goodsId;

    //图片地址
    private String url;

    //排序 0=列表展示图（数字越小越靠前）
    private Integer sort;
}
