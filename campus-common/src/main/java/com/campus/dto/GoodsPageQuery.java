package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;


/**
 * 商品分页
 */
@Data
public class GoodsPageQuery {
    private Integer pageNum = 1;
    @Max(100)
    private Integer pageSize = 12;
    private Long categoryId;//分类id
    private String keyword;//模糊查询关键词
}
