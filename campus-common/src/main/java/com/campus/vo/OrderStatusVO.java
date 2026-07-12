package com.campus.vo;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class OrderStatusVO {

    private Long orderId;

    private String orderNo;//订单号

    private Integer status;//状态:0-待付款 1-已付款 2-已发货 3-已完成 4-已取消

    private BigDecimal totalAmount;//总金额
}
