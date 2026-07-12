<template>
  <div class="sw-page">
    <!-- ===== 顶部工具栏 ===== -->
    <div class="sw-toolbar">
      <div class="sw-toolbar-left">
        <h2 class="sw-title">敏感词库管理</h2>
      </div>
      <div class="sw-toolbar-right">
        <span class="sw-count">共 {{ words.length }} 个词</span>
        <el-button :loading="reloading" size="default" @click="handleReload">从文件重载</el-button>
      </div>
    </div>

    <!-- ===== 添加栏 ===== -->
    <div class="sw-add-bar">
      <el-input
        v-model="inputWord"
        placeholder="输入新敏感词..."
        maxlength="50"
        :disabled="adding"
        clearable
        @keyup.enter="handleAdd"
      />
      <el-button type="primary" :loading="adding" @click="handleAdd">添加</el-button>
    </div>

    <!-- ===== 敏感词表格 ===== -->
    <div class="sw-table-wrap">
      <el-table
        :data="words"
        stripe
        style="width: 100%"
        highlight-current-row
        header-row-class-name="sw-table-header"
        v-loading="loading"
        element-loading-text="加载中..."
      >
        <el-table-column label="序号" type="index" width="70" :index="rowIndex" />
        <el-table-column label="敏感词" prop="word" min-width="200" />
        <el-table-column label="操作" width="120">
          <template #default="scope">
            <el-button
              size="small"
              plain
              type="danger"
              :loading="deletingId === scope.$index"
              @click="handleDelete(scope.$index, scope.row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- ===== 删除确认弹窗 ===== -->
    <el-dialog
      v-model="deleteDialogVisible"
      title="确认删除"
      width="380px"
      :close-on-click-modal="false"
      align-center
    >
      <span>确定要删除该敏感词吗？</span>
      <template #footer>
        <el-button @click="deleteDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="deleting" @click="confirmDelete">确定删除</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

// ===== 状态 =====
const words = ref<string[]>([])
const inputWord = ref('')
const loading = ref(false)
const adding = ref(false)
const reloading = ref(false)
const deleting = ref(false)
const deletingId = ref<number | null>(null)
const deleteDialogVisible = ref(false)
let deletingWord = ''

// ===== API 基础路径 =====
const API_BASE = import.meta.env.VITE_API_BASE || 'http://120.27.216.138'

// ===== 工具 =====
function getToken(): string | null {
  const key = Object.keys(sessionStorage).find(k => k.endsWith('_token'))
  return key ? sessionStorage.getItem(key) : null
}

function rowIndex(index: number): number {
  return index + 1
}

// ===== 请求封装 =====
async function request(url: string, options: { method?: string; body?: any } = {}) {
  const config: any = {
    method: options.method || 'GET',
    url: `${API_BASE}${url}`,
    headers: { 'Content-Type': 'application/json' },
  }
  const token = getToken()
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  if (options.body) config.data = options.body
  const res = await axios(config)
  return res.data
}

// ===== 获取所有敏感词 =====
async function loadWords() {
  loading.value = true
  try {
    const res = await request('/admin/sensitive-getwords')
    if (res && (res.code === 0 || res.code === 200)) {
      words.value = res.data || []
    } else {
      ElMessage.error(res?.message || '加载失败')
    }
  } catch {
    ElMessage.error('加载失败，请检查网络')
  } finally {
    loading.value = false
  }
}

// ===== 添加敏感词 =====
async function handleAdd() {
  const word = inputWord.value.trim()
  if (!word) {
    ElMessage.warning('请输入敏感词')
    return
  }
  adding.value = true
  try {
    const res = await request('/admin/sensitive-addwords', {
      method: 'POST',
      body: { word },
    })
    if (res && (res.code === 0 || res.code === 200)) {
      ElMessage.success('添加成功')
      inputWord.value = ''
      await loadWords()
    } else {
      ElMessage.error(res?.message || '添加失败')
    }
  } catch {
    ElMessage.error('添加失败')
  } finally {
    adding.value = false
  }
}

// ===== 删除敏感词 =====
function handleDelete(index: number, row: string) {
  deletingWord = row
  deletingId.value = index
  deleteDialogVisible.value = true
}

async function confirmDelete() {
  deleting.value = true
  try {
    const res = await request(`/admin/sensitive-removewords/${encodeURIComponent(deletingWord)}`, {
      method: 'DELETE',
    })
    if (res && (res.code === 0 || res.code === 200)) {
      ElMessage.success('删除成功')
      deleteDialogVisible.value = false
      await loadWords()
    } else {
      ElMessage.error(res?.message || '删除失败')
    }
  } catch {
    ElMessage.error('删除失败')
  } finally {
    deleting.value = false
    deletingId.value = null
  }
}

// ===== 从文件重载 =====
async function handleReload() {
  reloading.value = true
  try {
    const res = await request('/admin/sensitive-reloadwords/reload', { method: 'POST' })
    if (res && (res.code === 0 || res.code === 200)) {
      ElMessage.success('敏感词库已重新加载')
      await loadWords()
    } else {
      ElMessage.error(res?.message || '重载失败')
    }
  } catch {
    ElMessage.error('重载失败')
  } finally {
    reloading.value = false
  }
}

// ===== 初始化 =====
onMounted(() => {
  loadWords()
})
</script>

<style scoped>
.sw-page {
  padding: 24px;
  max-width: 800px;
}

/* ===== 顶部工具栏 ===== */
.sw-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.sw-toolbar-left {
  display: flex;
  align-items: center;
}

.sw-title {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.sw-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sw-count {
  font-size: 13px;
  color: #64748b;
}

/* ===== 添加栏 ===== */
.sw-add-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.sw-add-bar .el-input {
  flex: 1;
}

/* ===== 表格 ===== */
.sw-table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

:deep(.sw-table-header th) {
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
  font-size: 13px;
}

:deep(.el-table__body tr:hover td) {
  background: #f8fafc;
}
</style>
