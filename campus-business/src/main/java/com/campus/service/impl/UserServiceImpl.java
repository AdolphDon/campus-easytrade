package com.campus.service.impl;

import cn.hutool.core.util.RandomUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.dto.*;
import com.campus.utils.JwtUtil;
import com.campus.entity.CreditLog;
import com.campus.entity.EmailVerification;
import com.campus.entity.LoginLog;
import com.campus.entity.User;
import com.campus.mapper.CreditLogMapper;
import com.campus.mapper.EmailVerificationMapper;
import com.campus.mapper.LoginLogMapper;
import com.campus.mapper.UserMapper;
import com.campus.result.PageResult;
import com.campus.service.BloomFilterService;
import com.campus.service.UserService;
import com.campus.vo.CreditLogVO;
import com.campus.vo.LoginVO;
import com.campus.constant.Role;
import com.campus.exception.BusinessException;
import com.campus.vo.UserBalanceVO;
import com.campus.vo.UserInfoVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.DigestUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;
import java.util.List;
import java.util.stream.Collectors;

import com.campus.constant.DeletedStatus;
import static com.campus.constant.UserStatus.*;

@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class UserServiceImpl implements UserService {

    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redisTemplate;
    private final LoginLogMapper loginLogMapper;
    private final EmailVerificationMapper emailVerificationMapper;
    private final UserMapper userMapper;
    private final CreditLogMapper creditLogMapper;
    private final JavaMailSender mailSender;
    private final BloomFilterService bloomFilterService;

    //发件人
    @Value("${spring.mail.username}")
    private String fromEmail;

    @Value("${app.email.code-expire-minutes}")
    private int codeExpireMinutes;

    /**
     * 发送邮箱验证码
     * @param dto
     */
    public void sendEmailCode(SendEmailCodeDTO dto) {
        String email = dto.getEmail();//获取邮箱号
        Integer type = dto.getType();//获取状态 1=注册，2=找回密码，3=绑定邮箱
        //生成一个6位的随机数字验证码
        String code = RandomUtil.randomNumbers(6);

        //保存验证码到邮箱验证码表
        EmailVerification verification = EmailVerification.builder()
                .email(email)
                .code(code)
                .type(type)
                .expireTime(LocalDateTime.now().plusMinutes(codeExpireMinutes))//过期时间=当前时间+5分钟
                .used(emileDISABLE)//是否已使用：0=未使用，1=已使用
                .build();
        emailVerificationMapper.insert(verification);

        //根据业务类型（注册/找回密码/绑定邮箱）获取邮件标题
        String subject = getEmailSubject(type);
        //构建邮件正文：包含验证码+有效期
        String content = buildEmailContent(code, codeExpireMinutes);

        try {

            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);//发件人
            message.setTo(email);//收件人
            message.setSubject(subject);
            message.setText(content);
            mailSender.send(message);

        } catch (Exception e) {
            throw new BusinessException("邮件发送失败，请稍后重试");
        }
    }



    private String getEmailSubject(Integer type) {
        //根据type返回验证类型：1=注册，2=找回密码，3=绑定邮箱，4=验证身份
        switch (type) {
            case 1: return "【校易通】注册验证码";
            case 2: return "【校易通】找回密码验证码";
            case 3: return "【校易通】绑定邮箱验证码";
            case 4: return "【校易通】验证身份验证码";
            default: return "【校易通】验证码";
        }
    }

    private String buildEmailContent(String code, int expireMinutes) {
        //传入验证码与过期时间作为邮件信息组合
        return String.format(
                "您的验证码是：%s\n" +
                        "有效期：%d分钟\n" +
                        "请勿将验证码泄露给他人哦。\n\n" +
                        "校易通团队😊",
                code, expireMinutes
        );
    }

    /**
     * 注册账号(使用qq邮箱)
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"adminUserList"}, allEntries = true)
    public void register(UserRegisterDTO dto) {
        //调用校验验证码方法并标记验证码为已使用
        verifyEmailCode(dto.getEmail(), dto.getEmailCode(), 1); //1为注册

        //查询用户名、邮箱是否已经存在
        User existingUser = userMapper.checkDuplicate(dto.getUsername(),dto.getEmail());

        if (existingUser != null) {
            if (existingUser.getUsername().equals(dto.getUsername())) {
                throw new BusinessException("用户名已存在");
            }
            if (existingUser.getEmail().equals(dto.getEmail())) {
                throw new BusinessException("邮箱已被注册");
            }
        }

        //创建用户
        User user = User.builder()
                .username(dto.getUsername())//账号
                //PasswordEncoder接口:是SpringSecurity中的密码加密器（哈希加密-BCrypt加密）
                .password(passwordEncoder.encode(dto.getPassword()))
                .email(dto.getEmail())//邮箱
                .phone(dto.getPhone())//电话
                .nickname(dto.getNickname())//昵称
                .avatar("https://campus-easytrade.oss-cn-beijing.aliyuncs.com/337f92f6-885b-470f-b024-7eed296773d4.jpg")
                .background("https://campus-easytrade.oss-cn-beijing.aliyuncs.com/f841e0c3-e990-4c0e-851f-f9826680fca7.jpg")
                .gender(3)
                .emailVerified(emileENABLE)//邮箱已验证
                .role(Role.USER)//普通用户
                .status(userENABLE)//启用
                .creditScore(100)//信誉分
                .balance(BigDecimal.ZERO)//账户余额
                .frozenBalance(BigDecimal.ZERO)//冻结金额
                .alipayUserId("2088721101693903")//支付宝商户ID(沙箱测试)
                .build();
        userMapper.insert(user);
        bloomFilterService.add("user", user.getId());
    }

    /**
     * 校验邮箱验证码
     * @param email
     * @param code
     * @param type
     */
    public void verifyEmailCode(String email, String code, Integer type) {
        //传入QQ邮箱、验证码、验证码返回类型：1=注册，2=找回密码，3=绑定邮箱
        //LambdaQueryWrapper只是"构建器"，wrapper对象内部存储了查询条件
        LambdaQueryWrapper<EmailVerification> wrapper = Wrappers.lambdaQuery(EmailVerification.class);
        wrapper.eq(EmailVerification::getEmail, email)//匹配邮箱
                .eq(EmailVerification::getType, type)//匹配验证码类型（注册/登录/修改密码等）
                .eq(EmailVerification::getUsed, emileDISABLE)//未被使用过（0=未使用）
                .orderByDesc(EmailVerification::getCreateTime)//按创建时间倒序排序（最新的在前）
                .last("LIMIT 1");//只取第1条记录

        EmailVerification verification = emailVerificationMapper.selectOne(wrapper);

        if (verification == null) {
            throw new BusinessException("请先获取验证码");
        }

        if (verification.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException("验证码已过期，请重新获取");
        }

        if (!verification.getCode().equals(code)) {
            throw new BusinessException("验证码错误");
        }

        //标记验证码已使用：根据邮箱id标记验证码为已使用
        verification.setUsed(emileENABLE);
        emailVerificationMapper.updateById(verification);
    }

    /**
     * 用户登录
     * @param dto
     * @return
     */
    public LoginVO login(LoginDTO dto) {
        //获取用户名与密码
        String username = dto.getUsername();
        String password = dto.getPassword();

        //1.查询用户
        User user = userMapper.getByUsername(username);

        //2.构建登录日志：记录用户名与登录时间
        LoginLog loginLog = LoginLog.builder()
                .username(username)
                .build();

        //3.用户存在性校验
        if (user == null) {
            loginLog.setLoginResult(0);//登录失败
            loginLog.setFailReason("用户名不存在");//登录失败原因
            loginLogMapper.save(loginLog);
            throw new BusinessException("用户名或密码错误");
        }
        loginLog.setUserId(user.getId());//记录用户id

        //4.密码校验：PasswordEncoder为SpringSecurity提供的密码加密器、matches为对比器(明文，密文)
        if (!passwordEncoder.matches(password, user.getPassword())) {
            loginLog.setLoginResult(0);//登录失败
            loginLog.setFailReason("密码错误");//登录失败原因
            loginLogMapper.save(loginLog);
            throw new BusinessException("用户名或密码错误");
        }

        //5.账号状态校验
        if (user.getStatus() == userDISABLE) {
            loginLog.setLoginResult(0);//登录失败
            loginLog.setFailReason("账号已被禁用");//登录失败原因
            loginLogMapper.save(loginLog);
            throw new BusinessException("账号已被禁用，如需解封请添加管理员微信：13321583783");
        }
        //6.注销状态校验
        if (user.getDeleted() == DeletedStatus.DELETED) {
            loginLog.setLoginResult(0);
            loginLog.setFailReason("账号已注销");//登录失败原因
            loginLogMapper.save(loginLog);
            throw new BusinessException("账号已注销，无法登录");
        }

        //7.邮箱验证状态校验
        if (user.getEmailVerified() == emileDISABLE) {
            loginLog.setLoginResult(0);//登录失败
            loginLog.setFailReason("邮箱未验证");//登录失败原因
            loginLogMapper.save(loginLog);
            throw new BusinessException("请先完成邮箱验证");
        }

        //8.登录成功，更新最后登录时间
        loginLog.setLoginResult(1);//登录成功
        loginLogMapper.save(loginLog);

        user.setLastLoginTime(LocalDateTime.now());
        userMapper.updateById(user);

        //【登录成功后，再次校验最新状态，防止刚登录就被禁用】
        User latestUser = userMapper.getByUsername(username);
        if (latestUser.getStatus() == userDISABLE) {
            throw new BusinessException("账号已被禁用，如需解封请添加管理员微信：13321583783");
        }
        if (latestUser.getDeleted() == DeletedStatus.DELETED) {
            throw new BusinessException("账号已注销，无法登录");
        }

        //8.生成JWT Token:role等于0与1决定roleName为ROLE_ADMIN还是ROLE_USER
        String roleName = (user.getRole() == Role.ADMIN)
                ? Role.ROLE_ADMIN : Role.ROLE_USER;
        String token = jwtUtil.generateToken(
                user.getId().toString(),
                user.getUsername(),
                roleName
        );

        //10.将token存入Redis（空闲超时24小时，操作时自动延长）
        redisTemplate.opsForValue().set(
                "token_session:" + DigestUtils.md5DigestAsHex(token.getBytes(StandardCharsets.UTF_8)),
                user.getId().toString(),
                24, TimeUnit.HOURS
        );

        return LoginVO.builder()
                .userId(user.getId())
                .nickname(user.getNickname())
                .avatar(user.getAvatar())
                .role(user.getRole())//重点返回：1为用户，0为管理员
                .token(token)
                .creditScore(user.getCreditScore())
                .balance(user.getBalance())
                .build();
    }

    /**
     * 更新用户头像
     * @param userId 用户ID
     * @param avatarUrl 头像URL
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true)})
    public void updateAvatar(Long userId, String avatarUrl) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        user.setAvatar(avatarUrl);
        userMapper.updateById(user);
    }

    /**
     * 通用个人主页
     * @param userId
     * @return
     */
    @Transactional(readOnly = true)
    public UserInfoVO getUserInfo(Long userId) {
        // 布隆过滤器前置拦截：不存在直接抛异常，防缓存穿透
        if (!bloomFilterService.mightContain("user", userId)) {
            throw new RuntimeException("用户不存在");
        }
        //根据ID查询用户
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new RuntimeException("用户不存在");
        }

        return UserInfoVO.builder()
                .userId(user.getId())
                .username(user.getUsername())//用户名
                .nickname(user.getNickname())//昵称
                .email(user.getEmail())//邮箱
                .avatar(user.getAvatar())//头像
                .background(user.getBackground())//背景图
                .location(user.getLocation())//所属地
                .intro(user.getIntro())//个人简介
                .gender(user.getGender())//性别
                .birthday(user.getBirthday())//生日
                .creditScore(user.getCreditScore())//信誉分
                .balance(user.getBalance())//可用余额
                .frozenBalance(user.getFrozenBalance())//冻结金额
                .status(user.getStatus())
                .deleted(user.getDeleted())
                .build();
    }

    /**
     * 修改用户信息
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true)})
    public void updateUserInfo(UserUpdateDTO dto, Long userId) {
        LambdaUpdateWrapper<User> wrapper = Wrappers.lambdaUpdate(User.class);
        wrapper.eq(User::getId, userId);

        if (dto.getNickname() != null) {
            wrapper.set(User::getNickname, dto.getNickname());
        }
        if (dto.getAvatar() != null) {
            wrapper.set(User::getAvatar, dto.getAvatar());
        }
        if (dto.getBackground() != null) {
            wrapper.set(User::getBackground, dto.getBackground());
        }
        if (dto.getLocation() != null) {
            wrapper.set(User::getLocation, dto.getLocation());
        }
        if (dto.getIntro() != null) {
            wrapper.set(User::getIntro, dto.getIntro());
        }
        if (dto.getGender() != null) {
            wrapper.set(User::getGender, dto.getGender());
        }
        if (dto.getBirthday() != null) {
            wrapper.set(User::getBirthday, dto.getBirthday());
        }
        if (dto.getUsername() != null) {
            wrapper.set(User::getUsername, dto.getUsername());
        }
        userMapper.update(wrapper);
    }

    /**
     * 分页查询当前用户信誉分变更记录
     * @param userId 用户ID
     * @param pageNum 页码
     * @param pageSize 每页条数
     * @return
     */
    @Transactional(readOnly = true)
    public PageResult<CreditLogVO> getCreditLogList(Long userId, Integer pageNum, Integer pageSize) {
        Page<CreditLog> page = new Page<>(pageNum, pageSize);

        LambdaQueryWrapper<CreditLog> qw = Wrappers.lambdaQuery(CreditLog.class);
        qw.eq(CreditLog::getUserId, userId)
                .orderByDesc(CreditLog::getUpdateTime);

        creditLogMapper.selectPage(page, qw);

        List<CreditLogVO> voList = page.getRecords().stream()
                .map(log -> CreditLogVO.builder()
                        .id(log.getId())
                        .changeType(log.getChangeType())
                        .changeValue(log.getChangeValue())
                        .beforeScore(log.getBeforeScore())
                        .afterScore(log.getAfterScore())
                        .reason(log.getReason())
                        .updateTime(log.getUpdateTime())
                        .build())
                .collect(Collectors.toList());

        return PageResult.<CreditLogVO>builder()
                .records(voList)
                .total(page.getTotal())
                .size(page.getSize())
                .current(page.getCurrent())
                .pages(page.getPages())
                .build();
    }

    /**
     * 验证修改密码的验证码（仅校验，不标记使用）
     * @param dto
     */
    @Transactional(readOnly = true)
    public void verifyChangePwdCode(VerifyChangePwdCodeDTO dto) {
        String email = dto.getEmail();

        // 1.检查该邮箱是否曾通过验证
        LambdaQueryWrapper<EmailVerification> historyCheck = Wrappers.lambdaQuery(EmailVerification.class);
        historyCheck.eq(EmailVerification::getEmail, email)
                .eq(EmailVerification::getUsed, emileENABLE);
        Long verifiedCount = emailVerificationMapper.selectCount(historyCheck);
        if (verifiedCount == null || verifiedCount == 0) {
            throw new BusinessException("该邮箱未通过验证，请先验证邮箱");
        }

        // 2.校验验证码
        LambdaQueryWrapper<EmailVerification> codeCheck = Wrappers.lambdaQuery(EmailVerification.class);
        codeCheck.eq(EmailVerification::getEmail, email)
                .eq(EmailVerification::getType, 4)
                .eq(EmailVerification::getUsed, emileDISABLE)
                .orderByDesc(EmailVerification::getCreateTime)
                .last("LIMIT 1");

        EmailVerification verification = emailVerificationMapper.selectOne(codeCheck);

        if (verification == null) {
            throw new BusinessException("请先获取验证码");
        }

        if (verification.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException("验证码已过期，请重新获取");
        }

        if (!verification.getCode().equals(dto.getCode())) {
            throw new BusinessException("验证码错误");
        }
    }

    /**
     * 修改密码（需先验证身份）
     * @param dto
     * @param userId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true)})
    public void updatePassword(UpdatePasswordDTO dto, Long userId) {
        //1.校验两次密码是否一致
        if (!dto.isPasswordMatch()) {
            throw new BusinessException("两次输入的密码不一致");
        }

        String email = dto.getEmail();

        //2.检查该邮箱是否曾通过验证（email_verification表中存在 used=1 的记录）
        LambdaQueryWrapper<EmailVerification> historyCheck = Wrappers.lambdaQuery(EmailVerification.class);
        historyCheck.eq(EmailVerification::getEmail, email)
                .eq(EmailVerification::getUsed, emileENABLE);
        Long verifiedCount = emailVerificationMapper.selectCount(historyCheck);
        if (verifiedCount == null || verifiedCount == 0) {
            throw new BusinessException("该邮箱未通过验证，请先验证邮箱");
        }

        //3.校验验证码：查找该邮箱最新一条未使用的验证码
        LambdaQueryWrapper<EmailVerification> codeCheck = Wrappers.lambdaQuery(EmailVerification.class);
        codeCheck.eq(EmailVerification::getEmail, email)
                .eq(EmailVerification::getType, 4)// 验证身份类型
                .eq(EmailVerification::getUsed, emileDISABLE)
                .orderByDesc(EmailVerification::getCreateTime)
                .last("LIMIT 1");

        EmailVerification verification = emailVerificationMapper.selectOne(codeCheck);

        if (verification == null) {
            throw new BusinessException("请先获取验证码");
        }

        if (verification.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException("验证码已过期，请重新获取");
        }

        if (!verification.getCode().equals(dto.getCode())) {
            throw new BusinessException("验证码错误");
        }

        //4.标记验证码已使用
        verification.setUsed(emileENABLE);
        emailVerificationMapper.updateById(verification);

        //5.更新密码
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }

        user.setPassword(passwordEncoder.encode(dto.getNewPassword()));
        userMapper.updateById(user);
    }

    /**
     * 忘记密码：通过邮箱验证码验证身份后重置密码，无需登录
     * @param dto
     */
    public void forgotPassword(UpdatePasswordDTO dto) {
        //1.校验两次密码是否一致
        if (!dto.isPasswordMatch()) {
            throw new BusinessException("两次输入的密码不一致");
        }

        String email = dto.getEmail();

        //2.根据邮箱查找用户
        LambdaQueryWrapper<User> userQuery = Wrappers.lambdaQuery(User.class);
        userQuery.eq(User::getEmail, email)
                .eq(User::getDeleted, DeletedStatus.NOT_DELETED);
        User user = userMapper.selectOne(userQuery);
        if (user == null) {
            throw new BusinessException("该邮箱未绑定任何账号");
        }

        //3.校验验证码（type=2 找回密码）
        verifyEmailCode(email, dto.getCode(), 2);

        //4.直接SQL更新密码，绕过全字段覆盖
        String newPwdHash = passwordEncoder.encode(dto.getNewPassword());
        int rows = userMapper.updatePasswordById(user.getId(), newPwdHash);
        log.info("【忘记密码】userId={}, updateRows={}, newHash={}", user.getId(), rows, newPwdHash);

        //5.回读验证
        User after = userMapper.selectById(user.getId());
        log.info("【忘记密码】回读校验, DB中password hash={}, 与新hash一致={}", after.getPassword(), newPwdHash.equals(after.getPassword()));
    }
}
