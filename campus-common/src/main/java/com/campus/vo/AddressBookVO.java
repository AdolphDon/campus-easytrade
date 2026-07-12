package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 当前用户绑定学校的地址簿列表响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddressBookVO {

    private Long id;
    private Long schoolId;//关联学校id
    private String schoolName;//学校名字
    private Long dormitoryId;//关联宿舍id
    private String dormitoryName;//宿舍楼名字
    private String detailAddress;//详细地址描述
    private String name;//联系人姓名
    private String phone;//联系电话
    private String universityAddress;//大学完整地址
    private String province;//大学所在省份
    private String city;//大学所在城市
    private String district;//大学所在区县
    private BigDecimal latitude;//宿舍楼经度
    private BigDecimal longitude;//宿舍楼纬度
    private Integer isDefault;//是否为默认地址
}
