package com.campus;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

//@SpringBootApplication默认只会扫描：启动类所在包及其子包,加入scanBasePackages扫描所有注解的包
@SpringBootApplication(scanBasePackages = {"com.campus"})
@EnableTransactionManagement
@EnableCaching//开发缓存注解功能
@EnableScheduling//开启springtask
@Slf4j
@EnableAsync//开启异步执行，用于将核心db与非核心db分离
public class CampusApplication {
    public static void main(String[] args) {
        SpringApplication.run(CampusApplication.class, args);
        log.info("Web started");
    }
}
