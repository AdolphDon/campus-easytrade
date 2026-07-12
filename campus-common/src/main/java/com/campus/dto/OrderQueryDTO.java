package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 订单分页查询（统一列表）
 */
@Data
public class OrderQueryDTO {
    private Integer pageNum = 1;
    @Max(100)
    private Integer pageSize = 10;
    private String keyword;//商品名称关键词
    private Integer tab;//0-待付款 1-待发货 2-待收货 3-已完成 4-已取消 5-退款中 6-已退款
    private String role;//sell-我卖出的 buy-我买到的
}
