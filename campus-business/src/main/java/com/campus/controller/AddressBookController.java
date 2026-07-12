package com.campus.controller;

import com.campus.dto.DormitoryEditDTO;
import com.campus.dto.AddressBookEditDTO;
import com.campus.vo.DormitoryVO;
import com.campus.result.Result;
import com.campus.service.AddressBookService;
import com.campus.vo.AddressBookVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@Slf4j
@Api(tags = "用户地址簿管理接口")
@RestController
@RequestMapping("/user/address")
@RequiredArgsConstructor
public class AddressBookController {

    private final AddressBookService addressBookService;

    /**
     * 查询用户的地址簿列表(当前用户id+绑定学校id双重查询)
     */
    @GetMapping("/addres/list")
    @ApiOperation("查询地址簿列表")
    @Cacheable(//T()：获取指定全类名对应的Class对象，用来调用静态方法
            value = "address:user",
            key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()",
            sync = true)
    public Result<List<AddressBookVO>> listAddresses() {
        List<AddressBookVO> list = addressBookService.listAddresses();
        return Result.success(list);
    }

    /**
     * 新增地址
     */
    @PostMapping("/addres/add")
    @ApiOperation("新增地址")
    public Result addAddress(@Valid @RequestBody AddressBookEditDTO dto) {
        addressBookService.addAddress(dto);
        return Result.success();
    }

    /**
     * 修改地址
     */
    @PutMapping("/addres/update/{id}")
    @ApiOperation("修改地址")
    public Result updateAddress(@Valid @RequestBody AddressBookEditDTO dto, @PathVariable Long id) {
        addressBookService.updateAddress(dto, id);
        return Result.success();
    }

    /**
     * 删除地址
     */
    @DeleteMapping("/addres/delete/{id}")
    @ApiOperation("删除地址")
    public Result deleteAddress(@PathVariable Long id) {
        addressBookService.deleteAddress(id);
        return Result.success();
    }

    /**
     * 设置默认地址
     */
    @PutMapping("/addres/default/{id}")
    @ApiOperation("设置默认地址")
    public Result setDefaultAddress(@PathVariable Long id) {
        addressBookService.setDefaultAddress(id);
        return Result.success();
    }

    /**
     * 获取当前用户绑定学校下的宿舍楼列表（含当前用户可修改次数）
     */
    @GetMapping("/dormitory/list")
    @ApiOperation("获取当前用户学校下的宿舍楼列表（含剩余修改次数）")
    @Cacheable(
            value = "dormitory:school",
            key = "T(com.campus.utils.SecurityUtil).getCurrentUserId()",
            sync = true)
    public Result<List<DormitoryVO>> listSchoolDormitories() {
        List<DormitoryVO> list = addressBookService.listSchoolDormitories();
        return Result.success(list);
    }

    /**
     * 用户添加宿舍楼（每个用户在一所大学内只能创建12次）
     */
    @PostMapping("/dormitory/add")
    @ApiOperation("添加宿舍楼（每所大学限创建12次）")
    public Result addDormitory(@Valid @RequestBody DormitoryEditDTO dto) {
        addressBookService.addDormitory(dto);
        return Result.success();
    }

    /**
     * 用户修改宿舍楼（每个宿舍楼最多修改3次）
     */
    @PutMapping("/dormitory/update/{dormitoryId}")
    @ApiOperation("修改宿舍楼（每栋宿舍楼限修改3次）")
    public Result updateDormitory(@Valid @RequestBody DormitoryEditDTO dto, @PathVariable Long dormitoryId) {
        addressBookService.updateDormitory(dto, dormitoryId);
        return Result.success();
    }

    /**
     * 获取当前用户在当前学校的剩余创建宿舍楼次数
     */
    @GetMapping("/dormitory/remaining")
    @ApiOperation("获取当前用户在当前学校的剩余创建宿舍楼次数")
    public Result<Long> getRemainingCreationCount() {
        Long remaining = addressBookService.getRemainingCreationCount();
        return Result.success(remaining);
    }
}
