package com.campus.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 配置异步执行的线程池
 */
@Data
@Component
@ConfigurationProperties(prefix = "async.thread-pool")
public class ThreadPoolProperties {

    /** 核心线程数 */
    private int corePoolSize = 5;

    /** 最大线程数 */
    private int maxPoolSize = 10;

    /** 队列容量 */
    private int queueCapacity = 100;

    /** 线程名前缀 */
    private String threadNamePrefix = "async-";

    /** 等待任务完成的最大秒数 */
    private int awaitTerminationSeconds = 30;
}
