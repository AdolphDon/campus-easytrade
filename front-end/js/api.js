const API_BASE_URL = 'http://120.27.216.138';

/** 后端 Result 成功为 code=0，code=200 */
function isApiOk(result) {
    return result && (result.code === 0 || result.code === 200);
}

// 判断是否为管理员页面
function isAdminPage() {
    return window.location.pathname.includes('admin.html');
}

// 获取当前页面的 token key（统一使用 sessionStorage）
function getTokenKey() {
    return 'auth_token';
}

// 获取当前页面的 userInfo key（统一使用 sessionStorage）
function getUserInfoKey() {
    return 'auth_userInfo';
}

// 获取当前 token（从 sessionStorage 读取）
function getCurrentToken() {
    return sessionStorage.getItem(getTokenKey());
}

// 获取当前 userInfo（从 sessionStorage 读取）
function getCurrentUserInfo() {
    return sessionStorage.getItem(getUserInfoKey());
}

const API = {
    auth: {
        async login(username, password) {
            return request('/user/user/login', { method: 'POST', body: { username, password } });
        },
        async register(userData) {
            return request('/user/user/register', { method: 'POST', body: userData });
        },
        async sendCode(email, type = 1) {
            return request('/user/user/send-code', { method: 'POST', body: { email, type } });
        },
        async getUserInfo() {
            return request('/user/user/info');
        },
        async getUserInfoById(userId) {
            return request(`/user/user/info/${userId}`);
        },
        async updateUserInfo(userId, userData) {
            return request('/user/user/update', { method: 'PUT', body: userData });
        },
        async getCreditLogList(params = {}) {
            return request('/user/user/credit-log', { params });
        },
        async updatePassword(data) {
            return request('/user/user/update-password', { method: 'PUT', body: data });
        },
        async verifyChangePwdCode(data) {
            return request('/user/user/verify-change-pwd-code', { method: 'POST', body: data });
        },
        async forgotPassword(data) {
            return request('/user/user/forgot-password', { method: 'PUT', body: data });
        }
    },

    goods: {
        async getOrderStats() {
            return request('/user/goods/order-stats');
        },
        async list(params = {}) {
            return request('/user/goods/list', { params });
        },
        async detail(goodsId) {
            return request(`/user/goods/detail/${goodsId}`);
        },
        async editDetail(goodsId) {
            return request(`/user/goods/edit-detail/${goodsId}`);
        },
        async batchDetail(goodsIds) {
            return request('/user/goods/batch-detail', { method: 'POST', body: goodsIds });
        },
        async collect(goodsId) {
            return request(`/user/goods/collect/${goodsId}`, { method: 'POST' });
        },
        async getCollectStatus(goodsId) {
            return request(`/user/goods/collect/status/${goodsId}`);
        },
        async publish(data) {
            return request('/user/goods/publish', { method: 'POST', body: data });
        },
        async sellerList(params = {}) {
            return request('/user/goods/seller/list', { params });
        },
        async myGoods(params = {}) {
            return request('/user/goods/seller/my-goods', { params });
        },
        async goodsByTab(params = {}) {
            return request('/user/goods/seller/goods-by-tab', { params });
        },
        async userGoods(params = {}) {
            return request('/user/goods/seller/user-goods', { params });
        },
        async salerGoods(userId, params = {}) {
            return request(`/user/goods/commom-goods/${userId}`, { params });
        },
        async update(goodsId, data) {
            return request(`/user/goods/update/${goodsId}`, { method: 'PUT', body: data });
        },
        async offShelf(goodsId) {
            return request(`/user/goods/offShelf/${goodsId}`, { method: 'PUT' });
        },
        async onShelf(goodsId) {
            return request(`/user/goods/onShelf/${goodsId}`, { method: 'PUT' });
        },
        async deleteGoods(ids) {
            return request('/user/goods/delete', { method: 'DELETE', body: ids });
        },
        async appealDetail(goodsId) {
            return request(`/user/goods/appeal-detail/${goodsId}`);
        },
        async blockConfirm(goodsId) {
            return request(`/user/goods/block-confirm/${goodsId}`, { method: 'PUT' });
        },
        async submitAppeal(goodsId, data) {
            return request(`/user/goods/submit/${goodsId}`, { method: 'POST', body: data });
        },
        async interceptDetail(goodsId) {
            return request(`/user/goods/intercept-detail/${goodsId}`);
        }
    },

    category: {
        async list() {
            return request('/user/category/list');
        },
        async sort(id, newSort) {
            return request('/user/category/sort', { method: 'PUT', params: { id, newSort } });
        },
        async update(data) {
            return request('/user/category/update', { method: 'PUT', body: data });
        },
        async add(data) {
            return request('/user/category/add', { method: 'POST', body: data });
        },
        async deleteCategory(id) {
            return request(`/user/category/delete/${id}`, { method: 'PUT' });
        },
        async goodsCount(categoryId) {
            return request(`/user/category/${categoryId}/goods-count`);
        },
        async enable(id) {
            return request(`/user/category/enable/${id}`, { method: 'PUT' });
        },
        async disable(id) {
            return request(`/user/category/disable/${id}`, { method: 'PUT' });
        },
        async restore(id) {
            return request(`/user/category/restore/${id}`, { method: 'PUT' });
        },
        async listDis() {
            return request('/user/category/list/dis');
        }
    },

    newsCategory: {
        async list() {
            return request('/user/category/news-list');
        },
        async listDis() {
            return request('/user/category/news-list/dis');
        },
        async sort(id, newSort) {
            return request('/user/category/news-sort', { method: 'PUT', params: { id, newSort } });
        },
        async update(data) {
            return request('/user/category/news-update', { method: 'PUT', body: data });
        },
        async add(data) {
            return request('/user/category/news-add', { method: 'POST', body: data });
        },
        async deleteCategory(id) {
            return request(`/user/category/news-delete/${id}`, { method: 'PUT' });
        },
        async enable(id) {
            return request(`/user/category/news-enable/${id}`, { method: 'PUT' });
        },
        async disable(id) {
            return request(`/user/category/news-disable/${id}`, { method: 'PUT' });
        },
        async restore(id) {
            return request(`/user/category/news-restore/${id}`, { method: 'PUT' });
        },
        async newsCount(categoryId) {
            return request(`/user/category/${categoryId}/news-count`);
        }
    },

    common: {
        async upload(formData) {
            const token = getCurrentToken();
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            const response = await fetch(`${API_BASE_URL}/user/common/upload`, {
                method: 'POST',
                headers,
                body: formData
            });
            
            return await response.json();
        }
    },

    announcement: {
        async list() {
            return request('/api/users/announcements');
        },
        async userNoticePage(params) {
            return request('/user/announcement/notice/page', { params });
        },
        async userDynamicPage(params) {
            return request('/user/announcement/dynamic/page', { params });
        },
        async adminPage(params) {
            return request('/user/announcement/admin/page', { params });
        },
        async publish(data) {
            return request('/user/announcement/publish', { method: 'POST', body: data });
        },
        async update(id, data) {
            return request('/user/announcement/update/' + id, { method: 'PUT', body: data });
        },
        async delete(id) {
            return request('/user/announcement/delete/' + id, { method: 'PUT' });
        },
        async restore(id) {
            return request('/user/announcement/restore/' + id, { method: 'PUT' });
        }
    },

    task: {
        async list(params = {}) {
            return request('/task/tasks/list', { params });
        },
        async publish(taskData) {
            return request('/task/tasks/publish', { method: 'POST', body: taskData });
        },
        detail(id) {
            return request(`/task/tasks/${id}`);
        },
        accept(id) {
            return request(`/task/tasks/${id}/accept`, { method: 'POST' });
        },
        complete(id) {
            return request(`/task/tasks/${id}/complete`, { method: 'POST' });
        },
        cancel(id) {
            return request(`/task/tasks/${id}/cancel`, { method: 'POST' });
        }
    },

    product: {
        async list(params = {}) {
            return request('/product/products/list', { params });
        },
        async publish(productData) {
            return request('/product/products/publish', { method: 'POST', body: productData });
        },
        detail(id) {
            return request(`/product/products/${id}`);
        },
        order(productId) {
            return request('/product/orders/create', { method: 'POST', body: { productId } });
        },
        confirmReceive(orderId) {
            return request(`/product/orders/${orderId}/receive`, { method: 'POST' });
        }
    },

    campusNews: {
        async page(params = {}) {
            return request('/user/campusNews/page', { params });
        },
        async publish(data) {
            return request('/user/campusNews/publish', { method: 'POST', body: data });
        },
        async update(id, data) {
            return request(`/user/campusNews/update/${id}`, { method: 'PUT', body: data });
        },
        async deleteNews(id) {
            return request(`/user/campusNews/delete/${id}`, { method: 'PUT' });
        },
        async restore(id) {
            return request(`/user/campusNews/restore/${id}`, { method: 'PUT' });
        },
        async enable(id) {
            return request(`/user/campusNews/enable/${id}`, { method: 'PUT' });
        },
        async disable(id) {
            return request(`/user/campusNews/disable/${id}`, { method: 'PUT' });
        }
    },

    admin: {
        // 查询普通用户列表（role=1）- /admin/users/user/list
        async getUserList(params = {}) {
            return request('/admin/users/user/list', { params, requireAdmin: true });
        },
        // 查询管理员列表（role=0）- /admin/users/admin/list
        async getAdminList(params = {}) {
            return request('/admin/users/admin/list', { params, requireAdmin: true });
        },
        async getUsers(params = {}) {
            return request('/admin/users/list', { params, requireAdmin: true });
        },
        // 禁用用户 (PUT /admin/users/disable/{userId}) - 支持禁用时间设置
        disableUser(id, banDays, banReason) {
            return request(`/admin/users/disable/${id}`, { 
                method: 'PUT', 
                body: { banDays, banReason }, 
                requireAdmin: true 
            });
        },
        // 启用用户 (PUT /admin/users/enable/{id}) - 直接启用，无需弹窗
        enableUserDirect(id) {
            return request(`/admin/users/enable/${id}`, { method: 'PUT', requireAdmin: true });
        },
        // 恢复已注销用户 (PUT /admin/users/restore/{id})
        restoreUser(id) {
            return request(`/admin/users/restore/${id}`, { method: 'PUT', requireAdmin: true });
        },
        adjustCredit(userId, changeValue, reason) {
            return request(`/admin/users/credit/adjust/${userId}`, { method: 'PUT', body: { changeValue, reason }, requireAdmin: true });
        },
        getProducts(params = {}) {
            return request('/admin/products/list', { params, requireAdmin: true });
        },
        offlineProduct(id, reason) {
            return request(`/admin/products/${id}/offline`, { method: 'PUT', body: { reason }, requireAdmin: true });
        },
        getAdmins() {
            return request('/admin/admins/list', { requireAdmin: true });
        },
        addAdmin(username, password) {
            return request('/admin/admins/add', { method: 'POST', body: { username, password }, requireAdmin: true });
        },
        // 注册新管理员（使用 /admin/users/register 接口）
        registerAdmin(adminData) {
            return request('/admin/users/register', { method: 'POST', body: adminData, requireAdmin: true });
        },
        async auditList(params = {}) {
            return request('/admin/users/audit/list', { params, requireAdmin: true });
        },
        auditPass(goodsId) {
            return request(`/admin/users/audit-pass/${goodsId}`, { method: 'PUT', requireAdmin: true });
        },
        auditReject(goodsId, reason) {
            return request(`/admin/users/audit-reject/${goodsId}`, { method: 'PUT', body: { interceptReason: reason }, requireAdmin: true });
        },
        quickSearch(goodsId) {
            return request(`/admin/users/quick-search/${goodsId}`, { requireAdmin: true });
        },
        quickDisable(goodsId) {
            return request(`/admin/users/quick-disable/${goodsId}`, { method: 'PUT', requireAdmin: true });
        },
        getStats() {
            return request('/admin/stats', { requireAdmin: true });
        },
        // ===== 敏感词管理 =====
        getSensitiveWords() {
            return request('/admin/users/sensitive-getwords', { requireAdmin: true });
        },
        addSensitiveWord(word) {
            return request('/admin/users/sensitive-addwords', { method: 'POST', body: { word }, requireAdmin: true });
        },
        removeSensitiveWord(word) {
            return request(`/admin/users/sensitive-removewords/${encodeURIComponent(word)}`, { method: 'DELETE', requireAdmin: true });
        },
        reloadSensitiveWords() {
            return request('/admin/users/sensitive-reloadwords/reload', { method: 'POST', requireAdmin: true });
        }
    },

    map: {
        async confirmUniversity(data) {
            return request('/user/map/university/confirm', { method: 'POST', body: data });
        },
        async searchUniversity(keyword) {
            return request('/user/map/university/search', { params: { keyword } });
        },
        async listUniversities() {
            return request('/user/map/university/list');
        },
        async listDormitories(universityId) {
            return request(`/user/map/dormitory/list/${universityId}`);
        },
        async getUserSchool() {
            return request('/user/map/user/school');
        }
    },

    address: {
        async list() {
            return request('/user/address/addres/list');
        },
        async add(data) {
            return request('/user/address/addres/add', { method: 'POST', body: data });
        },
        async update(id, data) {
            return request(`/user/address/addres/update/${id}`, { method: 'PUT', body: data });
        },
        async delete(id) {
            return request(`/user/address/addres/delete/${id}`, { method: 'DELETE' });
        },
        async setDefault(id) {
            return request(`/user/address/addres/default/${id}`, { method: 'PUT' });
        },
        async dormitoryList() {
            return request('/user/address/dormitory/list');
        },
        async addDormitory(data) {
            return request('/user/address/dormitory/add', { method: 'POST', body: data });
        },
        async updateDormitory(id, data) {
            return request(`/user/address/dormitory/update/${id}`, { method: 'PUT', body: data });
        },
        async remainingCreation() {
            return request('/user/address/dormitory/remaining');
        }
    },

    cart: {
        async add(goodsId, quantity) {
            return request('/user/cart/add', { method: 'POST', body: { goodsId, quantity } });
        },
        async list(pageNum = 1, pageSize = 10, keyword = '') {
            return request('/user/cart/list', { params: { pageNum, pageSize, keyword } });
        },
        async deleteByIds(ids) {
            return request('/user/cart/delete', { method: 'DELETE', body: { ids } });
        },
        async updateQuantity(goodsId, quantity) {
            return request('/user/cart/quantity', { method: 'PUT', body: { goodsId, quantity } });
        },
        async checkout(goodsIds) {
            return request('/user/cart/checkout', { method: 'POST', body: { ids: goodsIds } });
        },
        async select(goodsIds) {
            return request('/user/cart/select', { method: 'PUT', body: { ids: goodsIds } });
        }
    },

    order: {
        async submit(paymentMethod, addressId) {
            return request('/order/submit', { method: 'POST', body: { paymentMethod, addressId } });
        },
        async status(orderNo) {
            return request(`/order/status/${orderNo}`);
        },
        async cancel(paymentNo) {
            return request('/order/cancel', { method: 'PUT', params: { paymentNo } });
        },
        async list(params = {}) {
            return request('/order/list', { params: { pageNum: 1, pageSize: 10, ...params } });
        },
        async detail(orderId, itemId, role) {
            return request(`/order/detail/${orderId}`, { params: { itemId, role } });
        },
        async groupDetail(paymentNo) {
            return request(`/order/group-detail/${paymentNo}`);
        },
        async addresses(paymentNo, role) {
            return request(`/order/addresses/${paymentNo}`, { params: { role } });
        },
        async ship(itemId) {
            return request(`/order/ship/${itemId}`, { method: 'PUT' });
        },
        async receive(itemId) {
            return request(`/order/receive/${itemId}`, { method: 'PUT' });
        }
    },

    pay: {
        async create(paymentNo) {
            return request('/pay/create', { method: 'POST', body: { paymentNo } });
        },
        async mock(paymentNo) {
            return request('/pay/mock/' + paymentNo, { method: 'POST' });
        }
    },

    chat: {
        async getSessions() {
            return request('/user/chat/sessions');
        },
        async getMessages(sessionId, page = 1, size = 20) {
            return request(`/user/chat/messages/${sessionId}`, { params: { page, size } });
        },
        async createSession(targetUserId) {
            return request(`/user/chat/create/${targetUserId}`, { method: 'POST' });
        },
        async sendMessage(data) {
            return request('/user/chat/send', { method: 'POST', body: data });
        }
    },

    feedback: {
        async submit(data) {
            return request('/user/feedback/submit', { method: 'POST', body: data });
        }
    }
};

