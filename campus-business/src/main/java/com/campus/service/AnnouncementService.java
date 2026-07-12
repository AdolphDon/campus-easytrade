package com.campus.service;

import com.campus.dto.AnnouncementEditDTO;
import com.campus.dto.AnnouncementPageQueryDTO;
import com.campus.entity.Announcement;
import com.campus.result.PageResult;
import com.campus.vo.AnnouncementVO;

import java.util.List;

public interface AnnouncementService {
    /**
     * 用户端-平台公告分页获取
     * @param dto
     * @param type
     * @return
     */
    PageResult<AnnouncementVO> getUserPage(AnnouncementPageQueryDTO dto, Integer type);

    /**
     * 管理端-平台动态与公告分页获取（支持类型+删除状态筛选）
     * @param dto
     * @return
     */
    PageResult<AnnouncementVO> getAdminPage(AnnouncementPageQueryDTO dto);

    /**
     * 发布平台公告/动态
     * @param dto
     */
    void publishAnnouncement(AnnouncementEditDTO dto);

    /**
     * 编辑平台公告/动态
     * @param id
     * @param dto
     */
    void updateAnnouncement(Long id, AnnouncementEditDTO dto);

    /**
     * 删除平台公告/动态(逻辑删除)
     * @param id
     */
    void deleteAnnouncement(Long id);

    /**
     * 恢复已删除平台公告/动态
     * @param id
     */
    void restoreAnnouncement(Long id);
}
