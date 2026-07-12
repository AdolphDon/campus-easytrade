package com.campus.constant;

/**
 * 订单状态常量
 * order 表：PENDING_PAY(0)、PAID(1)、ORDER_COMPLETED(2)、ORDER_CANCELLED(3)
 * order_item 表：PENDING_PAY(0)、PAID(1)、SHIPPED(2)、COMPLETED(3)、CANCELLED(4)、REFUNDING(5)、REFUNDED(6)
 */
public class OrderStatus {

    /** 待付款（Order + OrderItem） */
    public static final Integer PENDING_PAY = 0;

    /** 已付款 / 待发货（Order + OrderItem） */
    public static final Integer PAID = 1;

    /** 待收货（OrderItem only） */
    public static final Integer SHIPPED = 2;

    /** 已完成（OrderItem only） */
    public static final Integer COMPLETED = 3;

    /** 已取消（OrderItem only） */
    public static final Integer CANCELLED = 4;

    /** 退款中（OrderItem only） */
    public static final Integer REFUNDING = 5;

    /** 已退款（OrderItem only） */
    public static final Integer REFUNDED = 6;

    // ====== Order 表专用常量（与 OrderItem 值不同） ======

    /** 已完成（Order only，值 2） */
    public static final Integer ORDER_COMPLETED = 2;

    /** 已取消（Order only，值 3） */
    public static final Integer ORDER_CANCELLED = 3;
}
