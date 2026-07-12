package com.campus.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 修改用户个人信息
 */
@Data
public class UserUpdateDTO {

    private String nickname;//昵称
    private String avatar;//头像
    private String background;//背景图
    private String location;//所属地
    private String intro;//个人简介
    private Integer gender;//性别 1男2女3未知
    private LocalDate birthday;//生日
    private String username;//用户名
}
