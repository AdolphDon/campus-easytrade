package com.campus.controller;

import com.campus.dto.*;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.GoodsService;
import com.campus.service.RedisStockService;
import com.campus.vo.*;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "统一商品列表接口")
@RestController
@RequestMapping("/user/goods")
@RequiredArgsConstructor//Lombok注解:替代@Autowired
public class GoodsController {

    private final GoodsService goodsService;
    private final RedisStockService redisStockService;

    /**
     * 全部商品/分类筛选/模糊搜索/分页下滑
     */
    @GetMapping("/list")
    @ApiOperation("商品列表（分类筛选/模糊搜索/分页下滑）")
    @Cacheable(value = "goodsList",
               key = "#query.pageNum + '-' + #query.pageSize + '-' + " +
                       "(#query.categoryId != null ? #query.categoryId : 0) + '-' +" +
                       " (#query.keyword != null ? #query.keyword : '')",
               sync = true)
    public Result<PageResult<GoodsListVO>> getGoodsList(GoodsPageQuery query) {
        PageResult<GoodsListVO> result = goodsService.getGoodsList(query);
        return Result.success(result);
    }

    /**
     * 获取商品详情
     */
    @GetMapping("/detail/{goodsId}")
    @ApiOperation("获取商品详情（含Redis实时库存覆盖）")
    public Result<GoodsDetailVO> getGoodsDetail(@PathVariable Long goodsId) {
        GoodsDetailVO vo = goodsService.getGoodsDetail(goodsId);
        if (vo == null) {
            return Result.error("商品不存在");
        }
        //用Redis实时库存覆盖缓存中的库存，保证看到的库存是最新的
        Integer redisStock = redisStockService.getStock(goodsId);
        if (redisStock != null) {
            vo.setStock(redisStock);
        }
        return Result.success(vo);
    }

    /**
     * 获取商品编辑回显（不用Redis覆盖库存，返回原始DB库存）
     */
    @GetMapping("/edit-detail/{goodsId}")
    @ApiOperation("获取商品编辑回显（原始DB数据）")
    public Result<GoodsDetailVO> getGoodsForEdit(@PathVariable Long goodsId) {
        GoodsDetailVO vo = goodsService.getGoodsDetail(goodsId);
        if (vo == null) {
            return Result.error("商品不存在");
        }
        return Result.success(vo);
    }

    /**
     * 批量获取商品详情（确认订单回显用）
     */
    @PostMapping("/batch-detail")
    @ApiOperation("批量获取商品详情（确认订单回显用）")
    public Result<List<GoodsDetailVO>> batchGetGoodsDetail(@RequestBody List<Long> goodsIds) {
        List<GoodsDetailVO> list = goodsService.batchGetGoodsDetail(goodsIds);
        return Result.success(list);
    }

    /**
     * 发布商品
     */
    @PostMapping("/publish")
    @ApiOperation("发布商品（含敏感词检测）")
    public Result publishGoods(@Valid @RequestBody GoodsEditDTO dto) {
        goodsService.publishGoods(dto);
        return Result.success();
    }

    /**
     * 修改商品
     */
    @PutMapping("/update/{goodsId}")
    @ApiOperation("修改商品（自动进入风控审核）")
    public Result<GoodsEditDTO> updateGoods(@PathVariable Long goodsId,@Valid @RequestBody GoodsEditDTO dto) {
        goodsService.updateGoods(goodsId,dto);
        return Result.success();
    }

    /**
     * 下架商品
     */
    @PutMapping("/offShelf/{goodsId}")
    @ApiOperation("下架商品")
    public Result offShelfGoods(@PathVariable Long goodsId) {
        goodsService.offShelfGoods(goodsId);
        return Result.success();
    }

    /**
     * 上架商品
     */
    @PutMapping("/onShelf/{goodsId}")
    @ApiOperation("上架商品")
    public Result onShelfGoods(@PathVariable Long goodsId) {
        goodsService.onShelfGoods(goodsId);
        return Result.success();
    }

    /**
     * 商品删除：单个/批量 逻辑删除（把deleted改成1）
     */
    @DeleteMapping("/delete")
    @ApiOperation("批量逻辑删除商品")
    public Result deleteGoods(@RequestBody List<Long> goodsIds) {
        goodsService.deleteGoods(goodsIds);
        return Result.success();
    }

