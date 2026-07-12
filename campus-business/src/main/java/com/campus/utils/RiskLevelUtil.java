package com.campus.utils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.constant.GoodsStatus;
import com.campus.dto.GoodsEditDTO;
import com.campus.entity.Goods;
import com.campus.entity.GoodsImage;
import com.campus.mapper.GoodsImageMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 风险等级评估工具类：高风险覆盖低风险
 * 图片/大幅调价 = 高风险
 * 改名称/描述 = 中风险
 * 改分类/库存 = 低风险
 */
@Component
@RequiredArgsConstructor
public class RiskLevelUtil {

    private final GoodsImageMapper goodsImageMapper;

    public int calculateRiskLevel(Goods oldGoods, GoodsEditDTO dto) {

        //高风险：改图片、价格波动超过±20%
        boolean isHighRisk = false;
        //①改图片
        //获取修该前图片路径
        List<String> oldImageUrls = getOldImageUrls(oldGoods.getId());
        //获取修改后图片路径
        List<String> newImageUrls = new ArrayList<>();
        //dto.getImages().trim().isEmpty()判断内容是否为空，有空格字符也不行
        if (dto.getImages() != null && !dto.getImages().trim().isEmpty()) {
            newImageUrls = Arrays.asList(dto.getImages().split(","));
        }

        //只要新图片里，出现了【旧图片里没有的URL】→ 才判定高风险：从有序列表list变成无序、去重适合查找有咩有的set
        Set<String> oldImageSet = new HashSet<>(oldImageUrls);

        for (String newUrl : newImageUrls) {
            //新图片在旧列表里不存在 → 说明是新增/替换 → 高风险
            if (!oldImageSet.contains(newUrl)) {
                isHighRisk = true;
                break;
            }
        }

        //②大幅调价-价格波动超过±20%
        BigDecimal oldPrice = oldGoods.getPrice();
        BigDecimal newPrice = dto.getPrice();
        //如果新旧价格不相等，则计算相差，否则跳过
        if (oldPrice.compareTo(newPrice) != 0) {
            BigDecimal diff = newPrice.subtract(oldPrice).abs();//计算价格差的绝对值：|新价 - 旧价|
            //计算波动比例=差价/原价，保留4位小数，四舍五入，避免除不尽
            BigDecimal rate = diff.divide(oldPrice, 4, BigDecimal.ROUND_HALF_UP);
            //判断：波动比例 > 20% → 高风险
            if (rate.compareTo(new BigDecimal("0.20")) > 0) {
                isHighRisk = true;
            }
        }
        //判定【高风险】
        if (isHighRisk) {
            return GoodsStatus.RISK_HIGH;
        }

        //中风险：改名称、改描述
        boolean isMiddleRisk = false;
        //①改名称
        if (!oldGoods.getName().equals(dto.getName())) {
            isMiddleRisk = true;
        }
        //②改描述
        if (!oldGoods.getDescription().equals(dto.getDescription())) {
            isMiddleRisk = true;
        }
        //判定【中风险】
        if (isMiddleRisk) {
            return GoodsStatus.RISK_MIDDLE;
        }

        //低风险：改分类、库存、交易方式、地址-判定【低风险】
        return GoodsStatus.RISK_LOW;
    }

    /**
     * 获取商品的旧图片URL列表（按sort升序）
     */
    private List<String> getOldImageUrls(Long goodsId) {
        LambdaQueryWrapper<GoodsImage> wrapper = Wrappers.lambdaQuery(GoodsImage.class)
                .eq(GoodsImage::getGoodsId, goodsId)
                .orderByAsc(GoodsImage::getSort);
        List<GoodsImage> list = goodsImageMapper.selectList(wrapper);
        return list.stream()
                .map(GoodsImage::getUrl)
                .collect(Collectors.toList());
    }
}
