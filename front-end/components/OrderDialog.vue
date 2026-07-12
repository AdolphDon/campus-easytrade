<template>
  <el-dialog
    :model-value="visible"
    :width="dialogWidth"
    :top="dialogTop"
    :close-on-click-modal="false"
    :show-close="false"
    :before-close="handleClose"
    class="order-dialog"
    :class="{ 'is-mobile': isMobile }"
    align-center
    destroy-on-close
  >
    <!-- ===== 自定义头部 ===== -->
    <template #header>
      <div class="order-dialog-header">
        <span class="order-dialog-title">交易订单</span>
        <button class="order-dialog-close" @click="handleClose">
          <el-icon :size="18"><Close /></el-icon>
        </button>
      </div>
    </template>

    <!-- ===== 主体区域 ===== -->
    <div class="order-dialog-body">
      <!-- 顶部切换标签 (fixed) -->
      <div class="order-top-fixed">
        <!-- 角色切换：我卖出的 / 我买到的 -->
        <div class="order-role-tabs">
          <button
            v-for="item in roleTabs"
            :key="item.value"
            class="order-role-tab"
            :class="{ active: orderRole === item.value }"
            @click="switchRole(item.value)"
          >
            {{ item.label }}
          </button>
        </div>

        <!-- 状态筛选标签 -->
        <div class="order-status-tabs">
          <button
            v-for="item in statusTabs"
            :key="item.value"
            class="order-status-tab"
            :class="{ active: orderStatus === item.value }"
            @click="switchStatus(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- 订单列表 (scrollable) -->
      <div
        ref="listRef"
        class="order-list-container"
        :class="{ loading: listLoading }"
        @scroll="handleScroll"
      >
        <!-- 加载中骨架屏 -->
        <template v-if="listLoading && orders.length === 0">
          <div v-for="n in 3" :key="n" class="order-skeleton">
            <el-skeleton :rows="3" animated />
          </div>
        </template>

        <!-- 加载失败 -->
        <template v-else-if="loadError">
          <div class="order-state-wrapper">
            <el-icon :size="64" color="#d9d9d9"><WarningFilled /></el-icon>
            <p class="order-state-text">加载失败，请重试</p>
            <el-button type="primary" round @click="loadOrders">重试</el-button>
          </div>
        </template>

        <!-- 空订单 -->
        <template v-else-if="orders.length === 0">
          <div class="order-state-wrapper">
            <el-icon :size="80" color="#d9d9d9"><Box /></el-icon>
            <p class="order-state-text">暂无订单</p>
            <el-button type="primary" round @click="goShopping">去逛逛</el-button>
          </div>
        </template>

        <!-- 订单列表 -->
        <template v-else>
          <TransitionGroup name="order-fade" tag="div" class="order-card-list">
            <div
              v-for="order in orders"
              :key="order.orderId"
              class="order-card"
              @click="viewDetail(order)"
            >
              <!-- 卡片顶部：订单编号 + 状态 -->
              <div class="order-card-header">
                <span class="order-card-no">订单号: {{ order.orderNo || '—' }}</span>
                <span
                  class="order-card-status"
                  :class="'status-' + (order.status ?? 0)"
                >
                  {{ getStatusText(order.status) }}
                </span>
              </div>

              <!-- 商品列表 -->
              <div class="order-card-goods">
                <div
                  v-for="item in (order.items || [])"
                  :key="item.id"
                  class="order-goods-item"
                >
                  <el-image
                    class="order-goods-img"
                    :src="item.goodsImage || ''"
                    fit="cover"
                  >
                    <template #error>
                      <div class="order-img-placeholder">
                        <el-icon :size="20"><Picture /></el-icon>
                      </div>
                    </template>
                  </el-image>
                  <div class="order-goods-info">
                    <p class="order-goods-name">{{ item.goodsName || '未知商品' }}</p>
                    <p class="order-goods-desc">{{ getTradeTypeText(item.tradeType) }}</p>
                  </div>
                  <div class="order-goods-price">
                    <p class="order-price-num">¥{{ formatPrice(item.price) }}</p>
                    <p class="order-price-qty">×{{ item.quantity || 0 }}</p>
                  </div>
                </div>
              </div>

              <!-- 卡片底部：合计 + 操作按钮 -->
              <div class="order-card-footer">
                <span class="order-card-total">
                  合计: <em>¥{{ formatPrice(order.totalAmount) }}</em>
                </span>
                <div class="order-card-actions">
                  <!-- 买家操作 -->
                  <template v-if="orderRole === 'buy'">
                    <el-button
                      v-if="order.status === 0"
                      type="primary"
                      size="small"
                      round
                      @click.stop="payNow(order)"
                    >
                      去支付
                    </el-button>
                    <el-button
                      v-if="order.status === 0"
                      size="small"
                      round
                      @click.stop="cancelOrder(order)"
                    >
                      取消订单
                    </el-button>
                    <el-button
                      v-if="order.status === 1 || order.status === 2"
                      size="small"
                      round
                      @click.stop="confirmReceive(order)"
                    >
                      确认收货
                    </el-button>
                    <el-button
                      v-if="order.status === 3 || order.status === 4"
                      size="small"
                      round
                      @click.stop="viewDetail(order)"
                    >
                      查看详情
                    </el-button>
                  </template>
                  <!-- 卖家操作 -->
                  <template v-else>
                    <el-button
                      v-if="order.status === 0"
                      size="small"
                      round
                      disabled
                    >
                      等待买家付款
                    </el-button>
                    <el-button
                      v-if="order.status === 1"
                      size="small"
                      round
                      @click.stop="shipOrder(order)"
                    >
                      去发货
                    </el-button>
                    <el-button
                      v-if="order.status === 3 || order.status === 4"
                      size="small"
                      round
                      @click.stop="viewDetail(order)"
                    >
                      查看详情
                    </el-button>
                  </template>
                </div>
              </div>
            </div>
          </TransitionGroup>

          <!-- 加载更多 -->
          <div v-if="loadingMore" class="order-load-more">
            <el-icon class="is-loading" :size="20"><Loading /></el-icon>
            <span>加载中...</span>
          </div>
          <div v-if="!hasMore && orders.length > 0" class="order-no-more">
            — 已加载全部 —
          </div>
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Close, WarningFilled, Box, Picture, Loading,
} from '@element-plus/icons-vue'

