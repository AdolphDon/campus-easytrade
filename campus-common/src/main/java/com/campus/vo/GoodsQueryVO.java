package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 买家-卖家个人中心-闲置+当前用户个人中心我的闲置相应：
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoodsQueryVO {
    //商品信息
    private Long goodsId;//商品id(点击查看商品详情)
    private String name;//商品名称
    private String firstImage;//第一张展示图
    private BigDecimal price;//价格
    private Integer stock;//商品库存（可售库存，会被Redis覆盖）
    private Integer realStock;//真实库存（DB物理库存）
    private Integer saleStatus;//售卖状态

    //审核状态 1-审核通过 0-待系统审核  -1-待人工审核 -2-待申诉审核 -3-系统拦截 -4-人工拦截
    private Integer auditStatus;
    private Integer appealCount;//申诉次数
}
