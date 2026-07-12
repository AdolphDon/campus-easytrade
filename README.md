# 校易帮 - 校园互助交易平台

面向高校场景的二手商品交易与生活服务平台，集成 AI 智能客服，实现全流程交易闭环。技术亮点：Spring Boot 3 + Redis 分布式锁 + RocketMQ 延迟消息 + 跨语言 AI 微服务 + Docker 容器化部署。

## 项目简介
本项目旨在解决校园二手交易缺乏可靠平台的问题。采用了前后端分离架构（前端界面和脚手架由 AI 代码辅助工具生成，重点聚焦后端核心业务），实现了用户注册、商品发布、购物车、订单管理、支付与 AI 智能问答的完整业务闭环。系统具备高并发缓存策略、异步解耦能力以及多语言 AI 拓展能力，访问网址：http://120.27.216.138。

## 核心功能
**权限与安全：** 基于 SpringSecurity + JWT 实现细粒度权限管控与 Token 无感续签，确保会话安全。

**交易全流程：** 包含商品管理、购物车、下单、支付。对接支付宝沙箱，实现真实支付链路闭环。

**高并发缓存：** 使用 Redis 缓存热点商品，采用 Redisson 分布式锁保障高并发下数据一致性，解决商品超卖问题。

**异步解耦与高可靠：** 利用 RocketMQ 延迟消息处理“订单超时自动关闭”业务，并配置定时任务兜底，保证分布式环境下最终一致性。

**实时聊天系统：** 基于 WebSocket 实现用户间实时聊天，加入心跳保活和断线重连机制，提升网络稳定性。

**AI 智能助手：** 自研 Python 大模型推理微服务，基于 RAG 和 Agent 状态机实现智能问答，通过 SSE 流式输出推理结果。

**容器化部署：** 使用 Docker Compose 一键编排业务服务、MySQL、Redis、RocketMQ，实现环境隔离与标准化部署。

## 技术栈
**后端框架：** Spring Boot、MyBatis-Plus、Spring Security、JWT。
**数据存储：** MySQL、Redis。
**消息队列：** RocketMQ。
**AI 微服务：** Python、LangGraph、FastAPI、SSE。
**通讯协议：** WebSocket、HTTP REST。
**部署运维：** Docker、Docker Compose。

## 系统架构简述
客户端（Vue前端、WebSocket）请求经由网关层进入。网关层通过 Spring Security + JWT 进行统一认证。随后请求转发至 Java 业务服务层（包含用户/商品/订单/支付模块）。业务层内部结合 Redisson 分布式锁和 RocketMQ 消息队列，并与 WebSocket 服务端配合。当需要 AI 能力时，Java 业务服务层调用基于 Python 的 AI 微服务（含 RAG 检索），AI 微服务通过 SSE 协议将流式结果返回前端。底层数据层由 MySQL、Redis 缓存和 RocketMQ Broker 支撑。

## 快速启动（本地运行）
由于项目涉及多个组件依赖（MySQL、Redis、RocketMQ），推荐使用 Docker Compose 一键启动环境。

1. 克隆项目代码到本地。
2. 修改 docker-compose.yml 中的环境变量，配置你的支付宝沙箱密钥、大模型 API KEY 等敏感信息。
3. 在项目根目录下执行 docker-compose up -d 一键启动。
4. 启动成功后，访问对应端口即可进入平台。

## 作者
Adphlow
联系邮箱：2277287317@qq.com
