package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单商品列表
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderListVO {

    //订单ID（用于跳转详情）
    private Long orderId;

    //对方信息（role=sell 时展示买家，role=buy 时展示卖家）
    private Long counterpartyId;
    private String counterpartyNickname;
    private String counterpartyAvatar;

    //商品信息
    private Long goodsId;
    private Long orderItemId;//订单详情ID（用于获取订单详情时区分同一订单下的不同商品）
    private String goodsName;
    private String goodsImage;//商品首图
    private BigDecimal price;//单价
    private Integer quantity;//数量
    private String tradeTypeText;//交易方式名称

    //订单状态
    private Integer status;
    private String statusText;

    //支付单号（待付款时去支付用）
    private String paymentNo;

    //结算信息（计算得出，不入库）
    private BigDecimal commission;//平台抽成
    private BigDecimal sellerIncome;//卖家实收
}
