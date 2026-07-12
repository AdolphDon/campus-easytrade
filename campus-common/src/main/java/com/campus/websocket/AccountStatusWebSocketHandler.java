package com.campus.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 组件—WebSocket消息处理器
 * 账号状态 WebSocket 处理器（支持多设备登录）
 * 功能：
 * 1. 管理用户的 WebSocket 连接（支持同一用户多设备在线）
 * 2. 接收后端推送指令，强制下线指定用户的所有设备
 */

//账号状态推送处理器:推送用户登录下线、账号封禁、异地登录提醒等系统通知
@Slf4j
@Component
public class AccountStatusWebSocketHandler extends TextWebSocketHandler {

    //用户ID -> 该用户所有设备的 SessionID 集合（支持多设备）
    private final ConcurrentHashMap<Long, Set<String>> userIdToSessionsMap = new ConcurrentHashMap<>();

    //所有活跃的 WebSocket 会话（SessionID -> Session对象）
    private final ConcurrentHashMap<String, WebSocketSession> allSessions = new ConcurrentHashMap<>();

    //JSON序列化工具
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 连接建立成功时触发
     * @param session 新建立的 WebSocket 会话
     */
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // 从握手拦截器中获取 userId（在 AuthHandshakeInterceptor 中设置的）
        Long userId = (Long) session.getAttributes().get("userId");

        if (userId == null) {
            log.warn("⚠️ Session {} 无 userId，关闭连接", session.getId());
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        String sessionId = session.getId();

        //1.存储到全局会话映射
        allSessions.put(sessionId, session);

        //2.维护 userId -> sessionIds 的映射关系（支持多设备同时在线）
        userIdToSessionsMap.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet())
                .add(sessionId);

        log.info("✅ 用户【{}】WebSocket 连接成功 | SessionId: {} | 在线设备数: {}",
                userId, sessionId, userIdToSessionsMap.get(userId).size());

