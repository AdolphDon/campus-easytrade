package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 杂货铺商城商品响应:
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoodsListVO {

    //商品信息
    private Long goodsId;//商品id(点击查看商品详情)
    private String name;//商品名称
    private String firstImage;//第一张展示图
    private BigDecimal price;//价格
    private Integer collectCount;//收藏量
}
