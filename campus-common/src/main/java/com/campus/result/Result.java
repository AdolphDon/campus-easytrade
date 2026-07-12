package com.campus.result;

import lombok.*;

import lombok.Data;

import java.io.Serializable;

/**
 * 全局统一返回结果
 */
@Data
public class Result<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    private Integer code;//0=成功，非0=失败
    private String message;//提示信息
    private T data;//返回数据

    public static final int SUCCESS = 0;
    public static final int ERROR = 1;

    //==================== 成功 ====================
    public static <T> Result<T> success() {
        Result<T> r = new Result<>();
        r.setCode(SUCCESS);
        r.setMessage("OK");
        return r;
    }

    public static <T> Result<T> success(T data) {
        Result<T> r = new Result<>();
        r.setCode(SUCCESS);
        r.setMessage("OK");
        r.setData(data);
        return r;
    }

    //==================== 失败 ====================
    public static <T> Result<T> error(String message) {
        Result<T> r = new Result<>();
        r.setCode(ERROR);
        r.setMessage(message);
        return r;
    }

    public static <T> Result<T> error(int code, String message) {
        Result<T> r = new Result<>();
        r.setCode(code);
        r.setMessage(message);
        return r;
    }
}