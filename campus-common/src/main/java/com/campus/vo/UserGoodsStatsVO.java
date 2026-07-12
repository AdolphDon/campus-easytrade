package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 用户端主页数据概览统计
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserGoodsStatsVO {

    private Long myIdleCount;         // 我的闲置数量
    private Long ongoingOrderCount;   // 订单进行中数量
    private Long completedOrderCount; // 订单已完成数量
}
