"""
②在线流程(检索)-生成检索器待使用
连接向量库 → 生成一个检索器 → 给 AI 拿去查答案
"""
import os
import shutil
from langchain_chroma import Chroma #导入本地向量数据库来做数据检索
import config_data as config #导入配置文件类

# 用向量模型连接向量数据库做成智能检索器-等待将用户的问题转成向量并检索
class VectorStoreService(object):
    def __init__(self, embedding):
        # 把调用此类时传入的模型保存到对象里-(向量模型工具embedding)
        self.embedding = embedding

        # 连接已有的存数据的那个Chroma向量库
        self.vector_store = Chroma( #vector_store：代码和本地向量库之间的桥梁-通过三条数据建立连接
            collection_name=config.collection_name, #去配置文件里找向量库的【表名】
            embedding_function=self.embedding, #指定向量模型负责把用户问题 → 转成向量去检索
            persist_directory=config.persist_directory, #去配置文件里找向量库的【文件夹位置】
        )

    # 创建一个向量检索器
    def get_retriever(self):
        # 把连接好的向量库 → 变成一个 “搜索工具” 返回出去：仓库 → 变成 能根据问题自动找东西的机器人
        # 检索时返回最相似的k条文档：具体返回几条去配置文件里查看config_data.py
        # self.vector_store = 仓库(里面堆满了货物：文本向量);as_retriever() = 给仓库装一个 “智能查找机器人”
        return self.vector_store.as_retriever(search_kwargs={"k": config.similarity_threshold})

