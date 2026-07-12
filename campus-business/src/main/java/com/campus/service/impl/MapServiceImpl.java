package com.campus.service.impl;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.campus.dto.UniversityConfirmDTO;
import com.campus.entity.University;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.campus.entity.Dormitory;
import com.campus.entity.User;
import com.campus.mapper.DormitoryMapper;
import com.campus.mapper.UniversityMapper;
import com.campus.mapper.UserMapper;
import com.campus.service.MapService;
import com.campus.vo.DormitoryVO;
import com.campus.vo.UserSchoolVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

import static com.campus.constant.UniversityStatus.universityENABLE;

@Slf4j
@Service
@RequiredArgsConstructor
public class MapServiceImpl implements MapService {

    private final UniversityMapper universityMapper;
    private final DormitoryMapper dormitoryMapper;
    private final UserMapper userMapper;

    /**
     * 保存or添加大学(按名称去重),同时将当前用户schoolId绑定到该大学
     * @param dto
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "userSchool", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public University confirmUniversity(UniversityConfirmDTO dto) {
        //查用户当前定位学校在数据库中是否已存在
        University university = universityMapper.selectOne(
                new LambdaQueryWrapper<University>()
                        .eq(University::getName, dto.getName())
        );

        if (university == null) {
            //不存在则插入新记录
            university = University.builder()
                    .name(dto.getName())
                    .province(dto.getProvince())
                    .city(dto.getCity())
                    .district(dto.getDistrict())
                    .latitude(dto.getLatitude())
                    .longitude(dto.getLongitude())
                    .radius(dto.getRadius())
                    .status(universityENABLE)
                    .build();
            universityMapper.insert(university);
        }

        //处理用户学校绑定/换绑
        User user = userMapper.selectById(getCurrentUserId());
        if (user != null) {
            if (user.getSchoolId() == null) {
                //①未绑定学校 → 直接绑定
                userMapper.update(null, new LambdaUpdateWrapper<User>()
                        .eq(User::getId, getCurrentUserId())
                        .set(User::getSchoolId, university.getId())
                );
            } else if (!user.getSchoolId().equals(university.getId())) {
                //②已绑定其他学校 → 换绑
                userMapper.update(null, new LambdaUpdateWrapper<User>()
                        .eq(User::getId, getCurrentUserId())
                        .set(User::getSchoolId, university.getId())
                );
            }
        }

        return university;
    }

    /**
     * 获取当前用户绑定的学校信息(含经纬度)
     * @return
     */
    @Transactional(readOnly = true)
    public UserSchoolVO getUserSchool() {
        User user = userMapper.selectById(getCurrentUserId());
        if (user == null || user.getSchoolId() == null) {
            return null;
        }
        University university = universityMapper.selectById(user.getSchoolId());
        if (university == null) {
            return null;
        }
        return UserSchoolVO.builder()
                .id(university.getId())
                .name(university.getName())
                .latitude(university.getLatitude())
                .longitude(university.getLongitude())
                .radius(university.getRadius())
                .build();
    }
}
