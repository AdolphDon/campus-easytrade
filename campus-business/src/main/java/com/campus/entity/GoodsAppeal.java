package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 商品申诉实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("goods_appeal")
public class GoodsAppeal {

    //申诉ID
    @TableId(type = IdType.AUTO)
    private Long id;

    //申诉人ID
    private Long appealUserId;

    //申诉商品ID
    private Long goodsId;

    //申诉内容
    private String appealContent;

    //审查管理员ID
    private Long auditAdminId;

    //申诉状态 0待审查 1已完成
    private Integer appealStatus;

    //审查时间
    private LocalDateTime auditTime;

    //审查结果原因（驳回时必填）
    private String auditReason;

    //申诉时间
    private LocalDateTime createTime;
}