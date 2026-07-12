package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 大学信息实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("university")
public class University {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;//大学名称
    private String province;//所在省份
    private String city;//所在城市（直辖市特殊处理）
    private String district;//所在区县
    private BigDecimal latitude;//中心纬度
    private BigDecimal longitude;//中心经度
    private Integer radius;//校园围栏半径（米）
    private Integer status;//状态 1-启用 0-禁用
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
