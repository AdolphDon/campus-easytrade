<template>
  <el-dialog
    :model-value="visible"
    :width="dialogWidth"
    :close-on-click-modal="true"
    :show-close="true"
    :before-close="handleClose"
    class="violation-detail-dialog"
    top="15vh"
    align-center
  >
    <template #header>
      <div class="violation-detail-header">
        <el-icon :size="22" color="#FF7D00"><WarningFilled /></el-icon>
        <span class="violation-detail-title">违规详情</span>
      </div>
    </template>

    <div class="violation-detail-body">
      <!-- 拦截时间卡片 -->
      <div class="info-card">
        <div class="info-card-icon">
          <el-icon :size="18" color="#FF7D00"><Clock /></el-icon>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">拦截时间</span>
          <span class="info-card-value">{{ formattedTime }}</span>
        </div>
      </div>

      <!-- 审核管理员卡片 -->
      <div class="info-card">
        <div class="info-card-icon">
          <el-icon :size="18" color="#FF7D00"><UserFilled /></el-icon>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">审核管理员</span>
          <span class="info-card-value">{{ adminDisplay }}</span>
        </div>
      </div>

      <!-- 违规原因卡片 -->
      <div class="info-card reason-card">
        <div class="info-card-icon">
          <el-icon :size="18" color="#FF7D00"><CircleCloseFilled /></el-icon>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">违规原因</span>
          <p class="info-card-reason">{{ detail.violationReason }}</p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="violation-detail-footer">
        <el-button
          type="danger"
          class="appeal-btn"
          @click="handleAppeal"
          :icon="WarningFilled"
        >
          去申诉
        </el-button>
        <span class="appeal-hint">如对处理结果有异议，可提交申诉</span>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { WarningFilled, Clock, UserFilled, CircleCloseFilled } from '@element-plus/icons-vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  violationDetail: {
    type: Object,
    required: true,
    default: () => ({
      goodsId: null,
      interceptTime: '',
      adminId: null,
      violationReason: ''
    })
  }
})

const emit = defineEmits(['appeal', 'close'])

// 响应式宽度
const dialogWidth = computed(() => {
  return window.innerWidth < 480 ? '92%' : '420px'
})

/**
 * 格式化拦截时间
 * 如果传入的是相对时间（如 "8 分钟前"），则解析为具体时间
 * 如果已经是 YYYY-MM-DD HH:mm:ss 格式则直接返回
 */
const formattedTime = computed(() => {
  const time = props.violationDetail.interceptTime
  if (!time) return '未知'

  // 已经是标准格式 YYYY-MM-DD HH:mm:ss
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(time)) {
    return time
  }

  // 已经是标准格式 YYYY-MM-DDTHH:mm:ss (ISO)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(time)) {
    return time.replace('T', ' ').split('.')[0]
  }

  // 相对时间转换
  const now = new Date()
  const match = time.match(/(\d+)\s*分钟前/)
  if (match) {
    const minutes = parseInt(match[1])
    const d = new Date(now.getTime() - minutes * 60 * 1000)
    return formatDateTime(d)
  }

  const matchH = time.match(/(\d+)\s*小时前/)
  if (matchH) {
    const hours = parseInt(matchH[1])
    const d = new Date(now.getTime() - hours * 60 * 60 * 1000)
    return formatDateTime(d)
  }

  const matchD = time.match(/(\d+)\s*天前/)
  if (matchD) {
    const days = parseInt(matchD[1])
    const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return formatDateTime(d)
  }

  return time
})

/**
 * 审核管理员显示
 * 格式：工号 X
 */
const adminDisplay = computed(() => {
  const id = props.violationDetail.adminId
  if (id === null || id === undefined) return '无'
  return `工号 ${id}`
})

/**
 * 格式化日期对象为 YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * 关闭弹窗
 */
function handleClose() {
  emit('close')
}

/**
 * 去申诉
 */
function handleAppeal() {
  emit('appeal', props.violationDetail.goodsId)
  emit('close')
}
</script>

<style scoped>
/* ===== 弹窗整体覆盖 ===== */
:deep(.el-dialog) {
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  transition: all 0.3s ease;
}

:deep(.el-dialog__header) {
  padding: 20px 24px 0;
  border-bottom: none;
  margin: 0;
}

:deep(.el-dialog__headerbtn) {
  top: 20px;
  right: 20px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

:deep(.el-dialog__headerbtn:hover) {
  background-color: #fff5f0;
}

:deep(.el-dialog__headerbtn .el-dialog__close) {
  font-size: 18px;
  color: #999;
  transition: color 0.2s;
}

:deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: #FF7D00;
}

:deep(.el-dialog__body) {
  padding: 20px 24px;
}

:deep(.el-dialog__footer) {
  padding: 0 24px 24px;
  border-top: none;
}

/* ===== 遮罩层动画 ===== */
:deep(.dialog-fade-enter-active) {
  animation: dialog-fade-in 0.3s ease;
}

:deep(.dialog-fade-leave-active) {
  animation: dialog-fade-in 0.3s ease reverse;
}

@keyframes dialog-fade-in {
  0% {
    opacity: 0;
    transform: translateY(-20px) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ===== 顶部标题 ===== */
.violation-detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.violation-detail-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a2e;
  letter-spacing: 1px;
}

/* ===== 内容区域 ===== */
.violation-detail-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ===== 信息卡片 ===== */
.info-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 18px;
  background: #fafafa;
  border-radius: 12px;
  border: 1px solid #f0f0f0;
  transition: all 0.2s ease;
}

.info-card:hover {
  background: #fff8f4;
  border-color: #ffe0cc;
  box-shadow: 0 2px 8px rgba(255, 125, 0, 0.08);
}

.info-card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff5f0;
  border-radius: 10px;
  margin-top: 1px;
}

.info-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.info-card-label {
  font-size: 12px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-card-value {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  line-height: 1.5;
}

.info-card-reason {
  margin: 0;
  font-size: 15px;
  color: #e74c3c;
  line-height: 1.7;
  word-break: break-word;
  white-space: pre-wrap;
}

/* 违规原因卡片特殊样式 */
.reason-card {
  background: #fff8f8;
  border-color: #ffe0e0;
}

.reason-card:hover {
  background: #fff5f5;
  border-color: #ffcccc;
  box-shadow: 0 2px 8px rgba(231, 76, 60, 0.08);
}

.reason-card .info-card-icon {
  background: #fff0f0;
}

/* ===== 底部 ===== */
.violation-detail-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.appeal-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #FF7D00 0%, #ff6a00 100%);
  transition: all 0.25s ease;
  color: #fff;
}

.appeal-btn:hover {
  background: linear-gradient(135deg, #ff8c1a 0%, #ff7d00 100%);
  box-shadow: 0 6px 20px rgba(255, 125, 0, 0.35);
  transform: translateY(-1px);
}

.appeal-btn:active {
  transform: translateY(0);
  box-shadow: 0 3px 10px rgba(255, 125, 0, 0.25);
}

.appeal-hint {
  font-size: 12px;
  color: #bbb;
  letter-spacing: 0.3px;
}

/* ===== 移动端适配 ===== */
@media (max-width: 480px) {
  :deep(.el-dialog__body) {
    padding: 16px 18px;
  }

  :deep(.el-dialog__footer) {
    padding: 0 18px 18px;
  }

  .info-card {
    padding: 14px 16px;
  }

  .info-card-value {
    font-size: 14px;
  }
}
</style>
