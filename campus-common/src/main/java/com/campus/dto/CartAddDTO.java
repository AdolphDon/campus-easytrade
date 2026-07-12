package com.campus.dto;

import lombok.Data;

/**
 * 购物车添加
 */
@Data
public class CartAddDTO {
    private Long goodsId;//商品id
    private Integer quantity;//添加数量
}
