package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 用户端违规商品申诉详情
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoodsAppealVO {
    private String appealContent;//申诉内容
    private String auditAdmin;//审核人：工号+auditAdminId
    //如果为申诉处理中则前端只显示申诉内容和申诉处理中
    private String appealStatus;//申诉状态：0=申诉处理中，1=已完成申诉
    private String auditReason;//申诉结果
    private Integer appealStatuss;//申诉状态 0待审查 1已完成
}
