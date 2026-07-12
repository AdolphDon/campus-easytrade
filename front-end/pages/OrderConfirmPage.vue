<template>
  <div class="oc-page">

    <!-- ===== 顶部：4步进度条 ===== -->
    <div class="oc-steps">
      <div class="oc-step" :class="{ active: step >= 1, current: step === 1 }">
        <div class="oc-step-dot">1</div>
        <span class="oc-step-label">购物车</span>
      </div>
      <div class="oc-step-line" :class="{ active: step >= 2 }" />
      <div class="oc-step" :class="{ active: step >= 2, current: step === 2 }">
        <div class="oc-step-dot">2</div>
        <span class="oc-step-label">确认订单</span>
      </div>
      <div class="oc-step-line" :class="{ active: step >= 3 }" />
      <div class="oc-step" :class="{ active: step >= 3, current: step === 3 }">
        <div class="oc-step-dot">3</div>
        <span class="oc-step-label">支付</span>
      </div>
      <div class="oc-step-line" :class="{ active: step >= 4 }" />
      <div class="oc-step" :class="{ active: step >= 4, current: step === 4 }">
        <div class="oc-step-dot">4</div>
        <span class="oc-step-label">完成</span>
      </div>
    </div>

    <!-- ===== 主体内容区 ===== -->
    <div class="oc-body">

      <!-- ===== 左栏 70% ===== -->
      <div class="oc-left">

        <!-- 收货地址 -->
        <div class="oc-card">
          <div class="oc-section-title">收货地址</div>
          <div class="oc-address-list">
            <div
              v-for="addr in addresses"
              :key="addr.id"
              class="oc-address-item"
              :class="{ selected: selectedAddressId === addr.id }"
              @click="selectedAddressId = addr.id"
            >
              <div class="oc-addr-radio">
                <div v-if="selectedAddressId === addr.id" class="oc-addr-radio-dot" />
              </div>
              <div class="oc-addr-info">
                <div class="oc-addr-top">
                  <span class="oc-addr-name">{{ addr.name }}</span>
                  <span class="oc-addr-phone">{{ addr.phone }}</span>
                  <span v-if="addr.isDefault" class="oc-addr-tag">默认</span>
                </div>
                <div class="oc-addr-line1">{{ addr.line1 }}</div>
                <div class="oc-addr-line2">{{ addr.line2 }}</div>
              </div>
              <div class="oc-addr-actions">
                <el-button link type="primary" @click.stop="editAddress(addr)">修改</el-button>
                <el-button link type="danger" @click.stop="deleteAddress(addr)">删除</el-button>
              </div>
            </div>
          </div>
          <div class="oc-add-address" @click="openAddAddress">
            <Plus />
            <span>新增收货地址</span>
          </div>
        </div>

        <!-- 订单商品 -->
        <div class="oc-card">
          <div class="oc-section-title">订单商品</div>
          <div class="oc-goods-table">
            <!-- 表头 -->
            <div class="oc-goods-header">
              <div class="oc-col-info">商品信息</div>
              <div class="oc-col-price">单价</div>
              <div class="oc-col-qty">数量</div>
              <div class="oc-col-subtotal">小计</div>
            </div>
            <!-- 商品行 -->
            <div
              v-for="item in orderItems"
              :key="item.id"
              class="oc-goods-row"
            >
              <div class="oc-col-info">
                <div class="oc-goods-thumb">
                  <Goods />
                </div>
                <div class="oc-goods-detail">
                  <div class="oc-goods-name">{{ item.name }}</div>
                  <div class="oc-goods-spec">{{ item.spec }}</div>
                  <div class="oc-goods-tag">
                    <CircleCheck />
                    <span>7天无理由退换</span>
                  </div>
                </div>
              </div>
              <div class="oc-col-price">
                <span class="oc-price">¥{{ item.price.toFixed(2) }}</span>
              </div>
              <div class="oc-col-qty">
                <div class="oc-qty-control">
                  <el-button
                    :icon="Minus"
                    circle
                    size="small"
                    @click="decreaseQty(item)"
                  />
                  <span class="oc-qty-num">{{ item.quantity }}</span>
                  <el-button
                    :icon="Plus"
                    circle
                    size="small"
                    @click="increaseQty(item)"
                  />
                </div>
              </div>
              <div class="oc-col-subtotal">
                <span class="oc-price">¥{{ (item.price * item.quantity).toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 右栏 30% ===== -->
      <div class="oc-right">

        <!-- 订单结算 -->
        <div class="oc-card">
          <div class="oc-section-title">订单结算</div>
          <div class="oc-summary-row">
            <span>商品总价 ({{ totalCount }}件)</span>
            <span class="oc-price">¥{{ goodsTotal.toFixed(2) }}</span>
          </div>
          <div class="oc-summary-row">
            <span class="oc-freight-label">
              运费
              <el-tooltip content="校园内统一配送费" placement="top">
                <InfoFilled class="oc-info-icon" />
              </el-tooltip>
            </span>
            <span class="oc-price">¥{{ freight.toFixed(2) }}</span>
          </div>
          <div class="oc-summary-row oc-coupon-row">
            <span>优惠券</span>
            <span class="oc-coupon-text">
              暂无可用
              <ArrowDown class="oc-arrow-icon" />
            </span>
          </div>
          <div class="oc-summary-total">
            <span>应付总额:</span>
            <span class="oc-price oc-price-total">¥{{ payableTotal.toFixed(2) }}</span>
          </div>
        </div>

        <!-- 支付方式 -->
        <div class="oc-card">
          <div class="oc-section-title">支付方式</div>
          <el-radio-group v-model="paymentMethod" class="oc-pay-group">
            <label
              v-for="pay in paymentOptions"
              :key="pay.value"
              class="oc-pay-item"
              :class="{ selected: paymentMethod === pay.value }"
            >
              <el-radio :value="pay.value">
                <div class="oc-pay-content">
                  <component :is="pay.icon" class="oc-pay-icon" :style="{ color: pay.color }" />
                  <span>{{ pay.label }}</span>
                  <span v-if="pay.recommend" class="oc-recommend">推荐使用</span>
                </div>
              </el-radio>
            </label>
          </el-radio-group>
        </div>

        <!-- 发票信息 -->
        <div class="oc-card">
          <div class="oc-section-title">发票信息</div>
          <el-radio-group v-model="invoiceType" class="oc-invoice-group">
            <label
              class="oc-invoice-item"
              :class="{ selected: invoiceType === 'none' }"
            >
              <el-radio value="none">不需要发票</el-radio>
            </label>
            <label
              class="oc-invoice-item"
              :class="{ selected: invoiceType === 'apply' }"
            >
              <el-radio value="apply">申请发票</el-radio>
            </label>
          </el-radio-group>
        </div>

        <!-- 提交订单 -->
        <el-button
          type="primary"
          size="large"
          :loading="submitting"
          class="oc-submit-btn"
          @click="handleSubmit"
        >
          提交订单
        </el-button>
        <p class="oc-submit-tip">请在提交订单后 30 分钟内完成支付</p>
      </div>
    </div>

    <!-- ===== 新增/修改地址对话框 ===== -->
    <el-dialog
      v-model="showAddressDialog"
      :title="editingAddress ? '修改收货地址' : '新增收货地址'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form :model="addressForm" label-position="top">
        <el-form-item label="收件人姓名">
          <el-input v-model="addressForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号码">
          <el-input v-model="addressForm.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="详细地址（第一行）">
          <el-input v-model="addressForm.line1" placeholder="如：XX大学（本部）男生宿舍 楼5栋 512室" />
        </el-form-item>
        <el-form-item label="详细地址（第二行）">
          <el-input v-model="addressForm.line2" placeholder="如：广东省 广州市 番禺区 大学城外环西路100号" />
        </el-form-item>
        <el-form-item label="设为默认地址">
          <el-switch v-model="addressForm.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddressDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingAddress" @click="saveAddress">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Minus, Goods, CircleCheck, InfoFilled, ArrowDown,
  ChatDotSquare, Wallet, CreditCard, Money,
} from '@element-plus/icons-vue'

/* =============================
   进度条：当前第 2 步
   ============================= */
const step = ref(2)

/* =============================
   收货地址
   ============================= */
const addresses = ref([
  {
    id: 1,
    name: '张同学',
    phone: '138****5678',
    line1: 'XX大学（本部）男生宿舍 楼5栋 512室',
    line2: '广东省 广州市 番禺区 大学城外环西路100号',
    isDefault: true,
  },
])
const selectedAddressId = ref(1)
const showAddressDialog = ref(false)
const editingAddress = ref(null)
const savingAddress = ref(false)
const addressForm = ref({
  name: '',
  phone: '',
  line1: '',
  line2: '',
  isDefault: false,
})

/* =============================
   订单商品（与参考图一致）
   ============================= */
const orderItems = ref([
  {
    id: 1,
    name: '无线蓝牙耳机 降噪版',
    spec: '颜色: 白色',
    price: 89.00,
    quantity: 1,
  },
  {
    id: 2,
    name: '大学英语四级词汇书 2025版',
    spec: '颜色: 蓝色',
    price: 89.00,
    quantity: 1,
  },
  {
    id: 3,
    name: 'USB-C 快充数据线 1.5米',
    spec: '颜色: 黑色',
    price: 39.90,
    quantity: 1,
  },
])

/* =============================
   订单结算
   ============================= */
const freight = ref(3.00)

const totalCount = computed(() =>
  orderItems.value.reduce((sum, item) => sum + item.quantity, 0)
)

const goodsTotal = computed(() =>
  orderItems.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
)

const payableTotal = computed(() => goodsTotal.value + freight.value)

/* =============================
   支付方式
   ============================= */
const paymentMethod = ref('wechat')
const paymentOptions = [
  { value: 'wechat', label: '微信支付', icon: ChatDotSquare, color: '#07C160' },
  { value: 'alipay', label: '支付宝支付', icon: Wallet, color: '#1677FF' },
  { value: 'campus', label: '校园一卡通支付', icon: CreditCard, color: '#909399', recommend: true },
  { value: 'unionpay', label: '云闪付', icon: Money, color: '#E60012' },
]

/* =============================
   发票信息
   ============================= */
const invoiceType = ref('none')

/* =============================
   提交订单
   ============================= */
const submitting = ref(false)

/* =============================
   交互方法
   ============================= */

// 商品数量增减
function increaseQty(item) {
  item.quantity++
}
function decreaseQty(item) {
  if (item.quantity > 1) item.quantity--
}

// 打开新增地址
function openAddAddress() {
  editingAddress.value = null
  addressForm.value = { name: '', phone: '', line1: '', line2: '', isDefault: false }
  showAddressDialog.value = true
}

// 修改地址
function editAddress(addr) {
  editingAddress.value = addr
  addressForm.value = {
    name: addr.name,
    phone: addr.phone,
    line1: addr.line1,
    line2: addr.line2,
    isDefault: addr.isDefault,
  }
  showAddressDialog.value = true
}

// 删除地址
function deleteAddress(addr) {
  ElMessageBox.confirm('确定要删除该收货地址吗？', '提示', { type: 'warning' })
    .then(() => {
      addresses.value = addresses.value.filter(a => a.id !== addr.id)
      if (selectedAddressId.value === addr.id) {
        selectedAddressId.value = addresses.value[0]?.id ?? null
      }
      ElMessage.success('地址已删除')
    })
    .catch(() => {})
}

// 保存地址
function saveAddress() {
  if (!addressForm.value.name || !addressForm.value.phone) {
    ElMessage.warning('请填写收件人姓名和手机号码')
    return
  }
  savingAddress.value = true
  setTimeout(() => {
    if (editingAddress.value) {
      Object.assign(editingAddress.value, addressForm.value)
    } else {
      const newAddr = { id: Date.now(), ...addressForm.value }
      if (newAddr.isDefault) {
        addresses.value.forEach(a => { a.isDefault = false })
      }
      addresses.value.push(newAddr)
      if (!selectedAddressId.value) selectedAddressId.value = newAddr.id
    }
    savingAddress.value = false
    showAddressDialog.value = false
    editingAddress.value = null
    ElMessage.success('地址保存成功')
  }, 300)
}

// 提交订单
function handleSubmit() {
  if (!selectedAddressId.value) {
    ElMessage.warning('请选择收货地址')
    return
  }
  submitting.value = true
  setTimeout(() => {
    submitting.value = false
    ElMessage.success('订单提交成功，请尽快完成支付')
  }, 1500)
}
</script>

<style scoped>
/* ===== 页面容器 ===== */
.oc-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 20px 60px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  min-height: 100vh;
}

