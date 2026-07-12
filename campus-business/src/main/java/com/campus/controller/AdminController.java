package com.campus.controller;

import com.campus.dto.*;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.AdminService;
import com.campus.service.FeedbackService;
import com.campus.utils.SensitiveWordFilter;
import com.campus.vo.GoodsAuditVO;
import com.campus.vo.FeedbackVO;
import com.campus.vo.GoodsQuickSearchVO;
import com.campus.vo.UsersManageVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

import java.util.List;
import java.util.Map;

import static com.campus.result.Result.error;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "管理端接口")
@RestController
@RequestMapping("/admin/users")
@RequiredArgsConstructor//Lombok注解:替代@Autowired
public class AdminController {

    private final AdminService adminService;
    private final FeedbackService feedbackService;
    private final SensitiveWordFilter sensitiveWordFilter;

    /**
     * 分页查询普通用户列表（支持搜索、状态、邮箱、用户名、电话号）
     */
    @GetMapping("/user/list")
    @ApiOperation("分页查询普通用户列表")
    @Cacheable(value = "adminUserList",
               key = "'1_' + #query.pageNum + '_' + #query.pageSize + '_' + #query.status + '_' + #query.isDelete + '_' + #query.keyword",
               sync = true)
    public Result<PageResult<UsersManageVO>> getUserList(UsersPageQueryDTO query) {
        Integer role = 1;
        return Result.success(adminService.getUserListByAdmin(role,query));
    }

    /**
     * 分页查询管理员列表（支持搜索、状态、邮箱、用户名、电话号）
     */
    @GetMapping("/admin/list")
    @ApiOperation("分页查询管理员列表")
    @Cacheable(value = "adminUserList",
               key = "'0_' + #query.pageNum + '_' + #query.pageSize + '_' + #query.status + '_' + #query.isDelete + '_' + #query.keyword",
               sync = true)
    public Result<PageResult<UsersManageVO>> getAdminList(UsersPageQueryDTO query) {
        Integer role = 0;
        return Result.success(adminService.getUserListByAdmin(role,query));
    }

    /**
     * 启用用户
     */
    @PutMapping("/enable/{userId}")
    @ApiOperation("启用用户")
    public Result enableUser(@PathVariable Long userId) {
        adminService.enableUser(userId);
        return Result.success();
    }

    /**
     * 禁用用户
     */
    @PutMapping("/disable/{userId}")
    @ApiOperation("禁用用户（需填写封禁原因和天数）")
    public Result disableUser(@PathVariable Long userId,@RequestBody @Valid UserBanDTO dto) {
        Long adminId = getCurrentUserId();
        adminService.disableUser(userId,adminId,dto);
        return Result.success();
    }

    /**
     * 删除管理员（逻辑注销）
     */
    @PutMapping("/admin/delete/{userId}")
    @ApiOperation("逻辑注销管理员")
    public Result deleteUser(@PathVariable Long userId) {
        adminService.deleteAdmin(userId);
        return Result.success();
    }

    /**
     * 恢复用户（取消注销）
     */
    @PutMapping("/restore/{userId}")
    @ApiOperation("恢复已注销用户")
    public Result restoreUser(@PathVariable Long userId) {
        adminService.restoreUser(userId);
        return Result.success();
    }

    /**
     * 管理员注册（需QQ邮箱验证）
     */
    @PostMapping("/register")
    @ApiOperation("管理员注册（需QQ邮箱验证）")
    public Result register(@Valid @RequestBody AdminRegisterDTO dto) {
        adminService.register(dto);
        return Result.success();
    }

    /**
     * 管理员调整信誉分
     */
    @PutMapping("/credit/adjust/{userId}")
    @ApiOperation("调整用户信誉分")
    public Result adjustCreditScore(@PathVariable Long userId, @Valid @RequestBody CreditAdjustDTO dto) {
        adminService.adjustCreditScore(userId, dto);
        return Result.success();
    }