    @GetMapping("/seller/user-goods")
    @ApiOperation("用户个人中心-我的闲置列表（按tab筛选）")
    public PageResult<GoodsQueryVO> userGoods(UserComQueryDTO query) {
        Long userId = getCurrentUserId();
        PageResult<GoodsQueryVO> result = goodsService.getUserGoodsList(userId, query);
        //用Redis实时库存覆盖stock，并将DB物理库存赋值给realStock
        if (result != null && result.getRecords() != null && !result.getRecords().isEmpty()) {
            List<Long> goodsIds = result.getRecords().stream()
                    .map(GoodsQueryVO::getGoodsId).collect(Collectors.toList());
            Map<Long, Integer> stockMap = redisStockService.getRealTimeStock(goodsIds);
            for (GoodsQueryVO vo : result.getRecords()) {
                vo.setRealStock(vo.getStock());
                vo.setStock(stockMap.getOrDefault(vo.getGoodsId(), vo.getStock()));
            }
        }
        return result;
    }

    @GetMapping("/commom-goods/{userId}")
    @ApiOperation("通用个人中心-闲置商品展示")
    public PageResult<GoodsQueryVO> commonGoods(@PathVariable Long userId,CommonQueryDTO query) {
        return goodsService.getCommonGoodsList(userId,query);
    }

    /**
     * 收藏或取消收藏商品
     */
    @PostMapping("/collect/{goodsId}")
    @ApiOperation("收藏/取消收藏商品")
    public Result collect(@PathVariable Long goodsId) {
        goodsService.toggleCollect(goodsId, getCurrentUserId());
        return Result.success();
    }

    /**
     * 获取用户是否已收藏商品
     */
    @GetMapping("/collect/status/{goodsId}")
    @ApiOperation("查询用户是否已收藏商品")
    public Result<Boolean> getCollectStatus(@PathVariable Long goodsId) {
        Boolean isCollected = goodsService.getCollectStatus(goodsId, getCurrentUserId());
        return Result.success(isCollected);
    }

    /**
     * 商品申诉提交接口
     */
    @PostMapping("/submit/{goodsId}")
    @ApiOperation("提交商品申诉")
    public Result<String> submitAppeal(@PathVariable Long goodsId,
                                       @Valid @RequestBody GoodsAppealSubmitDTO submitDTO) {
        goodsService.submitGoodsAppeal(goodsId, submitDTO);
        return Result.success("申诉提交成功，请等待审核");
    }

    /**
     * 商品确认收到申诉结果接口-商品状态从待申诉审核转为人工拦截
     */
    @PutMapping("/block-confirm/{goodsId}")
    @ApiOperation("确认收到申诉结果（转为人工拦截）")
    public Result confirmBlock(@PathVariable Long goodsId) {
        goodsService.confirmGoodsBlock(goodsId);
        return Result.success();
    }

    /**
     * 根据商品ID查询违规详情
     */
    @GetMapping("/intercept-detail/{goodsId}")
    @ApiOperation("查询商品违规详情")
    public Result<GoodsInterceptVO> getInterceptDetail(@PathVariable Long goodsId) {
        GoodsInterceptVO vo = goodsService.getInterceptDetailByGoodsId(goodsId);
        return Result.success(vo);
    }

    /**
     * 根据商品ID查询申诉详情
     */
    @GetMapping("/appeal-detail/{goodsId}")
    @ApiOperation("查询商品申诉详情")
    public Result<GoodsAppealVO> getAppealDetail(@PathVariable Long goodsId) {
        GoodsAppealVO vo = goodsService.getAppealDetailByGoodsId(goodsId);
        return Result.success(vo);
    }

    /**
     * 订单通用数量查询（用户端主页数据概览）
     */
    @GetMapping("/order-stats")
    @ApiOperation("订单通用数量查询")
    public Result<UserGoodsStatsVO> getUserGoodsStats() {
        Long userId = getCurrentUserId();
        UserGoodsStatsVO vo = goodsService.getUserGoodsStats(userId);
        return Result.success(vo);
    }
}