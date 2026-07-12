package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.entity.KnowledgeDocument;
import com.campus.mapper.KnowledgeDocumentMapper;
import com.campus.service.KnowledgeDocumentService;
import com.campus.vo.KnowledgeDocumentVO;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 知识库文档服务实现
 * 管理数据库文档记录+同步调用Python FastAPI操作ChromaDB向量库
 */
@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class KnowledgeDocumentServiceImpl implements KnowledgeDocumentService {

    private final KnowledgeDocumentMapper knowledgeDocumentMapper;
    private final RestTemplate restTemplate;

    @Value("${ai.service.url}")//Python FastAPI地址
    private String aiServiceUrl;

    /**
     * 上传文档到知识库
     * @param file 上传的 TXT 文件
     * @param operator 上传者
     * @return
     */
    @Transactional
    public KnowledgeDocumentVO upload(MultipartFile file, String operator) {
        //校验文件
        if (file.isEmpty()) {
            throw new RuntimeException("文件不能为空");
        }
        String fileName = file.getOriginalFilename();
        if (fileName == null) {
            throw new RuntimeException("文件名不能为空");
        }
        String lowerName = fileName.toLowerCase();//获取文件的格式
        if (!lowerName.endsWith(".txt") && !lowerName.endsWith(".pdf")
                && !lowerName.endsWith(".docx") && !lowerName.endsWith(".md")) {
            throw new RuntimeException("仅支持 TXT / PDF / DOCX / MD 格式");
        }

        //读取文件内容
        String content;
        try {
            content = new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("文件读取失败: " + e.getMessage());
        }

        //TXT和MD直接读取文本，PDF/DOCX由Python端解析，这里只传原始字节
        //调用Python FastAPI上传到ChromaDB向量库
        String md5 = "";
        String pyContent = "";
        int chunkCount = 0;
        try {
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            ByteArrayResource resource = new ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return fileName;
                }
            };
            body.add("file", resource);
            body.add("operator", operator);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            String url = aiServiceUrl + "/api/knowledge/upload";
            ResponseEntity<PythonUploadResponse> response = restTemplate.exchange(
                    url, HttpMethod.POST, requestEntity, PythonUploadResponse.class);

            PythonUploadResponse result = response.getBody();
            if (result == null) {
                throw new RuntimeException("AI知识库无响应");
            }

            if (result.isSuccess()) {
                //正常上传成功
                md5 = result.getMd5() != null ? result.getMd5() : "";
                pyContent = result.getContent() != null ? result.getContent() : "";
                chunkCount = result.getChunkCount();
                log.info("文档已上传到 ChromaDB: fileName={}, md5={}, chunks={}", fileName, md5, chunkCount);
            } else if (result.getMessage() != null && result.getMessage().contains("跳过")) {
                //重复文件：MD5相同，ChromaDB已存在，不视为错误
                log.info("文档已存在知识库中，跳过向量化: fileName={}, message={}", fileName, result.getMessage());
                //从Python响应中获取md5（如果有），否则后续会为空
                md5 = result.getMd5() != null ? result.getMd5() : "";
            } else {
                throw new RuntimeException("AI知识库上传失败: " + result.getMessage());
            }

            //如果是TXT/MD且Python没返回content，用本地读取的内容
            if (pyContent.isEmpty() && (lowerName.endsWith(".txt") || lowerName.endsWith(".md"))) {
                pyContent = content.length() > 5000 ? content.substring(0, 5000) : content;
            }

        } catch (Exception e) {
            log.error("调用 FastAPI 上传知识库失败: {}", e.getMessage());
            throw new RuntimeException("AI知识库服务调用失败: " + e.getMessage());
        }

        //保存文档记录到 MySQL（MD5已存在则更新，不存在则插入）
        KnowledgeDocument doc;
        LambdaQueryWrapper<KnowledgeDocument> wrapper = Wrappers.lambdaQuery(KnowledgeDocument.class)
                .eq(KnowledgeDocument::getMd5, md5);
        KnowledgeDocument existing = knowledgeDocumentMapper.selectOne(wrapper);
        if (existing != null) {
            //MD5已存在：更新记录，恢复为正常状态
            existing.setFileName(fileName);
            existing.setFileSize((long) file.getSize());
            existing.setContent(pyContent);
            existing.setChunkCount(chunkCount);
            existing.setStatus(0);
            existing.setOperator(operator);
            existing.setUpdateTime(LocalDateTime.now());
            knowledgeDocumentMapper.updateById(existing);
            doc = existing;
            log.info("MySQL 文档记录已更新: fileName={}, md5={}", fileName, md5);
        } else {
            doc = KnowledgeDocument.builder()
                    .fileName(fileName)
                    .fileSize((long) file.getSize())
                    .md5(md5)
                    .content(pyContent)
                    .chunkCount(chunkCount)
                    .status(0)
                    .operator(operator)
                    .createTime(LocalDateTime.now())
                    .updateTime(LocalDateTime.now())
                    .build();
            knowledgeDocumentMapper.insert(doc);
        }

        return toVO(doc);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        KnowledgeDocument doc = knowledgeDocumentMapper.selectById(id);
        if (doc == null) {
            throw new RuntimeException("文档不存在");
        }
        if (doc.getStatus() == 1) {
            throw new RuntimeException("文档已被删除");
        }

        //调用 Python FastAPI 从 ChromaDB 中删除向量
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> requestEntity = new HttpEntity<>(
                    "{\"file_name\": \"" + doc.getFileName() + "\"}",
                    headers
            );

            String url = aiServiceUrl + "/api/knowledge/delete";
            ResponseEntity<PythonDeleteResponse> response = restTemplate.exchange(
                    url, HttpMethod.DELETE, requestEntity, PythonDeleteResponse.class);

            PythonDeleteResponse result = response.getBody();
            if (result != null && result.isSuccess()) {
                log.info("ChromaDB 向量删除成功: fileName={}", doc.getFileName());
            } else {
                log.warn("ChromaDB 向量删除可能未完成: {}", result != null ? result.getMessage() : "无响应");
            }
        } catch (Exception e) {
            log.error("调用 FastAPI 删除知识库向量失败: {}", e.getMessage());
            //这里不中断事务，MySQL 仍然标记删除，保证数据最终一致
        }

        //MySQL 逻辑删除
        doc.setStatus(1);
        doc.setUpdateTime(LocalDateTime.now());
        knowledgeDocumentMapper.updateById(doc);
    }

    @Override
    @Transactional(readOnly = true)
    public List<KnowledgeDocumentVO> listDocuments() {
        LambdaQueryWrapper<KnowledgeDocument> wrapper = Wrappers.lambdaQuery(KnowledgeDocument.class)
                .eq(KnowledgeDocument::getStatus, 0)
                .orderByDesc(KnowledgeDocument::getCreateTime)
                .last("LIMIT 200");
        List<KnowledgeDocument> list = knowledgeDocumentMapper.selectList(wrapper);
        return list.stream().map(this::toVO).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public KnowledgeDocument getById(Long id) {
        return knowledgeDocumentMapper.selectById(id);
    }

    /**
     * 实体转 VO：将数据库记录转为前端展示格式
     */
    private KnowledgeDocumentVO toVO(KnowledgeDocument doc) {
        //文件大小格式化：自动转为 B / KB / MB
        String sizeDisplay;
        long size = doc.getFileSize() != null ? doc.getFileSize() : 0;
        if (size < 1024) {
            sizeDisplay = size + " B";
        } else if (size < 1024 * 1024) {
            sizeDisplay = String.format("%.1f KB", size / 1024.0);
        } else {
            sizeDisplay = String.format("%.1f MB", size / (1024.0 * 1024.0));
        }

        return KnowledgeDocumentVO.builder()
                .id(doc.getId())
                .fileName(doc.getFileName())
                .fileSize(doc.getFileSize())
                .fileSizeDisplay(sizeDisplay)
                .chunkCount(doc.getChunkCount())
                .md5(doc.getMd5())
                .status(doc.getStatus())
                .operator(doc.getOperator())
                .createTime(doc.getCreateTime())
                .build();
    }

    /**
     * Python FastAPI 上传响应：/api/knowledge/upload 的返回格式
     */
    @Data
    private static class PythonUploadResponse {
        private boolean success;//是否成功
        private String message;//提示信息
        private String file_name;//文件名
        private String md5;//文件MD5
        private String content;//提取的文本内容（预览用）
        private int chunk_count;//分块数量

        public boolean isSuccess() { return success; }
        public String getMd5() { return md5 != null ? md5 : ""; }
        public String getContent() { return content != null ? content : ""; }
        public int getChunkCount() { return chunk_count; }
    }

    /**
     * Python FastAPI 删除响应：/api/knowledge/delete 的返回格式
     */
    @Data
    private static class PythonDeleteResponse {
        private boolean success;//是否成功
        private String message;//提示信息

        public boolean isSuccess() { return success; }
    }
}
