package com.campus.service;

import com.campus.entity.KnowledgeDocument;
import com.campus.vo.KnowledgeDocumentVO;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface KnowledgeDocumentService {

    /**
     * 上传文档到知识库
     * 步骤：保存文件到 MySQL 记录 → 调用 Python FastAPI 向量化存储到 ChromaDB
     * @param file 上传的 TXT 文件
     * @param operator 上传者
     * @return 文档展示信息
     */
    KnowledgeDocumentVO upload(MultipartFile file, String operator);

    /**
     * 从知识库删除文档（逻辑删除 + 同步删除 ChromaDB 向量）
     * @param id 文档ID
     */
    void delete(Long id);

    /**
     * 获取知识库文档列表
     * @return 正常状态的文档列表
     */
    List<KnowledgeDocumentVO> listDocuments();

    /**
     * 根据ID获取文档
     * @param id
     * @return
     */
    KnowledgeDocument getById(Long id);
}
