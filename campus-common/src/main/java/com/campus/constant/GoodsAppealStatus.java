package com.campus.constant;

/**
 * 商品申诉状态常量类
 */
public class GoodsAppealStatus {
    // ====================== 申诉审核状态 appealStatus ======================
    /**  申诉未完成 */
    public static final Integer APPEAL_UNFINISHED = 0;
    /**  申诉已完成 */
    public static final Integer APPEAL_FINISHED = 1;
    //====================== 拦截类型常量 ======================
    /** 人工拦截 */
    public static final Integer INTERCEPT_ADMIN = 1;
    /** 系统拦截 */
    public static final Integer INTERCEPT_SYSTEM = 2;
}
