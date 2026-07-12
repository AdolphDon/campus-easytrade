package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 购物车分页查询
 */
@Data
public class CartPageQueryDTO {
    private Integer pageNum = 1;
    @Max(100)
    private Integer pageSize = 10;
    private String keyword;//商品名称关键词
}
