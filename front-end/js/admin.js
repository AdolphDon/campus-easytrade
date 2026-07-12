/* API_BASE_URL 由 api.js 提供 */

let currentUser = null;
let currentTab = 'dashboard';
let taskFilter = 'all';
let selectedUserId = null;
let selectedProductId = null;
let selectedCreditUserId = null;

// 用户列表分页相关变量
let userCurrentPage = 1;
let userPageSize = 10;

// 管理员列表分页相关变量
let adminCurrentPage = 1;
let adminPageSize = 10;

// 账号状态检测定时器（已废弃，改用 WebSocket）
// let accountStatusTimer = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initPage();
});

function checkAuth() {
    // 管理员页面使用 admin_token 和 admin_userInfo
    const token = getCurrentToken();
    const userInfo = getCurrentUserInfo();

    if (!token || !userInfo) {
        window.location.href = 'login.html';
        return;
    }

    try {
        currentUser = JSON.parse(userInfo);
        if (currentUser.role !== 0 && currentUser.role !== '0') {
            showToast('无权限访问管理端', 'error');
            setTimeout(() => {
                window.location.href = 'user.html';
            }, 1500);
        }
    } catch (e) {
        window.location.href = 'login.html';
    }
}

function initPage() {
    const name = currentUser?.nickname || currentUser?.username || '管理员';
    document.getElementById('adminNameTop').textContent = name;
    document.getElementById('adminAvatarText').textContent = name.charAt(0).toUpperCase();
    
    // 清空搜索框（防止刷新后残留搜索关键词）- 使用多重防护
    const searchInput = document.getElementById('userSearchInput');
    if (searchInput) {
        // 立即清空
        searchInput.value = '';
        // 延迟清空（防止浏览器自动填充覆盖）
        setTimeout(() => {
            searchInput.value = '';
            searchInput.removeAttribute('readonly');
        }, 100);
        // 再次延迟清空（确保万无一失）
        setTimeout(() => {
            if (searchInput.value) {
                searchInput.value = '';
            }
        }, 500);
    }
    
    // 启动 WebSocket 连接（替代定时轮询）
    initWebSocket();
    
    // 注册页面可见性变化监听（用于自动刷新数据）
    initVisibilityHandler();

    // 从 URL hash 恢复当前 tab（刷新后保持当前页面）
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['dashboard', 'users', 'tasks', 'products', 'productsReview', 'productsCategory', 'productsSearch', 'campusNews', 'newsCategory', 'platformNews', 'admins', 'sensitiveWords', 'knowledge', 'feedbacks'];
    if (hash && validTabs.includes(hash)) {
        switchTab(hash);
    } else {
        loadDashboardData();
    }
}

/**
 * 初始化页面可见性监听
 * 当用户从其他标签页切回管理页面时，自动刷新当前列表数据
 * 解决问题：后端清除Redis缓存后，前端显示的数据可能已过期
 */
let lastVisibilityTime = Date.now();  // 记录上次页面可见时间
const VISIBILITY_REFRESH_INTERVAL = 5000;  // 页面不可见超过5秒后才刷新（避免频繁刷新）

function initVisibilityHandler() {
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            const now = Date.now();
            const hiddenDuration = now - lastVisibilityTime;
            
            console.log(`👁️ 页面重新可见，隐藏时长: ${Math.round(hiddenDuration / 1000)}秒`);
            
            // 只有当页面隐藏超过一定时间才自动刷新
            // 避免快速切换标签页导致的频繁请求
            if (hiddenDuration > VISIBILITY_REFRESH_INTERVAL) {
                console.log('🔄 页面隐藏时间较长，自动刷新当前列表...');
                refreshCurrentList();
                
                // 显示提示信息（可选，避免打扰用户可以注释掉）
                // showToast('数据已自动更新', 'info');
            } else {
                console.log('⏭️ 页面隐藏时间较短，跳过自动刷新');
            }
        } else {
            // 记录页面变为不可见的时间
            lastVisibilityTime = Date.now();
            console.log('🙈 页面变为不可见');
        }
    });
}

async function loadDashboardData() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/users/dashboard/stats`, { headers: getAuthHeaders() });
        const result = await response.json();

        if (isApiOk(result) && result.data) {
            const stats = result.data;
            document.getElementById('totalUsers').textContent = stats.totalUsers ?? '--';
            document.getElementById('userTrend').textContent = `今日+${stats.newUsersToday ?? 0}`;
            document.getElementById('totalAdmins').textContent = stats.totalAdmins ?? '--';
            document.getElementById('totalProducts').textContent = stats.totalProducts ?? '--';
            document.getElementById('pendingProducts').textContent = stats.pendingReviews ?? 0;
            document.getElementById('pendingAppeals').textContent = stats.pendingAppeals ?? 0;
        }

        // 知识文档统计（获取列表后取长度）
        try {
            const docRes = await fetch(`${API_BASE_URL}/admin/knowledge/list`, { headers: getAuthHeaders() });
            const docData = await docRes.json();
            if (isApiOk(docData) && Array.isArray(docData.data)) {
                document.getElementById('totalDocs').textContent = docData.data.length;
            }
        } catch (e) { /* ignore */ }

        // 敏感词数量
        try {
            const swRes = await fetch(`${API_BASE_URL}/admin/users/sensitive-getwords`, { headers: getAuthHeaders() });
            const swData = await swRes.json();
            if (isApiOk(swData) && Array.isArray(swData.data)) {
                document.getElementById('totalSwCount').textContent = swData.data.length;
            }
        } catch (e) { /* ignore */ }

    } catch (error) {
        console.error('Failed to load dashboard data');
    }
}

const tabTitles = {
    dashboard: '工作台',
    users: '用户管理',
    tasks: '任务管理',
    products: '商品管理',
    productsReview: '商品审核',
    productsCategory: '商品分类',
    productsSearch: '商品速查',
    campusNews: '校园资讯',
    newsCategory: '资讯分类',
    platformNews: '平台动态',
    admins: '管理员管理',
    sensitiveWords: '敏感词管理',
    knowledge: 'AI知识库管理',
    feedbacks: '用户意见反馈'
};

function toggleProductSubMenu() {
    const submenu = document.getElementById('productSubMenu');
    const arrow = document.querySelector('.nav-parent[data-parent="products"] .nav-arrow');
    if (submenu) submenu.classList.toggle('open');
    if (arrow) arrow.classList.toggle('open');
}

function toggleCampusNewsSubMenu() {
    const submenu = document.getElementById('campusNewsSubMenu');
    const arrow = document.querySelector('.nav-parent[data-parent="campusNews"] .nav-arrow');
    if (submenu) submenu.classList.toggle('open');
    if (arrow) arrow.classList.toggle('open');
}

function switchTab(tab) {
    currentTab = tab;
    
    // 保存当前 tab 到 URL hash（刷新后可恢复）
    window.location.hash = tab;
    
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tab}Tab`).classList.add('active');

    document.querySelectorAll('.nav-item, .nav-sub-item').forEach(el => el.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    const subItem = document.querySelector(`.nav-sub-item[data-tab="${tab}"]`);
    if (navItem) navItem.classList.add('active');
    if (subItem) subItem.classList.add('active');

    // 高亮父级导航（商品管理、校园公告管理）
    document.querySelectorAll('.nav-parent').forEach(el => el.classList.remove('active'));
    let parentPrefix = '';
    if (tab.startsWith('products')) parentPrefix = 'products';
    else if (tab.startsWith('campusNews') || tab === 'newsCategory' || tab === 'platformNews') parentPrefix = 'campusNews';
    if (parentPrefix) {
        const parentItem = document.querySelector(`.nav-parent[data-parent="${parentPrefix}"]`);
        if (parentItem) parentItem.classList.add('active');
        // 自动展开对应子菜单
        const submenuId = parentPrefix === 'products' ? 'productSubMenu' : 'campusNewsSubMenu';
        const submenu = document.getElementById(submenuId);
        if (submenu && !submenu.classList.contains('open')) {
            submenu.classList.add('open');
            const arrow = parentItem.querySelector('.nav-arrow');
            if (arrow) arrow.classList.add('open');
        }
    }

    document.getElementById('pageTitle').textContent = tabTitles[tab] || tab;

    if (tab === 'users') loadUsers();
    else if (tab === 'tasks') loadTasks();
    else if (tab === 'productsReview') { Promise.all([loadManualReviewProducts(), loadAppealReviewProducts()]); }
    else if (tab === 'productsCategory') { Promise.all([loadCategories(), loadDisCategories()]); }
    else if (tab === 'productsSearch') initProductSearch();
    else if (tab === 'campusNews') loadCampusNews();
    else if (tab === 'newsCategory') { Promise.all([loadNewsCategories(), loadNewsDisCategories()]); }
    else if (tab === 'platformNews') loadPlatformNews();
    else if (tab === 'admins') loadAdmins();
    else if (tab === 'sensitiveWords') loadSensitiveWords();
    else if (tab === 'knowledge') loadKnowledgeDocuments();
    else if (tab === 'feedbacks') { loadFeedbacks(true); initFeedbackScroll(); }
}

async function loadUsers(page = 1) {
    const container = document.getElementById('usersTable');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    userCurrentPage = page;

    try {
        const accountStatus = document.getElementById('accountStatusFilter')?.value || '';
        const isDelete = document.getElementById('isDeleteFilter')?.value || '';
        const keyword = document.getElementById('userSearchInput')?.value?.trim() || '';

        // 🔍 调试日志：打印请求参数
        console.log('=== 用户列表请求参数 ===');
        console.log('page:', page);
        console.log('size:', userPageSize);
        console.log('accountStatus:', accountStatus, '(空=全部)');
        console.log('isDelete:', isDelete, '(空=全部)');
        console.log('keyword:', `"${keyword}"`, '(空=不搜索)');

        // 使用旧接口参数名
        const params = { page: userCurrentPage, size: userPageSize };
        if (accountStatus !== '') params.status = parseInt(accountStatus);
        if (isDelete !== '') params.isDelete = parseInt(isDelete);
        if (keyword) params.keyword = keyword;

        let result;
        try {
            result = await API.admin.getUserList(params);
            console.log('✅ 使用新接口 /admin/users/user/list');
        } catch (e1) {
            console.log('⚠️ 新接口失败，使用旧接口路径');
            result = await API.admin.getUsers(params);
            console.log('✅ 使用旧接口 /admin/users/list');
        }

        // 🔍 调试日志：打印接口返回结果
        console.log('--- 接口返回 ---');
        console.log('完整result:', result);
        console.log('result.code:', result?.code);
        console.log('result.data:', result?.data);

        if (isApiOk(result) && result.data) {
            const data = result.data;
            
            // 🔍 调试日志：解析数据结构
            console.log('--- 数据结构分析 ---');
            console.log('data 类型:', typeof data);
            console.log('是否数组:', Array.isArray(data));
            
            if (Array.isArray(data)) {
                console.log('✅ 数据是数组，长度:', data.length);
            } else if (data.records) {
                console.log('✅ MyBatis-Plus格式: records.length=', data.records?.length, 'total=', data.total);
            } else if (data.list) {
                console.log('✅ 通用分页格式: list.length=', data.list?.length, 'total=', data.total);
            }
            
            let users = [];
            let total = 0;
            let pages = 1;

            if (Array.isArray(data)) {
                users = data;
                total = data.length;
            } else if (data.records) {
                users = data.records || [];
                total = data.total || 0;
                pages = data.pages || 1;
            } else if (data.list) {
                users = data.list || [];
                total = data.total || users.length;
                pages = Math.ceil(total / userPageSize);
            } else if (typeof data === 'object' && !Array.isArray(data)) {
                users = Array.isArray(data.content) ? data.content : (Array.isArray(data.items) ? data.items : []);
                total = data.totalElements || data.total || users.length;
                pages = data.totalPages || Math.ceil(total / userPageSize);
            }
            
            console.log('最终解析:');
            console.log('- users 数量:', users.length);
            console.log('- total 总数:', total);
            console.log('- pages 页数:', pages);

            if (users.length === 0) {
                container.innerHTML = `<div class="empty-state-new"><span class="empty-icon">👥</span><p class="empty-text">${keyword ? '未找到匹配的用户' : '暂无用户'}</p></div>`;
                document.getElementById('userPagination').innerHTML = '';
                return;
            }

            container.innerHTML = renderUserTable(users);

            if (total > userPageSize) {
                renderPagination('userPagination', userCurrentPage, pages, total, 'loadUsers');
            } else {
                document.getElementById('userPagination').innerHTML = '';
            }
        } else {
            container.innerHTML = `<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败：${result.message || '未知错误'}</p></div>`;
            document.getElementById('userPagination').innerHTML = '';
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
        container.innerHTML = `<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败，请检查网络连接</p></div>`;
        document.getElementById('userPagination').innerHTML = '';
    }
}

// 防抖搜索（实时查询）
let searchTimer = null;
function debounceSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        loadUsers(1);
    }, 400);
}

// 重置筛选条件
function resetUserFilters() {
    document.getElementById('accountStatusFilter').value = '';
    document.getElementById('isDeleteFilter').value = '';
    document.getElementById('userSearchInput').value = '';
    loadUsers(1);
}

// 管理员防抖搜索（实时查询）
let adminSearchTimer = null;
function debounceAdminSearch() {
    if (adminSearchTimer) clearTimeout(adminSearchTimer);
    adminSearchTimer = setTimeout(() => {
        loadAdmins(1);
    }, 400);
}

// 重置管理员筛选条件
function resetAdminFilters() {
    document.getElementById('adminAccountStatusFilter').value = '';
    document.getElementById('adminIsDeleteFilter').value = '';
    document.getElementById('adminSearchInput').value = '';
    loadAdmins(1);
}

// 渲染用户列表（极简表格风格 - 基于新VO）
function renderUserTable(users) {
    return `
        <table class="simple-table">
            <thead>
                <tr>
                    <th class="col-name">用户姓名</th>
                    <th class="col-username">账号</th>
                    <th class="col-phone">手机号</th>
                    <th class="col-email">邮箱</th>
                    <th class="col-status">账号状态</th>
                    <th class="col-credit">信誉分</th>
                    <th class="col-time">最后操作时间</th>
                    <th class="col-action">操作</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr class="user-row">
                        <td class="col-name">
                            <div class="name-cell">
                                ${user.avatar ? `<img src="${escapeHtml(user.avatar)}" class="avatar-img" alt="">` : ''}
                                <span>${escapeHtml(user.nickname || user.username || '-')}</span>
                            </div>
                        </td>
                        <td class="col-username">${escapeHtml(user.username || '-')}</td>
                        <td class="col-phone">${escapeHtml(user.phone || '-')}</td>
                        <td class="col-email" title="${escapeHtml(user.email || '-')}">${escapeHtml(user.email || '-')}</td>
                        <td class="col-status">
                            ${getStatusLabel(user.status, user.isDelete)}
                        </td>
                        <td class="col-credit">${user.creditScore ?? '-'}</td>
                        <td class="col-time">${formatTimeAgo(user.updateTime)}</td>
                        <td class="col-action action-row">
                            ${renderActionButtons(user)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// 渲染管理员列表（极简表格风格 - 和用户管理一致）
function renderAdminTable(admins) {
    return `
        <table class="simple-table">
            <thead>
                <tr>
                    <th class="col-name">管理员姓名</th>
                    <th class="col-username">账号</th>
                    <th class="col-phone">手机号</th>
                    <th class="col-email">邮箱</th>
                    <th class="col-status">账号状态</th>
                    <th class="col-credit">信誉分</th>
                    <th class="col-time">最后操作时间</th>
                    <th class="col-action">操作</th>
                </tr>
            </thead>
            <tbody>
                ${admins.map(admin => `
                    <tr class="user-row">
                        <td class="col-name">
                            <div class="name-cell">
                                ${admin.avatar ? `<img src="${escapeHtml(admin.avatar)}" class="avatar-img" alt="">` : ''}
                                <span>${escapeHtml(admin.nickname || admin.username || '-')}</span>
                            </div>
                        </td>
                        <td class="col-username">${escapeHtml(admin.username || '-')}</td>
                        <td class="col-phone">${escapeHtml(admin.phone || '-')}</td>
                        <td class="col-email" title="${escapeHtml(admin.email || '-')}">${escapeHtml(admin.email || '-')}</td>
                        <td class="col-status">
                            ${getStatusLabel(admin.status, admin.isDelete)}
                        </td>
                        <td class="col-credit">${admin.creditScore ?? '-'}</td>
                        <td class="col-time">${formatTimeAgo(admin.updateTime)}</td>
                        <td class="col-action action-row">
                            ${renderAdminActionButtons(admin)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// 渲染管理员操作按钮（根据状态显示不同按钮）
function renderAdminActionButtons(admin) {
    // 已注销用户 → 恢复 + 调分
    if (admin.isDelete == 1 || admin.isDelete === 1) {
        return `
            <button class="btn-link restore-btn" onclick="restoreUser(${admin.id})">恢复</button>
            <button class="btn-link edit-btn" onclick="showAdjustCreditModal(${admin.id})">调分</button>
        `;
    }

    // 未注销 + 启用 → 禁用 + 调分 + 删除
    if (admin.status == 1 || admin.status === 1) {
        return `
            <button class="btn-link disable-btn" onclick="showBanUserModal(${admin.id})">禁用</button>
            <button class="btn-link edit-btn" onclick="showAdjustCreditModal(${admin.id})">调分</button>
            <button class="btn-link delete-btn" onclick="deleteAdmin(${admin.id})">删除</button>
        `;
    }

    // 未注销 + 禁用 → 启用 + 调分 + 删除
    return `
        <button class="btn-link enable-btn" onclick="enableUserDirect(${admin.id})">启用</button>
        <button class="btn-link edit-btn" onclick="showAdjustCreditModal(${admin.id})">调分</button>
        <button class="btn-link delete-btn" onclick="deleteAdmin(${admin.id})">删除</button>
    `;
}

// 删除管理员（调用 /admin/users/admin/delete/{userId} 接口）
async function deleteAdmin(id) {
    if (!confirm('确定要删除该管理员吗？此操作不可恢复！')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/users/admin/delete/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });

        const result = await response.json();
        if (isApiOk(result)) {
            showToast('删除成功', 'success');
            loadAdmins(adminCurrentPage);
        } else {
            showToast(result.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除管理员失败:', error);
        showToast('删除失败，请重试', 'error');
    }
}

// 获取状态文字（去掉绿点）
function getStatusLabel(status, isDelete) {
    // 已注销
    if (isDelete == 1 || isDelete === 1) {
        return '<span class="status-text logout-status">已注销</span>';
    }
    
    // 未注销 + 启用
    if (status == 1 || status === 1) {
        return '<span class="status-text active-status">启用</span>';
    }
    
    // 未注销 + 禁用
    return '<span class="status-text disabled-status">禁用</span>';
}

// 格式化时间为年月日时分秒（如：2026-04-22 22:13:22）
function formatTimeAgo(timeStr) {
    if (!timeStr) return '-';
    
    try {
        const time = new Date(timeStr);
        
        const year = time.getFullYear();
        const month = String(time.getMonth() + 1).padStart(2, '0');
        const day = String(time.getDate()).padStart(2, '0');
        const hours = String(time.getHours()).padStart(2, '0');
        const minutes = String(time.getMinutes()).padStart(2, '0');
        const seconds = String(time.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        return timeStr;
    }
}

// 渲染操作按钮（根据状态显示不同按钮，一行排列）
function renderActionButtons(user) {
    // 已注销用户 → 恢复 + 调分
    if (user.isDelete == 1 || user.isDelete === 1) {
        return `
            <button class="btn-link restore-btn" onclick="restoreUser(${user.id})">恢复</button>
            <button class="btn-link edit-btn" onclick="showAdjustCreditModal(${user.id})">调分</button>
        `;
    }

    // 未注销 + 启用 → 禁用 + 调分
    if (user.status == 1 || user.status === 1) {
        return `
            <button class="btn-link disable-btn" onclick="showBanUserModal(${user.id})">禁用</button>
            <button class="btn-link edit-btn" onclick="showAdjustCreditModal(${user.id})">调分</button>
        `;
    }

    // 未注销 + 禁用 → 启用 + 调分
    return `
        <button class="btn-link enable-btn" onclick="enableUserDirect(${user.id})">启用</button>
        <button class="btn-link edit-btn" onclick="showAdjustCreditModal(${user.id})">调分</button>
    `;
}

// 恢复已注销用户（调用 /admin/users/restore 接口）
async function restoreUser(id) {
    if (!confirm('确定要恢复该用户的账号吗？')) return;

    try {
        const result = await API.admin.restoreUser(id);
        if (isApiOk(result)) {
            showToast('恢复成功', 'success');
            // 根据当前页面刷新对应的列表
            if (currentTab === 'admins') {
                loadAdmins(adminCurrentPage);
            } else {
                loadUsers(userCurrentPage);
            }
        } else {
            showToast(result.message || '恢复失败', 'error');
        }
    } catch (error) {
        console.error('恢复用户失败:', error);
        showToast('恢复失败，请重试', 'error');
    }
}

// 直接启用用户（无需弹窗，调用 /admin/users/enable 接口）
async function enableUserDirect(id) {
    try {
        const result = await API.admin.enableUserDirect(id);
        if (isApiOk(result)) {
            showToast('启用成功', 'success');
            // 根据当前页面刷新对应的列表
            if (currentTab === 'admins') {
                loadAdmins(adminCurrentPage);
            } else {
                loadUsers(userCurrentPage);
            }
        } else {
            showToast(result.message || '启用失败', 'error');
        }
    } catch (error) {
        console.error('启用用户失败:', error);
        showToast('启用失败，请重试', 'error');
    }
}

// 获取头像样式
function getAvatarStyle(user) {
    if (user.avatar) {
        return `background-image: url(${user.avatar}); background-size: cover;`;
    }
    return `background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);`;
}

// 渲染分页器
function renderPagination(containerId, currentPage, totalPages, totalItems, pageFunctionName) {
    const container = document.getElementById(containerId);
    if (!container || totalPages <= 1) return;

    let html = '<div class="pagination">';
    
    // 总计信息
    html += `<span class="pagination-info">共 ${totalItems} 条记录</span>`;
    
    // 上一页按钮
    html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="${pageFunctionName}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>`;

    // 页码按钮
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        html += `<button class="page-btn" onclick="${pageFunctionName}(1)">1</button>`;
        if (startPage > 2) {
            html += `<span class="page-dots">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${pageFunctionName}(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span class="page-dots">...</span>`;
        }
        html += `<button class="page-btn" onclick="${pageFunctionName}(${totalPages})">${totalPages}</button>`;
    }

    // 下一页按钮
    html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="${pageFunctionName}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`;

    html += '</div>';
    container.innerHTML = html;
}

