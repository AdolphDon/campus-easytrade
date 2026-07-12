package com.campus.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
/**
 * 跨域规则配置：允许前端 localhost / 127.0.0.1 / 192.168 来源访问后端接口
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(Arrays.asList(
                "http://localhost:*",//允许localhost所有端口
                "http://127.0.0.1:*",//允许127.0.0.1所有端口
                "http://192.168.*.*",//允许所有192.168.x.x
                "http://120.27.216.138"//线上部署公网IP
        ));
        //允许请求方式
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        //放行所有请求头
        configuration.setAllowedHeaders(Arrays.asList("*"));
        //允许携带Cookie、Token凭证
        configuration.setAllowCredentials(true);
        //预检请求缓存时长1小时
        configuration.setMaxAge(3600L);
        //全局所有接口应用跨域规则
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
