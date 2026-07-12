package com.campus.controller;

import com.campus.entity.KnowledgeDocument;
import com.campus.result.Result;
import com.campus.service.KnowledgeDocumentService;
import com.campus.vo.KnowledgeDocumentVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.campus.utils.SecurityUtil.getCurrentUserId;

/**
 * 管理端-知识库文档管理接口
 * 管理员上传/删除/查看知识库文档，同步操作Python FastAPI的ChromaDB向量库
 */
@Slf4j
@Api(tags = "知识库管理接口")
@RestController
@RequestMapping("/admin/knowledge")
@RequiredArgsConstructor
public class KnowledgeDocumentController {

    private final KnowledgeDocumentService knowledgeDocumentService;

    /**
     * 上传文档到知识库
     */
    @PostMapping("/upload")
    @ApiOperation("上传文档到知识库")
    public Result<KnowledgeDocumentVO> upload(@RequestParam("file") MultipartFile file) {
        Long adminId = getCurrentUserId();
        String operator = "管理员" + adminId;
        KnowledgeDocumentVO vo = knowledgeDocumentService.upload(file, operator);
        return Result.success(vo);
    }

    /**
     * 从知识库删除文档
     */
    @DeleteMapping("/delete/{id}")
    @ApiOperation("从知识库删除文档")
    public Result delete(@PathVariable Long id) {
        knowledgeDocumentService.delete(id);
        return Result.success();
    }

    /**
     * 获取知识库文档列表
     */
    @GetMapping("/list")
    @ApiOperation("获取知识库文档列表")
    public Result<List<KnowledgeDocumentVO>> list() {
        List<KnowledgeDocumentVO> list = knowledgeDocumentService.listDocuments();
        return Result.success(list);
    }

    /**
     * 获取文档文本内容(预览用)
     */
    @GetMapping("/content/{id}")
    @ApiOperation("获取文档文本内容（预览用）")
    public Result<Map<String, Object>> content(@PathVariable Long id) {
        KnowledgeDocument doc = knowledgeDocumentService.getById(id);
        if (doc == null) {
            return Result.error("文档不存在");
        }
        if (doc.getStatus() == 1) {
            return Result.error("文档已被删除");
        }
        Map<String, Object> data = new HashMap<>();
        data.put("id", doc.getId());
        data.put("fileName", doc.getFileName());
        data.put("content", doc.getContent() != null ? doc.getContent() : "");
        return Result.success(data);
    }
}