async function loadAdmins(page = 1) {
    const container = document.getElementById('adminsTable');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    adminCurrentPage = page;

    try {
        const accountStatus = document.getElementById('adminAccountStatusFilter')?.value || '';
        const isDelete = document.getElementById('adminIsDeleteFilter')?.value || '';
        const keyword = document.getElementById('adminSearchInput')?.value?.trim() || '';

        // 使用管理员专用接口：/admin/users/admin/list
        // 后端控制层已设置 role=0，前端只需传筛选参数（和用户管理接口完全一致）
        const params = { 
            page: adminCurrentPage,  // 对应后端 pageNum
            size: adminPageSize      // 对应后端 pageSize
        };
        
        if (accountStatus !== '') params.status = parseInt(accountStatus);
        if (isDelete !== '') params.isDelete = parseInt(isDelete);
        if (keyword) params.keyword = keyword;

        // 调用管理员列表接口
        let result;
        
        try {
            // 方案1：尝试通过 API 对象调用（如果 api.js 中有定义）
            result = await API.admin.getAdminList(params);
            console.log('✅ 通过 API 对象调用 /admin/users/admin/list');
        } catch (e1) {
            console.log('⚠️ API 对象未定义，直接 fetch 调用');
            
            // 方案2：直接 fetch 调用（确保路径正确）
            const response = await fetch(`${API_BASE_URL}/admin/users/admin/list?page=${params.page}&size=${params.size}${params.status ? '&status=' + params.status : ''}${params.isDelete ? '&isDelete=' + params.isDelete : ''}${keyword ? '&keyword=' + encodeURIComponent(keyword) : ''}`, {
                headers: getAuthHeaders()
            });
            result = await response.json();
            console.log('✅ 直接调用 /admin/users/admin/list');
        }

        // 🔍 调试日志：打印接口返回结果
        console.log('--- 管理员列表接口返回 ---');
        console.log('请求参数:', params);
        console.log('完整result:', result);

        if (isApiOk(result) && result.data) {
            const data = result.data;
            
            let admins = [];
            let total = 0;
            let pages = 1;

            // 解析分页数据结构（兼容多种格式）
            if (Array.isArray(data)) {
                admins = data;
                total = data.length;
            } else if (data.records) {
                admins = data.records || [];
                total = data.total || 0;
                pages = data.pages || 1;
            } else if (data.list) {
                admins = data.list || [];
                total = data.total || admins.length;
                pages = Math.ceil(total / adminPageSize);
            }
            
            console.log('管理员数据解析:');
            console.log('- 管理员数量:', admins.length);
            console.log('- total 总数:', total);

            if (admins.length === 0) {
                container.innerHTML = `<div class="empty-state-new"><span class="empty-icon">👑</span><p class="empty-text">${keyword ? '未找到匹配的管理员' : '暂无管理员'}</p></div>`;
                document.getElementById('adminPagination').innerHTML = '';
                return;
            }

            container.innerHTML = renderAdminTable(admins);

            if (total > adminPageSize) {
                renderPagination('adminPagination', adminCurrentPage, pages, total, 'loadAdmins');
            } else {
                document.getElementById('adminPagination').innerHTML = '';
            }
        } else {
            container.innerHTML = `<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败：${result.message || '未知错误'}</p></div>`;
            document.getElementById('adminPagination').innerHTML = '';
        }
    } catch (error) {
        console.error('加载管理员列表失败:', error);
        container.innerHTML = `<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败，请检查网络连接</p></div>`;
        document.getElementById('adminPagination').innerHTML = '';
    }
}

