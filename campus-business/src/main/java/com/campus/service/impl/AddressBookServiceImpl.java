package com.campus.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.campus.constant.AddressBookStatus;
import com.campus.dto.DormitoryEditDTO;
import com.campus.dto.AddressBookEditDTO;
import com.campus.entity.*;
import com.campus.exception.BusinessException;
import com.campus.mapper.*;
import com.campus.service.AddressBookService;
import com.campus.vo.AddressBookVO;
import com.campus.vo.DormitoryVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

import static com.campus.constant.DeletedStatus.NOT_DELETED;
import static com.campus.utils.SecurityUtil.getCurrentUserId;

@Slf4j
@Service
@RequiredArgsConstructor
public class AddressBookServiceImpl implements AddressBookService {

    private final AddressBookMapper addressBookMapper;
    private final UserMapper userMapper;
    private final UniversityMapper universityMapper;
    private final DormitoryMapper dormitoryMapper;
    private final UserDormitoryCreationMapper userDormitoryCreationMapper;
    private final UserDormitoryUpdateMapper userDormitoryUpdateMapper;
    private final StringRedisTemplate redisTemplate;

    //用于当卖家更改地址时清除用户进入确认订单页中商品有买家自提商品时的取货地址时写入的缓存
    private void evictConfirmOrderAddressCache(Long userId) {
        redisTemplate.delete("confirmOrderAddress:" + userId);
    }

