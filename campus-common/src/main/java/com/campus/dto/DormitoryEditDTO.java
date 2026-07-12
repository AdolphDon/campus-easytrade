package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 用户添加修改当前绑定学校宿舍楼-通用
 */
@Data
public class DormitoryEditDTO {

    @NotBlank(message = "宿舍楼名称不能为空")
    private String name;

    @NotNull(message = "纬度不能为空")
    private BigDecimal latitude;

    @NotNull(message = "经度不能为空")
    private BigDecimal longitude;
}
