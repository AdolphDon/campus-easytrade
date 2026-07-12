package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 大订单详情-商品明细：
 * 对应 OrderDetailVO 中的商品信息字段（goodsId ~ tradeTypeText）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentGroupGoodsVO {

    private Long goodsId;
    private String goodsName;
    private String goodsImage;
    private BigDecimal price;//单价
    private Integer quantity;//数量
    private BigDecimal subtotal;//小计
    private String tradeTypeText;//交易方式名称
    private Integer status;//订单状态
    private String statusText;//订单状态中文描述
}
