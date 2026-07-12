package com.campus.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.entity.Category;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface CategoryMapper extends BaseMapper<Category> {

    //排序
    @Select("select IFNULL(max(sort),0) from category where deleted = 0")
    Integer selectMaxSort();

    //新增商品分类
    @Insert("INSERT INTO category(name, sort, status, deleted) " +
            "VALUES(#{name}, #{sort}, #{status}, #{deleted})")
    int insertCategory(Category category);
}