package com.campus.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 用户确认大学(保存添加)
 */
@Data
public class UniversityConfirmDTO {

    @NotBlank(message = "大学名称不能为空")
    private String name;//大学名称

    @NotBlank(message = "省份不能为空")
    private String province;//所在省份

    @NotBlank(message = "城市不能为空")
    private String city;//所在城市

    @NotBlank(message = "区县不能为空")
    private String district;//所在区县

    @NotNull(message = "纬度不能为空")
    private BigDecimal latitude;//中心纬度

    @NotNull(message = "经度不能为空")
    private BigDecimal longitude;//中心经度

    private Integer radius = 500;//校园围栏半径（默认500米）
}
