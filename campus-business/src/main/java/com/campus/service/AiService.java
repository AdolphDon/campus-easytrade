package com.campus.service;

import com.campus.dto.AiChatDTO;
import com.campus.vo.AiChatVO;

public interface AiService {

    /**
     * 调用 AI 智能客服问答
     * @param dto 用户问题
     * @param sessionId 会话ID(用于区分不同用户的对话历史)
     * @param userId 当前用户ID（传给AI用于查询个人订单等）
     * @param authHeader Authorization 请求头（透传给 Python 用于工具调用）
     * @return AI回答
     */
    AiChatVO chat(AiChatDTO dto, String sessionId, Long userId, String authHeader);
}
