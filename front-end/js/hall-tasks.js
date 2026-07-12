// 任务大厅页面逻辑
let currentTaskFilter = 'all';
let currentTaskSort = 'time';

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadTasks();
    loadUserBalance();
});

// 加载用户余额
function loadUserBalance() {
    const balance = localStorage.getItem('balance') || '0.00';
    document.getElementById('publishBalance').textContent = '¥' + balance;
}

// 加载任务列表
async function loadTasks() {
    const listEl = document.getElementById('fullTaskList');
    listEl.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    
    try {
        const token = getCurrentToken();
        if (!token) {
            showToast('请先登录', 'error');
            return;
        }
        
        const response = await fetch(API_BASE_URL + '/tasks', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderTasks(data.tasks || []);
        } else {
            renderTasks([]);
        }
    } catch (error) {
        console.error('加载任务失败:', error);
        renderTasks([]);
    }
}

// 渲染任务列表
function renderTasks(tasks) {
    const listEl = document.getElementById('fullTaskList');
    
    if (!tasks || tasks.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <div class="empty-text">暂无任务</div>
            </div>
        `;
        return;
    }
    
    // 过滤任务
    let filteredTasks = tasks;
    if (currentTaskFilter !== 'all') {
        filteredTasks = tasks.filter(task => task.status === currentTaskFilter);
    }
    
    // 排序
    if (currentTaskSort === 'price') {
        filteredTasks.sort((a, b) => (b.reward || 0) - (a.reward || 0));
    } else {
        filteredTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    if (filteredTasks.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <div class="empty-text">暂无相关任务</div>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = filteredTasks.map(task => `
        <div class="task-card" onclick="showTaskDetail(${task.id})">
            <div class="task-card-header">
                <span class="task-title">${escapeHtml(task.description || '任务详情')}</span>
                <span class="task-status ${task.status}">${getStatusText(task.status)}</span>
            </div>
            <div class="task-meta">
                <span class="task-reward">${task.reward || 0}</span>
                <span class="task-time">${formatTime(task.deadline)}</span>
            </div>
        </div>
    `).join('');
}

// 过滤任务
function filterTasks(filter) {
    currentTaskFilter = filter;
    
    // 更新标签样式
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    loadTasks();
}

// 显示发布任务弹窗
function showTaskPublish() {
    loadUserBalance();
    openModal('taskPublishModal');
}

// 提交任务
async function submitTask() {
    const desc = document.getElementById('taskDesc').value.trim();
    const reward = document.getElementById('taskReward').value;
    const deadline = document.getElementById('taskDeadline').value;
    const contact = document.getElementById('taskContact').value.trim();
    
    if (!desc) {
        showToast('请输入任务描述', 'error');
        return;
    }
    
    if (!reward || parseFloat(reward) <= 0) {
        showToast('请输入有效的报酬金额', 'error');
        return;
    }
    
    try {
        const token = getCurrentToken();
        const response = await fetch(API_BASE_URL + '/tasks', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ description: desc, reward: parseFloat(reward), deadline, contact })
        });
        
        if (response.ok) {
            showToast('发布成功', 'success');
            closeModal('taskPublishModal');
            document.getElementById('taskDesc').value = '';
            document.getElementById('taskReward').value = '';
            document.getElementById('taskDeadline').value = '';
            document.getElementById('taskContact').value = '';
            loadTasks();
        } else {
            const data = await response.json();
            showToast(data.message || '发布失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

// 显示任务详情
async function showTaskDetail(taskId) {
    try {
        const token = getCurrentToken();
        const response = await fetch(API_BASE_URL + '/tasks/' + taskId, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            const task = await response.json();
            const body = document.getElementById('taskDetailBody');
            
            body.innerHTML = `
                <div class="task-detail">
                    <div class="detail-header">
                        <span class="task-status ${task.status}">${getStatusText(task.status)}</span>
                        <span class="detail-time">截止: ${formatTime(task.deadline)}</span>
                    </div>
                    <div class="detail-desc">${escapeHtml(task.description || '')}</div>
                    <div class="detail-reward">¥${task.reward || 0}</div>
                    ${task.contact ? `<div class="detail-contact">联系方式: ${escapeHtml(task.contact)}</div>` : ''}
                    ${task.status === 'pending' ? `
                        <button class="btn-primary" onclick="acceptTask(${task.id})">接取任务</button>
                    ` : ''}
                </div>
            `;
            
            openModal('taskDetailModal');
        }
    } catch (error) {
        showToast('加载失败', 'error');
    }
}

// 接取任务
async function acceptTask(taskId) {
    try {
        const token = getCurrentToken();
        const response = await fetch(API_BASE_URL + '/tasks/' + taskId + '/accept', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            showToast('接取成功', 'success');
            closeModal('taskDetailModal');
            loadTasks();
        } else {
            showToast('接取失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

// 辅助函数
function getStatusText(status) {
    const map = {
        'pending': '待接单',
        'ongoing': '进行中',
        'completed': '已完成'
    };
    return map[status] || status;
}

function formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.querySelector('.toast-message').textContent = message;
    toast.className = 'toast show ' + type;
    
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.querySelector('.toast-icon').textContent = icons[type] || '';
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
