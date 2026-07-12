package com.campus.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class OrderSubmitVO {

    private Long orderId;//订单id

    private String orderNo;//订单号

    private String paymentNo;//支付单号（同一次提交的所有订单共享，用于统一支付）
}
