package com.campus.controller;

import com.campus.dto.UniversityConfirmDTO;
import com.campus.entity.University;
import com.campus.result.Result;
import com.campus.service.MapService;
import com.campus.vo.DormitoryVO;
import com.campus.vo.UserSchoolVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@Slf4j
@Api(tags = "校园虚拟跳蚤市场地图接口")
@RestController
@RequestMapping("/user/map")
@RequiredArgsConstructor
public class MapController {

    private final MapService mapService;

    /**
     * 保存or添加大学(按名称去重)
     */
    @PostMapping("/university/confirm")
    @ApiOperation("保存/添加大学（按名称去重）")
    public Result<University> confirmUniversity(@Valid @RequestBody UniversityConfirmDTO dto) {
        University university = mapService.confirmUniversity(dto);
        return Result.success(university);
    }

    /**
     * 获取当前用户绑定的学校信息(含经纬度)
     */
    @GetMapping("/user/school")
    @ApiOperation("获取当前用户绑定的学校信息（含经纬度）")
    @Cacheable(
            value = "userSchool",
            key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()",
            sync = true)
    public Result<UserSchoolVO> getUserSchool() {
        UserSchoolVO vo = mapService.getUserSchool();
        return Result.success(vo);
    }
}
