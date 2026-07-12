package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 宿舍楼信息实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("dormitory")
public class Dormitory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long universityId;//所属大学ID
    private String name;//宿舍楼名称
    private BigDecimal latitude;//纬度
    private BigDecimal longitude;//经度
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer deleted;//逻辑删除：0未删除1已经删除
}
