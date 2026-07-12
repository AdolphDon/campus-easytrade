package com.campus.mapper;

import com.campus.entity.LoginLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface LoginLogMapper {

    /**
     * 保存登录日志
     * @param loginLog
     */
    @Insert("INSERT INTO login_log(" +
            "user_id, username, login_ip, user_agent, login_time, login_result, fail_reason) " +
            "VALUES(" +
            "#{userId}, #{username}, #{loginIp}, #{userAgent}, #{loginTime}, #{loginResult}, #{failReason})")
    void save(LoginLog loginLog);
}
