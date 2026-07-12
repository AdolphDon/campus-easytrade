package com.campus.controller;

import com.campus.result.Result;
import com.campus.utils.AliOssUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.util.UUID;

/**
 * 通用接口
 */
@Slf4j
@Api(tags = "通用接口")
@RestController
@RequestMapping("/user/common")
@RequiredArgsConstructor//Lombok注解:替代@Autowired
public class CommonController {

    private  final AliOssUtil aliOssUtil;
    //此注入涉及OssConfiguration、AliOssUtil类

    //在项目启动时，这个方法自动执行一次
    @PostConstruct
    public void init() {
        log.info("CommonController初始化成功-路径：/user/common");
    }

    /**
     * 文件上传
     */
    @PostMapping("/upload")
    @ApiOperation("文件上传")
    //MultipartFile是Spring提供的文件上传封装类,用于接收前端上传的文件数据
    public Result<String> upload(@RequestParam("file") MultipartFile file){
        log.info("文件上传:{}", file);

        if (file == null || file.isEmpty()) {
            log.error("文件为空");
            return Result.error("文件不能为空");
        }

        try {
            //获取文件字节流
            byte[] bytes = file.getBytes();

            //获取上传文件的原始文件名
            String originalFilename = file.getOriginalFilename();
            log.info("原始文件名: {}", originalFilename);
            //截取原始文件名的后缀 dfdfdf.png
            //lastIndexOf(".")：获取"."的索引值；substring：从指定的索引位置开始，截取字符串到末尾，返回新的子字符串
            String extension = originalFilename.substring(originalFilename.lastIndexOf("."));

            //===================== 改动：使用MD5作为文件名，实现文件去重 =====================
            //计算文件MD5值
            String md5 = AliOssUtil.getFileMD5(bytes);
            //构造新文件名称：MD5+后缀，相同文件MD5相同，文件名相同
            String objectName = md5 + extension;

            //文件的请求路径
            //此时的filePath是阿里云OSS的文件访问URL
            String filePath = aliOssUtil.upload(bytes, objectName);
            log.info("文件上传成功: {}", filePath);
            return Result.success(filePath);
        } catch (IOException e) {
            log.error("文件上传失败", e);
        }

        return Result.error("文件上传失败");
    }
}
