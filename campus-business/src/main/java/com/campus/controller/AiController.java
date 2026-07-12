package com.campus.controller;

import com.campus.dto.AiChatDTO;
import com.campus.result.Result;
import com.campus.service.AiService;
import com.campus.vo.AiChatVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

/**
 * 用户端-AI智能客服接口
 * 用户提问 → Java转发给Python FastAPI RAG服务 → 返回AI回答
 */
@Slf4j
@Api(tags = "智能客服接口")
@RestController
@RequestMapping("/user/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;

    /**
     * 智能客服问答
     */
    @PostMapping("/chat")
    @ApiOperation("智能客服问答")
    public Result<AiChatVO> chat(@Valid @RequestBody AiChatDTO dto,
                                  @RequestHeader("Authorization") String authHeader) {
        //使用当前用户ID作为 session_id，保持每个用户的对话历史独立
        Long userId = getCurrentUserId();
        String sessionId = "user_" + userId;

        AiChatVO vo = aiService.chat(dto, sessionId, userId, authHeader);
        return Result.success(vo);
    }
}
