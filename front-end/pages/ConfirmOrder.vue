<template>
  <div class="co-page">

    <!-- ===== 顶部：4步进度条 ===== -->
    <div class="co-steps">
      <div class="co-step" :class="{ active: step >= 1, current: step === 1 }">
        <div class="co-step-dot">
          <ShoppingCart />
        </div>
        <span class="co-step-label">购物车</span>
      </div>
      <div class="co-step-line" :class="{ active: step >= 2 }" />
      <div class="co-step" :class="{ active: step >= 2, current: step === 2 }">
        <div class="co-step-dot">
          <Tickets />
        </div>
        <span class="co-step-label">确认订单</span>
      </div>
      <div class="co-step-line" :class="{ active: step >= 3 }" />
      <div class="co-step" :class="{ active: step >= 3, current: step === 3 }">
        <div class="co-step-dot">
          <Wallet />
        </div>
        <span class="co-step-label">支付</span>
      </div>
      <div class="co-step-line" :class="{ active: step >= 4 }" />
      <div class="co-step" :class="{ active: step >= 4, current: step === 4 }">
        <div class="co-step-dot">
          <CircleCheck />
        </div>
        <span class="co-step-label">完成</span>
      </div>
    </div>

    <!-- ===== 主体内容区 ===== -->
    <div class="co-body">

      <!-- ===== 左栏 70% ===== -->
      <div class="co-left">

        <!-- 收货地址 -->
        <div class="co-card">
          <div class="co-card-header">
            <div class="co-card-title">
              <Position />
              <span>收货地址</span>
            </div>
            <el-button text type="primary" @click="showAddressDialog = true">
              <Plus /> 新增地址
            </el-button>
          </div>
          <div class="co-address-list">
            <div
              v-for="addr in addresses"
              :key="addr.id"
              class="co-address-item"
              :class="{ selected: selectedAddressId === addr.id }"
              @click="selectedAddressId = addr.id"
            >
              <div class="co-addr-radio">
                <div v-if="selectedAddressId === addr.id" class="co-addr-radio-dot" />
              </div>
              <div class="co-addr-info">
                <div class="co-addr-top">
                  <span class="co-addr-name">{{ addr.name }}</span>
                  <span class="co-addr-phone">{{ addr.phone }}</span>
                  <span v-if="addr.isDefault === 1" class="co-addr-tag">默认</span>
                </div>
                <div class="co-addr-detail">
                  {{ addr.schoolName }} {{ addr.dormitoryName }} {{ addr.detailAddress }}
                </div>
              </div>
              <div class="co-addr-actions">
                <el-button text size="small" @click.stop="editAddress(addr)">修改</el-button>
                <el-button text size="small" type="danger" @click.stop="deleteAddress(addr)">删除</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 订单商品 -->
        <div class="co-card">
          <div class="co-card-header">
            <div class="co-card-title">
              <Goods />
              <span>确认商品</span>
            </div>
            <span class="co-card-sub">共 {{ orderItems.length }} 件商品</span>
          </div>

          <!-- 按卖家分组 -->
          <div
            v-for="(group, gi) in sellerGroups"
            :key="gi"
            class="co-seller-group"
          >
            <div class="co-seller-header">
              <el-avatar :size="28" :src="group.sellerAvatar">
                {{ group.sellerNickname?.[0] }}
              </el-avatar>
              <span class="co-seller-name">{{ group.sellerNickname }}</span>
            </div>

            <div
              v-for="item in group.items"
              :key="item.goodsId"
              class="co-order-item"
            >
              <el-image
                class="co-item-img"
                :src="item.firstImage"
                fit="cover"
              >
                <template #error>
                  <div class="co-img-placeholder">暂无<br>图片</div>
                </template>
              </el-image>
              <div class="co-item-info">
                <div class="co-item-name">{{ item.goodsName }}</div>
                <div class="co-item-price">¥{{ item.price.toFixed(2) }}</div>
              </div>
              <div class="co-item-qty">
                <el-button
                  :icon="Minus"
                  circle
                  size="small"
                  @click="decreaseQty(item)"
                />
                <span class="co-qty-num">{{ item.quantity }}</span>
                <el-button
                  :icon="Plus"
                  circle
                  size="small"
                  @click="increaseQty(item)"
                />
              </div>
              <div class="co-item-subtotal">
                ¥{{ (item.price * item.quantity).toFixed(2) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 右栏 30% ===== -->
      <div class="co-right">

        <!-- 订单结算 -->
        <div class="co-card">
          <div class="co-card-header">
            <div class="co-card-title">
              <Document />
              <span>订单结算</span>
            </div>
          </div>
          <div class="co-summary-row">
            <span>商品小计</span>
            <span class="co-price">¥{{ totalPrice.toFixed(2) }}</span>
          </div>
          <div class="co-summary-row">
            <span>配送费</span>
            <span class="co-price co-price-free">免配送费</span>
          </div>
          <el-divider style="margin:12px 0" />
          <div class="co-summary-row co-summary-total">
            <span>合计</span>
            <span class="co-price co-price-total">¥{{ totalPrice.toFixed(2) }}</span>
          </div>
        </div>

        <!-- 支付方式 -->
        <div class="co-card">
          <div class="co-card-header">
            <div class="co-card-title">
              <CreditCard />
              <span>支付方式</span>
            </div>
          </div>
          <el-radio-group v-model="paymentMethod" class="co-pay-group">
            <el-radio value="wechat" class="co-pay-radio">
              <div class="co-pay-option">
                <ChatDotSquare style="color:#07C160" />
                <span>微信支付</span>
              </div>
            </el-radio>
            <el-radio value="alipay" class="co-pay-radio">
              <div class="co-pay-option">
                <Connection style="color:#1677FF" />
                <span>支付宝</span>
              </div>
            </el-radio>
          </el-radio-group>
        </div>

        <!-- 发票信息 -->
        <div class="co-card">
          <div class="co-card-header">
            <div class="co-card-title">
              <Reading />
              <span>发票信息</span>
            </div>
          </div>
          <el-radio-group v-model="invoiceType" class="co-invoice-group">
            <el-radio value="none" class="co-invoice-radio">不需要发票</el-radio>
            <el-radio value="personal" class="co-invoice-radio">个人发票</el-radio>
            <el-radio value="company" class="co-invoice-radio">企业发票</el-radio>
          </el-radio-group>
        </div>

        <!-- 提交订单 -->
        <el-button
          type="primary"
          size="large"
          :loading="submitting"
          class="co-submit-btn"
          @click="handleSubmit"
        >
          提交订单
        </el-button>
      </div>
    </div>

    <!-- ===== 新增/修改地址对话框 ===== -->
    <el-dialog
      v-model="showAddressDialog"
      :title="editingAddress ? '修改地址' : '新增地址'"
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
        <el-form-item label="宿舍楼">
          <el-select v-model="addressForm.dormitoryId" placeholder="请选择宿舍楼" style="width:100%">
            <el-option
              v-for="d in dormitories"
              :key="d.id"
              :label="d.name"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="详细地址">
          <el-input v-model="addressForm.detailAddress" placeholder="如：3栋203室" />
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
import { ref, computed, onMounted } from 'vue'
import {
  ShoppingCart, Tickets, Wallet, CircleCheck,
  Position, Plus, Goods, Document, CreditCard,
  ChatDotSquare, Connection, Reading, Minus,
} from '@element-plus/icons-vue'

/* =============================
   数据
   ============================= */
const step = ref(2) // 当前进度：2=确认订单

// ---------- 收货地址 ----------
const addresses = ref([])
const selectedAddressId = ref(null)
const showAddressDialog = ref(false)
const editingAddress = ref(null)
const savingAddress = ref(false)
const dormitories = ref([])
const addressForm = ref({
  name: '',
  phone: '',
  dormitoryId: null,
  detailAddress: '',
})

// ---------- 购物车商品（模拟数据） ----------
// 实际项目中应从 API 获取购物车已选商品
const orderItems = ref([
  { goodsId: 1, goodsName: '线性代数 第六版 同济大学', price: 29.99, quantity: 1, firstImage: '', sellerId: 101, sellerNickname: '小明', sellerAvatar: '' },
  { goodsId: 2, goodsName: '高等数学 第七版 上册', price: 39.99, quantity: 1, firstImage: '', sellerId: 101, sellerNickname: '小明', sellerAvatar: '' },
  { goodsId: 3, goodsName: '全新台灯 护眼 LED', price: 59.99, quantity: 1, firstImage: '', sellerId: 102, sellerNickname: '小红', sellerAvatar: '' },
])

// 按卖家分组
const sellerGroups = computed(() => {
  const map = {}
  orderItems.value.forEach(item => {
    if (!map[item.sellerId]) {
      map[item.sellerId] = {
        sellerId: item.sellerId,
        sellerNickname: item.sellerNickname,
        sellerAvatar: item.sellerAvatar,
        items: [],
      }
    }
    map[item.sellerId].items.push(item)
  })
  return Object.values(map)
})

// 计算总价
const totalPrice = computed(() => {
  return orderItems.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
})

// ---------- 支付方式 ----------
const paymentMethod = ref('wechat')

// ---------- 发票信息 ----------
const invoiceType = ref('none')

// ---------- 提交 ----------
const submitting = ref(false)

/* =============================
   方法
   ============================= */

// 数量增减
function increaseQty(item) {
  item.quantity++
}
function decreaseQty(item) {
  if (item.quantity > 1) {
    item.quantity--
  }
}

// 地址操作
function editAddress(addr) {
  editingAddress.value = addr
  addressForm.value = {
    name: addr.name,
    phone: addr.phone,
    dormitoryId: addr.dormitoryId,
    detailAddress: addr.detailAddress,
  }
  showAddressDialog.value = true
}
function deleteAddress(addr) {
  ElMessageBox.confirm('确定要删除该地址吗？', '提示', { type: 'warning' }).then(() => {
    addresses.value = addresses.value.filter(a => a.id !== addr.id)
    if (selectedAddressId.value === addr.id) {
      selectedAddressId.value = addresses.value[0]?.id || null
    }
  }).catch(() => {})
}
function saveAddress() {
  savingAddress.value = true
  setTimeout(() => {
    if (editingAddress.value) {
      // 修改
      Object.assign(editingAddress.value, addressForm.value)
    } else {
      // 新增
      addresses.value.unshift({
        id: Date.now(),
        ...addressForm.value,
        isDefault: addresses.value.length === 0 ? 1 : 0,
        schoolName: '某某大学',
        dormitoryName: dormitories.value.find(d => d.id === addressForm.value.dormitoryId)?.name || '',
      })
      if (selectedAddressId.value === null) {
        selectedAddressId.value = addresses.value[0].id
      }
    }
    savingAddress.value = false
    showAddressDialog.value = false
    editingAddress.value = null
    addressForm.value = { name: '', phone: '', dormitoryId: null, detailAddress: '' }
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
    ElMessage.success('订单提交成功')
  }, 1500)
}

// 初始化模拟数据
onMounted(() => {
  addresses.value = [
    { id: 1, name: '张三', phone: '13800138000', dormitoryId: 1, dormitoryName: '梅苑1栋', detailAddress: '3楼303室', schoolName: '华南理工大学', isDefault: 1 },
    { id: 2, name: '张三', phone: '13800138001', dormitoryId: 2, dormitoryName: '兰苑2栋', detailAddress: '5楼501室', schoolName: '华南理工大学', isDefault: 0 },
  ]
  dormitories.value = [
    { id: 1, name: '梅苑1栋' },
    { id: 2, name: '兰苑2栋' },
    { id: 3, name: '竹苑3栋' },
  ]
  selectedAddressId.value = 1
})
</script>

<style scoped>
/* ===== 全局变量 ===== */
.co-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 20px 60px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ===== 进度条 ===== */
.co-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  gap: 0;
}
.co-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
}
.co-step-dot {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: #f0f0f0;
  color: #999;
  transition: all 0.3s;
}
.co-step.active .co-step-dot {
  background: #FF7D00;
  color: #fff;
}
.co-step.current .co-step-dot {
  box-shadow: 0 0 0 4px rgba(255, 125, 0, 0.2);
}
.co-step-label {
  font-size: 13px;
  color: #999;
  white-space: nowrap;
}
.co-step.current .co-step-label {
  color: #FF7D00;
  font-weight: 600;
}
.co-step-line {
  width: 80px;
  height: 2px;
  background: #f0f0f0;
  margin: 0 8px;
  margin-bottom: 28px;
  transition: background 0.3s;
}
.co-step-line.active {
  background: #FF7D00;
}

