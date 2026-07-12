package com.campus.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 平台公开信息统一 VO（公告/动态/资讯）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlatformPostVO {
    private Long id;
    private String title;
    private String content;
    private String coverImage;
    private String publisher;
    private LocalDateTime publishTime;
    private Integer type; // 1-公告 2-动态 3-资讯
}
