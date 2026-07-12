package com.campus.controller;

import com.campus.entity.Category;
import com.campus.entity.NewsCategory;
import com.campus.result.Result;
import com.campus.service.CategoryService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@Api(tags = "分类接口")
@RestController
@RequestMapping("/user/category")
@RequiredArgsConstructor//Lombok注解:替代@Autowired
public class CategoryController {

    private final CategoryService categoryService;

    // ==================== 商品分类接口 ====================

    /**
     * 获取所有可用的商品分类
     */
    @GetMapping("/list")
    @ApiOperation("获取所有可用商品分类")
    @Cacheable(value = "categoryList", key = "'all_enable_category'",sync = true)
    public Result<List<Category>> getCategoryList() {
        return Result.success(categoryService.getCategoryList());
    }

    /**
     * 查询【禁用/已删除】的商品分类
     */
    @GetMapping("/list/dis")
    @ApiOperation("查询禁用/已删除的商品分类")
    @Cacheable(value = "categoryList", key = "'all_disabled_category'",sync = true)
    public Result listDisabledOrDeleted() {
        List<Category> list = categoryService.getDisabledOrDeletedList();
        return Result.success(list);
    }

    /**
     * 商品分类调整排序
     */
    @PutMapping("/sort")
    @ApiOperation("调整商品分类排序")
    public Result sortCategory(@RequestParam Long id, @RequestParam Integer newSort) {
        categoryService.sortCategory(id, newSort);
        return Result.success();
    }

    /**
     * 编辑商品分类
     */
    @PutMapping("/update")
    @ApiOperation("编辑商品分类")
    public Result updateCategory(@RequestBody Category category) {
        categoryService.updateCategory(category);
        return Result.success();
    }

    /**
     * 新增商品分类
     */
    @PostMapping("/add")
    @ApiOperation("新增商品分类")
    public Result addCategory(@RequestBody Category category) {
        boolean result = categoryService.addCategory(category);
        if (result) {
            return Result.success();
        }
        return Result.error("分类新增失败");
    }

    /**
     * 删除分类（有关联商品→禁用，无关联商品→逻辑删除）
     */
    @PutMapping("/delete/{id}")
    @ApiOperation("删除商品分类（有关联商品则禁用，无关联则逻辑删除）")
    public Result<String> deleteCategory(@PathVariable Long id) {
        String action = categoryService.deleteCategory(id);
        return Result.success(action);
    }

    /**
     * 启用分类
     */
    @PutMapping("/enable/{id}")
    @ApiOperation("启用商品分类")
    public Result enableCategory(@PathVariable Long id) {
        categoryService.enableCategory(id);
        return Result.success();
    }

    /**
     * 禁用分类
     */
    @PutMapping("/disable/{id}")
    @ApiOperation("禁用商品分类")
    public Result disableCategory(@PathVariable Long id) {
        categoryService.disableCategory(id);
        return Result.success();
    }

    /**
     * 恢复分类
     */
    @PutMapping("/restore/{id}")
    @ApiOperation("恢复商品分类")
    public Result restoreCategory(@PathVariable Long id) {
        categoryService.restoreCategory(id);
        return Result.success();
    }

    // ==================== 校园资讯分类接口 ====================

    /**
     * 获取所有可用的 校园资讯分类
     */
    @GetMapping("/news-list")
    @ApiOperation("获取所有可用校园资讯分类")
    @Cacheable(value = "newsCategoryList", key = "'all_enable_news_category'",sync = true)
    public Result<List<NewsCategory>> getNewsCategoryList() {
        return Result.success(categoryService.getNewsCategoryList());
    }

    /**
     * 查询【禁用/已删除】的校园资讯分类
     */
    @GetMapping("/news-list/dis")
    @ApiOperation("查询禁用/已删除的校园资讯分类")
    @Cacheable(value = "newsCategoryList", key = "'all_disabled_news_category'",sync = true)
    public Result newsListDisabledOrDeleted() {
        List<NewsCategory> list = categoryService.getDisabledOrDeletedNewsList();
        return Result.success(list);
    }

    /**
     * 排序 校园资讯分类 调整顺序
     */
    @PutMapping("/news-sort")
    @ApiOperation("调整校园资讯分类排序")
    public Result updateNewsCategorySort(@RequestParam Long id, @RequestParam Integer newSort) {
        categoryService.updateNewsCategorySort(id, newSort);
        return Result.success();
    }

    /**
     * 新增 校园资讯分类
     */
    @PostMapping("/news-add")
    @ApiOperation("新增校园资讯分类")
    public Result addNewsCategory(@RequestBody NewsCategory category) {
        boolean result = categoryService.addNewsCategory(category);
        if (result) {
            return Result.success();
        }
        return Result.error("资讯分类新增失败");
    }

    /**
     * 编辑 校园资讯分类
     */
    @PutMapping("/news-update")
    @ApiOperation("编辑校园资讯分类")
    public Result updateNewsCategory(@RequestBody NewsCategory category) {
        categoryService.updateNewsCategory(category);
        return Result.success();
    }

    /**
     * 删除 资讯分类
     */
    @PutMapping("/news-delete/{id}")
    @ApiOperation("删除校园资讯分类")
    public Result deleteNewsCategory(@PathVariable Long id) {
        categoryService.deleteNewsCategory(id);
        return Result.success();
    }

    /**
     * 启用 资讯分类
     */
    @PutMapping("/news-enable/{id}")
    @ApiOperation("启用校园资讯分类")
    public Result enableNewsCategory(@PathVariable Long id) {
        categoryService.enableNewsCategory(id);
        return Result.success();
    }

    /**
     * 禁用 资讯分类
     */
    @PutMapping("/news-disable/{id}")
    @ApiOperation("禁用校园资讯分类")
    public Result disableNewsCategory(@PathVariable Long id) {
        categoryService.disableNewsCategory(id);
        return Result.success();
    }

    /**
     * 恢复 资讯分类
     */
    @PutMapping("/news-restore/{id}")
    @ApiOperation("恢复校园资讯分类")
    public Result restoreNewsCategory(@PathVariable Long id) {
        categoryService.restoreNewsCategory(id);
        return Result.success();
    }
}