/* ===== 主体布局 ===== */
.co-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.co-left {
  flex: 0 0 70%;
  max-width: 70%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.co-right {
  flex: 0 0 calc(30% - 24px);
  max-width: calc(30% - 24px);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ===== 卡片通用 ===== */
.co-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.co-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.co-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}
.co-card-title svg {
  width: 18px;
  height: 18px;
  color: #FF7D00;
}
.co-card-sub {
  font-size: 13px;
  color: #999;
}

/* ===== 收货地址 ===== */
.co-address-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.co-address-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1.5px solid #eee;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.co-address-item:hover {
  border-color: #FF7D00;
}
.co-address-item.selected {
  border-color: #FF7D00;
  background: rgba(255, 125, 0, 0.03);
}
.co-addr-radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #d0d0d0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  transition: all 0.2s;
}
.co-address-item.selected .co-addr-radio {
  border-color: #FF7D00;
}
.co-addr-radio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #FF7D00;
}
.co-addr-info {
  flex: 1;
  min-width: 0;
}
.co-addr-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.co-addr-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}
.co-addr-phone {
  font-size: 13px;
  color: #666;
}
.co-addr-tag {
  font-size: 11px;
  background: rgba(255, 125, 0, 0.1);
  color: #FF7D00;
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.co-addr-detail {
  font-size: 13px;
  color: #888;
  line-height: 1.4;
}
.co-addr-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* ===== 商品 ===== */
.co-seller-group {
  margin-bottom: 16px;
}
.co-seller-group:last-child {
  margin-bottom: 0;
}
.co-seller-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 12px;
}
.co-seller-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}
.co-order-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #f5f5f5;
}
.co-order-item:last-child {
  border-bottom: none;
}
.co-item-img {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  flex-shrink: 0;
  background: #f5f5f5;
}
.co-img-placeholder {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #bbb;
  font-size: 11px;
  text-align: center;
  border-radius: 8px;
}
.co-item-info {
  flex: 1;
  min-width: 0;
}
.co-item-name {
  font-size: 14px;
  color: #1a1a1a;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}
.co-item-price {
  font-size: 13px;
  color: #888;
}
.co-item-qty {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.co-qty-num {
  font-size: 14px;
  font-weight: 500;
  min-width: 20px;
  text-align: center;
}
.co-item-subtotal {
  width: 100px;
  text-align: right;
  font-size: 15px;
  font-weight: 600;
  color: #FF4D4F;
  flex-shrink: 0;
}

/* ===== 结算摘要 ===== */
.co-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #333;
  margin-bottom: 12px;
}
.co-summary-row:last-child {
  margin-bottom: 0;
}
.co-price {
  font-weight: 600;
  color: #FF4D4F;
}
.co-price-free {
  color: #52c41a;
  font-weight: 400;
}
.co-summary-total {
  font-size: 16px;
}
.co-price-total {
  font-size: 20px;
}

/* ===== 支付方式 ===== */
.co-pay-group,
.co-invoice-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.co-pay-radio,
.co-invoice-radio {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border: 1.5px solid #eee;
  border-radius: 12px;
  width: 100%;
  margin-right: 0;
  transition: all 0.2s;
}
.co-pay-radio:has(.el-radio.is-checked),
.co-invoice-radio:has(.el-radio.is-checked) {
  border-color: #FF7D00;
  background: rgba(255, 125, 0, 0.03);
}
.co-pay-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.co-pay-option svg {
  width: 20px;
  height: 20px;
}

/* ===== 提交按钮 ===== */
.co-submit-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  border-radius: 12px;
  background: #FF7D00;
  border-color: #FF7D00;
}
.co-submit-btn:hover {
  background: #e66d00;
  border-color: #e66d00;
}

/* ===== 响应式 ===== */
@media (max-width: 900px) {
  .co-body {
    flex-direction: column;
  }
  .co-left,
  .co-right {
    flex: none;
    max-width: 100%;
    width: 100%;
  }
  .co-step-line {
    width: 40px;
  }
}
</style>
