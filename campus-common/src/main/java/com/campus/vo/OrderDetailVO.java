package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单详情（每个订单仅对应一个商品）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderDetailVO {

    // ===== 订单信息 =====
    private Long orderId;
    private String orderNo;
    private String paymentNo;
    private String alipayTradeNo;//支付宝交易号
    private Integer status;
    private String statusText;//状态中文
    private BigDecimal totalAmount;//订单总金额
    private LocalDateTime createTime;//下单时间
    private LocalDateTime payTime;//支付时间

    // ===== 对方信息（role=sell 时展示买家，role=buy 时展示卖家） =====
    private Long counterpartyId;
    private String counterpartyNickname;
    private String counterpartyAvatar;

    // ===== 商品信息 =====
    private Long goodsId;
    private Long orderItemId;
    private String goodsName;
    private String goodsImage;
    private BigDecimal price;//单价
    private Integer quantity;//数量
    private BigDecimal subtotal;//小计
    private Integer tradeType;//交易方式：1-卖家上门 2-买家自提 3-自行协商
    private String tradeTypeText;//交易方式名称

    //结算信息
    private BigDecimal commission;//平台抽成
    private BigDecimal sellerIncome;//卖家实收
}
