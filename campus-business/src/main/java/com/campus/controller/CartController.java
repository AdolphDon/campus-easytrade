package com.campus.controller;

import com.campus.dto.*;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.CartService;
import com.campus.service.RedisStockService;
import com.campus.vo.CartGroupVO;
import com.campus.vo.CartVO;
import com.campus.vo.CheckoutValidateVO;
import com.campus.vo.GoodsAddressVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "购物车管理接口")
@RestController
@RequestMapping("/user/cart")
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;
    private final RedisStockService redisStockService;

    /**
     * 查询购物车列表(第一层校验)
     */
    @GetMapping("/list")
    @ApiOperation("查询购物车列表（按卖家分组）")
    public Result<PageResult<CartGroupVO>> listCart(CartPageQueryDTO dto) {
        Long userId = getCurrentUserId();
        PageResult<CartGroupVO> result = cartService.listCart(dto, userId);
        //用Redis实时库存覆盖stock，并自动修正数量
        if (result != null && result.getRecords() != null && !result.getRecords().isEmpty()) {
            List<Long> goodsIds = result.getRecords().stream()
                    .flatMap(group -> group.getItems().stream().map(CartVO::getGoodsId))
                    .collect(Collectors.toList());
            if (!goodsIds.isEmpty()) {
                Map<Long, Integer> stockMap = redisStockService.getRealTimeStock(goodsIds);
                for (CartGroupVO group : result.getRecords()) {
                    for (CartVO vo : group.getItems()) {
                        Integer redisStock = stockMap.get(vo.getGoodsId());
                        if (redisStock != null) {
                            vo.setStock(redisStock);
                            if (vo.getQuantity() > redisStock) {
                                vo.setQuantity(Math.max(redisStock, 0));
                            }
                        }
                    }
                }
            }
        }
        return Result.success(result);
    }

    /**
     * 添加商品到购物车
     */
    @PostMapping("/add")
    @ApiOperation("添加商品到购物车")
    public Result addCart(@RequestBody CartAddDTO dto) {
        //Redis库存预检
        Integer redisStock = redisStockService.getStock(dto.getGoodsId());
        if (redisStock != null && redisStock <= 0) {
            return Result.error("该商品已售空");
        }
        cartService.addCart(dto.getGoodsId(), dto.getQuantity());
        return Result.success();
    }

    /**
     * 删除购物车商品
     */
    @DeleteMapping("/delete")
    @ApiOperation("删除购物车商品")
    public Result deleteCart(@RequestBody CartIdsDTO dto) {
        cartService.deleteCart(dto.getIds());
        return Result.success();
    }

    /**
     * 修改购物车商品数量
     */
    @PutMapping("/quantity")
    @ApiOperation("修改购物车商品数量")
    public Result updateCartQuantity(@RequestBody CartAddDTO dto) {
        //Redis库存预检
        Integer redisStock = redisStockService.getStock(dto.getGoodsId());
        if (redisStock != null && dto.getQuantity() > redisStock) {
            return Result.error("商品库存不足（剩余" + redisStock + "件）");
        }
        cartService.updateCartQuantity(dto.getGoodsId(), dto.getQuantity());
        return Result.success();
    }

    /**
     * 勾选/取消勾选购物车商品
     */
    @PutMapping("/select")
    @ApiOperation("勾选/取消勾选购物车商品")
    public Result selectCart(@RequestBody CartIdsDTO dto) {
        String msg = cartService.selectCart(dto.getIds());
        if (msg != null) {
            return Result.error(msg);
        }
        return Result.success();
    }

    /**
     * 获取确认订单里交易方式为买家自提的商品的地址
     */
    @PostMapping("/addres/list")
    @ApiOperation("获取确认订单中买家自提商品的取货地址")
    public Result<List<GoodsAddressVO>> getGoodsAddress(@RequestBody GoodsAddressDTO dto) {
        return Result.success(cartService.getGoodsAddressCached(dto));
    }

    /**
     * 结算前校验(第二层校验)
     */
    @PostMapping("/checkout")
    @ApiOperation("结算前校验（商品状态/上下架/库存）")
    public Result<CheckoutValidateVO> checkoutValidate(@RequestBody CartIdsDTO dto) {
        CheckoutValidateVO vo = cartService.checkoutValidate(dto.getIds());
        if (vo.getMsg() != null) {
            return Result.error(vo.getMsg());
        }
        //第二层：Redis实时库存校验（预扣库存不足时拦截结算）
        Map<Long, Integer> stockMap = redisStockService.getRealTimeStock(dto.getIds());
        List<String> stockMsgs = null;
        //需要查购物车获取实际数量
        for (Long goodsId : dto.getIds()) {
            Integer redisStock = stockMap.get(goodsId);
            if (redisStock != null && redisStock <= 0) {
                if (stockMsgs == null) stockMsgs = new java.util.ArrayList<>();
                stockMsgs.add("商品（ID:" + goodsId + "）已售空");
            }
        }
        if (stockMsgs != null) {
            return Result.error(String.join("; ", stockMsgs));
        }
        return Result.success(vo);
    }
}
