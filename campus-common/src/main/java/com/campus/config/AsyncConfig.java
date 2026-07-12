package com.campus.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
//AsyncConfig 异步线程池配置
//不配置线程池时一个请求就要占用一个线程，当上千异步执行时就要上千个线程，内存爆了溢出崩溃
//①配置线程池时同时最多只有10个线程，超过的异步执行请求要排队等候，排满了自己去拿结果
//②有线程池配置就算线程中断，需发停止信号后等30秒，正在扣库存的线程跑完再退出，数据安全
@Configuration
@RequiredArgsConstructor
public class AsyncConfig {

    private final ThreadPoolProperties threadPoolProperties;

    @Bean("taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(threadPoolProperties.getCorePoolSize());
        executor.setMaxPoolSize(threadPoolProperties.getMaxPoolSize());
        executor.setQueueCapacity(threadPoolProperties.getQueueCapacity());
        executor.setThreadNamePrefix(threadPoolProperties.getThreadNamePrefix());
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(threadPoolProperties.getAwaitTerminationSeconds());
        executor.initialize();
        return executor;
    }
}
