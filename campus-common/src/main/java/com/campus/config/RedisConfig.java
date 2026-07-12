package com.campus.config;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
/**
 * RedisTemplate 配置：设置 Key 使用字符串序列化、Value 使用 JSON 序列化，替代默认的 JDK 序列化
 */
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory redisConnectionFactory) {
        RedisTemplate<String, Object> redisTemplate = new RedisTemplate<>();
        //读取yml中redis地址、密码、库、连接池配置，提供Redis底层连接
        redisTemplate.setConnectionFactory(redisConnectionFactory);
        //专门序列化Redis的键，存入Redis是纯文本，无乱码
        StringRedisSerializer stringSerializer = new StringRedisSerializer();

        //JSON序列化器+ObjectMapper配置
        Jackson2JsonRedisSerializer<Object> jsonSerializer = new Jackson2JsonRedisSerializer<>(Object.class);
        ObjectMapper om = new ObjectMapper();
        //所有属性(私有/公有/无get)都参与序列化
        om.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);

        //允许所有Object子类序列化，JSON中写入@class类型标识，反序列化自动转回原对象
        om.activateDefaultTyping(
                BasicPolymorphicTypeValidator.builder()
                        .allowIfBaseType(Object.class)
                        .build(),
                ObjectMapper.DefaultTyping.NON_FINAL
        );

        jsonSerializer.setObjectMapper(om);

        //普通String结构key
        redisTemplate.setKeySerializer(stringSerializer);
        //Hash结构hashKey
        redisTemplate.setHashKeySerializer(stringSerializer);
        //普通String结构value
        redisTemplate.setValueSerializer(jsonSerializer);
        //Hash结构hashValue
        redisTemplate.setHashValueSerializer(jsonSerializer);
        //初始化模板内部序列化相关资源，必须调用，否则序列化配置不生效
        redisTemplate.afterPropertiesSet();
        return redisTemplate;
    }
}