<template>
  <div class="im-container">
    <!-- ==================== 左侧：会话列表 ==================== -->
    <aside class="im-sidebar">
      <!-- 顶部标题 -->
      <div class="sidebar-header">
        <span class="sidebar-title">消息</span>
      </div>

      <!-- 会话列表 -->
      <div
        ref="sessionListRef"
        class="session-scroll"
        v-loading="loading.sessions"
        element-loading-text="加载中…"
      >
        <!-- 空状态 -->
        <div v-if="!loading.sessions && sessions.length === 0" class="session-empty">
          <svg class="empty-icon" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="12" width="48" height="34" rx="4" stroke="#D0D5DD" stroke-width="2.5"/>
            <path d="M8 22l24 14 24-14" stroke="#D0D5DD" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="32" cy="32" r="3" fill="#D0D5DD"/>
          </svg>
          <span class="empty-text">暂无聊天对话</span>
        </div>

        <!-- 列表 -->
        <div
          v-for="item in sessions"
          :key="item.sessionId"
          class="session-item"
          :class="{ active: item.sessionId === activeSessionId }"
          @click="switchSession(item)"
        >
          <!-- 激活指示条 -->
          <div v-if="item.sessionId === activeSessionId" class="active-bar" />

          <!-- 头像 -->
          <div class="session-avatar">
            <img
              v-if="item.otherAvatar"
              :src="item.otherAvatar"
              alt=""
              @error="onAvatarError"
            />
            <span v-else class="avatar-fallback">{{ fallbackChar(item.otherNickname) }}</span>
          </div>

          <!-- 中间信息 -->
          <div class="session-info">
            <div class="session-row-top">
              <span class="session-name">{{ item.otherNickname || '已注销' }}</span>
              <span class="session-time">{{ fmtTime(item.lastTime) }}</span>
            </div>
            <div class="session-row-bottom">
              <span class="session-msg">{{ item.lastMessage || '' }}</span>
              <span v-if="(item.unreadCount || 0) > 0" class="session-badge">
                {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- ==================== 右侧：聊天区 ==================== -->
    <main class="im-main">
      <!-- 未选中会话 -->
      <div v-if="!activeSessionId" class="chat-empty">
        <svg class="empty-icon large" viewBox="0 0 80 80" fill="none">
          <rect x="10" y="16" width="60" height="42" rx="5" stroke="#D0D5DD" stroke-width="2.5"/>
          <path d="M10 28l30 18 30-18" stroke="#D0D5DD" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="40" cy="40" r="4" fill="#D0D5DD"/>
          <path d="M28 48l-6 10" stroke="#D0D5DD" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="empty-text">选择一个对话开始聊天</span>
      </div>

      <!-- 聊天面板 -->
      <template v-else>
        <!-- ===== 顶部栏 ===== -->
        <div class="chat-topbar">
          <div class="topbar-left">
            <div class="topbar-avatar">
              <img
                v-if="activeSessionAvatar"
                :src="activeSessionAvatar"
                alt=""
                @error="onAvatarError"
              />
              <span v-else class="avatar-fallback sm">{{ fallbackChar(activeSessionName) }}</span>
            </div>
            <span class="topbar-name">{{ activeSessionName }}</span>
          </div>
          <div class="topbar-actions">
            <!-- 预留：更多操作按钮 -->
          </div>
        </div>

        <!-- ===== 消息流 ===== -->
        <div ref="messageListRef" class="message-scroll" @scroll="onScroll">
          <!-- 加载更多 -->
          <div v-if="loading.messages" class="msg-loading-hint">加载中…</div>
          <div v-else-if="!hasMore" class="msg-loading-hint muted">没有更多消息了</div>

          <!-- 消息列表 + 日期分割 -->
          <template v-for="(node, idx) in flatMessages" :key="node._key">
            <div v-if="node._type === 'date'" class="msg-date-divider">
              <span>{{ node._label }}</span>
            </div>
            <div
              v-else
              class="msg-item"
              :class="[node._mine ? 'right' : 'left', node._compact ? 'compact' : '']"
            >
              <!-- 对方头像（左侧） -->
              <div v-if="!node._mine" class="msg-avatar">
                <img
                  v-if="activeSessionAvatar"
                  :src="activeSessionAvatar"
                  alt=""
                  @error="onAvatarError"
                />
                <span v-else class="avatar-fallback xs">{{ fallbackChar(activeSessionName) }}</span>
              </div>

              <div class="msg-body">
                <div class="msg-bubble">{{ node.content }}</div>
                <div class="msg-time" :class="node._mine ? 'tr' : 'tl'">{{ fmtMsgTime(node.createTime) }}</div>
              </div>

              <!-- 自己头像（右侧） -->
              <div v-if="node._mine" class="msg-avatar">
                <img
                  v-if="myAvatar"
                  :src="myAvatar"
                  alt=""
                  @error="onAvatarError"
                />
                <span v-else class="avatar-fallback xs">我</span>
              </div>
            </div>
          </template>

          <!-- 无消息提示 -->
          <div v-if="!loading.messages && messages.length === 0" class="msg-empty-hint">
            暂无消息，发送第一条吧
          </div>
        </div>

        <!-- ===== 底部输入栏 ===== -->
        <div class="chat-input-area">
          <!-- 工具栏 -->
          <div class="input-toolbar">
            <button class="toolbar-btn" title="表情" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="#909399" stroke-width="1.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9" r="1" fill="#909399"/><circle cx="15" cy="9" r="1" fill="#909399"/></svg>
            </button>
            <button class="toolbar-btn" title="图片" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="#909399" stroke-width="1.5" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </button>
            <button class="toolbar-btn" title="商品卡片" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="#909399" stroke-width="1.5" width="20" height="20"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M12 22V12"/><path d="M2 8l10 5 10-5"/></svg>
            </button>
          </div>

          <!-- 输入框 -->
          <el-input
            v-model="inputText"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="输入消息…"
            :disabled="sending"
            @keydown="onKeydown"
          />

          <!-- 发送按钮 -->
          <div class="input-actions">
            <el-button
              type="primary"
              size="default"
              round
              :disabled="!inputText.trim() || sending"
              :loading="sending"
              @click="sendMessage"
            >
              发送
            </el-button>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup>
/**
 * ChatIM.vue — 校易帮 PC 端 IM 组件
 *
 * 接口（前缀 /user/chat）：
 *   GET    /sessions              → 会话列表
 *   GET    /messages/{sessionId}  → 消息分页
 *   POST   /send                  → 发送消息
 *   POST   /create/{targetUserId} → 创建会话
 *   ws://host/ws/chat?token=      → WebSocket 实时推送
 */
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, defineExpose } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

