package com.campus.service;

import com.campus.dto.CampusNewsEditDTO;
import com.campus.dto.CampusNewsPageQueryDTO;
import com.campus.result.PageResult;
import com.campus.vo.CampusNewsVO;

public interface CampusNewsService {

    /**
     * 统一分页查询资讯：用户端、管理端共用
     * @param dto
     * @return
     */
    PageResult<CampusNewsVO> pageQuery(CampusNewsPageQueryDTO dto,Integer role);

    /**
     * 发布校园资讯
     * @param dto
     */
    void publishNews(CampusNewsEditDTO dto);

    /**
     *  编辑校园资讯
     * @param id
     * @param dto
     */
    void updateNews(Long id, CampusNewsEditDTO dto);

    /**
     * 删除校园资讯
     * @param id
     */
    void deleteNews(Long id);

    /**
     * 恢复已删除校园资讯
     * @param id
     */
    void restoreNews(Long id);

    /**
     * 启用校园资讯
     * @param id
     */
    void enableNews(Long id);

    /**
     * 禁用校园资讯
     * @param id
     */
    void disableNews(Long id);
}
