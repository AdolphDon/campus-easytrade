package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 商品详情响应:点击详情查看商品具体信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoodsDetailVO {
    //卖家信息
    private Long userId;//卖家id(点击头像查看卖家信息)
    private String username;//卖家昵称
    private String avatar;//卖家头像
    //商品信息
    private Long goodsId;//商品id
    private String goodsName;//商品名称
    private LocalDateTime createTime;//发布时间
    private List<String> imageUrls;//图片资源
    private String description;//商品描述
    private Long categoryId;//分类ID
    private BigDecimal price;//价格
    private Integer stock;//商品库存
    private Integer auditStatus;//审核状态
    private Integer shelfStatus;//上下架状态 1-上架 0-下架

    private Integer transactionType;//交易方式 1-卖家上门 2-买家自提 3-自行协商
    private Long addressId;//地址簿ID(买家自提时)
    private String addressDormitory;//地址宿舍楼(买家自提时)
}
