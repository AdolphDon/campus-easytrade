package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * AI回答响应：智能客服返回的回答
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiChatVO {
    private String answer;//AI回答内容
    private List<GoodsListVO> goodsList;//关联商品列表（可选，前端渲染卡片）
}
