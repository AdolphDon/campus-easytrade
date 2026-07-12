package com.campus.utils;

import cn.hutool.dfa.WordTree;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.PostConstruct;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 敏感词过滤器：基于Hutool的动态管理词库
 */
@Slf4j
@Component
public class SensitiveWordFilter {

    /** 敏感词树字典，用于快速检索过滤文本中的敏感词 */
    private final WordTree wordTree = new WordTree();

    /** 当前所有敏感词列表（用于后台展示和删除） */
    private final List<String> wordList = new ArrayList<>();

    /** 敏感词文件本地绝对路径 */
    private String filePath;

    @PostConstruct//作用：Bean完成依赖注入之后，自动执行的初始化方法
    public void init() {
        try {
            ClassPathResource resource = new ClassPathResource("sensitive_words.txt");
            try {
                filePath = resource.getFile().getAbsolutePath();
            } catch (Exception e) {
                log.warn("无法解析敏感词文件路径，仅支持内存操作: {}", e.getMessage());
            }
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
                List<String> words = reader.lines()
                        .map(String::trim)//每行去除首尾空格
                        .filter(w -> !w.isEmpty())//过滤空行
                        .collect(Collectors.toList());
                wordList.clear();//清空旧数据
                wordList.addAll(words);//把所有敏感词存入集合wordList，用于后台查询、删除敏感词
                wordTree.addWords(words);//将敏感词加载到字典树WordTree，用于高速文本敏感词匹配过滤
            }
        } catch (Exception e) {
            log.error("加载敏感词文件失败", e);
        }
    }

    /**
     * 判断文本是否包含敏感词
     */
    public boolean containsSensitive(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }
        return wordTree.match(text) != null;
    }

    /**
     * 获取所有敏感词(管理端展示)
     */
    @Cacheable(value = "sensitive:words", key = "'all'", sync = true)
    public List<String> getAllWords() {
        synchronized (wordList) {
            return new ArrayList<>(wordList);
        }
    }

    /**
     * 添加敏感词
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "sensitive:words", key = "'all'")
    public void addWord(String word) {
        if (word == null || word.trim().isEmpty()) {
            return;
        }
        word = word.trim();
        synchronized (wordList) {
            if (wordList.contains(word)) {
                return;
            }
            wordList.add(word);
            wordTree.addWord(word);
        }
        appendToFile(word);
    }

    /**
     * 删除敏感词
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "sensitive:words", key = "'all'")
    public void removeWord(String word) {
        if (word == null || word.trim().isEmpty()) {
            return;
        }
        word = word.trim();
        synchronized (wordList) {
            wordList.remove(word);
            rebuildTree();
        }
        rewriteFile();
    }

    /**
     * 重载文件到内存
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "sensitive:words", key = "'all'")
    public void reload() {
        init();
        log.info("敏感词库已重新加载");
    }

    private void rebuildTree() {
        wordTree.clear();
        wordTree.addWords(wordList);
    }

    private void appendToFile(String word) {
        if (filePath == null) return;
        try (BufferedWriter writer = new BufferedWriter(
                new OutputStreamWriter(new FileOutputStream(filePath, true), StandardCharsets.UTF_8))) {
            writer.write(word);
            writer.newLine();
        } catch (Exception e) {
            log.error("追加敏感词到文件失败: {}", e.getMessage());
        }
    }

    private void rewriteFile() {
        if (filePath == null) return;
        try {
            Path path = Paths.get(filePath);
            Files.write(path, wordList, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("重写敏感词文件失败: {}", e.getMessage());
        }
    }
}
