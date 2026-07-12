"""
工具服务 - Tool Calling
使用 @tool 装饰器定义AI可调用的工具函数（映射Java后端AI内部接口）
"""
import json
import contextvars
import requests
from langchain_core.tools import tool
import config_data as config

JAVA_BASE_URL = config.java_base_url #Java后端地址
REQUEST_TIMEOUT = 10 #定义常量请求超时时间=10秒

# 线程安全的上下文变量，用于传递当前用户的JWT token
access_token_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "access_token", default="" #token标识符，当没传时设置为空字符不会报错
)

# 判断是否携带token
def _auth_headers() -> dict:
    """从上下文变量获取当前用户的认证头"""
    token = access_token_var.get()
    if token:
        return {"Authorization": token}
    return {}


@tool #LangChain提供的工具标记装饰器：框架自动识别该函数为可调用工具，能被你的LangGraph ToolNode加载
def search_goods(keyword: str = "") -> str:
    """按关键词搜索正在出售的商品。当用户问'有没有xx卖？''我想买xx''帮我找xx'时调用"""
    try:
        # 关键词为空时，不传递该请求参数
        headers = _auth_headers()
        params = {"keyword": keyword} if keyword else {}
        resp = requests.get(
            f"{JAVA_BASE_URL}/ai-api/goods/search", #请求Java后端商品搜索接口
            params=params, #这是发给后端请求要携带的参数
            headers=headers,
            timeout=REQUEST_TIMEOUT, #超时时间复用全局常量
        )
        # resp为发送请求给后端调用接口后返回的完整响应载体
        return _extract_data(resp) #使用_extract_data自定义工具解析判断相应状态
    except requests.exceptions.Timeout:
        return json.dumps({"error": "请求超时，后端服务暂时不可用"}, ensure_ascii=False)
    except requests.exceptions.ConnectionError:
        return json.dumps({"error": "无法连接到后端服务，请稍后再试"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"工具执行失败: {str(e)}"}, ensure_ascii=False)


@tool
def get_platform_posts(type: int = 1) -> str:
    """查询平台发布的公开信息。当用户问'有什么公告？''最近有什么动态？''校园新闻'时调用"""
    try:
        headers = _auth_headers()
        resp = requests.get(
            f"{JAVA_BASE_URL}/ai-api/platform/posts",
            params={"type": type},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        return _extract_data(resp)
    except requests.exceptions.Timeout:
        return json.dumps({"error": "请求超时，后端服务暂时不可用"}, ensure_ascii=False)
    except requests.exceptions.ConnectionError:
        return json.dumps({"error": "无法连接到后端服务，请稍后再试"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"工具执行失败: {str(e)}"}, ensure_ascii=False)


@tool
def add_to_cart(goods_name: str, quantity: int = 1) -> str:
    """将指定商品添加到当前用户的购物车。当用户说'添加xx到购物车''把xx加入购物车''我要买xx'时调用"""
    try:
        headers = _auth_headers() #获取token执行封装请求头-区分不同登录用户的购物车
        headers["Content-Type"] = "application/json" #告诉Java后端请求体是JSON
        resp = requests.post(
            f"{JAVA_BASE_URL}/ai-api/cart/add",
            json={"goodsName": goods_name, "quantity": quantity},
            headers=headers,
            timeout=REQUEST_TIMEOUT, #超时时间复用全局常量
        )
        resp.raise_for_status() #自动判断HTTP状态码
        body = resp.json()
        if body.get("code") == 0:
            return json.dumps(
                {"success": True, "message": f"已将「{goods_name}」添加到购物车"},
                ensure_ascii=False,
            )
        else:
            return json.dumps(
                {"success": False, "message": body.get("message", "添加失败")},
                ensure_ascii=False,
            )
    except requests.exceptions.Timeout:
        return json.dumps({"error": "请求超时，后端服务暂时不可用"}, ensure_ascii=False)
    except requests.exceptions.ConnectionError:
        return json.dumps({"error": "无法连接到后端服务，请稍后再试"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"工具执行失败: {str(e)}"}, ensure_ascii=False)

# 用来解析java后端相应的方法
def _extract_data(resp: requests.Response) -> str:
    """从Java Result<T> 响应中提取业务数据或错误信息转换成JSON字符串给llm读"""
    resp.raise_for_status() #自动判断HTTP状态码
    body = resp.json() #将Java接口返回的JSON字符串转为Python字典，对应后端标准结构
    # 判断状态码，0成功就取出后端业务主体
    if body.get("code") == 0:
        data = body.get("data")
        # data为 null：直接返回纯文本无数据，大模型能理解没有查询到内容
        return json.dumps(data, ensure_ascii=False) if data is not None else "无数据"
    else:
        # data不为空：序列化JSON返回，ensure_ascii=False保证中文不乱码
        return json.dumps({"error": body.get("message", "未知错误")}, ensure_ascii=False)


# 工具列表，供 LangGraph注册
TOOLS = [search_goods, get_platform_posts, add_to_cart]
