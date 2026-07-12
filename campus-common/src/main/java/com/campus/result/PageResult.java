package com.campus.result;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

/**
 * 分页统一返回结果
 * @param <T>
 */
@Data
@Builder//开启建造者模式 允许链式调用对象
@NoArgsConstructor//生成无参构造方法
@AllArgsConstructor//生成每一个字段的有参构造方法
public class PageResult<T> {
    private List<T> records;//列表数据
    private Long total;//总条数数
    private Long size;//每页条数
    private Long current;//当前页
    private Long pages;//总页数
}