    /**
     * 查询用户的地址簿列表(当前用户id+绑定学校id双重查询)
     * @return
     */
    @Transactional(readOnly = true)
    public List<AddressBookVO> listAddresses() {
        Long userId = getCurrentUserId();
        //根据当前用户id查询用户信息并判断【该用户是否存在or该用户是否已绑定学校】
        User user = userMapper.selectById(userId);
        if (user == null || user.getSchoolId() == null) {
            return Collections.emptyList();//返回空列表
        }
        //根据用户id与绑定学校id获取地址簿
        List<AddressBook> list = addressBookMapper.selectList(
                new LambdaQueryWrapper<AddressBook>()
                        .eq(AddressBook::getUserId, userId)
                        .eq(AddressBook::getSchoolId, user.getSchoolId())
                        .orderByDesc(AddressBook::getCreateTime)
        );
        //根据该用户的学校id获取该用户绑定的大学信息
        University school = universityMapper.selectById(user.getSchoolId());

        //批量查询宿舍楼信息：一次性查完再用map取
        List<Long> dormIds = list.stream().map(AddressBook::getDormitoryId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        List<Dormitory> dormList = dormIds.isEmpty() ? Collections.emptyList() : dormitoryMapper.selectBatchIds(dormIds);
        Map<Long, String> dormMap = dormList.stream().collect(
                Collectors.toMap(Dormitory::getId, Dormitory::getName, (a, b) -> a));

        //将获取到的地址簿列表a以流的形式转换为vo，并收集打包成新列表输出
        return list.stream().map(a -> {
            return AddressBookVO.builder()
                    .id(a.getId())
                    .schoolId(a.getSchoolId())
                    .schoolName(school != null ? school.getName() : null)
                    .dormitoryId(a.getDormitoryId())
                    .dormitoryName(dormMap.get(a.getDormitoryId()))
                    .detailAddress(a.getDetailAddress())
                    .name(a.getName())
                    .phone(a.getPhone())
                    .universityAddress(a.getUniversityAddress())
                    .province(school != null ? school.getProvince() : null)
                    .city(school != null ? school.getCity() : null)
                    .district(school != null ? school.getDistrict() : null)
                    .latitude(a.getLatitude())
                    .longitude(a.getLongitude())
                    .isDefault(a.getIsDefault())
                    .build();
        }).collect(Collectors.toList());
    }

    /**
     * 新增地址
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "address:user", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public void addAddress(AddressBookEditDTO dto) {
        Long userId = getCurrentUserId();
        User user = userMapper.selectById(userId);
        if (user == null || user.getSchoolId() == null) {
            throw new BusinessException("请先绑定学校");
        }

        Dormitory dorm = dormitoryMapper.selectById(dto.getDormitoryId());
        if (dorm == null) {
            throw new BusinessException("宿舍楼不存在");
        }

        //检查是否已有默认地址
        Long existingDefault = addressBookMapper.selectCount(
                new LambdaQueryWrapper<AddressBook>()
                        .eq(AddressBook::getUserId, userId)
                        .eq(AddressBook::getIsDefault, AddressBookStatus.DEFAULT )
        );

        AddressBook address = AddressBook.builder()
                .userId(userId)
                .schoolId(user.getSchoolId())
                .dormitoryId(dto.getDormitoryId())
                .detailAddress(dto.getDetailAddress())
                .name(dto.getName())
                .phone(dto.getPhone())
                .universityAddress(dto.getUniversityAddress())
                .latitude(dorm.getLatitude())
                .longitude(dorm.getLongitude())
                .isDefault(existingDefault == null || existingDefault == 0
                        ? AddressBookStatus.DEFAULT : AddressBookStatus.NOT_DEFAULT)
                .build();
        addressBookMapper.insert(address);
        evictConfirmOrderAddressCache(userId);
    }

    /**
     * 修改地址
     * @param dto
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "address:user", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public void updateAddress(AddressBookEditDTO dto, Long id) {

        AddressBook existing = addressBookMapper.selectById(id);
        if (existing == null || !existing.getUserId().equals(getCurrentUserId())) {
            throw new BusinessException("地址不存在");
        }

        LambdaUpdateWrapper<AddressBook> wrapper = new LambdaUpdateWrapper<AddressBook>()
                .eq(AddressBook::getId, id);

        if (dto.getDormitoryId() != null) {
            Dormitory dorm = dormitoryMapper.selectById(dto.getDormitoryId());
            if (dorm == null) {
                throw new BusinessException("宿舍楼不存在");
            }
            wrapper.set(AddressBook::getDormitoryId, dto.getDormitoryId());
            wrapper.set(AddressBook::getLatitude, dorm.getLatitude());
            wrapper.set(AddressBook::getLongitude, dorm.getLongitude());
        }
        if (dto.getDetailAddress() != null) {
            wrapper.set(AddressBook::getDetailAddress, dto.getDetailAddress());
        }
        if (dto.getName() != null) {
            wrapper.set(AddressBook::getName, dto.getName());
        }
        if (dto.getPhone() != null) {
            wrapper.set(AddressBook::getPhone, dto.getPhone());
        }
        if (dto.getUniversityAddress() != null) {
            wrapper.set(AddressBook::getUniversityAddress, dto.getUniversityAddress());
        }
        addressBookMapper.update(null, wrapper);
        evictConfirmOrderAddressCache(getCurrentUserId());
    }

    /**
     * 删除地址
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "address:user", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public void deleteAddress(Long id) {
        AddressBook existing = addressBookMapper.selectById(id);
        if (existing == null || !existing.getUserId().equals(getCurrentUserId())) {
            throw new BusinessException("地址不存在");
        }
        addressBookMapper.deleteById(id);
        evictConfirmOrderAddressCache(getCurrentUserId());
    }

    /**
     * 设置默认地址
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "address:user", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public void setDefaultAddress(Long id) {
        Long userId = getCurrentUserId();
        //根据地址簿id获取地址簿信息
        AddressBook existing = addressBookMapper.selectById(id);
        if (existing == null || !existing.getUserId().equals(userId)) {
            throw new BusinessException("地址不存在");
        }
        //先把该用户所有地址的isDefault设为0
        addressBookMapper.update(null, new LambdaUpdateWrapper<AddressBook>()
                .eq(AddressBook::getUserId, userId)
                .set(AddressBook::getIsDefault, AddressBookStatus.NOT_DEFAULT)
        );
        //再把该地址的isDefault设为1
        addressBookMapper.update(null, new LambdaUpdateWrapper<AddressBook>()
                .eq(AddressBook::getId, id)
                .set(AddressBook::getIsDefault, AddressBookStatus.DEFAULT)
        );
        evictConfirmOrderAddressCache(userId);
    }

    /**
     * 根据当前用户绑定学校获取宿舍楼列表（含当前用户的可修改次数）
     * @return
     */
    @Transactional(readOnly = true)
    public List<DormitoryVO> listSchoolDormitories() {
        User user = userMapper.selectById(getCurrentUserId());
        if (user == null || user.getSchoolId() == null) {
            return Collections.emptyList();
        }
        //根据学校id返回其下所有宿舍楼
        List<Dormitory> dorms = dormitoryMapper.selectList(
                new LambdaQueryWrapper<Dormitory>()
                        .eq(Dormitory::getUniversityId, user.getSchoolId())
                        .orderByAsc(Dormitory::getId)
        );
        //批量查询该用户对每个宿舍楼的修改次数：一次性查完再用map取
        List<Long> dormIds = dorms.stream().map(Dormitory::getId).collect(Collectors.toList());
        List<UserDormitoryUpdate> allUpdates = userDormitoryUpdateMapper.selectList(
                new LambdaQueryWrapper<UserDormitoryUpdate>()
                        .eq(UserDormitoryUpdate::getUserId, user.getId())
                        .eq(UserDormitoryUpdate::getSchoolId, user.getSchoolId())
                        .in(UserDormitoryUpdate::getDormitoryId, dormIds)
        );
        Map<Long, Long> updateCountMap = allUpdates.stream().collect(
                Collectors.groupingBy(UserDormitoryUpdate::getDormitoryId, Collectors.counting()));

        //将所有宿舍楼数据d转化成流的形式
        return dorms.stream().map(d -> {
            //获取该用户修改某宿舍楼的次数
            Long updateCount = updateCountMap.getOrDefault(d.getId(), 0L);
            return DormitoryVO.builder()
                    .id(d.getId())
                    .name(d.getName())
                    .latitude(d.getLatitude())
                    .longitude(d.getLongitude())
                    .remainingUpdates(3 - updateCount)
                    .build();
        }).collect(Collectors.toList());
    }

    /**
     * 用户自行添加宿舍楼(当前学校下每个用户只能自行创建12个宿舍楼)
     * @param dto
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "dormitory:school", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public void addDormitory(DormitoryEditDTO dto) {
        User user = userMapper.selectById(getCurrentUserId());
        if (user == null || user.getSchoolId() == null) {
            throw new BusinessException("请先绑定学校");
        }

        //校验当前用户在当前学校已创建的宿舍楼数量是否达到上限
        Long count = userDormitoryCreationMapper.selectCount(
                new LambdaQueryWrapper<UserDormitoryCreation>()
                        .eq(UserDormitoryCreation::getUserId, user.getId())
                        .eq(UserDormitoryCreation::getSchoolId, user.getSchoolId())
        );
        if (count >= 12) {
            throw new BusinessException("已达到添加宿舍楼上限(12次)");
        }

        Dormitory dorm = Dormitory.builder()
                .universityId(user.getSchoolId())
                .name(dto.getName())
                .latitude(dto.getLatitude())
                .longitude(dto.getLongitude())
                .deleted(NOT_DELETED)
                .build();
        dormitoryMapper.insert(dorm);

        //记录宿舍创建日志
        userDormitoryCreationMapper.insert(UserDormitoryCreation.builder()
                .userId(user.getId())
                .schoolId(user.getSchoolId())
                .dormitoryId(dorm.getId())
                .build());
    }

    /**
     * 用户修改宿舍楼(每个宿舍楼每个用户最多修改3次)
     * @param dto
     * @param dormitoryId
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "dormitory:school", key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()")
    public void updateDormitory(DormitoryEditDTO dto, Long dormitoryId) {
        User user = userMapper.selectById(getCurrentUserId());
        if (user == null || user.getSchoolId() == null) {
            throw new BusinessException("请先绑定学校");
        }

        //校验宿舍楼是否存在
        Dormitory dorm = dormitoryMapper.selectById(dormitoryId);
        if (dorm == null) {
            throw new BusinessException("宿舍楼不存在");
        }

        //校验当前用户在当前学校修改某宿舍楼的次数是否达到上限
        Long count = userDormitoryUpdateMapper.selectCount(
                new LambdaQueryWrapper<UserDormitoryUpdate>()
                        .eq(UserDormitoryUpdate::getUserId, user.getId())
                        .eq(UserDormitoryUpdate::getSchoolId, user.getSchoolId())
                        .eq(UserDormitoryUpdate::getDormitoryId, dormitoryId)
        );
        if (count >= 3) {
            throw new BusinessException("该宿舍楼已达到修改上限(3次)");
        }

        //执行修改
        dormitoryMapper.update(null, new LambdaUpdateWrapper<Dormitory>()
                .eq(Dormitory::getId, dormitoryId)
                .set(Dormitory::getName, dto.getName())
                .set(Dormitory::getLatitude, dto.getLatitude())
                .set(Dormitory::getLongitude, dto.getLongitude())
        );

        //记录修改日志
        userDormitoryUpdateMapper.insert(UserDormitoryUpdate.builder()
                .userId(user.getId())
                .schoolId(user.getSchoolId())
                .dormitoryId(dormitoryId)
                .build());
    }

    /**
     * 获取当前用户在当前学校的剩余创建宿舍楼次数
     * @return
     */
    @Transactional(readOnly = true)
    public Long getRemainingCreationCount() {
        User user = userMapper.selectById(getCurrentUserId());
        if (user == null || user.getSchoolId() == null) {
            throw new BusinessException("请先绑定学校");
        }
        Long count = userDormitoryCreationMapper.selectCount(
                new LambdaQueryWrapper<UserDormitoryCreation>()
                        .eq(UserDormitoryCreation::getUserId, user.getId())
                        .eq(UserDormitoryCreation::getSchoolId, user.getSchoolId())
        );
        return 12 - count;
    }
}
