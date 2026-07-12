package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.entity.CampusNews;
import com.campus.entity.Category;
import com.campus.entity.Goods;
import com.campus.entity.NewsCategory;
import com.campus.mapper.CampusNewsMapper;
import com.campus.mapper.CategoryMapper;
import com.campus.mapper.GoodsMapper;
import com.campus.mapper.NewsCategoryMapper;
import com.campus.service.CategoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static com.baomidou.mybatisplus.extension.toolkit.Db.save;
import static com.campus.constant.CategoryStatus.*;
import static com.campus.constant.DeletedStatus.DELETED;
import static com.campus.constant.DeletedStatus.NOT_DELETED;

@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class CategoryServiceImpl implements CategoryService {

    private final CategoryMapper categoryMapper;
    private final GoodsMapper goodsMapper;
    private final NewsCategoryMapper newsCategoryMapper;
    private final CampusNewsMapper campusNewsMapper;

    /**
     * 获取所有可用的商品分类
     * @return
     */
    @Transactional(readOnly = true)
    public List<Category> getCategoryList() {
        LambdaQueryWrapper<Category> wrapper = Wrappers.lambdaQuery(Category.class);
        wrapper.eq(Category::getStatus, categoryENABLE)
                .eq(Category::getDeleted, NOT_DELETED)
                .orderByAsc(Category::getSort);

        List<Category> categoryList = categoryMapper.selectList(wrapper);
        return categoryList;
    }

    /**
     * 查询【禁用or已删除】的商品分类
     * @return
     */
    @Transactional(readOnly = true)
    public List<Category> getDisabledOrDeletedList() {
        LambdaQueryWrapper<Category> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Category::getStatus, categoryDISABLE)
                .or()
                .eq(Category::getDeleted, DELETED)
                .orderByAsc(Category::getSort);

        List<Category> categoryList = categoryMapper.selectList(wrapper);
        return categoryList;
    }

    /**
     * 商品分类排序
     * @param id
     * @param newSort
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "categoryList", allEntries = true)
    })
    public void sortCategory(Long id, Integer newSort) {
        //获取当前分类原有排序
        Category category = categoryMapper.selectById(id);
        if (category == null) {
            return;
        }
        Integer oldSort = category.getSort();
        //位置没变直接返回
        if (oldSort.equals(newSort)) {
            return;
        }

        //只处理未删除的分类
        LambdaUpdateWrapper<Category> wrapper = Wrappers.lambdaUpdate();
        wrapper.eq(Category::getDeleted, NOT_DELETED);

        //往上调：newSort<oldSort区间 [newSort, oldSort-1] 全部+1
        if (newSort < oldSort) {
            wrapper.ge(Category::getSort, newSort)
                    .le(Category::getSort, oldSort - 1)
                    .setSql("sort = sort + 1");
        } else {
            //往下调：newSort>oldSort区间 [oldSort+1, newSort] 全部-1
            wrapper.ge(Category::getSort, oldSort + 1)
                    .le(Category::getSort, newSort)
                    .setSql("sort = sort - 1");
        }
        categoryMapper.update(null, wrapper);

        Category update = new Category();
        update.setId(id);
        update.setSort(newSort);
        categoryMapper.updateById(update);
    }

    /**
     * 编辑商品分类
     * @param category
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "categoryList", allEntries = true)
    })
    public void updateCategory(Category category) {
        LambdaUpdateWrapper<Category> wrapper = Wrappers.lambdaUpdate(Category.class);
        wrapper.eq(Category::getId, category.getId())
                .set(Category::getName, category.getName());
        categoryMapper.update(null, wrapper);
    }

    /**
     * 新增商品分类
     * @param category
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "categoryList", allEntries = true)})
    public boolean addCategory(Category category) {
        //查出当前最大排序值
        Integer maxSort = categoryMapper.selectMaxSort();
        //自动往后排
        category.setSort(maxSort + 1);
        category.setStatus(categoryENABLE);
        category.setDeleted(NOT_DELETED);
        log.info("新增分类: name={}, sort={}, status={}, deleted={}",
                category.getName(), category.getSort(), category.getStatus(), category.getDeleted());
        return categoryMapper.insertCategory(category) > 0;
    }

    /**
     * 删除分类（有关联商品→禁用，无关联商品→逻辑删除）
     * @param id
     * @return "disabled" 或 "deleted"
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "categoryList", allEntries = true)})
    public String deleteCategory(Long id) {
        //查询该分类下有没有商品
        LambdaQueryWrapper<Goods> queryWrapper = Wrappers.lambdaQuery(Goods.class);
        queryWrapper.eq(Goods::getCategoryId, id);

        Long count = goodsMapper.selectCount(queryWrapper);

        //有商品→禁用-不能删除
        if (count > 0) {
            Category category = new Category().builder().id(id).status(categoryDISABLE).build();
            categoryMapper.updateById(category);
            return "disabled";
        } else {
            //无商品→逻辑删除
            Category category = new Category().builder().id(id).status(categoryDISABLE).deleted(DELETED).build();
            categoryMapper.updateById(category);//逻辑删除
            return "deleted";
        }
    }

    /**
     * 启用分类
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "categoryList", allEntries = true)
    })
    public void enableCategory(Long id) {
        LambdaUpdateWrapper<Category> wrapper = Wrappers.lambdaUpdate(Category.class);
        wrapper.eq(Category::getId, id)
                .eq(Category::getDeleted, NOT_DELETED)//未删除
                .eq(Category::getStatus, categoryDISABLE);//禁用状态才能启用

        //设置为启用状态
        wrapper.set(Category::getStatus, categoryENABLE);
        categoryMapper.update(null, wrapper);
    }

    /**
     * 禁用分类
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "categoryList", allEntries = true)
    })
    public void disableCategory(Long id) {
        LambdaUpdateWrapper<Category> wrapper = Wrappers.lambdaUpdate(Category.class);
        wrapper.eq(Category::getId, id)
                .eq(Category::getStatus, categoryENABLE);//启用状态才能禁用

        //设置为禁用状态
        wrapper.set(Category::getStatus, categoryDISABLE);
        categoryMapper.update(null, wrapper);
    }

    /**
     * 恢复分类
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "goodsList", allEntries = true),
            @CacheEvict(value = "categoryList", allEntries = true)})
    public void restoreCategory(Long id) {
        LambdaUpdateWrapper<Category> wrapper = Wrappers.lambdaUpdate(Category.class);
        wrapper.eq(Category::getId, id)
                .eq(Category::getDeleted, DELETED)//已删除状态才能恢复
                .set(Category::getDeleted, NOT_DELETED);
        categoryMapper.update(wrapper);
    }

    //====================== 校园资讯分类 业务逻辑 ======================

    /**
     * 获取所有可用的校园资讯分类
     */
    @Transactional(readOnly = true)
    public List<NewsCategory> getNewsCategoryList() {
        LambdaQueryWrapper<NewsCategory> wrapper = Wrappers.lambdaQuery(NewsCategory.class);
        wrapper.eq(NewsCategory::getStatus, newscategoryENABLE)
                .eq(NewsCategory::getDeleted, NOT_DELETED)
                .orderByAsc(NewsCategory::getSort);
        return newsCategoryMapper.selectList(wrapper);
    }

    /**
     * 查询【禁用or已删除】的商品分类
     * @return
     */
    @Transactional(readOnly = true)
    public List<NewsCategory> getDisabledOrDeletedNewsList() {
        LambdaQueryWrapper<NewsCategory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NewsCategory::getStatus, newscategoryDISABLE)
                .or()
                .eq(NewsCategory::getDeleted, DELETED)
                .orderByAsc(NewsCategory::getSort);

        List<NewsCategory> newsCategoryList = newsCategoryMapper.selectList(wrapper);
        return newsCategoryList;
    }

    /**
     * 资讯分类排序
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "newsCategoryList", allEntries = true),
            @CacheEvict(value = "campusNewsList", allEntries = true)  // 这里修复！
    })
    public void updateNewsCategorySort(Long id, Integer newSort) {
        //获取当前要移动的分类
        NewsCategory current = newsCategoryMapper.selectById(id);
        if (current == null) return;

        Integer oldSort = current.getSort();

        //如果位置没变，直接跳过
        if (oldSort.equals(newSort)) return;

        //自动挤位
        LambdaUpdateWrapper<NewsCategory> wrapper = Wrappers.lambdaUpdate();
        wrapper.eq(NewsCategory::getDeleted, NOT_DELETED);

        if (newSort < oldSort) {
            //往上调（8 → 2）：大于等于2~小于等于7的全部+1
            wrapper.ge(NewsCategory::getSort, newSort)
                    .le(NewsCategory::getSort, oldSort - 1)
                    .setSql("sort = sort + 1");
        } else {
            //往下调（2 → 8）：大于等于3~小于等于8的全部-1
            wrapper.le(NewsCategory::getSort, newSort)
                    .ge(NewsCategory::getSort, oldSort + 1)
                    .setSql("sort = sort - 1");
        }

        newsCategoryMapper.update(null, wrapper);

        //最后更新自己的顺序
        NewsCategory update = new NewsCategory().builder().id(id).sort(newSort).build();
        newsCategoryMapper.updateById(update);
    }

    /**
     * 新增资讯分类
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "newsCategoryList", allEntries = true),
            @CacheEvict(value = "campusNewsList", allEntries = true)  // 这里修复！
    })
    public boolean addNewsCategory(NewsCategory category) {
        //查出当前最大排序值
        Integer maxSort = newsCategoryMapper.selectMaxSort();
        //自动往后排
        category.setSort(maxSort + 1);
        category.setStatus(newscategoryENABLE);
        category.setDeleted(NOT_DELETED);
        return newsCategoryMapper.insertCategory(category) > 0;
    }

    /**
     * 编辑资讯分类
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "newsCategoryList", allEntries = true),
            @CacheEvict(value = "campusNewsList", allEntries = true)  // 这里修复！
    })
    public void updateNewsCategory(NewsCategory category) {
        //只更新名称、状态，绝对不更新sort
        LambdaUpdateWrapper<NewsCategory> wrapper = Wrappers.lambdaUpdate(NewsCategory.class);
        wrapper.eq(NewsCategory::getId, category.getId())
                .set(NewsCategory::getName, category.getName());
        newsCategoryMapper.update(null, wrapper);
    }

    /**
     * 删除资讯分类（有资讯则禁用，无则逻辑删除）
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "newsCategoryList", allEntries = true),
            @CacheEvict(value = "campusNewsList", allEntries = true)  // 这里修复！
    })
    public void deleteNewsCategory(Long id) {
        LambdaQueryWrapper<CampusNews> qw = Wrappers.lambdaQuery(CampusNews.class);
        qw.eq(CampusNews::getCategoryId, id);
        Long count = campusNewsMapper.selectCount(qw);

        if (count > 0) {
            NewsCategory category = NewsCategory.builder().id(id).status(newscategoryDISABLE).build();
            newsCategoryMapper.updateById(category);
        } else {
            NewsCategory category = NewsCategory.builder().id(id).status(newscategoryDISABLE).deleted(DELETED).build();
            newsCategoryMapper.updateById(category);
        }
    }

    /**
     * 启用资讯分类
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "newsCategoryList", allEntries = true),
            @CacheEvict(value = "campusNewsList", allEntries = true)  // 这里修复！
    })
    public void enableNewsCategory(Long id) {
        LambdaUpdateWrapper<NewsCategory> wrapper = Wrappers.lambdaUpdate(NewsCategory.class);
        wrapper.eq(NewsCategory::getId, id)
                .eq(NewsCategory::getDeleted, NOT_DELETED)
                .eq(NewsCategory::getStatus, newscategoryDISABLE)
                .set(NewsCategory::getStatus, newscategoryENABLE);
        newsCategoryMapper.update(null, wrapper);
    }

    /**
     * 禁用资讯分类
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "newsCategoryList", allEntries = true),
            @CacheEvict(value = "campusNewsList", allEntries = true)  // 这里修复！
    })
    public void disableNewsCategory(Long id) {
        LambdaUpdateWrapper<NewsCategory> wrapper = Wrappers.lambdaUpdate(NewsCategory.class);
        wrapper.eq(NewsCategory::getId, id)
                .eq(NewsCategory::getStatus, newscategoryENABLE)
                .set(NewsCategory::getStatus, newscategoryDISABLE);
        newsCategoryMapper.update(null, wrapper);
    }

    /**
     * 恢复资讯分类
     */
    @Transactional(rollbackFor = Exception.class)
    @Caching(evict = {
            @CacheEvict(value = "newsCategoryList", allEntries = true),
            @CacheEvict(value = "campusNewsList", allEntries = true)  // 这里修复！
    })
    public void restoreNewsCategory(Long id) {
        LambdaUpdateWrapper<NewsCategory> wrapper = Wrappers.lambdaUpdate(NewsCategory.class);
        wrapper.eq(NewsCategory::getId, id)
                .eq(NewsCategory::getDeleted, DELETED)
                .set(NewsCategory::getDeleted, NOT_DELETED);
        newsCategoryMapper.update(null, wrapper);
    }
}