async function request(url, options = {}) {
    const { method = 'GET', body, params = {}, requireAdmin = false } = options;

    let fullUrl = `${API_BASE_URL}${url}`;
    if (Object.keys(params).length > 0) {
        const queryString = Object.entries(params)
            .filter(([_, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        if (queryString) {
            fullUrl += `?${queryString}`;
        }
    }

    const headers = {
        'Content-Type': 'application/json'
    };

    // 根据页面类型获取对应的 token
    const token = getCurrentToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (requireAdmin) {
        const userInfo = getCurrentUserInfo();
        if (userInfo) {
            try {
                const user = JSON.parse(userInfo);
                if (user.role !== 0 && user.role !== '0') {
                    return { code: 403, message: '无权限访问' };
                }
            } catch (e) {
                return { code: 401, message: '未登录' };
            }
        }
    }

    const requestOptions = {
        method,
        headers
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        requestOptions.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(fullUrl, requestOptions);

        if (response.status === 401) {
            // 清除当前标签页的认证信息（sessionStorage）
            sessionStorage.removeItem(getTokenKey());
            sessionStorage.removeItem(getUserInfoKey());
            alert('登录已过期或账号已被禁用/注销，请重新登录');
            window.location.href = isAdminPage() ? 'admin.html' : 'login.html';
            return { code: 401, message: '登录已过期，请重新登录' };
        }

        if (response.status === 403) {
            return { code: 403, message: '无权限访问' };
        }

        // 只读取一次响应流，存为文本后复用
        const responseText = await response.text();

        // 先尝试解析JSON
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            // JSON解析失败，检查是否返回了登录页面HTML（Token失效）
            if (/^\s*<(?:!DOCTYPE|html)/i.test(responseText) || responseText.includes('login.html')) {
                sessionStorage.removeItem(getTokenKey());
                sessionStorage.removeItem(getUserInfoKey());
                window.location.href = isAdminPage() ? 'admin.html' : 'login.html';
                return { code: 401, message: '登录已过期' };
            }
            return { code: response.status, msg: responseText || `请求失败 (${response.status})` };
        }

        // 响应拦截器：检查返回的 code 是否为 401（账号被禁用/注销）
        if (result && result.code === 401) {
            // 清除当前标签页的认证信息（sessionStorage）
            sessionStorage.removeItem(getTokenKey());
            sessionStorage.removeItem(getUserInfoKey());
            alert(result.msg || '账号已被禁用或注销，请重新登录');
            window.location.href = 'login.html';
            return { code: 401, message: result.msg || '账号异常' };
        }

        // 统一字段名：后端字段为 message，前端统一使用 msg
        if (result && result.message !== undefined && result.msg === undefined) {
            result.msg = result.message;
        }

        return result;
    } catch (error) {
        console.error('Request failed:', error);
        return { code: 500, message: '网络错误，请检查网络连接' };
    }
}

function checkAuth() {
    const token = getCurrentToken();
    const userInfo = getCurrentUserInfo();

    if (!token || !userInfo) {
        redirectToLogin();
        return false;
    }

    try {
        const user = JSON.parse(userInfo);
        const isAdmin = user.role === 0 || user.role === '0';
        if (isAdmin) {
            if (!window.location.pathname.includes('admin.html')) {
                // Admin can access admin pages
            }
        } else {
            if (window.location.pathname.includes('admin.html')) {
                redirectToUser();
                return false;
            }
        }
        return true;
    } catch (e) {
        redirectToLogin();
        return false;
    }
}

function checkAdminAuth() {
    const token = getCurrentToken();
    const userInfo = getCurrentUserInfo();

    if (!token || !userInfo) {
        redirectToLogin();
        return false;
    }

    try {
        const user = JSON.parse(userInfo);
        if (user.role !== 0 && user.role !== '0') {
            showToast('无权限访问管理端', 'error');
            setTimeout(() => redirectToUser(), 1500);
            return false;
        }
        return true;
    } catch (e) {
        redirectToLogin();
        return false;
    }
}

function redirectToLogin() {
    window.location.href = 'login.html';
}

function redirectToUser() {
    window.location.href = 'user.html';
}

function redirectToAdmin() {
    window.location.href = 'admin.html';
}

function getToken() {
    return getCurrentToken();
}

function getUserInfo() {
    try {
        const userInfo = getCurrentUserInfo();
        return userInfo ? JSON.parse(userInfo) : null;
    } catch (e) {
        return null;
    }
}

function setToken(token) {
    sessionStorage.setItem(getTokenKey(), token);
}

function setUserInfo(userInfo) {
    sessionStorage.setItem(getUserInfoKey(), JSON.stringify(userInfo));
}

function clearAuth() {
    // 清除认证信息
    sessionStorage.removeItem(getTokenKey());
    sessionStorage.removeItem(getUserInfoKey());
    // 保存的用户名密码保留在 sessionStorage（跨标签页共享，这是合理的）
}

function isLoggedIn() {
    return !!getCurrentToken();
}

function getUserInfo() {
    const info = getCurrentUserInfo();
    if (info) {
        try {
            return JSON.parse(info);
        } catch (e) {
            return null;
        }
    }
    return null;
}

function isAdmin() {
    const userInfo = getUserInfo();
    return userInfo && (userInfo.role === 0 || userInfo.role === '0');
}

function formatDate(timestamp, format = 'YYYY-MM-DD HH:mm') {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes);
}

function formatMoney(amount) {
    if (amount === null || amount === undefined) return '¥0.00';
    return `¥${parseFloat(amount).toFixed(2)}`;
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return '';

    const now = Date.now();
    const diff = now - new Date(timestamp).getTime();

    if (diff < 0) return '刚刚';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
        return formatDate(timestamp, 'MM-DD');
    } else if (days > 0) {
        return `${days}天前`;
    } else if (hours > 0) {
        return `${hours}小时前`;
    } else if (minutes > 0) {
        return `${minutes}分钟前`;
    } else {
        return '刚刚';
    }
}

function getCreditLevel(score) {
    if (score >= 900) return { level: 10, name: '卓越', color: '#FFD700' };
    if (score >= 800) return { level: 9, name: '优秀', color: '#FF6B6B' };
    if (score >= 700) return { level: 8, name: '良好', color: '#98FF98' };
    if (score >= 600) return { level: 7, name: '中等', color: '#87CEEB' };
    if (score >= 500) return { level: 6, name: '一般', color: '#DDA0DD' };
    if (score >= 400) return { level: 5, name: '较差', color: '#F0E68C' };
    if (score >= 300) return { level: 4, name: '差', color: '#D3D3D3' };
    if (score >= 200) return { level: 3, name: '很差', color: '#C0C0C0' };
    if (score >= 100) return { level: 2, name: '极差', color: '#A9A9A9' };
    return { level: 1, name: '失信', color: '#808080' };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, wait = 300) {
    let lastTime = 0;
    return function executedFunction(...args) {
        const now = Date.now();
        if (now - lastTime >= wait) {
            lastTime = now;
            func.apply(this, args);
        }
    };
}