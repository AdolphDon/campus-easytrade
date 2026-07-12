package com.campus.task;

import com.campus.service.GoodsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 系统定时任务：自动审核敏感词商品
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GoodsAuditTask {

    private final GoodsService goodsService;

    /**
     * 每30秒执行一次自动审核
     */
    @Scheduled(fixedRate = 30000)
    public void autoAuditGoods() {
        goodsService.autoAuditGoods();
    }
}
