package com.campus.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.dto.CampusNewsEditDTO;
import com.campus.dto.CampusNewsPageQueryDTO;
import com.campus.entity.User;
import com.campus.mapper.UserMapper;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.CampusNewsService;
import com.campus.vo.CampusNewsVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Api(tags = "校园资讯接口")
@RestController
@RequestMapping("/user/campusNews")
@RequiredArgsConstructor//Lombok注解:替代@Autowired
public class CampusNewsController {

    private final CampusNewsService campusNewsService;
    private final UserMapper userMapper;

    /**
     * 统一分页查询资讯：用户端、管理端共用
     */
    @GetMapping("/page")
    @ApiOperation("分页查询校园资讯（用户端/管理端共用）")
    public Result<PageResult<CampusNewsVO>> pageQuery(CampusNewsPageQueryDTO dto) {
        Long userId = getCurrentUserId();
        Integer role = userMapper.selectOne(Wrappers.lambdaQuery(User.class)
                .select(User::getRole)
                .eq(User::getId, userId)).getRole();
        PageResult<CampusNewsVO> pageResult = campusNewsService.pageQuery(dto,role);
        return Result.success(pageResult);
    }

    /**
     * 发布校园资讯
     */
    @PostMapping("/publish")
    @ApiOperation("发布校园资讯")
    public Result publishNews(@Validated @RequestBody CampusNewsEditDTO dto) {
        campusNewsService.publishNews(dto);
        return Result.success();
    }

    /**
     * 编辑校园资讯
     */
    @PutMapping("/update/{id}")
    @ApiOperation("编辑校园资讯")
    public Result updateNews(@Validated @RequestBody CampusNewsEditDTO dto, @PathVariable Long id) {
        campusNewsService.updateNews(id, dto);
        return Result.success();
    }

    /**
     * 删除校园资讯(逻辑删除)
     */
    @PutMapping("/delete/{id}")
    @ApiOperation("逻辑删除校园资讯")
    public Result deleteNews(@PathVariable Long id) {
        campusNewsService.deleteNews(id);
        return Result.success();
    }

    /**
     * 恢复已删除校园资讯
     */
    @PutMapping("/restore/{id}")
    @ApiOperation("恢复已删除校园资讯")
    public Result restoreNews(@PathVariable Long id) {
        campusNewsService.restoreNews(id);
        return Result.success();
    }

    /**
     * 启用校园资讯
     */
    @PutMapping("/enable/{id}")
    @ApiOperation("启用校园资讯")
    public Result enableNews(@PathVariable Long id) {
        campusNewsService.enableNews(id);
        return Result.success();
    }

    /**
     * 禁用校园资讯
     */
    @PutMapping("/disable/{id}")
    @ApiOperation("禁用校园资讯")
    public Result disableNews(@PathVariable Long id) {
        campusNewsService.disableNews(id);
        return Result.success();
    }
}