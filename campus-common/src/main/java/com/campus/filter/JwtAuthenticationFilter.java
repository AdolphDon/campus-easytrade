package com.campus.filter;

import cn.hutool.core.util.StrUtil;
import com.campus.utils.JwtUtil;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.DigestUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.TimeUnit;

/**
 * 组件-JWT认证过滤器
 * 作用：拦截所有请求，校验 Token 有效性，并将用户信息存入 SecurityContext
 */
@Slf4j
@Component
@RequiredArgsConstructor//lombok:为类中所有final字段和@NonNull字段生成构造函数
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redisTemplate;

    /**
     * 白名单路径（从 application.yml → security.whitelist 注入，与 SecurityConfig 共用同一份配置）
     */
    @Value("${security.whitelist}")
    private String[] whitelistUrls;

    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String requestURI = request.getRequestURI();

        //1.检查是否为白名单路径，是则直接放行
        if (isWhiteListed(requestURI)) {
            filterChain.doFilter(request, response);
            return;
        }
        //2.从请求头获取Token
        String token = extractToken(request);

        //3.如果没有Token，直接放行（后续由 Spring Security 拦截返回 401）
        if (StrUtil.isBlank(token)) {
            filterChain.doFilter(request, response);
            return;
        }

        //4.校验Token有效性
        if (!jwtUtil.validateToken(token)) {
            filterChain.doFilter(request, response);
            return;
        }

        //5.检查Redis中是否存在该token的会话（防登出后继续使用 + 空闲超时）
        String tokenHash = DigestUtils.md5DigestAsHex(token.getBytes(StandardCharsets.UTF_8));
        String sessionKey = "token_session:" + tokenHash;
        String redisUserId = redisTemplate.opsForValue().get(sessionKey);
        if (redisUserId == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":0,\"message\":\"登录已过期，请重新登录\"}");
            return;
        }
        //延长空闲超时（滑动过期）
        redisTemplate.expire(sessionKey, 1, TimeUnit.HOURS);

        //6.解析Token，获取用户信息
        try {
            Claims claims = jwtUtil.parseToken(token);
            String userId = claims.getSubject();
            String username = claims.get("username", String.class);
            String role = claims.get("role", String.class);

            //6.构建认证对象并存入 SecurityContext
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            userId,                    // principal
                            null,                      // credentials
                            Collections.singletonList(new SimpleGrantedAuthority(role))
                    );

            //可以设置额外详情
            authentication.setDetails(username);

            SecurityContextHolder.getContext().setAuthentication(authentication);

        } catch (Exception e) {
            log.error("Token解析失败：{}", e.getMessage());
            SecurityContextHolder.clearContext();
        }

        //7.继续执行过滤器链
        filterChain.doFilter(request, response);
    }

    /**
     * 从请求头提取 Token
     * 格式：Authorization: Bearer <token>
     */
    private String extractToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StrUtil.isNotBlank(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }

    /**
     * 判断请求路径是否在白名单中
     */
    private boolean isWhiteListed(String requestURI) {
        for (String pattern : whitelistUrls) {
            if (pattern.endsWith("/**")) {
                String prefix = pattern.substring(0, pattern.length() - 3);
                if (requestURI.startsWith(prefix)) {
                    return true;
                }
            } else if (requestURI.equals(pattern)) {
                return true;
            }
        }
        return false;
    }
}