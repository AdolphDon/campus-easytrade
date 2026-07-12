package com.campus.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT工具类-JWT令牌的 生成、解析、校验。登录成功后用它生成 Token，过滤器里用它验证 Token 是否有效
 * 负责 Token 的生成、解析、校验
 */
@Component
public class JwtUtil {

    @Value("${jwt.secret-key}")
    private String secret;

    @Value("${jwt.expiration}")
    private Long expiration;

    /**
     * 私有工具方法：获取签名密钥
     * 根据配置的密钥字节数组生成HMAC-SHA256签名密钥并转为SecretKey对象
     */
    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 生成Token
     * @param userId 用户ID
     * @param username 用户名
     * @param role 角色
     */
    public String generateToken(String userId, String username, String role) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .setSubject(userId)//存放userId，标准JWT主体字段
                .claim("username", username)
                .claim("role", role)
                .setIssuedAt(now)//签发时间
                .setExpiration(expiryDate)//过期时间
                //使用对称加密HS256对整个JWT签名，防止前端篡改载荷信息
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * 生成管理员模拟用户视角的临时Token
     * 保留 Admin 身份标识，但视图切换为用户端
     */
    public String generateAdminViewAsUserToken(String userId, String username) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .setSubject(userId)
                .claim("username", username)
                .claim("role", "ROLE_ADMIN")//仍为管理员角色
                .claim("viewMode", "USER")//视图模式：用户视角
                .setIssuedAt(now)//签发时间
                .setExpiration(expiryDate)//过期时间
                //使用对称加密HS256对整个JWT签名，防止前端篡改载荷信息
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * 解析Token
     */
    public Claims parseToken(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())//使用项目密钥校验签名，密钥不匹配直接抛异常
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    /**
     * 从Token获取用户ID
     */
    public String getUserIdFromToken(String token) {
        return parseToken(token).getSubject();
    }

    /**
     * 从Token获取用户名
     */
    public String getUsernameFromToken(String token) {
        return parseToken(token).get("username", String.class);
    }

    /**
     * 从Token获取角色
     */
    public String getUserRoleFromToken(String token) {
        return parseToken(token).get("role", String.class);
    }

    /**
     * 从Token获取视图模式
     * @return "USER" 或 null（null表示管理员视角）
     */
    public String getViewModeFromToken(String token) {
        return parseToken(token).get("viewMode", String.class);
    }

    /**
     * 校验Token是否有效
     */
    public boolean validateToken(String token) {
        try {
            //1.调用parseToken做底层签名、格式校验
            Claims claims = parseToken(token);
            //2.校验是否过期
            return !claims.getExpiration().before(new Date());
        } catch (Exception e) {
            return false;
        }
    }
}