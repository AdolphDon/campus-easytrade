package com.campus.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 商品拦截记录表
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("goods_intercept")
public class GoodsIntercept {

    //主键ID
    @TableId(type = IdType.AUTO)
    private Long id;

    //关联商品ID
    private Long goodsId;

    //拦截类型 1=人工拦截 2=系统拦截
    private Integer interceptType;

    //违规/拦截原因
    private String interceptReason;

    //拦截时间
    private LocalDateTime interceptTime;

    //管理员操作为ID，系统拦截为-1
    private Long adminId;
}