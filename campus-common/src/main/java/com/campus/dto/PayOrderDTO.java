package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class PayOrderDTO {

    @NotBlank(message = "支付单号不能为空")
    private String paymentNo;
}
