package com.campus.utils;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 全局获取当前登录用户工具类-从 SecurityContextHolder中获取当前登录用户ID
 */
public class SecurityUtil {

    /**
     * 获取当前登录用户ID
     */
    public static Long getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() != null) {
            return Long.parseLong(authentication.getPrincipal().toString());
        }
        throw new RuntimeException("用户未登录");
    }
}