package com.campus.service.impl;

import com.campus.service.RedisStockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.connection.StringRedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Redis 库存管理服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RedisStockServiceImpl implements RedisStockService {

    //Spring提供redisTemplate-封装好了所有操作Redis的命令:Java程序操作Redis的工具
    private final StringRedisTemplate redisTemplate;

    private static final String STOCK_KEY_PREFIX = "stock:goods:";
    private static final long STOCK_EXPIRE_HOURS = 24;//库存的过期时间为24小时

    /**
     * 初始化商品库存的方法
     * @param goodsId
     * @param stock
     */
    public void initStock(Long goodsId, Integer stock) {
        //如果商品ID或库存数量为空，直接结束方法
        if (goodsId == null || stock == null) return;
        //拼接Redis中存储库存的key
        String key = STOCK_KEY_PREFIX + goodsId;
        //把库存存入Redis，并设置过期时间:opsForValue() =操作普通键值对
        redisTemplate.opsForValue().set(key, String.valueOf(stock), STOCK_EXPIRE_HOURS, TimeUnit.HOURS);
    }

    /**
     * Lua原子批量扣减库存：检查与扣减在Redis服务端一次完成
     * 任一商品库存不足则全部回滚，彻底避免超卖
     * @param goodsQuantityMap 商品ID -> 扣减数量映射
     * @return true=全部扣减成功 false=库存不足
     */
    public boolean decrStockLua(Map<Long, Integer> goodsQuantityMap) {
        //准备Lua脚本的KEYS和ARGV(保持顺序，方便调用方定位失败商品)
        List<String> keys = new ArrayList<>();
        List<String> args = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : goodsQuantityMap.entrySet()) {
            keys.add(STOCK_KEY_PREFIX + entry.getKey());
            args.add(String.valueOf(entry.getValue()));
        }

        //Redis服务端原子执行Lua：全检查→全扣减，任一不足返回0
        Long result = redisTemplate.execute(DECR_STOCK_SCRIPT, keys, args.toArray());
        return Long.valueOf(1L).equals(result);
    }

    //Lua脚本：单循环检查+扣减，任一不足回滚已扣的，彻底避免高并发超卖
    private static final String DECR_STOCK_LUA =
            "local keys_to_deduct = {}\n" +
            "for i = 1, #KEYS do\n" +
            "    local stock = redis.call('GET', KEYS[i])\n" +
            "    if not stock or tonumber(stock) < tonumber(ARGV[i]) then\n" +
            "        for j = 1, #keys_to_deduct do\n" +
            "            redis.call('INCRBY', keys_to_deduct[j], ARGV[j])\n" +
            "        end\n" +
            "        return 0\n" +
            "    end\n" +
            "    redis.call('DECRBY', KEYS[i], ARGV[i])\n" +
            "    table.insert(keys_to_deduct, KEYS[i])\n" +
            "end\n" +
            "return 1";

    private static final RedisScript<Long> DECR_STOCK_SCRIPT = new DefaultRedisScript<>(DECR_STOCK_LUA, Long.class);

    /**
     * Lua原子批量回补库存：一次网络IO完成所有INCRBY，并确保不超过MySQL总库存
     */
    public void incrStockLua(Map<Long, Integer> goodsQuantityMap, Map<Long, Integer> goodsMaxStockMap) {
        List<String> keys = new ArrayList<>();
        List<String> args = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : goodsQuantityMap.entrySet()) {
            keys.add(STOCK_KEY_PREFIX + entry.getKey());
            args.add(String.valueOf(entry.getValue()));
            //对应的MySQL总库存上限
            Integer maxStock = goodsMaxStockMap.get(entry.getKey());
            args.add(String.valueOf(maxStock != null ? maxStock : entry.getValue()));
        }
        redisTemplate.execute(INCR_STOCK_SCRIPT, keys, args.toArray());
    }

    //Lua脚本：批量回补（incr）+ cap at MySQL总库存，防止编辑后回补导致Redis超出MySQL
    private static final String INCR_STOCK_LUA =
            "for i = 1, #KEYS do\n" +
            "    local incrQty = tonumber(ARGV[(i - 1) * 2 + 1])\n" +
            "    local maxStock = tonumber(ARGV[(i - 1) * 2 + 2])\n" +
            "    local current = tonumber(redis.call('GET', KEYS[i]))\n" +
            "    local newVal\n" +
            "    if not current then\n" +
            "        newVal = math.min(incrQty, maxStock)\n" +
            "    else\n" +
            "        newVal = current + incrQty\n" +
            "        if newVal > maxStock then\n" +
            "            newVal = maxStock\n" +
            "        end\n" +
            "    end\n" +
            "    redis.call('SET', KEYS[i], newVal)\n" +
            "end";

    private static final RedisScript<Long> INCR_STOCK_SCRIPT = new DefaultRedisScript<>(INCR_STOCK_LUA, Long.class);

    /**
     * 删除某商品的库存
     * @param goodsId
     */
    public void deleteStock(Long goodsId) {
        if (goodsId == null) return;
        redisTemplate.delete(STOCK_KEY_PREFIX + goodsId);
    }

    /**
     * 批量获取多个商品的【实时库存】，返回：map：<商品ID:库存数>
     * @param goodsIds
     * @return
     */
    public Map<Long, Integer> getRealTimeStock(List<Long> goodsIds) {
        if (goodsIds == null || goodsIds.isEmpty()) return new HashMap<>();
        //把商品ID转成Redis里对应的key
        List<String> keys = goodsIds.stream()
                .map(id -> STOCK_KEY_PREFIX + id)
                .collect(Collectors.toList());
        //一次性批量查询Redis中的所有库存值
        List<String> values = redisTemplate.opsForValue().multiGet(keys);
        //把查询结果封装成Map：<商品ID:库存数字>
        Map<Long, Integer> result = new HashMap<>();
        for (int i = 0; i < goodsIds.size(); i++) {
            if (values != null && i < values.size() && values.get(i) != null) {
                //把Redis里的字符串库存 → 转成数字：把【第i个商品的ID】和【第i个商品的库存数量->转化成整数型】配对放进结果Map里
                result.put(goodsIds.get(i), Integer.parseInt(values.get(i)));
            }
        }
        return result;
    }

    /**
     * 获取单个商品的【实时库存】
     * @param goodsId
     * @return
     */
    public Integer getStock(Long goodsId) {
        String val = redisTemplate.opsForValue().get(STOCK_KEY_PREFIX + goodsId);
        return val != null ? Integer.parseInt(val) : null;
    }

    /**
     * 扣减商品库存
     * @param goodsId
     * @param quantity
     * @return
     */
    public Long decrStock(Long goodsId, Integer quantity) {
        //Redis原子性扣减库存：减少指定数量
        return redisTemplate.opsForValue().decrement(STOCK_KEY_PREFIX + goodsId, quantity);
    }

    /**
     * 增加商品库存
     * @param goodsId
     * @param quantity
     * @return
     */
    public Long incrStock(Long goodsId, Integer quantity) {
        //Redis原子性增加库存：增加指定数量
        return redisTemplate.opsForValue().increment(STOCK_KEY_PREFIX + goodsId, quantity);
    }

    /**
     * 批量管道扣减库存（一次网络IO完成所有DECRBY）
     *
     * @param goodsQuantityMap 商品ID -> 扣减数量映射
     * @return 扣减后的剩余库存列表（顺序与传入映射一致）
     */
    public List<Long> decrStockPipelined(Map<Long, Integer> goodsQuantityMap) {
        //开启Redis管道:一次性打包发送N条命令，只做1次网络IO
        List<Object> results = redisTemplate.executePipelined(
                (RedisCallback<Object>) connection -> {
                    //拿到原生Redis连接，用于执行底层命令:强转成StringRedisConnection，保证key/value都是字符串，兼容库存计数
                    StringRedisConnection sc = (StringRedisConnection) connection;
                    goodsQuantityMap.forEach((goodsId, quantity) ->
                            //批量扣减购物车选中商品的库存，扣减Quantity数量
                            sc.decrBy(STOCK_KEY_PREFIX + goodsId, quantity));
                    return null;
                });
        //把扣减结果转成Long列表，和传入映射的顺序一致
        return results.stream().map(r -> (Long) r).collect(Collectors.toList());
    }
}
