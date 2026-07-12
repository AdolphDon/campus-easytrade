package com.campus.utils;

import com.aliyun.oss.ClientException;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.OSSException;
import com.aliyun.oss.model.PutObjectRequest;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.io.ByteArrayInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 *  阿里云OSS文件上传工具类-接收文件字节流，上传到阿里云 OSS，返回可访问的图片URL
 *  作用：将从前端传来的文件与新创建的文件名传入阿里云OSS中，并返回阿里云OSS的文件访问URL
 *  上传后将访问阿里云OSS中的文件路径而不是本地文件路径
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
@Slf4j
public class AliOssUtil {

    private String endpoint;//访问域名
    private String accessKeyId;//秘钥ID
    private String accessKeySecret;//秘钥
    private String bucketName;//存储空间名称

    /**
     * 文件上传
     * @param bytes
     * @param objectName
     * @return 永久可访问的URL（需确保Bucket设置为公共读）
     */
    public String upload(byte[] bytes, String objectName) {//(前端传来的文件信息的字节流,新生成的文件名称)

        //创建OSSClient实例:通过OSS地域地址、身份标识、身份密钥创建OSS客户端对象，这是和阿里云OSS通信的核心对象
        OSS ossClient = new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);

        try {
            // ===================== 判断文件是否已存在，存在则直接返回URL =====================
            boolean exist = ossClient.doesObjectExist(bucketName, objectName);
            if (exist) {
                String url = "https://" + bucketName + "." + endpoint + "/" + objectName;
                return url;
            }

            //创建PutObject请求:OSS客户端的核心上传方法，接收三个参数
            //ByteArrayInputStream(bytes):将文件字节数组转换成输入流，这是OSS接收的文件数据格式
            ossClient.putObject(new PutObjectRequest(
                    bucketName,
                    objectName,
                    new ByteArrayInputStream(bytes)
            ));

            //构建永久可访问的URL（需要Bucket设置为公共读）
            //URL格式: https://{bucketName}.{endpoint}/{objectName}
            String url = "https://" + bucketName + "." + endpoint + "/" + objectName;

            return url;

        } catch (OSSException oe) {//OSS服务端异常：请求到达OSS但被拒绝（如权限不足、Bucket不存在、文件名非法等）
            System.out.println("Caught an OSSException, which means your request made it to OSS, "
                    + "but was rejected with an error response for some reason.");
            System.out.println("Error Message:" + oe.getErrorMessage());
            System.out.println("Error Code:" + oe.getErrorCode());
            System.out.println("Request ID:" + oe.getRequestId());
            System.out.println("Host ID:" + oe.getHostId());
        } catch (ClientException ce) {//客户端异常：请求未到达OSS（如网络连接失败、endpoint配置错误等）
            System.out.println("Caught an ClientException, which means the client encountered "
                    + "a serious internal problem while trying to communicate with OSS, "
                    + "such as not being able to access the network.");
            System.out.println("Error Message:" + ce.getMessage());
        } finally {//资源释放
            if (ossClient != null) {
                ossClient.shutdown();
            }
        }

        //代码执行到这里说明上传失败
        return null;
    }

    //===================== 计算文件MD5值 =====================
    /**
     * 计算文件的MD5值，用于判断文件是否重复
     */
    public static String getFileMD5(byte[] bytes) {
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            md5.update(bytes);
            byte[] digest = md5.digest();
            //转换为16进制字符串
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("计算文件MD5失败", e);
        }
    }
}