package com.campus.dto;

import lombok.Data;

/**
 * AI智能客服添加购物车 DTO
 */
@Data
public class AiCartAddDTO {
    private String goodsName;
    private Integer quantity;
}
