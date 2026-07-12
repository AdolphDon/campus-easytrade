package com.campus.service;

import com.campus.dto.DormitoryEditDTO;
import com.campus.dto.AddressBookEditDTO;
import com.campus.vo.AddressBookVO;
import com.campus.vo.DormitoryVO;

import javax.validation.Valid;
import java.util.List;

public interface AddressBookService {

    /**
     * 查询当前用户的地址簿列表
     */
    List<AddressBookVO> listAddresses();

    /**
     * 新增地址
     */
    void addAddress(@Valid AddressBookEditDTO dto);

    /**
     * 修改地址
     */
    void updateAddress(@Valid AddressBookEditDTO dto, Long id);

    /**
     * 删除地址（逻辑删除）
     */
    void deleteAddress(Long id);

    /**
     * 设置默认地址
     */
    void setDefaultAddress(Long id);

    /**
     * 根据当前用户绑定学校获取宿舍楼列表（含当前用户的可修改次数）
     * @return
     */
    List<DormitoryVO> listSchoolDormitories();

    /**
     * 用户自行添加宿舍楼（需已绑定学校）
     * @param dto
     * @return 新增的宿舍楼
     */
    void addDormitory(@Valid DormitoryEditDTO dto);

    /**
     * 用户修改自己添加的宿舍楼（需已绑定学校，每个宿舍楼最多修改3次）
     * @param dto
     * @param dormitoryId
     */
    void updateDormitory(@Valid DormitoryEditDTO dto, Long dormitoryId);

    /**
     * 获取当前用户在当前学校的剩余创建宿舍楼次数
     * @return
     */
    Long getRemainingCreationCount();
}
