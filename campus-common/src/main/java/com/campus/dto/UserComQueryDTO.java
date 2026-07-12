package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.Max;

/**
 * 用户个人中心(我的闲置-我的任务)
 */
@Data
public class UserComQueryDTO {

        private String keyword;

        //1已上架 2已下架 3违规商品 4审核待处理 5申诉待处理
        private Integer tab;

        private Long pageNum = 1L;
        @Max(100)
        private Long pageSize = 6L;
    }