        //3.发送连接成功消息给客户端（可选，用于确认连接正常）
        Map<String, Object> msgMap = new HashMap<>();
        msgMap.put("type", "CONNECTED");
        msgMap.put("data", "连接成功");
        msgMap.put("timestamp", System.currentTimeMillis());
        sendJsonMessage(session, msgMap);
    }

    /**
     * 连接关闭时触发
     * @param session 关闭的 WebSocket 会话
     * @param status 关闭状态
     */
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();
        Long userId = (Long) session.getAttributes().get("userId");

        log.info("📴 WebSocket 连接关闭 | SessionId: {} | 关闭码: {} | 原因: {}",
                sessionId, status.getCode(), status.getReason());

        //1.从全局映射中移除该 session
        allSessions.remove(sessionId);

        //2.从用户设备列表中移除该 session（只移除当前设备，不影响其他设备）
        if (userId != null) {
            Set<String> sessionIds = userIdToSessionsMap.get(userId);
            if (sessionIds != null) {
                sessionIds.remove(sessionId);//只移除当前设备的session

                int remainingDevices = sessionIds.size();

                if (remainingDevices > 0) {
                    log.info("   用户【{}】剩余在线设备数: {}", userId, remainingDevices);
                } else {
                    //如果该用户没有任何设备在线了，清理整个记录
                    userIdToSessionsMap.remove(userId);
                    log.info("   用户【{}】已完全离线", userId);
                }
            }
        }
    }

    /**
     * ⭐ 核心方法：强制下线指定用户的所有在线设备
     * 当管理员禁用/注销用户时，调用此方法向该用户的所有在线设备推送强制下线消息
     *
     * @param userId 要踢出的用户ID
     * @param reason 下线原因提示信息（如："您的账号已被禁用"）
     */
    public void forceLogoutUser(Long userId, String reason) {
        log.warn("==============================================================");
        log.warn("🚨 准备强制下线用户");
        log.warn("   用户ID: {}", userId);
        log.warn("   原因: {}", reason);
        log.warn("==============================================================");

        //获取该用户所有的在线 session ID
        Set<String> sessionIds = userIdToSessionsMap.get(userId);

        if (sessionIds == null || sessionIds.isEmpty()) {
            log.warn("⚠️ 用户【{}】当前没有在线的 WebSocket 连接！", userId);
            log.warn("   → 可能原因:");
            log.warn("     1. 用户未打开任何页面");
            log.warn("     2. WebSocket 连接未建立或已断开");
            log.warn("     3. Token 认证失败导致握手被拒绝");
            log.warn("");
            return;  // 没有在线设备，无需推送
        }

        log.info("📍 用户【{}】有 {} 个在线设备需要踢出", userId, sessionIds.size());

        int successCount = 0;
        int failCount = 0;

        //遍历该用户的所有在线设备，逐个发送消息并关闭连接
        for (String sessionId : sessionIds) {
            WebSocketSession session = allSessions.get(sessionId);

            // 检查 session 是否有效且处于打开状态
            if (session == null || !session.isOpen()) {
                log.warn("   ❌ SessionId={} 已失效或已关闭，跳过", sessionId);
                failCount++;
                continue;
            }

            try {
                //1️⃣ 发送强制下线消息给客户端
                Map<String, Object> msgMap = new HashMap<>();
                msgMap.put("type", "FORCE_LOGOUT");
                msgMap.put("reason", reason);
                msgMap.put("timestamp", System.currentTimeMillis());
                String jsonMessage = objectMapper.writeValueAsString(msgMap);

                sendJsonMessage(session, jsonMessage);
                successCount++;

                log.info("   ✅ 已向 SessionId={} 发送强制下线消息 | 内容: {}", sessionId, reason);

                //2️⃣ 延迟300ms后关闭连接（给前端时间处理消息并执行跳转）
                new Thread(() -> {
                    try {
                        Thread.sleep(300);  // 等待300ms

                        if (session.isOpen()) {
                            session.close(CloseStatus.NORMAL);
                            log.info("      📴 已关闭 SessionId={}", session.getId());
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();  // 恢复中断状态
                    } catch (IOException e) {
                        log.error("      ❌ 关闭连接失败: {}", e.getMessage());
                    }
                }).start();

            } catch (Exception e) {
                log.error("   ❌ 向 SessionId={} 发送消息失败: {}", sessionId, e.getMessage());
                failCount++;
            }
        }

        log.info("");
        log.info("✅ 强制下线完成 | 成功: {} 台设备 | 失败: {} 台设备", successCount, failCount);
        log.warn("==============================================================");
    }

    /**
     * 发送禁用通知：通知用户账号已被禁用，前端显示倒计时缓冲（不关闭WebSocket）
     *
     * @param userId      用户ID
     * @param reason      禁用原因
     * @param banDays     封禁天数（0=永久）
     * @param countdown   倒计时秒数，默认30
     */
    public void sendDisableNotice(Long userId, String reason, int banDays, int countdown) {
        Set<String> sessionIds = userIdToSessionsMap.get(userId);
        if (sessionIds == null || sessionIds.isEmpty()) {
            log.warn("用户【{}】当前没有在线的 WebSocket 连接，跳过通知推送", userId);
            return;
        }
        log.info("发送禁用通知给用户【{}】，设备数: {}", userId, sessionIds.size());
        for (String sessionId : sessionIds) {
            WebSocketSession session = allSessions.get(sessionId);
            if (session == null || !session.isOpen()) continue;
            try {
                Map<String, Object> msg = new HashMap<>();
                msg.put("type", "DISABLE_NOTICE");
                msg.put("reason", reason);
                msg.put("banDays", banDays);
                msg.put("countdown", countdown);
                msg.put("timestamp", System.currentTimeMillis());
                sendJsonMessage(session, msg);
                log.info("已向 SessionId={} 发送禁用通知", sessionId);
            } catch (Exception e) {
                log.error("向 SessionId={} 发送禁用通知失败: {}", sessionId, e.getMessage());
            }
        }
    }

    /**
     * 接收客户端发送的消息（可选实现）
     * 可以在这里处理心跳检测、客户端初始化等逻辑
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        log.debug("📩 收到客户端消息 | SessionId: {} | 内容: {}", session.getId(), payload);

        // 可选：处理心跳包
        // 可选：处理其他自定义协议
    }

    /**
     * 处理传输异常
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("❌ WebSocket 传输异常 | SessionId: {} | 错误: {}",
                session.getId(), exception.getMessage(), exception);

        // 异常发生时，尝试清理资源
        afterConnectionClosed(session, CloseStatus.SERVER_ERROR);
    }

    // ==================== 工具方法 ====================

    /**
     * 发送 JSON 消息（线程安全）
     *
     * @param session 目标 WebSocket 会话
     * @param messageObj 消息对象（可以是 String 或会被序列化为 JSON 的对象）
     */
    private void sendJsonMessage(WebSocketSession session, Object messageObj) {
        try {
            // 如果传入的是字符串，直接使用；否则序列化为 JSON
            String json;
            if (messageObj instanceof String) {
                json = (String) messageObj;
            } else {
                json = objectMapper.writeValueAsString(messageObj);
            }

            // 检查会话是否仍然打开
            if (session.isOpen()) {
                synchronized (session) {  // 加锁防止并发发送冲突
                    session.sendMessage(new TextMessage(json));
                }
            }
        } catch (Exception e) {
            log.error("❌ 发送消息失败 | SessionId: {} | 错误: {}",
                    session.getId(), e.getMessage());
        }
    }

    // ==================== 调试/监控方法（可选） ====================

    /**
     * 获取指定用户的在线设备数量
     * @param userId 用户ID
     * @return 在线设备数量
     */
    public int getOnlineDeviceCount(Long userId) {
        Set<String> sessionIds = userIdToSessionsMap.get(userId);
        return sessionIds == null ? 0 : sessionIds.size();
    }

    /**
     * 获取总在线用户数
     * @return 在线用户数量
     */
    public int getTotalOnlineUsers() {
        return userIdToSessionsMap.size();
    }

    /**
     * 获取总在线会话数（包括多设备）
     * @return 总会话数
     */
    public int getTotalSessions() {
        return allSessions.size();
    }
}