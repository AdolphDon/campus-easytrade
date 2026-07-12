package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 获取平台公告-管理端用户端通用，包含编辑发布
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnnouncementVO {
    //基础返回数据，给用户端看与管理端看
    private Long id;
    private String publisher;//发布者(作为修改公告的回显数据)
    private String content;//公告内容(作为修改公告的回显数据)
    private LocalDateTime publishTime;//发布时间
    //给管理端看的数据
    private Integer type;//类型：1=平台公告，2=平台动态(作为修改公告的回显数据)
    private LocalDateTime updateTime;//修改时间
    private String publisherUserName;//发布者用户名
    private Integer deleted;//是否删除 0-未删除 1-已删除
}
