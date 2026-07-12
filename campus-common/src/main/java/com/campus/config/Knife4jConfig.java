package com.campus.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import springfox.documentation.builders.ApiInfoBuilder;
import springfox.documentation.builders.PathSelectors;
import springfox.documentation.builders.RequestHandlerSelectors;
import springfox.documentation.service.ApiInfo;
import springfox.documentation.spi.DocumentationType;
import springfox.documentation.spring.web.plugins.Docket;
import springfox.documentation.swagger2.annotations.EnableSwagger2WebMvc;

/**
 * Knife4j是Swagger增强的在线API文档工具，扫描后端接口，生成可视化接口调试文档:http://localhost:8080/doc.html
 */
@Configuration
@EnableSwagger2WebMvc//开启Knife4j/Swagger文档自动生成能力
public class Knife4jConfig {

    @Bean
    public Docket docket() {
        return new Docket(DocumentationType.SWAGGER_2)
                .apiInfo(apiInfo())//设置文档标题、描述、版本信息
                .select()
                //只扫描com.campus.controller下所有接口
                .apis(RequestHandlerSelectors.basePackage("com.campus.controller"))
                //该包下所有路径全部生成文档
                .paths(PathSelectors.any())
                .build();
    }

    private ApiInfo apiInfo() {
        return new ApiInfoBuilder()
                .title("校易帮 API 文档")
                .description("校园互助交易平台后端接口")
                .version("1.0.0")
                .build();
    }
}
