package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 用户信息响应（通用个人中心展示用）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserInfoVO {

        //通用个人中心展示
        private Long userId;
        private String username;//用户名
        private String nickname;//昵称
        private String email;//邮箱
        private String avatar;//头像
        private String background;//背景图
        private String location;//所属地
        private String intro;//个人简介
        private Integer gender;//性别 1男2女3未知
        private LocalDate birthday;//生日
        //用户页面右侧展示
        private Integer creditScore;//信誉分
        private BigDecimal balance;//可用余额
        private BigDecimal frozenBalance;//冻结金额
        //状态检测
        private Integer status;//状态：0=禁用，1=正常
        private Integer deleted;//0未删除1已经删除
}