/* ===== 进度条 ===== */
.oc-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
}
.oc-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.oc-step-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  background: #f0f0f0;
  color: #999;
  transition: all 0.3s;
}
.oc-step.active .oc-step-dot {
  background: #FF7D00;
  color: #fff;
}
.oc-step.current .oc-step-dot {
  box-shadow: 0 0 0 4px rgba(255, 125, 0, 0.2);
}
.oc-step-label {
  font-size: 13px;
  color: #999;
  white-space: nowrap;
}
.oc-step.active .oc-step-label {
  color: #333;
}
.oc-step.current .oc-step-label {
  color: #FF7D00;
  font-weight: 600;
}
.oc-step-line {
  width: 100px;
  height: 2px;
  background: #f0f0f0;
  margin: 0 12px;
  margin-bottom: 28px;
  transition: background 0.3s;
}
.oc-step-line.active {
  background: #FF7D00;
}

/* ===== 主体布局 70% / 30% ===== */
.oc-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.oc-left {
  flex: 0 0 70%;
  max-width: 70%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.oc-right {
  flex: 0 0 calc(30% - 24px);
  max-width: calc(30% - 24px);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ===== 卡片通用 ===== */
.oc-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.oc-section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 16px;
}

/* ===== 收货地址 ===== */
.oc-address-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.oc-address-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1.5px solid #eee;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.oc-address-item:hover {
  border-color: #FF7D00;
}
.oc-address-item.selected {
  border-color: #FF7D00;
  background: rgba(255, 125, 0, 0.03);
}
.oc-addr-radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #d0d0d0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 3px;
  transition: all 0.2s;
}
.oc-address-item.selected .oc-addr-radio {
  border-color: #FF7D00;
}
.oc-addr-radio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #FF7D00;
}
.oc-addr-info {
  flex: 1;
  min-width: 0;
}
.oc-addr-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.oc-addr-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}
.oc-addr-phone {
  font-size: 13px;
  color: #666;
}
.oc-addr-tag {
  font-size: 11px;
  background: rgba(255, 125, 0, 0.1);
  color: #FF7D00;
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.oc-addr-line1 {
  font-size: 13px;
  color: #333;
  line-height: 1.5;
  margin-bottom: 2px;
}
.oc-addr-line2 {
  font-size: 13px;
  color: #888;
  line-height: 1.5;
}
.oc-addr-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  align-items: flex-end;
}
.oc-add-address {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  padding: 10px;
  border: 1px dashed #ddd;
  border-radius: 12px;
  color: #666;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.oc-add-address:hover {
  border-color: #FF7D00;
  color: #FF7D00;
}
.oc-add-address svg {
  width: 14px;
  height: 14px;
}

