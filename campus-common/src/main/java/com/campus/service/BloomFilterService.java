package com.campus.service;

import cn.hutool.core.util.HashUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Redis 位图实现的布隆过滤器，用于缓存穿透防护。
 * 查询数据库前先检查 Bloom Filter，不存在则直接返回，避免无效 key 击穿 DB。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BloomFilterService {

    private final StringRedisTemplate redisTemplate;

    private static final String BLOOM_PREFIX = "bloom:";

    // ========== 商品 Bloom Filter ==========
    private static final int GOODS_EXPECTED = 50_000;
    private static final double GOODS_FPR = 0.01;
    private static final long GOODS_BITS = optimalBits(GOODS_EXPECTED, GOODS_FPR);
    private static final int GOODS_HASHES = optimalHashes(GOODS_EXPECTED, GOODS_BITS);

    // ========== 用户 Bloom Filter ==========
    private static final int USER_EXPECTED = 30_000;
    private static final double USER_FPR = 0.01;
    private static final long USER_BITS = optimalBits(USER_EXPECTED, USER_FPR);
    private static final int USER_HASHES = optimalHashes(USER_EXPECTED, USER_BITS);

    private static class BloomParams {
        final long bitSize;
        final int numHashes;
        BloomParams(long bitSize, int numHashes) {
            this.bitSize = bitSize;
            this.numHashes = numHashes;
        }
    }

    // ==================== 公开方法 ====================

    /**
     * 添加元素到布隆过滤器 type: goods / user
     */
    public void add(String type, Long id) {
        if (id == null) return;
        String key = BLOOM_PREFIX + type;
        BloomParams params = getParams(type);
        if (params == null) return;
        for (long pos : hash(id, params)) {
            redisTemplate.opsForValue().setBit(key, pos, true);
        }
    }

    /**
     * 检查元素是否可能存在（false = 一定不存在）
     */
    public boolean mightContain(String type, Long id) {
        if (id == null) return false;
        String key = BLOOM_PREFIX + type;
        BloomParams params = getParams(type);
        if (params == null) return true; // 未知类型，放行
        for (long pos : hash(id, params)) {
            if (!redisTemplate.opsForValue().getBit(key, pos)) {
                return false; // 任何一个位为0 → 一定不存在
            }
        }
        return true; // 所有位为1 → 可能存在
    }

    // ==================== 内部方法 ====================

    /**
     * 使用双重哈希（double hashing）生成多个位位置
     */
    private long[] hash(Long value, BloomParams params) {
        long h1 = murmurHash(value, 0);
        long h2 = murmurHash(value, 1);
        long[] positions = new long[params.numHashes];
        for (int i = 0; i < params.numHashes; i++) {
            positions[i] = Math.floorMod(h1 + (long) i * h2, params.bitSize);
        }
        return positions;
    }

    /**
     * 使用 Hutool Murmur32 对 Long ID 做哈希，返回 [0, 2^32) 的正数
     */
    private long murmurHash(Long value, int salt) {
        // 不同的 salt 产生不同的哈希值（"a" / "b"……）
        String input = value + ":" + (char) ('a' + salt);
        return HashUtil.murmur32(input.getBytes(StandardCharsets.UTF_8)) & 0xFFFFFFFFL;
    }

    private BloomParams getParams(String type) {
        switch (type) {
            case "goods": return new BloomParams(GOODS_BITS, GOODS_HASHES);
            case "user":  return new BloomParams(USER_BITS, USER_HASHES);
            default: return null;
        }
    }

    private static long optimalBits(long n, double p) {
        return (long) Math.ceil(-n * Math.log(p) / (Math.log(2) * Math.log(2)));
    }

    private static int optimalHashes(long n, long m) {
        return Math.max(1, (int) Math.round((double) m / n * Math.log(2)));
    }

    // ==================== 启动预热（手动调用） ====================

    /**
     * 批量初始化 Bloom Filter（启动时从 DB 加载已有 ID）
     */
    public void initBatch(String type, List<Long> ids) {
        if (ids == null || ids.isEmpty()) return;
        String key = BLOOM_PREFIX + type;
        BloomParams params = getParams(type);
        if (params == null) return;
        byte[] rawKey = key.getBytes(StandardCharsets.UTF_8);

        redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
            for (Long id : ids) {
                if (id == null) continue;
                for (long pos : hash(id, params)) {
                    connection.stringCommands().setBit(rawKey, pos, true);
                }
            }
            return null;
        });

        log.info("BloomFilter [{}] 批量初始化完成，共 {} 个元素，位图大小 {} bits，哈希函数 {} 个",
                type, ids.size(), params.bitSize, params.numHashes);
    }
}
