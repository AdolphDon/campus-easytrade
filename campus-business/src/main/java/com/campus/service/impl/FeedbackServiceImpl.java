package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.campus.constant.DeletedStatus;
import com.campus.dto.FeedbackDTO;
import com.campus.entity.Feedback;
import com.campus.mapper.FeedbackMapper;
import com.campus.result.PageResult;
import com.campus.service.FeedbackService;
import com.campus.vo.FeedbackVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class FeedbackServiceImpl implements FeedbackService {

    private final FeedbackMapper feedbackMapper;

    @Override
    public void submitFeedback(Long userId, FeedbackDTO dto) {
        Feedback feedback = Feedback.builder()
                .userId(userId)
                .category(dto.getCategory())
                .content(dto.getContent())
                .images(dto.getImages())
                .contact(dto.getContact())
                .build();
        feedbackMapper.insert(feedback);
    }

    @Override
    @Transactional(readOnly = true)
    public PageResult<FeedbackVO> pageFeedback(Integer page, Integer size) {
        if (page == null || page < 1) page = 1;
        if (size == null || size < 1) size = 20;

        Page<Feedback> pg = new Page<>(page, size);
        feedbackMapper.selectPage(pg, new LambdaQueryWrapper<Feedback>()
                .eq(Feedback::getDeleted, DeletedStatus.NOT_DELETED)
                .orderByDesc(Feedback::getCreateTime));

        List<FeedbackVO> voList = pg.getRecords().stream()
                .map(f -> FeedbackVO.builder()
                        .id(f.getId())
                        .userId(f.getUserId())
                        .category(f.getCategory())
                        .content(f.getContent())
                        .images(f.getImages())
                        .contact(f.getContact())
                        .build())
                .collect(Collectors.toList());

        return PageResult.<FeedbackVO>builder()
                .records(voList)
                .total(pg.getTotal())
                .size((long) pg.getSize())
                .current((long) pg.getCurrent())
                .pages(pg.getPages())
                .build();
    }

    @Override
    public void processFeedback(Long id) {
        feedbackMapper.update(null, new LambdaUpdateWrapper<Feedback>()
                .eq(Feedback::getId, id)
                .set(Feedback::getDeleted, DeletedStatus.DELETED));
    }
}
