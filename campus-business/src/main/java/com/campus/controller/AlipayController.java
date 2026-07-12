package com.campus.controller;

import com.campus.dto.PayOrderDTO;
import com.campus.result.Result;
import com.campus.service.AlipayService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.Map;

@Slf4j
@Api(tags = "支付宝支付接口")
@RestController
@RequestMapping("/pay")
@RequiredArgsConstructor
public class AlipayController {

    private final AlipayService payService;

    /**
     * 生成支付宝支付二维码（统一支付：传入paymentNo，汇总所有关联订单金额）
     */
    @PostMapping("/create")
    @ApiOperation("生成支付宝支付二维码")
    public Result<String> createQrCode(@Valid @RequestBody PayOrderDTO dto) {
        String qrCode = payService.createQrCode(dto.getPaymentNo());
        return Result.success(qrCode);
    }

    /**
     * 支付宝异步通知回调(这个接口不是前端调用的，是支付宝服务器主动POST回调)
     * 收到通知后根据paymentNo批量更新所有关联订单为已支付
     */
    @PostMapping("/notify")
    @ApiOperation("支付宝异步通知（支付宝服务器回调）")
    public String payNotify(@RequestParam Map<String, String> params) {
        return payService.handlePayNotify(params);
    }

    /**
     * 模拟支付成功（测试用，跳过支付宝回调，直接标记订单为已支付并触发扣库存+分账）
     */
    @PostMapping("/mock/{paymentNo}")
    @ApiOperation("模拟支付成功（测试用）")
    public Result<Void> mockPay(@PathVariable String paymentNo) {
        payService.mockPaySuccess(paymentNo);
        return Result.success();
    }
}