/* ===== 订单商品表格 ===== */
.oc-goods-table {
  width: 100%;
}
.oc-goods-header {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
  color: #999;
}
.oc-goods-row {
  display: flex;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f5f5f5;
}
.oc-goods-row:last-child {
  border-bottom: none;
}
.oc-col-info {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.oc-col-price {
  width: 90px;
  text-align: center;
  flex-shrink: 0;
}
.oc-col-qty {
  width: 120px;
  text-align: center;
  flex-shrink: 0;
}
.oc-col-subtotal {
  width: 90px;
  text-align: right;
  flex-shrink: 0;
}
.oc-goods-thumb {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #ccc;
}
.oc-goods-thumb svg {
  width: 32px;
  height: 32px;
}
.oc-goods-detail {
  flex: 1;
  min-width: 0;
}
.oc-goods-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
  margin-bottom: 4px;
  line-height: 1.4;
}
.oc-goods-spec {
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
}
.oc-goods-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #52c41a;
}
.oc-goods-tag svg {
  width: 12px;
  height: 12px;
}
.oc-qty-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.oc-qty-num {
  font-size: 14px;
  min-width: 24px;
  text-align: center;
}

/* ===== 价格颜色 ===== */
.oc-price {
  color: #FF4D4F;
  font-weight: 600;
}

