"""
读取历史消息、存入最新消息功能
存的时候：对象 → 字典 → JSON 文件 读的时候：JSON 文件 → 字典 → 对象 清空就是：写入空列表 []
"""
import json #导入Python内置JSON库-用于序列化/反序列化消息：把LangChain消息对象转成字典/JSON字符串，方便存储
import os #导入Python内置OS库：用于操作文件路径、文件夹、环境变量
from typing import Sequence #导入类型注解工具-Sequence是有序序列类型（列表、元组等）：用于给函数参数做类型标注，提升代码可读性和IDE提示
from langchain_core.chat_history import BaseChatMessageHistory #导入LangChain核心基类-聊天消息历史的抽象父类：自定义聊天历史必须继承这个类，实现规定的方法
# 导入LangChain核心消息相关工具：①所有消息类型的基类（用户消息、AI消息、系统消息） ②把消息对象 转成 字典（可序列化存储） ③把字典 转回 消息对象（加载回程序使用）
from langchain_core.messages import BaseMessage, message_to_dict, messages_from_dict

# 根据 session_id（会话 ID）获取对应用户的聊天历史
def get_history(session_id):
    return FileChatMessageHistory(session_id, "./chat_history") #./chat_history：存储聊天历史的文件夹

class FileChatMessageHistory(BaseChatMessageHistory):
    def __init__(self, session_id, storage_path):
        self.session_id = session_id #会话id
        self.storage_path = storage_path #不同会话id的存储文件，所在的文件夹路径
        # 完整的文件路径
        self.file_path = os.path.join(self.storage_path, self.session_id) #./chat_history/user_123.json

        # 确保文件夹是存在的：自动创建消息存储文件所在的文件夹(如果不存在就创建，存在就跳过，不报错)
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True) #os.path.dirname()：获取文件所在的文件夹路径./chat_history

    # 把json格式老消息通过self.messages读取出来(转成了消息对象格式)，新消息本来就是【消息对象】，此时两个都是对象→合并、一起转字典→写入JSON文件保存
    # 批量添加多条聊天消息，并自动把所有消息保存到本地 JSON 文件中，实现持久化
    def add_messages(self, messages: Sequence[BaseMessage]) -> None: #Sequence[BaseMessage]：接收一组消息（列表 / 元组都行）、无返回值

        all_messages = list(self.messages) #已有的消息列表：此messages是自定义方法
        all_messages.extend(messages) #新的和已有的融合成一个list

        # 消息对象不能直接存文件（存了也是乱码）字典可以转成 JSON 存文件
        # LangChain核心消息工具message_to_dict：把消息对象 转成 字典（可序列化存储）
        # 把 all_messages 里的每一条消息，都用 message_to_dict(...) 转换一遍，最后生成一个字典列表
        new_messages = [message_to_dict(message) for message in all_messages]
        # 把字典列表写入JSON文件
        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(new_messages, f)

    #读取的时候：把人能看懂的json格式转成字典，再通过messages_from_dict转成langchain能看懂的消息对象
    @property #@property装饰器将messages方法变成成员属性用
    def messages(self) -> list[BaseMessage]: #这个方法返回的是：消息对象组成的列表(是LangChain能直接用的消息)
        # 当前文件内： list[字典]
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                messages_data = json.load(f) #json.load(f)：读取文件里的 JSON → 变成 列表 [字典]
                return messages_from_dict(messages_data) #把字典列表 → 消息对象列表
        except FileNotFoundError: #如果文件还没创建就直接返回空列表-程序不会崩溃
            return []

    # 清空当前会话的所有聊天历史（把文件内容变成空列表）
    def clear(self) -> None:
        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump([], f)
