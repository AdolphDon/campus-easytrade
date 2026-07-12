package com.campus.service.impl;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.constant.GoodsStatus;
import com.campus.constant.Role;
import com.campus.dto.*;
import com.campus.entity.*;
import com.campus.exception.BusinessException;
import com.campus.mapper.*;
import com.campus.result.PageResult;
import com.campus.service.AdminService;
import com.campus.service.RedisStockService;
import com.campus.service.GoodsService;
import com.campus.service.UserService;
import com.campus.vo.GoodsAuditVO;
import com.campus.vo.GoodsQuickSearchVO;
import com.campus.vo.UsersManageVO;
import com.campus.service.BloomFilterService;
import com.campus.websocket.AccountStatusWebSocketHandler;
import com.campus.constant.DeletedStatus;
import com.campus.constant.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import static com.campus.constant.GoodsAppealStatus.APPEAL_FINISHED;
import static com.campus.constant.GoodsAppealStatus.APPEAL_UNFINISHED;
import static com.campus.constant.GoodsAppealStatus.INTERCEPT_ADMIN;
import static com.campus.constant.GoodsStatus.*;
import static com.campus.constant.UserStatus.*;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class AdminServiceImpl implements AdminService {

    private final UserMapper userMapper;
    private final GoodsMapper goodsMapper;
    private final UserBanRecordMapper userBanRecordMapper;
    private final AccountStatusWebSocketHandler webSocketHandler;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final CreditLogMapper creditLogMapper;
    private final GoodsImageMapper goodsImageMapper;
    private final GoodsAppealMapper goodsAppealMapper;
    private final GoodsInterceptMapper goodsInterceptMapper;
    private final RedisStockService redisStockService;
    private final StringRedisTemplate redisTemplate;
    private final BloomFilterService bloomFilterService;

    /**
     * 分页查询普通用户列表（支持搜索、状态、邮箱、用户名、电话号）
     * @param query
     * @return
     */
    @Transactional(readOnly = true)//只读事务，提升少量查询性能
    public PageResult<UsersManageVO> getUserListByAdmin(Integer role,UsersPageQueryDTO query) {

        Page<User> page = new Page<>(query.getPageNum(), query.getPageSize());

        //构建查询条件
        LambdaQueryWrapper<User> wrapper = Wrappers.lambdaQuery(User.class);

        //【根据role筛选普通用户1/管理员0】
        if (role != null) {
            wrapper.eq(User::getRole, role);
        }
        //【状态：启用1/禁用0】
        if (query.getStatus() != null) {
            wrapper.eq(User::getStatus, query.getStatus());
        }

        //【注销状态：未注销0/已注销1】
        if (query.getIsDelete() != null) {
            wrapper.eq(User::getDeleted, query.getIsDelete());
        }

        //【搜索框：用户名/邮箱/手机号】
        if (StrUtil.isNotBlank(query.getKeyword())) {
            wrapper.and(w -> w.like(User::getUsername, query.getKeyword())
                    .or().like(User::getEmail, query.getKeyword())
                    .or().like(User::getPhone, query.getKeyword()));
        }

        //按更新时间倒序
        wrapper.orderByDesc(User::getUpdateTime);

        Page<User> userPage = userMapper.selectPage(page, wrapper);
        List<UsersManageVO> voList = userPage.getRecords().stream().map(user ->
                UsersManageVO.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .nickname(user.getNickname())
                        .avatar(user.getAvatar())
                        .phone(user.getPhone())
                        .email(user.getEmail())
                        .status(user.getStatus())
                        .isDelete(user.getDeleted())
                        .creditScore(user.getCreditScore())
                        .updateTime(user.getUpdateTime())
                        .build()
        ).collect(Collectors.toList());

        return PageResult.<UsersManageVO>builder()
                .records(voList)
                .total(userPage.getTotal())
                .size(userPage.getSize())
                .current(userPage.getCurrent())
                .pages(userPage.getPages())
                .build();
    }

    /**
     * 启用账号
     * @param userId
     */
    @Transactional(rollbackFor = Exception.class)//事务回滚：核心DB操作有异常则回滚
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true)})
    public void enableUser(Long userId) {
        //启用用户
        User user = new User().builder().id(userId).status(userENABLE).build();
        userMapper.updateById(user);
    }

    /**
     * 禁用账号
     * @param userId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true),
            @CacheEvict(value = "goodsList", allEntries = true)})
    public void disableUser(Long userId, Long adminId, UserBanDTO dto) {

        Integer banDays = dto.getBanDays();
        String banReason = dto.getBanReason();

        //设置禁用时间
        LocalDateTime unbanTime;
        if (banDays <= 0) {
            //永久禁用：设置一个很远的时间
            unbanTime = LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        } else {
            //禁用的当前时间往后推禁用天数
            unbanTime = LocalDateTime.now().plusDays(banDays);
        }

        //禁用用户
        User user = new User().builder().id(userId).status(userDISABLE).build();

        userMapper.updateById(user);

        //通过WebSocket推送禁用通知给该用户（前端显示倒计时缓冲，不立即关闭连接）
        String reason = String.format("您的账号已被禁用%s",
                dto.getBanDays() == 0 ? "" : ("，将在 " + unbanTime + " 自动解封"));
        webSocketHandler.sendDisableNotice(userId, reason, dto.getBanDays(), 30);

        //强制下架该用户商品 纯用Wrapper无实体
        LambdaUpdateWrapper<Goods> wrapper = Wrappers.lambdaUpdate(Goods.class);
        wrapper.eq(Goods::getUserId, userId)
                .set(Goods::getShelfStatus, goodsSHELF_OFF);
        goodsMapper.update(null, wrapper);

        //记录禁用表
        UserBanRecord record = UserBanRecord.builder()
                .userId(userId)
                .banDays(banDays)
                .unbanTime(unbanTime)
                .banReason(banReason)
                .adminId(adminId)
                .build();
        userBanRecordMapper.insert(record);

        //清除该用户的商品列表缓存
        evictUserGoodsListCache(userId);
        evictCommonGoodsListCache(userId);
    }

    private void evictUserGoodsListCache(Long userId) {
        redisTemplate.delete("userGoodsList:" + userId);
    }

    private void evictCommonGoodsListCache(Long userId) {
        redisTemplate.delete("commonGoodsList:" + userId);
    }

    /**
     * 注销账号
     * @param userId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true),
            @CacheEvict(value = "goodsList", allEntries = true)})
    public void deleteAdmin(Long userId) {
        //标记删除
        User user = new User().builder().id(userId).deleted(1).build();
        userMapper.updateById(user);

        //通过WebSocket推送强制下线通知
        webSocketHandler.forceLogoutUser(userId, "您的账号已经注销，如需申诉请联系客服");

        //强制下架该用户商品 有Wrapper有实体
        Goods goods = new Goods();
        goods.setShelfStatus(goodsSHELF_OFF);

        LambdaUpdateWrapper<Goods> wrapper = Wrappers.lambdaUpdate(Goods.class);
        wrapper.eq(Goods::getUserId, userId);

        goodsMapper.update(goods, wrapper);

        //清除该用户的商品列表缓存
        evictUserGoodsListCache(userId);
        evictCommonGoodsListCache(userId);
    }

    /**
     * 恢复账号
     * @param userId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true)})
    public void restoreUser(Long userId) {
        //标记未删除
        User user = new User().builder().id(userId).deleted(0).build();

        userMapper.updateById(user);
    }

    /**
     * 管理员注册（需QQ邮箱验证）
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"adminUserList"}, allEntries = true)
    public void register(AdminRegisterDTO dto) {
        //调用校验验证码方法并标记验证码为已使用
        userService.verifyEmailCode(dto.getEmail(), dto.getEmailCode(), 1);//1为注册

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
                .nickname("001")//昵称
                .avatar("https://campus-easytrade.oss-cn-beijing.aliyuncs.com/337f92f6-885b-470f-b024-7eed296773d4.jpg")
                .background("https://campus-easytrade.oss-cn-beijing.aliyuncs.com/f841e0c3-e990-4c0e-851f-f9826680fca7.jpg")
                .gender(3)
                .emailVerified(emileENABLE)//邮箱已验证
                .role(Role.ADMIN)//普通用户
                .status(userENABLE)//启用
                .creditScore(100)//信誉分
                .balance(BigDecimal.ZERO)//账户余额
                .frozenBalance(BigDecimal.ZERO)//冻结金额
                .build();
        userMapper.insert(user);
        bloomFilterService.add("user", user.getId());
    }

    /**
     * 管理员调整信誉分
     * @param userId
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "userInfo", key = "#userId"),
            @CacheEvict(value = "adminUserList", allEntries = true)})
    public void adjustCreditScore(Long userId, CreditAdjustDTO dto) {

        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }

        //计算变更前后的信誉分
        Integer beforeScore = user.getCreditScore();
        Integer changeValue = dto.getChangeValue();
        Integer afterScore = beforeScore + changeValue;

        //信誉分校验
        if (afterScore < 0) {
            throw new BusinessException("信誉分不能低于0");
        }
        if (afterScore > 100) {
            throw new BusinessException("信誉分不能高于100");
        }

        //更新用户表信誉分
        user.setCreditScore(afterScore);
        userMapper.updateById(user);

        //记录变更日志
        CreditLog log = CreditLog.builder()
                .userId(userId)
                .changeType("管理员变更")
                .changeValue(changeValue)
                .beforeScore(beforeScore)
                .afterScore(afterScore)
                .reason(dto.getReason())
                .operatorId(getCurrentUserId())
                .build();
        creditLogMapper.insert(log);
    }

    /**
     * 管理端通用：商品审核列表（待人工审核 / 待申诉审核 / 人工拦截）、前端传 auditStatus 即可切换：
     * -1 = 待人工审核 -2 = 待申诉审核 -4 = 人工拦截
     * @param dto
     * @return
     */
    @Transactional(readOnly = true)
    public PageResult<GoodsAuditVO> getAuditPage(GoodsAuditPageQueryDTO dto) {
        Page<Goods> page = new Page<>(dto.getPageNum(), dto.getPageSize());

        LambdaQueryWrapper<Goods> qw = Wrappers.lambdaQuery(Goods.class);
        qw.eq(dto.getAuditStatus() != null, Goods::getAuditStatus, dto.getAuditStatus())
                .orderByDesc(Goods::getCreateTime);
        //待申诉审核时，只查申诉表中申诉未完成的商品
        if (dto.getAuditStatus() != null && dto.getAuditStatus() == -2) {
            qw.inSql(Goods::getId, "SELECT goods_id FROM goods_appeal WHERE appeal_status = 0");
        }

        goodsMapper.selectPage(page, qw);

        List<GoodsAuditVO> voList = new ArrayList<>();
        List<Goods> records = page.getRecords();
        List<Long> goodsIds = records.stream().map(Goods::getId).collect(Collectors.toList());

        //批量查询商品图片列表：一次性查完再用map取
        List<GoodsImage> allImages;
        if (goodsIds.isEmpty()) {
            allImages = Collections.emptyList();
        } else {
            allImages = goodsImageMapper.selectList(
                new LambdaQueryWrapper<GoodsImage>()
                        .in(GoodsImage::getGoodsId, goodsIds)
                        .orderByAsc(GoodsImage::getSort)
            );
        }
        //分组收集器groupingBy()：核心作用是按指定字段分组-商品id做key
        Map<Long, List<String>> imageMap = allImages.stream().collect(
                Collectors.groupingBy(GoodsImage::getGoodsId,
                        //嵌套收集器：mapping()-把商品图片按照商品id打包成列表来做map的value
                        Collectors.mapping(GoodsImage::getUrl, Collectors.toList())));

        //批量查询申诉内容（仅待申诉审核时）
        Map<Long, String> appealMap = new HashMap<>();
        if (dto.getAuditStatus() == -2) {
            List<GoodsAppeal> appealList = goodsAppealMapper.selectList(
                    new LambdaQueryWrapper<GoodsAppeal>()
                            .in(GoodsAppeal::getGoodsId, goodsIds)
                            .eq(GoodsAppeal::getAppealStatus, APPEAL_UNFINISHED)
                            .orderByDesc(GoodsAppeal::getCreateTime)
            );
            //取每个商品最新的申诉
            appealMap = appealList.stream().collect(
                    Collectors.toMap(GoodsAppeal::getGoodsId, GoodsAppeal::getAppealContent, (a, b) -> a));
        }

        for (Goods goods : records) {
            GoodsAuditVO vo = GoodsAuditVO.builder()
                    .goodsId(goods.getId())
                    .name(goods.getName())
                    .imageUrls(imageMap.getOrDefault(goods.getId(), new ArrayList<>()))
                    .price(goods.getPrice())
                    .description(goods.getDescription())
                    .build();

            if (dto.getAuditStatus() == -2) {
                String appealContent = appealMap.get(goods.getId());
                vo.setAppealContent(appealContent != null ? appealContent : "该商品无申诉记录");
            }
            voList.add(vo);
        }

        return PageResult.<GoodsAuditVO>builder()
                .records(voList)
                .total(page.getTotal())
                .size(page.getSize())
                .current(page.getCurrent())
                .pages(page.getPages())
                .build();
        }

    /**
     * 待人工审核or待申诉审核-审核通过
     * @param goodsId
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goods:audit:page", allEntries = true),
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "goodsDetail", key = "#goodsId")})
    public void auditPass(Long goodsId) {
        Goods oldGoods = goodsMapper.selectById(goodsId);
        if (oldGoods == null) {
            throw new BusinessException("商品不存在");
        }
        if (!goodsSALE_PENDING.equals(oldGoods.getSaleStatus())) {
            throw new BusinessException("仅待出售状态的商品可审核");
        }

        Goods.GoodsBuilder builder = Goods.builder().id(goodsId);

        //①待人工审核0r待申诉审核-审核通过统一修改商品数据
        //审核通过状态处理：从未审核通过or已经审核通过
        if (HAS_APPROVED_NO.equals(oldGoods.getHasApproved())) {
            //================ 情况1：从未审核通过 ================
            builder.shelfStatus(goodsSHELF_ON)
                    .auditStatus(AUDIT_STATUS_PASS)
                    .risk(RISK_LOW)
                    .hasApproved(HAS_APPROVED_YES);
        } else {
            //================ 情况2：已经至少审核通过一次 ===========
            builder.auditStatus(AUDIT_STATUS_PASS)
                    .risk(RISK_LOW);
        }
        goodsMapper.updateById(builder.build());

        //审核通过->初始化Redis库存（供用户浏览和预占）
        redisStockService.initStock(goodsId, oldGoods.getStock());

        //②待申诉审核-审核通过需修改申诉表
        if (AUDIT_STATUS_WAIT_APPEAL.equals(oldGoods.getAuditStatus())) {
            LambdaUpdateWrapper<GoodsAppeal> updateWrapper = new LambdaUpdateWrapper<>();
            updateWrapper.eq(GoodsAppeal::getGoodsId, goodsId)
                    .eq(GoodsAppeal::getAppealStatus, APPEAL_UNFINISHED);

            GoodsAppeal appeal = GoodsAppeal.builder()
                    .auditAdminId(getCurrentUserId())
                    .appealStatus(APPEAL_FINISHED)
                    .auditReason("申诉通过")
                    .build();

            goodsAppealMapper.update(appeal, updateWrapper);
        }

        //清除该商品卖家的列表缓存
        evictUserGoodsListCache(oldGoods.getUserId());
        evictCommonGoodsListCache(oldGoods.getUserId());
    }

    /**
     * 待人工审核or待申诉审核-审核不通过
     * @param goodsId
     * @param interceptReason
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goods:audit:page", allEntries = true),
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "goodsDetail", key = "#goodsId")})
    public void auditReject(Long goodsId, String interceptReason) {
        Goods oldGoods = goodsMapper.selectById(goodsId);
        if (oldGoods == null) {
            throw new BusinessException("商品不存在");
        }
        if (!goodsSALE_PENDING.equals(oldGoods.getSaleStatus())) {
            throw new BusinessException("仅待出售状态的商品可审核");
        }

        //待人工审核不通过直接打回-待申诉审核依旧保持待申诉审核状态
        if (AUDIT_STATUS_WAIT_ADMIN.equals(oldGoods.getAuditStatus())) {
            goodsMapper.updateById(Goods.builder().id(goodsId).auditStatus(AUDIT_STATUS_ADMIN_BLOCK)
                    .build());
        }
        //待申诉审核和待人工审核都要写拦截表
        GoodsIntercept intercept = GoodsIntercept.builder()
                .goodsId(goodsId)
                .interceptType(INTERCEPT_ADMIN)
                .interceptReason(interceptReason)
                .adminId(getCurrentUserId())
                .build();
        goodsInterceptMapper.insert(intercept);

        //情况2：该商品状态为待申诉审核-需填写申诉表
        if (AUDIT_STATUS_WAIT_APPEAL.equals(oldGoods.getAuditStatus())) {
            LambdaUpdateWrapper<GoodsAppeal> updateWrapper = new LambdaUpdateWrapper<>();
            updateWrapper.eq(GoodsAppeal::getGoodsId, goodsId)
                    .eq(GoodsAppeal::getAppealStatus, APPEAL_UNFINISHED);

            GoodsAppeal appeal = GoodsAppeal.builder()
                    .auditAdminId(getCurrentUserId())
                    .appealStatus(APPEAL_FINISHED)
                    .auditReason(interceptReason)
                    .build();

            goodsAppealMapper.update(appeal, updateWrapper);
        }

        //清除该商品卖家的列表缓存
        evictUserGoodsListCache(oldGoods.getUserId());
        evictCommonGoodsListCache(oldGoods.getUserId());
    }

    /**
     * 获取管理端工作台统计数据
     * @return
     */
    @Cacheable(value = "dashboardStats", sync = true)
    @Transactional(readOnly = true)
    public Map<String, Object> getDashboardStats() {
        Map<String, Object> stats = new HashMap<>();

        //用户总数（普通用户 role=1，未删除）
        Long totalUsers = userMapper.selectCount(
                Wrappers.<User>lambdaQuery().eq(User::getRole, Role.USER).eq(User::getDeleted, DeletedStatus.NOT_DELETED)
        );
        stats.put("totalUsers", totalUsers);

        //今日新增用户数
        LocalDateTime todayStart = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0).withNano(0);
        Long newUsersToday = userMapper.selectCount(
                Wrappers.<User>lambdaQuery().eq(User::getRole, Role.USER).ge(User::getCreateTime, todayStart)
        );
        stats.put("newUsersToday", newUsersToday);

        //管理员总数（role=0，未删除）
        Long totalAdmins = userMapper.selectCount(
                Wrappers.<User>lambdaQuery().eq(User::getRole, Role.ADMIN).eq(User::getDeleted, DeletedStatus.NOT_DELETED)
        );
        stats.put("totalAdmins", totalAdmins);

        //商品总数（未删除）
        Long totalProducts = goodsMapper.selectCount(
                Wrappers.<Goods>lambdaQuery().eq(Goods::getDeleted, DeletedStatus.NOT_DELETED)
        );
        stats.put("totalProducts", totalProducts);

        //待人工审核（auditStatus = -1）
        Long pendingReviews = goodsMapper.selectCount(
                Wrappers.<Goods>lambdaQuery().eq(Goods::getAuditStatus, AUDIT_STATUS_WAIT_ADMIN)
        );
        stats.put("pendingReviews", pendingReviews);

        //待申诉审核（auditStatus = -2）
        Long pendingAppeals = goodsMapper.selectCount(
                Wrappers.<Goods>lambdaQuery().eq(Goods::getAuditStatus, AUDIT_STATUS_WAIT_APPEAL)
        );
        stats.put("pendingAppeals", pendingAppeals);

        return stats;
    }

    /**
     * 商品速查：根据商品ID查询首图、价格、商品名
     * @param goodsId
     * @return
     */
    @Transactional(readOnly = true)
    public GoodsQuickSearchVO getGoodsQuickSearch(Long goodsId) {
        Goods goods = goodsMapper.selectById(goodsId);
        if (goods == null) {
            return null;
        }
        //取首图（sort最小的那张）
        List<String> images = goodsImageMapper.selectByGoodsId(goodsId);
        String firstImage = (images != null && !images.isEmpty()) ? images.get(0) : null;

        return GoodsQuickSearchVO.builder()
                .goodsId(goods.getId())
                .goodsName(goods.getName())
                .price(goods.getPrice())
                .firstImage(firstImage)
                .auditStatus(goods.getAuditStatus())
                .shelfStatus(goods.getShelfStatus())
                .build();
    }

    /**
     * 快速禁用商品：将审核状态设为待系统审核，风险等级设为高风险
     * @param goodsId
     */
    @Caching(evict = {
            @CacheEvict(value = "goods:audit:page", allEntries = true),
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "goodsDetail", key = "#goodsId")})
    public void quickDisable(Long goodsId) {
        Goods goods = goodsMapper.selectById(goodsId);
        if (goods == null) return;

        goodsMapper.updateById(Goods.builder()
                .id(goodsId)
                .auditStatus(AUDIT_STATUS_WAIT_SYSTEM)
                .risk(RISK_HIGH)
                .build());

        evictUserGoodsListCache(goods.getUserId());
        evictCommonGoodsListCache(goods.getUserId());
    }
}
