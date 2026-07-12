package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 通用查询管理端待人工审核与待申诉审核
 */
@Data
public class GoodsAuditPageQueryDTO {
    private Integer pageNum = 1;
    @Max(100)//给最大返回数据设置上限
    private Integer pageSize = 10;
    private Integer auditStatus;//类型筛选：-1-待人工审核 -2-待申诉审核 -4-人工拦截
}
