"""
①离线流程(索引)-将上传文档存入到向量数据库功能
把文本内容 → 存进向量数据库库，并且自动去重、自动切割、自动打标签
"""
import os #操作文件、文件夹的系统工具
import config_data as config #导入配置文件类
import hashlib #生成文件的MD5唯一标识：用来判断文件是否已经上传过
from langchain_chroma import Chroma #导入本地向量数据库来做数据检索：用来存文本向量、做语义检索
from langchain_community.embeddings import DashScopeEmbeddings #导入阿里云通义千问向量模型：把文字 → 变成向量
from langchain_text_splitters import RecursiveCharacterTextSplitter #导入文本分割器：把长文章切成小段
from datetime import datetime #获取当前时间：用来记录文件上传时间

# 这里的 md5_str = 上传文件的【内容】经过 MD5 加密后生成的字符串
# 检查传入的md5_str是否在记录MD5的路径为md5_path的文件里
def check_md5(md5_str: str): #str表示md5_str是字符串类型

    # 判断存记录MD5的路径为md5_path的文件是否存在：存在→返回True、不存在→返回False
    if not os.path.exists(config.md5_path): #md5_path是【存内容的文件位置路径】
        # 如果该文件不存在 → 创建一个【空文件】，路径是 config.md5_path
        open(config.md5_path, 'w', encoding='utf-8').close()
        return False #表示这个MD5从来没处理过
    else:
        #文件存在 → 逐行读取里面存的所有 MD5
        for line in open(config.md5_path, 'r', encoding='utf-8').readlines():
            line = line.strip() #处理字符串每行前后的空格和回车
            if line == md5_str:
                return True #已处理过

        return False #没找到 → 返回没传过

# 将传入的md5加密内容字符串，记录到文件内保存
def save_md5(md5_str: str):

    with open(config.md5_path, 'a', encoding="utf-8") as f: #a=append(追加模式)
        f.write(md5_str + '\n') #f：是给打开的文件起的别名

# 把一段文字 → 变成一串唯一的 MD5 加密字符串
def get_string_md5(input_str: str, encoding='utf-8'): #给encoding设置默认参数，无需传值

    # 把文字转成电脑能加密的字节：MD5 只能加密字节，不能直接加密文字
    str_bytes = input_str.encode(encoding=encoding) #把文字字符串 → 变成字节-用UTF-8规则去变

    # 创建md5对象
    md5_obj = hashlib.md5() #得到md5对象
    md5_obj.update(str_bytes) #把要加密的内容放进 MD5 工具里
    md5_hex = md5_obj.hexdigest() #得到md5的十六进制字符串

    return md5_hex

# 该类中的构造方法和自定义方法必须self为传参列表第一个，且参数名的类型只是备注，可写可不写
class KnowledgeBaseService(object):

    # 把知识库需要的所有工具一次性准备好
    # self为构造函数自动创建的对象，当aaa = KnowledgeBaseService()时，self就是aaa
    def __init__(self): #该类的构造方法，类创建时自动执行
        # 如果文件夹不存在则创建，如果存在则跳过
        # makedirs()为创建文件夹方法，persist_directory为向量数据库文件夹路径，exist_ok=True：如果已经存在，就不报错
        os.makedirs(config.persist_directory, exist_ok=True)

        #Chroma和RecursiveCharacterTextSplitter均是官方提供的，直接用其创建一个对象工具方法
        # 创建一个Chroma向量库工具对象，取名叫self.chroma：以后用self.chroma就能操作向量库
        self.chroma = Chroma(
            collection_name=config.collection_name, #向量数据库的表名
            embedding_function=DashScopeEmbeddings(model="text-embedding-v4"), #向量模型
            persist_directory=config.persist_directory, #向量数据库本地存储文件夹路径
        )

        # 创建一个递归文本分割器对象，取名叫self.spliter：以后切文本直接用它
        self.spliter = RecursiveCharacterTextSplitter(
            chunk_size=config.chunk_size, #分割后的文本段最大长度
            chunk_overlap=config.chunk_overlap, #连续文本段之间的字符重叠数量：防止句子被切断，保证上下文连贯
            separators=config.separators, #自然段落划分的符号：符号切割尽量在自然停顿处切，不硬切
            length_function=len, #使用Python自带的len函数做长度统计的依据
        )

    # 将传入的字符串，进行向量化，存入向量数据库中
    def upload_by_str(self, data: str, filename, operator="管理员"): #self为纯文字文本、filename为上传文件名

        # 先得到文本内容 data 经过 MD5 加密后的一串固定长度字符串
        md5_hex = get_string_md5(data)

        if check_md5(md5_hex):
            return "[跳过]内容已经存在知识库中"

        if len(data) > config.max_split_char_number: #看原文字数是否超过文本分割的阈值，超过进行分割，未超过直接保存
            # 放入字符串类型的列表:内含多个文本数据
            knowledge_chunks: list[str] = self.spliter.split_text(data) #split_text()为自带方法，按照我定义的规则进行文本切割
        else:
            # 放入字符串类型的列表:内含一个文本数据
            knowledge_chunks = [data] #如果没超过，就不切，直接把原文当成一段

        # 创建字典-metadata(元数据):给文本内容加的"标签or备注信息"
        metadata = {
            "source": filename, #记录这段文本来自哪个文件
            "md5": md5_hex, #文件内容MD5（删除时用来判断是否还有其他文件引用该MD5）
            # 2025-01-01 10:00:00：自动获取当前系统时间
            "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "operator": operator, #记录谁上传的（从Java后端传入）
        }

        self.chroma.add_texts( #把文本存进向量库
            knowledge_chunks, #要存的文本（一段一段）
            # 如果文本超出阈值则被分成很多段，那就有多少段文本复制几份标签(3段文本则有3份metadata字典)
            metadatas=[metadata for _ in knowledge_chunks], #每段文本对应的标签
        )

        #保存文本内容MD5加密后的字符串
        save_md5(md5_hex)

        return "[成功]内容已经成功载入向量库"
