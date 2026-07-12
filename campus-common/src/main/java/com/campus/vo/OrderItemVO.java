package com.campus.vo;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class OrderItemVO {

    private Long id;

    private Long goodsId;

    private String goodsName;

    private String goodsImage;

    private BigDecimal price;

    private Integer quantity;

    private BigDecimal subtotal;

    private Integer tradeType;

    private Integer settleStatus;

    //卖家信息
    private Long sellerId;
    private String sellerNickname;
    private String sellerAvatar;

    //买家信息
    private Long buyerId;
    private String buyerNickname;
    private String buyerAvatar;
}