/* ============================================================
   属性
   ============================================================ */
const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'view-detail', 'go-shop'])

/* ============================================================
   响应式数据
   ============================================================ */

// ---------- 角色与状态 ----------
const orderRole = ref('sell')           // sell = 我卖出的, buy = 我买到的
const orderStatus = ref('')             // '' = 全部, 0-6 = 具体状态

const roleTabs = [
  { value: 'sell', label: '我卖出的' },
  { value: 'buy', label: '我买到的' },
]

const statusTabs = [
  { value: '', label: '全部' },
  { value: '0', label: '待付款' },
  { value: '1', label: '待发货' },
  { value: '2', label: '待收货' },
  { value: '3', label: '已完成' },
  { value: '4', label: '已取消' },
  { value: '5', label: '退款中' },
  { value: '6', label: '已退款' },
]

// ---------- 列表 ----------
const orders = ref([])
const listLoading = ref(false)
const loadError = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const pageNum = ref(1)
const PAGE_SIZE = 10

const listRef = ref(null)

// ---------- 窗口 ----------
const isMobile = ref(false)

/* ============================================================
   计算属性
   ============================================================ */
const dialogWidth = computed(() => {
  return isMobile.value ? '100%' : '600px'
})

const dialogTop = computed(() => {
  return isMobile.value ? '0' : '5vh'
})

/* ============================================================
   状态文字/样式工具
   ============================================================ */
const STATUS_MAP = {
  0: '待付款', 1: '待发货', 2: '待收货',
  3: '已完成', 4: '已取消', 5: '退款中', 6: '已退款',
}

function getStatusText(status) {
  return STATUS_MAP[status] || '未知'
}

const TRADE_TYPE_MAP = {
  1: '卖家上门', 2: '买家自提', 3: '自行协商',
}

function getTradeTypeText(type) {
  return TRADE_TYPE_MAP[type] || ''
}

function formatPrice(val) {
  if (val == null) return '0.00'
  return Number(val).toFixed(2)
}

/* ============================================================
   业务方法
   ============================================================ */

/** 切换角色（我卖出的 / 我买到的） */
function switchRole(role) {
  if (orderRole.value === role) return
  orderRole.value = role
  resetAndLoad()
}

/** 切换状态筛选 */
function switchStatus(status) {
  if (orderStatus.value === status) return
  orderStatus.value = status
  resetAndLoad()
}

/** 重置分页并重新加载 */
function resetAndLoad() {
  pageNum.value = 1
  hasMore.value = true
  orders.value = []
  loadError.value = false
  // 滚动条回到顶部
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = 0
  })
  loadOrders()
}

/** 加载订单列表 */
async function loadOrders() {
  if (listLoading.value && orders.value.length === 0) return
  listLoading.value = true
  loadError.value = false

  try {
    // 使用全局 API 对象（由 api.js 注入）
    const res = await window.API.order.list(
      orderRole.value,
      orderStatus.value,
      pageNum.value,
      PAGE_SIZE,
    )

    if (!window.isApiOk(res) || !res.data) {
      loadError.value = true
      return
    }

    const pageResult = res.data
    const records = pageResult.records || []
    hasMore.value = records.length >= PAGE_SIZE

    if (pageNum.value === 1) {
      orders.value = records
    } else {
      orders.value = [...orders.value, ...records]
    }
  } catch (e) {
    console.error('加载订单列表失败:', e)
    if (pageNum.value === 1) {
      loadError.value = true
    } else {
      ElMessage.error('加载更多失败')
    }
  } finally {
    listLoading.value = false
    loadingMore.value = false
  }
}

