package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * 大订单详情-卖家分组：
 * 对应 OrderDetailVO 中的"对方信息"+"商品信息"，
 * 但此处一个卖家下可有多个商品
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentGroupSellerVO {

    // ===== 对方信息（同 OrderDetailVO，role=sell 时展示买家，role=buy 时展示卖家） =====
    private Long counterpartyId;
    private String counterpartyNickname;
    private String counterpartyAvatar;

    // ===== 该卖家下的商品列表 =====
    private List<PaymentGroupGoodsVO> items;
}