async function loadTasks() {
    const container = document.getElementById('tasksTable');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/task/tasks/list`, { headers: getAuthHeaders() });
        const result = await response.json();

        if (isApiOk(result) && result.data) {
            const tasks = result.data;
            if (tasks.length === 0) {
                container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📋</span><p class="empty-text">暂无任务</p></div>';
                return;
            }

            const statusMap = {
                0: { text: '待接单', class: 'pending' },
                1: { text: '进行中', class: 'active' },
                2: { text: '已完成', class: 'completed' }
            };

            container.innerHTML = `
                <div class="table-header-new">
                    <span class="table-cell-new" style="flex: 2">任务内容</span>
                    <span class="table-cell-new">报酬</span>
                    <span class="table-cell-new">状态</span>
                    <span class="table-cell-new" style="justify-content: flex-end; text-align: right">操作</span>
                </div>
                ${tasks.map(task => {
                    const status = statusMap[task.status] || statusMap[0];
                    return `
                        <div class="table-row-new">
                            <div class="table-cell-new" style="flex: 2">
                                <div style="font-weight: 600; color: #1e293b;">${escapeHtml(task.description || '')}</div>
                                <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">${formatTime(task.createTime)}</div>
                            </div>
                            <div class="table-cell-new"><strong style="color: #dc2626;">¥${task.reward || 0}</strong></div>
                            <div class="table-cell-new">
                                <span class="status-badge-new ${status.class}">${status.text}</span>
                            </div>
                            <div class="table-cell-new action-group">
                                ${task.status === 0 ? `<button class="btn-action danger" onclick="forceCloseTask(${task.id})">强制关闭</button>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            `;
        } else {
            container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
    }
}

let currentReviewType = '';
let currentReviewProductId = null;
let manualReviewProducts = [];
let appealReviewProducts = [];
let reviewImagePositions = {};

async function loadProducts() {
    loadManualReviewProducts();
    loadAppealReviewProducts();
}

async function searchProductById() {
    const idInput = document.getElementById('productIdSearch');
    const productId = parseInt(idInput.value);
    const resultArea = document.getElementById('searchResultArea');

    if (!productId || productId <= 0) {
        resultArea.innerHTML = '<div class="empty-state-new"><span class="empty-icon">🔍</span><p class="empty-text">请输入有效的商品ID</p></div>';
        return;
    }

    resultArea.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>搜索中...</span></div>';

    try {
        const result = await API.goods.detail(productId);
        if (isApiOk(result) && result.data) {
            resultArea.innerHTML = createSearchResultCard(result.data);
        } else {
            resultArea.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📦</span><p class="empty-text">未找到该商品</p></div>';
        }
    } catch (error) {
        resultArea.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">搜索失败</p></div>';
    }
}

function createSearchResultCard(product) {
    const statusText = getProductStatusText(product.status);
    const imageUrl = product.firstImage || '';
    const imageHtml = imageUrl
        ? `<img src="${imageUrl}" alt="${escapeHtml(product.name)}" class="search-result-image" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
        : '';
    const placeholderHtml = '<div class="search-result-image-placeholder" style="display:none;">📦</div>';

    return `
        <div class="search-result-card">
            <div class="search-result-top">
                <div class="search-result-image-wrap">
                    ${imageHtml}
                    ${placeholderHtml}
                </div>
                <div class="search-result-info">
                    <h4 class="search-result-name">${escapeHtml(product.name || '未命名')}</h4>
                    <p class="search-result-meta">ID: ${product.goodsId} | ${escapeHtml(product.categoryName || '未分类')} | ${escapeHtml(product.condition || '--')}</p>
                    <p class="search-result-price">¥${(product.price || 0).toFixed(2)}</p>
                    <span class="status-badge-new ${statusText.class}">${statusText.text}</span>
                </div>
            </div>
            <div class="search-result-actions">
                <button class="btn-outline-new" onclick="showProductDetail(${product.goodsId})">查看详情</button>
                <button class="btn-danger-new" onclick="showDisableProductModal(${product.goodsId})">禁用商品</button>
            </div>
        </div>
    `;
}

function getProductStatusText(status) {
    const statusMap = {
        0: { text: '待出售', class: 'pending' },
        1: { text: '已上架', class: 'active' },
        2: { text: '已下架', class: 'disabled' },
        3: { text: '待系统审核', class: 'pending' },
        4: { text: '待人工审核', class: 'pending' },
        5: { text: '审核通过', class: 'active' },
        6: { text: '系统拦截', class: 'disabled' },
        7: { text: '人工拦截', class: 'disabled' },
        8: { text: '待申诉审核', class: 'pending' }
    };
    return statusMap[status] || { text: '未知', class: 'disabled' };
}

function showDisableProductModal(productId) {
    selectedProductId = productId;
    document.getElementById('disableProductReason').value = '';
    openModal('disableProductModal');
}

async function confirmDisableProduct() {
    const reason = document.getElementById('disableProductReason').value.trim();
    if (!reason) {
        showToast('请输入禁用原因', 'error');
        return;
    }
    try {
        const result = await API.goods.offShelf(selectedProductId);
        if (isApiOk(result)) {
            showToast('商品已禁用', 'success');
            closeModal('disableProductModal');
            document.getElementById('disableProductReason').value = '';
            loadManualReviewProducts();
            loadAppealReviewProducts();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败，请重试', 'error');
    }
}

async function loadManualReviewProducts() {
    const container = document.getElementById('manualReviewPanel');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';
    const filter = document.getElementById('manualReviewFilter');
    const auditStatus = filter ? filter.value : '-1';
    try {
        const result = await API.admin.auditList({ auditStatus });
        const list = extractArray(result);
        manualReviewProducts = list;
        const badge = document.getElementById('manualReviewBadge');
        if (badge) badge.textContent = list.length;
        if (list.length === 0) {
            container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">✅</span><p class="empty-text">暂无待人工审核商品</p></div>';
            return;
        }
        container.innerHTML = '<div class="review-cards-list"></div>';
        const cardsContainer = container.querySelector('.review-cards-list');
        list.forEach(p => cardsContainer.appendChild(createReviewCard('manual', p, filter && filter.value === '-4')));
    } catch (error) {
        container.innerHTML = '<div class="empty-state-new error-state"><span class="empty-icon">❌</span><p class="empty-text">数据加载失败，请点击刷新重试</p></div>';
    }
}

async function loadAppealReviewProducts() {
    const container = document.getElementById('appealReviewPanel');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';
    const auditStatus = '-2';
    try {
        const result = await API.admin.auditList({ auditStatus });
        const list = extractArray(result);
        appealReviewProducts = list;
        const badge = document.getElementById('appealReviewBadge');
        if (badge) badge.textContent = list.length;
        if (list.length === 0) {
            container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">✅</span><p class="empty-text">暂无待申诉审核商品</p></div>';
            return;
        }
        container.innerHTML = '<div class="review-cards-list"></div>';
        const cardsContainer = container.querySelector('.review-cards-list');
        list.forEach(p => cardsContainer.appendChild(createReviewCard('appeal', p)));
    } catch (error) {
        container.innerHTML = '<div class="empty-state-new error-state"><span class="empty-icon">❌</span><p class="empty-text">数据加载失败，请点击刷新重试</p></div>';
    }
}

function extractArray(result) {
    if (!result || !isApiOk(result)) return [];
    const data = result.data;
    if (Array.isArray(data)) return data;
    if (data && data.records && Array.isArray(data.records)) return data.records;
    return [];
}

function getReviewImages(product) {
    if (!product) return [];
    if (Array.isArray(product.imageUrls) && product.imageUrls.length) return product.imageUrls.filter(Boolean);
    if (Array.isArray(product.images)) return product.images.filter(Boolean);
    if (typeof product.images === 'string' && product.images) {
        return product.images.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

function createReviewCard(type, product, hideActions) {
    const card = document.createElement('div');
    card.className = 'review-card';

    const images = getReviewImages(product);
    if (!reviewImagePositions[product.goodsId]) {
        reviewImagePositions[product.goodsId] = 0;
    }

    let imgHtml;
    if (images.length > 0) {
        const currentPos = reviewImagePositions[product.goodsId] || 0;
        const prevArrow = images.length > 1 ? `<button class="review-img-arrow review-img-prev" onclick="event.stopPropagation();prevReviewImg(${product.goodsId})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>` : '';
        const nextArrow = images.length > 1 ? `<button class="review-img-arrow review-img-next" onclick="event.stopPropagation();nextReviewImg(${product.goodsId})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>` : '';
        const dots = images.length > 1 ? `<div class="review-img-dots">${images.map((_, i) => `<span class="review-img-dot${i === currentPos ? ' active' : ''}"></span>`).join('')}</div>` : '';
        imgHtml = `
            <div class="review-card-img-wrap" style="height:90px;">
                <div class="review-card-img-inner" style="transform:translateX(-${currentPos * 100}%);transition:transform 0.3s ease;">
                    ${images.map(img => `
                        <img class="review-card-img" src="${escapeHtml(img)}" alt="${escapeHtml(product.name || '')}" loading="lazy"
                            onerror="this.classList.add('img-error');this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><rect fill=%22%23f1f5f9%22 width=%22120%22 height=%22120%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%2394a3b8%22 font-size=%2214%22>加载失败</text></svg>'">
                    `).join('')}
                </div>
                <div class="review-img-overlay" onclick="event.stopPropagation();openImageViewer(${product.goodsId}, ${currentPos})"></div>
                ${prevArrow}
                ${nextArrow}
                ${dots}
            </div>
        `;
    } else {
        imgHtml = `
            <div class="review-card-img-wrap" style="height:90px;">
                <div class="review-card-no-img">📦</div>
            </div>
        `;
    }

    const appealHtml = type === 'appeal' && product.appealContent ? `
        <button class="review-card-appeal-btn" onclick="event.stopPropagation();showAppealContent(this)" data-content="${escapeHtml(product.appealContent)}">查看申诉内容</button>
    ` : '';

    card.innerHTML = `
        ${imgHtml}
        <div class="review-card-body">
            <div class="review-card-name">${escapeHtml(product.name || '未命名商品')}</div>
            <div class="review-card-price">¥${(product.price || 0).toFixed(2)}</div>
            <div class="review-card-desc">${escapeHtml(product.description || product.subtitle || '')}</div>
            <div class="review-card-id">
                <span>ID: ${product.goodsId}</span>
                <button class="review-card-copy-btn" onclick="event.stopPropagation();copyProductId('${product.goodsId}')">复制</button>
                ${appealHtml}
            </div>
        </div>
        <div class="review-card-actions">
            ${hideActions ? '' : `
            <button class="review-card-btn review-card-btn-pass" onclick="event.stopPropagation();passReview('${type}', ${product.goodsId})">通过</button>
            <button class="review-card-btn review-card-btn-reject" onclick="event.stopPropagation();showRejectModal('${type}', ${product.goodsId})">驳回</button>
            `}
        </div>
    `;

    return card;
}

async function passReview(type, productId) {
    try {
        const result = await API.admin.auditPass(productId);
        if (isApiOk(result)) {
            showToast('审核通过成功', 'success');
        } else {
            showToast(result.msg || '审核通过失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
    if (type === 'manual') {
        loadManualReviewProducts();
    } else {
        loadAppealReviewProducts();
    }
}

function showRejectModal(type, productId) {
    currentReviewType = type;
    currentReviewProductId = productId;
    const title = document.getElementById('reviewRejectModalTitle');
    if (title) title.textContent = type === 'manual' ? '驳回原因 - 人工审核' : '驳回原因 - 申诉审核';
    const textarea = document.getElementById('reviewRejectReason');
    if (textarea) textarea.value = '';
    const btn = document.getElementById('reviewRejectConfirmBtn');
    if (btn) btn.disabled = true;
    openModal('reviewRejectModal');
}

function toggleRejectBtn() {
    const textarea = document.getElementById('reviewRejectReason');
    const btn = document.getElementById('reviewRejectConfirmBtn');
    if (textarea && btn) {
        btn.disabled = !textarea.value.trim();
    }
}

async function confirmRejectReview() {
    const textarea = document.getElementById('reviewRejectReason');
    const reason = textarea ? textarea.value.trim() : '';
    if (!reason) {
        showToast('请输入驳回原因', 'error');
        return;
    }
    try {
        const result = await API.admin.auditReject(currentReviewProductId, reason);
        if (isApiOk(result)) {
            showToast('已驳回', 'success');
        } else {
            showToast(result.msg || '驳回失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
    closeModal('reviewRejectModal');
    if (textarea) textarea.value = '';
    if (currentReviewType === 'manual') {
        loadManualReviewProducts();
    } else {
        loadAppealReviewProducts();
    }
}

function prevReviewImg(goodsId) {
    const products = [...manualReviewProducts, ...appealReviewProducts];
    const product = products.find(p => p.goodsId === goodsId);
    if (!product) return;
    const images = getReviewImages(product);
    if (images.length < 2) return;
    let pos = reviewImagePositions[goodsId] || 0;
    pos = (pos - 1 + images.length) % images.length;
    reviewImagePositions[goodsId] = pos;
    updateReviewCardImage(goodsId, pos);
}

function nextReviewImg(goodsId) {
    const products = [...manualReviewProducts, ...appealReviewProducts];
    const product = products.find(p => p.goodsId === goodsId);
    if (!product) return;
    const images = getReviewImages(product);
    if (images.length < 2) return;
    let pos = reviewImagePositions[goodsId] || 0;
    pos = (pos + 1) % images.length;
    reviewImagePositions[goodsId] = pos;
    updateReviewCardImage(goodsId, pos);
}

function updateReviewCardImage(goodsId, pos) {
    const cards = document.querySelectorAll('.review-card');
    for (const card of cards) {
        const idEl = card.querySelector('.review-card-id span');
        if (idEl && idEl.textContent.includes(String(goodsId))) {
            const inner = card.querySelector('.review-card-img-inner');
            if (inner) inner.style.transform = `translateX(-${pos * 100}%)`;
            const dots = card.querySelectorAll('.review-img-dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === pos));
            break;
        }
    }
}

function copyProductId(id) {
    if (!navigator.clipboard) {
        showToast('复制失败，浏览器不支持', 'error');
        return;
    }
    navigator.clipboard.writeText(String(id)).then(() => {
        showToast('复制成功', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

async function showProductDetail(goodsId) {
    openModal('productDetailModal');
    const body = document.getElementById('productDetailBody');
    body.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    try {
        const result = await API.goods.detail(goodsId);
        if (isApiOk(result) && result.data) {
            body.innerHTML = createProductDetailHtml(result.data);
        } else {
            body.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
        }
    } catch (error) {
        body.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
    }
}

function createProductDetailHtml(product) {
    const status = getProductStatusText(product.status);
    const imagesHtml = product.images && product.images.length > 0
        ? product.images.map(img => `<img src="${img}" class="detail-image-item" onerror="this.style.display='none';">`).join('')
        : '<div class="detail-no-image">📦 暂无图片</div>';

    return `
        <div class="detail-container">
            <div class="detail-images-section">${imagesHtml}</div>
            <div class="detail-info-section">
                <div class="detail-row"><span class="detail-label">商品名称</span><span class="detail-value">${escapeHtml(product.name || '--')}</span></div>
                <div class="detail-row"><span class="detail-label">商品ID</span><span class="detail-value">${product.goodsId}</span></div>
                <div class="detail-row"><span class="detail-label">价格</span><span class="detail-value detail-price">¥${(product.price || 0).toFixed(2)}</span></div>
                <div class="detail-row"><span class="detail-label">分类</span><span class="detail-value">${escapeHtml(product.categoryName || '--')}</span></div>
                <div class="detail-row"><span class="detail-label">成色</span><span class="detail-value">${escapeHtml(product.condition || '--')}</span></div>
                <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value"><span class="status-badge-new ${status.class}">${status.text}</span></span></div>
                <div class="detail-row"><span class="detail-label">发布者</span><span class="detail-value">${escapeHtml(product.publisherName || '--')} (ID: ${product.userId || '--'})</span></div>
                <div class="detail-row"><span class="detail-label">发布时间</span><span class="detail-value">${formatTime(product.createTime)}</span></div>
            </div>
            <div class="detail-desc-section">
                <h4>商品描述</h4>
                <p>${escapeHtml(product.description || '暂无描述')}</p>
            </div>
        </div>
    `;
}


function filterTasks(filter) {
    taskFilter = filter;
    document.querySelectorAll('#tasksTab .sub-tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelector(`#tasksTab .sub-tab-btn[data-filter="${filter}"]`).classList.add('active');
    loadTasks();
}

function showBanUserModal(userId) {
    selectedUserId = userId;
    // 重置表单为默认值
    document.getElementById('banDays').value = '30';  // 默认30天
    document.getElementById('banReason').value = '';
    openModal('banUserModal');
}

async function confirmBanUser() {
    const banDays = parseInt(document.getElementById('banDays').value);
    const banReason = document.getElementById('banReason').value.trim();

    if (!banReason) {
        showToast('请输入禁用原因', 'error');
        return;
    }

    try {
        // 调用禁用接口 PUT /admin/users/disable/{userId}
        // 请求体：{ banDays: 禁用天数(0=永久), banReason: 禁用原因 }
        const result = await API.admin.disableUser(selectedUserId, banDays, banReason);
        
        if (isApiOk(result)) {
            // 根据禁用时间显示不同的提示信息
            let successMsg = '已禁用用户';
            if (banDays === 0) {
                successMsg = '已永久禁用该用户';
            } else {
                successMsg = `已禁用该用户 ${banDays} 天`;
            }
            
            showToast(successMsg, 'success');
            closeModal('banUserModal');
            
            // 根据当前页面刷新对应的列表
            if (currentTab === 'admins') {
                loadAdmins(adminCurrentPage);
            } else {
                loadUsers(userCurrentPage);
            }
            
            // 清空输入框
            document.getElementById('banReason').value = '';
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('禁用用户失败:', error);
        showToast('操作失败，请重试', 'error');
    }
}

function showAddAdminModal() {
    // 重置表单
    document.getElementById('newAdminUsername').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('newAdminPhone').value = '';
    document.getElementById('newAdminEmail').value = '';
    document.getElementById('newAdminEmailCode').value = '';
    
    // 重置发送验证码按钮状态
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    if (sendCodeBtn) {
        sendCodeBtn.disabled = false;
        sendCodeBtn.textContent = '发送验证码';
        sendCodeBtn.classList.remove('disabled');
    }
    
    openModal('addAdminModal');
}

// 发送邮箱验证码
let codeCountdownTimer = null;
async function sendEmailCode() {
    const email = document.getElementById('newAdminEmail').value.trim();
    const sendCodeBtn = document.getElementById('sendCodeBtn');

    // 邮箱校验
    if (!email) {
        showToast('请先输入邮箱', 'error');
        return;
    }
    if (!/^[1-9][0-9]{4,}@qq\.com$/.test(email)) {
        showToast('仅支持QQ邮箱', 'error');
        return;
    }

    // 如果正在倒计时，不允许重复点击
    if (sendCodeBtn.disabled) {
        return;
    }

    try {
        // 调用发送验证码接口 /user/user/send-code
        const result = await API.auth.sendCode(email);
        
        if (isApiOk(result)) {
            showToast('验证码已发送，请查收邮件', 'success');
            
            // 开始60秒倒计时
            let countdown = 60;
            sendCodeBtn.disabled = true;
            sendCodeBtn.classList.add('disabled');
            
            codeCountdownTimer = setInterval(() => {
                countdown--;
                sendCodeBtn.textContent = `${countdown}秒后重发`;
                
                if (countdown <= 0) {
                    clearInterval(codeCountdownTimer);
                    sendCodeBtn.disabled = false;
                    sendCodeBtn.textContent = '发送验证码';
                    sendCodeBtn.classList.remove('disabled');
                }
            }, 1000);
        } else {
            showToast(result.message || '发送失败', 'error');
        }
    } catch (error) {
        console.error('发送验证码失败:', error);
        showToast('网络错误，请重试', 'error');
    }
}

async function confirmAddAdmin() {
    const username = document.getElementById('newAdminUsername').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    const phone = document.getElementById('newAdminPhone').value.trim();
    const email = document.getElementById('newAdminEmail').value.trim();
    const emailCode = document.getElementById('newAdminEmailCode').value.trim();

    // 用户名校验
    if (!username) {
        showToast('请输入用户名', 'error');
        return;
    }
    if (username.length < 3 || username.length > 20) {
        showToast('用户名长度需在3-20个字符之间', 'error');
        return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showToast('用户名只能包含字母、数字和下划线', 'error');
        return;
    }

    // 密码校验
    if (!password) {
        showToast('请输入密码', 'error');
        return;
    }
    if (password.length < 6 || password.length > 20) {
        showToast('密码长度需在6-20个字符之间', 'error');
        return;
    }

    // 手机号校验
    if (!phone) {
        showToast('请输入手机号', 'error');
        return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showToast('手机号格式不正确', 'error');
        return;
    }

    // 邮箱校验
    if (!email) {
        showToast('请输入邮箱', 'error');
        return;
    }
    if (!/^[1-9][0-9]{4,}@qq\.com$/.test(email)) {
        showToast('仅支持QQ邮箱', 'error');
        return;
    }

    // 验证码校验
    if (!emailCode) {
        showToast('请输入验证码', 'error');
        return;
    }
    if (emailCode.length !== 6 || !/^\d{6}$/.test(emailCode)) {
        showToast('验证码为6位数字', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/admin/users/register`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username, password, phone, email, emailCode })
        });

        const result = await response.json();
        if (isApiOk(result)) {
            showToast('管理员添加成功', 'success');
            closeModal('addAdminModal');
            loadAdmins();
            // 清空表单
            document.getElementById('newAdminUsername').value = '';
            document.getElementById('newAdminPassword').value = '';
            document.getElementById('newAdminPhone').value = '';
            document.getElementById('newAdminEmail').value = '';
            document.getElementById('newAdminEmailCode').value = '';
        } else {
            showToast(result.message || '添加失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

function showAdjustCreditModal(userId) {
    selectedCreditUserId = userId;
    document.getElementById('creditAdjustValue').value = 0;
    document.getElementById('creditReason').value = '';
    openModal('adjustCreditModal');
}

function adjustCreditValue(delta) {
    const input = document.getElementById('creditAdjustValue');
    input.value = parseInt(input.value || 0) + delta;
}

async function confirmAdjustCredit() {
    const changeValue = parseInt(document.getElementById('creditAdjustValue').value);
    const reason = document.getElementById('creditReason').value.trim();

    // 校验调整分值
    if (isNaN(changeValue) || changeValue === 0) {
        showToast('请输入有效的调整分值（不能为0）', 'error');
        return;
    }

    // 校验调整原因
    if (!reason) {
        showToast('请输入调整原因', 'error');
        return;
    }

    try {
        // 调用新接口 /admin/users/credit/adjust/{userId}
        // 参数格式：{ changeValue: 调整分值(可正可负), reason: 调整原因 }
        const response = await fetch(`${API_BASE_URL}/admin/users/credit/adjust/${selectedCreditUserId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ changeValue, reason })
        });

        const result = await response.json();
        if (isApiOk(result)) {
            showToast('信誉分已调整', 'success');
            closeModal('adjustCreditModal');
            loadUsers();
        } else {
            showToast(result.message || '调整失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

async function forceCloseTask(taskId) {
    if (!confirm('确定要强制关闭该任务吗？')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/tasks/${taskId}/close`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });

        const result = await response.json();
        if (isApiOk(result)) {
            showToast('任务已强制关闭', 'success');
            loadTasks();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

function switchToUser() {
    // 在当前标签页跳转到用户页面（保持管理员的 session）
    window.location.href = 'user.html';
}

function logout() {
    // 调用后端登出接口使 token 失效
    fetch(API_BASE_URL + '/user/user/logout', { method: 'POST', headers: getAuthHeaders() }).catch(function() {});

    // 关闭 WebSocket 连接
    closeWebSocket();

    // 清除当前标签页的认证信息
    localStorage.removeItem(getTokenKey());
    localStorage.removeItem(getUserInfoKey());
    window.location.href = 'login.html';
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    const toastIcon = toast.querySelector('.toast-icon-new');
    const toastMessage = toast.querySelector('.toast-message-new');

    toast.classList.remove('show', 'success', 'error', 'info');
    toastMessage.textContent = message;
    toast.classList.add(type);

    if (type === 'success') toastIcon.textContent = '✓';
    else if (type === 'error') toastIcon.textContent = '✗';
    else toastIcon.textContent = 'ℹ';

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

function getAuthHeaders() {
    const token = getCurrentToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== WebSocket 账号状态实时推送（替代定时轮询） ====================

let websocket = null;
let reconnectTimer = null;
let isManualClose = false;  // 标记是否手动关闭（退出登录时）
let wsConnectionCount = 0;  // 连接次数统计（用于调试）

/**
 * 初始化 WebSocket 连接
 * 连接后端 WebSocket 服务，接收账号状态变更推送
 */
function initWebSocket() {
    // 如果已有连接且处于开启状态，不重复创建
    if (websocket && (websocket.readyState === WebSocket.CONNECTING || websocket.readyState === WebSocket.OPEN)) {
        console.log('⚠️ WebSocket 已连接或正在连接中 | readyState:', websocket.readyState);
        return;
    }

    const token = getCurrentToken();
    if (!token) {
        console.warn('⚠️ 无 Token，无法建立 WebSocket 连接');
        console.warn('   → 请检查是否已登录');
        return;
    }

    // 构建 WebSocket URL（使用后端 API 地址）
    // 注意：WebSocket 协议是 ws:// 或 wss://（HTTPS）
    // ⚠️ 必须使用后端的地址（API_BASE_URL），不能使用当前页面的地址！
    const isHttps = API_BASE_URL.startsWith('https');
    const wsProtocol = isHttps ? 'wss:' : 'ws:';
    
    // 从 API_BASE_URL 中提取 host（去掉协议前缀）
    // 例如: http://localhost:8080 → localhost:8080
    const wsHost = API_BASE_URL.replace(/^https?:\/\//, '');
    
    const wsUrl = `${wsProtocol}//${wsHost}/ws/account-status?token=${token}`;

    wsConnectionCount++;
    console.log('='.repeat(60));
    console.log(`🔌 [第${wsConnectionCount}次] 正在连接 WebSocket...`);
    console.log('📍 完整URL:', wsUrl);
    console.log('🔑 Token(前10位):', token.substring(0, 10) + '...');
    console.log('⏰ 时间:', new Date().toLocaleString());
    console.log('='.repeat(60));

    try {
        websocket = new WebSocket(wsUrl);

        // 🔍 监听连接状态变化（增强版）
        let connectionTimer = setTimeout(() => {
            if (websocket && websocket.readyState === WebSocket.CONNECTING) {
                console.error('❌ WebSocket 连接超时！后端可能未响应或地址错误');
                console.error('   → 请检查后端是否已启动 WebSocket 服务');
                console.error('   → 端点路径应为: /ws/account-status');
                console.error('   → 当前尝试的完整地址:', wsUrl);
            }
        }, 5000);  // 5秒超时

        // 连接成功 ✅
        websocket.onopen = function(event) {
            clearTimeout(connectionTimer);  // 清除超时定时器
            
            console.log('');
            console.log('✅✅✅ WebSocket 连接成功！！！✅✅✅');
            console.log('📊 连接信息:');
            console.log('   - URL:', wsUrl);
            console.log('   - readyState:', websocket.readyState, '(OPEN=1)');
            console.log('   - protocol:', websocket.protocol);
            console.log('   - 时间:', new Date().toLocaleString());
            
            isManualClose = false;

            // 发送初始化消息（用于测试连接）
            if (websocket.readyState === WebSocket.OPEN) {
                const initMessage = JSON.stringify({
                    type: 'INIT',
                    timestamp: Date.now(),
                    clientInfo: navigator.userAgent
                });
                
                console.log('📤 发送初始化消息:', initMessage);
                websocket.send(initMessage);
                console.log('✅ 初始化消息发送成功！');
            }
        };

        // 接收消息 📨
        websocket.onmessage = function(event) {
            console.log('');
            console.log('📨📨📨 收到 WebSocket 消息！！！📨📨📨');
            console.log('📦 原始数据:', event.data);
            handleWebSocketMessage(event.data);
        };

        // 连接关闭 📴
        websocket.onclose = function(event) {
            clearTimeout(connectionTimer);
            
            console.log('');
            console.log('📴 WebSocket 连接已关闭');
            console.log('   - 关闭码:', event.code);
            console.log('   - 原因:', event.reason || '(无原因)');
            console.log('   - 是否正常关闭:', event.wasClean);
            console.log('   - 时间:', new Date().toLocaleString());
            
            // 常见关闭码说明
            switch(event.code) {
                case 1000:
                    console.log('   💡 说明: 正常关闭');
                    break;
                case 1001:
                    console.log('   💡 说明: 端点离开（页面跳转等）');
                    break;
                case 1002:
                    console.log('   💡 说明: 协议错误');
                    break;
                case 1003:
                    console.log('   💡 说明: 不支持的数据类型');
                    break;
                case 1006:
                    console.log('   ⚠️ 说明: 异常关闭（连接丢失/网络问题/后端未启动）');
                    console.log('      → 这是最常见的问题！');
                    console.log('      → 可能原因:');
                    console.log('         1. 后端 WebSocket 服务未启动');
                    console.log('         2. 后端端口或路径配置错误');
                    console.log('         3. 防火墙阻止了 WebSocket 连接');
                    console.log('         4. Token 认证失败导致握手被拒绝');
                    break;
                default:
                    console.log(`   💡 说明: 其他关闭码 ${event.code}`);
            }
            
            // 如果不是手动关闭，自动重连
            if (!isManualClose) {
                console.log('');
                console.log('🔄 准备自动重连...');
                reconnectTimer = setTimeout(() => {
                    console.log('🔄 开始第', wsConnectionCount + 1, '次重连...');
                    initWebSocket();
                }, 3000);
            } else {
                console.log('   ℹ️ 这是手动关闭（退出登录），不重连');
            }
        };

        // 连接错误 ❌
        websocket.onerror = function(error) {
            clearTimeout(connectionTimer);
            console.error('');
            console.error('❌❌❌ WebSocket 错误！！！❌❌❌');
            console.error('🔍 错误对象:', error);
            console.error('💡 可能的原因:');
            console.error('   1. 后端服务未启动或端口不正确');
            console.error('   2. WebSocket 端点路径 /ws/account-status 不存在');
            console.error('   3. CORS 跨域配置不允许当前域名连接');
            console.error('   4. 网络防火墙或代理阻止了 WebSocket');
            console.error('   5. Token 格式错误或过期');
            console.error('');
            console.error('🛠️ 排查步骤:');
            console.error('   步骤1: 打开浏览器 F12 → Network 标签页 → WS 过滤器');
            console.error('   步骤2: 查看是否有失败的 WebSocket 连接记录');
            console.error('   步骤3: 点击该记录查看详细错误信息');
            console.error('   步骤4: 检查后端控制台日志是否有握手请求');
        };
    } catch (error) {
        console.error('❌ 创建 WebSocket 失败:', error);
        console.error('   错误类型:', error.name);
        console.error('   错误消息:', error.message);
    }
}

/**
 * 手动测试 WebSocket 连接（调试用）
 */
function testWebSocketConnection() {
    console.log('');
    console.log('🧪 开始手动测试 WebSocket 连接...');
    console.log('='.repeat(60));
    
    if (!getCurrentToken()) {
        alert('请先登录后再测试 WebSocket 连接');
        return;
    }
    
    // 先关闭现有连接
    if (websocket) {
        console.log('📴 关闭现有连接...');
        closeWebSocket();
    }
    
    // 重新初始化
    setTimeout(() => {
        initWebSocket();
    }, 500);
}

/**
 * 查看 WebSocket 当前状态（调试用）
 */
function getWebSocketStatus() {
    console.log('');
    console.log('📊 WebSocket 状态报告');
    console.log('='.repeat(40));
    
    if (!websocket) {
        console.log('❌ WebSocket 对象不存在（未初始化）');
        console.log('   → 可能原因: 页面还未加载完成或未调用 initWebSocket()');
        return;
    }
    
    const stateMap = {
        [WebSocket.CONNECTING]: '正在连接 (0)',
        [WebSocket.OPEN]: '已连接 (1) ✓',
        [WebSocket.CLOSING]: '正在关闭 (2)',
        [WebSocket.CLOSED]: '已关闭 (3)'
    };
    
    console.log('🔗 readyState:', websocket.readyState, '-', stateMap[websocket.readyState] || '未知');
    console.log('🔗 protocol:', websocket.protocol);
    console.log('🔗 url:', websocket.url ? websocket.url.substring(0, 50) + '...' : '(无)');
    console.log('🔗 bufferedAmount:', websocket.bufferedAmount, '(待发送字节数)');
    console.log('🔗 extensions:', websocket.extensions || '(无)');
    console.log('🔗 binaryType:', websocket.binaryType);
    console.log('🔗 isManualClose:', isManualClose);
    console.log('🔗 重连定时器:', reconnectTimer ? '存在' : '不存在');
    console.log('🔗 总连接次数:', wsConnectionCount);
    
    if (websocket.readyState !== WebSocket.OPEN) {
        console.log('');
        console.log('⚠️ WebSocket 未处于 OPEN 状态！');
        console.log('   → 建议: 调用 testWebSocketConnection() 尝试重新连接');
    }
}

/**
 * 处理 WebSocket 消息
 * @param {string} message - 收到的消息（JSON 字符串）
 */
function handleWebSocketMessage(message) {
    try {
        const data = JSON.parse(message);
        console.log('📨 收到 WebSocket 消息:', data);

        switch (data.type) {
            case 'FORCE_LOGOUT':
                // 强制下线：用户被禁用或注销
                console.error('🚨 收到强制下线通知！原因:', data.reason || '未知');
                forceLogout(data.reason || '您的账号状态异常，请重新登录');
                break;

            case 'ACCOUNT_DISABLED':
                // 账号被禁用
                console.error('🚨 账号已被禁用！');
                forceLogout('您的账号已被禁用，请重新登录');
                break;

            case 'ACCOUNT_DELETED':
                // 账号已被注销/删除
                console.error('🚨 账号已被注销！');
                forceLogout('您的账号已被注销，请重新登录');
                break;

            case 'HEARTBEAT':
                // 心跳响应（可选）
                console.log('💓 收到心跳响应');
                break;

            case 'USER_INFO_UPDATED':
                // 用户信息已更新（后端清除Redis缓存后推送）
                console.log('📝 收到用户信息变更通知，正在刷新用户列表...');
                refreshCurrentList();
                showToast('用户数据已更新', 'info');
                break;

            case 'ADMIN_INFO_UPDATED':
                // 管理员信息已更新
                console.log('📝 收到管理员信息变更通知，正在刷新管理员列表...');
                refreshCurrentList();
                showToast('管理员数据已更新', 'info');
                break;

            case 'DATA_REFRESH':
                // 通用数据刷新通知（适用于任何数据变更）
                console.log('🔄 收到数据刷新通知，正在刷新当前列表...');
                refreshCurrentList();
                if (data.message) {
                    showToast(data.message, 'info');
                }
                break;

            default:
                console.warn('⚠️ 未知的消息类型:', data.type);
        }
    } catch (error) {
        console.error('❌ 解析 WebSocket 消息失败:', error, '\n原始消息:', message);
    }
}

/**
 * 刷新当前页面的列表数据
 * 根据 currentTab 判断应该刷新哪个列表
 */
function refreshCurrentList() {
    console.log('🔄 正在刷新列表，当前Tab:', currentTab);
    
    switch (currentTab) {
        case 'users':
            loadUsers(userCurrentPage);
            break;
        case 'admins':
            loadAdmins(adminCurrentPage);
            break;
        case 'tasks':
            loadTasks();
            break;
        case 'products':
            loadProducts();
            break;
        case 'productsReview':
            loadManualReviewProducts();
            loadAppealReviewProducts();
            break;
        case 'productsCategory':
            loadCategories();
            break;
        case 'newsCategory':
            loadNewsCategories();
            break;
        case 'productsSearch':
            initProductSearch();
            break;
        case 'dashboard':
            loadDashboardData();
            break;
        default:
            console.warn('⚠️ 未知的Tab类型，无法刷新:', currentTab);
    }
}

/**
 * 强制下线处理函数
 * 清除本地 Token 并跳转到登录页
 * @param {string} reason - 下线原因提示
 */
/**
 * 优雅强制下线处理函数
 * 显示优雅的过渡界面，然后自动跳转到登录页
 * @param {string} reason - 下线原因提示
 */
function forceLogout(reason) {
    console.log(`🚨 执行优雅强制下线: ${reason}`);

    // 调用后端登出接口使 token 失效
    fetch(API_BASE_URL + '/user/user/logout', { method: 'POST', headers: getAuthHeaders() }).catch(function() {});

    // 标记为手动关闭，避免重连
    isManualClose = true;

    // 关闭 WebSocket 连接
    closeWebSocket();

    // 清除当前标签页的认证信息（localStorage）
    localStorage.removeItem(getTokenKey());
    localStorage.removeItem(getUserInfoKey());

    // 显示优雅下线界面
    showElegantLogoutOverlay(reason);
}

/**
 * 显示优雅下线过渡界面
 * @param {string} reason - 下线原因
 */
function showElegantLogoutOverlay(reason) {
    const overlay = document.getElementById('elegantLogoutOverlay');
    const titleEl = document.getElementById('logoutTitle');
    const messageEl = document.getElementById('logoutMessage');
    const iconEl = document.querySelector('.logout-icon');
    const countdownNumberEl = document.getElementById('countdownNumber');

    if (!overlay) {
        console.error('❌ 优雅下线组件未找到，使用普通跳转');
        alert(reason);
        window.location.href = 'login.html';
        return;
    }

    // 根据原因设置不同的文案和图标
    let title, message, icon;
    
    if (reason.includes('禁用')) {
        title = '账号已被禁用';
        message = '您的账号因违规操作被管理员禁用，如需继续使用请联系管理员解封';
        icon = '🚫';
    } else if (reason.includes('注销') || reason.includes('删除')) {
        title = '账号已注销';
        message = '您的账号已被注销，如需继续使用请联系客服或重新注册';
        icon = '👋';
    } else {
        title = '账号状态异常';
        message = reason || '您的账号状态发生变更，需要重新登录以确认身份';
        icon = '🔒';
    }

    // 设置内容
    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.textContent = icon;

    // 重置倒计时
    let countdown = 5;
    countdownNumberEl.textContent = countdown;

    // 重置进度条动画
    const progressEl = document.getElementById('countdownProgress');
    if (progressEl) {
        progressEl.style.animation = 'none';
        void progressEl.offsetWidth;  // 触发 reflow
        progressEl.style.animation = 'countdownProgress 5s linear forwards';
    }

    // 显示遮罩层
    overlay.classList.add('active');

    // 启动倒计时
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownNumberEl.textContent = countdown;

        if (countdown <= 0) {
            clearInterval(countdownInterval);
            immediateRedirectToLogin();
        }
    }, 1000);
}

/**
 * 立即跳转到登录页（用户点击按钮或倒计时结束）
 */
function immediateRedirectToLogin() {
    // 添加淡出效果
    const overlay = document.getElementById('elegantLogoutOverlay');
    
    if (overlay) {
        overlay.style.transition = 'opacity 0.3s ease-out';
        overlay.style.opacity = '0';
        
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 300);
    } else {
        window.location.href = 'login.html';
    }
}

// ==================== 商品分类管理（重写） ====================

let categoryList = [];

async function loadCategories() {
    const container = document.getElementById('categoryTableContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    try {
        const result = await API.category.list();
        if (isApiOk(result) && Array.isArray(result.data)) {
            // 合并：保留本地已有的禁用/删除分类，不被后端过滤掉
            const serverMap = new Map(result.data.map(c => [c.id, c]));
            const merged = new Map();
            // 先加入本地已有分类（保留禁用/删除状态）
            for (const cat of categoryList) {
                merged.set(cat.id, cat);
            }
            // 再用服务端数据覆盖（更新名称、排序等）
            for (const [id, cat] of serverMap) {
                merged.set(id, { ...merged.get(id), ...cat });
            }
            categoryList = [...merged.values()].sort((a, b) => (a.sort || 0) - (b.sort || 0));
            renderCategoryTable();
        } else {
            container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无分类数据</p></div>';
            const countEl = document.getElementById('categoryCount');
            if (countEl) countEl.textContent = '0 个分类';
        }
    } catch (error) {
        console.error('加载分类失败:', error);
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
    }
}

function renderCategoryTable() {
    const container = document.getElementById('categoryTableContainer');
    const countEl = document.getElementById('categoryCount');
    if (countEl) countEl.textContent = `${categoryList.length} 个分类`;

    if (categoryList.length === 0) {
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无分类，点击上方按钮新增</p></div>';
        return;
    }

    container.innerHTML = `
        <table class="category-table">
            <thead>
                <tr>
                    <th class="cat-col-drag"></th>
                    <th class="cat-col-name">分类名称</th>
                    <th class="cat-col-sort">排序</th>
                    <th class="cat-col-status">状态</th>
                    <th class="cat-col-actions">操作</th>
                </tr>
            </thead>
            <tbody>
                ${categoryList.map((cat, i) => buildCategoryRow(cat, i)).join('')}
            </tbody>
        </table>
    `;
}

function buildCategoryRow(cat, index) {
    const st = getCatStatus(cat);
    const style = cat.deleted === 1 ? ' style="opacity:.55;"' : '';
    return `<tr class="cat-row"${style} draggable="true" data-id="${cat.id}">
        <td class="cat-col-drag"><span class="cat-drag-handle" draggable="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
        </span></td>
        <td class="cat-col-name"><span class="cat-name-val">${escapeHtml(cat.name)}</span></td>
        <td class="cat-col-sort">
            <input type="number" class="cat-sort-input" value="${cat.sort}" min="0"
                   onchange="handleSortChange(${cat.id}, this.value)"
                   onkeydown="if(event.key==='Enter')this.blur()">
        </td>
        <td class="cat-col-status"><span class="status-badge-new ${st.cls}">${st.txt}</span></td>
        <td class="cat-col-actions"><div class="cat-btn-group">${getCatActions(cat, st)}</div></td>
    </tr>`;
}

function getCatStatus(cat) {
    if (cat.deleted === 1) return { txt: '已删除', cls: 'logout' };
    if (cat.status === 0) return { txt: '已禁用', cls: 'disabled' };
    return { txt: '已启用', cls: 'normal' };
}

function getCatActions(cat, st) {
    const id = cat.id;
    return `
        <button class="cat-btn cat-btn-text" onclick="openEditCategoryModal(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            编辑
        </button>
        ${st.txt === '已启用' ? `<button class="cat-btn cat-btn-text cat-btn-warning" onclick="handleDisable(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            禁用
        </button>` : `<button class="cat-btn cat-btn-text cat-btn-success" onclick="handleEnable(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            启用
        </button>`}
        ${st.txt !== '已删除' ? `<button class="cat-btn cat-btn-text cat-btn-danger" onclick="handleDelete(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            删除
        </button>` : `<button class="cat-btn cat-btn-text cat-btn-purple" onclick="handleRestore(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            恢复
        </button>`}
    `;
}

// ===== 本地缓存更新（不依赖后端过滤后的列表） =====

function updateCategoryInList(id, updates) {
    const idx = categoryList.findIndex(c => c.id === id);
    if (idx === -1) return;
    categoryList[idx] = { ...categoryList[idx], ...updates };
    renderCategoryTable();
}

// ===== Modal =====

let editingCategoryId = null;

function openAddCategoryModal() {
    editingCategoryId = null;
    document.getElementById('categoryFormTitle').textContent = '新增分类';
    document.getElementById('categoryNameInput').value = '';
    document.getElementById('saveCategoryBtn').textContent = '确认';
    document.getElementById('saveCategoryBtn').onclick = saveCategoryForm;
    openModal('categoryFormModal');
}

function openEditCategoryModal(id) {
    const cat = categoryList.find(c => c.id === id);
    if (!cat) return;
    editingCategoryId = id;
    document.getElementById('categoryFormTitle').textContent = '编辑分类';
    document.getElementById('categoryNameInput').value = cat.name;
    document.getElementById('saveCategoryBtn').textContent = '保存';
    document.getElementById('saveCategoryBtn').onclick = saveCategoryForm;
    openModal('categoryFormModal');
}

function closeCategoryFormModal() {
    closeModal('categoryFormModal');
    editingCategoryId = null;
    document.getElementById('saveCategoryBtn').onclick = saveCategoryForm;
}

async function saveCategoryForm() {
    const name = document.getElementById('categoryNameInput').value.trim();
    if (!name) { showToast('请输入分类名称', 'error'); return; }

    try {
        if (editingCategoryId) {
            const result = await API.category.update({ id: editingCategoryId, name });
            if (isApiOk(result)) {
                showToast('分类已更新', 'success');
                const savedId = editingCategoryId;
                closeCategoryFormModal();
                updateCategoryInList(savedId, { name });
            } else {
                showToast(result.message || '更新失败', 'error');
            }
        } else {
            const result = await API.category.add({ name });
            if (isApiOk(result)) {
                showToast('分类已添加', 'success');
                closeCategoryFormModal();
                loadCategories(); // 新增需要重新拉取以获取服务端生成的 id 和 sort
            } else {
                showToast(result.message || '添加失败', 'error');
            }
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

// ===== Sort =====

let sortTimer = null;

async function handleSortChange(id, value) {
    const newSort = parseInt(value);
    if (isNaN(newSort) || newSort < 0) return;
    if (sortTimer) clearTimeout(sortTimer);
    sortTimer = setTimeout(async () => {
        try {
            await API.category.sort(id, newSort);
            showToast('排序已更新', 'success');
            updateCategoryInList(id, { sort: newSort });
        } catch (error) {
            showToast('排序更新失败', 'error');
        }
    }, 400);
}

// ===== Drag and Drop =====

let dragSrcId = null;
let dragSrcType = null; // 'product' or 'news'

function getDragList(type) {
    return type === 'news' ? newsCategoryList : categoryList;
}

function getDragApi(type) {
    return type === 'news' ? API.newsCategory : API.category;
}

function getDragContainerSelector(type) {
    return type === 'news' ? '#newsCategoryTableContainer' : '#categoryTableContainer';
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('dragstart', e => {
        const row = e.target.closest('.cat-row');
        if (!row) return;
        // 判断所在容器
        const inNews = row.closest('#newsCategoryTableContainer');
        const inProduct = row.closest('#categoryTableContainer');
        if (!inNews && !inProduct) return;
        dragSrcType = inNews ? 'news' : 'product';
        dragSrcId = parseInt(row.dataset.id);
        row.classList.add('cat-dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    document.addEventListener('dragend', e => {
        const row = e.target.closest('.cat-row');
        if (row) row.classList.remove('cat-dragging');
        document.querySelectorAll('.cat-row').forEach(r => r.classList.remove('cat-drag-over'));
        dragSrcId = null;
        dragSrcType = null;
    });

    document.addEventListener('dragover', e => {
        const row = e.target.closest('.cat-row');
        if (!row || !dragSrcId || !dragSrcType) return;
        // 只允许同一容器内拖拽
        const inSameContainer = dragSrcType === 'news'
            ? row.closest('#newsCategoryTableContainer')
            : row.closest('#categoryTableContainer');
        if (!inSameContainer) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const selector = getDragContainerSelector(dragSrcType);
        document.querySelectorAll(`${selector} .cat-row`).forEach(r => r.classList.remove('cat-drag-over'));
        if (parseInt(row.dataset.id) !== dragSrcId) {
            row.classList.add('cat-drag-over');
        }
    });

    document.addEventListener('dragleave', e => {
        const row = e.target.closest('.cat-row');
        if (row) row.classList.remove('cat-drag-over');
    });

    document.addEventListener('drop', async e => {
        e.preventDefault();
        const targetRow = e.target.closest('.cat-row');
        if (!targetRow || !dragSrcId || !dragSrcType) { dragSrcId = null; dragSrcType = null; return; }
        if (parseInt(targetRow.dataset.id) === dragSrcId) { dragSrcId = null; dragSrcType = null; return; }

        const targetId = parseInt(targetRow.dataset.id);
        const srcType = dragSrcType;
        const list = getDragList(srcType);
        const api = getDragApi(srcType);
        const srcCat = list.find(c => c.id === dragSrcId);
        const tgtCat = list.find(c => c.id === targetId);
        if (!srcCat || !tgtCat) { dragSrcId = null; dragSrcType = null; return; }

        const newSort = tgtCat.sort;
        try {
            await api.sort(dragSrcId, newSort);
            showToast('排序已更新', 'success');
            if (srcType === 'news') {
                await loadNewsCategories();
                await loadNewsDisCategories();
                loadCampusNews();
            } else {
                await loadCategories();
            }
        } catch (error) {
            showToast('拖拽排序失败', 'error');
        }
        dragSrcId = null;
        dragSrcType = null;
    });
});

// ===== Actions =====

async function handleEnable(id) {
    const cat = categoryList.find(c => c.id === id);
    if (!cat) return;
    if (cat.deleted === 1) {
        showToast('该分类已删除，无法启用', 'error');
        return;
    }
    try {
        const result = await API.category.enable(id);
        if (isApiOk(result)) {
            showToast('分类已启用', 'success');
            updateCategoryInList(id, { status: 1 });
            loadDisCategories();
        } else {
            showToast(result.message || '启用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleDisable(id) {
    if (!confirm('确认禁用该分类？')) return;
    try {
        const result = await API.category.disable(id);
        if (isApiOk(result)) {
            showToast('分类已禁用', 'success');
            categoryList = categoryList.filter(c => c.id !== id);
            renderCategoryTable();
            loadDisCategories();
        } else {
            showToast(result.message || '禁用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleDelete(id) {
    // 先查询分类是否关联商品，决定确认文案
    let hasGoods = false;
    try {
        const countRes = await API.category.goodsCount(id);
        hasGoods = isApiOk(countRes) && countRes.data > 0;
    } catch (e) { /* 查询失败则使用默认文案 */ }

    if (hasGoods) {
        if (!confirm('该分类已关联商品，是否改为禁用操作？')) return;
    } else {
        if (!confirm('确认删除该分类？')) return;
    }

    try {
        const result = await API.category.deleteCategory(id);
        if (isApiOk(result)) {
            if (result.data === 'disabled') {
                showToast('该分类关联商品，已执行禁用', 'info');
            } else {
                showToast('分类已删除', 'success');
            }
            categoryList = categoryList.filter(c => c.id !== id);
            renderCategoryTable();
            loadDisCategories();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleRestore(id) {
    if (!confirm('确认恢复该分类？')) return;
    try {
        const result = await API.category.restore(id);
        if (isApiOk(result)) {
            showToast('分类已恢复', 'success');
            updateCategoryInList(id, { deleted: 0 });
            loadDisCategories();
        } else {
            showToast(result.message || '恢复失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

// ==================== 已禁用/删除分类管理 ====================

let disCategoryList = [];

async function loadDisCategories() {
    const container = document.getElementById('disCategoryTableContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    try {
        const result = await API.category.listDis();
        if (isApiOk(result) && Array.isArray(result.data)) {
            disCategoryList = result.data.sort((a, b) => (a.sort || 0) - (b.sort || 0));
            renderDisCategoryTable();
        } else {
            container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无数据</p></div>';
            const countEl = document.getElementById('disCategoryCount');
            if (countEl) countEl.textContent = '0 个分类';
        }
    } catch (error) {
        console.error('加载禁用/删除分类失败:', error);
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
    }
}

function renderDisCategoryTable() {
    const container = document.getElementById('disCategoryTableContainer');
    const countEl = document.getElementById('disCategoryCount');
    if (countEl) countEl.textContent = `${disCategoryList.length} 个分类`;

    if (disCategoryList.length === 0) {
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无禁用或删除的分类</p></div>';
        return;
    }

    container.innerHTML = `
        <table class="category-table">
            <thead>
                <tr>
                    <th class="dis-cat-col-spacer"></th>
                    <th class="dis-cat-col-name">分类名称</th>
                    <th class="dis-cat-col-sort">排序</th>
                    <th class="dis-cat-col-status">状态</th>
                    <th class="dis-cat-col-actions">操作</th>
                </tr>
            </thead>
            <tbody>
                ${disCategoryList.map(cat => buildDisCategoryRow(cat)).join('')}
            </tbody>
        </table>
    `;
}

function buildDisCategoryRow(cat) {
    const st = getCatStatus(cat);
    return `<tr class="cat-row">
        <td class="dis-cat-col-spacer"><span class="cat-drag-handle" style="cursor:default;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
        </span></td>
        <td class="dis-cat-col-name"><span class="cat-name-val">${escapeHtml(cat.name)}</span></td>
        <td class="dis-cat-col-sort"><span class="cat-sort-text">${cat.sort}</span></td>
        <td class="dis-cat-col-status"><span class="status-badge-new ${st.cls}">${st.txt}</span></td>
        <td class="dis-cat-col-actions"><div class="cat-btn-group">${getDisCatActions(cat, st)}</div></td>
    </tr>`;
}

function getDisCatActions(cat, st) {
    const id = cat.id;
    const html = [];

    // 编辑
    html.push(`<button class="cat-btn cat-btn-text" onclick="openDisEditCategory(${id})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        编辑
    </button>`);

    // 禁用状态 → 启用；启用状态 → 禁用（虽然后端list/dis不太可能返回启用状态的）
    if (cat.deleted !== 1) {
        if (cat.status === 0) {
            html.push(`<button class="cat-btn cat-btn-text cat-btn-success" onclick="handleDisEnable(${id})">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                启用
            </button>`);
        } else {
            html.push(`<button class="cat-btn cat-btn-text cat-btn-warning" onclick="handleDisDisable(${id})">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                禁用
            </button>`);
        }
    }

    // 已删除 → 恢复
    if (cat.deleted === 1) {
        html.push(`<button class="cat-btn cat-btn-text cat-btn-purple" onclick="handleDisRestore(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            恢复
        </button>`);
    }

    return html.join('');
}

function updateDisCategoryInList(id, updates) {
    const idx = disCategoryList.findIndex(c => c.id === id);
    if (idx === -1) return;
    disCategoryList[idx] = { ...disCategoryList[idx], ...updates };
    renderDisCategoryTable();
}

function removeDisCategory(id) {
    disCategoryList = disCategoryList.filter(c => c.id !== id);
    renderDisCategoryTable();
}

// 编辑禁用/删除分类 → 复用主列表的弹窗
function openDisEditCategory(id) {
    const cat = disCategoryList.find(c => c.id === id);
    if (!cat) return;
    editingCategoryId = id;
    document.getElementById('categoryFormTitle').textContent = '编辑分类';
    document.getElementById('categoryNameInput').value = cat.name;
    document.getElementById('saveCategoryBtn').textContent = '保存';
    // 替换保存回调为 dis 专用版本
    const saveBtn = document.getElementById('saveCategoryBtn');
    saveBtn._origHandler = saveCategoryForm;
    saveBtn.onclick = function() { saveDisCategoryForm(id); };
    openModal('categoryFormModal');
}

async function saveDisCategoryForm(id) {
    const name = document.getElementById('categoryNameInput').value.trim();
    if (!name) { showToast('请输入分类名称', 'error'); return; }
    try {
        const result = await API.category.update({ id, name });
        if (isApiOk(result)) {
            showToast('分类已更新', 'success');
            closeCategoryFormModal();
            updateDisCategoryInList(id, { name });
            // 同步更新主列表
            const mainIdx = categoryList.findIndex(c => c.id === id);
            if (mainIdx !== -1) {
                categoryList[mainIdx].name = name;
            }
        } else {
            showToast(result.message || '更新失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleDisEnable(id) {
    try {
        const result = await API.category.enable(id);
        if (isApiOk(result)) {
            showToast('分类已启用', 'success');
            removeDisCategory(id);
            loadCategories();
        } else {
            showToast(result.message || '启用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleDisDisable(id) {
    if (!confirm('确认禁用该分类？')) return;
    try {
        const result = await API.category.disable(id);
        if (isApiOk(result)) {
            showToast('分类已禁用', 'success');
            updateDisCategoryInList(id, { status: 0 });
            loadCategories();
        } else {
            showToast(result.message || '禁用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleDisRestore(id) {
    if (!confirm('确认恢复该分类？')) return;
    try {
        const result = await API.category.restore(id);
        if (isApiOk(result)) {
            showToast('分类已恢复', 'success');
            // 恢复后：deleted=0, status=0 → 已禁用未删除 → 刷新两个列表
            loadCategories();
            loadDisCategories();
        } else {
            showToast(result.message || '恢复失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

// ==================== 资讯分类（完全复制商品分类模式） ====================

let newsCategoryList = [];
let newsDisCategoryList = [];
let editingNewsCategoryId = null;

async function loadNewsCategories() {
    const container = document.getElementById('newsCategoryTableContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    try {
        const result = await API.newsCategory.list();
        if (isApiOk(result) && Array.isArray(result.data)) {
            const serverMap = new Map(result.data.map(c => [c.id, c]));
            const merged = new Map();
            for (const cat of newsCategoryList) {
                merged.set(cat.id, cat);
            }
            for (const [id, cat] of serverMap) {
                merged.set(id, { ...merged.get(id), ...cat });
            }
            newsCategoryList = [...merged.values()].sort((a, b) => (a.sort || 0) - (b.sort || 0));
            renderNewsCategoryTable();
        } else {
            container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无分类数据</p></div>';
            const countEl = document.getElementById('newsCategoryCount');
            if (countEl) countEl.textContent = '0 个分类';
        }
    } catch (error) {
        console.error('加载资讯分类失败:', error);
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
    }
}

function renderNewsCategoryTable() {
    const container = document.getElementById('newsCategoryTableContainer');
    const countEl = document.getElementById('newsCategoryCount');
    if (countEl) countEl.textContent = `${newsCategoryList.length} 个分类`;

    if (newsCategoryList.length === 0) {
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无分类，点击上方按钮新增</p></div>';
        return;
    }

    container.innerHTML = `
        <table class="category-table">
            <thead>
                <tr>
                    <th class="cat-col-drag"></th>
                    <th class="cat-col-name">分类名称</th>
                    <th class="cat-col-sort">排序</th>
                    <th class="cat-col-status">状态</th>
                    <th class="cat-col-actions">操作</th>
                </tr>
            </thead>
            <tbody>
                ${newsCategoryList.map((cat, i) => buildNewsCategoryRow(cat, i)).join('')}
            </tbody>
        </table>
    `;
}

function buildNewsCategoryRow(cat, index) {
    const st = getNewsCatStatus(cat);
    const style = cat.deleted === 1 ? ' style="opacity:.55;"' : '';
    return `<tr class="cat-row news-cat-row"${style} draggable="true" data-id="${cat.id}">
        <td class="cat-col-drag"><span class="cat-drag-handle" draggable="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
        </span></td>
        <td class="cat-col-name"><span class="cat-name-val">${escapeHtml(cat.name)}</span></td>
        <td class="cat-col-sort">
            <input type="number" class="cat-sort-input" value="${cat.sort}" min="0"
                   onchange="handleNewsSortChange(${cat.id}, this.value)"
                   onkeydown="if(event.key==='Enter')this.blur()">
        </td>
        <td class="cat-col-status"><span class="status-badge-new ${st.cls}">${st.txt}</span></td>
        <td class="cat-col-actions"><div class="cat-btn-group">${getNewsCatActions(cat, st)}</div></td>
    </tr>`;
}

function getNewsCatStatus(cat) {
    if (cat.deleted === 1) return { txt: '已删除', cls: 'logout' };
    if (cat.status === 0) return { txt: '已禁用', cls: 'disabled' };
    return { txt: '已启用', cls: 'normal' };
}

function getNewsCatActions(cat, st) {
    const id = cat.id;
    return `
        <button class="cat-btn cat-btn-text" onclick="openEditNewsCategoryModal(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            编辑
        </button>
        ${st.txt === '已启用' ? `<button class="cat-btn cat-btn-text cat-btn-warning" onclick="handleNewsDisable(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            禁用
        </button>` : `<button class="cat-btn cat-btn-text cat-btn-success" onclick="handleNewsEnable(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            启用
        </button>`}
        ${st.txt !== '已删除' ? `<button class="cat-btn cat-btn-text cat-btn-danger" onclick="handleNewsDelete(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            删除
        </button>` : `<button class="cat-btn cat-btn-text cat-btn-purple" onclick="handleNewsRestore(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            恢复
        </button>`}
    `;
}

function updateNewsCategoryInList(id, updates) {
    const idx = newsCategoryList.findIndex(c => c.id === id);
    if (idx === -1) return;
    newsCategoryList[idx] = { ...newsCategoryList[idx], ...updates };
    renderNewsCategoryTable();
}

function openAddNewsCategoryModal() {
    editingNewsCategoryId = null;
    document.getElementById('newsCategoryFormTitle').textContent = '新增分类';
    document.getElementById('newsCategoryNameInput').value = '';
    document.getElementById('saveNewsCategoryBtn').textContent = '确认';
    document.getElementById('saveNewsCategoryBtn').onclick = saveNewsCategoryForm;
    openModal('newsCategoryFormModal');
}

function openEditNewsCategoryModal(id) {
    const cat = newsCategoryList.find(c => c.id === id);
    if (!cat) return;
    editingNewsCategoryId = id;
    document.getElementById('newsCategoryFormTitle').textContent = '编辑分类';
    document.getElementById('newsCategoryNameInput').value = cat.name;
    document.getElementById('saveNewsCategoryBtn').textContent = '保存';
    document.getElementById('saveNewsCategoryBtn').onclick = saveNewsCategoryForm;
    openModal('newsCategoryFormModal');
}

function closeNewsCategoryFormModal() {
    closeModal('newsCategoryFormModal');
    editingNewsCategoryId = null;
    document.getElementById('saveNewsCategoryBtn').onclick = saveNewsCategoryForm;
}

async function saveNewsCategoryForm() {
    const name = document.getElementById('newsCategoryNameInput').value.trim();
    if (!name) { showToast('请输入分类名称', 'error'); return; }

    try {
        if (editingNewsCategoryId) {
            const result = await API.newsCategory.update({ id: editingNewsCategoryId, name });
            if (isApiOk(result)) {
                showToast('分类已更新', 'success');
                const savedId = editingNewsCategoryId;
                closeNewsCategoryFormModal();
                updateNewsCategoryInList(savedId, { name });
                loadCampusNews();
            } else {
                showToast(result.message || '更新失败', 'error');
            }
        } else {
            const result = await API.newsCategory.add({ name });
            if (isApiOk(result)) {
                showToast('分类已添加', 'success');
                closeNewsCategoryFormModal();
                loadNewsCategories();
            } else {
                showToast(result.message || '添加失败', 'error');
            }
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

// ===== Sort =====

let newsSortTimer = null;

async function handleNewsSortChange(id, value) {
    const newSort = parseInt(value);
    if (isNaN(newSort) || newSort < 0) return;
    if (newsSortTimer) clearTimeout(newsSortTimer);
    newsSortTimer = setTimeout(async () => {
        try {
            await API.newsCategory.sort(id, newSort);
            showToast('排序已更新', 'success');
            updateNewsCategoryInList(id, { sort: newSort });
            loadCampusNews();
        } catch (error) {
            showToast('排序更新失败', 'error');
        }
    }, 400);
}

// ===== Actions =====

async function handleNewsEnable(id) {
    const cat = newsCategoryList.find(c => c.id === id);
    if (!cat) return;
    if (cat.deleted === 1) {
        showToast('该分类已删除，无法启用', 'error');
        return;
    }
    try {
        const result = await API.newsCategory.enable(id);
        if (isApiOk(result)) {
            showToast('分类已启用', 'success');
            updateNewsCategoryInList(id, { status: 1 });
            loadNewsDisCategories();
        } else {
            showToast(result.message || '启用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleNewsDisable(id) {
    if (!confirm('确认禁用该分类？')) return;
    try {
        const result = await API.newsCategory.disable(id);
        if (isApiOk(result)) {
            showToast('分类已禁用', 'success');
            newsCategoryList = newsCategoryList.filter(c => c.id !== id);
            renderNewsCategoryTable();
            loadNewsDisCategories();
        } else {
            showToast(result.message || '禁用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleNewsDelete(id) {
    let hasNews = false;
    try {
        const countRes = await API.newsCategory.newsCount(id);
        hasNews = isApiOk(countRes) && countRes.data > 0;
    } catch (e) { }

    if (hasNews) {
        if (!confirm('该分类已关联资讯，是否改为禁用操作？')) return;
    } else {
        if (!confirm('确认删除该分类？')) return;
    }

    try {
        const result = await API.newsCategory.deleteCategory(id);
        if (isApiOk(result)) {
            showToast('分类已删除', 'success');
            newsCategoryList = newsCategoryList.filter(c => c.id !== id);
            renderNewsCategoryTable();
            loadNewsDisCategories();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleNewsRestore(id) {
    if (!confirm('确认恢复该分类？')) return;
    try {
        const result = await API.newsCategory.restore(id);
        if (isApiOk(result)) {
            showToast('分类已恢复', 'success');
            updateNewsCategoryInList(id, { deleted: 0 });
            loadNewsDisCategories();
        } else {
            showToast(result.message || '恢复失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

// ==================== 已禁用/删除资讯分类管理 ====================

async function loadNewsDisCategories() {
    const container = document.getElementById('newsDisCategoryTableContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    try {
        const result = await API.newsCategory.listDis();
        if (isApiOk(result) && Array.isArray(result.data)) {
            newsDisCategoryList = result.data.sort((a, b) => (a.sort || 0) - (b.sort || 0));
            renderNewsDisCategoryTable();
        } else {
            container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无数据</p></div>';
            const countEl = document.getElementById('newsDisCategoryCount');
            if (countEl) countEl.textContent = '0 个分类';
        }
    } catch (error) {
        console.error('加载禁用/删除资讯分类失败:', error);
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">❌</span><p class="empty-text">加载失败</p></div>';
    }
}

function renderNewsDisCategoryTable() {
    const container = document.getElementById('newsDisCategoryTableContainer');
    const countEl = document.getElementById('newsDisCategoryCount');
    if (countEl) countEl.textContent = `${newsDisCategoryList.length} 个分类`;

    if (newsDisCategoryList.length === 0) {
        container.innerHTML = '<div class="empty-state-new"><span class="empty-icon">📂</span><p class="empty-text">暂无禁用或删除的分类</p></div>';
        return;
    }

    container.innerHTML = `
        <table class="category-table">
            <thead>
                <tr>
                    <th class="dis-cat-col-spacer"></th>
                    <th class="dis-cat-col-name">分类名称</th>
                    <th class="dis-cat-col-sort">排序</th>
                    <th class="dis-cat-col-status">状态</th>
                    <th class="dis-cat-col-actions">操作</th>
                </tr>
            </thead>
            <tbody>
                ${newsDisCategoryList.map(cat => buildNewsDisCategoryRow(cat)).join('')}
            </tbody>
        </table>
    `;
}

function buildNewsDisCategoryRow(cat) {
    const st = getNewsCatStatus(cat);
    return `<tr class="cat-row">
        <td class="dis-cat-col-spacer"><span class="cat-drag-handle" style="cursor:default;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
        </span></td>
        <td class="dis-cat-col-name"><span class="cat-name-val">${escapeHtml(cat.name)}</span></td>
        <td class="dis-cat-col-sort"><span class="cat-sort-text">${cat.sort}</span></td>
        <td class="dis-cat-col-status"><span class="status-badge-new ${st.cls}">${st.txt}</span></td>
        <td class="dis-cat-col-actions"><div class="cat-btn-group">${getNewsDisCatActions(cat, st)}</div></td>
    </tr>`;
}

function getNewsDisCatActions(cat, st) {
    const id = cat.id;
    const html = [];

    html.push(`<button class="cat-btn cat-btn-text" onclick="openNewsDisEditCategory(${id})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        编辑
    </button>`);

    if (cat.deleted !== 1) {
        if (cat.status === 0) {
            html.push(`<button class="cat-btn cat-btn-text cat-btn-success" onclick="handleNewsDisEnable(${id})">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                启用
            </button>`);
        } else {
            html.push(`<button class="cat-btn cat-btn-text cat-btn-warning" onclick="handleNewsDisDisable(${id})">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                禁用
            </button>`);
        }
    }

    if (cat.deleted === 1) {
        html.push(`<button class="cat-btn cat-btn-text cat-btn-purple" onclick="handleNewsDisRestore(${id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            恢复
        </button>`);
    }

    return html.join('');
}

function updateNewsDisCategoryInList(id, updates) {
    const idx = newsDisCategoryList.findIndex(c => c.id === id);
    if (idx === -1) return;
    newsDisCategoryList[idx] = { ...newsDisCategoryList[idx], ...updates };
    renderNewsDisCategoryTable();
}

function removeNewsDisCategory(id) {
    newsDisCategoryList = newsDisCategoryList.filter(c => c.id !== id);
    renderNewsDisCategoryTable();
}

function openNewsDisEditCategory(id) {
    const cat = newsDisCategoryList.find(c => c.id === id);
    if (!cat) return;
    editingNewsCategoryId = id;
    document.getElementById('newsCategoryFormTitle').textContent = '编辑分类';
    document.getElementById('newsCategoryNameInput').value = cat.name;
    document.getElementById('saveNewsCategoryBtn').textContent = '保存';
    const saveBtn = document.getElementById('saveNewsCategoryBtn');
    saveBtn.onclick = function() { saveNewsDisCategoryForm(id); };
    openModal('newsCategoryFormModal');
}

async function saveNewsDisCategoryForm(id) {
    const name = document.getElementById('newsCategoryNameInput').value.trim();
    if (!name) { showToast('请输入分类名称', 'error'); return; }
    try {
        const result = await API.newsCategory.update({ id, name });
        if (isApiOk(result)) {
            showToast('分类已更新', 'success');
            closeNewsCategoryFormModal();
            updateNewsDisCategoryInList(id, { name });
            const mainIdx = newsCategoryList.findIndex(c => c.id === id);
            if (mainIdx !== -1) {
                newsCategoryList[mainIdx].name = name;
            }
            loadCampusNews();
        } else {
            showToast(result.message || '更新失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleNewsDisEnable(id) {
    try {
        const result = await API.newsCategory.enable(id);
        if (isApiOk(result)) {
            showToast('分类已启用', 'success');
            removeNewsDisCategory(id);
            loadNewsCategories();
        } else {
            showToast(result.message || '启用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleNewsDisDisable(id) {
    if (!confirm('确认禁用该分类？')) return;
    try {
        const result = await API.newsCategory.disable(id);
        if (isApiOk(result)) {
            showToast('分类已禁用', 'success');
            updateNewsDisCategoryInList(id, { status: 0 });
            loadNewsCategories();
        } else {
            showToast(result.message || '禁用失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleNewsDisRestore(id) {
    if (!confirm('确认恢复该分类？')) return;
    try {
        const result = await API.newsCategory.restore(id);
        if (isApiOk(result)) {
            showToast('分类已恢复', 'success');
            loadNewsCategories();
            loadNewsDisCategories();
        } else {
            showToast(result.message || '恢复失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

// ==================== 校园公告管理 ====================

// ==================== 校园资讯管理 ====================

let cnList = [];
let cnPageNum = 1;
const cnPageSize = 20;
let cnTotal = 0;
let cnLoading = false;
let cnHasMore = true;
let cnSelectedId = null;
let cnEditingId = null;

async function loadCampusNews() {
    cnList = [];
    cnPageNum = 1;
    cnHasMore = true;
    cnSelectedId = null;
    cnEditingId = null;
    var kwInput = document.getElementById('cnKeywordInput');
    if (kwInput) kwInput.value = '';
    // 延迟再清一次，对抗浏览器自动填充
    setTimeout(function() {
        var inp = document.getElementById('cnKeywordInput');
        if (inp) inp.value = '';
    }, 100);
    await cnLoadCategoryOptions();
    await cnLoadNews();
}

async function cnLoadCategoryOptions() {
    try {
        const res = await API.newsCategory.list();
        if (isApiOk(res) && Array.isArray(res.data)) {
            const opts = [{ value: '', text: '所有分类' }, ...res.data.map(c => ({ value: c.id, text: c.name }))];
            const sel = document.getElementById('cnCategoryFilter');
            const formSel = document.getElementById('cnFormCategory');
            if (sel) {
                sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
            }
            if (formSel) {
                formSel.innerHTML = [{ value: '', text: '请选择分类' }, ...res.data.map(c => ({ value: c.id, text: c.name }))]
                    .map(o => `<option value="${o.value}">${o.text}</option>`).join('');
            }
        }
    } catch (e) {
        console.error('加载分类选项失败', e);
    }
}

async function cnLoadNews(append = false) {
    if (cnLoading) return;
    if (!cnHasMore && append) return;
    cnLoading = true;

    const loadingEl = document.getElementById('cnLoading');
    const emptyEl = document.getElementById('cnEmpty');
    if (loadingEl) loadingEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';

    const categoryId = document.getElementById('cnCategoryFilter')?.value || '';
    const keyword = document.getElementById('cnKeywordInput')?.value?.trim() || '';
    const status = document.getElementById('cnStatusFilter')?.value || '';
    const isDeleted = document.getElementById('cnDeletedFilter')?.value || '';

    const params = { page: cnPageNum, size: cnPageSize };
    if (categoryId) params.categoryId = categoryId;
    if (keyword) params.keyword = keyword;
    if (status !== '') params.status = parseInt(status);
    if (isDeleted !== '') params.deleted = parseInt(isDeleted);

    try {
        const result = await API.campusNews.page(params);
        if (isApiOk(result) && result.data) {
            const records = result.data.records || [];
            cnTotal = result.data.total || 0;
            if (append) {
                cnList = cnList.concat(records);
            } else {
                cnList = records;
            }
            cnHasMore = cnList.length < cnTotal;
            cnPageNum++;
            cnRenderList();
            cnUpdateActions();
            if (cnList.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
            }
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
    } catch (e) {
        console.error('加载校园资讯失败', e);
        if (emptyEl) emptyEl.style.display = 'block';
    } finally {
        cnLoading = false;
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function cnSearch() {
    cnList = [];
    cnPageNum = 1;
    cnHasMore = true;
    cnSelectedId = null;
    cnEditingId = null;
    cnUpdatePreview();
    cnUpdateActions();
    cnLoadNews(false);
}

function cnRenderList() {
    const container = document.getElementById('cnList');
    if (!container) return;
    container.innerHTML = cnList.map(item => {
        const isSelected = item.id === cnSelectedId;
        const thumb = item.coverImage
            ? `<img class="cn-list-thumb" src="${item.coverImage}" alt="" onerror="this.style.display='none'">`
            : `<div class="cn-list-thumb-placeholder">📄</div>`;
        const statusHtml = item.deleted === 1
            ? '<span class="status-badge-new logout">已删除</span>'
            : item.status === 1
                ? '<span class="status-badge-new normal">已启用</span>'
                : '<span class="status-badge-new disabled">已禁用</span>';
        return `<div class="cn-list-item${isSelected ? ' selected' : ''}" data-id="${item.id}" onclick="cnSelectNews(${item.id})">
            ${thumb}
            <div class="cn-list-body">
                <div class="cn-list-title">${escapeHtml(item.title || '')}</div>
                <div class="cn-list-meta">
                    ${item.categoryName ? `<span class="cn-list-category">${escapeHtml(item.categoryName)}</span>` : ''}
                    <span class="cn-list-publisher">
                        ${escapeHtml(item.publisherName || '')}
                        ${item.publisherUserName ? `<span style="color:#94a3b8;">@${escapeHtml(item.publisherUserName)}</span><button class="cn-copy-btn" title="复制用户名" onclick="event.stopPropagation();cnCopyUsername('${escapeHtml(item.publisherUserName)}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>` : ''}
                    </span>
                    ${statusHtml}
                    <span class="cn-list-time">${formatDate(item.createTime)}</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

function cnSelectNews(id) {
    cnSelectedId = id;
    cnEditingId = id;
    cnRenderList();
    cnUpdatePreview();
    cnUpdateActions();
}

function cnUpdatePreview() {
    const placeholder = document.getElementById('cnPreviewPlaceholder');
    const content = document.getElementById('cnPreviewContent');
    const img = document.getElementById('cnPreviewImage');
    const pathSpan = document.getElementById('cnPreviewPath');
    if (!placeholder || !content) return;

    const item = cnList.find(n => n.id === cnSelectedId);
    if (!item) {
        placeholder.style.display = 'block';
        content.style.display = 'none';
        return;
    }

    placeholder.style.display = 'none';
    content.style.display = 'flex';
    if (img) {
        if (item.coverImage) {
            img.src = item.coverImage;
            img.style.display = 'block';
        } else {
            img.src = '';
            img.style.display = 'none';
        }
    }
    if (pathSpan) pathSpan.textContent = item.coverImage || '无封面图片';
}

function cnUpdateActions() {
    const item = cnList.find(n => n.id === cnSelectedId);
    const editBtn = document.getElementById('cnEditBtn');
    const deleteBtn = document.getElementById('cnDeleteBtn');
    const restoreBtn = document.getElementById('cnRestoreBtn');
    const enableBtn = document.getElementById('cnEnableBtn');
    const disableBtn = document.getElementById('cnDisableBtn');

    if (!item) {
        if (editBtn) { editBtn.style.display = 'none'; editBtn.disabled = true; }
        if (deleteBtn) { deleteBtn.style.display = 'none'; deleteBtn.disabled = true; }
        if (restoreBtn) { restoreBtn.style.display = 'none'; restoreBtn.disabled = true; }
        if (enableBtn) { enableBtn.style.display = 'none'; enableBtn.disabled = true; }
        if (disableBtn) { disableBtn.style.display = 'none'; disableBtn.disabled = true; }
        return;
    }

    if (editBtn) { editBtn.style.display = ''; editBtn.disabled = item.deleted === 1; }

    // 已删除：显示恢复 + 根据状态显示启用或禁用
    if (item.deleted === 1) {
        if (deleteBtn) { deleteBtn.style.display = 'none'; deleteBtn.disabled = true; }
        if (restoreBtn) { restoreBtn.style.display = ''; restoreBtn.disabled = false; }
        if (enableBtn) { enableBtn.style.display = item.status === 1 ? 'none' : ''; enableBtn.disabled = item.status === 1; }
        if (disableBtn) { disableBtn.style.display = item.status === 0 ? 'none' : ''; disableBtn.disabled = item.status === 0; }
    } else if (item.status === 1) {
        if (deleteBtn) { deleteBtn.style.display = ''; deleteBtn.disabled = false; }
        if (restoreBtn) { restoreBtn.style.display = 'none'; restoreBtn.disabled = true; }
        if (enableBtn) { enableBtn.style.display = 'none'; enableBtn.disabled = true; }
        if (disableBtn) { disableBtn.style.display = ''; disableBtn.disabled = false; }
    } else {
        // 未删除 + 已禁用 → 显示 启用、删除
        if (deleteBtn) { deleteBtn.style.display = ''; deleteBtn.disabled = false; }
        if (restoreBtn) { restoreBtn.style.display = 'none'; restoreBtn.disabled = true; }
        if (enableBtn) { enableBtn.style.display = ''; enableBtn.disabled = false; }
        if (disableBtn) { disableBtn.style.display = 'none'; disableBtn.disabled = true; }
    }
}

function cnCopyUsername(username) {
    navigator.clipboard.writeText(username).then(() => {
        showToast('用户名已复制', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

function cnCopyPath() {
    const path = document.getElementById('cnPreviewPath')?.textContent || '';
    if (path && path !== '无封面图片') {
        navigator.clipboard.writeText(path).then(() => {
            showToast('路径已复制', 'success');
        }).catch(() => {
            showToast('复制失败', 'error');
        });
    }
}

// ===== Upload & Crop =====

let cnCropper = null;
let cnCroppedFileUrl = null;

function cnOpenFilePicker() {
    document.getElementById('cnFileInput').click();
}

// 文件选择后打开裁剪弹窗
document.addEventListener('change', function(e) {
    if (e.target.id !== 'cnFileInput') return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        document.getElementById('cnCropImage').src = ev.target.result;
        openModal('cnCropModal');
        setTimeout(function() {
            if (cnCropper) cnCropper.destroy();
            const image = document.getElementById('cnCropImage');
            cnCropper = new Cropper(image, {
                aspectRatio: 3 / 4,
                viewMode: 1,
                autoCropArea: 1,
                dragMode: 'move'
            });
        }, 300);
    };
    reader.readAsDataURL(file);
});

async function cnConfirmCrop() {
    if (!cnCropper) return;
    const canvas = cnCropper.getCroppedCanvas({ width: 600, height: 800 });
    canvas.toBlob(async function(blob) {
        const formData = new FormData();
        formData.append('file', blob, 'cover_' + Date.now() + '.jpg');
        try {
            const result = await API.common.upload(formData);
            if (isApiOk(result) && result.data) {
                cnCroppedFileUrl = result.data;
                // 显示预览
                const preview = document.getElementById('cnCoverPreview');
                preview.innerHTML = '<div class="cn-cover-preview-inner">' +
                    '<img src="' + cnCroppedFileUrl + '" class="cn-cover-thumb">' +
                    '<button class="cat-btn cat-btn-text" onclick="cnOpenFilePicker()" style="margin-top:6px;font-size:12px;">重新选择</button>' +
                    '</div>';
                preview.style.display = '';
                document.getElementById('cnCoverUploadArea').style.display = 'none';
                cnDestroyCropper();
                closeModal('cnCropModal');
            } else {
                showToast(result.message || '上传失败', 'error');
            }
        } catch (e) {
            showToast('上传失败: ' + (e.message || ''), 'error');
        }
    }, 'image/jpeg', 0.9);
}

function cnCancelCrop() {
    cnDestroyCropper();
    closeModal('cnCropModal');
    document.getElementById('cnFileInput').value = '';
}

function cnDestroyCropper() {
    if (cnCropper) {
        cnCropper.destroy();
        cnCropper = null;
    }
}

function cnResetCoverUpload() {
    cnCroppedFileUrl = null;
    document.getElementById('cnFileInput').value = '';
    const preview = document.getElementById('cnCoverPreview');
    preview.innerHTML = '';
    preview.style.display = 'none';
    document.getElementById('cnCoverUploadArea').style.display = '';
}

// ===== Modal =====

function cnOpenPublishModal() {
    cnEditingId = null;
    document.getElementById('cnFormTitle').textContent = '发布资讯';
    document.getElementById('cnFormTitleInput').value = '';
    document.getElementById('cnFormCategory').value = '';
    document.getElementById('cnFormContent').value = '';
    document.getElementById('cnFormPublisher').value = '';
    document.getElementById('cnFormSubmitBtn').textContent = '发布';
    cnResetCoverUpload();
    openModal('cnFormModal');
}

function cnOpenEditModal() {
    const item = cnList.find(n => n.id === cnSelectedId);
    if (!item || item.deleted === 1) return;
    cnEditingId = item.id;
    document.getElementById('cnFormTitle').textContent = '编辑资讯';
    document.getElementById('cnFormTitleInput').value = item.title || '';
    document.getElementById('cnFormCategory').value = item.categoryId || '';
    document.getElementById('cnFormContent').value = item.content || '';
    document.getElementById('cnFormPublisher').value = item.publisherName || '';
    document.getElementById('cnFormSubmitBtn').textContent = '保存';
    // 重置上传状态，如果已有封面则显示
    cnResetCoverUpload();
    if (item.coverImage) {
        cnCroppedFileUrl = item.coverImage;
        const preview = document.getElementById('cnCoverPreview');
        preview.innerHTML = '<div class="cn-cover-preview-inner">' +
            '<img src="' + item.coverImage + '" class="cn-cover-thumb">' +
            '<button class="cat-btn cat-btn-text" onclick="cnOpenFilePicker()" style="margin-top:6px;font-size:12px;">重新选择</button>' +
            '</div>';
        preview.style.display = '';
        document.getElementById('cnCoverUploadArea').style.display = 'none';
    }
    openModal('cnFormModal');
}

function cnCloseFormModal() {
    closeModal('cnFormModal');
    cnEditingId = null;
}

async function cnSubmitForm() {
    const title = document.getElementById('cnFormTitleInput').value.trim();
    const categoryId = document.getElementById('cnFormCategory').value;
    const coverImage = cnCroppedFileUrl;
    const content = document.getElementById('cnFormContent').value.trim();

    if (!title) { showToast('请输入标题', 'error'); return; }
    if (!categoryId) { showToast('请选择分类', 'error'); return; }
    if (!coverImage) { showToast('请上传封面图片', 'error'); return; }
    if (!content) { showToast('请输入内容', 'error'); return; }

    const publisherName = document.getElementById('cnFormPublisher').value.trim();
    if (!publisherName) { showToast('请输入发布者名称', 'error'); return; }

    const data = { title, categoryId: parseInt(categoryId), content, coverImage, publisherName };

    try {
        let result;
        if (cnEditingId) {
            result = await API.campusNews.update(cnEditingId, data);
            if (isApiOk(result)) {
                showToast('资讯已更新', 'success');
                cnCloseFormModal();
                cnRefreshAfterAction();
            } else {
                showToast(result.message || '更新失败', 'error');
            }
        } else {
            result = await API.campusNews.publish(data);
            if (isApiOk(result)) {
                showToast('资讯已发布', 'success');
                cnCloseFormModal();
                cnRefreshAfterAction();
            } else {
                showToast(result.message || '发布失败', 'error');
            }
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

// ===== Actions =====

async function cnDelete() {
    const item = cnList.find(n => n.id === cnSelectedId);
    if (!item || item.deleted === 1) return;
    if (!confirm('确认删除该资讯？')) return;
    try {
        const result = await API.campusNews.deleteNews(item.id);
        if (isApiOk(result)) {
            showToast('资讯已删除', 'success');
            cnRefreshAfterAction();
        } else {
            showToast(result.message || '删除失败', 'error');
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

async function cnRestore() {
    const item = cnList.find(n => n.id === cnSelectedId);
    if (!item || item.deleted !== 1) return;
    if (!confirm('确认恢复该资讯？')) return;
    try {
        const result = await API.campusNews.restore(item.id);
        if (isApiOk(result)) {
            showToast('资讯已恢复', 'success');
            cnRefreshAfterAction();
        } else {
            showToast(result.message || '恢复失败', 'error');
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

async function cnEnable() {
    const item = cnList.find(n => n.id === cnSelectedId);
    if (!item || item.status === 1) return;
    try {
        const result = await API.campusNews.enable(item.id);
        if (isApiOk(result)) {
            showToast('资讯已启用', 'success');
            cnRefreshAfterAction();
        } else {
            showToast(result.message || '启用失败', 'error');
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

async function cnDisable() {
    const item = cnList.find(n => n.id === cnSelectedId);
    if (!item || item.status === 0) return;
    if (!confirm('确认禁用该资讯？')) return;
    try {
        const result = await API.campusNews.disable(item.id);
        if (isApiOk(result)) {
            showToast('资讯已禁用', 'success');
            cnRefreshAfterAction();
        } else {
            showToast(result.message || '禁用失败', 'error');
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

function cnRefreshAfterAction() {
    cnList = [];
    cnPageNum = 1;
    cnHasMore = true;
    cnSelectedId = null;
    cnEditingId = null;
    cnLoadNews(false);
    cnUpdatePreview();
    cnUpdateActions();
}

let cnSearchTimer = null;
function cnDebounceSearch() {
    if (cnSearchTimer) clearTimeout(cnSearchTimer);
    cnSearchTimer = setTimeout(function() {
        cnSearch();
    }, 400);
}

// ===== Infinite scroll =====
document.addEventListener('scroll', e => {
    const wrap = e.target.closest('#cnListWrap');
    if (!wrap) return;
    if (cnLoading || !cnHasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = wrap;
    if (scrollTop + clientHeight >= scrollHeight - 60) {
        cnLoadNews(true);
    }
}, { passive: true });

// ==================== 平台动态管理 ====================
let pnList = [];
let pnPageNum = 1;
const pnPageSize = 10;
let pnTotal = 0;
let pnLoading = false;
let pnEditId = null;
let pnSelectedType = 1; // 1=公告 2=动态

async function loadPlatformNews() {
    pnList = [];
    pnPageNum = 1;
    pnTotal = 0;
    pnEditId = null;
    pnSelectedType = 1;
    pnSelectType(1);
    await pnLoadData();
}

function pnSearch() {
    pnList = [];
    pnPageNum = 1;
    pnTotal = 0;
    pnLoadData();
}

async function pnLoadData() {
    if (pnLoading) return;
    pnLoading = true;

    var loadingEl = document.getElementById('pnLoading');
    var emptyEl = document.getElementById('pnEmpty');
    if (loadingEl) loadingEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';

    var type = document.getElementById('pnTypeFilter')?.value || '';
    var deleted = document.getElementById('pnDeletedFilter')?.value || '';

    var params = { pageNum: pnPageNum, pageSize: pnPageSize };
    if (type !== '') params.type = parseInt(type);
    if (deleted !== '') params.deleted = parseInt(deleted);

    try {
        var result = await API.announcement.adminPage(params);
        if (isApiOk(result) && result.data) {
            var records = result.data.records || [];
            pnTotal = result.data.total || 0;
            pnList = records;
            pnRenderList();
            pnRenderPagination();
            if (pnList.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
            }
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
    } catch (e) {
        console.error('加载平台动态失败', e);
        if (emptyEl) emptyEl.style.display = 'block';
    } finally {
        pnLoading = false;
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function pnRenderList() {
    var container = document.getElementById('pnList');
    if (!container) return;

    if (pnList.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = pnList.map(function(item) {
        var typeLabel = item.type === 1 ? '平台公告' : '平台动态';
        var typeCls = item.type === 1 ? 'pn-type-notice' : 'pn-type-dynamic';
        var deletedLabel = item.deleted === 1 ? '已删除' : '正常';
        var deletedCls = item.deleted === 1 ? 'pn-status-deleted' : 'pn-status-normal';
        var updateTime = item.updateTime ? formatDate(item.updateTime) : '';
        var content = escapeHtml(item.content || '');
        var publisher = escapeHtml(item.publisher || '');
        var publisherUsername = escapeHtml(item.publisherUserName || '');

        var actions = '';
        if (item.deleted === 1) {
            actions = '<button class="btn-action cn-act-btn" onclick="pnRestore(' + item.id + ')">恢复</button>';
        } else {
            actions = '<button class="btn-action cn-act-btn" onclick="pnOpenEditModal(' + item.id + ')">编辑</button>' +
                      '<button class="btn-action danger cn-act-btn" onclick="pnDelete(' + item.id + ')">删除</button>';
        }

        return '<div class="pn-card">' +
            '<div class="pn-card-body">' +
                '<div class="pn-card-content">' + content + '</div>' +
                '<div class="pn-card-meta">' +
                    '<div class="pn-card-row">' +
                        '<span class="pn-card-label">发布者：</span>' +
                        '<span class="pn-card-value">' + publisher + '</span>' +
                    '</div>' +
                    '<div class="pn-card-row">' +
                        '<span class="pn-card-label">用户名：</span>' +
                        '<span class="pn-card-value">' + publisherUsername + '</span>' +
                        '<button class="pn-copy-btn" onclick="pnCopyUsername(\'' + publisherUsername.replace(/'/g, "\\'") + '\')" title="复制用户名">' +
                            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="pn-card-footer">' +
                '<span class="pn-tag ' + typeCls + '">' + typeLabel + '</span>' +
                '<span class="pn-tag ' + deletedCls + '">' + deletedLabel + '</span>' +
                '<span class="pn-card-time">' + updateTime + '</span>' +
                '<div class="pn-card-actions">' + actions + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

function pnRenderPagination() {
    var container = document.getElementById('pnPagination');
    if (!container) return;
    var totalPages = Math.ceil(pnTotal / pnPageSize) || 1;
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    var html = '<div class="pn-page-list">';
    for (var i = 1; i <= totalPages; i++) {
        html += '<span class="pn-page-item' + (i === pnPageNum ? ' active' : '') + '" onclick="pnGoPage(' + i + ')">' + i + '</span>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function pnGoPage(page) {
    if (page === pnPageNum || pnLoading) return;
    pnPageNum = page;
    pnList = [];
    pnLoadData();
}

function pnOpenPublishModal() {
    pnEditId = null;
    pnSelectedType = 1;
    document.getElementById('pnFormTitle').textContent = '发布公告';
    document.getElementById('pnFormPublisher').value = '';
    document.getElementById('pnFormContent').value = '';
    document.getElementById('pnFormSubmitBtn').textContent = '发布';
    pnSelectType(1);
    openModal('pnFormModal');
}

function pnCloseFormModal() {
    closeModal('pnFormModal');
}

function pnOpenEditModal(id) {
    var item = pnList.find(function(n) { return n.id === id; });
    if (!item) return;
    pnEditId = id;
    pnSelectedType = item.type || 1;
    document.getElementById('pnFormTitle').textContent = '编辑公告';
    document.getElementById('pnFormPublisher').value = item.publisher || '';
    document.getElementById('pnFormContent').value = item.content || '';
    document.getElementById('pnFormSubmitBtn').textContent = '保存';
    pnSelectType(pnSelectedType);
    openModal('pnFormModal');
}

function pnSelectType(type) {
    pnSelectedType = type;
    var dot1 = document.getElementById('pnRadioDot1');
    var dot2 = document.getElementById('pnRadioDot2');
    var label1 = document.getElementById('pnRadioNotice');
    var label2 = document.getElementById('pnRadioDynamic');
    if (dot1 && dot2 && label1 && label2) {
        if (type === 1) {
            dot1.classList.add('active');
            dot2.classList.remove('active');
            label1.classList.add('active');
            label2.classList.remove('active');
        } else {
            dot1.classList.remove('active');
            dot2.classList.add('active');
            label1.classList.remove('active');
            label2.classList.add('active');
        }
    }
}

async function pnSubmitForm() {
    var publisher = document.getElementById('pnFormPublisher').value.trim();
    var content = document.getElementById('pnFormContent').value.trim();

    if (!publisher) { showToast('请输入发布者', 'error'); return; }
    if (!content) { showToast('请输入公告内容', 'error'); return; }

    var data = { publisher: publisher, content: content, type: pnSelectedType };
    var btn = document.getElementById('pnFormSubmitBtn');
    if (btn) btn.disabled = true;

    try {
        var result;
        if (pnEditId) {
            result = await API.announcement.update(pnEditId, data);
            if (isApiOk(result)) {
                showToast('编辑成功', 'success');
                pnCloseFormModal();
                pnSearch();
            } else {
                showToast(result.message || '编辑失败', 'error');
            }
        } else {
            result = await API.announcement.publish(data);
            if (isApiOk(result)) {
                showToast('发布成功', 'success');
                pnCloseFormModal();
                pnSearch();
            } else {
                showToast(result.message || '发布失败', 'error');
            }
        }
    } catch (e) {
        showToast('操作失败', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function pnDelete(id) {
    if (!confirm('确认删除该记录？')) return;
    try {
        var result = await API.announcement.delete(id);
        if (isApiOk(result)) {
            showToast('已删除', 'success');
            pnSearch();
        } else {
            showToast(result.message || '删除失败', 'error');
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

async function pnRestore(id) {
    if (!confirm('确认恢复该记录？')) return;
    try {
        var result = await API.announcement.restore(id);
        if (isApiOk(result)) {
            showToast('已恢复', 'success');
            pnSearch();
        } else {
            showToast(result.message || '恢复失败', 'error');
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

function pnCopyUsername(username) {
    navigator.clipboard.writeText(username).then(function() {
        showToast('复制成功', 'success');
    }).catch(function() {
        showToast('复制失败', 'error');
    });
}

/**
 * 关闭 WebSocket 连接（退出登录时调用）
 */
function closeWebSocket() {
    isManualClose = true;  // 标记为手动关闭

    // 清除重连定时器
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    // 关闭 WebSocket
    if (websocket) {
        try {
            websocket.close(1000, '用户主动关闭');  // 正常关闭码
        } catch (e) {
            console.warn('⚠️ 关闭 WebSocket 时出错:', e);
        }
        websocket = null;
    }

    console.log('✅ WebSocket 已关闭');
}

function initProductSearch() {
    document.getElementById('quickSearchResult').innerHTML = '<div class="empty-state">输入商品ID开始查询</div>';
}

async function quickSearchProduct() {
    const idInput = document.getElementById('quickSearchInput');
    const productId = parseInt(idInput.value);
    const resultArea = document.getElementById('quickSearchResult');

    if (!productId || productId <= 0) {
        resultArea.innerHTML = '<div class="empty-state">请输入有效的商品ID</div>';
        return;
    }

    resultArea.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>搜索中...</span></div>';

    try {
        const result = await API.admin.quickSearch(productId);
        if (isApiOk(result) && result.data) {
            const g = result.data;
            const statusText = g.auditStatus === 1 ? '已通过' : g.auditStatus === -1 ? '待人工审核' : g.auditStatus === -2 ? '待申诉' : g.auditStatus === -3 ? '系统拦截' : g.auditStatus === -4 ? '人工拦截' : '待系统审核';
            const shelfText = g.shelfStatus === 1 ? '已上架' : '已下架';
            const imgHtml = g.firstImage
                ? `<img src="${g.firstImage}" alt="商品图" style="width:80px;height:80px;object-fit:cover;border-radius:8px;">`
                : `<div style="width:80px;height:80px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;">暂无图</div>`;

            resultArea.innerHTML = `
                <div style="padding:20px;">
                    <div class="search-result-card" onclick="showProductDetailFromSearch(${g.goodsId})" style="display:flex;gap:20px;padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;cursor:pointer;transition:all 0.2s;max-width:520px;" onmouseover="this.style.borderColor='#3b82f6';this.style.boxShadow='0 4px 12px rgba(59,130,246,0.15)'" onmouseout="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
                        ${imgHtml}
                        <div style="flex:1;display:flex;flex-direction:column;gap:6px;justify-content:center;">
                            <div style="font-size:16px;font-weight:600;color:#1e293b;">${escapeHtml(g.goodsName)}</div>
                            <div style="font-size:18px;font-weight:700;color:#dc2626;">¥${g.price}</div>
                            <div style="display:flex;gap:12px;font-size:12px;color:#64748b;">
                                <span>ID: ${g.goodsId}</span>
                                <span>${statusText}</span>
                                <span>${shelfText}</span>
                            </div>
                            <div style="display:flex;gap:12px;margin-top:2px;">
                                <span style="font-size:12px;color:#3b82f6;cursor:pointer;" onclick="event.stopPropagation();showProductDetailFromSearch(${g.goodsId})">点击查看详情 →</span>
                                ${g.auditStatus === 1 ? `<span style="font-size:12px;color:#dc2626;cursor:pointer;" onclick="event.stopPropagation();quickDisableFromSearch(${g.goodsId})">禁用</span>` : '<span style="font-size:12px;color:#94a3b8;">已禁用</span>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            resultArea.innerHTML = '<div class="empty-state">未找到该商品</div>';
        }
    } catch (error) {
        resultArea.innerHTML = '<div class="empty-state">搜索失败</div>';
    }
}

function showProductDetailFromSearch(goodsId) {
    document.getElementById('productDetailModal').querySelector('.modal-header-new h3').textContent = `商品详情 (ID: ${goodsId})`;
    openModal('productDetailModal');
    const body = document.getElementById('productDetailBody');
    body.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    API.goods.detail(goodsId).then(result => {
        if (isApiOk(result) && result.data) {
            const g = result.data;
            const imagesHtml = (g.imageUrls && g.imageUrls.length)
                ? g.imageUrls.map(url => `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="window.open('${url}','_blank')">`).join('')
                : '<span style="color:#94a3b8;">暂无图片</span>';

            body.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px;">
                    <div style="color:#64748b;">商品ID</div><div style="font-weight:500;">${g.goodsId}</div>
                    <div style="color:#64748b;">商品名称</div><div style="font-weight:500;">${escapeHtml(g.goodsName)}</div>
                    <div style="color:#64748b;">价格</div><div style="font-weight:700;color:#dc2626;">¥${g.price}</div>
                    <div style="color:#64748b;">库存</div><div>${g.stock}</div>
                    <div style="color:#64748b;">审核状态</div><div>${g.auditStatus === 1 ? '已通过' : g.auditStatus === -1 ? '待人工审核' : g.auditStatus === -2 ? '待申诉' : g.auditStatus === -3 ? '系统拦截' : g.auditStatus === -4 ? '人工拦截' : '待系统审核'}</div>
                    <div style="color:#64748b;">上架状态</div><div>${g.shelfStatus === 1 ? '已上架' : '已下架'}</div>
                    <div style="color:#64748b;">发布时间</div><div>${g.createTime ? formatTime(g.createTime) : '-'}</div>
                    <div style="color:#64748b;">卖家</div><div>${escapeHtml(g.username || '')}</div>
                    <div style="color:#64748b;align-self:start;">描述</div><div style="color:#475569;line-height:1.6;">${escapeHtml(g.description || '无')}</div>
                    <div style="color:#64748b;align-self:start;grid-column:1/-1;margin-top:8px;">商品图片</div>
                    <div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;">${imagesHtml}</div>
                </div>
            `;
        } else {
            body.innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }).catch(() => {
        body.innerHTML = '<div class="empty-state">加载失败</div>';
    });
}

async function quickDisableFromSearch(goodsId) {
    if (!confirm('确认禁用该商品？（将重置为待系统审核+高风险）')) return;
    try {
        const result = await API.admin.quickDisable(goodsId);
        if (isApiOk(result)) {
            showToast('已禁用', 'success');
            quickSearchProduct();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

// ==================== 查看申诉内容 ====================
function showAppealContent(btn) {
    const content = btn.getAttribute('data-content');
    document.getElementById('appealContentDisplay').textContent = content || '无申诉内容';
    openModal('appealContentModal');
}

// ==================== 全屏图片查看器 ====================
let viewerData = null;

function openImageViewer(goodsId, startIndex) {
    const products = [...manualReviewProducts, ...appealReviewProducts];
    const product = products.find(p => p.goodsId === goodsId);
    if (!product) return;
    const images = getReviewImages(product);
    if (images.length === 0) return;

    const idx = Math.max(0, Math.min(startIndex || 0, images.length - 1));
    viewerData = {
        goodsId,
        images,
        currentIndex: idx,
        scale: 1,
        translateX: 0,
        translateY: 0
    };

    const overlay = document.getElementById('imgViewerOverlay');
    const img = document.getElementById('imgViewerImage');
    const counter = document.getElementById('imgViewerCounter');
    const prevBtn = document.getElementById('imgViewerPrev');
    const nextBtn = document.getElementById('imgViewerNext');

    img.src = images[idx];
    img.style.transform = 'scale(1) translate(0, 0)';
    counter.textContent = `${idx + 1}/${images.length}`;

    if (prevBtn) prevBtn.style.display = images.length > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = images.length > 1 ? '' : 'none';

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImageViewer() {
    const overlay = document.getElementById('imgViewerOverlay');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    viewerData = null;
}

function navigateImgViewer(direction) {
    if (!viewerData || viewerData.images.length < 2) return;
    const total = viewerData.images.length;
    viewerData.currentIndex = (viewerData.currentIndex + direction + total) % total;
    viewerData.scale = 1;
    viewerData.translateX = 0;
    viewerData.translateY = 0;

    const img = document.getElementById('imgViewerImage');
    const counter = document.getElementById('imgViewerCounter');

    img.src = viewerData.images[viewerData.currentIndex];
    img.style.transform = 'scale(1) translate(0, 0)';
    counter.textContent = `${viewerData.currentIndex + 1}/${total}`;
}

function zoomImgViewer(delta) {
    if (!viewerData) return;
    viewerData.scale = Math.max(0.5, Math.min(5, viewerData.scale + delta));
    const img = document.getElementById('imgViewerImage');
    img.style.transform = `scale(${viewerData.scale}) translate(${viewerData.translateX}px, ${viewerData.translateY}px)`;
}

function resetImgViewerZoom() {
    if (!viewerData) return;
    viewerData.scale = 1;
    viewerData.translateX = 0;
    viewerData.translateY = 0;
    const img = document.getElementById('imgViewerImage');
    img.style.transform = 'scale(1) translate(0, 0)';
}

// 拖拽与键盘控制
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

document.addEventListener('DOMContentLoaded', function() {
    const img = document.getElementById('imgViewerImage');
    if (!img) return;

    img.addEventListener('mousedown', function(e) {
        if (!viewerData || viewerData.scale <= 1) return;
        isDragging = true;
        dragStartX = e.clientX - (viewerData.translateX || 0);
        dragStartY = e.clientY - (viewerData.translateY || 0);
        img.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging || !viewerData) return;
        viewerData.translateX = e.clientX - dragStartX;
        viewerData.translateY = e.clientY - dragStartY;
        img.style.transform = `scale(${viewerData.scale}) translate(${viewerData.translateX}px, ${viewerData.translateY}px)`;
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
        if (img) img.style.cursor = 'grab';
    });

    document.addEventListener('keydown', function(e) {
        const overlay = document.getElementById('imgViewerOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;
        if (e.key === 'Escape') closeImageViewer();
        if (e.key === 'ArrowLeft') navigateImgViewer(-1);
        if (e.key === 'ArrowRight') navigateImgViewer(1);
    });
});

// ===== 敏感词管理 =====
let sensitiveWordsList = []
let pendingDeleteWord = ''

async function loadSensitiveWords() {
    const tbody = document.getElementById('swBody');
    const countEl = document.getElementById('swCount');
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state-td">加载中...</td></tr>';
    try {
        const result = await API.admin.getSensitiveWords();
        sensitiveWordsList = isApiOk(result) && Array.isArray(result.data) ? result.data : [];
        if (sensitiveWordsList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="empty-state-td">暂无敏感词</td></tr>';
        } else {
            tbody.innerHTML = sensitiveWordsList.map((word, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(word)}</td>
                    <td><button class="sw-delete-btn" onclick="deleteSensitiveWord('${escapeHtml(word)}')">删除</button></td>
                </tr>
            `).join('');
        }
        countEl.textContent = `共 ${sensitiveWordsList.length} 个词`;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state-td">加载失败</td></tr>';
    }
}

async function addSensitiveWord() {
    const input = document.getElementById('swInput');
    const addBtn = document.getElementById('swAddBtn');
    const word = input.value.trim();
    if (!word) {
        showToast('请输入敏感词', 'error');
        return;
    }
    // 重复检测
    if (sensitiveWordsList.includes(word)) {
        showToast('该敏感词已存在', 'error');
        return;
    }
    addBtn.disabled = true;
    addBtn.textContent = '添加中...';
    input.disabled = true;
    try {
        const result = await API.admin.addSensitiveWord(word);
        if (isApiOk(result)) {
            showToast('添加成功', 'success');
            input.value = '';
            await loadSensitiveWords();
        } else if (result.msg && result.msg.includes('已存在')) {
            showToast('该敏感词已存在', 'error');
        } else {
            showToast(result.msg || '添加失败', 'error');
        }
    } catch (e) {
        showToast('添加失败', 'error');
    } finally {
        addBtn.disabled = false;
        addBtn.textContent = '添加';
        input.disabled = false;
        input.focus();
    }
}

function deleteSensitiveWord(word) {
    pendingDeleteWord = word;
    openModal('swDeleteModal');
}

async function confirmDeleteSensitiveWord() {
    const word = pendingDeleteWord;
    if (!word) return;
    const confirmBtn = document.getElementById('swDeleteConfirmBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '删除中...';
    try {
        const result = await API.admin.removeSensitiveWord(word);
        if (isApiOk(result)) {
            showToast('删除成功', 'success');
            closeModal('swDeleteModal');
            pendingDeleteWord = '';
            await loadSensitiveWords();
        } else {
            showToast(result.msg || '删除失败', 'error');
        }
    } catch (e) {
        showToast('删除失败', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确定删除';
    }
}

async function reloadSensitiveWords() {
    const reloadBtn = document.getElementById('swReloadBtn');
    reloadBtn.disabled = true;
    reloadBtn.textContent = '重载中...';
    try {
        const result = await API.admin.reloadSensitiveWords();
        if (isApiOk(result)) {
            showToast('重载成功', 'success');
            await loadSensitiveWords();
        } else {
            showToast(result.msg || '重载失败', 'error');
        }
    } catch (e) {
        showToast('重载失败', 'error');
    } finally {
        reloadBtn.disabled = false;
        reloadBtn.textContent = '从文件重载';
    }
}

// ========== AI知识库管理 ==========
var _knowledgeFiles = [];
var _uploading = false;

// ===== 加载文档列表 =====
function loadKnowledgeDocuments() {
    var container = document.getElementById('knowledgeTable');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';

    var keyword = ((document.getElementById('knowledgeSearchInput') || {}).value || '').trim();
    var typeFilter = ((document.getElementById('knowledgeTypeFilter') || {}).value || '').toLowerCase();

    fetch(API_BASE_URL + '/admin/knowledge/list', {
        headers: getAuthHeaders()
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code !== 0) {
            container.innerHTML = '<div class="empty-state" style="padding:60px 0;text-align:center;color:#999;"><p>加载失败</p></div>';
            return;
        }
        var list = res.data || [];
        // 搜索过滤
        if (keyword) {
            var kw = keyword.toLowerCase();
            list = list.filter(function(d) { return (d.fileName || '').toLowerCase().indexOf(kw) !== -1; });
        }
        // 文件类型筛选
        if (typeFilter) {
            list = list.filter(function(d) { return (d.fileName || '').toLowerCase().endsWith(typeFilter); });
        }
        // 更新统计（带动画）
        updateKnowledgeStats(list, true);
        // 渲染表格
        if (list.length === 0) {
            container.innerHTML = '<div class="knowledge-empty">' +
                '<div class="ke-icon">📄</div>' +
                '<p class="ke-title">知识库为空</p>' +
                '<p class="ke-desc">上传文档到知识库，AI 客服将基于文档内容提供更精准的回答</p>' +
                '<button class="btn-primary-new" onclick="openKnowledgeUpload()">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                '上传文件</button></div>';
            return;
        }
        var html = '<table class="simple-table"><thead><tr>' +
            '<th style="width:34%;">文件名</th>' +
            '<th style="width:12%;">大小</th>' +
            '<th style="width:10%;">分块</th>' +
            '<th style="width:14%;">上传者</th>' +
            '<th style="width:16%;">上传时间</th>' +
            '<th style="width:14%;">操作</th>' +
            '</tr></thead><tbody>';
        list.forEach(function(doc) {
            var icon = getFileIcon(doc.fileName);
            html += '<tr>' +
                '<td><div class="kf-name-cell"><span class="kf-file-icon">' + icon + '</span><span class="kf-file-name">' + escapeHtml(doc.fileName) + '</span></div></td>' +
                '<td class="kf-cell-muted">' + (doc.fileSizeDisplay || formatFileSize(doc.fileSize)) + '</td>' +
                '<td><span class="kf-chunk-badge">' + (doc.chunkCount || 0) + '</span></td>' +
                '<td class="kf-cell-muted">' + escapeHtml(doc.operator || '-') + '</td>' +
                '<td class="kf-cell-muted">' + formatDateTime(doc.createTime) + '</td>' +
                '<td class="kf-actions">' +
                    '<button class="kf-preview-btn" onclick="previewKnowledgeDoc(' + doc.id + ')">预览</button>' +
                    '<button class="kf-delete-btn" onclick="deleteKnowledgeDoc(' + doc.id + ')">删除</button>' +
                '</td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    })
    .catch(function() {
        container.innerHTML = '<div class="empty-state" style="padding:60px 0;text-align:center;color:#999;">网络异常，请检查连接</div>';
    });
}

function getFileIcon(name) {
    if (!name) return '📄';
    var n = name.toLowerCase();
    if (n.endsWith('.pdf')) return '📕';
    if (n.endsWith('.docx') || n.endsWith('.doc')) return '📘';
    if (n.endsWith('.md')) return '📝';
    return '📄';
}

// ===== 统计 + 数字滚动动画 =====
function updateKnowledgeStats(list, animate) {
    var totalDocs = list.length;
    var totalChunks = 0;
    var totalBytes = 0;
    list.forEach(function(d) {
        totalChunks += d.chunkCount || 0;
        totalBytes += d.fileSize || 0;
    });
    var sizeStr = formatFileSize(totalBytes);

    if (animate) {
        animateNumber('ksTotalDocs', totalDocs);
        animateNumber('ksTotalChunks', totalChunks);
        animateSize('ksTotalSize', sizeStr, totalBytes);
    } else {
        document.getElementById('ksTotalDocs').textContent = totalDocs;
        document.getElementById('ksTotalChunks').textContent = totalChunks;
        document.getElementById('ksTotalSize').textContent = sizeStr;
    }
    // 向量索引状态
    var statusEl = document.getElementById('ksIndexStatus');
    if (statusEl) {
        if (totalDocs === 0) {
            statusEl.innerHTML = '<span class="ks-status-badge empty">○ 空知识库</span>';
        } else {
            statusEl.innerHTML = '<span class="ks-status-badge active">● 已索引</span>';
        }
    }
}

function animateNumber(elId, target) {
    var el = document.getElementById(elId);
    if (!el) return;
    var current = parseInt(el.textContent) || 0;
    if (current === target) return;
    var duration = 800;
    var startTime = null;
    function step(ts) {
        if (!startTime) startTime = ts;
        var progress = Math.min((ts - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var value = Math.round(current + (target - current) * eased);
        el.textContent = value;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function animateSize(elId, targetStr, targetBytes) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = targetStr;
}

// ===== 时间/大小格式化 =====
function formatDateTime(t) {
    if (!t) return '-';
    if (t.length >= 16) return t.substring(0, 16);
    return t;
}

function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '-';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// ===== 上传文件 =====
function initKnowledgeDragDrop() {
    var dz = document.getElementById('knowledgeDropzone');
    if (!dz || dz._dragInit) return;
    dz._dragInit = true;
    dz.addEventListener('click', function() { document.getElementById('knowledgeFileInput').click(); });
    dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', function(e) { e.preventDefault(); dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', function(e) {
        e.preventDefault();
        dz.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            document.getElementById('knowledgeFileInput').files = e.dataTransfer.files;
            onKnowledgeFilesSelected(document.getElementById('knowledgeFileInput'));
        }
    });
}

function openKnowledgeUpload() {
    _knowledgeFiles = [];
    _uploading = false;
    document.getElementById('knowledgeFileQueue').style.display = 'none';
    document.getElementById('knowledgeFileQueue').innerHTML = '';
    document.getElementById('knowledgeUploadProgress').style.display = 'none';
    document.getElementById('uploadProgressFill').style.width = '0%';
    document.getElementById('knowledgeDropzone').style.display = 'flex';
    document.getElementById('knowledgeUploadBtn').disabled = true;
    document.getElementById('knowledgeUploadBtn').textContent = '上传（0 个文件）';
    document.getElementById('knowledgeUploadCancel').textContent = '取消';
    document.getElementById('knowledgeFileInput').value = '';
    initKnowledgeDragDrop();
    openModal('knowledgeUploadModal');
}

function closeKnowledgeUpload() {
    if (_uploading) return;
    closeModal('knowledgeUploadModal');
}

function onKnowledgeFilesSelected(input) {
    var files = input.files;
    if (!files || files.length === 0) return;
    var validFiles = [];
    var allowedExts = ['.txt', '.pdf', '.docx', '.md'];
    var maxSize = 10 * 1024 * 1024;
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var ext = (f.name.substring(f.name.lastIndexOf('.')) || '').toLowerCase();
        if (allowedExts.indexOf(ext) === -1) {
            showToast('不支持的文件格式：' + f.name, 'error');
            continue;
        }
        if (f.size > maxSize) {
            showToast('文件超过 10MB：' + f.name, 'error');
            continue;
        }
        if (f.size === 0) {
            showToast('空文件：' + f.name, 'error');
            continue;
        }
        validFiles.push(f);
    }
    if (validFiles.length === 0) {
        input.value = '';
        return;
    }
    _knowledgeFiles = validFiles;
    renderFileQueue();
    document.getElementById('knowledgeDropzone').style.display = 'none';
    document.getElementById('knowledgeFileQueue').style.display = 'block';
    document.getElementById('knowledgeUploadBtn').disabled = false;
    document.getElementById('knowledgeUploadBtn').textContent = '上传（' + validFiles.length + ' 个文件）';
}

function renderFileQueue() {
    var queue = document.getElementById('knowledgeFileQueue');
    queue.innerHTML = '';
    _knowledgeFiles.forEach(function(f, idx) {
        var ext = (f.name.substring(f.name.lastIndexOf('.')) || '').toLowerCase();
        var iconMap = { '.txt': '📄', '.pdf': '📕', '.docx': '📘', '.md': '📝' };
        var icon = iconMap[ext] || '📄';
        var item = document.createElement('div');
        item.className = 'upload-file-item';
        item.id = 'uploadFileItem_' + idx;
        item.innerHTML = '' +
            '<span class="upload-file-item-icon">' + icon + '</span>' +
            '<span class="upload-file-item-name">' + escapeHtml(f.name) + '</span>' +
            '<span class="upload-file-item-size">' + formatFileSize(f.size) + '</span>' +
            '<span class="upload-file-item-status" id="uploadFileStatus_' + idx + '"></span>' +
            '<button class="upload-file-item-remove" id="uploadFileRemove_' + idx + '" onclick="removeUploadFile(' + idx + ')">×</button>';
        queue.appendChild(item);
    });
}

function removeUploadFile(idx) {
    if (_uploading) return;
    _knowledgeFiles.splice(idx, 1);
    if (_knowledgeFiles.length === 0) {
        document.getElementById('knowledgeFileQueue').style.display = 'none';
        document.getElementById('knowledgeDropzone').style.display = 'flex';
        document.getElementById('knowledgeUploadBtn').disabled = true;
        document.getElementById('knowledgeUploadBtn').textContent = '上传（0 个文件）';
    } else {
        renderFileQueue();
        document.getElementById('knowledgeUploadBtn').textContent = '上传（' + _knowledgeFiles.length + ' 个文件）';
    }
}

function confirmKnowledgeUpload() {
    if (_uploading || _knowledgeFiles.length === 0) return;
    _uploading = true;

    document.getElementById('knowledgeUploadBtn').disabled = true;
    document.getElementById('knowledgeUploadBtn').textContent = '上传中...';
    document.getElementById('knowledgeUploadCancel').textContent = '取消（上传中）';
    document.getElementById('knowledgeUploadProgress').style.display = 'block';
    document.getElementById('uploadProgressFill').style.width = '0%';

    var total = _knowledgeFiles.length;
    var completed = 0;
    var failed = 0;

    function uploadNext(idx) {
        if (idx >= total) {
            _uploading = false;
            document.getElementById('knowledgeUploadCancel').textContent = '取消';
            var msg = '上传完成：成功 ' + completed + ' 个';
            if (failed > 0) msg += '，失败 ' + failed + ' 个';
            document.getElementById('uploadProgressText').textContent = msg;
            document.getElementById('knowledgeUploadBtn').textContent = '完成';
            setTimeout(function() {
                closeModal('knowledgeUploadModal');
                loadKnowledgeDocuments();
            }, 1200);
            return;
        }

        var file = _knowledgeFiles[idx];
        var statusEl = document.getElementById('uploadFileStatus_' + idx);
        var removeEl = document.getElementById('uploadFileRemove_' + idx);
        if (statusEl) { statusEl.textContent = '上传中...'; statusEl.className = 'upload-file-item-status uploading'; }
        if (removeEl) removeEl.style.display = 'none';

        var percent = Math.round((idx / total) * 100);
        document.getElementById('uploadProgressFill').style.width = percent + '%';
        document.getElementById('uploadProgressText').textContent = '正在上传 (' + (idx + 1) + '/' + total + ')：' + file.name;

        var formData = new FormData();
        formData.append('file', file);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE_URL + '/admin/knowledge/upload', true);
        xhr.setRequestHeader('Authorization', getAuthHeaders()['Authorization']);

        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                var filePct = Math.round((e.loaded / e.total) * 100);
                var overallPct = Math.round(((idx + e.loaded / e.total) / total) * 100);
                document.getElementById('uploadProgressFill').style.width = overallPct + '%';
                if (statusEl) statusEl.textContent = filePct + '%';
            }
        };

        xhr.onload = function() {
            try {
                var res = JSON.parse(xhr.responseText);
                if (res.code === 0) {
                    completed++;
                    if (statusEl) { statusEl.textContent = '✓ 成功'; statusEl.className = 'upload-file-item-status success'; }
                } else {
                    failed++;
                    if (statusEl) { statusEl.textContent = '✗ 失败'; statusEl.className = 'upload-file-item-status error'; }
                }
            } catch(e) {
                failed++;
                if (statusEl) { statusEl.textContent = '✗ 失败'; statusEl.className = 'upload-file-item-status error'; }
            }
            var pct = Math.round(((idx + 1) / total) * 100);
            document.getElementById('uploadProgressFill').style.width = pct + '%';
            document.getElementById('uploadProgressText').textContent = '已完成 ' + (idx + 1) + '/' + total;
            uploadNext(idx + 1);
        };

        xhr.onerror = function() {
            failed++;
            if (statusEl) { statusEl.textContent = '✗ 失败'; statusEl.className = 'upload-file-item-status error'; }
            uploadNext(idx + 1);
        };

        xhr.send(formData);
    }

    uploadNext(0);
}

// ===== 预览 =====
function previewKnowledgeDoc(id) {
    var body = document.getElementById('knowledgePreviewBody');
    body.innerHTML = '<div class="preview-loading"><div class="spinner"></div><span>加载中...</span></div>';
    openModal('knowledgePreviewModal');

    fetch(API_BASE_URL + '/admin/knowledge/list', {
        headers: getAuthHeaders()
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code !== 0) { body.innerHTML = '<div class="preview-error">加载失败</div>'; return; }
        var list = res.data || [];
        var doc = null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { doc = list[i]; break; }
        }
        if (!doc) { body.innerHTML = '<div class="preview-error">文档不存在</div>'; return; }

        var icon = getFileIcon(doc.fileName);
        var ext = doc.fileName ? (doc.fileName.substring(doc.fileName.lastIndexOf('.')) || '').toUpperCase() : '-';
        body.innerHTML = '' +
            '<div class="preview-header">' +
                '<span class="preview-icon">' + icon + '</span>' +
                '<div class="preview-title">' + escapeHtml(doc.fileName) + '</div>' +
            '</div>' +
            '<div class="preview-divider"></div>' +
            '<div class="preview-grid">' +
                '<div class="preview-row"><span class="preview-label">文件类型</span><span class="preview-value">' + ext + '</span></div>' +
                '<div class="preview-row"><span class="preview-label">文件大小</span><span class="preview-value">' + (doc.fileSizeDisplay || formatFileSize(doc.fileSize)) + '</span></div>' +
                '<div class="preview-row"><span class="preview-label">向量分块数</span><span class="preview-value">' + (doc.chunkCount || 0) + '</span></div>' +
                '<div class="preview-row"><span class="preview-label">MD5</span><span class="preview-value" style="font-family:monospace;font-size:12px;">' + escapeHtml(doc.md5 || '-') + '</span></div>' +
                '<div class="preview-row"><span class="preview-label">上传者</span><span class="preview-value">' + escapeHtml(doc.operator || '-') + '</span></div>' +
                '<div class="preview-row"><span class="preview-label">上传时间</span><span class="preview-value">' + formatDateTime(doc.createTime) + '</span></div>' +
                '<div class="preview-row"><span class="preview-label">文档状态</span><span class="preview-value" style="color:#16a34a;">● 已索引</span></div>' +
            '</div>';
    })
    .catch(function() {
        body.innerHTML = '<div class="preview-error">网络异常</div>';
    });
}

// ===== 删除单个文档 =====
function deleteKnowledgeDoc(id) {
    var modal = document.getElementById('confirmModal');
    document.getElementById('confirmModalTitle').textContent = '删除文档';
    document.getElementById('confirmModalBody').innerHTML = '确定要删除该文档吗？<br><span style="color:#999;font-size:13px;">删除后AI将无法检索该文档内容</span>';
    document.getElementById('confirmModalCancel').onclick = function() { closeModal('confirmModal'); };
    document.getElementById('confirmModalConfirm').onclick = function() {
        closeModal('confirmModal');
        doDeleteKnowledgeDoc(id);
    };
    openModal('confirmModal');
}

function doDeleteKnowledgeDoc(id) {
    fetch(API_BASE_URL + '/admin/knowledge/delete/' + id, {
        method: 'DELETE',
        headers: getAuthHeaders()
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            showToast('删除成功', 'success');
        } else {
            showToast(res.message || '删除失败', 'error');
        }
        loadKnowledgeDocuments();
    })
    .catch(function() {
        showToast('删除失败，网络异常', 'error');
        loadKnowledgeDocuments();
    });
}

// ===== 清空知识库 =====
function clearAllKnowledgeDocs() {
    var modal = document.getElementById('confirmModal');
    document.getElementById('confirmModalTitle').textContent = '清空知识库';
    document.getElementById('confirmModalBody').innerHTML = '确定要清空所有知识库文档吗？<br><span style="color:#dc2626;font-size:13px;font-weight:500;">此操作不可恢复！</span><br><span style="color:#999;font-size:13px;">所有向量数据将被永久删除</span>';
    document.getElementById('confirmModalCancel').onclick = function() { closeModal('confirmModal'); };
    document.getElementById('confirmModalConfirm').onclick = function() {
        closeModal('confirmModal');
        doClearAllKnowledgeDocs();
    };
    openModal('confirmModal');
}

function doClearAllKnowledgeDocs() {
    var container = document.getElementById('knowledgeTable');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>清空中...</span></div>';

    fetch(API_BASE_URL + '/admin/knowledge/list', {
        headers: getAuthHeaders()
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code !== 0) { showToast('获取列表失败', 'error'); loadKnowledgeDocuments(); return; }
        var list = res.data || [];
        if (list.length === 0) { showToast('知识库已为空', 'success'); loadKnowledgeDocuments(); return; }

        var ids = list.map(function(d) { return d.id; });
        var total = ids.length;
        var completed = 0;

        function deleteNext(idx) {
            if (idx >= total) {
                showToast('清空完成，共删除 ' + total + ' 个文档', 'success');
                loadKnowledgeDocuments();
                return;
            }
            fetch(API_BASE_URL + '/admin/knowledge/delete/' + ids[idx], {
                method: 'DELETE',
                headers: getAuthHeaders()
            })
            .then(function(r) { return r.json(); })
            .then(function(res2) {
                completed++;
                container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>清空中... ' + completed + '/' + total + '</span></div>';
                deleteNext(idx + 1);
            })
            .catch(function() {
                completed++;
                deleteNext(idx + 1);
            });
        }
        deleteNext(0);
    })
    .catch(function() {
        showToast('清空失败', 'error');
        loadKnowledgeDocuments();
    });
}

// ========== 用户意见反馈（下滑加载更多） ==========
var feedbackCurrentPage = 1;
var feedbackPageSize = 20;
var feedbackLoading = false;
var feedbackNoMore = false;

function getFeedbackCategoryText(cat) {
    var map = { 0: '功能建议', 1: 'Bug报告', 2: '投诉举报', 3: '其他' };
    return map[cat] || '未知';
}

function renderFeedbackCard(f) {
    var imagesHtml = '';
    if (f.images) {
        var urls = f.images.split(',');
        urls.forEach(function(url) {
            imagesHtml += '<img src="' + url.trim() + '" class="feedback-card-thumb" onclick="window.open(\'' + url.trim() + '\',\'_blank\')">';
        });
    }

    return '<div class="feedback-card">' +
        '<div class="feedback-card-head">' +
            '<div class="feedback-card-user">' +
                '<div class="feedback-card-avatar">' + f.userId + '</div>' +
                '<span class="feedback-card-name">用户 #' + f.userId + '</span>' +
            '</div>' +
            '<span class="status-badge status-badge--info">' + getFeedbackCategoryText(f.category) + '</span>' +
        '</div>' +
        '<div class="feedback-card-body">' +
            '<div class="feedback-card-content">' + escapeHtml(f.content) + '</div>' +
            (imagesHtml ? '<div class="feedback-card-imgs">' + imagesHtml + '</div>' : '') +
        '</div>' +
        '<div class="feedback-card-foot">' +
            '<span class="feedback-card-time">' + formatTime(f.createTime) + '</span>' +
            (f.contact ? '<span class="feedback-card-contact">📞 ' + escapeHtml(f.contact) + '</span>' : '') +
            '<button class="cat-btn cat-btn-text" onclick="processFeedback(' + f.id + ', this)" style="margin-left:auto;">已处理</button>' +
        '</div>' +
    '</div>';
}

function processFeedback(id, btn) {
    if (!confirm('确认将该反馈标记为已处理？')) return;
    btn.disabled = true;
    btn.textContent = '处理中...';
    fetch(API_BASE_URL + '/admin/users/feedback/process/' + id, { method: 'PUT', headers: getAuthHeaders() })
        .then(function(res) { return res.json(); })
        .then(function(res) {
            if (res.code === 1) {
                loadFeedbacks(true);
                showToast('已标记为已处理', 'success');
            } else {
                showToast(res.message || '操作失败', 'error');
                btn.disabled = false;
                btn.textContent = '已处理';
            }
        })
        .catch(function() {
            showToast('网络异常', 'error');
            btn.disabled = false;
            btn.textContent = '已处理';
        });
}

function loadFeedbacks(reset) {
    if (reset) {
        feedbackCurrentPage = 1;
        feedbackNoMore = false;
        var container = document.getElementById('feedbacksContainer');
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';
        document.getElementById('feedbackLoader').style.display = 'none';
        document.getElementById('feedbackEnd').style.display = 'none';
    }

    if (feedbackLoading || feedbackNoMore) return;
    feedbackLoading = true;

    fetch(API_BASE_URL + '/admin/users/feedback/list?page=' + feedbackCurrentPage + '&size=' + feedbackPageSize, {
        headers: getAuthHeaders()
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        feedbackLoading = false;

        if (isApiOk(res) && res.data) {
            var data = res.data;
            document.getElementById('feedbackCount').textContent = '共 ' + data.total + ' 条';

            if (!data.records || data.records.length === 0) {
                if (reset) {
                    document.getElementById('feedbacksContainer').innerHTML = '<div class="empty-state" style="padding:60px 0;text-align:center;color:#999;">暂无反馈数据</div>';
                }
                document.getElementById('feedbackLoader').style.display = 'none';
                document.getElementById('feedbackEnd').style.display = 'block';
                feedbackNoMore = true;
                return;
            }

            var container = document.getElementById('feedbacksContainer');
            if (reset) {
                container.innerHTML = '';
                document.getElementById('feedbackEnd').style.display = 'none';
            }

            data.records.forEach(function(f) {
                container.insertAdjacentHTML('beforeend', renderFeedbackCard(f));
            });

            feedbackCurrentPage++;

            // 判断是否已全部加载
            var loadedCount = container.querySelectorAll('.feedback-card').length;
            if (loadedCount >= data.total) {
                document.getElementById('feedbackLoader').style.display = 'none';
                document.getElementById('feedbackEnd').style.display = 'block';
                feedbackNoMore = true;
            } else {
                document.getElementById('feedbackLoader').style.display = 'flex';
                document.getElementById('feedbackEnd').style.display = 'none';
            }
        } else {
            if (reset) {
                document.getElementById('feedbacksContainer').innerHTML = '<div class="empty-state" style="padding:60px 0;text-align:center;color:#999;">' + (res.message || '加载失败') + '</div>';
            }
            feedbackLoading = false;
        }
    })
    .catch(function() {
        feedbackLoading = false;
        if (reset) {
            document.getElementById('feedbacksContainer').innerHTML = '<div class="empty-state" style="padding:60px 0;text-align:center;color:#999;">网络异常</div>';
        }
    });
}

// 下滑加载更多
function initFeedbackScroll() {
    var ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                var loader = document.getElementById('feedbackLoader');
                if (!loader || loader.style.display === 'none') {
                    ticking = false;
                    return;
                }
                var rect = loader.getBoundingClientRect();
                if (rect.top < window.innerHeight + 100) {
                    loadFeedbacks(false);
                }
                ticking = false;
            });
            ticking = true;
        }
    });
}

