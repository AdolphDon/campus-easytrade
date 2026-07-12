package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单明细表实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("order_item")
public class OrderItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    //关联订单ID
    private Long orderId;

    //商品ID
    private Long goodsId;

    //卖家ID(分账到此人)
    private Long sellerId;

    //商品名称
    private String goodsName;

    //商品图片
    private String goodsImage;

    //单价
    private BigDecimal price;

    //数量
    private Integer quantity;

    //小计
    private BigDecimal subtotal;

    //交易方式:1-卖家上门 2-买家自提 3-自行协商
    private Integer tradeType;

    //买家选中的收货地址ID（tradeType=1卖家上门时绑定的收货地址）
    private Long addressId;

    //平台佣金
    private BigDecimal commission;

    //卖家实收
    private BigDecimal sellerIncome;

    //分账状态:0-未分账 1-已分账 2-分账失败
    private Integer settleStatus;

    //订单状态（同步 order 表，便于单表查询）:0-待付款 1-已付款 2-已发货 3-已完成 4-已取消 5-退款中 6-已退款
    private Integer status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
