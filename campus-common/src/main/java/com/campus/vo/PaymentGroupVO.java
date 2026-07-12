package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 大订单详情-响应：
 * 顶层为订单公共信息（同OrderDetailVO中的订单信息），
 * 内层为按卖家分组的商品明细列表（同OrderDetailVO中的商品信息+对方信息，但支持多个）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentGroupVO {

    // ===== 订单公共信息（同 OrderDetailVO） =====
    private Long orderId;
    private String orderNo;
    private String paymentNo;
    private String alipayTradeNo;//支付宝交易号
    private Integer status;
    private String statusText;//状态中文
    private BigDecimal totalAmount;//总金额（所有订单合计）
    private LocalDateTime createTime;//下单时间
    private LocalDateTime payTime;//支付时间

    // ===== 卖家分组列表 =====
    private List<PaymentGroupSellerVO> sellers;
}
