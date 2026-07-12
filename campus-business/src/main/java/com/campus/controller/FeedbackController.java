package com.campus.controller;

import com.campus.dto.FeedbackDTO;
import com.campus.result.Result;
import com.campus.service.FeedbackService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "意见反馈接口")
@RestController
@RequestMapping("/user/feedback")
@RequiredArgsConstructor
public class FeedbackController {

    private final FeedbackService feedbackService;

    @PostMapping("/submit")
    @ApiOperation("提交意见反馈")
    public Result submit(@Valid @RequestBody FeedbackDTO dto) {
        Long userId = getCurrentUserId();
        feedbackService.submitFeedback(userId, dto);
        return Result.success();
    }
}
