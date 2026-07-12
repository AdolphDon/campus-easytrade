package com.campus.dto;

import lombok.Data;

import java.util.List;

/**
 * 确认订单中商品买家自提地址
 */
@Data
public class GoodsAddressDTO {
    private List<Long> goodsIdList;//确认订单商品id列表
}
