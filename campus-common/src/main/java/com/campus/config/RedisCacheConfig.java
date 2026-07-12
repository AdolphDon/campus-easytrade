package com.campus.config;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
/**
 * Spring Cache 缓存配置：设置 @Cacheable 等注解使用 Redis 作为缓存存储，配置 JSON 序列化与 TTL
 */
@Configuration
public class RedisCacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        ObjectMapper mapper = new ObjectMapper();
        //支持LocalDateTime/LocalDate/LocalTime序列化，否则存时间会报错无法解析
        mapper.registerModule(new JavaTimeModule());
        //时间不存时间戳数字，存标准格式化字符串（2026-06-16Txx:xx），可读性更高
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        //允许所有类
        mapper.activateDefaultTyping(
                BasicPolymorphicTypeValidator.builder()
                         //开启类型存储：序列化JSON时自带@class字段，反序列化时自动识别原实体类
                        .allowIfBaseType(Object.class)
                        .build(),
                ObjectMapper.DefaultTyping.NON_FINAL
        );

        //SpringCache专用JSON序列化器，替换默认JDK二进制序列化，Redis 客户端可直接看懂JSON数据
        GenericJackson2JsonRedisSerializer jsonSerializer =
                new GenericJackson2JsonRedisSerializer(mapper);

        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(30))//全局默认缓存过期时间30分钟
                .serializeKeysWith(//字符串序列化器
                        //存入Redis的key就是纯明文字符串，无任何二进制前缀乱码
                        RedisSerializationContext.SerializationPair.fromSerializer(
                                new StringRedisSerializer()
                        )
                )
                .serializeValuesWith(//缓存Value的序列化规则
                        RedisSerializationContext.SerializationPair.fromSerializer(jsonSerializer)
                );
                //允许缓存 null（防穿透），空值被短 TTL 自动淘汰
                //.disableCachingNullValues()

        return RedisCacheManager.builder(factory)
                //上面30分钟全局默认规则：全局兜底（当没有在customCacheConfigs中单独配置ttl时才会实现）
                .cacheDefaults(config)
                //自定义缓存空间单独过
                .withInitialCacheConfigurations(customCacheConfigs(config))
                .build();
    }

    //各缓存独立 TTL + 随机偏移(±20%)：防止同一批 key 同时过期造成缓存雪崩
    private Map<String, RedisCacheConfiguration> customCacheConfigs(RedisCacheConfiguration defaultConfig) {
        Map<String, RedisCacheConfiguration> map = new HashMap<>();

        //========== 高变更：订单/支付/购物车 → 5 min ==========
        map.put("orderList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(5))));
        map.put("orderDetail", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(5))));
        map.put("paymentGroupDetail", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(5))));
        map.put("orderAddress", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(5))));
        map.put("cartList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(5))));

        //========== 中变更：商品相关 → 10 min ==========
        map.put("goodsList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("goodsDetail", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("userGoodsList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("commonGoodsList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("adminUserList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("goods:audit:page", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("announcementList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("dashboardStats", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(5))));
        map.put("platformDynamic", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));
        map.put("campusNewsList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(10))));

        //========== 低变更：地址/学校/用户/分类 → 30 min ==========
        map.put("address:user", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(30))));
        map.put("dormitory:school", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(30))));
        map.put("confirmOrderAddress", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(30))));
        map.put("userSchool", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(30))));
        map.put("userInfo", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(30))));
        map.put("categoryList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(30))));
        map.put("newsCategoryList", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(30))));

        //========== 极少变更：敏感词 → 60 min ==========
        map.put("sensitive:words", defaultConfig.entryTtl(withJitter(Duration.ofMinutes(60))));

        return map;
    }

    //在基础 TTL 上增加 0~20% 的随机偏移，防止缓存雪崩
    private static Duration withJitter(Duration base) {
        long seconds = base.getSeconds();
        long maxJitter = seconds / 5;
        if (maxJitter <= 0) return base;
        long jitter = ThreadLocalRandom.current().nextLong(maxJitter);
        return base.plusSeconds(jitter);
    }
}