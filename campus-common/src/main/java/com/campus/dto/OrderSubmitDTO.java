package com.campus.dto;

import lombok.Data;

/**
 * 提交订单参数
 */
@Data
public class OrderSubmitDTO {

    //支付方式:1-支付宝 2-微信
    private Integer paymentMethod;

    //买家选中的收货地址ID（用于tradeType=1卖家上门的商品）
    private Long addressId;
}
