package com.campus.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.entity.Category;
import com.campus.entity.NewsCategory;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface NewsCategoryMapper extends BaseMapper<NewsCategory> {

    @Select("select IFNULL(max(sort),0) from news_category where deleted = 0")
    Integer selectMaxSort();

    //新增商品分类
    @Insert("INSERT INTO news_category(name, sort, status, deleted) " +
            "VALUES(#{name}, #{sort}, #{status}, #{deleted})")
    int insertCategory(NewsCategory newsCategory);
}
