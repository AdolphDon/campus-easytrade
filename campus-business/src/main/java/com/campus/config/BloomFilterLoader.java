package com.campus.config;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.entity.Goods;
import com.campus.entity.User;
import com.campus.mapper.GoodsMapper;
import com.campus.mapper.UserMapper;
import com.campus.service.BloomFilterService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 应用启动时加载已有ID到布隆过滤器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BloomFilterLoader implements ApplicationRunner {

    private final GoodsMapper goodsMapper;
    private final UserMapper userMapper;
    private final BloomFilterService bloomFilterService;

    public void run(ApplicationArguments args) {
        //1.加载所有未删除的商品ID
        List<Long> goodsIds = goodsMapper.selectList(
                        Wrappers.<Goods>lambdaQuery().select(Goods::getId)
                ).stream()
                .map(Goods::getId)
                .collect(Collectors.toList());
        bloomFilterService.initBatch("goods", goodsIds);

        //2.加载所有未删除的用户ID
        List<Long> userIds = userMapper.selectList(
                        Wrappers.<User>lambdaQuery().select(User::getId)
                ).stream()
                .map(User::getId)
                .collect(Collectors.toList());
        bloomFilterService.initBatch("user", userIds);
    }
}
