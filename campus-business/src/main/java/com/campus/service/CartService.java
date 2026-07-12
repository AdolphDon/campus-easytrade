package com.campus.service;

import com.campus.dto.CartPageQueryDTO;
import com.campus.dto.GoodsAddressDTO;
import com.campus.result.PageResult;
import com.campus.vo.CartGroupVO;
import com.campus.vo.CheckoutValidateVO;
import com.campus.vo.GoodsAddressVO;

import java.util.List;

public interface CartService {

    /**
     * 查询当前用户的购物车列表（按卖家分组，分页）
     */
    PageResult<CartGroupVO> listCart(CartPageQueryDTO dto,Long userId);

    /**
     * 添加商品到购物车
     * @param goodsId 商品ID
     * @param quantity 数量
     */
    void addCart(Long goodsId, Integer quantity);

    /**
     * 批量删除购物车记录
     * @param ids 购物车记录id列表
     */
    void deleteCart(List<Long> ids);

    /**
     * 修改购物车商品数量
     * @param goodsId 商品id
     * @param quantity 更新后的数量
     */
    void updateCartQuantity(Long goodsId, Integer quantity);

    /**
     * 结算前校验：检查勾选商品的库存/上下架状态，自动修正异常数据
     * @param goodsIds 勾选的商品id列表
     * @return CheckoutValidateVO，包含异常提示信息(msg)和是否需要地址(needAddress)
     */
    CheckoutValidateVO checkoutValidate(List<Long> goodsIds);

    /**
     * 勾选/取消勾选购物车商品
     * @param goodsIds 要勾选的商品id列表
     * @return 异常提示信息，无异常返回null
     */
    String selectCart(List<Long> goodsIds);

    /**
     * 获取确认订单里交易方式为买家自提的商品的地址
     * @param dto
     * @return
     */
    List<GoodsAddressVO> getGoodsAddress(GoodsAddressDTO dto);

    /**
     * 获取确认订单地址（带 Hash 缓存，以用户为粒度，evict 时直接删除整个 hash）
     * @param dto
     * @return
     */
    List<GoodsAddressVO> getGoodsAddressCached(GoodsAddressDTO dto);
}
