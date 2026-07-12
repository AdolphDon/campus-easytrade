package com.campus.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.entity.GoodsImage;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface GoodsImageMapper extends BaseMapper<GoodsImage> {

    /**
     * 根据商品ID查询图片列表
     * @param goodsId 商品ID
     * @return 图片列表
     */
    @Select("SELECT url FROM goods_image WHERE goods_id = #{goodsId} ORDER BY sort ASC")
    List<String> selectByGoodsId(Long goodsId);

    /**
     * 根据商品ID删除所有图片
     * @param goodsId
     */
    @Delete("DELETE FROM goods_image WHERE goods_id = #{goodsId}")
    void deleteByGoodsId(Long goodsId);
}
