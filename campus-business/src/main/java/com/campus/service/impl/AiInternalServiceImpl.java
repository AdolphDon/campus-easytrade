package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.entity.*;
import com.campus.exception.BusinessException;
import com.campus.mapper.*;
import com.campus.result.PageResult;
import com.campus.service.AiInternalService;
import com.campus.vo.GoodsListVO;
import com.campus.vo.PlatformPostVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.campus.constant.DeletedStatus.*;
import static com.campus.constant.GoodsStatus.*;
import static com.campus.constant.SelectedStatus.UNSELECTED;
import static com.campus.constant.UserStatus.userDISABLE;

/**
 * AI智能客服内部接口实现
 * 直接查询数据库，不依赖其他 Service 层
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiInternalServiceImpl implements AiInternalService {

    private final GoodsMapper goodsMapper;
    private final GoodsImageMapper goodsImageMapper;
    private final AnnouncementMapper announcementMapper;
    private final CampusNewsMapper campusNewsMapper;
    private final CartMapper cartMapper;
    private final UserMapper userMapper;
    private final StringRedisTemplate redisTemplate;

    /**
     * 通用商品搜索
     * @param keyword
     * @return
     */
    public PageResult<GoodsListVO> searchGoods(String keyword) {
        Page<Goods> page = new Page<>(1, 50);

        LambdaQueryWrapper<Goods> wrapper = Wrappers.lambdaQuery(Goods.class)
                .eq(Goods::getDeleted, NOT_DELETED)
                .eq(Goods::getShelfStatus, goodsSHELF_ON)
                .eq(Goods::getSaleStatus, goodsSALE_PENDING)
                .eq(Goods::getAuditStatus, AUDIT_STATUS_PASS)
                .gt(Goods::getStock, 0)
                .orderByDesc(Goods::getCreateTime);

        if (StringUtils.hasText(keyword)) {
            wrapper.like(Goods::getName, keyword);
        }

        goodsMapper.selectPage(page, wrapper);

        List<Goods> records = page.getRecords();
        List<Long> goodsIds = records.stream().map(Goods::getId).collect(Collectors.toList());

        List<GoodsImage> imgList = new ArrayList<>();
        if (!goodsIds.isEmpty()) {
            imgList = goodsImageMapper.selectList(
                    Wrappers.lambdaQuery(GoodsImage.class)
                            .in(GoodsImage::getGoodsId, goodsIds)
                            .eq(GoodsImage::getSort, 0)
            );
        }
        Map<Long, String> imageMap = imgList.stream().collect(
                Collectors.toMap(GoodsImage::getGoodsId, GoodsImage::getUrl, (a, b) -> a));

        List<GoodsListVO> voList = new ArrayList<>();
        for (Goods goods : records) {
            voList.add(GoodsListVO.builder()
                    .goodsId(goods.getId())
                    .name(goods.getName())
                    .collectCount(goods.getCollectCount())
                    .price(goods.getPrice())
                    .firstImage(imageMap.getOrDefault(goods.getId(), ""))
                    .build());
        }

        return PageResult.<GoodsListVO>builder()
                .records(voList)
                .total(page.getTotal())
                .size(page.getSize())
                .current(page.getCurrent())
                .pages(page.getPages())
                .build();
    }

    /**
     * 查询平台公开信息
     * @param type 1-平台公告 2-平台动态 3-校园资讯
     * @return
     */
    public PageResult<PlatformPostVO> getPlatformPosts(Integer type) {
        if (type == 1 || type == 2) {
            Page<Announcement> page = new Page<>(1, 10);
            announcementMapper.selectPage(page,
                    Wrappers.lambdaQuery(Announcement.class)
                            .eq(Announcement::getType, type)
                            .eq(Announcement::getDeleted, NOT_DELETED)
                            .orderByDesc(Announcement::getPublishTime));

            List<PlatformPostVO> voList = page.getRecords().stream().map(a ->
                    PlatformPostVO.builder()
                            .id(a.getId())
                            .title("")
                            .content(a.getContent())
                            .publisher(a.getPublisher())
                            .publishTime(a.getPublishTime())
                            .type(type)
                            .build()
            ).collect(Collectors.toList());

            return PageResult.<PlatformPostVO>builder()
                    .records(voList)
                    .total(page.getTotal())
                    .size(page.getSize())
                    .current(page.getCurrent())
                    .pages(page.getPages())
                    .build();
        }

        if (type == 3) {
            Page<CampusNews> page = new Page<>(1, 10);
            campusNewsMapper.selectPage(page,
                    Wrappers.lambdaQuery(CampusNews.class)
                            .eq(CampusNews::getStatus, 1)
                            .eq(CampusNews::getDeleted, NOT_DELETED)
                            .orderByDesc(CampusNews::getCreateTime));

            List<PlatformPostVO> voList = page.getRecords().stream().map(n ->
                    PlatformPostVO.builder()
                            .id(n.getId())
                            .title(n.getTitle())
                            .content(n.getContent())
                            .coverImage(n.getCoverImage())
                            .publisher(n.getPublisherName())
                            .publishTime(n.getCreateTime())
                            .type(type)
                            .build()
            ).collect(Collectors.toList());

            return PageResult.<PlatformPostVO>builder()
                    .records(voList)
                    .total(page.getTotal())
                    .size(page.getSize())
                    .current(page.getCurrent())
                    .pages(page.getPages())
                    .build();
        }

        return PageResult.<PlatformPostVO>builder()
                .records(new ArrayList<>())
                .total(0L)
                .size(10L)
                .current(1L)
                .pages(0L)
                .build();
    }

    /**
     * AI添加商品到购物车
     * 校验逻辑与 CartServiceImpl.addCart 一致
     */
    @Transactional(rollbackFor = Exception.class)
    public void addGoodsToCart(String goodsName, Integer quantity, Long userId) {
        //1.校验用户账号状态
        User user = userMapper.selectById(userId);
        if (user == null || DELETED.equals(user.getDeleted()) || userDISABLE.equals(user.getStatus())) {
            throw new BusinessException("账号异常，无法操作");
        }

        //2.按名称模糊查询商品（取第一个匹配的）
        LambdaQueryWrapper<Goods> wrapper = Wrappers.lambdaQuery(Goods.class)
                .eq(Goods::getDeleted, NOT_DELETED)
                .eq(Goods::getShelfStatus, goodsSHELF_ON)
                .eq(Goods::getAuditStatus, AUDIT_STATUS_PASS)
                .like(Goods::getName, goodsName)
                .orderByDesc(Goods::getCreateTime)
                .last("LIMIT 1");
        Goods goods = goodsMapper.selectOne(wrapper);
        if (goods == null) {
            throw new BusinessException("未找到商品：" + goodsName);
        }

        //3.校验不能添加自己的商品
        if (goods.getUserId().equals(userId)) {
            throw new BusinessException("无法添加自己的商品到购物车");
        }

        //4.数量默认为 1
        if (quantity == null || quantity < 1) {
            quantity = 1;
        }

        //5.购物车合并逻辑
        LambdaQueryWrapper<Cart> cartWrapper = Wrappers.lambdaQuery(Cart.class)
                .eq(Cart::getUserId, userId)
                .eq(Cart::getGoodsId, goods.getId());
        Cart existCart = cartMapper.selectOne(cartWrapper);

        if (existCart != null) {
            int newQty = existCart.getQuantity() + quantity;
            existCart.setQuantity(Math.min(newQty, goods.getStock()));
            cartMapper.updateById(existCart);
        } else {
            int finalQty = Math.min(quantity, goods.getStock());
            Cart cart = Cart.builder()
                    .userId(userId)
                    .goodsId(goods.getId())
                    .quantity(finalQty)
                    .selected(UNSELECTED)
                    .build();
            cartMapper.insert(cart);
        }

        //6.失效购物车缓存
        redisTemplate.delete("cartList:" + userId);
    }
}
