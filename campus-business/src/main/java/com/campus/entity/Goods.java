package com.campus.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 商品信息实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("goods")
public class Goods {

    //标记主键字段，并且指定主键生成策略为主键自增
    @TableId(type = IdType.AUTO)
    private Long id;

    //发布者ID(卖家)
    private Long userId;

    //分类ID
    private Long categoryId;

    //所属学校ID
    private Long schoolId;

    //交易方式 1-卖家上门 2-买家自提 3-自行协商
    private Integer transactionType;

    //地址簿ID(买家自提时使用)
    private Long addressId;

    //商品名称
    private String name;

    //商品详细描述
    private String description;
    //商品价格
    private BigDecimal price;
    //商品库存
    private Integer stock;
    //收藏量
    private Integer collectCount;
    //上架状态 0-下架 1-上架
    private Integer shelfStatus;
    //审核状态 1-审核通过 0-待系统审核  -1-待人工审核 -2-待申诉审核 -3-系统拦截 -4-人工拦截
    private Integer auditStatus;
    //售卖状态 0-待出售 1-已售出
    private Integer saleStatus;
    //售出时间（用于计算2小时展示窗口）
    private LocalDateTime soldTime;
    //申诉次数
    private Integer appealCount;
    //风险等级 0低风险 1中风险 2高风险
    private Integer risk;
    //审核通过标记 0从未审核通过 1已至少通过一次
    private Integer hasApproved;
    //商品上架时间
    private LocalDateTime createTime;
    //逻辑删除：0未删除1已经删除
    private Integer deleted;
}