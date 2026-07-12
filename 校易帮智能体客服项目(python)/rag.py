"""
RAG + Agent 智能问答服务-相当于业务层，实现业务逻辑，受fastapi_service调用
使用 LangGraph StateGraph 编排：检索知识库 → 大模型自主调用工具 → 返回最终回答
"""
from typing import TypedDict, List, Literal

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from tool_service import TOOLS, access_token_var
from file_history_store import get_history
from vector_stores import VectorStoreService
from langchain_community.embeddings import DashScopeEmbeddings
import config_data as config
from langchain_community.chat_models.tongyi import ChatTongyi

# LangGraph状态：仅维护消息列表，由graph内部循环管理
class AgentState(TypedDict):
    # AgentState(LangGraph图流程的全局状态容器)：相当于整个对话链路的上下文仓库，图里每一步节点都能读取、修改这个状态
    # TypedDict字典：用来存放整个智能体流程全程共享的数据

    # 消息列表，里面存大模型标准消息对象:保存完整对话历史、工具交互记录，LangGraph各个节点共享读取
    messages: List[BaseMessage]

class RagService(object):
    # 构造函数-用户提问时，用这个服务检索知识库匹配的参考文档
    def __init__(self):
        # 初始化向量存储服务
        self.vector_service = VectorStoreService(
            embedding=DashScopeEmbeddings(model=config.embedding_model_name)
        )
        # 初始化通义千问对话大模型
        self.chat_model = ChatTongyi(model=config.chat_model_name)
        # 给大模型绑定自定义工具（加购、查订单等），开启Tool Calling能力
        # 告诉大模型有哪些工具、怎么调用
        self.tool_model = self.chat_model.bind_tools(TOOLS)
        # 构建LangGraph智能体流程图，赋值为实例属性
        self.app = self._build_graph()

    # 构建LangGraph智能体流程
    def _build_graph(self):
        """构建 LangGraph StateGraph：agent（调模型）↔ tools（执行工具）"""

        # 1.创建状态流程图，绑定全局状态AgentState：流程上下文，全程保存对话记录、工具返回数据
        workflow = StateGraph(AgentState)

        # 2.注册两个核心节点-Node节点：流程里每一个独立执行步骤
        # ToolNode是框架自带的工具执行器、self._call_agent是自定义私有方法
        workflow.add_node("agent", self._call_agent) #***agent节点：调用绑定工具的大模型，判断用户意图、生成工具调用指令或最终回答
        # 通过ToolNode真正调用工具
        workflow.add_node("tools", ToolNode(TOOLS)) #tools节点：自动执行@tool装饰的函数（加购、查订单，请求Java后端）

        # 3.设置流程入口：最先执行agent节点-第一步：把用户提问塞入state，执行大模型推理
        workflow.set_entry_point("agent")

        # 4.条件分支：agent执行完判断下一步走哪
        workflow.add_conditional_edges(
            "agent", #从哪个节点出来做判断
            self._should_continue, #***判断函数：执行后只能返回两种值："tools"或END，"tools"跳"tools"节点，END终止结束
            {"tools": "tools", END: END}, #映射字典：返回值 → 跳转到哪个节点/结束
        )

        # 5.工具执行完，必须回到agent节点
        workflow.add_edge("tools", "agent")

        # 6.把节点、跳转规则打包成可运行的应用实例，赋值给self.app
        # 后续调用self.app.invoke(state)即可完整跑一遍「模型判断 ↔ 工具调用」循环
        return workflow.compile()

    # 内部调用LangGraph智能体流程中agent节点绑定的带工具的大模型
    # 把完整对话历史传给绑定工具的大模型，让AI判断用户需求，产出回答或工具调用指令，再把AI输出更新到全局会话状态
    def _call_agent(self, state: AgentState) -> dict:
        """agent 节点：调用大模型，返回 AIMessage"""
        # 拿当前所有对话消息，调用带工具能力的大模型
        response = self.tool_model.invoke(state["messages"])
        # 把大模型返回的AI消息，包裹成列表更新到全局状态
        return {"messages": [response]}

    #agent节点后用来判断上次回答的对话中是否有调用工具指令，来决定的下一个节点是什么
    @staticmethod # 静态方法，不需要实例self也能运行，只依赖传入的state状态数据
    def _should_continue(state: AgentState) -> Literal["tools", "__end__"]:
        """条件边：有 tool_calls 就去 tools 节点，否则结束"""
        # 取出对话里最后一条消息（上一步agent大模型输出的内容）
        last = state["messages"][-1] #全部对话消息列表-取列表最后一条
        # 判断这条消息是否携带工具调用指令
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        # 没有工具调用，流程终止
        return END

    #这是fastapi接口中调用的rag业务方法(用户原始提问、用户会话标识、后端提前查好的用户订单文本、用户JWT凭证)
    def chat_with_tools(self, input_text: str, session_id: str,
                        order_context: str = "", access_token: str = "") -> str:
        """
        带Tool Calling的智能客服问答（LangGraph 编排）
        流程：查知识库 → 构建消息 → 启动 graph → 保存历史
        """
        # 设置用户JWT token（供工具调用Java接口时使用）
        token = access_token_var.set(access_token)
        try:
            # 1.获取会话id用户对话历史
            history = get_history(session_id).messages

            # 2.检索知识库：将用户问题向量化，在Chroma知识库匹配相似文档片段
            retriever = self.vector_service.get_retriever()
            docs = retriever.invoke(input_text)

            if not docs: #无参考资料，AI仅靠基础知识回答
                context = "无相关参考资料"
                print("⚠️ 检索结果: 未找到相关文档，AI将使用通用知识回答")
            else: #有检索结果：拼接所有文档内容到上下文
                context = ""
                for doc in docs:
                    context += f"文档片段：{doc.page_content}\n文档元数据：{doc.metadata}\n\n"
                doc_count = context.count("文档片段：")
                print(f"✅ 检索结果: 找到 {doc_count} 个相关文档片段")
                print("=" * 20)

            order_info = f"\n当前用户的未完成订单信息：\n{order_context}\n" if order_context else ""

            # 3.构建系统提示词
            system_prompt = (
                f"你是一个校园二手交易平台的智能客服助手。你可以：\n"
                f"1. 根据以下参考资料回答平台规则问题\n"
                f"2. 调用搜索工具查找商品\n"
                f"3. 调用平台信息工具查询公告/动态/资讯\n"
                f"4. 调用添加购物车工具将商品加入用户的购物车\n\n"
                f"参考资料：\n{context}{order_info}\n"
                f"回答规则：\n"
                f"- 订单信息已在上方提供，直接根据这些信息回答用户的订单问题，不要额外编造\n"
                f"- 需要搜索商品或查平台信息时先调用工具获取，不要凭猜测回答\n"
                f"- 如果工具返回结果为空，如实告知用户\n"
                f"- 回答简洁、专业、有礼貌"
            )

            messages = [
                SystemMessage(content=system_prompt), #系统角色+知识库+订单上下文
                *history, #历史聊天记录
                HumanMessage(content=input_text), #用户本次新提问
            ]

            # 4.启动LangGraph agent循环：self.app为LangGraph智能体流程
            # .invoke()是LangGraph提供的同步执行入口方法
            result = self.app.invoke(
                {"messages": messages},
                {"recursion_limit": 20}, #限制最大循环次数，防止死循环
            )

            # 5.提取最终回答-倒序遍历找到最终回复
            final_messages = result["messages"]
            answer = ""
            for msg in reversed(final_messages):
                if isinstance(msg, AIMessage) and msg.content:
                    answer = msg.content
                    break

            if not answer:
                return "抱歉，我暂时无法回答这个问题，请稍后再试。"

            # 6.保存本次对话历史
            # 把用户提问+AI回答存入会话存储，下次同一session_id进来可以读取历史，实现连续对话
            history_store = get_history(session_id)
            history_store.add_messages([
                HumanMessage(content=input_text),
                AIMessage(content=answer),
            ])

            print(f"🤖 AI最终回答: {answer[:150]}...")
            return answer
        except Exception as e:
            print(f"❌ AI服务异常: {e}")
            return "抱歉，我暂时无法回答这个问题，请稍后再试。"
        finally:
            # 恢复之前的token
            access_token_var.reset(token)
