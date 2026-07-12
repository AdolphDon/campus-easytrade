package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 商品下架记录表
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("goods_off_shelf")
public class GoodsOffShelf {

    //标记主键字段，并且指定主键生成策略为主键自增
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long goodsId;

    //操作人ID
    private Long operatorId;

    //1用户 2管理员 3已卖出
    private Integer offShelfType;

    private String reason;//原因备注

    private LocalDateTime offShelfTime;

    private LocalDateTime createTime;
}
