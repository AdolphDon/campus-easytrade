package com.campus.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.entity.ChatSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ChatSessionMapper extends BaseMapper<ChatSession> {

    /**
     * 原子发送消息更新：递增接收方未读数 + 更新最后消息/时间 + 重置双方删除标记
     */
    @Update("UPDATE chat_session SET " +
            "unread_count_a = IF(participant_a = #{receiverId}, COALESCE(unread_count_a, 0) + 1, unread_count_a), " +
            "unread_count_b = IF(participant_b = #{receiverId}, COALESCE(unread_count_b, 0) + 1, unread_count_b), " +
            "last_message = #{lastMessage}, last_time = NOW(), " +
            "deleted_a = 0, deleted_b = 0 " +
            "WHERE id = #{sessionId}")
    int atomicSendMessage(@Param("sessionId") Long sessionId,
                          @Param("receiverId") Long receiverId,
                          @Param("lastMessage") String lastMessage);

    @Update("UPDATE chat_session SET unread_count_a = GREATEST(0, COALESCE(unread_count_a, 0) - #{count}) " +
            "WHERE id = #{sessionId} AND COALESCE(unread_count_a, 0) >= #{count}")
    int atomicDecrementUnreadA(@Param("sessionId") Long sessionId, @Param("count") int count);

    @Update("UPDATE chat_session SET unread_count_b = GREATEST(0, COALESCE(unread_count_b, 0) - #{count}) " +
            "WHERE id = #{sessionId} AND COALESCE(unread_count_b, 0) >= #{count}")
    int atomicDecrementUnreadB(@Param("sessionId") Long sessionId, @Param("count") int count);
}
