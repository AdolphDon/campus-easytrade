"""
整个项目的配置文件
"""

# 存 MD5 记录的文件路径
md5_path = "./md5.text"

# 向量数据库配置-数据库名字叫rag：存在当前目录的 chroma_db 文件夹里
collection_name = "rag"
persist_directory = "./chroma_db"


# 文本切割配置
chunk_size = 1000 #一段最多 1000 字
chunk_overlap = 100 #重叠 100 字
separators = ["\n\n", "\n", ".", "!", "?", "。", "！", "？", " ", ""] #按句号、感叹号、换行符切割
max_split_char_number = 1000 #文本分割的阈值：如果文本超过 1000 个字，就切割成小段；不到 1000 个字，就不切割，直接保存

# 检索时返回的文档片段数（值越大，AI接收的参考资料越多，建议3-5）
similarity_threshold = 4

# AI模型名字
embedding_model_name = "text-embedding-v4" #向量模型：类似于翻译官，将文字转成向量，将向量转成文字
chat_model_name = "qwen3-max" #对话大模型

# Java后端地址（AI内部接口路径，供 Tool Calling 调用）
java_base_url = "http://java-backend:8080"
