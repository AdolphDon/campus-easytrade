package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * 用户添加修改地址簿通用
 */
@Data
public class AddressBookEditDTO {

    @NotNull(message = "宿舍楼不能为空")
    private Long dormitoryId;

    @NotBlank(message = "详细地址不能为空")
    private String detailAddress;

    @NotBlank(message = "联系人姓名不能为空")
    private String name;//联系人姓名

    @NotBlank(message = "联系电话不能为空")
    private String phone;//联系电话

    private String universityAddress;//大学完整地址
}
