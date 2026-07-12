package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.dto.CampusNewsEditDTO;
import com.campus.dto.CampusNewsPageQueryDTO;
import com.campus.entity.CampusNews;
import com.campus.entity.NewsCategory;
import com.campus.entity.User;
import com.campus.constant.Role;
import com.campus.exception.BusinessException;
import com.campus.mapper.CampusNewsMapper;
import com.campus.mapper.CategoryMapper;
import com.campus.mapper.NewsCategoryMapper;
import com.campus.mapper.UserMapper;
import com.campus.result.PageResult;
import com.campus.service.CampusNewsService;
import com.campus.vo.CampusNewsVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

import static com.campus.constant.CampusNewsStatus.newsDISABLE;
import static com.campus.constant.CampusNewsStatus.newsENABLE;
import static com.campus.constant.DeletedStatus.DELETED;
import static com.campus.constant.DeletedStatus.NOT_DELETED;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class CampusNewsServiceImpl implements CampusNewsService {

    private final CampusNewsMapper campusNewsMapper;
    private final UserMapper userMapper;
    private final NewsCategoryMapper newsCategoryMapper;

    /**
     * 统一分页查询资讯：用户端、管理端共用
     * @param dto
     * @return
     */
    @Cacheable(
            value = "campusNewsList",
            key = "'page:_' + #dto.getPageNum() + '_' + #dto.getPageSize() + '_' + #dto.getKeyword() + '_' + #dto.getCategoryId() + '_' + #dto.getStatus() + '_' + #dto.getDeleted() + '_role:' + #role",
            sync = true)
    @Transactional(readOnly = true)
    public PageResult<CampusNewsVO> pageQuery(CampusNewsPageQueryDTO dto,Integer role) {
        Page<CampusNews> page = new Page<>(dto.getPageNum(), dto.getPageSize());

        LambdaQueryWrapper<CampusNews> qw = Wrappers.lambdaQuery(CampusNews.class);
        qw.like(StringUtils.hasText(dto.getKeyword()), CampusNews::getTitle, dto.getKeyword())
                .eq(dto.getCategoryId() != null, CampusNews::getCategoryId, dto.getCategoryId())
                .eq(CampusNews::getStatus, dto.getStatus())
                .eq(CampusNews::getDeleted, dto.getDeleted())
                .orderByDesc(CampusNews::getCreateTime);
        campusNewsMapper.selectPage(page, qw);

        //判断当前账号是否为管理员来给vo赋私密值-管理员role为0
        boolean isAdmin = false;
        if (role == Role.ADMIN) { isAdmin = true;}

        List<CampusNewsVO> voList = new ArrayList<>();
        List<CampusNews> records = page.getRecords();

        //管理员才查敏感字段
        Map<Long, String> categoryNameMap = new HashMap<>();
        Map<Long, String> publisherNameMap = new HashMap<>();
        if (isAdmin) {
            //批量查询分类名称：从一堆新闻里，把所有分类ID抽出来→去掉null→去掉重复→ 最后变成一个干净的ID列表
            List<Long> categoryIds = records.stream().map(CampusNews::getCategoryId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
            if (!categoryIds.isEmpty()) {
                List<NewsCategory> catList = newsCategoryMapper.selectList(
                        new LambdaQueryWrapper<NewsCategory>()
                                .in(NewsCategory::getId, categoryIds)
                                .select(NewsCategory::getId, NewsCategory::getName)
                );
                categoryNameMap = catList.stream().collect(
                        Collectors.toMap(NewsCategory::getId, NewsCategory::getName, (a, b) -> a));
            }

            //批量查询发布者用户名：一次性查完再用map取
            List<Long> publisherIds = records.stream().map(CampusNews::getPublisherId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
            if (!publisherIds.isEmpty()) {
                List<User> userList = userMapper.selectList(
                        new LambdaQueryWrapper<User>()
                                .in(User::getId, publisherIds)
                                .select(User::getId, User::getUsername)
                );
                publisherNameMap = userList.stream().collect(
                        Collectors.toMap(User::getId, User::getUsername, (a, b) -> a));
            }
        }

        for (CampusNews news : records) {
            CampusNewsVO vo = CampusNewsVO.builder()
                    .id(news.getId())
                    .title(news.getTitle())
                    .content(news.getContent())
                    .coverImage(news.getCoverImage())
                    .publisherName(news.getPublisherName())
                    .categoryId(news.getCategoryId())
                    .createTime(news.getCreateTime())
                    .build();

            //管理员才返回敏感字段
            if (isAdmin) {
                vo.setCategoryName(categoryNameMap.getOrDefault(news.getCategoryId(), ""));
                vo.setPublisherUserName(publisherNameMap.getOrDefault(news.getPublisherId(), ""));
                vo.setStatus(news.getStatus());
                vo.setDeleted(news.getDeleted());
            }
            voList.add(vo);
        }

        return PageResult.<CampusNewsVO>builder()
                .records(voList)
                .total(page.getTotal())
                .size(page.getSize())
                .current(page.getCurrent())
                .pages(page.getPages())
                .build();
    }

    /**
     * 发布校园资讯
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "campusNewsList", allEntries = true)
    public void publishNews(CampusNewsEditDTO dto) {

        Long UserId = getCurrentUserId();
        CampusNews news = CampusNews.builder()
                .title(dto.getTitle())
                .content(dto.getContent())
                .coverImage(dto.getCoverImage())
                .categoryId(dto.getCategoryId())
                .publisherId(UserId)
                .publisherName(dto.getPublisherName())
                .status(newsENABLE)
                .deleted(NOT_DELETED)
                .build();
        campusNewsMapper.insert(news);
    }

    /**
     * 编辑校园资讯
     * @param id
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "campusNewsList", allEntries = true)
    public void updateNews(Long id, CampusNewsEditDTO dto) {
        CampusNews news = campusNewsMapper.selectById(id);

        if (news == null) {
            throw new BusinessException("该资讯不存在");
        }
        CampusNews updateNews = CampusNews.builder()
                .id(id)
                .title(dto.getTitle())
                .content(dto.getContent())
                .coverImage(dto.getCoverImage())
                .categoryId(dto.getCategoryId())
                .publisherName(dto.getPublisherName())
                .build();

        campusNewsMapper.updateById(updateNews);
    }

    /**
     * 删除校园资讯
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "campusNewsList", allEntries = true)
    public void deleteNews(Long id) {
        CampusNews news = campusNewsMapper.selectById(id);
        if (news == null) {
            throw new BusinessException("该资讯不存在，无法删除");
        }
        //逻辑删除：只把deleted改为1
        CampusNews updateNews = CampusNews.builder()
                .id(id)
                .deleted(DELETED)
                .build();
        campusNewsMapper.updateById(updateNews);
    }

    /**
     * 恢复已删除校园资讯
     * @param id 资讯ID
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "campusNewsList", allEntries = true)
    public void restoreNews(Long id) {
        CampusNews news = campusNewsMapper.selectById(id);
        if (news == null) {
            throw new BusinessException("该资讯不存在");
        }
        //判断是否已经是未删除状态
        if (news.getDeleted() == NOT_DELETED) {
            throw new BusinessException("该资讯无需恢复");
        }

        CampusNews updateNews = CampusNews.builder()
                .id(id)
                .deleted(NOT_DELETED)
                .build();
        campusNewsMapper.updateById(updateNews);
    }

    /**
     * 启用校园资讯
     * @param id 资讯ID
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "campusNewsList", allEntries = true)
    public void enableNews(Long id) {
        CampusNews news = campusNewsMapper.selectById(id);
        if (news == null) {
            throw new BusinessException("该资讯不存在");
        }

        //判断是否已经是启用状态
        if (news.getStatus() == newsENABLE) {
            throw new BusinessException("该资讯已启用，无需重复操作");
        }

        CampusNews updateNews = CampusNews.builder()
                .id(id)
                .status(newsENABLE)
                .build();
        campusNewsMapper.updateById(updateNews);
    }

    /**
     * 禁用校园资讯
     * @param id 资讯ID
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "campusNewsList", allEntries = true)
    public void disableNews(Long id) {
        CampusNews news = campusNewsMapper.selectById(id);
        if (news == null) {
            throw new BusinessException("该资讯不存在");
        }

        if (news.getStatus() == newsDISABLE) {
            throw new BusinessException("该资讯已禁用，无需重复操作");
        }

        CampusNews updateNews = CampusNews.builder()
                .id(id)
                .status(newsDISABLE)
                .build();
        campusNewsMapper.updateById(updateNews);
    }
}
