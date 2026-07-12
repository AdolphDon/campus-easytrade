package com.campus.service;

import com.campus.dto.UniversityConfirmDTO;
import com.campus.entity.University;
import com.campus.vo.DormitoryVO;
import com.campus.vo.UserSchoolVO;

import javax.validation.Valid;
import java.util.List;

public interface MapService {

    /**
     * 确认/保存大学（按名称去重，已存在则直接返回）
     * @param dto
     * @return 大学信息
     */
    University confirmUniversity(@Valid UniversityConfirmDTO dto);

    /**
     * 获取当前用户绑定的学校信息
     * @return 学校VO（含经纬度），未绑定时返回 null
     */
    UserSchoolVO getUserSchool();
}