/* ===== 订单结算 ===== */
.oc-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #333;
  margin-bottom: 12px;
}
.oc-freight-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.oc-info-icon {
  width: 14px;
  height: 14px;
  color: #999;
  cursor: pointer;
}
.oc-coupon-row {
  margin-bottom: 16px;
}
.oc-coupon-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #999;
  cursor: pointer;
}
.oc-arrow-icon {
  width: 12px;
  height: 12px;
}
.oc-summary-total {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  font-size: 14px;
  color: #333;
}
.oc-price-total {
  font-size: 22px;
  font-weight: 700;
}

/* ===== 支付方式 ===== */
.oc-pay-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.oc-pay-item {
  display: block;
  padding: 12px 14px;
  border: 1.5px solid #eee;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.oc-pay-item.selected {
  border-color: #FF7D00;
  background: rgba(255, 125, 0, 0.03);
}
.oc-pay-item :deep(.el-radio) {
  width: 100%;
  height: auto;
  margin-right: 0;
}
.oc-pay-item :deep(.el-radio__label) {
  width: 100%;
  padding-left: 8px;
}
.oc-pay-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #333;
}
.oc-pay-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.oc-recommend {
  font-size: 11px;
  color: #FF7D00;
  margin-left: 4px;
}

/* ===== 发票信息 ===== */
.oc-invoice-group {
  display: flex;
  gap: 16px;
  width: 100%;
}
.oc-invoice-item {
  flex: 1;
  padding: 12px 14px;
  border: 1.5px solid #eee;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.oc-invoice-item.selected {
  border-color: #FF7D00;
  background: rgba(255, 125, 0, 0.03);
}
.oc-invoice-item :deep(.el-radio) {
  margin-right: 0;
}
.oc-invoice-item :deep(.el-radio__label) {
  font-size: 14px;
}

