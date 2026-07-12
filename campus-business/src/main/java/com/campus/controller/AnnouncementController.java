package com.campus.controller;

import com.campus.dto.AnnouncementEditDTO;
import com.campus.dto.AnnouncementPageQueryDTO;
import com.campus.entity.Announcement;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.AnnouncementService;
import com.campus.vo.AnnouncementVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@Api(tags = "平台公告与平台动态接口")
@RestController
@RequestMapping("/user/announcement")
@RequiredArgsConstructor//Lombok注解:替代@Autowired
public class AnnouncementController {

    private final AnnouncementService announcementService;

    /**
     * 用户端-平台公告分页获取
     */
    @GetMapping("/notice/page")
    @ApiOperation("用户端-分页查询平台公告")
    @Cacheable(
            value = "announcementList",
            key = "'user_page:_' + #dto.getPageNum() + '_' + #dto.getPageSize() + '_1'",
            sync = true)
    public Result<PageResult<AnnouncementVO>> noticePage(AnnouncementPageQueryDTO dto) {
        PageResult<AnnouncementVO> pageResult = announcementService.getUserPage(dto, 1);
        return Result.success(pageResult);
    }

    /**
     * 用户端-平台动态分页获取
     */
    @GetMapping("/dynamic/page")
    @ApiOperation("用户端-分页查询平台动态")
    @Cacheable(
            value = "platformDynamic",
            key = "#dto.toString()",
            sync = true)
    public Result<PageResult<AnnouncementVO>> dynamicPage(AnnouncementPageQueryDTO dto) {
        PageResult<AnnouncementVO> pageResult = announcementService.getUserPage(dto, 2);
        return Result.success(pageResult);
    }

    /**
     * 管理端-平台动态与公告分页获取（支持类型+删除状态筛选）
     */
    @GetMapping("/admin/page")
    @ApiOperation("管理端-分页查询公告与动态")
    @Cacheable(value = "announcementList",
               key = "'admin_page:_' + #dto.getPageNum() + '_' + #dto.getPageSize() + '_' + #dto.getType() + '_' + #dto.getDeleted()",
               sync = true)
    public Result<PageResult<AnnouncementVO>> adminPage(AnnouncementPageQueryDTO dto) {
        PageResult<AnnouncementVO> pageResult = announcementService.getAdminPage(dto);
        return Result.success(pageResult);
    }

    /**
     * 发布平台公告/动态
     */
    @PostMapping("/publish")
    @ApiOperation("发布平台公告/动态")
    public Result publishAnnouncement(@Validated @RequestBody AnnouncementEditDTO dto) {
        announcementService.publishAnnouncement(dto);
        return Result.success();
    }

    /**
     * 编辑平台公告/动态
     */
    @PutMapping("/update/{id}")
    @ApiOperation("编辑平台公告/动态")
    public Result updateAnnouncement(@Validated @RequestBody AnnouncementEditDTO dto, @PathVariable Long id) {
        announcementService.updateAnnouncement(id, dto);
        return Result.success();
    }

    /**
     * 删除平台公告/动态(逻辑删除)
     */
    @PutMapping("/delete/{id}")
    @ApiOperation("逻辑删除平台公告/动态")
    public Result deleteAnnouncement(@PathVariable Long id) {
        announcementService.deleteAnnouncement(id);
        return Result.success();
    }

    /**
     * 恢复已删除平台公告/动态
     */
    @PutMapping("/restore/{id}")
    @ApiOperation("恢复已删除公告/动态")
    public Result restoreAnnouncement(@PathVariable Long id) {
        announcementService.restoreAnnouncement(id);
        return Result.success();
    }
}
