package com.campus.config;

import com.campus.websocket.AccountStatusWebSocketHandler;
import com.campus.websocket.AuthHandshakeInterceptor;
import com.campus.websocket.ChatWebSocketHandler;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
/**
 * WebSocket 配置：注册 /ws/account-status 端点，绑定 Token 握手拦截器，配置跨域
 */
@Slf4j
@Configuration
@EnableWebSocket//启用WebSocket支持
public class WebSocketConfig implements WebSocketConfigurer {
    //账号状态推送处理器:推送用户登录下线、账号封禁、异地登录提醒等系统通知
    private final AccountStatusWebSocketHandler accountStatusWebSocketHandler;
    //WebSocket握手鉴权拦截器：拦截器会在握手阶段从请求参数、Header取出JWT，校验合法性，不合法直接拒绝握手，连接建立失败
    private final AuthHandshakeInterceptor authHandshakeInterceptor;
    //聊天消息处理器：二手平台私聊、消息实时收发、已读未读、消息广播
    private final ChatWebSocketHandler chatWebSocketHandler;

    /**
     * 构造函数注入依赖
     */
    public WebSocketConfig(AccountStatusWebSocketHandler accountStatusWebSocketHandler,
                           AuthHandshakeInterceptor authHandshakeInterceptor,
                           ChatWebSocketHandler chatWebSocketHandler) {
        this.accountStatusWebSocketHandler = accountStatusWebSocketHandler;
        this.authHandshakeInterceptor = authHandshakeInterceptor;
        this.chatWebSocketHandler = chatWebSocketHandler;
    }

    /**
     * 注册WebSocket端点和处理器
     * @param registry WebSocket处理器注册表
     */
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry
                //所有连接到此地址的WebSocket消息都由accountStatusWebSocketHandler处理（连接建立、断开、收到消息、异常）
                .addHandler(accountStatusWebSocketHandler, "/ws/account-status")
                //给该端点绑定鉴权拦截器，握手之前执行Token校验：
                //Token合法-放行握手，成功建立长连接/Token失效篡改缺失：握手返回401，前端无法连上ws
                .addInterceptors(authHandshakeInterceptor)
                //允许任意前端域名跨域访问 WebSocket
                .setAllowedOrigins("*");

        registry
                .addHandler(chatWebSocketHandler, "/ws/chat")
                .addInterceptors(authHandshakeInterceptor)
                .setAllowedOrigins("*");
    }
}