/** 加载更多（滚动到底部触发） */
async function loadMore() {
  if (loadingMore.value || !hasMore.value || listLoading.value) return
  loadingMore.value = true
  pageNum.value++
  await loadOrders()
}

/** 滚动监听 */
function handleScroll(e) {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
    loadMore()
  }
}

/** 取消订单 */
async function cancelOrder(order) {
  try {
    await ElMessageBox.confirm('确定要取消该订单吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    const paymentNo = order.paymentNo || ''
    const res = await window.API.order.cancel(paymentNo)
    if (window.isApiOk(res)) {
      ElMessage.success('订单已取消')
      await loadOrders()
    } else {
      ElMessage.error(res.msg || '取消失败')
    }
  } catch (e) {
    console.error('取消订单失败:', e)
    ElMessage.error('网络错误')
  }
}

/** 去支付 */
function payNow(order) {
  ElMessage.info('请前往订单详情页完成支付')
}

/** 确认收货 */
function confirmReceive(order) {
  ElMessage.info('确认收货功能开发中')
}

/** 去发货 */
function shipOrder(order) {
  ElMessage.info('发货功能开发中')
}

/** 查看订单详情 */
function viewDetail(order) {
  emit('view-detail', order)
}

/** 去逛逛 */
function goShopping() {
  emit('go-shop')
}

/** 关闭弹窗 */
function handleClose() {
  emit('update:visible', false)
}

/* ============================================================
   响应式检测
   ============================================================ */
function checkMobile() {
  isMobile.value = window.innerWidth <= 640
}

/* ============================================================
   生命周期
   ============================================================ */
onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})

/** 监听 visible 变化，打开时自动加载 */
watch(() => props.visible, (val) => {
  if (val) {
    resetAndLoad()
  }
})
</script>

<style scoped>
/* ============================================================
   弹窗全局样式覆盖
   ============================================================ */
.order-dialog {
  --order-primary: #FF7D00;
  --order-primary-light: #FFF3E8;
  --order-bg: #F5F7FA;
  --order-text: #333333;
  --order-text-secondary: #666666;
  --order-text-muted: #999999;
  --order-radius: 12px;
  --order-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 弹窗容器覆写 */
.order-dialog :deep(.el-dialog) {
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  padding: 0;
}

.order-dialog :deep(.el-dialog__header) {
  margin: 0;
  padding: 24px 20px 0;
  border-bottom: none;
}

.order-dialog :deep(.el-dialog__body) {
  padding: 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.order-dialog :deep(.el-dialog__footer) {
  display: none;
}

/* 移动端 */
.order-dialog.is-mobile :deep(.el-dialog) {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  border-radius: 0;
  margin: 0;
  --el-dialog-margin-top: 0;
}

.order-dialog.is-mobile :deep(.el-dialog__header) {
  padding-top: 48px; /* 避开状态栏 */
}

/* ============================================================
   弹窗头部
   ============================================================ */
.order-dialog-header {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.order-dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #333333;
}

.order-dialog-close {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999999;
  transition: background 0.2s;
}

.order-dialog-close:hover {
  background: #f0f0f0;
  color: #333333;
}

/* ============================================================
   弹窗主体
   ============================================================ */
.order-dialog-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

/* 固定顶部区域 */
.order-top-fixed {
  flex-shrink: 0;
  padding: 20px 20px 0;
  background: #fff;
  z-index: 1;
}

/* ============================================================
   角色切换标签（我卖出的 / 我买到的）
   ============================================================ */
.order-role-tabs {
  display: flex;
  width: 100%;
  height: 44px;
  background: #F5F7FA;
  border-radius: 12px;
  padding: 3px;
  box-sizing: border-box;
}

.order-role-tab {
  flex: 1;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  background: transparent;
  color: #666666;
  transition: all 0.2s ease;
  outline: none;
}

.order-role-tab.active {
  background: #fff;
  color: #FF7D00;
  font-weight: 500;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.order-role-tab:hover:not(.active) {
  color: #FF7D00;
}

/* ============================================================
   状态筛选标签
   ============================================================ */
.order-status-tabs {
  display: flex;
  gap: 12px;
  padding: 20px 0 8px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.order-status-tabs::-webkit-scrollbar {
  display: none;
}

.order-status-tab {
  flex-shrink: 0;
  padding: 8px 16px;
  border: 1px solid #e5e5e5;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  background: #fff;
  color: #666666;
  transition: all 0.2s ease;
  outline: none;
  white-space: nowrap;
}

.order-status-tab.active {
  background: #FF7D00;
  border-color: #FF7D00;
  color: #fff;
  font-weight: 500;
}

.order-status-tab:hover:not(.active) {
  border-color: #FF7D00;
  color: #FF7D00;
}

/* ============================================================
   订单列表容器（可滚动）
   ============================================================ */
.order-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
  min-height: 200px;
}

.order-list-container.loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
}

/* ============================================================
   骨架屏
   ============================================================ */
.order-skeleton {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* ============================================================
   空状态 / 加载失败
   ============================================================ */
.order-state-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.order-state-text {
  font-size: 14px;
  color: #666666;
  margin: 16px 0 20px;
}

.order-state-wrapper .el-button--primary {
  background: #FF7D00;
  border-color: #FF7D00;
  padding: 10px 28px;
  font-size: 14px;
}

.order-state-wrapper .el-button--primary:hover {
  background: #e66d00;
  border-color: #e66d00;
}

/* ============================================================
   订单卡片列表
   ============================================================ */
.order-card-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
}

/* TransitionGroup 动画 */
.order-fade-enter-active,
.order-fade-leave-active {
  transition: all 0.3s ease;
}
.order-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.order-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ============================================================
   单个订单卡片
   ============================================================ */
.order-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.2s ease;
}

.order-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

/* ---------- 卡片头部 ---------- */
.order-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f5f5f5;
}

