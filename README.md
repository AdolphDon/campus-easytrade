# 校易帮 - 校园互助交易平台

> 面向高校场景的二手交易与生活服务平台，集成 **AI 智能客服（RAG + Agent）**，已部署至阿里云。

**公网访问**：http://120.27.216.138

---

## 项目简介

校易帮是一个校园互助生态平台，核心功能包括二手商品交易、实时聊天、AI 智能客服。用户可以在平台上发布/浏览/购买二手商品，与卖家实时沟通，以及通过 AI 客服进行商品搜索、规则咨询和购物车操作。

**技术亮点**：Java + Python 异构架构，AI Agent 实现"对话即服务"——用户自然语言说"帮我找二手高数书并加入购物车"，AI 自动搜索商品并执行加购操作。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Spring Boot 2.7.18（多模块 Maven） |
| ORM | MyBatis-Plus 3.5.5 |
| 数据库 | MySQL 8.0 |
| 缓存 | Redis（分层缓存 + Bloom 过滤器 + Lua 原子库存） |
| 消息队列 | RocketMQ 2.2.3（延迟消息 + 异步消费） |
| 安全 | Spring Security + JWT + Redis Session |
| 实时通信 | WebSocket（聊天 + 账户状态推送） |
| 支付 | 支付宝沙箱（扫码支付 + 异步回调） |
| 对象存储 | 阿里云 OSS |
| 前端 | 原生 JS + Vue 3（CDN）+ Element Plus |
| AI 模型 | 通义千问 Qwen3-max（阿里云百炼） |
| AI 框架 | LangGraph + LangChain + ChromaDB |
| AI 服务 | Python FastAPI |
| 部署 | Nginx + Docker Compose（7 容器） |

---

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         用户浏览器                                │
└─────────────┬──────────────────────────────────┬─────────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────┐       ┌──────────────────────────────┐
│        Nginx            │       │       WebSocket              │
│    (反向代理 + 静态资源)  │       │   (聊天 + 状态推送)            │
└─────────────┬───────────┘       └──────────────┬───────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Spring Boot (业务中台)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ 用户系统  │ │ 商品系统  │ │ 订单系统  │ │ AI 客服网关       │   │
│  │ 登录注册  │ │ 发布审核  │ │ 下单支付  │ │ 上下文注入+转发    │   │
│  └──────────┘ └──────────┘ └──────────┘ └────────┬─────────┘   │
└──────────────────────────────────────────────────┼──────────────┘
                                                   │ HTTP
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                Python FastAPI (AI 推理微服务)                    │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ LangGraph Agent   │  │ ChromaDB     │  │ Tool Calling     │   │
│  │ ReAct 双节点循环   │  │ 向量检索 Top4 │  │ 搜商品/查公告/加购 │   │
│  └──────────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 功能模块

### 用户端
- 邮箱验证码注册 / 登录 / 找回密码
- 个人中心（头像上传、资料修改、信用分历史）
- 商品浏览（分类筛选、关键词搜索、分页）
- 商品发布（多图上传、交易方式选择）
- 购物车（按卖家分组、批量结算）
- 订单管理（待付款/待发货/待收货/已完成）
- 收藏夹、信用分体系

### 商家端
- 商品管理（上架/下架/编辑）
- 智能审核：修改商品自动风险评级，低风险免审
- 订单发货、收益查看

### 管理员端
- 用户管理（启用/禁用/封禁/信用调整）
- 商品审核（人工通过/拒绝、查看拦截详情）
- 敏感词管理（运行时增删重载）
- 校园资讯/公告发布
- AI 知识库文档管理

### AI 智能客服
- RAG 知识库问答（平台规则、使用指南）
- 商品搜索（自然语言 → 工具调用 → 返回结果）
- 购物车操作（"把XX加入购物车"一键执行）
- 多轮对话（session_id 持久化，30+ 轮连续对话）
- 订单上下文感知（自动查询待付款订单）

### 实时通信
- 买家卖家 WebSocket 即时聊天（文本/图片/商品卡片）
- 账户状态实时推送（封禁通知 + 倒计时强制下线）

### 校园特色
- 大学 + 宿舍楼地理围栏
- 高德地图校园跳蚤市场
- 三种交易方式：卖家配送 / 自取 / 协商

---

## 核心亮点

### 1. AI Agent 智能客服
基于 **LangGraph StateGraph** 实现 ReAct（推理-行动）循环，绑定商品搜索、公告查询、添加购物车三个工具。LLM 自主决定何时调用工具、何时给出最终回答。**ContextVar 透传 JWT** 实现多用户隔离，**四层安全防护**防死循环。

### 2. RAG 检索增强生成
支持 PDF/Word/TXT/Markdown 多格式文档上传，PyMuPDF + python-docx 文本提取，**MD5 去重**防止重复索引，语义分块 + 重叠窗口优化检索，**Qwen3-max** 生成回答。Prompt 行为约束有效抑制幻觉。

### 3. 高并发库存控制
**Redis Lua 原子脚本**批量校验 + 扣减，任一商品不足则全部回滚，彻底避免超卖。**Bloom 过滤器**防缓存穿透，**分层 TTL + 随机抖动**防雪崩，**两段式校验**保数据一致。

