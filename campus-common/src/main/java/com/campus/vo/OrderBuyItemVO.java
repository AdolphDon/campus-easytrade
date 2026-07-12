package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 我买到的订单-商品明细
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderBuyItemVO {

    private Long goodsId;//商品ID
    private String goodsName;//商品名称
    private String goodsImage;//商品图片
    private BigDecimal price;//单价
    private Integer quantity;//数量
    private BigDecimal subtotal;//小计
    private Integer tradeType;//交易方式:1-卖家上门 2-买家自提 3-自行协商
}
