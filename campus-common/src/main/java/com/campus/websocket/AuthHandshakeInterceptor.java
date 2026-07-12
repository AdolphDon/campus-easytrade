package com.campus.websocket;

import com.campus.utils.JwtUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import javax.annotation.Resource;
import java.util.Map;

/**
 * 组件-WebSocket握手拦截器
 * 功能：验证Token -> 解析userId -> 存入WebSocket会话
 */

//WebSocket握手鉴权拦截器：拦截器会在握手阶段从请求参数、Header取出JWT，校验合法性，不合法直接拒绝握手，连接建立失败
@Slf4j
@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    //直接注入你的JWT工具类
    @Resource
    private JwtUtil jwtUtil;

    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {

        //1.从URL中获取token参数
        String query = request.getURI().getQuery();
        String token = null;

        if (query != null && query.contains("token=")) {
            // 精确提取 ?token=xxxx
            String[] params = query.split("&");
            for (String param : params) {
                if (param.startsWith("token=")) {
                    token = param.split("=")[1];
                    break;
                }
            }
        }

        //2.无Token直接拒绝握手
        if (token == null || token.trim().isEmpty()) {
            log.warn("❌ WebSocket 握手失败：未携带Token");
            return false;
        }

        //3.脱敏打印日志
        log.info("📝 WebSocket 握手请求，Token：{}", maskToken(token));

        try {
            // 4. 校验Token是否有效
            boolean isValid = jwtUtil.validateToken(token);
            if (!isValid) {
                log.warn("❌ WebSocket 握手失败：Token无效或已过期");
                return false;
            }

            //5.从Token解析出 userId（完全适配你的工具类）
            String userIdStr = jwtUtil.getUserIdFromToken(token);
            Long userId = Long.parseLong(userIdStr);

            //6.把关键信息存入attributes，给后面的WebSocketHandler使用
            attributes.put("userId", userId);
            attributes.put("token", token);

            log.info("✅ WebSocket 握手成功，用户ID：{}", userId);
            return true;

        } catch (Exception e) {
            log.error("❌ WebSocket Token 验证异常：{}", e.getMessage());
            return false;
        }
    }

    public void afterHandshake(ServerHttpRequest request,
                               ServerHttpResponse response,
                               WebSocketHandler wsHandler,
                               Exception exception) {
    }

    /**
     * Token脱敏显示（安全日志）
     */
    private String maskToken(String token) {
        if (token == null || token.length() <= 10) {
            return "****";
        }
        return token.substring(0, 6) + "..." + token.substring(token.length() - 4);
    }
}
