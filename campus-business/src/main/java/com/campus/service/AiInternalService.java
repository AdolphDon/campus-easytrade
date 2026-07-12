package com.campus.service;

import com.campus.result.PageResult;
import com.campus.vo.GoodsListVO;
import com.campus.vo.PlatformPostVO;

public interface AiInternalService {

    PageResult<GoodsListVO> searchGoods(String keyword);

    PageResult<PlatformPostVO> getPlatformPosts(Integer type);

    void addGoodsToCart(String goodsName, Integer quantity, Long userId);
}
