package com.campus.service;

import com.campus.entity.Category;
import com.campus.entity.NewsCategory;
import com.campus.result.Result;

import java.util.List;

public interface CategoryService {

    /**
     * 获取全部商品分类
     * @return
     */
    List<Category> getCategoryList();

    /**
     * 查询【禁用/已删除】的商品分类
     * @return
     */
    List<Category> getDisabledOrDeletedList();

    /**
     * 商品分类调整排序
     * @param id
     * @param newSort
     */
    void sortCategory(Long id, Integer newSort);

    /**
     * 编辑商品分类
     * @param category
     */
    void updateCategory(Category category);

    /**
     * 新增商品分类接口
     * @param category
     * @return
     */
    boolean addCategory(Category category);

    /**
     * 删除分类（有关联商品→禁用，无关联商品→逻辑删除）
     * @param id
     * @return "disabled" 或 "deleted"
     */
    String deleteCategory(Long id);

    /**
     * 启用分类
     * @param id
     * @return
     */
    void enableCategory(Long id);

    /**
     * 恢复分类
     * @param id
     */
    void restoreCategory(Long id);

    /**
     * 禁用分类
     * @param id
     */
    void disableCategory(Long id);

    // 校园资讯分类
    List<NewsCategory> getNewsCategoryList();
    void updateNewsCategorySort(Long id, Integer newSort);
    boolean addNewsCategory(NewsCategory category);
    void updateNewsCategory(NewsCategory category);
    void deleteNewsCategory(Long id);
    void enableNewsCategory(Long id);
    void disableNewsCategory(Long id);
    void restoreNewsCategory(Long id);
    List<NewsCategory> getDisabledOrDeletedNewsList();
}
