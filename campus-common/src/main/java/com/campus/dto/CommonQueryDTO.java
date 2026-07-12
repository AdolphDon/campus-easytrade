package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 通用个人中心展示(闲置)
 */
@Data
public class CommonQueryDTO {

    private Long pageNum = 1L;
    @Max(100)
    private Long pageSize = 6L;
}
