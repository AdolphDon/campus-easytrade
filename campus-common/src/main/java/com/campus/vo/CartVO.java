package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 购物车响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CartVO {

    private Long id;//购物车记录ID
    private Long goodsId;//商品ID
    private Integer quantity;//数量
    private Integer selected;//是否选中 0-未选中 1-已选中

    private String goodsName;//商品名称
    private String firstImage;//商品首图
    private BigDecimal price;//商品价格
    private Integer stock;//商品库存
    private Integer auditStatus;//审核状态
    private Integer shelfStatus;//上架状态
    private Integer tradeType;
    private Long addressId;
    private String addressDormitory;
}