    /**
     * 管理端通用：商品审核列表（待人工审核 / 待申诉审核 / 人工拦截）、前端传 auditStatus 即可切换：
     * -1 = 待人工审核 -2 = 待申诉审核 -4 = 人工拦截
     */
    @GetMapping("/audit/list")
    @ApiOperation("分页查询商品审核列表（待人工审核/待申诉审核/人工拦截）")
    @Cacheable(value = "goods:audit:page", key = "#dto.pageNum + '_' + #dto.pageSize + '_' + #dto.auditStatus", sync = true)
    public Result<PageResult<GoodsAuditVO>> getAuditList(GoodsAuditPageQueryDTO dto) {
        PageResult<GoodsAuditVO> pageResult = adminService.getAuditPage(dto);
        return Result.success(pageResult);
    }

    /**
     * 审核通过
     */
    @PutMapping("/audit-pass/{goodsId}")
    @ApiOperation("审核通过（初始化Redis库存）")
    public Result auditPass(@PathVariable Long goodsId) {
        adminService.auditPass(goodsId);
        return Result.success();
    }

    /**
     * 审核驳回（人工拦截）
     */
    @PutMapping("/audit-reject/{goodsId}")
    @ApiOperation("审核驳回（人工拦截）")
    public Result auditReject(@PathVariable Long goodsId,@RequestBody GoodsRejectDTO dto) {
        adminService.auditReject(goodsId, dto.getInterceptReason());
        return Result.success();
    }

    /**
     * 获取所有敏感词
     */
    @GetMapping("/sensitive-getwords")
    @ApiOperation("获取所有敏感词")
    public Result<List<String>> getSensitiveWords() {
        return Result.success(sensitiveWordFilter.getAllWords());
    }

    /**
     * 添加敏感词
     */
    @PostMapping("/sensitive-addwords")
    @ApiOperation("添加敏感词")
    public Result addSensitiveWord(@RequestBody SensitiveWordDTO dto) {
        sensitiveWordFilter.addWord(dto.getWord());
        return Result.success();
    }

    /**
     * 删除敏感词
     */
    @DeleteMapping("/sensitive-removewords/{word}")
    @ApiOperation("删除敏感词")
    public Result removeSensitiveWord(@PathVariable String word) {
        sensitiveWordFilter.removeWord(word);
        return Result.success();
    }

    /**
     * 从文件重载敏感词库（用于手动编辑文件后同步）
     */
    @PostMapping("/sensitive-reloadwords/reload")
    @ApiOperation("从文件重载敏感词库")
    public Result reloadSensitiveWords() {
        sensitiveWordFilter.reload();
        return Result.success();
    }

    /**
     * 获取管理端工作台统计数据（用户总数、商品总数、待审核数、待申诉数）
     */
    @GetMapping("/dashboard/stats")
    @ApiOperation("获取管理端工作台统计数据")
    public Result<Map<String, Object>> getDashboardStats() {
        return Result.success(adminService.getDashboardStats());
    }

    /**
     * 商品速查：根据商品ID查询首图、价格、商品名
     */
    @GetMapping("/quick-search/{goodsId}")
    @ApiOperation("商品速查")
    public Result<GoodsQuickSearchVO> quickSearch(@PathVariable Long goodsId) {
        GoodsQuickSearchVO vo = adminService.getGoodsQuickSearch(goodsId);
        if (vo == null) {
            return Result.error("商品不存在");
        }
        return Result.success(vo);
    }

    /**
     * 快速禁用商品：将审核状态设为待系统审核，风险等级设为高风险
     */
    @PutMapping("/quick-disable/{goodsId}")
    @ApiOperation("快速禁用商品（设为待系统审核+高风险）")
    public Result quickDisable(@PathVariable Long goodsId) {
        adminService.quickDisable(goodsId);
        return Result.success();
    }

    @GetMapping("/feedback/list")
    @ApiOperation("分页查询用户意见反馈")
    public Result<PageResult<FeedbackVO>> listFeedbacks(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer size) {
        return Result.success(feedbackService.pageFeedback(page, size));
    }

    /**
     * 标记反馈为已处理（逻辑删除）
     */
    @PutMapping("/feedback/process/{id}")
    @ApiOperation("标记反馈为已处理")
    public Result processFeedback(@PathVariable Long id) {
        feedbackService.processFeedback(id);
        return Result.success();
    }
}
