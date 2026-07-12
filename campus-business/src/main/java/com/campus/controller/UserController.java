package com.campus.controller;

import com.campus.dto.*;
import com.campus.result.PageResult;
import com.campus.service.UserService;
import com.campus.vo.CreditLogVO;
import com.campus.vo.LoginVO;
import com.campus.result.Result;
import com.campus.vo.UserBalanceVO;
import com.campus.vo.UserInfoVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.util.DigestUtils;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.nio.charset.StandardCharsets;

import static com.campus.result.Result.error;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "用户与管理员登录注册/用户端接口")
@RestController
@RequestMapping("/user/user")
@RequiredArgsConstructor//Lombok注解:替代@Autowired
public class UserController {

    private final UserService userService;
    private final StringRedisTemplate redisTemplate;

    /**
     * 发送邮箱验证码：@Valid开启参数校验，自动检查前端传过来的数据对不对，配合validation依赖带来的校验注解使用
     */
    @PostMapping("/send-code")
    @ApiOperation("发送邮箱验证码")
    public Result sendEmailCode(@Valid @RequestBody SendEmailCodeDTO dto) {
        userService.sendEmailCode(dto);
        return Result.success();
    }

    /**
     * 用户注册（需QQ邮箱验证）
     */
    @PostMapping("/register")
    @ApiOperation("用户注册（需QQ邮箱验证）")
    public Result register(@Valid @RequestBody UserRegisterDTO dto) {

        // 校验两次密码是否一致
        if (!dto.isPasswordMatch()) {
            return error("两次输入的密码不一致");
        }
        userService.register(dto);
        return Result.success();
    }

    /**
     * 账号密码登录
     */
    @PostMapping("/login")
    @ApiOperation("账号密码登录（返回JWT Token）")
    public Result<LoginVO> login(@Valid @RequestBody LoginDTO dto) {
        LoginVO loginVO = userService.login(dto);
        return Result.success(loginVO);
    }

    /**
     * 退出登录（使当前Token立即失效）
     */
    @PostMapping("/logout")
    @ApiOperation("退出登录（使当前 Token 立即失效）")
    public Result logout(@RequestHeader("Authorization") String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            redisTemplate.delete("token_session:" + DigestUtils.md5DigestAsHex(token.getBytes(StandardCharsets.UTF_8)));
        }
        return Result.success();
    }

    /**
     * 更新用户头像
     */
    @PostMapping("/update-avatar")
    @ApiOperation("更新用户头像")
    public Result updateAvatar(@RequestParam String avatarUrl) {
        Long userId = getCurrentUserId();
        userService.updateAvatar(userId, avatarUrl);
        return Result.success();
    }

    /**
     * 通用主页回显个人信息
     */
    @GetMapping("/info/{userId}")
    @ApiOperation("通用主页回显个人信息")
    @Cacheable(value = "userInfo", key = "#userId",sync = true)
    public Result<UserInfoVO> getUserInfo(@PathVariable Long userId) {
        UserInfoVO userInfo = userService.getUserInfo(userId);
        return Result.success(userInfo);
    }

    /**
     * 修改当前登录用户信息
     */
    @PutMapping("/update")
    @ApiOperation("修改当前登录用户信息")
    public Result<Void> updateUserInfo(@RequestBody UserUpdateDTO dto) {
        Long userId = getCurrentUserId();
        userService.updateUserInfo(dto, userId);
        return Result.success();
    }

    /**
     * 分页查询当前用户信誉分变更记录
     */
    @GetMapping("/credit-log")
    @ApiOperation("分页查询当前用户信誉分变更记录")
    public Result<PageResult<CreditLogVO>> getCreditLogList(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        Long userId = getCurrentUserId();
        return Result.success(userService.getCreditLogList(userId, pageNum, pageSize));
    }

    /**
     * 验证修改密码的验证码
     */
    @PostMapping("/verify-change-pwd-code")
    @ApiOperation("验证修改密码的验证码")
    public Result<Void> verifyChangePwdCode(@Valid @RequestBody VerifyChangePwdCodeDTO dto) {
        userService.verifyChangePwdCode(dto);
        return Result.success();
    }

    /**
     * 修改密码（需先验证身份）
     */
    @PutMapping("/update-password")
    @ApiOperation("修改密码（邮箱验证身份）")
    public Result<Void> updatePassword(@Valid @RequestBody UpdatePasswordDTO dto) {
        Long userId = getCurrentUserId();
        userService.updatePassword(dto, userId);
        return Result.success();
    }

    /**
     * 忘记密码：通过邮箱验证码重置密码（无需登录）
     */
    @PutMapping("/forgot-password")
    @ApiOperation("忘记密码（通过邮箱验证码重置密码）")
    public Result<Void> forgotPassword(@Valid @RequestBody UpdatePasswordDTO dto) {
        userService.forgotPassword(dto);
        return Result.success();
    }
}
