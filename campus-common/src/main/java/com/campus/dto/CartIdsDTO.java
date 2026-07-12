package com.campus.dto;

import lombok.Data;

import java.util.List;

/**
 * 购物车id列表通用参数
 */
@Data
public class CartIdsDTO {
    private List<Long> ids;
}
