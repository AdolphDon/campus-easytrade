package com.campus.service;

import com.campus.dto.*;
import com.campus.result.PageResult;
import com.campus.vo.GoodsAuditVO;
import com.campus.vo.GoodsQuickSearchVO;
import com.campus.vo.UsersManageVO;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import java.util.Map;

public interface AdminService {

    /**
     * 分页查询普通用户列表（支持搜索、状态、邮箱、用户名、电话号）
     * @param query
     * @return
     */
    PageResult<UsersManageVO> getUserListByAdmin(Integer role,UsersPageQueryDTO query);

    /**
     * 启用用户
     * @param userId
     */
    void enableUser(Long userId);

    /**
     * 禁用用户
     * @param userId
     */
    void disableUser(Long userId, Long adminId, UserBanDTO dto);

    /**
     * 删除管理员（逻辑注销）
     * @param userId
     */
    void deleteAdmin(Long userId);

    /**
     * 恢复用户（取消注销）
     * @param userId
     */
    void restoreUser(Long userId);

    /**
     * 管理员注册（需QQ邮箱验证）
     * @param dto
     */
    void register(@Valid AdminRegisterDTO dto);

    /**
     * 管理员调整信誉分
     * @param userId
     * @param dto
     */
    void adjustCreditScore(Long userId, @Valid CreditAdjustDTO dto);

    /**
     * 管理端通用：商品审核列表（待人工审核 / 待申诉审核 / 人工拦截）、前端传auditStatus即可切换：
     * 待人工审核-1 待申诉审核-2 人工拦截-4
     * @param dto
     * @return
     */
    PageResult<GoodsAuditVO> getAuditPage(GoodsAuditPageQueryDTO dto);

    /**
     * 审核通过
     * @param goodsId
     */
    void auditPass(Long goodsId);

    /**
     * 审核驳回（人工拦截）
     * @param goodsId
     * @param interceptReason
     */
    void auditReject(Long goodsId, @NotBlank(message = "驳回原因不能为空") String interceptReason);

    /**
     * 获取管理端工作台统计数据（用户总数、商品总数、待审核数、待申诉数、敏感词数、知识文档数）
     */
    Map<String, Object> getDashboardStats();

    /**
     * 商品速查：根据商品ID查询首图、价格、商品名
     */
    GoodsQuickSearchVO getGoodsQuickSearch(Long goodsId);

    /**
     * 快速禁用商品：将审核状态设为待系统审核，风险等级设为高风险
     */
    void quickDisable(Long goodsId);
}
