package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 用户端违规商品违规详情
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoodsInterceptVO {

    private String interceptReason;//拦截原因
    private LocalDateTime interceptTime;//拦截时间
    private String interceptTarget;//拦截对象（系统001/工号XXX）
}
