<template>
  <div class="feedback-page">
    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 反馈列表 -->
      <div class="feedback-list">
        <div
          v-for="(item, index) in feedbackList"
          :key="item.id"
          class="feedback-card"
        >
          <!-- 顶部行 -->
          <div class="card-header">
            <div class="card-user">
              <span class="card-username">{{ item.user }}</span>
            </div>
            <span
              class="card-tag"
              :class="item.type === 'Bug报告' ? 'tag-bug' : 'tag-report'"
            >{{ item.type }}</span>
          </div>

          <!-- 反馈正文 -->
          <p class="card-content">{{ item.content }}</p>

          <!-- 反馈配图 -->
          <div v-if="item.images && item.images.length" class="card-images">
            <img
              v-for="(img, i) in item.images"
              :key="i"
              :src="img"
              class="card-image"
              alt="反馈图片"
            />
          </div>

          <!-- 底部分隔区 -->
          <div class="card-footer">
            <el-divider class="card-divider" />
            <div class="card-phone">
              <span class="phone-icon">📞</span>
              <span class="phone-text">{{ item.phone }}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const feedbackList = ref([
  {
    id: 1,
    user: '用户 #3',
    type: 'Bug报告',
    content: '为什么明明有库存却买不了？',
    images: [
      'https://picsum.photos/200/200?random=1',
      'https://picsum.photos/200/200?random=2'
    ],
    phone: '13321583783'
  },
  {
    id: 2,
    user: '用户 #3',
    type: '投诉举报',
    content: '有人发布的消息涉及违规',
    images: ['https://picsum.photos/200/200?random=3'],
    phone: '13336473836'
  },
  {
    id: 3,
    user: '用户 #3',
    type: 'Bug报告',
    content: '这个商品明明有库存为什么买不了？',
    images: ['https://picsum.photos/200/200?random=4'],
    phone: '133xxxxxxx'
  }
])
</script>

<style scoped>
/* ========== 页面容器 ========== */
.feedback-page {
  min-height: 100vh;
  background: #f5f7fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

/* ========== 顶部通栏 ========== */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 48px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  box-sizing: border-box;
}

.top-bar-title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  margin: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.user-name {
  font-size: 14px;
  color: #303133;
  font-weight: 400;
}

/* ========== 主内容区 ========== */
.main-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 24px 24px;
  box-sizing: border-box;
}

/* ========== 反馈列表 ========== */
.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ========== 反馈卡片 ========== */
.feedback-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s;
}

.feedback-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

/* ----- 顶部行 ----- */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-user {
  display: flex;
  align-items: center;
}

.card-username {
  font-size: 14px;
  color: #303133;
  font-weight: 400;
}

/* ----- 反馈类型标签 ----- */
.card-tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
}

.tag-bug {
  background: #ecf5ff;
  color: #409eff;
}

.tag-report {
  background: #fef0f0;
  color: #f56c6c;
}

/* ----- 反馈正文 ----- */
.card-content {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: #303133;
}

/* ----- 反馈配图 ----- */
.card-images {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.card-image {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
}

/* ----- 底部分隔区 ----- */
.card-footer {
  margin-top: 16px;
}

.card-divider {
  margin: 0 0 12px;
  border-color: #ebeef5;
}

:deep(.card-divider.el-divider--horizontal) {
  margin: 0 0 12px;
}

.card-phone {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.phone-icon {
  font-size: 14px;
  line-height: 1;
}

.phone-text {
  font-size: 13px;
  color: #606266;
}
</style>
