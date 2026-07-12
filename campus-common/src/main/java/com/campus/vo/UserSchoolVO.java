package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 获取当前用户绑定的学校信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSchoolVO {

    private Long id;//学校ID
    private String name;//学校名称
    private BigDecimal latitude;//纬度
    private BigDecimal longitude;//经度
    private Integer radius;//围栏半径（米）
}