// ============================================================
//  常量
// ============================================================

const API_BASE     = 'http://120.27.216.138'
const PAGE_SIZE    = 20
const WS_DELAY     = 5000            // WebSocket 重连基础间隔（ms）
const SCROLL_TOP   = 60              // 距顶部多少 px 触发加载历史
const SCROLL_NEAR  = 150             // 距底部多少 px 视为「靠近底部」

// ============================================================
//  axios 实例
// ============================================================

const http = axios.create({ baseURL: API_BASE, timeout: 15000 })

http.interceptors.request.use((cfg) => {
  const token = sessionStorage.getItem('auth_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

http.interceptors.response.use(
  (r) => r.data,
  (e) => {
    ElMessage.error(e.message || '网络异常')
    return Promise.reject(e)
  }
)

// ============================================================
//  工具函数
// ============================================================

/** 取昵称首字作头像占位 */
function fallbackChar(name) {
  return (name || '?').charAt(0)
}

/** 头像加载失败回调 */
function onAvatarError(e) {
  e.target.style.display = 'none'
}

/**
 * 时间格式化 — 会话列表使用
 * 今天 → HH:mm  昨天 → "昨天"  更早 → MM-dd
 */
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ymd  = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const t    = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  if (ymd === t) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (ymd === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return '昨天'
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 时间格式化 — 消息气泡使用
 * 今天 → HH:mm  昨天 → "昨天 HH:mm"  更早 → MM-dd HH:mm
 */
function fmtMsgTime(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const hm   = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const ymd  = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const t    = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  if (ymd === t) return hm
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (ymd === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return `昨天 ${hm}`
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

/** 日期分割线标签 */
function dateLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const t   = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  if (ymd === t) return '今天'
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (ymd === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return '昨天'
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// ============================================================
//  响应式状态
// ============================================================

const sessions     = ref([])        // 会话列表
const activeSessionId   = ref(null) // 当前选中会话 ID
const activeSessionName = ref('')
const activeSessionAvatar = ref('')
const activeOtherUserId  = ref(null)

const messages  = ref([])           // 当前会话消息列表
const curPage   = ref(1)
const hasMore   = ref(true)
const inputText = ref('')
const sending   = ref(false)

const messageListRef = ref(null)
const sessionListRef = ref(null)

const loading = reactive({ sessions: false, messages: false })

/** 当前登录用户头像（从 sessionStorage 读取） */
const myAvatar = computed(() => {
  try { return JSON.parse(sessionStorage.getItem('auth_userInfo') || '{}').avatar || '' }
  catch { return '' }
})

/** WebSocket 重连计数器 */
let wsAttempts = 0

// ============================================================
//  计算属性：插入日期分割线的扁平列表
// ============================================================

const flatMessages = computed(() => {
  const out = []
  let last = ''
  let prevMine = null    // 上一条消息的 isMine，用于判断是否连续同一人
  for (const m of messages.value) {
    const label = dateLabel(m.createTime)
    if (label !== last) {
      out.push({ _type: 'date', _key: `d-${label}`, _label: label })
      last = label
      prevMine = null    // 日期分割线重置连续性
    }
    const isMine = m.isMine === true
    out.push({
      ...m,
      _type: 'msg',
      _key:  m.id || `t-${m.createTime}`,
      _mine: isMine,
      _compact: prevMine !== null && prevMine === isMine,   // 与上条同一人 → 紧凑间距
    })
    prevMine = isMine
  }
  return out
})

// ============================================================
//  API
// ============================================================

/** 获取会话列表 */
async function fetchSessions() {
  loading.sessions = true
  try {
    const r = await http.get('/user/chat/sessions')
    if (r.code === 0 || r.code === 200) sessions.value = r.data || []
    else ElMessage.error(r.message || '加载会话失败')
  } finally { loading.sessions = false }
}

/** 获取消息（分页） */
async function fetchMessages(reset = false) {
  if (loading.messages) return
  if (!reset && !hasMore.value) return

  loading.messages = true
  const page = reset ? 1 : curPage.value + 1

  try {
    const r = await http.get(`/user/chat/messages/${activeSessionId.value}`, {
      params: { page, size: PAGE_SIZE }
    })
    if (r.code !== 0 && r.code !== 200) {
      ElMessage.error(r.message || '加载消息失败')
      return
    }
    const list = r.data || []
    hasMore.value = list.length >= PAGE_SIZE

    if (reset) {
      messages.value = list
      curPage.value = 1
    } else {
      // 向前追加旧消息，保持时间正序
      messages.value = [...list, ...messages.value]
      curPage.value = page
    }
  } finally { loading.messages = false }
}

/** 发送消息 */
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || sending.value || !activeSessionId.value) return

  sending.value = true
  inputText.value = ''

  try {
    const r = await http.post('/user/chat/send', {
      sessionId: activeSessionId.value,
      receiverId: activeOtherUserId.value,
      content: text,
      msgType: '1',
    })
    if (r.code === 0 || r.code === 200) {
      if (r.data) messages.value.push(r.data)
      nextTick(() => scrollBottom())

      // 同步更新左侧列表最后消息
      const hit = sessions.value.find((s) => s.sessionId === activeSessionId.value)
      if (hit) {
        hit.lastMessage = text
        hit.lastTime    = new Date().toISOString()
        const idx = sessions.value.indexOf(hit)
        sessions.value.splice(idx, 1)
        sessions.value.unshift(hit)
      }
    } else {
      ElMessage.error(r.message || '发送失败')
    }
  } finally { sending.value = false }
}

/** 创建或获取会话（供外部调用，例如从商品卡片跳转） */
async function createSession(targetUserId, targetName) {
  try {
    const r = await http.post(`/user/chat/create/${targetUserId}`)
    if (r.code === 0 || r.code === 200) {
      await fetchSessions()
      const sid = r.data?.sessionId
      if (sid) {
        const hit = sessions.value.find((s) => s.sessionId === sid)
        switchSession(
          hit || { sessionId: sid, otherNickname: targetName, otherUserId: targetUserId }
        )
      }
    } else {
      ElMessage.error(r.message || '创建会话失败')
    }
  } catch { /* interceptor */ }
}

/** 供外部直接打开某个已知会话 */
function openSession(sessionId, otherUserId, otherName, otherAvatar) {
  switchSession({ sessionId, otherUserId, otherNickname: otherName, otherAvatar: otherAvatar || '' })
}

// ============================================================
//  会话切换
// ============================================================

function switchSession(item) {
  if (!item?.sessionId) return
  activeSessionId.value   = item.sessionId
  activeSessionName.value = item.otherNickname || '聊天'
  activeSessionAvatar.value = item.otherAvatar || ''
  activeOtherUserId.value  = item.otherUserId

  // 重置消息态
  messages.value = []
  hasMore.value  = true
  curPage.value  = 1

  nextTick(() => fetchMessages(true).then(() => nextTick(() => scrollBottom())))

  // 前端清零未读
  if (item.unreadCount > 0) item.unreadCount = 0
}

// ============================================================
//  滚动逻辑
// ============================================================

function scrollBottom() {
  const el = messageListRef.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 消息流滚动事件 — 上滚加载历史 + 防抖 */
let scrollTimer = null
function onScroll() {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const el = messageListRef.value
    if (!el) return

    // 到达顶部 → 加载历史
    if (el.scrollTop < SCROLL_TOP && hasMore.value && !loading.messages) {
      const oldH = el.scrollHeight
      fetchMessages(false).then(() => {
        if (el) el.scrollTop += el.scrollHeight - oldH   // 保持视口不跳
      })
    }
  }, 80)
}

/** 靠近底部时自动滚底（WS 新消息回调） */
function nearBottomAutoScroll() {
  const el = messageListRef.value
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_NEAR) {
    el.scrollTop = el.scrollHeight
  }
}

// ============================================================
//  输入事件
// ============================================================

function onKeydown(e) {
  if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
  // Ctrl+Enter / Shift+Enter 走默认换行
}

// ============================================================
//  WebSocket
// ============================================================

let ws = null
let wsTimer = null

function connectWs() {
  const token = sessionStorage.getItem('auth_token')
  if (!token) return

  try { ws = new WebSocket(`ws://120.27.216.138/ws/chat?token=${token}`) }
  catch { return scheduleWs() }

  ws.onopen  = () => { wsAttempts = 0 }
  ws.onclose = () => { ws = null; scheduleWs() }
  ws.onerror = () => { ws?.close() }

  ws.onmessage = (evt) => {
    try {
      const pkt = JSON.parse(evt.data)
      if (pkt.type === 'CONNECTED') return
      if (pkt.type === 'NEW_MSG' && pkt.data) onNewMsg(pkt.data)
    } catch { /* drop */ }
  }
}

function scheduleWs() {
  clearTimeout(wsTimer)
  wsAttempts++
  const ms = Math.min(WS_DELAY * 1.5 ** (wsAttempts - 1), 30000)
  wsTimer = setTimeout(connectWs, ms)
}

function disconnectWs() {
  clearTimeout(wsTimer)
  if (ws) { ws.onclose = null; ws.close(); ws = null }
}

/** 处理 WebSocket 新消息 */
function onNewMsg(data) {
  const sid = data.sessionId

  if (sid === activeSessionId.value) {
    // 当前会话 → 追加消息
    messages.value.push(data)
    nextTick(() => nearBottomAutoScroll())
  } else {
    // 非当前会话 → 更新列表
    const hit = sessions.value.find((s) => s.sessionId === sid)
    if (hit) {
      hit.unreadCount = (hit.unreadCount || 0) + 1
      hit.lastMessage = data.content
      hit.lastTime    = data.createTime
      const idx = sessions.value.indexOf(hit)
      sessions.value.splice(idx, 1)
      sessions.value.unshift(hit)
    } else {
      fetchSessions()   // 全新会话，重新拉取
    }
  }
}

// ============================================================
//  生命周期
// ============================================================

onMounted(() => {
  fetchSessions().then(() => {
    // 默认选中第一条
    if (sessions.value.length > 0) switchSession(sessions.value[0])
  })
  connectWs()
})

onUnmounted(() => {
  disconnectWs()
})

defineExpose({ createSession, openSession, fetchSessions })
</script>

<style scoped>
/* ============================================================
   全局容器
   ============================================================ */
.im-container {
  display: flex;
  height: calc(100vh - 60px);   /* 扣除顶部导航 */
  min-height: 500px;
  background: #f7f8fa;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  color: #1f2329;
}

/* ============================================================
   左侧：会话列表
   ============================================================ */
.im-sidebar {
  width: 300px;
  min-width: 300px;
  background: #fff;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #f0f2f5;
}

.sidebar-header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #f0f2f5;
  flex-shrink: 0;
}
.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2329;
}

/* 列表滚动区 */
.session-scroll {
  flex: 1;
  overflow-y: auto;
}

/* 空状态 */
.session-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
}
.empty-icon { width: 48px; height: 48px; }
.empty-icon.large { width: 64px; height: 64px; }
.empty-text { font-size: 13px; color: #909399; }

/* ----- 单条会话 ----- */
.session-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 72px;
  padding: 0 16px;
  cursor: pointer;
  background: #fff;
  border-bottom: 1px solid #f0f2f5;
  transition: background 0.12s;
}
.session-item:hover { background: #f5f7fa; }
.session-item.active { background: #fff0e6; }

/* 激活竖条 */
.active-bar {
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  background: #ff7d00;
  border-radius: 0 2px 2px 0;
}

/* 头像 */
.session-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.session-avatar img {
  width: 100%; height: 100%; object-fit: cover;
}
.avatar-fallback {
  font-size: 16px; color: #909399; font-weight: 500; line-height: 1;
}
.avatar-fallback.sm { font-size: 14px; }
.avatar-fallback.xs { font-size: 12px; }

/* 中间信息 */
.session-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  height: 100%;
}
.session-row-top,
.session-row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.session-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2329;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-time {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
  margin-left: 8px;
}
.session-msg {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.session-badge {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  border-radius: 9px;
  padding: 0 5px;
  margin-left: 6px;
  background: #ff7d00;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

/* ============================================================
   右侧：聊天区
   ============================================================ */
.im-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  min-width: 0;
}

/* 未选中的空状态 */
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 14px;
}

/* ----- 顶部栏 ----- */
.chat-topbar {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #f0f2f5;
  background: #fff;
  flex-shrink: 0;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.topbar-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.topbar-avatar img { width: 100%; height: 100%; object-fit: cover; }
.topbar-name {
  font-size: 15px;
  font-weight: 500;
  color: #1f2329;
}
.topbar-actions {
  display: flex;
  gap: 8px;
}

/* ----- 消息流（浅灰底衬托气泡） ----- */
.message-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  background: #f5f7fa;
}

.msg-loading-hint {
  text-align: center;
  padding: 12px 0;
  font-size: 13px;
  color: #909399;
}
.msg-loading-hint.muted { color: #c0c4cc; }

.msg-empty-hint {
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
  color: #c0c4cc;
}

/* 日期分割线 */
.msg-date-divider {
  text-align: center;
  margin: 16px 0;
  font-size: 12px;
  color: #c0c4cc;
  position: relative;
}
.msg-date-divider span {
  background: #f5f7fa;
  padding: 0 12px;
  position: relative;
  z-index: 1;
}
.msg-date-divider::after {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 50%;
  height: 1px;
  background: #e0e4e8;
}

/* ----- 单条消息 ----- */
.msg-item {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 18px;
  max-width: 60%;
}
.msg-item.compact {
  margin-bottom: 8px;
}
.msg-item.right {
  margin-left: auto;
  flex-direction: row-reverse;
}
.msg-item.left {
  margin-right: auto;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.msg-avatar img { width: 100%; height: 100%; object-fit: cover; }

.msg-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.msg-item.right .msg-body { align-items: flex-end; }
.msg-item.left  .msg-body { align-items: flex-start; }

.msg-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}
.msg-item.right .msg-bubble {
  background: #ff7d00;
  color: #fff;
  border-top-right-radius: 4px;
  box-shadow: 0 2px 12px rgba(255, 125, 0, 0.25);
}
.msg-item.left .msg-bubble {
  background: #fff;
  color: #1f2329;
  border-top-left-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.msg-time {
  font-size: 12px;
  color: #b0b4ba;
  padding: 0 2px;
  line-height: 1;
}
.msg-time.tr { text-align: right; }
.msg-time.tl { text-align: left; }

/* ----- 底部输入栏 ----- */
.chat-input-area {
  border-top: 1px solid #f0f2f5;
  background: #fff;
  padding: 0 20px 16px;
  flex-shrink: 0;
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 0 4px;
}
.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
}
.toolbar-btn:hover { background: #f5f7fa; }

.chat-input-area :deep(.el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0;
  padding: 4px 0;
  font-size: 14px;
  resize: none;
  line-height: 1.5;
}
.chat-input-area :deep(.el-textarea__inner:focus) {
  box-shadow: none !important;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.input-actions .el-button--primary {
  background: #ff7d00;
  border-color: #ff7d00;
  border-radius: 6px;
  padding: 8px 24px;
  font-size: 14px;
}
.input-actions .el-button--primary:hover {
  opacity: 0.85;
}
.input-actions .el-button--primary.is-disabled {
  background: #ffd6a5;
  border-color: #ffd6a5;
}

/* ============================================================
   滚动条
   ============================================================ */
.session-scroll::-webkit-scrollbar,
.message-scroll::-webkit-scrollbar {
  width: 4px;
}
.session-scroll::-webkit-scrollbar-thumb,
.message-scroll::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 2px;
}
</style>
