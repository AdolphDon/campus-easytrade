package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单主表实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("`order`")
public class Order {

    @TableId(type = IdType.AUTO)
    private Long id;

    //订单号（每个订单独一无二）
    private String orderNo;

    //支付单号（同一次提交的多个订单共享，用于统一支付）
    private String paymentNo;

    //买家ID
    private Long userId;

    //总金额
    private BigDecimal totalAmount;

    //状态:0-待付款 1-已付款 2-已完成 3-已取消
    private Integer status;

    //支付方式:1-支付宝 2-微信
    private Integer paymentMethod;

    //支付宝交易号(对账/退款用)
    private String alipayTradeNo;

    //支付时间
    private LocalDateTime payTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    //逻辑删除：0未删除1已经删除
    private Integer deleted;
}
