package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 信誉分变更记录实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("credit_log")
public class CreditLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    //用户ID
    private Long userId;

    //变更类型
    private String changeType;

    //变更分值（正数为加分，负数为扣分）
    private Integer changeValue;

    //变更前信誉分
    private Integer beforeScore;

    //变更后信誉分
    private Integer afterScore;

    //变更原因
    private String reason;

    //操作人ID
    private Long operatorId;

    private LocalDateTime updateTime;
}