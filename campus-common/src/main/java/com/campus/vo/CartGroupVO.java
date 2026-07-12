package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 购物车卖家分组
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CartGroupVO {

    private Long sellerId;//卖家ID
    private String sellerNickname;//卖家昵称
    private String sellerAvatar;//卖家头像
    private List<CartVO> items;//该卖家的购物车商品
}
