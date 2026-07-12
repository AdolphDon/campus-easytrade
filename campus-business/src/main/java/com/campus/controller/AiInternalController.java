package com.campus.controller;

import com.campus.dto.AiCartAddDTO;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.AiInternalService;
import com.campus.utils.JwtUtil;
import com.campus.vo.GoodsListVO;
import com.campus.vo.PlatformPostVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

/**
 * AI智能客服专用接口
 * 供 Python RAG 服务通过 Tool Calling 调用，获取实时数据
 * 路径与前端接口隔离，不走 JWT 认证
 */
@Slf4j
@Api(tags = "AI智能客服内部接口")
@RestController
@RequestMapping("/ai-api")
@RequiredArgsConstructor
public class AiInternalController {

    private final AiInternalService aiInternalService;
    private final JwtUtil jwtUtil;

    /**
     * 通用商品搜索
     */
    @GetMapping("/goods/search")
    @ApiOperation("通用商品搜索（AI专用）")
    public Result<PageResult<GoodsListVO>> searchGoods(@RequestParam(required = false) String keyword) {
        return Result.success(aiInternalService.searchGoods(keyword));
    }

    /**
     * 查询平台公开信息
     */
    @GetMapping("/platform/posts")
    @ApiOperation("查询平台公开信息（AI专用）")
    public Result<PageResult<PlatformPostVO>> getPlatformPosts(@RequestParam(defaultValue = "1") Integer type) {
        if (type < 1 || type > 3) {
            return Result.error("type参数错误：1=公告 2=动态 3=资讯");
        }
        return Result.success(aiInternalService.getPlatformPosts(type));
    }

    /**
     * AI添加商品到购物车（按商品名称）
     */
    @PostMapping("/cart/add")
    @ApiOperation("AI添加商品到购物车")
    //authHeader：从请求头获取登录Token-进而获得用户id，因该接口处于白名单不走JWT过滤器，无法通过getCurrentUserId()方法获取
    public Result addToCart(@RequestBody AiCartAddDTO dto,
                            @RequestHeader("Authorization") String authHeader) {
        if (dto.getGoodsName() == null || dto.getGoodsName().trim().isEmpty()) {
            return Result.error("商品名称不能为空");
        }
        String token = authHeader.substring(7);
        Long userId = Long.valueOf(jwtUtil.getUserIdFromToken(token));
        aiInternalService.addGoodsToCart(dto.getGoodsName().trim(), dto.getQuantity(), userId);
        return Result.success();
    }
}
