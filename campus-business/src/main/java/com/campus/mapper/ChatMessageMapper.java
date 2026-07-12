package com.campus.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.entity.ChatMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Set;

@Mapper
public interface ChatMessageMapper extends BaseMapper<ChatMessage> {

    /**
     * 批量查询每个会话的最新一条消息
     */
    @Select("<script>" +
            "SELECT * FROM chat_message WHERE id IN (" +
            "  SELECT MAX(m.id) FROM chat_message m WHERE m.session_id IN " +
            "  <foreach collection='sessionIds' item='sessionId' open='(' separator=',' close=')'>#{sessionId}</foreach>" +
            "  GROUP BY m.session_id" +
            ")" +
            "</script>")
    List<ChatMessage> selectLatestBySessionIds(@Param("sessionIds") Set<Long> sessionIds);
}
