package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.entity.ChatMessage;
import com.campus.entity.ChatSession;
import com.campus.entity.User;
import com.campus.exception.BusinessException;
import com.campus.mapper.ChatMessageMapper;
import com.campus.mapper.ChatSessionMapper;
import com.campus.mapper.UserMapper;
import com.campus.result.PageResult;
import com.campus.service.ChatService;
import com.campus.vo.ChatMessageVO;
import com.campus.vo.ChatSessionVO;
import com.campus.websocket.ChatWebSocketHandler;

import static com.campus.constant.ChatConstant.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static com.campus.constant.DeletedStatus.DELETED;
import static com.campus.constant.DeletedStatus.NOT_DELETED;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {

    private final ChatSessionMapper chatSessionMapper;
    private final ChatMessageMapper chatMessageMapper;
    private final UserMapper userMapper;
    private final ChatWebSocketHandler chatWebSocketHandler;

    /**
     * 获取会话列表
     * @param userId
     * @return
     */
    @Transactional(readOnly = true)
    public List<ChatSessionVO> getSessions(Long userId) {
        List<ChatSession> sessions = chatSessionMapper.selectList(
                new LambdaQueryWrapper<ChatSession>()
                        //当前用户是参与者A且没有删除对话 or 当前用户是参与者B且没有删除对话
                        .and(w -> w.eq(ChatSession::getParticipantA, userId)
                                     .eq(ChatSession::getDeletedA, NOT_DELETED)
                             .or(w2 -> w2.eq(ChatSession::getParticipantB, userId)
                                          .eq(ChatSession::getDeletedB, NOT_DELETED)))
                        .orderByDesc(ChatSession::getLastTime)//按该次对话的最后消息时间来降序排列
        );

        if (sessions.isEmpty()) {
            return Collections.emptyList();
        }

        // 批量查询用户信息
        Set<Long> otherUserIds = sessions.stream()
                .map(session -> session.getParticipantA().equals(userId)
                        ? session.getParticipantB() : session.getParticipantA())
                .collect(Collectors.toSet());
        Map<Long, User> userMap = userMapper.selectBatchIds(otherUserIds)
                .stream().collect(Collectors.toMap(User::getId, u -> u));

        // 批量查询每个会话的最后一条消息
        Set<Long> sessionIds = sessions.stream().map(ChatSession::getId).collect(Collectors.toSet());
        Map<Long, ChatMessage> lastMsgMap = chatMessageMapper.selectLatestBySessionIds(sessionIds)
                .stream().collect(Collectors.toMap(ChatMessage::getSessionId, m -> m));

        return sessions.stream().map(session -> {
            //获取当前对话中对方的用户id
            Long otherUserId = session.getParticipantA().equals(userId)
                    ? session.getParticipantB() : session.getParticipantA();
            //如果当前用户是参与者A：则看A的未读数-空为0，不空则获取未读消息数
            //如果当前用户是参与者B：则看B的未读数-空为0，不空则获取未读消息数
            int unreadCount = session.getParticipantA().equals(userId)
                    ? (session.getUnreadCountA() == null ? 0 : session.getUnreadCountA())
                    : (session.getUnreadCountB() == null ? 0 : session.getUnreadCountB());

            User otherUser = userMap.get(otherUserId);
            ChatMessage lastMsg = lastMsgMap.get(session.getId());
            String displayLastMessage = session.getLastMessage();
            if (lastMsg != null && MSG_TYPE_IMAGE.equals(lastMsg.getMsgType())) {
                displayLastMessage = "图片";
            }

            return ChatSessionVO.builder()
                    .sessionId(session.getId())
                    .otherUserId(otherUserId)
                    .otherNickname(otherUser != null ? otherUser.getNickname() : "已注销")
                    .otherAvatar(otherUser != null ? otherUser.getAvatar() : "")
                    .lastMessage(displayLastMessage)
                    .lastTime(session.getLastTime())
                    .unreadCount(unreadCount)
                    .build();
        }).collect(Collectors.toList());
    }

    /**
     * 获取消息列表（分页）
     * @param sessionId
     * @param userId
     * @param page
     * @param size
     * @return
     */
    public PageResult<ChatMessageVO> getMessages(Long sessionId, Long userId, Integer page, Integer size) {
        if (page == null || page < 1) page = 1;
        if (size == null || size < 1) size = 20;

        // 1. 校验会话存在 + 参与者权限 + 删除状态
        ChatSession session = chatSessionMapper.selectById(sessionId);
        if (session == null) {
            return emptyPageResult(page, size);
        }

        Long a = session.getParticipantA();
        Long b = session.getParticipantB();
        if (!userId.equals(a) && !userId.equals(b)) {
            throw new BusinessException("无权限查看该会话");
        }

        boolean isA = userId.equals(a);
        if (DELETED.equals(isA ? session.getDeletedA() : session.getDeletedB())) {
            return emptyPageResult(page, size);
        }

        // 2. MP 分页倒序查询（新→旧），page=1 取最新消息；反转后前端按时间正序展示
        Page<ChatMessage> pageObj = new Page<>(page, size);
        chatMessageMapper.selectPage(pageObj,
                new LambdaQueryWrapper<ChatMessage>()
                        .eq(ChatMessage::getSessionId, sessionId)
                        .orderByDesc(ChatMessage::getCreateTime)
        );
        List<ChatMessage> messages = pageObj.getRecords();
        Collections.reverse(messages);

        // 3. 只标记本次加载的消息为已读，非全会话未读
        int unread = isA
                ? (session.getUnreadCountA() == null ? 0 : session.getUnreadCountA())
                : (session.getUnreadCountB() == null ? 0 : session.getUnreadCountB());
        if (unread > 0 && !messages.isEmpty()) {
            markMessagesRead(sessionId, userId, isA, messages);
        }

        // 4. 转 VO（补全 createTime）
        List<ChatMessageVO> voList = messages.stream().map(msg -> ChatMessageVO.builder()
                .id(msg.getId())
                .sessionId(msg.getSessionId())
                .senderId(msg.getSenderId())
                .content(msg.getContent())
                .msgType(msg.getMsgType())
                .goodsId(msg.getGoodsId())
                .isMine(msg.getSenderId().equals(userId))
                .createTime(msg.getCreateTime())
                .build()
        ).collect(Collectors.toList());

        return PageResult.<ChatMessageVO>builder()
                .records(voList)
                .total(pageObj.getTotal())
                .size(pageObj.getSize())
                .current(pageObj.getCurrent())
                .pages(pageObj.getPages())
                .build();
    }

    /**
     * 标记已读：只标记当前加载的消息，精确更新未读数
     */
    private void markMessagesRead(Long sessionId, Long userId, boolean isA, List<ChatMessage> loadedMessages) {
        List<Long> msgIds = loadedMessages.stream()
                .map(ChatMessage::getId)
                .collect(Collectors.toList());

        ChatMessage update = new ChatMessage();
        update.setReadStatus(READ_STATUS_READ);
        int markedCount = chatMessageMapper.update(update,
                new LambdaQueryWrapper<ChatMessage>()
                        .eq(ChatMessage::getSessionId, sessionId)
                        .ne(ChatMessage::getSenderId, userId)
                        .eq(ChatMessage::getReadStatus, READ_STATUS_UNREAD)
                        .in(ChatMessage::getId, msgIds)
        );

        // 精确原子递减未读数（仅减本次实际标记的条数，避免并发覆盖）
        if (markedCount > 0) {
            if (isA) {
                chatSessionMapper.atomicDecrementUnreadA(sessionId, markedCount);
            } else {
                chatSessionMapper.atomicDecrementUnreadB(sessionId, markedCount);
            }
        }
    }

    private PageResult<ChatMessageVO> emptyPageResult(Integer page, Integer size) {
        return PageResult.<ChatMessageVO>builder()
                .records(Collections.emptyList())
                .total(0L)
                .size((long) size)
                .current((long) page)
                .pages(0L)
                .build();
    }

    /**
     * 创建或获取已有会话
     * @param userId
     * @param targetUserId
     * @return
     */
    @Transactional
    @CacheEvict(value = "chatSessions", key = "#userId")
    public Long createOrGetSession(Long userId, Long targetUserId) {
        //1.校验当前用户id与传入对方的id是否相等
        if (userId.equals(targetUserId)) {
            throw new BusinessException("不能和自己聊天");
        }

        Long a = Math.min(userId, targetUserId);
        Long b = Math.max(userId, targetUserId);
        //2.查询会话是否已经存在
        ChatSession session = chatSessionMapper.selectOne(
                new LambdaQueryWrapper<ChatSession>()
                        .eq(ChatSession::getParticipantA, a)
                        .eq(ChatSession::getParticipantB, b)
        );
        //3.当前会话不为空时-将会话中双方已删除改成未删除
        if (session != null) {
            //参与者A为当前用户-true 参与者A不为当前用户-true
            boolean isA = userId.equals(session.getParticipantA());
            if (isA && session.getDeletedA() == DELETED) {
                session.setDeletedA(NOT_DELETED);
                chatSessionMapper.updateById(session);
            } else if (!isA && session.getDeletedB() == DELETED) {
                session.setDeletedB(NOT_DELETED);
                chatSessionMapper.updateById(session);
            }
            return session.getId();//用于方便根据会话id跳转至聊天页面
        }

        ChatSession newSession = ChatSession.builder()
                .participantA(a)
                .participantB(b)
                .lastMessage("")
                .lastTime(LocalDateTime.now())
                .unreadCountA(0)
                .unreadCountB(0)
                .deletedA(NOT_DELETED)
                .deletedB(NOT_DELETED)
                .build();
        chatSessionMapper.insert(newSession);
        return newSession.getId();
    }

    /**
     * 发送消息
     * @param userId
     * @param sessionId
     * @param receiverId
     * @param content
     * @param msgType
     * @param goodsId
     * @return
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "chatSessions", key = "#userId"),
            @CacheEvict(value = "chatSessions", key = "#receiverId")
    })
    public ChatMessageVO sendMessage(Long userId, Long sessionId, Long receiverId,
                                      String content, String msgType, Long goodsId) {
        // 1. 存消息（显式设置创建时间，弥补无自动填充）
        ChatMessage message = ChatMessage.builder()
                .sessionId(sessionId)
                .senderId(userId)
                .content(content)
                .msgType(msgType != null ? msgType : MSG_TYPE_TEXT)
                .goodsId(goodsId)
                .readStatus(READ_STATUS_UNREAD)
                .build();
        message.setCreateTime(LocalDateTime.now());
        chatMessageMapper.insert(message);

        // 2. 原子更新会话：未读数 +1、最后消息/时间、重置双方删除标记
        //    避免原代码「读→改→写」的并发丢失更新
        String lastMessage = MSG_TYPE_IMAGE.equals(msgType) ? "图片" : content;
        chatSessionMapper.atomicSendMessage(sessionId, receiverId, lastMessage);

        ChatMessageVO senderVo = ChatMessageVO.builder()
                .id(message.getId())
                .sessionId(message.getSessionId())
                .senderId(message.getSenderId())
                .content(message.getContent())
                .msgType(message.getMsgType())
                .goodsId(message.getGoodsId())
                .isMine(true)
                .createTime(message.getCreateTime())
                .build();

        ChatMessageVO receiverVo = ChatMessageVO.builder()
                .id(message.getId())
                .sessionId(message.getSessionId())
                .senderId(message.getSenderId())
                .content(message.getContent())
                .msgType(message.getMsgType())
                .goodsId(message.getGoodsId())
                .isMine(false)
                .createTime(message.getCreateTime())
                .build();

        // 3. WebSocket 推送放到事务提交后，避免推送异常回滚消息入库
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            chatWebSocketHandler.sendToUser(receiverId, receiverVo);
                        } catch (Exception e) {
                            log.error("WebSocket推送失败 | receiverId: {} | error: {}", receiverId, e.getMessage(), e);
                        }
                    }
                }
        );

        return senderVo;
    }
}