.order-card-no {
  font-size: 12px;
  color: #999999;
}

.order-card-status {
  font-size: 13px;
  font-weight: 500;
}

/* 状态颜色 */
.order-card-status.status-0 { color: #FF7D00; }   /* 待付款 */
.order-card-status.status-1 { color: #409EFF; }   /* 待发货 */
.order-card-status.status-2 { color: #909399; }   /* 待收货 */
.order-card-status.status-3 { color: #67C23A; }   /* 已完成 */
.order-card-status.status-4 { color: #909399; }   /* 已取消 */
.order-card-status.status-5 { color: #E6A23C; }   /* 退款中 */
.order-card-status.status-6 { color: #909399; }   /* 已退款 */

/* ---------- 商品行 ---------- */
.order-card-goods {
  margin-bottom: 12px;
}

.order-goods-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.order-goods-item + .order-goods-item {
  border-top: 1px solid #f8f8f8;
}

.order-goods-img {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  flex-shrink: 0;
  background: #f3f4f6;
}

.order-img-placeholder {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #ccc;
  border-radius: 8px;
}

.order-goods-info {
  flex: 1;
  min-width: 0;
}

.order-goods-name {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 0 4px;
}

.order-goods-desc {
  font-size: 12px;
  color: #999999;
  margin: 0;
}

.order-goods-price {
  text-align: right;
  flex-shrink: 0;
}

.order-price-num {
  font-size: 14px;
  font-weight: 600;
  color: #333333;
  margin: 0 0 2px;
}

.order-price-qty {
  font-size: 12px;
  color: #999999;
  margin: 0;
}

/* ---------- 卡片底部 ---------- */
.order-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #f5f5f5;
}

.order-card-total {
  font-size: 13px;
  color: #666666;
}

.order-card-total em {
  font-style: normal;
  font-size: 15px;
  font-weight: 600;
  color: #FF4D4F;
}

.order-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Element Plus 按钮覆写 */
.order-card-actions .el-button--primary {
  background: #FF7D00;
  border-color: #FF7D00;
}

.order-card-actions .el-button--primary:hover {
  background: #e66d00;
  border-color: #e66d00;
}

.order-card-actions .el-button--primary.is-disabled {
  background: #f5f5f5;
  border-color: #d9d9d9;
  color: #bfbfbf;
}

/* ---------- 加载更多 ---------- */
.order-load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 0;
  font-size: 13px;
  color: #999999;
}

.order-no-more {
  text-align: center;
  padding: 20px 0;
  font-size: 12px;
  color: #cccccc;
}

/* ============================================================
   响应式 - 移动端
   ============================================================ */
@media (max-width: 640px) {
  .order-dialog :deep(.el-dialog) {
    border-radius: 0;
    max-height: 100vh;
  }

  .order-top-fixed {
    padding: 12px 16px 0;
  }

  .order-status-tabs {
    gap: 10px;
    padding: 16px 0 8px;
  }

  .order-status-tab {
    padding: 6px 14px;
    font-size: 12px;
  }

  .order-list-container {
    padding: 0 16px 16px;
  }

  .order-card {
    padding: 12px;
  }

  .order-card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .order-card-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .order-card-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .order-goods-img {
    width: 48px;
    height: 48px;
  }

  .order-card-total em {
    font-size: 14px;
  }
}
</style>
