package com.campus.service;

import com.campus.dto.FeedbackDTO;
import com.campus.result.PageResult;
import com.campus.vo.FeedbackVO;

public interface FeedbackService {

    void submitFeedback(Long userId, FeedbackDTO dto);

    PageResult<FeedbackVO> pageFeedback(Integer page, Integer size);

    void processFeedback(Long id);
}
