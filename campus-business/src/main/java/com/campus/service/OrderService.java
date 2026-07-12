package com.campus.service;

import com.campus.dto.OrderQueryDTO;
import com.campus.result.PageResult;
import com.campus.vo.OrderDetailVO;
import com.campus.vo.OrderListVO;
import com.campus.vo.OrderStatusVO;
import com.campus.vo.OrderSubmitVO;
import com.campus.vo.GoodsAddressVO;
import com.campus.vo.PaymentGroupVO;
import java.util.List;

public interface OrderService {

    /**
     * 三步合一：校验状态 + Redis DECRBY 预占 + 创建订单 + 发送延迟消息
     * @param paymentMethod 支付方式:1-支付宝 2-微信
     * @param addressId 买家选中的收货地址ID（卖家上门时绑定到订单明细）
     */
    List<OrderSubmitVO> submitOrder(Long userId, Integer paymentMethod, Long addressId);

    /**
     * 查询订单状态（前端轮询用）
     */
    OrderStatusVO getOrderStatus(String orderNo);

    /**
     * 手动取消订单（用户点击取消时立即释放Redis库存，无需等30分钟超时）
     * @param paymentNo 支付单号，取消该单下所有待付款订单
     */
    void cancelOrder(String paymentNo, Long userId);

    /**
     * 统一订单列表（我买到的 / 我卖出的）
     * @param userId 当前用户ID
     */
    PageResult<OrderListVO> listOrders(Long userId, OrderQueryDTO dto);

    /**
     * 订单详情
     * @param orderId 订单ID
     * @param itemId 订单商品ID（区分同一订单下不同商品）
     * @param userId 当前用户ID（防越权）
     * @param role sell-我卖出的 / buy-我买到的
     */
    OrderDetailVO getOrderDetail(Long orderId, Long itemId, Long userId, String role);

    /**
     * 大订单详情：一个支付单下所有订单及其商品（仅买家视角）
     * @param paymentNo 支付单号
     * @param userId 当前用户ID（必须是买家）
     */
    PaymentGroupVO getPaymentGroupDetail(String paymentNo, Long userId);

    /**
     * 获取订单商品地址（关联订单底部展示）
     * role=sell 返回卖家上门商品的买家默认地址
     * role=buy  返回买家自提商品的卖家取货地址
     */
    List<GoodsAddressVO> getOrderAddresses(String paymentNo, Long userId, String role);

    /**
     * 卖家发货：校验当前用户是否为该订单明细的卖家，并将订单明细状态更新为已发货
     * @param itemId 订单明细ID
     * @param userId 当前用户ID
     */
    void shipOrder(Long itemId, Long userId);

    /**
     * 买家收货：校验当前用户是否为买家 → 更新订单明细为已完成 → 卖家分账 → 判断是否全单完成
     * @param itemId 订单明细ID
     * @param userId 当前用户ID
     */
    void receiveOrder(Long itemId, Long userId);
}
