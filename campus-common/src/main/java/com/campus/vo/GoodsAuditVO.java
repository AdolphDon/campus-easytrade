package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * 待人工审核与待申诉审核统一返回数据（适用管理端）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoodsAuditVO {
    //基础数据-商品信息
    private Long goodsId;//商品id
    private String name;//商品名称
    private List<String> imageUrls;//图片资源
    private BigDecimal price;//价格
    private String description;//商品描述
    //申诉信息
    private String appealContent;//申诉内容
}
