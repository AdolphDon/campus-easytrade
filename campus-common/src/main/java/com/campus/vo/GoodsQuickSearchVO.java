package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * 管理端商品速查响应：只返回首图、价格、商品名、商品ID
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoodsQuickSearchVO {
    private Long goodsId;
    private String goodsName;
    private BigDecimal price;
    private String firstImage;
    private Integer auditStatus;
    private Integer shelfStatus;
}
