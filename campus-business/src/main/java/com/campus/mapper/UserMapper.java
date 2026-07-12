package com.campus.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.dto.UserRegisterDTO;
import com.campus.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;

@Mapper
public interface UserMapper extends BaseMapper<User> {

    /**
     * 根据用户名、邮箱、手机号获取用户信息
     * @param username
     * @param email
     * @return
     */
    User checkDuplicate(@Param("username") String username, @Param("email") String email);

    /**
     * 根据用户名查用户信息
     * @param username
     * @return
     */
    @Select("SELECT * FROM user WHERE username = #{username}")
    User getByUsername(String username);

    /**
     * 卖家结算：增加卖家余额（平台收到钱后，人工分账给卖家）
     * @param userId
     * @param amount
     */
    @Update("UPDATE user SET balance = balance + #{amount} WHERE id = #{userId}")
    int addBalance(@Param("userId") Long userId, @Param("amount") BigDecimal amount);

    /**
     * 更新密码（仅更新password字段）
     */
    @Update("UPDATE user SET password = #{password} WHERE id = #{userId}")
    int updatePasswordById(@Param("userId") Long userId, @Param("password") String password);
}
