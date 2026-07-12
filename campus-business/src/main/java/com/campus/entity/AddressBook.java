package com.campus.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 用户在绑定学校下的地址簿实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("address_book")
public class AddressBook {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;//用户id
    private Long schoolId;//关联学校id
    private Long dormitoryId;//关联宿舍楼id
    private String detailAddress;//详细地址描述
    private BigDecimal latitude;//宿舍楼位置的经度
    private String name;//联系人姓名
    private String phone;//联系电话
    private String universityAddress;//大学完整地址
    private BigDecimal longitude;//宿舍楼位置的纬度
    private LocalDateTime createTime;//创建时间
    private Integer isDefault;//是否为默认地址
}
