package com.campus.service;

import com.campus.result.PageResult;
import com.campus.vo.ChatMessageVO;
import com.campus.vo.ChatSessionVO;

import java.util.List;

public interface ChatService {

    List<ChatSessionVO> getSessions(Long userId);

    PageResult<ChatMessageVO> getMessages(Long sessionId, Long userId, Integer page, Integer size);

    Long createOrGetSession(Long userId, Long targetUserId);

    ChatMessageVO sendMessage(Long userId, Long sessionId, Long receiverId, String content, String msgType, Long goodsId);
}
