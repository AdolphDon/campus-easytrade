package com.campus.config;

import com.alipay.api.AlipayClient;
import com.alipay.api.DefaultAlipayClient;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
/**
 * 支付宝 SDK 配置：读取 yml 中 alipay 配置，创建 AlipayClient Bean 用于生成支付二维码与回调验签
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "alipay")
public class AlipayConfig {

    /** 沙箱应用ID */
    private String appId;

    /** 应用私钥 */
    private String appPrivateKey;

    /** 支付宝公钥 */
    private String alipayPublicKey;

    /** 网关（沙箱） */
    private String gateway = "https://openapi-sandbox.dl.alipaydev.com/gateway.do";

    /** 异步通知地址 */
    private String notifyUrl;

    /** 同步跳转地址 */
    private String returnUrl;

    /** 平台佣金比例 */
    private Double commissionRatio;

    /** 连接超时（毫秒） */
    private int connectTimeout;

    /** 读取超时（毫秒） */
    private int readTimeout;

    @Bean
    public AlipayClient alipayClient() {
        DefaultAlipayClient client = new DefaultAlipayClient(
                gateway, appId, appPrivateKey,
                "json", "UTF-8", alipayPublicKey, "RSA2");
        client.setConnectTimeout(connectTimeout);
        client.setReadTimeout(readTimeout);
        return client;
    }
}
