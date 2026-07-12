package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 发布or编辑商品商品
 */
@Data
public class GoodsEditDTO {

    @NotBlank(message = "商品名称不能为空")
    private String name;//商品名称

    @NotBlank(message = "商品图片不能为空")
    private String images;//商品图片

    @NotBlank(message = "商品描述不能为空")
    private String description;//商品描述

    @NotNull(message = "商品价格不能为空")
    private BigDecimal price;//商品价格

    private Integer stock;//商品库存

    @NotNull(message = "所属分类不能为空")
    private Long categoryId;//所属分类

    @NotNull(message = "交易方式不能为空")
    private Integer transactionType;//交易方式 1-卖家上门 2-买家自提 3-自行协商

    private Long addressId;//地址簿ID(买家自提时必传)
}