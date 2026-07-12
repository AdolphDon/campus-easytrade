package com.campus.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

/**
 *
 * 禁用操作记录表
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("user_ban_record")//告诉MyBatis-Plus这个实体类对应数据库哪张表
public class UserBanRecord {
    //标记主键字段，并且指定主键生成策略为主键自增
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;//被禁用用户ID
    private Integer banDays;//禁用天数 0=永久
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private LocalDateTime unbanTime;//自动解封时间
    private String banReason;//禁用原因
    private Long adminId;//管理员ID
    private LocalDateTime createTime;
}
