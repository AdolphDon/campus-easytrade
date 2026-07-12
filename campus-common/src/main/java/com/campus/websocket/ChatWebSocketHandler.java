package com.campus.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

//聊天消息处理器：二手平台私聊、消息实时收发、已读未读、消息广播
@Slf4j
@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private final ConcurrentHashMap<Long, Set<String>> userIdToSessionsMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, WebSocketSession> allSessions = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Long userId = (Long) session.getAttributes().get("userId");
        if (userId == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        String sessionId = session.getId();
        allSessions.put(sessionId, session);
        userIdToSessionsMap.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);

        log.info("聊天WS连接成功 | 用户【{}】| SessionId: {} | 在线设备数: {}",
                userId, sessionId, userIdToSessionsMap.get(userId).size());

        Map<String, Object> msg = new HashMap<>();
        msg.put("type", "CONNECTED");
        msg.put("data", "聊天连接成功");
        msg.put("timestamp", System.currentTimeMillis());
        sendJsonMessage(session, msg);
    }

    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();
        Long userId = (Long) session.getAttributes().get("userId");

        allSessions.remove(sessionId);

        if (userId != null) {
            Set<String> sessionIds = userIdToSessionsMap.get(userId);
            if (sessionIds != null) {
                sessionIds.remove(sessionId);
                if (sessionIds.isEmpty()) {
                    userIdToSessionsMap.remove(userId);
                }
            }
        }
    }

    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        log.debug("聊天WS收到消息 | SessionId: {} | 内容: {}", session.getId(), payload);
    }

    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("聊天WS传输异常 | SessionId: {} | 错误: {}", session.getId(), exception.getMessage());
        afterConnectionClosed(session, CloseStatus.SERVER_ERROR);
    }

    public void sendToUser(Long userId, Object data) {
        //入参非空校验
        if (data == null) {
            log.warn("消息内容为空，终止推送，用户:{}", userId);
            return;
        }

        //判断用户是否在线
        Set<String> sessionIds = userIdToSessionsMap.get(userId);
        if (sessionIds == null || sessionIds.isEmpty()) {
            log.debug("用户【{}】不在线，跳过WS推送", userId);
            return;
        }

        //统一封装报文，只序列化一次
        Map<String, Object> wrapper = new HashMap<>(2);
        wrapper.put("type", "NEW_MSG");//前端识别为「新聊天消息」事件
        wrapper.put("data", data);//原始消息体

        String json;
        try {
            json = objectMapper.writeValueAsString(wrapper);//二次序列化封装后的报文
        } catch (Exception e) {
            log.error("消息报文序列化失败: {}", e.getMessage(), e);
            return;
        }

        //遍历推送
        for (String sid : sessionIds) {
            //allSessions：WS会话ID
            WebSocketSession session = allSessions.get(sid);
            if (session == null || !session.isOpen()) {
                continue;
            }
            try {
                synchronized (session) {
                    session.sendMessage(new TextMessage(json));
                }
            } catch (IOException e) {
                log.error("WS推送失败 | 用户: {} | SessionId: {} | 异常: {}", userId, sid, e.getMessage(), e);
            }
        }
    }

    private void sendJsonMessage(WebSocketSession session, Object msg) {
        try {
            String json = objectMapper.writeValueAsString(msg);
            if (session.isOpen()) {
                synchronized (session) {
                    session.sendMessage(new TextMessage(json));
                }
            }
        } catch (Exception e) {
            log.error("发送WS消息失败 | SessionId: {} | 错误: {}", session.getId(), e.getMessage());
        }
    }
}
