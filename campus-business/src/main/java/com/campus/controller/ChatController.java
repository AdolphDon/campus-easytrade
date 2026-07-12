package com.campus.controller;

import com.campus.dto.SendMessageDTO;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.ChatService;
import com.campus.vo.ChatMessageVO;
import com.campus.vo.ChatSessionVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "聊天管理接口")
@RestController
@RequestMapping("/user/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @GetMapping("/sessions")
    @ApiOperation("获取会话列表")
    @Cacheable(value = "chatSessions", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()", sync = true)
    public Result<List<ChatSessionVO>> getSessions() {
        Long userId = getCurrentUserId();
        return Result.success(chatService.getSessions(userId));
    }

    @GetMapping("/messages/{sessionId}")
    @ApiOperation("获取消息列表（分页）")
    @CacheEvict(value = "chatSessions", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public Result<PageResult<ChatMessageVO>> getMessages(
            @PathVariable Long sessionId,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer size) {
        Long userId = getCurrentUserId();
        return Result.success(chatService.getMessages(sessionId, userId, page, size));
    }

    @PostMapping("/create/{targetUserId}")
    @ApiOperation("创建或获取已有会话")
    public Result<Map<String, Long>> createSession(@PathVariable Long targetUserId) {//携带对方用户ID
        Long userId = getCurrentUserId();
        Long sessionId = chatService.createOrGetSession(userId, targetUserId);
        return Result.success(Collections.singletonMap("sessionId", sessionId));
    }

    @PostMapping("/send")
    @ApiOperation("发送消息")
    public Result<ChatMessageVO> sendMessage(@Valid @RequestBody SendMessageDTO dto) {
        Long userId = getCurrentUserId();
        ChatMessageVO vo = chatService.sendMessage(
                userId, dto.getSessionId(), dto.getReceiverId(),
                dto.getContent(), dto.getMsgType(), dto.getGoodsId());
        return Result.success(vo);
    }
}
