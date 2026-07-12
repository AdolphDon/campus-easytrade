package com.campus.service;

import com.campus.dto.*;
import com.campus.vo.CreditLogVO;
import com.campus.vo.LoginVO;
import com.campus.vo.UserBalanceVO;
import com.campus.vo.UserInfoVO;
import com.campus.result.PageResult;

import javax.validation.Valid;

public interface UserService {
    /**
     * 发送邮箱验证码
     * @param dto
     */
    void sendEmailCode(@Valid SendEmailCodeDTO dto);

    /**
     * 用户注册（需QQ邮箱验证）
     * @param dto
     */
    void register(@Valid UserRegisterDTO dto);

    /**
     * 校验邮箱验证码
     * @param email
     * @param code
     * @param type
     */
    void verifyEmailCode(String email, String code, Integer type);

    /**
     * 账号密码登录
     * @param dto
     * @return
     */
    LoginVO login(@Valid LoginDTO dto);

    /**
     * 更新用户头像
     * @param userId 用户ID
     * @param avatarUrl 头像URL
     */
    void updateAvatar(Long userId, String avatarUrl);

    /**
     * 通用主页
     * @param userId
     * @return
     */
    UserInfoVO getUserInfo(Long userId);

    /**
     * 修改当前登录用户信息
     * @param dto
     */
    void updateUserInfo(UserUpdateDTO dto, Long userId);

    /**
     * 分页查询当前用户信誉分变更记录
     * @param userId 用户ID
     * @param pageNum 页码
     * @param pageSize 每页条数
     * @return
     */
    PageResult<CreditLogVO> getCreditLogList(Long userId, Integer pageNum, Integer pageSize);

    /**
     * 修改密码（需先验证身份）
     * @param dto
     * @param userId
     */
    void updatePassword(UpdatePasswordDTO dto, Long userId);

    /**
     * 验证修改密码的验证码
     * @param dto
     */
    void verifyChangePwdCode(VerifyChangePwdCodeDTO dto);

    /**
     * 忘记密码（通过邮箱验证后重置密码，无需登录）
     * @param dto
     */
    void forgotPassword(UpdatePasswordDTO dto);
}