/* ===== 提交按钮 ===== */
.oc-submit-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  border-radius: 12px;
  background: #FF7D00;
  border-color: #FF7D00;
}
.oc-submit-btn:hover,
.oc-submit-btn:focus {
  background: #e66d00;
  border-color: #e66d00;
}
.oc-submit-tip {
  text-align: center;
  font-size: 12px;
  color: #999;
  margin-top: -12px;
}

/* ===== Element Plus 主题色覆盖 ===== */
.oc-page :deep(.el-radio__input.is-checked .el-radio__inner) {
  background: #FF7D00;
  border-color: #FF7D00;
}
.oc-page :deep(.el-radio__input.is-checked + .el-radio__label) {
  color: #333;
}
.oc-page :deep(.el-button--primary) {
  --el-button-bg-color: #FF7D00;
  --el-button-border-color: #FF7D00;
  --el-button-hover-bg-color: #e66d00;
  --el-button-hover-border-color: #e66d00;
}
.oc-page :deep(.el-input__wrapper),
.oc-page :deep(.el-dialog) {
  border-radius: 12px;
}

/* ===== 响应式 ===== */
@media (max-width: 900px) {
  .oc-body {
    flex-direction: column;
  }
  .oc-left,
  .oc-right {
    flex: none;
    max-width: 100%;
    width: 100%;
  }
  .oc-step-line {
    width: 40px;
  }
  .oc-goods-header {
    display: none;
  }
  .oc-goods-row {
    flex-wrap: wrap;
    gap: 12px;
  }
  .oc-col-info {
    width: 100%;
    flex: none;
  }
  .oc-col-price,
  .oc-col-qty,
  .oc-col-subtotal {
    width: auto;
    flex: 1;
  }
  .oc-invoice-group {
    flex-direction: column;
  }
}
</style>
