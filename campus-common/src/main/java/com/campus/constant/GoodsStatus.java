package com.campus.constant;

/**
 * 商品状态常量类：
 */
public class GoodsStatus {

    // ====================== 上架状态 shelfStatus======================
    /** 上架 */
    public static final Integer goodsSHELF_ON = 1;
    /** 下架 */
    public static final Integer goodsSHELF_OFF = 0;

    // ====================== 售卖状态 saleStatus======================
    /** 待出售（有库存，可购买） */
    public static final Integer goodsSALE_PENDING = 0;
    /** 已售出（库存耗尽） */
    public static final Integer goodsSALE_SOLD = 1;

    // ====================== 审核状态 auditStatus ======================
    /** 待系统审核 */
    public static final Integer AUDIT_STATUS_WAIT_SYSTEM = 0;
    /** 待人工审核 */
    public static final Integer AUDIT_STATUS_WAIT_ADMIN = -1;
    /** 待申诉审核 */
    public static final Integer AUDIT_STATUS_WAIT_APPEAL = -2;
    /** 系统拦截 */
    public static final Integer AUDIT_STATUS_SYSTEM_BLOCK = -3;
    /** 人工拦截 */
    public static final Integer AUDIT_STATUS_ADMIN_BLOCK = -4;
    /** 审核通过 */
    public static final Integer AUDIT_STATUS_PASS = 1;

    // ====================== 风险等级 risk ======================
    /** 低风险 */
    public static final Integer RISK_LOW = 0;
    /** 中风险 */
    public static final Integer RISK_MIDDLE = 1;
    /** 高风险 */
    public static final Integer RISK_HIGH = 2;

    // ====================== 审核通过标记 hasApproved ======================
    /** 从未审核通过 */
    public static final Integer HAS_APPROVED_NO = 0;
    /** 已经至少通过一次 */
    public static final Integer HAS_APPROVED_YES = 1;

}
