package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.dto.AiChatDTO;
import com.campus.entity.Order;
import com.campus.entity.OrderItem;
import com.campus.mapper.OrderItemMapper;
import com.campus.mapper.OrderMapper;
import com.campus.result.PageResult;
import com.campus.service.AiInternalService;
import com.campus.service.AiService;
import com.campus.vo.AiChatVO;
import com.campus.vo.GoodsListVO;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * AI智能客服服务实现
 * 调用 Python FastAPI 的 RAG 问答服务：接收用户问题 → 转发到 AI 服务 → 返回回答
 */
@Slf4j
@Service
@RequiredArgsConstructor//替代@Autowired注解的spring用法
public class AiServiceImpl implements AiService {

    private final RestTemplate restTemplate;//Spring的HTTP请求工具，用来调用Python AI接口
    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final AiInternalService aiInternalService;

    @Value("${ai.service.url}")//Python FastAPI地址
    private String aiServiceUrl;

    /**
     * 智能客服问答
     * @param dto 用户问题
     * @param sessionId 会话ID(用于区分不同用户的对话历史)
     * @param userId 当前用户ID
     * @param authHeader Authorization 请求头（透传给 Python 用于工具调用）
     * @return
     */
    public AiChatVO chat(AiChatDTO dto, String sessionId, Long userId, String authHeader) {
        //查当前用户未完成订单（作为买家或卖家），拼成上下文传给AI
        String orderContext = buildOrderContext(userId);

        //构建请求体JSON：传给Python FastAPI的/api/chat接口
        String safeInput = dto.getInput().replace("\"", "\\\"");
        String safeSession = sessionId != null ? sessionId : "user_001";
        String safeOrder = orderContext.replace("\"", "\\\"").replace("\n", "\\n");
        String safeToken = authHeader != null ? authHeader.replace("\"", "\\\"") : "";

        String requestJson = String.format(
                "{\"input\": \"%s\", \"session_id\": \"%s\", \"order_context\": \"%s\", \"access_token\": \"%s\"}",
                safeInput, safeSession, safeOrder, safeToken
        );

        //创建请求头-告诉Python后端：我给你的数据是JSON格式
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        //把【JSON请求体+请求头】打包成一个请求对象
        HttpEntity<String> requestEntity = new HttpEntity<>(requestJson, headers);

        try {
            //url：Python FastAPI提供的AI聊天接口
            String url = aiServiceUrl + "/api/chat";

            //发送POST请求到Python FastAPI
            ResponseEntity<PythonChatResponse> response = restTemplate.exchange(
                    url,//AI聊天接口路径
                    HttpMethod.POST,//POST请求
                    requestEntity,//携带的【JSON请求体+请求头】
                    PythonChatResponse.class//希望返回的类型
            );

            //获取AI返回的结果
            PythonChatResponse result = response.getBody();
            if (result == null) {
                throw new RuntimeException("AI服务返回为空");
            }

            //同时查询商品数据，供前端渲染可点击的卡片
            String input = dto.getInput();
            List<GoodsListVO> goodsList = null;
            String searchKeyword = extractSearchKeyword(input);
            if (searchKeyword != null) {
                try {
                    PageResult<GoodsListVO> pageResult = aiInternalService.searchGoods(searchKeyword);
                    if (pageResult != null && pageResult.getRecords() != null
                            && !pageResult.getRecords().isEmpty()) {
                        goodsList = pageResult.getRecords();
                    }
                } catch (Exception e) {
                    log.warn("查询关联商品失败: {}", e.getMessage());
                }
            }

            return AiChatVO.builder()
                    .answer(result.getAnswer())
                    .goodsList(goodsList)
                    .build();

        } catch (Exception e) {
            log.error("调用 AI 智能客服失败: {}", e.getMessage());
            throw new RuntimeException("AI 服务暂时不可用，请稍后再试: " + e.getMessage());
        }
    }

    /**
     * 查询当前用户未完成订单明细，格式化为上下文文本
     */
    private String buildOrderContext(Long userId) {
        try {
            //查买家订单ID列表
            List<Order> buyerOrders = orderMapper.selectList(
                    Wrappers.lambdaQuery(Order.class)
                            .select(Order::getId)
                            .eq(Order::getUserId, userId));
            List<Long> orderIds = buyerOrders.stream().map(Order::getId).collect(Collectors.toList());

            //查订单明细：order_id在买家订单中 或 seller_id=当前用户，且状态为未完成(0-待付款 1-已付款 2-已发货)
            LambdaQueryWrapper<OrderItem> wrapper = Wrappers.lambdaQuery(OrderItem.class);
            wrapper.and(w -> {
                if (!orderIds.isEmpty()) {
                    w.in(OrderItem::getOrderId, orderIds);
                    w.or();
                }
                w.eq(OrderItem::getSellerId, userId);
            });
            wrapper.in(OrderItem::getStatus, 0, 1, 2);

            List<OrderItem> items = orderItemMapper.selectList(wrapper);
            if (items.isEmpty()) {
                return "";
            }

            StringBuilder sb = new StringBuilder("【您的未完成订单】\n");
            for (OrderItem item : items) {
                String statusText;
                if (item.getStatus() == 0) {
                    statusText = "待付款";
                } else if (item.getStatus() == 1) {
                    statusText = "已付款";
                } else if (item.getStatus() == 2) {
                    statusText = "已发货";
                } else {
                    statusText = "未知";
                }
                sb.append("- ")
                  .append(statusText).append(" | ")
                  .append(item.getGoodsName()).append(" | ")
                  .append("￥").append(item.getPrice()).append(" | ")
                  .append("x").append(item.getQuantity()).append(" | ")
                  .append("卖家ID:").append(item.getSellerId())
                  .append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            log.error("查询未完成订单失败: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 从用户输入中提取商品搜索关键词
     */
    private String extractSearchKeyword(String input) {
        if (input == null || input.trim().isEmpty()) return null;
        String text = input.trim();

        // 有没有XX卖
        Matcher m = Pattern.compile("有没有(.+?)卖$").matcher(text);
        if (m.find()) return m.group(1).trim();

        // 我想要买XX / 我想买XX / 我要买XX
        m = Pattern.compile("(?:我想要买|我想买|我要买)(.+)").matcher(text);
        if (m.find()) return m.group(1).trim();

        // 有XX卖吗 / 有XX吗
        m = Pattern.compile("有(.+?)(?:卖)?(?:吗|的|$)").matcher(text);
        if (m.find()) return m.group(1).trim();

        // 找一下XX / 帮我找XX / 搜索XX
        m = Pattern.compile("(?:找一下|帮我找|搜索)(.+)").matcher(text);
        if (m.find()) return m.group(1).trim();

        // 纯商品名短文本（不含问句）
        if (text.length() >= 1 && text.length() <= 10
                && text.matches("[一-龥a-zA-Z0-9]+")
                && !text.matches(".*(?:什么|怎么|为什么|谁|如何|哪|是否).*")) {
            return text;
        }

        return null;
    }

    /**
     * Python FastAPI返回的聊天响应类
     */
    @Data
    private static class PythonChatResponse {
        private String answer;//AI回答内容
    }
}