### 4. 消息驱动异步解耦
**RocketMQ 延迟消息** 30 分钟超时自动取消订单，**定时扫表兜底**防消息丢失。支付成功异步消费减库存 + 清理购物车，`setIfAbsent` 幂等保证。

### 5. 智能审核系统
**DFA 敏感词自动检测**（Hutool WordTree）+ **7 级审核状态机**。商品修改按变更字段自动计算风险等级——图片换或价格波动 >20% 高风险必须重审，库存/分类调整为低风险免审。

### 6. 跨语言协同架构
Java 业务中台预加载订单上下文 → 转发 AI 推理 → Python Agent 按需回调 Java `/ai-api/`。减少冗余跨服务调用，trace_id 透传串联日志。

---

## 项目结构

```
campus-easytrade/                  # 后端（Spring Boot 多模块）
├── campus-web/                    # 启动模块（Application + 静态资源）
├── campus-business/               # 业务模块
│   ├── controller/                # 18 个 REST Controller
│   ├── service/impl/              # 服务层实现
│   ├── entity/                    # 27 个实体类
│   └── mapper/                    # MyBatis-Plus Mapper
├── campus-common/                 # 公共模块
│   ├── config/                    # Redis/WebSocket/Security 配置
│   ├── filter/                    # JWT 认证过滤器
│   ├── websocket/                 # WebSocket Handler
│   ├── mq/                        # RocketMQ Consumer
│   └── utils/                     # 工具类（Bloom/敏感词/Risk）
├── pom.xml                        # 父 POM
└── docker-compose.yml

front-end/                         # 前端（原生 JS + Vue3 混合）
├── pages/                         # HTML 页面（SPA 内嵌路由）
├── js/                            # api.js / user.js / admin.js
├── css/                           # 样式表
└── components/                    # Vue3 组件（ChatIM / OrderDialog 等）

agent_demo/                        # AI Agent 推理微服务
├── src/
│   ├── main.py                    # FastAPI 入口
│   ├── core/agent.py              # LangGraph ReAct 引擎
│   ├── tools/tool_defs.py         # 工具定义（含 AST 安全计算器）
│   ├── api/routes.py              # REST API + SSE 流式
│   └── utils/                     # 结构化日志 + 异常体系
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

---

## 数据库设计（核心表）

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| user | 用户表 | 信用分、余额（冻结余额）、学校关联、BCrypt 密码 |
| goods | 商品表 | 7 级审核状态、风险等级、交易方式、申诉次数 |
| goods_image | 商品图片 | OSS URL、排序（首图为封面） |
| order | 订单表 | Snowflake 订单号、合单 payment_no、支付状态 |
| order_item | 订单项 | 按卖家拆单、佣金、结算状态、物流状态 |
| cart | 购物车 | 用户-商品关联、选中状态 |
| chat_session | 会话 | 对称 participant 设计、双向未读数 |
| chat_message | 消息 | 文本/图片/商品卡片三种类型 |
| knowledge_document | 知识库 | MD5 去重、分块数、文档预览 |
| university / dormitory | 学校宿舍 | 经纬度 + 地理围栏半径 |

共 **21 张表**，完整覆盖用户、商品、订单、支付、聊天、AI 知识库业务链路。

---

## 部署

### 环境要求
- Docker & Docker Compose
- 阿里云 OSS Bucket + 支付宝沙箱账号（可选，测试可用 Mock）

### 一键启动

```bash
# 1. 克隆项目
git clone https://github.com/your-username/campus-easytrade.git
cd campus-easytrade

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key 等配置

# 3. 启动所有服务
docker compose up -d

# 4. 访问
# 前端：http://localhost
# API 文档：http://localhost:8080/doc.html
# AI 服务健康检查：http://localhost:8000/agent/health
```

### 容器清单

| 容器 | 端口 | 说明 |
|------|------|------|
| nginx | 80 | 反向代理 + 静态资源 |
| spring-boot | 8080 | 业务中台 |
| python-ai | 8000 | AI 推理服务 |
| mysql | 3306 | 数据库 |
| redis | 6379 | 缓存 / 库存 |
| rocketmq-namesrv | 9876 | 消息队列 |
| rocketmq-broker | 10911 | 消息队列 |

---

## 演进路线

- [x] 基础交易闭环（商品 → 购物车 → 订单 → 支付）
- [x] WebSocket 实时聊天
- [x] AI RAG 智能客服
- [x] LangGraph Agent 工具调用
- [x] 敏感词自动审核 + 风险评级
- [x] Docker Compose 一键部署
- [ ] SSE 流式 AI 回复（agent_demo 已实现，待回迁）
- [ ] Redis Cluster 分布式库存
- [ ] ELK 日志监控
- [ ] 压测与性能调优

---

## 关于作者

独立全栈开发，从需求分析、数据库设计、前后端编码到 Docker 部署上线全链路完成。Java 后端 + Python AI 双技术栈，关注 AI Agent 在企业级后端中的落地实践。

---

## License

MIT
