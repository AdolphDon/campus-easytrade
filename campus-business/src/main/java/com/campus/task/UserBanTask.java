package com.campus.task;

import cn.hutool.core.collection.CollUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.campus.entity.User;
import com.campus.entity.UserBanRecord;
import com.campus.mapper.UserBanRecordMapper;
import com.campus.mapper.UserMapper;
import com.campus.service.AdminService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;
import java.util.List;

import static com.campus.constant.UserStatus.userDISABLE;

//解封禁用用户定时任务
@Slf4j
@Component
@RequiredArgsConstructor
public class UserBanTask {

    private final UserBanRecordMapper userBanRecordMapper;
    private final AdminService adminService;
    private final UserMapper userMapper;

    /**
     * 每分钟执行一次：解封到期用户
     */
    @Scheduled(cron = "0 * * * * ?")
    public void autoUnbanUser() {

        //查询所有到期的封禁记录（解封时间 <= 当前时间）
        LambdaQueryWrapper wrapper= new LambdaQueryWrapper<UserBanRecord>()
        .le(UserBanRecord::getUnbanTime, LocalDateTime.now());

        List<UserBanRecord> expireRecords = userBanRecordMapper.selectList(wrapper);

        if (CollUtil.isEmpty(expireRecords)) {
            return;
        }

        //遍历处理，仅对【仍处于禁用状态】的用户执行解封
        for (UserBanRecord record : expireRecords) {
            Long userId = record.getUserId();
            try {
                User user = userMapper.selectById(userId);
                if (user == null) {
                    continue;
                }

                //判断：用户当前是【禁用状态】才解封，已启用则跳过
                if (user.getStatus().equals(userDISABLE)) {
                    adminService.enableUser(userId);
                } else {
                    log.info("用户已提前解封，无需处理，用户ID：{}", userId);
                }
            } catch (Exception e) {
                log.error("自动解封用户异常，用户ID：{}，异常信息：", userId, e);
            }
        }
    }
}
