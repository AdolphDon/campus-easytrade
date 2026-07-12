package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 信誉分变更记录响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreditLogVO {

    private Long id;

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

    //变更时间
    private LocalDateTime updateTime;
}
