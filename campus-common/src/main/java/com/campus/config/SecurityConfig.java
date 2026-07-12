package com.campus.config;

import com.campus.filter.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfigurationSource;

import java.util.Arrays;
/**
 * Spring Security 安全配置：JWT无状态认证、接口权限白名单、CSRF 关闭、CORS 跨域
 */
@Configuration
@EnableWebSecurity//启用SpringSecurity的Web安全功能
//启用方法级别的权限控制:允许使用@PreAuthorize和@PostAuthorize注解
@EnableGlobalMethodSecurity(prePostEnabled = true)
@RequiredArgsConstructor//lombok:为类中所有final字段和@NonNull字段生成构造函数
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Value("${security.whitelist}")
    private String[] whitelistUrls;

    //将Ant风格路径字符串数组转换为RequestMatcher数组，供requestMatchers()使用
    private static RequestMatcher[] toAntMatchers(String... patterns) {
        return Arrays.stream(patterns)
                .map(AntPathRequestMatcher::new)
                .toArray(RequestMatcher[]::new);
    }

    /**
     * 密码编码器：使用 BCrypt 加密算法（自动加盐、不可逆、抗暴力破解）
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * 认证管理器
     */
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    /**
     * 安全过滤器链：配置白名单放行规则、无状态会话、JWT 过滤器插入
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, CorsConfigurationSource corsConfigurationSource) throws Exception {
        http
                //关闭CSRF（前后端分离+JWT必须关）：CSRF是针对浏览器Cookie会话登录的安全防护机制
                .csrf().disable()

                //配置CORS跨域：开启跨域校验，使用外部注入的CorsConfigurationSource统一管理跨域规则
                .cors()
                    .configurationSource(corsConfigurationSource)
                    //.and()作用：回到HttpSecurity主配置对象，继续链式调用其他配置
                    .and()

                //传统登录依赖session存储用户信息，JWT依靠请求头Token鉴权，完全不需要 session
                //不使用Session（JWT无状态）：STATELESS：不创建、不使用HttpSession
                .sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()

                //请求授权规则：
                .authorizeRequests()
                //浏览器跨域时，会先发OPTIONS预检请求校验跨域权限，不放行直接跨域失败，所有接口报错
                .requestMatchers(request -> HttpMethod.OPTIONS.name().equals(request.getMethod())).permitAll()
                //放行白名单URL（WebSocket握手、登录注册、接口文档、支付宝回调等），无需JWT认证
                //具体路径在 application.yml → security.whitelist 中配置
                .requestMatchers(toAntMatchers(whitelistUrls)).permitAll()
                //其他接口需要认证：除上面所有放行地址外，其余接口请求头必须携带合法JWT，否则返回401未授权
                .anyRequest().authenticated()
                .and()

                //前置注入JWT过滤器：将过滤器A插入到过滤器B前面执行
                //UsernamePasswordAuthenticationFilter是Security原生账号密码登录过滤器
                //执行流程：请求进来先执行jwtAuthenticationFilter，解析Header中的Token、
                //校验、封装用户认证信息到上下文、校验通过后后续接口直接获取登录用户，校验失败直接拦截返回 401
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
