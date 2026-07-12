package com.campus.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 用户宿舍楼修改次数记录实体类
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("user_dormitory_update")
public class UserDormitoryUpdate {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;//用户ID
    private Long schoolId;//学校ID
    private Long dormitoryId;//被修改的宿舍楼ID
}
