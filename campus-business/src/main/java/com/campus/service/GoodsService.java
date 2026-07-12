package com.campus.service;

import com.campus.dto.*;
import com.campus.result.PageResult;
import com.campus.vo.*;

import javax.validation.Valid;
import java.util.List;

public interface GoodsService {

    /**
     * 根据分类id与模糊字段获取商品列表并分页
     * @param query
     * @return
     */
    PageResult<GoodsListVO> getGoodsList(GoodsPageQuery query);

    /**
     * 获取商品详情
     * @param goodsId
     * @return
     */
    GoodsDetailVO getGoodsDetail(Long goodsId);

    /**
     * 发布商品
     * @param dto
     */
    void publishGoods(GoodsEditDTO dto);

    /**
     * 修改商品
     * @param dto
     */
    void updateGoods(Long goodsId,@Valid GoodsEditDTO dto);

    /**
     * 下架商品
     * @param goodsId
     */
    void offShelfGoods(Long goodsId);

    /**
     * 上架商品
     * @param goodsId
     */
    void onShelfGoods(Long goodsId);

    /**
     * 商品删除：单个/批量 逻辑删除（把deleted改成1）
     * @param goodsIds
     */
    void deleteGoods(List<Long> goodsIds);

    /**
     * 收藏或取消收藏商品
     * @param goodsId
     * @return
     */
    void toggleCollect(Long goodsId, Long userId);

    /**
     * 获取用户是否已收藏商品
     * @param goodsId
     * @param userId
     * @return
     */
    Boolean getCollectStatus(Long goodsId, Long userId);

    /**
     * 用户个人中心-我的闲置（发布中/已下架/已禁用，前端传tab）
     * @param query
     * @return
     */
    PageResult<GoodsQueryVO> getUserGoodsList(Long userId,UserComQueryDTO query);

    /**
     * 通用个人中心-闲置
     * @param query
     * @return
     */
    PageResult<GoodsQueryVO> getCommonGoodsList(Long userId,CommonQueryDTO query);

    /**
     * 商品申诉提交接口
     * @param goodsId
     * @param submitDTO
     */
    void submitGoodsAppeal(Long goodsId, @Valid GoodsAppealSubmitDTO submitDTO);

    /**
     * 商品确认收到申诉结果接口-商品状态从待申诉审核转为人工拦截
     * @param goodsId
     */
    void confirmGoodsBlock(Long goodsId);

    /**
     * 根据商品ID查询违规详情
     * @param goodsId
     * @return
     */
    GoodsInterceptVO getInterceptDetailByGoodsId(Long goodsId);

    /**
     * 根据商品ID查询申诉详情
     * @param goodsId
     * @return
     */
    GoodsAppealVO getAppealDetailByGoodsId(Long goodsId);

    /**
     * 批量获取商品详情（确认订单回显用）
     * @param goodsIds
     * @return
     */
    List<GoodsDetailVO> batchGetGoodsDetail(List<Long> goodsIds);

    /**
     * 系统自动审核：对 audit_status = 0 的商品进行敏感词校验和状态更新
     */
    void autoAuditGoods();

    /**
     * 订单通用数量查询（用户端主页数据概览）
     * @param userId 当前用户ID
     * @return
     */
    UserGoodsStatsVO getUserGoodsStats(Long userId);
}
