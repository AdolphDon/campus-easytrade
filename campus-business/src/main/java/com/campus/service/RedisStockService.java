package com.campus.service;

import java.util.List;
import java.util.Map;

/**
 * Redis 库存管理服务接口
 * 负责商品库存的初始化、实时查询和原子扣减
 */
public interface RedisStockService {

    /**
     * 初始化商品库存到Redis
     */
    void initStock(Long goodsId, Integer stock);

    /**
     * 删除Redis库存（下架/删除商品时调用）
     */
    void deleteStock(Long goodsId);

    /**
     * 批量获取实时库存
     */
    Map<Long, Integer> getRealTimeStock(List<Long> goodsIds);

    /**
     * 获取单个商品实时库存
     */
    Integer getStock(Long goodsId);

    /**
     * Redis DECRBY 原子扣减库存（预占库存）
     */
    Long decrStock(Long goodsId, Integer quantity);

    /**
     * Redis INCREMENT 回滚库存
     */
    Long incrStock(Long goodsId, Integer quantity);

    /**
     * 批量管道扣减库存（一次网络IO完成所有DECRBY）
     *
     * @param goodsQuantityMap 商品ID -> 扣减数量映射
     * @return 扣减后的剩余库存列表（顺序与传入映射一致）
     */
    List<Long> decrStockPipelined(Map<Long, Integer> goodsQuantityMap);

    /**
     * Lua原子批量扣减库存：检查与扣减在Redis服务端一次完成
     * 任一商品库存不足则全部回滚，彻底避免超卖
     *
     * @param goodsQuantityMap 商品ID -> 扣减数量映射
     * @return true=全部扣减成功 false=库存不足
     */
    boolean decrStockLua(Map<Long, Integer> goodsQuantityMap);

    /**
     * Lua原子批量回补库存：一次网络IO完成所有INCRBY，并确保不超过MySQL总库存
     *
     * @param goodsQuantityMap 商品ID -> 回补数量映射
     * @param goodsMaxStockMap 商品ID -> MySQL总库存（cap上限，防止编辑库存后回补导致Redis超出MySQL）
     */
    void incrStockLua(Map<Long, Integer> goodsQuantityMap, Map<Long, Integer> goodsMaxStockMap);
}
