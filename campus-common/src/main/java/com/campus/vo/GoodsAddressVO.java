package com.campus.vo;

import lombok.Data;

/**
 * 商品买家自提地址响应
 */
@Data
public class GoodsAddressVO {
    private Long goodsId;//商品ID
    private String goodsName;//商品名称
    private String dormitoryName;//宿舍楼名称
    private String detailAddress;//详细地址
    private String name;//联系人姓名
    private String phone;//联系电话
}
