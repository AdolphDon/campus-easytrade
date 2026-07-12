package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.dto.AnnouncementEditDTO;
import com.campus.dto.AnnouncementPageQueryDTO;
import com.campus.entity.Announcement;
import com.campus.entity.User;
import com.campus.exception.BusinessException;
import com.campus.mapper.AnnouncementMapper;
import com.campus.mapper.UserMapper;
import com.campus.result.PageResult;
import com.campus.result.Result;
import com.campus.service.AnnouncementService;
import com.campus.vo.AnnouncementVO;
import com.campus.vo.CampusNewsVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

import static com.campus.constant.DeletedStatus.DELETED;
import static com.campus.constant.DeletedStatus.NOT_DELETED;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class AnnouncementServiceImpl implements AnnouncementService {

    private final AnnouncementMapper announcementMapper;
    private final UserMapper userMapper;

    /**
     * 用户端-平台公告与动态分页获取
     */
    @Transactional(readOnly = true)
    public PageResult<AnnouncementVO> getUserPage(AnnouncementPageQueryDTO dto, Integer type) {
        Page<Announcement> page = new Page<>(dto.getPageNum(), dto.getPageSize());

        LambdaQueryWrapper<Announcement> qw = Wrappers.lambdaQuery(Announcement.class);
        qw.eq(Announcement::getType, type)
                .eq(Announcement::getDeleted, NOT_DELETED)
                .orderByDesc(Announcement::getPublishTime);

        announcementMapper.selectPage(page, qw);

        List<AnnouncementVO> voList = new ArrayList<>();
        for (Announcement announcement : page.getRecords()) {
            AnnouncementVO vo = AnnouncementVO.builder()
                    .id(announcement.getId())
                    .publisher(announcement.getPublisher())
                    .content(announcement.getContent())
                    .publishTime(announcement.getPublishTime())
                    .build();
            voList.add(vo);
            }
        return PageResult.<AnnouncementVO>builder()
                .records(voList)
                .total(page.getTotal())
                .size(page.getSize())
                .current(page.getCurrent())
                .pages(page.getPages())
                .build();
    }

    /**
     * 管理端-平台动态与公告分页获取（支持类型+删除状态筛选）
     */
    @Transactional(readOnly = true)
    public PageResult<AnnouncementVO> getAdminPage(AnnouncementPageQueryDTO dto) {
        Page<Announcement> page = new Page<>(dto.getPageNum(), dto.getPageSize());

        LambdaQueryWrapper<Announcement> qw = Wrappers.lambdaQuery(Announcement.class);
        qw.eq(dto.getType() != null, Announcement::getType, dto.getType())
                .eq(dto.getDeleted() != null, Announcement::getDeleted, dto.getDeleted())
                .orderByDesc(Announcement::getPublishTime);

        announcementMapper.selectPage(page, qw);

        List<AnnouncementVO> voList = new ArrayList<>();
        List<Announcement> records = page.getRecords();

        //批量查询发布者用户名：一次性查完再用map取
        List<Long> publisherIds = records.stream().map(Announcement::getPublisherId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        Map<Long, String> publisherNameMap = new HashMap<>();
        if (!publisherIds.isEmpty()) {
            List<User> userList = userMapper.selectList(
                    new LambdaQueryWrapper<User>()
                            .in(User::getId, publisherIds)
                            .select(User::getId, User::getUsername)
            );
            publisherNameMap = userList.stream().collect(
                    Collectors.toMap(User::getId, User::getUsername, (a, b) -> a));
        }

        for (Announcement announcement : records) {
            AnnouncementVO vo = AnnouncementVO.builder()
                    .id(announcement.getId())
                    .publisher(announcement.getPublisher())
                    .content(announcement.getContent())
                    .type(announcement.getType())
                    .updateTime(announcement.getUpdateTime())
                    .deleted(announcement.getDeleted())
                    .build();

                if (announcement.getPublisherId() != null) {
                    vo.setPublisherUserName(publisherNameMap.get(announcement.getPublisherId()));
                }

            voList.add(vo);
        }

        return PageResult.<AnnouncementVO>builder()
                .records(voList)
                .total(page.getTotal())
                .size(page.getSize())
                .current(page.getCurrent())
                .pages(page.getPages())
                .build();
    }

    /**
     * 发布平台公告/动态
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"announcementList", "platformDynamic"}, allEntries = true)
    public void publishAnnouncement(AnnouncementEditDTO dto) {
        Long userId = getCurrentUserId();
        Announcement announcement = Announcement.builder()
                .publisher(dto.getPublisher())
                .publisherId(userId)
                .content(dto.getContent())
                .type(dto.getType())
                .deleted(NOT_DELETED)
                .build();
        announcementMapper.insert(announcement);
    }

    /**
     * 编辑平台公告/动态
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"announcementList", "platformDynamic"}, allEntries = true)
    public void updateAnnouncement(Long id, AnnouncementEditDTO dto) {
        Announcement announcement = Announcement.builder()
                .id(id)
                .publisher(dto.getPublisher())
                .content(dto.getContent())
                .type(dto.getType())
                .build();
        announcementMapper.updateById(announcement);
    }

    /**
     * 删除平台公告/动态(逻辑删除)
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"announcementList", "platformDynamic"}, allEntries = true)
    public void deleteAnnouncement(Long id) {
        Announcement announcement = announcementMapper.selectById(id);
        if (announcement == null) {
            throw new BusinessException("该公告/动态不存在，无法删除");
        }
        //逻辑删除：只把deleted改为1
        Announcement updateAnnouncement = Announcement.builder()
                .id(id)
                .deleted(DELETED)
                .build();
        announcementMapper.updateById(updateAnnouncement);
    }

    /**
     * 恢复已删除平台公告/动态
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"announcementList", "platformDynamic"}, allEntries = true)
    public void restoreAnnouncement(Long id) {
        Announcement announcement = announcementMapper.selectById(id);
        if (announcement == null) {
            throw new BusinessException("该公告/动态不存在");
        }
        //判断是否已经是未删除状态
        if (announcement.getDeleted() == NOT_DELETED) {
            throw new BusinessException("该公告/动态无需恢复");
        }

        Announcement updateAnnouncement = Announcement.builder()
                .id(id)
                .deleted(NOT_DELETED)
                .build();
        announcementMapper.updateById(updateAnnouncement);
    }
}
