package com.campus.config;

import com.campus.utils.AliOssUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
/**
 * 阿里云OSS客户端配置：从yml读取aliyun配置，创建AliOssUtil Bean 用于文件上传
 */
@Configuration
@Slf4j
public class AliossConfig {
    @Bean
    @ConditionalOnMissingBean//容器中不存在该类型Bean时，才创建当前@Bean
    @ConfigurationProperties(prefix = "spring.alioss")
    public AliOssUtil aliOssUtil() {
        log.info("开始创建阿里云文件上传工具类对象");
        return new AliOssUtil();//无参构造，Spring会自动调用Setter注入yml配置
    }
}
