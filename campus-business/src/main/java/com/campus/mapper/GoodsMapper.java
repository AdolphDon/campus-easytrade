package com.campus.mapper;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.entity.Goods;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface GoodsMapper extends BaseMapper<Goods> {

    /**
     * 根据分页与分类条件查询用户信息：IPage是父接口，Page是实现类(任何分页查询实现都可以调用此接口)
     * @param page
     * @return
     */
    IPage<Goods> selectGoodsPage(Page<Goods> page, Wrapper<Goods> wrapper);

    //收藏量 +1
    void updateCollectCountPlus(@Param("goodsId") Long goodsId);

    //收藏量 -1（最小为0，不会负数）
    void updateCollectCountMinus(@Param("goodsId") Long goodsId);

    /**
     * 支付成功：MySQL正式扣减库存（stock - quantity），库存不得为负数
     * @param goodsId
     * @param quantity
     */
    @Update("UPDATE goods SET stock = stock - #{quantity} WHERE id = #{goodsId} AND stock >= #{quantity}")
    int decreaseStock(@Param("goodsId") Long goodsId, @Param("quantity") Integer quantity);
}
