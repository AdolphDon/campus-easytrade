package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 我买到的订单-响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderBuyVO {

    private Long orderId;//订单ID
    private String orderNo;//订单号
    private String paymentNo;//支付单号
    private Integer status;//订单状态
    private String statusText;//状态中文
    private BigDecimal totalAmount;//总金额
    private Integer paymentMethod;//支付方式
    private LocalDateTime createTime;//创建时间
    private LocalDateTime payTime;//支付时间

    private Long sellerId;//卖家ID
    private String sellerNickname;//卖家昵称
    private String sellerAvatar;//卖家头像

    private List<OrderBuyItemVO> items;//商品列表
}
