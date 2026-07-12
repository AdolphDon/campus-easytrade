package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 宿舍楼响应（含商品数量）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DormitoryVO {

    private Long id;//宿舍楼ID
    private String name;//宿舍楼名称
    private BigDecimal latitude;//纬度
    private BigDecimal longitude;//经度
    private Long remainingUpdates;//剩余修改次数
}
