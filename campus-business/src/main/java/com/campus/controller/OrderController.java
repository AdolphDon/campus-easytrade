package com.campus.controller;

import com.campus.dto.OrderQueryDTO;
import com.campus.dto.OrderSubmitDTO;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.OrderService;
import com.campus.vo.OrderDetailVO;
import com.campus.vo.OrderListVO;
import com.campus.vo.OrderStatusVO;
import com.campus.vo.OrderSubmitVO;
import com.campus.vo.GoodsAddressVO;
import com.campus.vo.PaymentGroupVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "订单接口")
@RestController
@RequestMapping("/order")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    /**
     * 三步合一：校验状态 + Lua原子扣减 + 创建订单 + 发送延迟消息
     * 前端点击"去支付"时调用，成功后返回订单Id、订单号和paymentNo，再调/pay/create传入paymentNo生成统一二维码
     */
    @PostMapping("/submit")
    @ApiOperation("提交订单（校验 + Lua扣减 + 创建订单）")
    public Result<List<OrderSubmitVO>> submitOrder(@Valid @RequestBody OrderSubmitDTO dto) {
        List<OrderSubmitVO> voList = orderService.submitOrder(getCurrentUserId(), dto.getPaymentMethod(), dto.getAddressId());
        return Result.success(voList);
    }

    /**
     * 查询订单状态(前端轮询用):用户扫码支付后根据订单状态执行关闭二维码弹窗，跳转订单详情页or关闭二维码弹窗，提示"订单已取消"
     */
    @GetMapping("/status/{orderNo}")
    @ApiOperation("查询订单状态")
    public Result<OrderStatusVO> getOrderStatus(@PathVariable String orderNo) {
        OrderStatusVO vo = orderService.getOrderStatus(orderNo);
        return Result.success(vo);
    }

    /**
     * 手动取消订单：用户点击支付弹窗的"取消"时调用，立即释放Redis库存，无需等30分钟超时兜底
     */
    @PutMapping("/cancel")
    @ApiOperation("手动取消订单（释放Redis库存）")
    public Result<Void> cancelOrder(@RequestParam String paymentNo) {
        orderService.cancelOrder(paymentNo, getCurrentUserId());
        return Result.success();
    }

    /**
     * 统一订单商品列表（我买到的or我卖出的）
     * role=sell|buy, tab=0-6, keyword=商品名称
     */
    @GetMapping("/list")
    @ApiOperation("统一订单列表（我买到的/我卖出的）")
    public Result<PageResult<OrderListVO>> listOrders(OrderQueryDTO dto) {
        Long userId = getCurrentUserId();
        return Result.success(orderService.listOrders(userId, dto));
    }

    /**
     * 订单详情（role=sell|buy 用于前端区分买家/卖家视角）
     */
    @GetMapping("/detail/{orderId}")
    @ApiOperation("订单详情")
    @Cacheable(value = "orderDetail",
               key = "#itemId + ':' + T(com.campus.utils.SecurityUtil).getCurrentUserId() + ':' + #role",
               sync = true)
    public Result<OrderDetailVO> getOrderDetail(@PathVariable Long orderId,
                                                 @RequestParam Long itemId,
                                                 @RequestParam String role) {
        return Result.success(orderService.getOrderDetail(orderId, itemId, getCurrentUserId(), role));
    }

    /**
     * 大订单详情：一个支付单下所有订单及其商品（仅买家视角）
     */
    @GetMapping("/group-detail/{paymentNo}")
    @ApiOperation("大订单详情（支付单下所有订单）")
    @Cacheable(value = "paymentGroupDetail",
               key = "#paymentNo + ':' + T(com.campus.utils.SecurityUtil).getCurrentUserId()",
               sync = true)
    public Result<PaymentGroupVO> getPaymentGroupDetail(@PathVariable String paymentNo) {
        return Result.success(orderService.getPaymentGroupDetail(paymentNo, getCurrentUserId()));
    }

    /**
     * 卖家发货：校验当前用户是否为卖家，将订单明细状态更新为已发货
     */
    @PutMapping("/ship/{itemId}")
    @ApiOperation("卖家发货")
    public Result<Void> shipOrder(@PathVariable Long itemId) {
        orderService.shipOrder(itemId, getCurrentUserId());
        return Result.success();
    }

    /**
     * 买家收货：更新订单明细为已完成 → 卖家分账 → 全单完成则更新订单状态
     */
    @PutMapping("/receive/{itemId}")
    @ApiOperation("买家确认收货")
    public Result<Void> receiveOrder(@PathVariable Long itemId) {
        orderService.receiveOrder(itemId, getCurrentUserId());
        return Result.success();
    }

    /**
     * 获取订单商品地址（关联订单底部展示）
     * role=sell 返回卖家上门商品的买家默认地址
     * role=buy  返回买家自提商品的卖家取货地址
     */
    @GetMapping("/addresses/{paymentNo}")
    @ApiOperation("获取订单商品地址")
    @Cacheable(
            value = "orderAddress",
            key = "#paymentNo + ':' + T(com.campus.utils.SecurityUtil).getCurrentUserId() + ':' + #role",
            sync = true)
    public Result<List<GoodsAddressVO>> getOrderAddresses(@PathVariable String paymentNo,
                                                           @RequestParam String role) {
        return Result.success(orderService.getOrderAddresses(paymentNo, getCurrentUserId(), role));
    }
}
