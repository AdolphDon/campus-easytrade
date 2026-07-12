package com.campus.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.entity.EmailVerification;
import org.apache.ibatis.annotations.Mapper;
import org.springframework.stereotype.Repository;
//BaseMapper自动提供curd功能
@Mapper
public interface EmailVerificationMapper extends BaseMapper<EmailVerification> {
}
