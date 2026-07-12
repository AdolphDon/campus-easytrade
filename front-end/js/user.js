/* API_BASE_URL 由 api.js 提供 */

let currentUser = null;
let currentPage = 'home';
let isDropdownOpen = false;

// 商品列表相关变量
let goodsPageNum = 1;
let goodsPageSize = 10;
let goodsLoading = false;
let goodsHasMore = true;
let goodsCategoryId = null;
let goodsKeyword = '';

// 任务列表相关变量
let taskPageNum = 1;
let taskPageSize = 10;
let taskLoading = false;
let taskHasMore = true;
let taskCategoryId = null;
let taskKeyword = '';

// 图片上传相关
let uploadedImages = [];

// 编辑商品相关
let editingGoodsId = null;

// 搜索防抖相关
let searchDebounceTimer = null;

// 数据加载防抖相关（防止短时间内重复请求）
const pendingDataRequests = new Map();
let homeDataLoading = false;

// 收藏请求防抖相关
const pendingCollectRequests = new Set();

// 页面加载完成后初始化
window.onload = function() {
    initPage();
};

// 初始化页面
async function initPage() {
    checkAuth();
    // 确保所有picker-modal都关闭
    closeAllPickers();
    // 先从接口获取最新的用户信息
    await loadUserInfoFromApi();
    updateUserInfo();
    updateSchoolIndicator();
    
    // 启动 WebSocket 连接（替代定时轮询）
    initWebSocket();
    
    // 从 URL hash 恢复当前页面（刷新后保持当前页面）
    const hash = window.location.hash.replace('#', '');
    if (hash && ['home', 'market', 'tasks', 'profile', 'fleamarket', 'cart', 'confirmOrder'].includes(hash)) {
        switchPage(hash);
    } else {
        loadHomeData();
    }

    // URL参数：paymentNo（从确认订单页跳转回来时自动弹出关联订单）
    var urlParams = new URLSearchParams(window.location.search);
    var paymentNoParam = urlParams.get('paymentNo');
    if (paymentNoParam) {
        setTimeout(function() { viewPaymentGroupDetail(paymentNoParam); }, 500);
    }

    // 初始加载聊天会话，更新顶部未读徽章
    loadChatSessions();

    setupEventListeners();
}

// 账号状态检测定时器（已废弃，改用 WebSocket）
// let accountStatusTimer = null;

// ==================== WebSocket 账号状态实时推送（替代定时轮询） ====================

let websocket = null;
let reconnectTimer = null;
let isManualClose = false;  // 标记是否手动关闭（退出登录时）

/**
 * 初始化 WebSocket 连接
 * 连接后端 WebSocket 服务，接收账号状态变更推送
 */
function initWebSocket() {
    // 如果已有连接且处于开启状态，不重复创建
    if (websocket && (websocket.readyState === WebSocket.CONNECTING || websocket.readyState === WebSocket.OPEN)) {
        console.log('⚠️ WebSocket 已连接或正在连接中');
        return;
    }

    const token = getCurrentToken();
    if (!token) {
        console.warn('⚠️ 无 Token，无法建立 WebSocket 连接');
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

    console.log('🔌 正在连接 WebSocket:', wsUrl);

    try {
        websocket = new WebSocket(wsUrl);

        // 连接成功
        websocket.onopen = function(event) {
            console.log('✅ WebSocket 连接成功！');
            isManualClose = false;

            // 发送初始化消息
            if (websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({
                    type: 'INIT',
                    timestamp: Date.now()
                }));
            }
        };

        // 接收消息
        websocket.onmessage = function(event) {
            handleWebSocketMessage(event.data);
        };

        // 连接关闭
        websocket.onclose = function(event) {
            console.log('📴 WebSocket 连接已关闭', event.code, event.reason);
            
            // 如果不是手动关闭，自动重连
            if (!isManualClose) {
                console.log('🔄 3秒后尝试重新连接...');
                reconnectTimer = setTimeout(() => {
                    initWebSocket();
                }, 3000);
            }
        };

        // 连接错误
        websocket.onerror = function(error) {
            console.error('❌ WebSocket 错误:', error);
        };
    } catch (error) {
        console.error('❌ 创建 WebSocket 失败:', error);
    }
}

/**
 * 处理 WebSocket 消息
 */
function handleWebSocketMessage(message) {
    try {
        const data = JSON.parse(message);
        console.log('📨 收到 WebSocket 消息:', data);

        switch (data.type) {
            case 'CONNECTED':
                console.log('✅ WebSocket连接已建立');
                break;

            case 'FORCE_LOGOUT':
                console.error('收到强制下线通知！原因:', data.reason || '未知');
                forceLogout(data.reason || '您的账号状态异常，请重新登录');
                break;

            case 'DISABLE_NOTICE':
                console.error('账号已被禁用，显示倒计时:', data);
                showDisableNotice(data.reason || '您的账号已被禁用', data.countdown || 30);
                break;

            case 'ACCOUNT_DISABLED':
                console.error('账号已被禁用！');
                forceLogout('您的账号已被禁用，请重新登录');
                break;

            case 'ACCOUNT_DELETED':
                console.error('账号已被注销！');
                forceLogout('您的账号已被注销，请重新登录');
                break;

            case 'HEARTBEAT':
                console.debug('收到心跳响应');
                break;

            default:
                console.debug('收到未处理的消息类型:', data.type, data);
        }
    } catch (error) {
        console.error('❌ 解析 WebSocket 消息失败:', error);
    }
}

/**
 * 显示禁用通知横幅 + 倒计时
 */
let disableNoticeTimer = null;

function showDisableNotice(reason, countdown) {
    // 清除旧的倒计时
    if (disableNoticeTimer) {
        clearInterval(disableNoticeTimer);
        disableNoticeTimer = null;
    }

    const banner = document.getElementById('disableNotice');
    const textEl = document.getElementById('disableNoticeText');
    const timerEl = document.getElementById('disableNoticeTimer');
    if (!banner || !textEl || !timerEl) return;

    textEl.textContent = reason;
    timerEl.textContent = '将在 ' + countdown + ' 秒后自动退出登录';

    banner.classList.add('active');

    // 创建/更新进度条
    let bar = document.querySelector('.disable-notice-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'disable-notice-bar';
        bar.innerHTML = '<div class="disable-notice-bar-inner" id="disableNoticeBarInner"></div>';
        document.body.appendChild(bar);
    }
    const barInner = document.getElementById('disableNoticeBarInner');
    barInner.style.width = '100%';

    // 倒计时
    let remaining = countdown;
    disableNoticeTimer = setInterval(function () {
        remaining--;
        timerEl.textContent = '将在 ' + remaining + ' 秒后自动退出登录';

        // 进度条（剩余百分比）
        var pct = (remaining / countdown) * 100;
        barInner.style.width = pct + '%';

        if (remaining <= 0) {
            clearInterval(disableNoticeTimer);
            disableNoticeTimer = null;
            // 倒计时结束，强制退出
            banner.classList.remove('active');
            if (bar) bar.remove();
            forceLogout(reason);
        }
    }, 1000);
}

/**
 * 用户点击"立即退出"时调用
 */
function forceLogoutNow() {
    if (disableNoticeTimer) {
        clearInterval(disableNoticeTimer);
        disableNoticeTimer = null;
    }
    const banner = document.getElementById('disableNotice');
    if (banner) banner.classList.remove('active');
    const bar = document.querySelector('.disable-notice-bar');
    if (bar) bar.remove();
    forceLogout(document.getElementById('disableNoticeText')?.textContent || '账号已被禁用');
}

/**
 * 强制下线处理函数
 */
/**
 * 优雅强制下线处理函数
 * 显示优雅的过渡界面，然后自动跳转到登录页
 */
function forceLogout(reason) {
    console.log(` 执行优雅强制下线: ${reason}`);

    // 调用后端登出接口使 token 失效
    fetch(API_BASE_URL + '/user/user/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getCurrentToken() } }).catch(function() {});

    isManualClose = true;
    closeWebSocket();

    // 清除当前标签页的认证信息
    clearAuth();

    // 显示优雅下线界面（与 admin.js 相同逻辑）
    showElegantLogoutOverlayUser(reason);
}

/**
 * 用户页面专用：显示优雅下线过渡界面
 */
function showElegantLogoutOverlayUser(reason) {
    const overlay = document.getElementById('elegantLogoutOverlay');
    
    if (!overlay) {
        // 如果用户页面没有这个组件，使用普通跳转
        alert(reason);
        window.location.href = 'login.html';
        return;
    }

    const titleEl = document.getElementById('logoutTitle');
    const messageEl = document.getElementById('logoutMessage');
    const iconEl = document.querySelector('.logout-icon');
    const countdownNumberEl = document.getElementById('countdownNumber');

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
            immediateRedirectToLoginUser();
        }
    }, 1000);
}

/**
 * 立即跳转到登录页
 */
function immediateRedirectToLoginUser() {
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

/**
 * 关闭 WebSocket 连接
 */
function closeWebSocket() {
    isManualClose = true;

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (websocket) {
        try {
            websocket.close(1000, '用户主动关闭');
        } catch (e) {
            console.warn('⚠️ 关闭 WebSocket 时出错:', e);
        }
        websocket = null;
    }

    console.log('✅ WebSocket 已关闭');
}

// 从接口加载用户信息
async function loadUserInfoFromApi() {
    try {
        const userInfo = getUserInfo();
        if (!userInfo || !userInfo.userId) {
            return;
        }
        
        const result = await API.auth.getUserInfoById(userInfo.userId);
        if (isApiOk(result) && result.data) {
            // 合并角色信息
            const fullUserInfo = {
                ...result.data,
                role: userInfo.role, // 保持原角色
                schoolId: result.data.schoolId || userInfo.schoolId // 后端可能不返回schoolId，保留已有值
            };
            // 使用新函数同时更新localStorage和currentUser
            updateCurrentUser(fullUserInfo);
        }
    } catch (error) {
        console.error('加载用户信息失败:', error);
    }
}

// 检查认证状态
function checkAuth() {
    const token = getCurrentToken();
    const userInfo = getCurrentUserInfo();

    if (!token || !userInfo) {
        window.location.href = 'login.html';
        return;
    }

    try {
        currentUser = JSON.parse(userInfo);
        if (currentUser.role === 0 || currentUser.role === '0') {
            document.getElementById('adminSwitchBtn').style.display = 'flex';
            const mobileAdminBtn = document.getElementById('mobileAdminSwitchBtn');
            if (mobileAdminBtn) mobileAdminBtn.style.display = 'flex';
        }
    } catch (e) {
        window.location.href = 'login.html';
    }
}

// 更新用户信息
function updateUserInfo() {
    if (!currentUser) return;

    const nickname = currentUser.nickname || currentUser.username || '用户';
    const creditScore = currentUser.creditScore || 0;
    const balance = currentUser.balance || 0;

    document.getElementById('topNickname').textContent = nickname;
    if (currentUser.avatar) {
        document.getElementById('topAvatar').src = currentUser.avatar;
    }

    document.getElementById('dropdownName').textContent = nickname;
    document.getElementById('dropdownCredit').textContent = creditScore;
    document.getElementById('dropdownBalance').textContent = `¥${balance.toFixed(2)}`;
    if (currentUser.avatar) {
        document.getElementById('dropdownAvatar').src = currentUser.avatar;
    }

    /* 同步更新移动端头像下拉 */
    const mobileAvatar = document.getElementById('mobileTopAvatar');
    const mobileName = document.getElementById('mobileDropdownName');
    const mobileCredit = document.getElementById('mobileDropdownCredit');
    const mobileBalance = document.getElementById('mobileDropdownBalance');
    const mobileDropdownAvatar = document.getElementById('mobileDropdownAvatar');
    if (mobileAvatar && currentUser.avatar) mobileAvatar.src = currentUser.avatar;
    if (mobileDropdownAvatar && currentUser.avatar) mobileDropdownAvatar.src = currentUser.avatar;
    if (mobileName) mobileName.textContent = nickname;
    if (mobileCredit) mobileCredit.textContent = creditScore;
    if (mobileBalance) mobileBalance.textContent = `¥${balance.toFixed(2)}`;

    document.getElementById('profileNickname').textContent = nickname;
    document.getElementById('profileCreditScore').textContent = creditScore;
    document.getElementById('walletCreditScore').textContent = creditScore;

    const level = Math.min(Math.floor(creditScore / 10) + 1, 10);
    document.getElementById('creditLevel').textContent = `Lv.${level}`;

    // 更新首页用户卡片
    const homeNickname = document.getElementById('homeNickname');
    const homeAvatar = document.getElementById('homeAvatarWrap');
    if (homeNickname) homeNickname.textContent = `欢迎回来，${nickname}`;
    if (homeAvatar && currentUser.avatar) {
        homeAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="头像">`;
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 用户下拉菜单
    const userMenu = document.querySelector('.user-menu');
    
    userMenu.addEventListener('click', function(e) {
        e.stopPropagation();
        isDropdownOpen = !isDropdownOpen;
        userMenu.classList.toggle('active', isDropdownOpen);

        // 关闭导航侧边菜单
        closeNavSide();
    });

    // 移动端头像下拉
    const mobileMenu = document.querySelector('.mobile-user-menu');
    if (mobileMenu) {
        mobileMenu.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = this.classList.contains('active');
            this.classList.toggle('active', !isOpen);
        });
    }

    document.addEventListener('click', function(e) {
        if (isDropdownOpen) {
            isDropdownOpen = false;
            userMenu.classList.remove('active');
        }
        // 移动端下拉
        const mobileMenu = document.querySelector('.mobile-user-menu');
        if (mobileMenu && mobileMenu.classList.contains('active') && !mobileMenu.contains(e.target)) {
            mobileMenu.classList.remove('active');
        }
    });

    // 阻止settings-section区域的意外点击事件冒泡
    const settingsSection = document.querySelector('.settings-section');
    if (settingsSection) {
        settingsSection.addEventListener('click', function(e) {
            // 只允许点击settings-item时才执行，其他区域不执行任何操作
            if (!e.target.closest('.settings-item')) {
                e.stopPropagation();
                return;
            }
        });
    }

    // 搜索框 - 杂货铺搜索
    const productSearchInput = document.getElementById('productSearchInput');
    if (productSearchInput) {
        // 已经在HTML中直接绑定了 onkeypress 和 onclick
    }

    // 分类标签
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const categoryId = this.getAttribute('data-category-id');
            goodsCategoryId = categoryId === 'all' ? null : categoryId;
            resetGoodsList();
            loadGoodsList();
            
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // 滚动加载 - 杂货铺
    window.addEventListener('scroll', function() {
        if (currentPage === 'market' && !goodsLoading && goodsHasMore) {
            const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
            const clientHeight = document.documentElement.clientHeight || window.innerHeight;
            
            if (scrollTop + clientHeight >= scrollHeight - 200) {
                loadGoodsList();
            }
        }
    });

    // 发布闲置按钮
    const publishBtn = document.getElementById('publishBtn');
    if (publishBtn) {
        publishBtn.addEventListener('click', function() {
            showPage('market');
            resetPublishForm();
            openModal('productPublishModal');
            loadCategories();
        });
    }

    // 发布表单提交
    const publishForm = document.getElementById('publishForm');
    if (publishForm) {
        publishForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitPublishForm();
        });
    }

    // 模态框关闭
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', function() {
            closeModal(this.closest('.modal').id);
        });
    });

    // 点击模态框外部关闭
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('mousedown', function(e) {
            if (e.target === modal) {
                closeModal(this.id);
            }
        });
    });

    // 阻止弹窗内部 mousedown 冒泡，避免拖拽选中文本时意外关闭
    document.querySelectorAll('.modal-dialog').forEach(dialog => {
        dialog.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
    });

    // 申诉内容字数统计
    const appealTextarea = document.getElementById('appealContentInput');
    if (appealTextarea) {
        appealTextarea.addEventListener('input', function() {
            const counter = document.getElementById('appealCharCount');
            if (counter) {
                counter.textContent = this.value.length;
            }
        });
    }
}

// showPage 函数（HTML 中调用）
function showPage(pageId) {
    switchPage(pageId);
}

// closeDropdown 函数
function closeDropdown() {
    isDropdownOpen = false;
    const userMenu = document.querySelector('.user-menu');
    if (userMenu) {
        userMenu.classList.remove('active');
    }
}

function closeMobileDropdown() {
    const menu = document.querySelector('.mobile-user-menu');
    if (menu) menu.classList.remove('active');
}

// 打开导航侧边菜单
function openNavSide() {
    document.getElementById('navOverlay').classList.add('active');
    document.getElementById('navSideCard').classList.add('active');
    document.body.style.overflow = 'hidden';
    // 如果在跳蚤市场页面，自动收起面板
    var panel = document.getElementById('fleamarketPanel');
    if (panel && panel.style.display !== 'none') {
        panel.style.display = 'none';
        var showBtn = document.getElementById('fmShowPanelBtn');
        if (showBtn) showBtn.style.display = 'block';
    }
}

// 关闭导航侧边菜单
function closeNavSide() {
    document.getElementById('navOverlay').classList.remove('active');
    document.getElementById('navSideCard').classList.remove('active');
    document.body.style.overflow = '';
}

// 切换页面
function switchPage(pageId) {
    console.log('切换页面到:', pageId);
    currentPage = pageId;
    
    // 保存当前页面到 URL hash（刷新后可恢复）
    window.location.hash = pageId;
    
    // 更新侧边导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    // 更新导航侧边菜单状态
    document.querySelectorAll('.nav-side-item').forEach(item => {
        item.classList.remove('active');
    });
    const navSideItem = document.querySelector(`.nav-side-item[data-page="${pageId}"]`);
    if (navSideItem) {
        navSideItem.classList.add('active');
    }

    // 更新底部导航状态
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const bottomNavItem = document.querySelector(`.bottom-nav-item[data-page="${pageId}"]`);
    if (bottomNavItem) {
        bottomNavItem.classList.add('active');
    }
    
    // 显示对应页面
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.remove('active');
    });
    const targetPage = document.getElementById(`${pageId}Page`);
    if (targetPage) {
        targetPage.classList.add('active');
        console.log('页面已显示:', `${pageId}Page`);
    } else {
        console.error('未找到页面:', `${pageId}Page`);
    }
    
    // 加载页面数据
    if (pageId === 'market') {
        resetGoodsList();
        Promise.all([loadCategories(), loadGoodsList()]);
    } else if (pageId === 'tasks') {
        resetTaskList();
        loadTaskList();
    } else if (pageId === 'home') {
        loadHomeData();
    } else if (pageId === 'profile') {
        loadProfileContent();
    } else if (pageId === 'fleamarket') {
        initFleaMarket();
    } else if (pageId === 'cart') {
        const kw = (document.getElementById('cartKeyword') || {}).value || '';
        loadCartData(kw);
    } else if (pageId === 'messages') {
        loadChatSessions();
    } else if (pageId === 'confirmOrder') {
        loadConfirmOrderData();
    }
}

// ==================== 校园虚拟跳蚤市场 ====================

// ---------- 全局变量 ----------
let fmMap = null;
let fmSelectedSchool = null;     // { name, lat, lng, province, city, district, radius, isConfirmed }
let fmCurrentCircle = null;
let fmDormitoryMarkers = [];
let fmPlaceSearch = null;
let fmGeolocation = null;
let fmUserMarker = null;
let fmIsLocating = false;
let fmGeocoder = null;
let fmConfirmedSchoolName = null;   // 用户已绑定的学校名称（用于判断是否需要显示"更新学校"按钮）

function initFleaMarket() {
    console.log('校园虚拟跳蚤市场页面已加载');
    fmInitMap();
}

function fmInitMap() {
    var container = document.getElementById('amapContainer');
    if (!container || container.offsetWidth === 0) {
        setTimeout(fmInitMap, 200);
        return;
    }

    if (fmMap) {
        fmMap.resize();
        return;
    }

    if (window.AMap && window.AMap.SecurityConfig) {
        window.AMap.SecurityConfig.securityJsCode = '7535fffa439e1230d7553adfc5c197a6';
    }

    fmMap = new AMap.Map('amapContainer', {
        zoom: 5,
        center: [116.397428, 39.90923],
        mapStyle: 'amap://styles/light',
        features: ['bg', 'road', 'building', 'point']
    });

    // 学校检查和按钮更新不依赖插件，立即执行
    fmCheckUserSchool();
    updateBtnStates();

    // 加载定位和逆地理编码插件（拖拽和定位都需要）
    fmMap.plugin(['AMap.Geolocation', 'AMap.Geocoder'], function() {
        fmGeolocation = new AMap.Geolocation({
            enableHighAccuracy: false,
            timeout: 10000,
            showButton: false,
            zoomToAccuracy: true
        });
        fmMap.addControl(fmGeolocation);
        fmGeocoder = new AMap.Geocoder({ city: '', radius: 1000 });
    });

    fmMap.on('click', function() {
        fmClearSelection();
    });

    // 拖拽地图后更新中心点地理信息（防抖）
    var fmDragTimer = null;
    fmMap.on('dragend', function() {
        clearTimeout(fmDragTimer);
        fmDragTimer = setTimeout(function() {
            var center = fmMap.getCenter();
            fmUpdateGeoInfo(center.lng, center.lat);
        }, 200);
    });
}

// ---------- 学校校验与名称标准化 ----------

function fmIsValidUniversity(name) {
    if (name.indexOf('大学') < 0 && name.indexOf('学院') < 0) {
        showToast('仅支持本科及以上的高等院校', 'warning');
        return false;
    }
    var exclude = ['中专', '职校', '技校', '培训', '继续教育', '专修', '自考', '函授', '电大', '进修', '高复', '辅导'];
    for (var i = 0; i < exclude.length; i++) {
        if (name.indexOf(exclude[i]) >= 0) {
            showToast('仅支持本科及以上的高等院校', 'warning');
            return false;
        }
    }
    var collIdx = name.indexOf('学院');
    if (collIdx >= 0) {
        var after = name.substring(collIdx + 2);
        if (after.indexOf('院') >= 0) {
            showToast('请选择大学本身，而非校内建筑', 'warning');
            return false;
        }
    }
    return true;
}

function fmNormalizeName(name) {
    return name.replace(/研究生院$/, '').replace(/校区$/, '').trim();
}

// ---------- 检查用户已绑定的学校 ----------

function fmCheckUserSchool() {
    API.map.getUserSchool().then(function(res) {
        if (isApiOk(res) && res.data) {
            var u = res.data;
            fmConfirmedSchoolName = u.name;
            document.getElementById('fmGeoRegion').textContent = u.name;
            var addrEl = document.getElementById('fmGeoAddress');
            if (addrEl) addrEl.textContent = '';
            fmSelectedSchool = {
                name: u.name,
                lat: parseFloat(u.latitude),
                lng: parseFloat(u.longitude),
                province: u.province || '',
                city: u.city || '',
                district: u.district || '',
                radius: u.radius || 500,
                isConfirmed: true
            };
            document.getElementById('fmSchoolName').textContent = u.name;
            document.getElementById('fmStatus').textContent = '已确认学校: ' + u.name;
            var confirmBtn = document.getElementById('fmConfirmBtn');
            if (confirmBtn) {
                confirmBtn.textContent = '已确认';
                confirmBtn.className = 'btn-confirmed';
            }
            fmMap.setZoom(16);
            fmMap.setCenter([fmSelectedSchool.lng, fmSelectedSchool.lat]);
            fmDrawCampusFence(fmSelectedSchool.lng, fmSelectedSchool.lat, fmSelectedSchool.radius);
            fmLoadDormitories(u.id);
            // 同步 schoolId 到 localStorage（后端 /user/info 不返回此字段）
            var userInfo = getUserInfo();
            if (userInfo && !userInfo.schoolId) {
                userInfo.schoolId = u.id;
                setUserInfo(userInfo);
            }
            if (currentUser && !currentUser.schoolId) {
                currentUser.schoolId = u.id;
            }
            updateBtnStates();
        }
    });
}

// ---------- 更新按钮状态 ----------

function updateBtnStates() {
    var confirmBtn = document.getElementById('fmConfirmBtn');
    var backBtn = document.getElementById('fmBackBtn');
    var userInfo = getUserInfo();
    var hasSchool = (userInfo && userInfo.schoolId) || !!fmConfirmedSchoolName;
    var alreadyConfirmed = fmSelectedSchool && (fmSelectedSchool.isConfirmed ||
                           (fmConfirmedSchoolName && fmSelectedSchool.name === fmConfirmedSchoolName));

    if (confirmBtn) {
        confirmBtn.disabled = !(fmSelectedSchool && !fmSelectedSchool.isConfirmed
                               && (!fmConfirmedSchoolName || fmSelectedSchool.name !== fmConfirmedSchoolName));
        if (alreadyConfirmed) {
            confirmBtn.textContent = '已确认';
            confirmBtn.className = 'btn-confirmed';
        } else {
            confirmBtn.textContent = '确认学校';
            confirmBtn.className = 'btn-confirm';
        }
    }
    if (backBtn) {
        backBtn.disabled = !hasSchool;
    }
}

// ---------- 我的位置 ----------

function fmLocateMe() {
    if (fmIsLocating) return;

    if (!fmGeolocation) {
        showToast('定位功能不可用', 'error');
        return;
    }

    // 按需加载逆地理编码和搜索插件（首次定位时加载）
    if (!fmGeocoder || !fmPlaceSearch) {
        fmIsLocating = true;
        document.getElementById('fmStatus').textContent = '加载地图插件...';
        fmMap.plugin(['AMap.PlaceSearch', 'AMap.Geocoder'], function() {
            fmPlaceSearch = new AMap.PlaceSearch({ type: '高等院校', pageSize: 20 });
            fmGeocoder = new AMap.Geocoder({ city: '', radius: 1000 });
            fmIsLocating = false;
            fmLocateMe();
        });
        return;
    }

    fmIsLocating = true;
    document.getElementById('fmStatus').textContent = '正在定位...';

    fmGeolocation.getCurrentPosition(function(status, result) {
        fmIsLocating = false;
        if (status === 'complete') {
            var lng = result.position.lng;
            var lat = result.position.lat;

            // 显示用户位置标记
            if (fmUserMarker) fmMap.remove(fmUserMarker);
            fmUserMarker = new AMap.Marker({
                position: [lng, lat],
                icon: new AMap.Icon({
                    size: new AMap.Size(26, 34),
                    image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
                    imageSize: new AMap.Size(26, 34)
                }),
                offset: new AMap.Pixel(-13, -34)
            });
            fmUserMarker.setMap(fmMap);
            fmMap.setZoom(15);
            fmMap.setCenter([lng, lat]);

            // 逆地理编码获取省市区
            fmGeocoder.getAddress(result.position, function(gStatus, gResult) {
                var province = '', city = '', district = '', formattedAddress = '';
                if (gStatus === 'complete' && gResult.regeocode) {
                    var acomp = gResult.regeocode.addressComponent || {};
                    province = acomp.province || '';
                    city = acomp.city || acomp.province || '';
                    district = acomp.district || '';
                    formattedAddress = gResult.regeocode.formattedAddress || '';
                }
                var region = province;
                if (city && city !== province) region += city;
                if (district) region += district;
                document.getElementById('fmGeoRegion').textContent = region || '未知位置';
                var addrEl = document.getElementById('fmGeoAddress');
                if (addrEl) {
                    var detail = formattedAddress;
                    if (region && formattedAddress.indexOf(region) === 0) {
                        detail = formattedAddress.substring(region.length);
                    }
                    addrEl.textContent = detail || '';
                }

                // 搜索附近大学
                fmPlaceSearch.searchNearBy('', [lng, lat], 800, function(s, r) {
                    if (s === 'complete' && r.poiList && r.poiList.pois && r.poiList.pois.length > 0) {
                        // 收集所有匹配的大学/学院POI
                        var candidates = [];
                        for (var i = 0; i < r.poiList.pois.length; i++) {
                            var p = r.poiList.pois[i];
                            if (p.name.indexOf('大学') >= 0 || p.name.indexOf('学院') >= 0) {
                                var collIdx = p.name.indexOf('学院');
                                if (collIdx >= 0) {
                                    var after = p.name.substring(collIdx + 2);
                                    if (after.indexOf('院') >= 0) continue;
                                }
                                candidates.push(p);
                            }
                        }
                        // 排序：无parent的主POI（学士帽）→ 有parent的子地点
                        // 同层级内：名称以大学/学院结尾的 → 名称最长的
                        candidates.sort(function(a, b) {
                            var aMain = !a.parent ? 0 : 1;
                            var bMain = !b.parent ? 0 : 1;
                            if (aMain !== bMain) return aMain - bMain;
                            var aNameEnd = /大学$/.test(a.name) || /学院$/.test(a.name) ? 0 : 1;
                            var bNameEnd = /大学$/.test(b.name) || /学院$/.test(b.name) ? 0 : 1;
                            if (aNameEnd !== bNameEnd) return aNameEnd - bNameEnd;
                            return b.name.length - a.name.length;
                        });
                        var uniPoi = candidates.length > 0 ? candidates[0] : null;
                        var displayName = uniPoi ? fmNormalizeName(uniPoi.name).replace(/校区$/, '').trim() : null;
                        // 如果名称不以大学/学院结尾，说明是校内子POI，提取学校名
                        if (displayName) {
                            if (!/大学$/.test(displayName) && !/学院$/.test(displayName)) {
                                var idx = displayName.lastIndexOf('大学');
                                if (idx < 0) idx = displayName.lastIndexOf('学院');
                                if (idx >= 0) displayName = displayName.substring(0, idx + 2);
                            }
                        }
                        // 如果选了子POI，尝试用学校名重新搜索获取主POI坐标作为围栏中心
                        if (uniPoi && uniPoi.parent && displayName) {
                            fmPlaceSearch.search(displayName, function(s2, r2) {
                                if (s2 === 'complete' && r2.poiList && r2.poiList.pois) {
                                    for (var j = 0; j < r2.poiList.pois.length; j++) {
                                        var mp = r2.poiList.pois[j];
                                        if (!mp.parent && mp.name.indexOf(displayName) >= 0) {
                                            uniPoi = mp;
                                            console.log('找到主校区POI:', mp.name);
                                            break;
                                        }
                                    }
                                }
                                renderSchoolResult(uniPoi, displayName, lat, lng, province, city, district);
                            });
                        } else {
                            renderSchoolResult(uniPoi, displayName, lat, lng, province, city, district);
                        }
                    } else {
                        document.getElementById('fmSchoolName').textContent = '暂无学校';
                        document.getElementById('fmStatus').textContent = '您当前不在校园范围内';
                        fmSelectedSchool = null;
                    }
                    updateBtnStates();
                });
            });
        } else {
            showToast('定位失败，请检查定位权限', 'error');
            document.getElementById('fmStatus').textContent = '定位失败';
            updateBtnStates();
        }
    });
}


/** 渲染学校定位结果：显示学校名、状态、围栏 */
function renderSchoolResult(uniPoi, displayName, lat, lng, province, city, district) {
    if (!uniPoi || !displayName || !fmIsValidUniversity(displayName)) {
        document.getElementById('fmSchoolName').textContent = '暂无学校';
        document.getElementById('fmStatus').textContent = '您当前不在校园范围内';
        fmSelectedSchool = null;
        updateBtnStates();
        return;
    }

    var dist = fmCalcDistance(lat, lng, uniPoi.location.lat, uniPoi.location.lng);
    var inCampus = dist <= 600;

    if (inCampus) {
        fmSelectedSchool = {
            name: displayName,
            lat: uniPoi.location.lat,
            lng: uniPoi.location.lng,
            province: province,
            city: city || document.getElementById('fmGeoRegion').textContent || '',
            district: district || '',
            radius: 500,
            isConfirmed: false
        };
        document.getElementById('fmSchoolName').textContent = displayName;
        if (fmConfirmedSchoolName) {
            if (displayName === fmConfirmedSchoolName) {
                document.getElementById('fmStatus').textContent = '您已在 ' + displayName + ' 校园内';
            } else {
                document.getElementById('fmStatus').textContent = '检测到您在 ' + displayName + '，点击「更新学校」切换';
            }
        } else {
            document.getElementById('fmStatus').textContent = '检测到您在 ' + displayName + ' 校园内，点击「确认学校」保存';
        }
        fmDrawCampusFence(fmSelectedSchool.lng, fmSelectedSchool.lat, fmSelectedSchool.radius);
    } else {
        document.getElementById('fmSchoolName').textContent = '暂无学校（不在校园范围内）';
        document.getElementById('fmStatus').textContent = '您当前不在校园范围内';
        fmSelectedSchool = null;
    }
    updateBtnStates();
}

// ---------- 确认学校 ----------

function fmConfirmUniversity() {
    if (!fmSelectedSchool || fmSelectedSchool.isConfirmed) {
        showToast('请先通过「我的位置」定位到校园', 'warning');
        return;
    }

    if (!fmUserMarker) {
        showToast('请先点击「我的位置」定位', 'warning');
        return;
    }

    var rawName = fmSelectedSchool.name;
    if (!fmIsValidUniversity(rawName)) return;
    var finalName = fmNormalizeName(rawName);
    fmSelectedSchool.name = finalName;

    var data = {
        name: fmSelectedSchool.name,
        province: fmSelectedSchool.province || '',
        city: fmSelectedSchool.city || '',
        district: fmSelectedSchool.district || '',
        latitude: fmSelectedSchool.lat,
        longitude: fmSelectedSchool.lng,
        radius: fmSelectedSchool.radius || 500
    };

    API.map.confirmUniversity(data).then(function(res) {
        if (isApiOk(res)) {
            var universityId = res.data && res.data.id;
            showToast('学校确认成功！', 'success');
            fmSelectedSchool.isConfirmed = true;
            fmConfirmedSchoolName = fmSelectedSchool.name;
            document.getElementById('fmStatus').textContent = '已确认学校: ' + fmSelectedSchool.name;
            document.getElementById('fmSchoolName').textContent = fmSelectedSchool.name;
            // 确认按钮文本改成"已确认"
            var confirmBtn = document.getElementById('fmConfirmBtn');
            if (confirmBtn) {
                confirmBtn.textContent = '已确认';
                confirmBtn.className = 'btn-confirmed';
            }
            updateSchoolIndicator();
            var userInfo = getUserInfo();
            if (userInfo && universityId) {
                userInfo.schoolId = universityId;
                setUserInfo(userInfo);
            }
            if (currentUser && universityId) {
                currentUser.schoolId = universityId;
            }

            fmLoadDormitories(universityId);
            updateBtnStates();
        } else {
            showToast(res.message || '保存失败', 'error');
        }
    });
}

// ---------- 更新学校 ----------

// ---------- 宿舍楼标记 ----------

function fmLoadDormitories(universityId) {
    fmClearDormitoryMarkers();
    API.map.listDormitories(universityId).then(function(res) {
        if (isApiOk(res) && res.data && res.data.length > 0) {
            res.data.forEach(function(d) {
                var marker = new AMap.Marker({
                    position: [parseFloat(d.longitude), parseFloat(d.latitude)],
                    title: d.name,
                    icon: new AMap.Icon({
                        size: new AMap.Size(24, 32),
                        image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png',
                        imageSize: new AMap.Size(24, 32)
                    }),
                    offset: new AMap.Pixel(-12, -32)
                });
                marker.content = '<div style="font-size:13px;font-weight:600;padding:4px 8px">' +
                    d.name + '</div><div style="font-size:12px;color:#999;padding:0 8px 4px">商品数量: ' +
                    (d.goodsCount || 0) + '</div>';
                marker.on('click', function() {
                    var info = new AMap.InfoWindow({ content: marker.content, offset: new AMap.Pixel(0, -32) });
                    info.open(fmMap, marker.getPosition());
                });
                fmMap.add(marker);
                fmDormitoryMarkers.push(marker);
            });
        }
    });
}

function fmClearDormitoryMarkers() {
    if (fmDormitoryMarkers.length > 0) {
        fmMap.remove(fmDormitoryMarkers);
        fmDormitoryMarkers = [];
    }
}

// ---------- 校园围栏 ----------

function fmDrawCampusFence(lng, lat, radius) {
    if (fmCurrentCircle) {
        fmMap.remove(fmCurrentCircle);
    }
    fmCurrentCircle = new AMap.Circle({
        center: [lng, lat],
        radius: radius || 500,
        strokeColor: '#4a90d9',
        strokeWeight: 2,
        strokeOpacity: 0.6,
        fillColor: '#4a90d9',
        fillOpacity: 0.15,
        bubble: true
    });
    fmCurrentCircle.setMap(fmMap);
}

// ---------- 清除选择 ----------

function fmClearSelection() {
    if (fmCurrentCircle) {
        fmMap.remove(fmCurrentCircle);
        fmCurrentCircle = null;
    }
}

// ---------- 回到学校 ----------

function fmBackToSchool() {
    var userInfo = getUserInfo();
    if (!userInfo || !userInfo.schoolId) {
        showToast('您还未绑定学校', 'warning');
        return;
    }
    if (!fmSelectedSchool) {
        fmCheckUserSchool();
        return;
    }
    fmMap.setZoom(16);
    fmMap.setCenter([fmSelectedSchool.lng, fmSelectedSchool.lat]);
    document.getElementById('fmStatus').textContent = '已回到: ' + fmSelectedSchool.name;
    fmUpdateGeoInfo(fmSelectedSchool.lng, fmSelectedSchool.lat);
}

function fmUpdateGeoInfo(lng, lat) {
    var regionEl = document.getElementById('fmGeoRegion');
    var addrEl = document.getElementById('fmGeoAddress');
    if (!regionEl) return;
    if (fmGeocoder) {
        fmGeocoder.getAddress([lng, lat], function(status, result) {
            if (status === 'complete' && result.regeocode) {
                var acomp = result.regeocode.addressComponent || {};
                var province = acomp.province || '';
                var city = acomp.city || '';
                var district = acomp.district || '';
                // 省市区（去重，城市和省份相同时只显示省份）
                var region = province;
                if (city && city !== province) region += city;
                if (district) region += district;
                regionEl.textContent = region || '未知位置';
                // 详细地址：从 formattedAddress 中去掉省市区前缀
                var fullAddr = result.regeocode.formattedAddress || '';
                var detail = fullAddr;
                if (region && fullAddr.indexOf(region) === 0) {
                    detail = fullAddr.substring(region.length);
                }
                if (addrEl) addrEl.textContent = detail || '';
            } else {
                regionEl.textContent = '未知位置';
                if (addrEl) addrEl.textContent = '';
            }
        });
    } else {
        regionEl.textContent = '加载地理信息...';
        if (addrEl) addrEl.textContent = '';
        fmMap.plugin(['AMap.Geocoder'], function() {
            fmGeocoder = new AMap.Geocoder({ city: '', radius: 1000 });
            fmUpdateGeoInfo(lng, lat);
        });
    }
}

// ---------- 工具函数 ----------

function fmCalcDistance(lat1, lng1, lat2, lng2) {
    var radLat1 = lat1 * Math.PI / 180;
    var radLat2 = lat2 * Math.PI / 180;
    var a = radLat1 - radLat2;
    var b = lng1 * Math.PI / 180 - lng2 * Math.PI / 180;
    var s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
        Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
    return s * 6378137;
}

// ---------- 面板隐藏/显示 ----------

function fmTogglePanel(hide) {
    var panel = document.getElementById('fleamarketPanel');
    var showBtn = document.getElementById('fmShowPanelBtn');
    if (hide) {
        panel.style.display = 'none';
        showBtn.style.display = 'block';
    } else {
        panel.style.display = 'block';
        showBtn.style.display = 'none';
        if (fmMap) setTimeout(function() { fmMap.resize(); }, 100);
    }
}

// 筛选任务
function filterTasks() {
    console.log('筛选任务');
    resetTaskList();
    loadTaskList();
}

// 搜索商品
function searchGoods() {
    // 清除之前的定时器
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    
    // 设置新的定时器，300ms后执行
    searchDebounceTimer = setTimeout(() => {
        const searchInput = document.getElementById('productSearchInput');
        if (searchInput) {
            goodsKeyword = searchInput.value.trim();
            resetGoodsList();
            loadGoodsList();
        }
    }, 300);
}

// 筛选商品分类（已废弃，保留兼容性，现使用 onCategoryChange）
function filterGoodsByCategory(categoryId) {
    goodsCategoryId = categoryId;
    resetGoodsList();
    loadGoodsList();
}

// 显示发布任务
function showTaskPublish() {
    openModal('taskPublishModal');
}

// 显示发布闲置
function showProductPublish() {
    openModal('productPublishModal');
    loadCategories();
    // 重置交易方式为卖家上门
    var defaultRadio = document.querySelector('input[name="transactionType"][value="1"]');
    if (defaultRadio) {
        defaultRadio.checked = true;
    }
    var ttGroup = document.getElementById('transactionTypeGroup');
    if (ttGroup) {
        ttGroup.querySelectorAll('.radio-item').forEach(function(el) {
            el.classList.toggle('active', el.querySelector('input[type="radio"]').checked);
        });
    }
    // 重置地址选择缓存并刷新
    var addrSelect = document.getElementById('sellerAddressSelect');
    if (addrSelect) {
        delete addrSelect.dataset.loaded;
        addrSelect.value = '';
    }
    toggleSellerAddress();
}

// 提交任务
function submitTask() {
    showToast('任务发布功能开发中', 'info');
}

// 提交商品
function submitGoods() {
    submitPublishForm();
}

/** 根据输入的价格实时计算并显示平台佣金和实际到手金额 */
function updateCommissionDisplay() {
    const price = parseFloat(document.getElementById('goodsPrice').value) || 0;
    const info = document.getElementById('commissionInfo');
    if (price > 0) {
        const commission = price * 0.05;
        const actual = price - commission;
        document.getElementById('commissionAmount').textContent = '-¥' + commission.toFixed(2);
        document.getElementById('actualAmount').textContent = '¥' + actual.toFixed(2);
        info.style.display = 'flex';
    } else {
        info.style.display = 'none';
    }
}

// 切换个人中心标签
function switchProfileTab(tab) {
    // 更新标签状态
    document.querySelectorAll('.profile-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.profile-tab[data-tab="${tab}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // 加载对应内容
    if (tab === 'tasks') {
        loadMyTasks('published');
    } else if (tab === 'products') {
        showToast('我的闲置功能开发中', 'info');
    } else if (tab === 'orders') {
        showToast('我的订单功能开发中', 'info');
    }
}

// 加载我的任务
function loadMyTasks(type) {
    showToast('我的任务功能开发中', 'info');
}

// 更新用户信息（同时更新localStorage和currentUser）
function updateCurrentUser(userData) {
    if (!userData) return;
    
    // 更新localStorage
    setUserInfo(userData);
    
    // 更新currentUser变量
    currentUser = userData;
}

// 处理settings-item的点击事件
function handleSettingsClick(event, action) {
    event.stopPropagation();
    event.preventDefault();
    
    if (action === 'editProfile') {
        // 先关闭所有可能打开的picker
        closeAllPickers();
        openModal('editProfileModal');
        // 等待模态框完全打开后再加载数据
        setTimeout(() => {
            loadProfileForEdit();
        }, 100);
    } else if (action === 'showChangePassword') {
        showChangePassword();
    } else if (action === 'logout') {
        logout();
    }
}

// 编辑资料
function editProfile() {
    // 先关闭所有可能打开的picker
    closeAllPickers();
    openModal('editProfileModal');
    // 等待模态框完全打开后再加载数据
    setTimeout(() => {
        loadProfileForEdit();
    }, 100);
}

// 加载用户资料进行编辑
async function loadProfileForEdit() {
    try {
        const userInfo = getUserInfo();
        if (!userInfo || !userInfo.userId) {
            showToast('请先登录', 'error');
            return;
        }

        // 获取显示元素
        const avatarImg = document.getElementById('editProfileAvatar');
        const backgroundDiv = document.getElementById('editProfileBackground');
        const editUsername = document.getElementById('editUsername');

        // 先尝试用本地数据回显
        if (userInfo) {
            if (userInfo.background && backgroundDiv) {
                backgroundDiv.style.backgroundImage = `url(${userInfo.background})`;
                backgroundDiv.style.backgroundSize = 'cover';
                backgroundDiv.style.backgroundPosition = 'center';
                backgroundDiv.style.backgroundRepeat = 'no-repeat';
            }
            if (userInfo.avatar && avatarImg) {
                avatarImg.src = userInfo.avatar;
            }
            if (userInfo.nickname) tempNickname = userInfo.nickname;
            if (userInfo.intro) tempIntro = userInfo.intro;
            if (userInfo.gender) tempGender = String(userInfo.gender);
            if (userInfo.birthday) {
                const [y, m, d] = userInfo.birthday.split('-');
                tempBirthday = { year: parseInt(y), month: parseInt(m), day: parseInt(d) };
            }
            if (userInfo.location) {
                // 检查是否是直辖市
                const directControlled = ['北京市', '天津市', '上海市', '重庆市'];
                if (directControlled.includes(userInfo.location)) {
                    tempLocation = {
                        province: userInfo.location,
                        city: userInfo.location
                    };
                } else {
                    const locParts = userInfo.location.split('・');
                    tempLocation = {
                        province: locParts[0] || '',
                        city: locParts[1] || ''
                    };
                }
            }
            if (userInfo.username) {
                tempUsername = userInfo.username;
            }
        }

        // 再从接口获取最新数据
        const result = await API.auth.getUserInfoById(userInfo.userId);
        if (isApiOk(result) && result.data) {
            const user = result.data;
            
            // 回显数据
            if (user.background && backgroundDiv) {
                backgroundDiv.style.background = `url(${user.background}) center/cover no-repeat`;
            }
            if (user.avatar && avatarImg) {
                avatarImg.src = user.avatar;
            }
            if (user.nickname) tempNickname = user.nickname;
            if (user.intro) tempIntro = user.intro;
            if (user.gender) tempGender = String(user.gender);
            if (user.birthday) {
                const [y, m, d] = user.birthday.split('-');
                tempBirthday = { year: parseInt(y), month: parseInt(m), day: parseInt(d) };
            }
            if (user.location) {
                // 检查是否是直辖市
                const directControlled = ['北京市', '天津市', '上海市', '重庆市'];
                if (directControlled.includes(user.location)) {
                    tempLocation = {
                        province: user.location,
                        city: user.location
                    };
                } else {
                    const locParts = user.location.split('・');
                    tempLocation = {
                        province: locParts[0] || '',
                        city: locParts[1] || ''
                    };
                }
            }
            if (user.username) {
                tempUsername = user.username;
            }
            
            // 更新隐藏输入框
            document.getElementById('editNickname').value = tempNickname || '';
            document.getElementById('editIntro').value = tempIntro || '';
            document.getElementById('editGender').value = tempGender || '3';
            document.getElementById('editUsername').value = tempUsername || '';
            if (tempBirthday.year && tempBirthday.month && tempBirthday.day) {
                const birthdayStr = `${tempBirthday.year}-${String(tempBirthday.month).padStart(2, '0')}-${String(tempBirthday.day).padStart(2, '0')}`;
                document.getElementById('editBirthday').value = birthdayStr;
            }
            // 直辖市只保存市名
            const directControlled = ['北京市', '天津市', '上海市', '重庆市'];
            if (directControlled.includes(tempLocation.province)) {
                document.getElementById('editLocation').value = tempLocation.province || '';
            } else {
                const locParts = [tempLocation.province, tempLocation.city].filter(x => x);
                document.getElementById('editLocation').value = locParts.join('・');
            }
        }
        
        // 更新显示
        updateDisplay();
    } catch (error) {
        console.error('加载用户资料失败:', error);
        showToast('加载用户资料失败', 'error');
    }
}

// 临时存储上传的图片
let tempAvatar = null;
let tempBackground = null;

// 处理编辑头像上传
async function handleEditAvatarUpload(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const result = await API.common.upload(formData);
        if (isApiOk(result) && result.data) {
            tempAvatar = result.data;
            document.getElementById('editProfileAvatar').src = tempAvatar;
            showToast('头像上传成功', 'success');
        } else {
            showToast(result.message || '头像上传失败', 'error');
        }
    } catch (error) {
        console.error('头像上传失败:', error);
        showToast('头像上传失败', 'error');
    }
}

// 处理封面上传
async function handleCoverUpload(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const result = await API.common.upload(formData);
        if (isApiOk(result) && result.data) {
            tempBackground = result.data;
            const backgroundDiv = document.getElementById('editProfileBackground');
            if (backgroundDiv) {
                backgroundDiv.style.backgroundImage = `url(${tempBackground})`;
                backgroundDiv.style.backgroundSize = 'cover';
                backgroundDiv.style.backgroundPosition = 'center';
                backgroundDiv.style.backgroundRepeat = 'no-repeat';
            }
            showToast('封面上传成功', 'success');
        } else {
            showToast(result.message || '封面上传失败', 'error');
        }
    } catch (error) {
        console.error('封面上传失败:', error);
        showToast('封面上传失败', 'error');
    }
}

// 保存用户资料
async function saveProfile() {
    try {
        const userInfo = getUserInfo();
        if (!userInfo || !userInfo.userId) {
            showToast('请先登录', 'error');
            return;
        }

        const updateData = {
            userId: userInfo.userId,
            username: document.getElementById('editUsername').value,
            nickname: document.getElementById('editNickname').value,
            intro: document.getElementById('editIntro').value,
            gender: parseInt(document.getElementById('editGender').value),
            birthday: document.getElementById('editBirthday').value,
            location: document.getElementById('editLocation').value
        };

        // 只有上传了新头像才更新
        if (tempAvatar) {
            updateData.avatar = tempAvatar;
        }

        // 只有上传了新封面才更新
        if (tempBackground) {
            updateData.background = tempBackground;
        }

        // 调用更新用户信息接口
        const result = await API.auth.updateUserInfo(userInfo.userId, updateData);

        if (isApiOk(result)) {
            showToast('保存成功', 'success');

            // 先清除临时数据
            tempAvatar = null;
            tempBackground = null;

            // 关闭模态框
            closeModal('editProfileModal');

            // 重新从接口获取完整的用户信息（最保险的方式）
            await loadUserInfoFromApi();

            // 更新UI显示
            updateUserInfo();

            // 也更新个人中心的展示
            await loadUserInfoForProfile();
        } else {
            showToast(result.message || '保存失败', 'error');
        }

    } catch (error) {
        console.error('保存用户资料失败:', error);
        showToast('保存失败', 'error');
    }
}

// ==================== 选择器功能 ====================

// 临时选择值
let tempNickname = '';
let tempIntro = '';
let tempGender = '3';
let tempBirthday = { year: 2000, month: 1, day: 1 };
let tempLocation = { province: '', city: '' };

// 省市数据
const provinceData = [
    '北京市', '天津市', '河北省', '山西省', '内蒙古自治区',
    '辽宁省', '吉林省', '黑龙江省', '上海市', '江苏省',
    '浙江省', '安徽省', '福建省', '江西省', '山东省',
    '河南省', '湖北省', '湖南省', '广东省', '广西壮族自治区',
    '海南省', '重庆市', '四川省', '贵州省', '云南省',
    '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区',
    '新疆维吾尔自治区'
];

const cityData = {
    '北京市': ['北京市'],
    '天津市': ['天津市'],
    '上海市': ['上海市'],
    '重庆市': ['重庆市'],
    '河北省': ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市'],
    '山西省': ['太原市', '大同市', '阳泉市', '长治市', '晋城市', '朔州市', '晋中市', '运城市', '忻州市', '临汾市', '吕梁市'],
    '内蒙古自治区': ['呼和浩特市', '包头市', '乌海市', '赤峰市', '通辽市', '鄂尔多斯市', '呼伦贝尔市', '巴彦淖尔市', '乌兰察布市', '兴安盟', '锡林郭勒盟', '阿拉善盟'],
    '辽宁省': ['沈阳市', '大连市', '鞍山市', '抚顺市', '本溪市', '丹东市', '锦州市', '营口市', '阜新市', '辽阳市', '盘锦市', '铁岭市', '朝阳市', '葫芦岛市'],
    '吉林省': ['长春市', '吉林市', '四平市', '辽源市', '通化市', '白山市', '松原市', '白城市', '延边朝鲜族自治州'],
    '黑龙江省': ['哈尔滨市', '齐齐哈尔市', '鸡西市', '鹤岗市', '双鸭山市', '大庆市', '伊春市', '佳木斯市', '七台河市', '牡丹江市', '黑河市', '绥化市', '大兴安岭地区'],
    '江苏省': ['南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市']
};

// 更新显示函数
function updateDisplay() {
    // 昵称
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    if (nicknameDisplay) {
        nicknameDisplay.textContent = tempNickname || '请输入昵称';
    }
    
    // 简介
    const introDisplay = document.getElementById('introDisplay');
    if (introDisplay) {
        introDisplay.textContent = tempIntro || '请输入简介';
    }
    
    // 性别
    const genderDisplay = document.getElementById('genderDisplay');
    if (genderDisplay) {
        genderDisplay.textContent = getGenderText(parseInt(tempGender));
    }
    
    // 生日
    const birthdayDisplay = document.getElementById('birthdayDisplay');
    if (birthdayDisplay) {
        if (tempBirthday.year && tempBirthday.month && tempBirthday.day) {
            birthdayDisplay.textContent = `${tempBirthday.year}-${String(tempBirthday.month).padStart(2, '0')}-${String(tempBirthday.day).padStart(2, '0')}`;
        } else {
            birthdayDisplay.textContent = '请选择生日';
        }
    }
    
    // 所在地
    const locationDisplay = document.getElementById('locationDisplay');
    if (locationDisplay) {
        // 直辖市只显示市名
        const directControlled = ['北京市', '天津市', '上海市', '重庆市'];
        if (directControlled.includes(tempLocation.province)) {
            locationDisplay.textContent = tempLocation.province || '请选择所在地';
        } else {
            const locParts = [tempLocation.province, tempLocation.city].filter(x => x);
            locationDisplay.textContent = locParts.join('・') || '请选择所在地';
        }
    }
    
    // 用户名
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) {
        usernameDisplay.textContent = tempUsername || '用户名';
    }
}

// 性别选择器
function openGenderPicker() {
    // 检查编辑资料模态框是否打开
    const editModal = document.getElementById('editProfileModal');
    if (!editModal || !editModal.classList.contains('active')) {
        return;
    }
    
    const modal = document.getElementById('genderPickerModal');
    if (modal) modal.classList.add('active');
    
    // 高亮当前选择
    const options = document.querySelectorAll('#genderPickerModal .picker-option');
    options.forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.value === tempGender) {
            opt.classList.add('selected');
        }
    });
}

function closeGenderPicker() {
    const modal = document.getElementById('genderPickerModal');
    if (modal) modal.classList.remove('active');
}

function confirmGender() {
    const selected = document.querySelector('#genderPickerModal .picker-option.selected');
    if (selected) {
        tempGender = selected.dataset.value;
        document.getElementById('editGender').value = tempGender;
        updateDisplay();
    }
    closeGenderPicker();
}

// 初始化性别选择点击和页面初始化
document.addEventListener('DOMContentLoaded', function() {
    const genderOptions = document.querySelectorAll('#genderPickerModal .picker-option');
    genderOptions.forEach(opt => {
        opt.addEventListener('click', function() {
            genderOptions.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
        });
    });

    // 确保所有picker-modal都没有active类
    const allPickers = document.querySelectorAll('.picker-modal');
    allPickers.forEach(picker => {
        picker.classList.remove('active');
    });

    // 给profile-bottom区域加上更严格的事件阻止
    const profileBottom = document.querySelector('.profile-bottom');
    if (profileBottom) {
        profileBottom.addEventListener('click', function(e) {
            // 只允许点击settings-item时才执行，其他区域不执行任何操作
            if (!e.target.closest('.settings-item')) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }
        });
    }

    // 交易方式单选切换
    initTransactionType();
});

function initTransactionType() {
    const group = document.getElementById('transactionTypeGroup');
    if (!group) return;
    group.addEventListener('click', function(e) {
        const item = e.target.closest('.radio-item');
        if (!item) return;
        const radio = item.querySelector('input[type="radio"]');
        if (!radio) return;
        radio.checked = true;
        group.querySelectorAll('.radio-item').forEach(function(el) {
            el.classList.toggle('active', el.querySelector('input[type="radio"]').checked);
        });
        toggleSellerAddress();
    });
    // 初始化默认选中态
    group.querySelectorAll('.radio-item').forEach(function(el) {
        el.classList.toggle('active', el.querySelector('input[type="radio"]').checked);
    });
    toggleSellerAddress();
}

function toggleSellerAddress() {
    var group = document.getElementById('sellerAddressGroup');
    if (!group) return;
    var checked = document.querySelector('input[name="transactionType"]:checked');
    if (checked && checked.value === '2') {
        group.style.display = '';
        loadSellerAddresses();
    } else {
        group.style.display = 'none';
    }
}

async function loadSellerAddresses() {
    var select = document.getElementById('sellerAddressSelect');
    if (!select) return;
    if (select.dataset.loaded) return;
    // 立即标记已加载，防止并发重复调用（如编辑商品时 toggleSellerAddress 也调用此函数）
    select.dataset.loaded = '1';
    try {
        var res = await API.address.list();
        if (!isApiOk(res) || !res.data || res.data.length === 0) {
            select.style.display = 'none';
            var emptyEl = document.getElementById('sellerAddressEmpty');
            if (emptyEl) emptyEl.style.display = 'flex';
            delete select.dataset.loaded;
            return;
        }
        select.style.display = '';
        var emptyEl = document.getElementById('sellerAddressEmpty');
        if (emptyEl) emptyEl.style.display = 'none';
        var defaultAddr = null;
        select.innerHTML = '<option value="">请选择地址</option>' + res.data.map(function(a) {
            if (a.isDefault === 1) defaultAddr = a;
            var label = [a.name, a.phone, a.dormitoryName, a.detailAddress].filter(Boolean).join(' ');
            return '<option value="' + a.id + '">' + label + '</option>';
        }).join('');
        // 自动选中默认地址
        if (defaultAddr) {
            select.value = defaultAddr.id;
        }
    } catch (e) {
        select.innerHTML = '<option value="">加载失败</option>';
        delete select.dataset.loaded;
    }
}

// 生日选择器
function initBirthdayPicker() {
    const yearWheel = document.getElementById('yearWheel');
    const monthWheel = document.getElementById('monthWheel');
    const dayWheel = document.getElementById('dayWheel');
    
    // 生成年份
    let yearHtml = '';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1920; y--) {
        yearHtml += `<div class="picker-option" data-value="${y}">${y}年</div>`;
    }
    if (yearWheel) yearWheel.innerHTML = yearHtml;
    
    // 生成月份
    let monthHtml = '';
    for (let m = 1; m <= 12; m++) {
        monthHtml += `<div class="picker-option" data-value="${m}">${m}月</div>`;
    }
    if (monthWheel) monthWheel.innerHTML = monthHtml;
    
    // 生成日期
    updateDayOptions(31);
    
    // 添加点击事件
    addWheelEvents(yearWheel, 'year');
    addWheelEvents(monthWheel, 'month');
    addWheelEvents(dayWheel, 'day');
}

function updateDayOptions(days) {
    const dayWheel = document.getElementById('dayWheel');
    let dayHtml = '';
    for (let d = 1; d <= days; d++) {
        dayHtml += `<div class="picker-option" data-value="${d}">${d}日</div>`;
    }
    if (dayWheel) dayWheel.innerHTML = dayHtml;
    addWheelEvents(dayWheel, 'day');
}

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function addWheelEvents(wheel, type) {
    if (!wheel) return;
    
    const options = wheel.querySelectorAll('.picker-option');
    options.forEach(opt => {
        opt.addEventListener('click', function() {
            const siblings = wheel.querySelectorAll('.picker-option');
            siblings.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            
            if (type === 'year') {
                tempBirthday.year = parseInt(this.dataset.value);
            } else if (type === 'month') {
                tempBirthday.month = parseInt(this.dataset.value);
                const days = getDaysInMonth(tempBirthday.year || 2000, tempBirthday.month);
                updateDayOptions(days);
            } else if (type === 'day') {
                tempBirthday.day = parseInt(this.dataset.value);
            }
        });
    });
}

function openBirthdayPicker() {
    // 检查编辑资料模态框是否打开
    const editModal = document.getElementById('editProfileModal');
    if (!editModal || !editModal.classList.contains('active')) {
        return;
    }
    
    const modal = document.getElementById('birthdayPickerModal');
    if (modal) modal.classList.add('active');
    
    initBirthdayPicker();
    
    // 设置默认选中
    setTimeout(() => {
        const yearOpts = document.querySelectorAll('#yearWheel .picker-option');
        const monthOpts = document.querySelectorAll('#monthWheel .picker-option');
        const dayOpts = document.querySelectorAll('#dayWheel .picker-option');
        
        yearOpts.forEach(opt => {
            if (parseInt(opt.dataset.value) === tempBirthday.year) {
                opt.classList.add('selected');
            }
        });
        monthOpts.forEach(opt => {
            if (parseInt(opt.dataset.value) === tempBirthday.month) {
                opt.classList.add('selected');
            }
        });
        dayOpts.forEach(opt => {
            if (parseInt(opt.dataset.value) === tempBirthday.day) {
                opt.classList.add('selected');
            }
        });
    }, 50);
}

function closeBirthdayPicker() {
    const modal = document.getElementById('birthdayPickerModal');
    if (modal) modal.classList.remove('active');
}

function confirmBirthday() {
    if (tempBirthday.year && tempBirthday.month && tempBirthday.day) {
        const birthdayStr = `${tempBirthday.year}-${String(tempBirthday.month).padStart(2, '0')}-${String(tempBirthday.day).padStart(2, '0')}`;
        document.getElementById('editBirthday').value = birthdayStr;
        updateDisplay();
    }
    closeBirthdayPicker();
}

// 地区选择器
function initLocationPicker() {
    const provinceWheel = document.getElementById('provinceWheel');
    
    // 生成省份
    let provinceHtml = '';
    provinceData.forEach(p => {
        provinceHtml += `<div class="picker-option" data-value="${p}">${p}</div>`;
    });
    if (provinceWheel) provinceWheel.innerHTML = provinceHtml;
    
    // 添加省份点击事件
    const provinceOpts = provinceWheel.querySelectorAll('.picker-option');
    provinceOpts.forEach(opt => {
        opt.addEventListener('click', function() {
            const siblings = provinceWheel.querySelectorAll('.picker-option');
            siblings.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            
            tempLocation.province = this.dataset.value;
            updateCityOptions(tempLocation.province);
        });
    });
}

function updateCityOptions(province) {
    const cityWheel = document.getElementById('cityWheel');
    
    let cityHtml = '';
    const cities = cityData[province] || ['市辖区', '县'];
    
    cities.forEach(c => {
        cityHtml += `<div class="picker-option" data-value="${c}">${c}</div>`;
    });
    if (cityWheel) cityWheel.innerHTML = cityHtml;
    
    // 添加城市点击事件
    const cityOpts = cityWheel.querySelectorAll('.picker-option');
    cityOpts.forEach(opt => {
        opt.addEventListener('click', function() {
            const siblings = cityWheel.querySelectorAll('.picker-option');
            siblings.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            
            tempLocation.city = this.dataset.value;
        });
    });
}

function openLocationPicker() {
    // 检查编辑资料模态框是否打开
    const editModal = document.getElementById('editProfileModal');
    if (!editModal || !editModal.classList.contains('active')) {
        return;
    }
    
    const modal = document.getElementById('locationPickerModal');
    if (modal) modal.classList.add('active');
    
    initLocationPicker();
    
    // 设置默认选中
    setTimeout(() => {
        const provinceOpts = document.querySelectorAll('#provinceWheel .picker-option');
        provinceOpts.forEach(opt => {
            if (opt.dataset.value === tempLocation.province) {
                opt.classList.add('selected');
                if (tempLocation.province) {
                    updateCityOptions(tempLocation.province);
                }
            }
        });
        
        // 设置城市选中
        setTimeout(() => {
            const cityOpts = document.querySelectorAll('#cityWheel .picker-option');
            cityOpts.forEach(opt => {
                if (opt.dataset.value === tempLocation.city) {
                    opt.classList.add('selected');
                }
            });
        }, 50);
    }, 50);
}

function closeLocationPicker() {
    const modal = document.getElementById('locationPickerModal');
    if (modal) modal.classList.remove('active');
}

function confirmLocation() {
    // 直辖市只保存市名
    const directControlled = ['北京市', '天津市', '上海市', '重庆市'];
    if (directControlled.includes(tempLocation.province)) {
        document.getElementById('editLocation').value = tempLocation.province || '';
    } else {
        const locParts = [tempLocation.province, tempLocation.city].filter(x => x);
        document.getElementById('editLocation').value = locParts.join('・');
    }
    updateDisplay();
    closeLocationPicker();
}

// 昵称编辑
function openNicknameEdit() {
    // 检查编辑资料模态框是否打开
    const editModal = document.getElementById('editProfileModal');
    if (!editModal || !editModal.classList.contains('active')) {
        return;
    }
    
    const modal = document.getElementById('nicknameEditModal');
    const input = document.getElementById('nicknameInput');
    if (input) input.value = tempNickname;
    if (modal) modal.classList.add('active');
    setTimeout(() => input && input.focus(), 100);
}

function closeNicknameEdit() {
    const modal = document.getElementById('nicknameEditModal');
    if (modal) modal.classList.remove('active');
}

function confirmNickname() {
    const input = document.getElementById('nicknameInput');
    if (input) {
        tempNickname = input.value;
        document.getElementById('editNickname').value = tempNickname;
        updateDisplay();
    }
    closeNicknameEdit();
}

// 简介编辑
function openIntroEdit() {
    // 检查编辑资料模态框是否打开
    const editModal = document.getElementById('editProfileModal');
    if (!editModal || !editModal.classList.contains('active')) {
        return;
    }
    
    const modal = document.getElementById('introEditModal');
    const input = document.getElementById('introInput');
    if (input) input.value = tempIntro;
    if (modal) modal.classList.add('active');
    setTimeout(() => input && input.focus(), 100);
}

function closeIntroEdit() {
    const modal = document.getElementById('introEditModal');
    if (modal) modal.classList.remove('active');
}

function confirmIntro() {
    const input = document.getElementById('introInput');
    if (input) {
        tempIntro = input.value;
        document.getElementById('editIntro').value = tempIntro;
        updateDisplay();
    }
    closeIntroEdit();
}

// 用户名编辑
let tempUsername = '';

function openUsernameEdit() {
    // 检查编辑资料模态框是否打开
    const editModal = document.getElementById('editProfileModal');
    if (!editModal || !editModal.classList.contains('active')) {
        return;
    }
    
    const modal = document.getElementById('usernameEditModal');
    const input = document.getElementById('usernameInput');
    if (input) input.value = tempUsername;
    if (modal) modal.classList.add('active');
    setTimeout(() => input && input.focus(), 100);
}

function closeUsernameEdit() {
    const modal = document.getElementById('usernameEditModal');
    if (modal) modal.classList.remove('active');
}

function confirmUsername() {
    const input = document.getElementById('usernameInput');
    if (input) {
        tempUsername = input.value;
        document.getElementById('editUsername').value = tempUsername;
        updateDisplay();
    }
    closeUsernameEdit();
}

// 图片裁剪相关变量
let avatarCropState = {
    image: null,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    container: null,
    img: null
};

let bgCropState = {
    image: null,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    container: null,
    img: null
};

// 处理头像上传，打开裁剪页面
async function handleEditAvatarUpload(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        avatarCropState.image = e.target.result;
        openAvatarCrop();
    };
    reader.readAsDataURL(file);
}

// 处理封面上传，打开裁剪页面
async function handleCoverUpload(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        bgCropState.image = e.target.result;
        openBgCrop();
    };
    reader.readAsDataURL(file);
}

// 头像裁剪功能
function openAvatarCrop() {
    const modal = document.getElementById('avatarCropModal');
    const img = document.getElementById('avatarCropImage');
    const container = document.getElementById('avatarCropContainer');
    
    if (img && avatarCropState.image) {
        img.src = avatarCropState.image;
        avatarCropState.rotation = 0;
        avatarCropState.offsetX = 0;
        avatarCropState.offsetY = 0;
        avatarCropState.container = container;
        avatarCropState.img = img;
        
        img.onload = function() {
            fitImageToCropArea(avatarCropState, 'circle');
            setupDragHandlers(avatarCropState, 'circle');
        };
    }
    if (modal) modal.classList.add('active');
}

function closeAvatarCrop() {
    const modal = document.getElementById('avatarCropModal');
    if (modal) modal.classList.remove('active');
    avatarCropState.image = null;
}

function rotateAvatar() {
    avatarCropState.rotation += 90;
    applyTransform(avatarCropState);
}

// 背景图裁剪功能
function openBgCrop() {
    const modal = document.getElementById('bgCropModal');
    const img = document.getElementById('bgCropImage');
    const container = document.getElementById('bgCropContainer');
    
    if (img && bgCropState.image) {
        img.src = bgCropState.image;
        bgCropState.rotation = 0;
        bgCropState.offsetX = 0;
        bgCropState.offsetY = 0;
        bgCropState.container = container;
        bgCropState.img = img;
        
        img.onload = function() {
            fitImageToCropArea(bgCropState, 'rect');
            setupDragHandlers(bgCropState, 'rect');
        };
    }
    if (modal) modal.classList.add('active');
}

function closeBgCrop() {
    const modal = document.getElementById('bgCropModal');
    if (modal) modal.classList.remove('active');
    bgCropState.image = null;
}

function rotateBg() {
    bgCropState.rotation += 90;
    applyTransform(bgCropState);
}

// 适配图片到裁剪区域
function fitImageToCropArea(state, type) {
    const img = state.img;
    const container = state.container;
    if (!img || !container) return;
    
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    let targetWidth, targetHeight;
    
    if (type === 'circle') {
        const maxSize = 400;
        const minDim = Math.min(naturalWidth, naturalHeight);
        const scale = maxSize / minDim;
        
        targetWidth = naturalWidth * scale;
        targetHeight = naturalHeight * scale;
    } else {
        const maxWidth = 600;
        const maxHeight = 420;
        const scaleX = maxWidth / naturalWidth;
        const scaleY = maxHeight / naturalHeight;
        const scale = Math.max(scaleX, scaleY);
        
        targetWidth = naturalWidth * scale;
        targetHeight = naturalHeight * scale;
    }
    
    img.style.width = targetWidth + 'px';
    img.style.height = targetHeight + 'px';
    
    state.offsetX = 0;
    state.offsetY = 0;
    applyTransform(state);
}

// 应用变换
function applyTransform(state) {
    if (!state.img) return;
    
    const transform = `translate(${state.offsetX}px, ${state.offsetY}px) rotate(${state.rotation}deg)`;
    state.img.style.transform = transform;
}

// 设置拖拽事件
function setupDragHandlers(state, type) {
    const container = state.container;
    if (!container) return;
    
    const handleStart = function(e) {
        e.preventDefault();
        state.isDragging = true;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        state.startX = clientX - state.offsetX;
        state.startY = clientY - state.offsetY;
    };
    
    const handleMove = function(e) {
        if (!state.isDragging) return;
        e.preventDefault();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        if (type === 'rect') {
            state.offsetY = clientY - state.startY;
            state.offsetX = 0;
        } else {
            state.offsetX = clientX - state.startX;
            state.offsetY = clientY - state.startY;
        }
        
        applyTransform(state);
    };
    
    const handleEnd = function() {
        state.isDragging = false;
    };
    
    container.addEventListener('mousedown', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    container.addEventListener('touchstart', handleStart, { passive: false });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
}

// 确认裁剪 - 头像
async function confirmAvatarCrop() {
    const img = avatarCropState.img;
    if (!img || !avatarCropState.image) {
        closeAvatarCrop();
        return;
    }
    
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = 400;
        canvas.height = 400;
        
        ctx.save();
        ctx.translate(200, 200);
        ctx.rotate(avatarCropState.rotation * Math.PI / 180);
        
        const imgWidth = img.offsetWidth;
        const imgHeight = img.offsetHeight;
        
        const scaleX = img.naturalWidth / imgWidth;
        const scaleY = img.naturalHeight / imgHeight;
        
        const sourceX = (imgWidth / 2 - 200 - avatarCropState.offsetX) * scaleX;
        const sourceY = (imgHeight / 2 - 200 - avatarCropState.offsetY) * scaleY;
        const sourceW = 400 * scaleX;
        const sourceH = 400 * scaleY;
        
        ctx.translate(-200, -200);
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, 400, 400);
        ctx.restore();
        
        const circularCanvas = document.createElement('canvas');
        circularCanvas.width = 400;
        circularCanvas.height = 400;
        const ctx2 = circularCanvas.getContext('2d');
        
        ctx2.beginPath();
        ctx2.arc(200, 200, 190, 0, Math.PI * 2);
        ctx2.clip();
        ctx2.drawImage(canvas, 0, 0);
        
        circularCanvas.toBlob(async function(blob) {
            const formData = new FormData();
            formData.append('file', blob, 'avatar.jpg');
            
            const result = await API.common.upload(formData);
            if (isApiOk(result) && result.data) {
                tempAvatar = result.data;
                document.getElementById('editProfileAvatar').src = tempAvatar;
            }
        }, 'image/jpeg', 0.9);
        
    } catch (e) {
        console.error('裁剪失败', e);
        fallbackCrop('avatar');
    }
    
    closeAvatarCrop();
}

// 确认裁剪 - 背景图
async function confirmBgCrop() {
    const img = bgCropState.img;
    if (!img || !bgCropState.image) {
        closeBgCrop();
        return;
    }
    
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = 800;
        canvas.height = 560;
        
        ctx.save();
        ctx.translate(400, 280);
        ctx.rotate(bgCropState.rotation * Math.PI / 180);
        
        const imgWidth = img.offsetWidth;
        const imgHeight = img.offsetHeight;
        
        const scaleX = img.naturalWidth / imgWidth;
        const scaleY = img.naturalHeight / imgHeight;
        
        const sourceX = (imgWidth / 2 - 400 - bgCropState.offsetX) * scaleX;
        const sourceY = (imgHeight / 2 - 280 - bgCropState.offsetY) * scaleY;
        const sourceW = 800 * scaleX;
        const sourceH = 560 * scaleY;
        
        ctx.translate(-400, -280);
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, 800, 560);
        ctx.restore();
        
        canvas.toBlob(async function(blob) {
            const formData = new FormData();
            formData.append('file', blob, 'background.jpg');
            
            const result = await API.common.upload(formData);
            if (isApiOk(result) && result.data) {
                tempBackground = result.data;
                const backgroundDiv = document.getElementById('editProfileBackground');
                if (backgroundDiv) {
                    backgroundDiv.style.backgroundImage = `url(${tempBackground})`;
                    backgroundDiv.style.backgroundSize = 'cover';
                    backgroundDiv.style.backgroundPosition = 'center';
                    backgroundDiv.style.backgroundRepeat = 'no-repeat';
                }
            }
        }, 'image/jpeg', 0.9);
        
    } catch (e) {
        console.error('裁剪失败', e);
        fallbackCrop('background');
    }
    
    closeBgCrop();
}

// 备用裁剪方案
async function fallbackCrop(type) {
    const fileInput = type === 'avatar' 
        ? document.getElementById('editAvatarUpload') 
        : document.getElementById('coverUpload');
    
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);
        
        const result = await API.common.upload(formData);
        if (isApiOk(result) && result.data) {
            if (type === 'avatar') {
                tempAvatar = result.data;
                document.getElementById('editProfileAvatar').src = tempAvatar;
            } else {
                tempBackground = result.data;
                const backgroundDiv = document.getElementById('editProfileBackground');
                if (backgroundDiv) {
                    backgroundDiv.style.backgroundImage = `url(${tempBackground})`;
                    backgroundDiv.style.backgroundSize = 'cover';
                    backgroundDiv.style.backgroundPosition = 'center';
                    backgroundDiv.style.backgroundRepeat = 'no-repeat';
                }
            }
        }
    }
}

// 处理头像上传
async function handleAvatarUpload(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const result = await API.common.upload(formData);
        if (isApiOk(result) && result.data) {
            const avatarUrl = result.data;
            
            // 更新头像显示
            const avatarImg = document.getElementById('profileAvatar');
            if (avatarImg) {
                avatarImg.src = avatarUrl;
            }
            
            // 更新导航栏头像
            const navAvatar = document.querySelector('.nav-avatar img');
            if (navAvatar) {
                navAvatar.src = avatarUrl;
            }
            
            // 更新用户信息
            const userInfo = getUserInfo();
            if (userInfo) {
                userInfo.avatar = avatarUrl;
                setUserInfo(userInfo);
            }
            
            showToast('头像更新成功', 'success');
        } else {
            showToast(result.message || '头像上传失败', 'error');
        }
    } catch (error) {
        console.error('头像上传失败:', error);
        showToast('头像上传失败', 'error');
    }
}

// ==================== 修改密码 ====================
let changePwdTimer = null;
let changePwdCountdown = 0;

// 显示修改密码弹窗
function showChangePassword() {
    // 重置状态
    document.getElementById('changePwdStep1').style.display = '';
    document.getElementById('changePwdStep2').style.display = 'none';
    document.getElementById('changePwdTitle').textContent = '验证身份';
    document.getElementById('changePwdNextBtn').style.display = '';
    document.getElementById('changePwdConfirmBtn').style.display = 'none';
    document.getElementById('changePwdCode').value = '';
    document.getElementById('changePwdNewPwd').value = '';
    document.getElementById('changePwdConfirmPwd').value = '';
    resetSendCodeBtn();

    // 回显当前用户邮箱
    getUserInfoForChangePwd();
    openModal('changePasswordModal');
}

// 获取用户邮箱回显
async function getUserInfoForChangePwd() {
    var userInfo = getUserInfo();
    if (userInfo && userInfo.email) {
        document.getElementById('changePwdEmail').value = userInfo.email;
        return;
    }
    // 如果本地没有，通过接口获取
    if (userInfo && userInfo.userId) {
        try {
            var result = await API.auth.getUserInfoById(userInfo.userId);
            if (isApiOk(result) && result.data) {
                document.getElementById('changePwdEmail').value = result.data.email || '';
            }
        } catch (e) {}
    }
}

// 发送验证码
async function sendChangePwdCode() {
    var btn = document.getElementById('changePwdSendCodeBtn');
    if (btn.disabled) return;

    var email = document.getElementById('changePwdEmail').value;
    if (!email) {
        showToast('无法获取邮箱信息', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '发送中...';

    try {
        var result = await API.auth.sendCode(email, 4);

        if (isApiOk(result)) {
            showToast('验证码已发送', 'success');
            startChangePwdCountdown();
        } else {
            btn.disabled = false;
            btn.textContent = '重新发送';
            showToast(result.message || '发送失败', 'error');
        }
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '重新发送';
        showToast('发送失败，请重试', 'error');
    }
}

// 验证码倒计时
function startChangePwdCountdown() {
    changePwdCountdown = 60;
    var btn = document.getElementById('changePwdSendCodeBtn');
    btn.disabled = true;

    if (changePwdTimer) clearInterval(changePwdTimer);
    changePwdTimer = setInterval(function() {
        changePwdCountdown--;
        btn.textContent = changePwdCountdown + 's';
        if (changePwdCountdown <= 0) {
            clearInterval(changePwdTimer);
            changePwdTimer = null;
            resetSendCodeBtn();
        }
    }, 1000);
}

function resetSendCodeBtn() {
    var btn = document.getElementById('changePwdSendCodeBtn');
    btn.disabled = false;
    btn.textContent = '发送验证码';
}

// 点击"下一步"：切换至设置密码
async function handleChangePwdNext() {
    var code = document.getElementById('changePwdCode').value.trim();
    if (!code || code.length !== 6) {
        showToast('请输入6位验证码', 'warning');
        return;
    }

    var email = document.getElementById('changePwdEmail').value;
    var btn = document.getElementById('changePwdNextBtn');
    btn.disabled = true;
    btn.textContent = '验证中...';

    try {
        var result = await API.auth.verifyChangePwdCode({
            email: email,
            code: code
        });

        if (isApiOk(result)) {
            // 验证通过，切换到步骤2
            document.getElementById('changePwdStep1').style.display = 'none';
            document.getElementById('changePwdStep2').style.display = '';
            document.getElementById('changePwdTitle').textContent = '设置新密码';
            document.getElementById('changePwdNextBtn').style.display = 'none';
            document.getElementById('changePwdConfirmBtn').style.display = '';
            btn.disabled = false;
            btn.textContent = '下一步';
        } else {
            btn.disabled = false;
            btn.textContent = '下一步';
            showToast(result.message || '验证失败', 'error');
        }
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '下一步';
        showToast('验证失败，请重试', 'error');
    }
}

// 确认修改密码
async function confirmChangePwd() {
    var newPwd = document.getElementById('changePwdNewPwd').value;
    var confirmPwd = document.getElementById('changePwdConfirmPwd').value;

    if (!newPwd || newPwd.length < 6 || newPwd.length > 20) {
        showToast('密码长度需在6-20个字符之间', 'warning');
        return;
    }

    if (newPwd !== confirmPwd) {
        showToast('两次输入的密码不一致', 'warning');
        return;
    }

    var email = document.getElementById('changePwdEmail').value;
    var code = document.getElementById('changePwdCode').value.trim();

    var btn = document.getElementById('changePwdConfirmBtn');
    btn.disabled = true;
    btn.textContent = '修改中...';

    try {
        var result = await API.auth.updatePassword({
            email: email,
            code: code,
            newPassword: newPwd,
            confirmPassword: confirmPwd
        });

        if (isApiOk(result)) {
            showToast('密码修改成功', 'success');
            closeModal('changePasswordModal');
        } else {
            showToast(result.message || '修改失败', 'error');
        }
    } catch (e) {
        showToast('修改失败，请重试', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '确认修改';
    }
}

// ==================== 信誉历史（分页侧滑） ====================
let creditHistoryPageNum = 1;
let creditHistoryPageSize = 10;
let creditHistoryLoading = false;
let creditHistoryHasMore = true;

// 显示信誉历史
function showCreditHistory() {
    // 重置分页
    creditHistoryPageNum = 1;
    creditHistoryHasMore = true;
    openSlideCard('creditHistorySlide');
    loadCreditHistory(true);
}

// 加载信誉历史
async function loadCreditHistory(reset = false) {
    if (creditHistoryLoading) return;
    if (!creditHistoryHasMore && !reset) return;

    creditHistoryLoading = true;
    var content = document.getElementById('creditHistoryContent');
    if (!content) return;

    if (reset) {
        content.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    }

    try {
        var result = await API.auth.getCreditLogList({
            pageNum: creditHistoryPageNum,
            pageSize: creditHistoryPageSize
        });

        if (isApiOk(result) && result.data) {
            var records = result.data.records || [];
            var total = result.data.total || 0;

            if (reset) {
                content.innerHTML = '';
            }

            if (records.length === 0) {
                content.innerHTML =
                    '<div class="credit-history-empty">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' +
                            '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
                            '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>' +
                            '<line x1="12" y1="22.08" x2="12" y2="12"/>' +
                        '</svg>' +
                        '<span>暂无信誉变更记录</span>' +
                    '</div>';
                creditHistoryHasMore = false;
                return;
            }

            records.forEach(function(log) {
                var changeValue = log.changeValue;
                var isUp = changeValue >= 0;
                var changeClass = isUp ? 'credit-change-up' : 'credit-change-down';
                var changeSign = isUp ? '+' : '';
                var changeTypeText = getCreditChangeTypeText(log.changeType);
                var reasonText = getCreditReasonText(log.reason);

                // 箭头方向
                var arrowPath = isUp
                    ? '<path d="M12 19V5M5 12l7-7 7 7"/>'
                    : '<path d="M12 5v14M5 12l7 7 7-7"/>';

                var item = document.createElement('div');
                item.className = 'credit-history-item';
                item.innerHTML =
                    '<div class="credit-history-icon ' + (isUp ? 'icon-up' : 'icon-down') + '">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                            arrowPath +
                        '</svg>' +
                    '</div>' +
                    '<div class="credit-history-info">' +
                        '<span class="credit-history-type">' + escapeHtml(changeTypeText) + '</span>' +
                        '<span class="credit-history-reason">' + escapeHtml(reasonText) + '</span>' +
                        '<span class="credit-history-time">' + formatTime(log.updateTime) + '</span>' +
                    '</div>' +
                    '<div class="credit-history-value">' +
                        '<span class="credit-history-change ' + changeClass + '">' + changeSign + changeValue + '</span>' +
                        '<span class="credit-history-range">' + (log.beforeScore != null ? log.beforeScore : '--') + ' → ' + (log.afterScore != null ? log.afterScore : '--') + '</span>' +
                    '</div>';
                content.appendChild(item);
            });

            creditHistoryPageNum++;
            creditHistoryHasMore = records.length >= creditHistoryPageSize;

            // 加载更多触发器（滑动到底部）
            if (creditHistoryHasMore) {
                var loadMore = document.createElement('div');
                loadMore.className = 'credit-history-loadmore';
                loadMore.textContent = '上拉加载更多';
                content.appendChild(loadMore);

                content.addEventListener('scroll', function onScroll() {
                    if (content.scrollTop + content.clientHeight >= content.scrollHeight - 60) {
                        content.removeEventListener('scroll', onScroll);
                        if (creditHistoryHasMore) {
                            loadCreditHistory(false);
                        }
                    }
                });
            }
        } else {
            content.innerHTML = '<div class="empty-state">加载失败</div>';
        }
    } catch (e) {
        console.error('加载信誉历史失败:', e);
        if (reset) {
            content.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
        }
    } finally {
        creditHistoryLoading = false;
    }
}

// 信誉变更原因码映射（数字原因码 → 中文描述）
function getCreditReasonText(reason) {
    if (!reason) return '';
    var map = {
        '1': '违规行为处罚'
        // 预留扩展位：后续在此补充新的原因码映射
    };
    return map[reason] || reason;
}

// 信誉变更类型文本映射
function getCreditChangeTypeText(type) {
    var map = {
        'order_complete': '订单完成',
        'order_cancel': '订单取消',
        'report': '被举报',
        'appeal_success': '申诉成功',
        'system': '系统调整'
    };
    return map[type] || type || '未知';
}

// 提交反馈
function submitFeedback() {
    showToast('意见反馈功能开发中', 'info');
}

// 上传商品图片
function uploadGoodsImages() {
    document.getElementById('imageUpload').click();
}

// 加载首页数据（带防抖）
function loadHomeData() {
    // 防抖：如果正在加载，跳过
    if (homeDataLoading) {
        console.debug('首页数据加载防抖: 正在加载中，跳过重复请求');
        return;
    }
    
    console.log('加载首页数据');
    homeDataLoading = true;
    
    Promise.all([
        loadHomeGoods(),
        loadLatestGoods(),
        loadAnnouncements(),
        loadHomeDynamicList(),
        loadHomeOrderStats()
    ]).finally(() => {
        // 所有请求完成后重置标记
        setTimeout(() => {
            homeDataLoading = false;
        }, 500); // 500ms内不重复请求
    });
}

// 加载首页订单统计（数据概览）
async function loadHomeOrderStats() {
    try {
        var result = await API.goods.getOrderStats();
        if (isApiOk(result) && result.data) {
            var stats = result.data;
            var idle = stats.myIdleCount || 0;
            var ongoing = stats.ongoingOrderCount || 0;
            var completed = stats.completedOrderCount || 0;

            // 更新文本数字
            if (document.getElementById('myProductsCount')) {
                document.getElementById('myProductsCount').textContent = idle;
            }
            if (document.getElementById('myOngoingCount')) {
                document.getElementById('myOngoingCount').textContent = ongoing;
            }
            if (document.getElementById('myCompletedCount')) {
                document.getElementById('myCompletedCount').textContent = completed;
            }

            // 更新环形图
            var circumference = 43.98;
            var total = idle + ongoing + completed;
            var ringData = [
                { id: 'ringProduct', value: idle },
                { id: 'ringActive', value: ongoing },
                { id: 'ringDone', value: completed }
            ];
            ringData.forEach(function(item) {
                var el = document.getElementById(item.id);
                if (el) {
                    var pct = total > 0 ? item.value / total : 0;
                    el.setAttribute('stroke-dashoffset', circumference * (1 - pct));
                }
            });

            // 更新柱状图
            var maxVal = Math.max(idle, ongoing, completed, 1);
            var bars = document.querySelectorAll('.home-stat-chart .home-stat-bar');
            if (bars.length >= 3) {
                bars[0].style.height = (idle / maxVal * 100) + '%';
                bars[1].style.height = (ongoing / maxVal * 100) + '%';
                bars[2].style.height = (completed / maxVal * 100) + '%';
            }
        }
    } catch (e) {
        console.error('加载订单统计失败:', e);
    }
}

// 加载首页商品
async function loadHomeGoods() {
    console.log('加载首页商品');
    try {
        const result = await API.goods.list({ pageNum: 1, pageSize: 7 });
        console.log('首页商品API返回:', result);
        if (isApiOk(result) && result.data) {
            const goodsList = result.data.records || [];
            const container = document.getElementById('homeProductList');
            if (container) {
                container.innerHTML = goodsList.map(goods => createHomeGoodsCard(goods)).join('');
                initHomeProductNav();

                // 加载后获取收藏状态和数量
                goodsList.forEach(goods => {
                    fetchCollectStatus(goods.goodsId);
                });
            }
        }
    } catch (error) {
        console.error('加载首页商品失败:', error);
    }
}

// 初始化最新上架左右切换按钮
function initHomeProductNav() {
    if (window.innerWidth > 768) return;
    var container = document.getElementById('homeProductList');
    if (!container) return;
    var parent = container.parentNode;
    if (parent.querySelector('.product-list-btn')) return;

    var prev = document.createElement('button');
    prev.className = 'product-list-btn prev';
    prev.setAttribute('aria-label', '上一个商品');
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
    prev.addEventListener('click', function () {
        container.scrollBy({ left: -120, behavior: 'smooth' });
    });

    var next = document.createElement('button');
    next.className = 'product-list-btn next';
    next.setAttribute('aria-label', '下一个商品');
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
    next.addEventListener('click', function () {
        container.scrollBy({ left: 120, behavior: 'smooth' });
    });

    parent.insertBefore(prev, container);
    parent.insertBefore(next, container.nextSibling);
}

// 加载最新商品
async function loadLatestGoods() {
    console.log('加载最新商品');
    try {
        const result = await API.goods.list({ pageNum: 1, pageSize: 7 });
        console.log('最新商品API返回:', result);
        if (isApiOk(result) && result.data) {
            const goodsList = result.data.records || [];
            const container = document.getElementById('latestProducts');
            if (container) {
                container.innerHTML = goodsList.map(goods => createHomeGoodsCard(goods)).join('');
                
                // 加载后获取收藏状态和数量
                goodsList.forEach(goods => {
                    fetchCollectStatus(goods.goodsId);
                });
            }
        }
    } catch (error) {
        console.error('加载最新商品失败:', error);
    }
}

// 加载首页任务
// ==================== 公告自动轮播（淡入淡出） ====================
let announcementList = [];
let announcementIndex = 0;
let announceTimer = null;
const ANNOUNCE_INTERVAL = 3000;
let announceHovered = false;

async function loadAnnouncements() {
    try {
        const result = await API.announcement.userNoticePage({ pageNum: 1, pageSize: 10 });

        if (isApiOk(result) && result.data && result.data.records && result.data.records.length > 0) {
            announcementList = result.data.records;
        } else {
            announcementList = [];
        }
    } catch (error) {
        console.error('加载公告失败:', error);
        announcementList = [];
    }
    buildAnnounceCarousel();
    loadCampusNewsCategories();
    loadCampusNews();
}


/** 构建轮播 DOM + 指示器，启动自动播放 */
function buildAnnounceCarousel() {
    var carousel = document.getElementById('announcementCarousel');
    var dotsEl = document.getElementById('announcementDots');
    if (!carousel) return;

    carousel.innerHTML = '';
    if (dotsEl) dotsEl.innerHTML = '';

    if (announcementList.length === 0) {
        carousel.innerHTML = '<div class="home-announce-slide active"><div class="home-announce-text">暂无公告</div></div>';
        setBarSingleMode(true);
        stopAnnounceTimer();
        return;
    }

    announcementList.forEach(function(item, i) {
        var slide = document.createElement('div');
        slide.className = 'home-announce-slide' + (i === announcementIndex ? ' active' : '');
        var parts = [];
        if (item.publisher) parts.push('发布者：' + escapeHtml(item.publisher));
        if (item.publishTime) parts.push('发布时间：' + formatDate(item.publishTime));
        slide.innerHTML = '<div class="home-announce-text">' + escapeHtml(item.content || '') + '</div>' +
            '<div class="home-announce-meta">' + parts.join(' | ') + '</div>';
        carousel.appendChild(slide);
    });

    if (dotsEl && announcementList.length > 1) {
        announcementList.forEach(function(_, i) {
            var dot = document.createElement('span');
            dot.className = 'home-announce-dot' + (i === announcementIndex ? ' active' : '');
            dot.setAttribute('data-index', i);
            dot.onclick = function() { goToAnnouncement(parseInt(this.getAttribute('data-index'))); };
            dotsEl.appendChild(dot);
        });
    }

    syncCarouselHeight();

    if (announcementList.length === 1) {
        setBarSingleMode(true);
        stopAnnounceTimer();
    } else {
        setBarSingleMode(false);
        startAnnounceTimer();
    }

    // 绑定悬停暂停/恢复（只绑一次）
    var bar = document.getElementById('announcementBar');
    if (bar && !bar._announceHoverBound) {
        bar._announceHoverBound = true;
        bar.addEventListener('mouseenter', function() { announceHovered = true; });
        bar.addEventListener('mouseleave', function() { announceHovered = false; });
    }
}

function goToAnnouncement(index) {
    if (announcementList.length === 0) return;
    if (index < 0) index = announcementList.length - 1;
    if (index >= announcementList.length) index = 0;
    if (index === announcementIndex) return;

    var carousel = document.getElementById('announcementCarousel');
    var dotsEl = document.getElementById('announcementDots');
    if (!carousel) return;

    var slides = carousel.querySelectorAll('.home-announce-slide');
    if (!slides.length) return;

    slides[announcementIndex].classList.remove('active');
    announcementIndex = index;
    slides[announcementIndex].classList.add('active');
    syncCarouselHeight();

    if (dotsEl) {
        var dots = dotsEl.querySelectorAll('.home-announce-dot');
        dots.forEach(function(d, i) { d.classList.toggle('active', i === announcementIndex); });
    }
}

function prevAnnouncement() {
    if (announcementList.length <= 1) return;
    goToAnnouncement(announcementIndex - 1);
    restartAnnounceTimer();
}

function nextAnnouncement() {
    if (announcementList.length <= 1) return;
    goToAnnouncement(announcementIndex + 1);
    restartAnnounceTimer();
}

function startAnnounceTimer() {
    stopAnnounceTimer();
    if (announcementList.length <= 1) return;
    announceTimer = setInterval(function() {
        if (!announceHovered) goToAnnouncement(announcementIndex + 1);
    }, ANNOUNCE_INTERVAL);
}

function stopAnnounceTimer() {
    if (announceTimer) { clearInterval(announceTimer); announceTimer = null; }
}

function restartAnnounceTimer() { stopAnnounceTimer(); startAnnounceTimer(); }

function syncCarouselHeight() {
    var carousel = document.getElementById('announcementCarousel');
    if (!carousel) return;
    var active = carousel.querySelector('.home-announce-slide.active');
    if (active) carousel.style.height = active.offsetHeight + 'px';
}

function setBarSingleMode(single) {
    var nav = document.querySelector('.home-announce-nav');
    var dots = document.getElementById('announcementDots');
    if (nav) nav.style.display = single ? 'none' : '';
    if (dots) dots.style.display = single ? 'none' : '';
}

// 加载首页平台动态列表（最新5条）
async function loadHomeDynamicList() {
    try {
        var result = await API.announcement.userDynamicPage({ pageNum: 1, pageSize: 5 });
        var container = document.getElementById('homeDynamicList');
        if (!container) return;
        if (isApiOk(result) && result.data && result.data.records && result.data.records.length > 0) {
            container.innerHTML = result.data.records.map(function(item) {
                return '<div class="home-activity-item">' +
                    '<span class="home-activity-dot home-activity-dot-dynamic"></span>' +
                    '<span class="home-activity-text">' + escapeHtml(item.content || '') + '</span>' +
                    '</div>';
            }).join('');
        } else {
            container.innerHTML = '<div class="home-list-empty">暂无动态</div>';
        }
    } catch (e) {
        console.error('加载首页动态失败', e);
        var el = document.getElementById('homeDynamicList');
        if (el) el.innerHTML = '<div class="home-list-empty">暂无动态</div>';
    }
}

// ==================== 校园资讯（分类 + 轮播） ====================
let newsCategoryList = [];
let selectedNewsCategoryId = '';

async function loadCampusNewsCategories() {
    try {
        const result = await API.newsCategory.list();
        if (isApiOk(result) && result.data) {
            newsCategoryList = result.data;
            const sel = document.getElementById('newsCategoryFilter');
            if (!sel) return;
            sel.innerHTML = '<option value="">全部分类</option>' +
                newsCategoryList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
            sel.value = selectedNewsCategoryId;
        }
    } catch (e) {
        console.error('加载资讯分类失败:', e);
    }
}

function onNewsCategoryChange() {
    const sel = document.getElementById('newsCategoryFilter');
    selectedNewsCategoryId = sel ? sel.value : '';
    loadCampusNews();
}

async function loadCampusNews() {
    const params = { pageNum: 1, pageSize: 10 };
    if (selectedNewsCategoryId) {
        params.categoryId = parseInt(selectedNewsCategoryId);
    }
    try {
        const result = await API.campusNews.page(params);
        const rawItems = (isApiOk(result) && result.data && result.data.records && result.data.records.length > 0)
            ? result.data.records.slice(0, 5)
            : [];
        initCampusNewsCarousel(rawItems);
    } catch (e) {
        console.error('加载校园资讯失败:', e);
        initCampusNewsCarousel([]);
    }
}

// 辅助：调整hex颜色亮度（amount为正值变亮，负值变暗）
function adjustColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ==================== 三图展示核心逻辑 ====================
let galleryItems = [];
let galleryPosition = 0;
let gallerySavedPos = -1;
let galleryClickPos = -1;
const GALLERY_BG = ['#FF7D00', '#2563EB', '#10B981'];

function initCampusNewsCarousel(items) {
    const track = document.getElementById('galleryTrack');
    if (!track) return;

    galleryItems = items && items.length > 0 ? items : [];
    galleryPosition = 0;
    gallerySavedPos = -1;
    galleryClickPos = -1;

    if (galleryItems.length === 0) {
        track.innerHTML = '<div class="gallery-slide gallery-slide-empty">' +
            '<div class="gallery-empty-content">' +
            '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
            '<span>' + escapeHtml('该分类暂无资讯') + '</span>' +
            '</div></div>'.repeat(3);
        updateGalleryTransform();
        updateGalleryNav();
        return;
    }

    const trackItems = [...galleryItems];
    if (galleryItems.length >= 3) {
        trackItems.push(galleryItems[0], galleryItems[1], galleryItems[2]);
    }

    track.innerHTML = trackItems.map(function(item, i) {
        var isOrig = i < galleryItems.length;
        var tag = item.categoryName || (isOrig ? (i === 0 ? '资讯' : '校园') : '');
        var hasCover = item.coverImage;
        var colorIdx = i % 3;
        var html = '<div class="gallery-slide" data-track-index="' + i + '">' +
            '<div class="gallery-slide-inner">';
        if (hasCover) {
            html += '<img class="gallery-slide-img" src="' + item.coverImage + '" alt="' + escapeHtml(item.title) + '" loading="lazy">';
        } else {
            html += '<div class="gallery-slide-img gallery-slide-placeholder" style="background:linear-gradient(135deg,' + GALLERY_BG[colorIdx] + ',' + adjustColor(GALLERY_BG[colorIdx], 30) + ')">' +
                '<span>' + escapeHtml((item.title || '\U0001f4e2').charAt(0)) + '</span></div>';
        }
        html += '<div class="gallery-slide-overlay">' +
            '<h3 class="gallery-slide-title">' + escapeHtml(item.title || '') + '</h3>' +
            '<p class="gallery-slide-desc">' + escapeHtml((item.content || '').length > 50 ? item.content.slice(0, 50) + '...' : item.content || '') + '</p>' +
            '</div></div></div>';
        return html;
    }).join('');

    track.onclick = function(e) {
        var slide = e.target.closest('.gallery-slide');
        if (!slide) return;
        var trackIdx = parseInt(slide.dataset.trackIndex);
        var pos = trackIdx - galleryPosition;
        if (pos >= 0 && pos <= 2) {
            onGalleryCardClick(pos);
        }
    };

    updateGalleryTransform();
    updateGalleryNav();
}

function updateGalleryTransform() {
    var track = document.getElementById('galleryTrack');
    if (!track) return;
    var pct = window.innerWidth <= 768 ? 100 : 33.333;
    track.style.transform = 'translateX(-' + (galleryPosition * pct) + '%)';
}

function updateGalleryNav() {
    var show = galleryItems.length >= 3;
    var prev = document.getElementById('galleryPrevBtn');
    var next = document.getElementById('galleryNextBtn');
    if (prev) prev.style.display = show ? '' : 'none';
    if (next) next.style.display = show ? '' : 'none';
}

function getDataIndex(trackIdx) {
    return trackIdx < galleryItems.length ? trackIdx : trackIdx - galleryItems.length;
}

function onGalleryCardClick(pos) {
    if (galleryItems.length === 0) return;
    var popup = document.getElementById('carouselPopup');
    if (!popup) return;
    var dataIdx = getDataIndex(galleryPosition + pos);
    var item = galleryItems[dataIdx];
    if (!item) return;

    if (popup.classList.contains('active') && galleryClickPos === pos) {
        closeCarouselPopup();
        return;
    }
    if (popup.classList.contains('active')) {
        popup.classList.remove('active');
        gallerySavedPos = -1;
    }

    galleryClickPos = pos;

    if (pos === 0) {
        showGalleryPopup(item);
        return;
    }

    gallerySavedPos = galleryPosition;
    galleryPosition = dataIdx;
    updateGalleryTransform();
    showGalleryPopup(item);
}

function showGalleryPopup(item) {
    document.getElementById('popupTag').textContent = item.tag || '';
    document.getElementById('popupTitle').textContent = item.title || '';
    document.getElementById('popupDesc').textContent = item.content || '暂无详细内容';
    document.getElementById('popupPublisher').textContent = item.publisherName ? ('发布者: ' + item.publisherName) : '';
    document.getElementById('popupTime').textContent = '';
    document.getElementById('carouselPopup').classList.add('active');
}

function closeCarouselPopup() {
    document.getElementById('carouselPopup').classList.remove('active');
    if (gallerySavedPos >= 0) {
        galleryPosition = gallerySavedPos;
        updateGalleryTransform();
        gallerySavedPos = -1;
        galleryClickPos = -1;
    } else {
        galleryClickPos = -1;
    }
}

function galleryPage(direction) {
    if (galleryItems.length < 3) return;
    var popupEl = document.getElementById('carouselPopup');
    if (popupEl && popupEl.classList.contains('active')) {
        popupEl.classList.remove('active');
    }
    gallerySavedPos = -1;
    galleryClickPos = -1;

    var track = document.getElementById('galleryTrack');
    var n = galleryItems.length;

    if (direction > 0 && galleryPosition >= n - 1) {
        galleryPosition = n;
        updateGalleryTransform();
        track.addEventListener('transitionend', function rewind() {
            track.removeEventListener('transitionend', rewind);
            track.style.transition = 'none';
            galleryPosition = 0;
            updateGalleryTransform();
            void track.offsetHeight;
            track.style.transition = '';
        });
    } else if (direction < 0 && galleryPosition <= 0) {
        track.style.transition = 'none';
        galleryPosition = n;
        updateGalleryTransform();
        void track.offsetHeight;
        track.style.transition = '';
        galleryPosition = n - 1;
        updateGalleryTransform();
    } else {
        galleryPosition += direction;
        updateGalleryTransform();
    }
}
// 重置商品列表
function resetGoodsList() {
    goodsPageNum = 1;
    goodsHasMore = true;
    goodsLoading = false;
}

// 加载商品列表
async function loadGoodsList() {
    console.log('加载商品列表, pageNum:', goodsPageNum);
    if (goodsLoading || !goodsHasMore) return;
    
    goodsLoading = true;
    const container = document.getElementById('fullProductList');
    
    if (goodsPageNum === 1) {
        container.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    }

    try {
        const params = {
            pageNum: goodsPageNum,
            pageSize: goodsPageSize
        };
        
        if (goodsCategoryId) {
            params.categoryId = goodsCategoryId;
        }
        if (goodsKeyword) {
            params.keyword = goodsKeyword;
        }

        console.log('请求商品列表参数:', params);
        const result = await API.goods.list(params);
        console.log('商品列表API返回:', result);

        if (isApiOk(result) && result.data) {
            const pageResult = result.data;
            let goodsList = [];
            
            if (pageResult.records) {
                goodsList = pageResult.records;
            } else if (Array.isArray(pageResult)) {
                goodsList = pageResult;
            }
            
            if (goodsPageNum === 1) {
                container.innerHTML = '';
            }

            if (goodsList && goodsList.length > 0) {
                goodsList.forEach(goods => {
                    container.innerHTML += createGoodsCard(goods);
                });
                
                // 加载后获取收藏状态和数量
                goodsList.forEach(goods => {
                    fetchCollectStatus(goods.goodsId);
                });
                
                if (pageResult.total) {
                    const loaded = goodsPageNum * goodsPageSize;
                    goodsHasMore = loaded < pageResult.total;
                } else {
                    goodsHasMore = goodsList.length >= goodsPageSize;
                }
                
                goodsPageNum++;
            } else {
                if (goodsPageNum === 1) {
                    container.innerHTML = '<div class="loading-placeholder">暂无商品</div>';
                }
                goodsHasMore = false;
            }
        } else {
            if (goodsPageNum === 1) {
                container.innerHTML = '<div class="loading-placeholder">暂无商品</div>';
            }
            goodsHasMore = false;
        }
    } catch (error) {
        console.error('加载商品失败:', error);
        if (goodsPageNum === 1) {
            container.innerHTML = '<div class="loading-placeholder">加载失败</div>';
        }
    } finally {
        goodsLoading = false;
    }
}

// 获取商品收藏状态（带防抖）
async function fetchCollectStatus(goodsId) {
    // 防抖：如果正在请求中或短时间内已请求过，跳过
    if (pendingCollectRequests.has(goodsId)) {
        console.debug(`收藏状态请求防抖: 商品${goodsId}已在请求中，跳过`);
        return;
    }
    
    // 标记为正在请求
    pendingCollectRequests.add(goodsId);
    
    try {
        // 获取收藏状态
        const statusResult = await API.goods.getCollectStatus(goodsId);
        let isCollected = false;
        if (isApiOk(statusResult)) {
            isCollected = statusResult.data;
        }
        
        // 更新商品卡片的收藏状态
        const cards = document.querySelectorAll(`.goods-card[data-goods-id="${goodsId}"]`);
        cards.forEach(card => {
            const collectBtn = card.querySelector('.goods-collect-btn');
            if (!collectBtn) return;
            
            const svg = collectBtn.querySelector('svg');
            
            if (isCollected) {
                collectBtn.classList.add('collected');
                svg.setAttribute('fill', '#374151');
                svg.setAttribute('stroke', '#374151');
            } else {
                collectBtn.classList.remove('collected');
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
            }
        });
        
        // 更新商品详情页的收藏状态
        const detailContainer = document.querySelector(`.goods-detail-container[data-goods-id="${goodsId}"]`);
        if (detailContainer) {
            const collectBtn = detailContainer.querySelector('.detail-collect-btn');
            if (collectBtn) {
                const svg = collectBtn.querySelector('svg');
                
                if (isCollected) {
                    collectBtn.classList.add('collected');
                    svg.setAttribute('fill', '#374151');
                    svg.setAttribute('stroke', '#374151');
                } else {
                    collectBtn.classList.remove('collected');
                    svg.setAttribute('fill', 'none');
                    svg.setAttribute('stroke', 'currentColor');
                }
            }
        }
    } catch (error) {
        console.error('获取收藏状态失败:', error);
    } finally {
        // 请求完成，移除防抖标记
        pendingCollectRequests.delete(goodsId);
    }
}

// 创建商品卡片
function createGoodsCard(goods) {
    let imageHtml = '';
    if (goods.firstImage) {
        imageHtml = `<img src="${goods.firstImage}" alt="${escapeHtml(goods.name)}" class="product-image" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                     <div class="product-image-placeholder" style="display:none;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    } else {
        imageHtml = `<div class="product-image-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    }

    return `
        <div class="product-card goods-card market-goods-card" data-goods-id="${goods.goodsId}" data-collect-count="${goods.collectCount || 0}">
            <div class="product-image-wrapper" onclick="showGoodsDetail(${goods.goodsId})">
                ${imageHtml}
            </div>
            <div class="product-info">
                <div class="goods-title-row">
                    <p class="product-name goods-title" onclick="showGoodsDetail(${goods.goodsId})">${escapeHtml(goods.name)}</p>
                    <button type="button" class="goods-collect-btn" onclick="toggleCollect(event, ${goods.goodsId})" aria-label="收藏">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        <span class="collect-count">${goods.collectCount || 0}</span>
                    </button>
                </div>
                <div class="goods-price-row">
                    <p class="product-price">¥${goods.price ? goods.price.toFixed(2) : '0.00'}</p>
                    <button type="button" class="goods-cart-btn" onclick="onMarketCartClick(event, ${goods.goodsId})" aria-label="查看商品">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                            <path d="M6 6h15l-1.5 9h-12L6 6z"/>
                            <circle cx="9" cy="20" r="1.25"/>
                            <circle cx="18" cy="20" r="1.25"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function onMarketCartClick(event, goodsId) {
    event.stopPropagation();
    showQuickCart(goodsId);
}

/** 快速加购弹窗（复用商品详情的完整布局，底部改为数量+加入购物车） */
async function showQuickCart(goodsId) {
    openModal('productDetailModal');
    const body = document.getElementById('productDetailBody');
    const footer = document.getElementById('productDetailFooter');
    body.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    footer.innerHTML = '';

    try {
        const result = await API.goods.detail(goodsId);
        if (!isApiOk(result) || !result.data) {
            body.innerHTML = '<div class="loading-placeholder">加载失败</div>';
            return;
        }
        const goods = result.data;
        // 复用完整的商品详情渲染
        renderGoodsDetail(goods, true);

        // 覆盖底部为快速加购控件
        const stock = goods.stock != null ? goods.stock : 999;
        if (stock <= 0) {
            footer.innerHTML = `
                <div class="qc-footer-inner">
                    <span style="flex:1;text-align:center;color:#999;font-size:14px">该商品已售空</span>
                </div>
            `;
        } else {
            footer.innerHTML = `
                <div class="qc-footer-inner">
                    <div class="qc-footer-qty">
                        <span class="qc-footer-label">数量</span>
                        <div class="qc-footer-control">
                            <button type="button" class="qc-f-btn" onclick="changeQuickQty(-1)" id="qcMinusBtn">−</button>
                            <input type="number" class="qc-f-input" id="qcQtyInput" value="1" min="1" max="${stock}" readonly>
                            <button type="button" class="qc-f-btn" onclick="changeQuickQty(1)" id="qcPlusBtn">+</button>
                        </div>
                    </div>
                    <button type="button" class="qc-footer-add-btn" onclick="addToCart(${goods.goodsId})">加入购物车</button>
                </div>
            `;
        }
    } catch (e) {
        console.error('加载商品信息失败:', e);
        body.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

/** 修改快速加购数量 */
function changeQuickQty(delta) {
    const input = document.getElementById('qcQtyInput');
    if (!input) return;
    let val = parseInt(input.value) || 1;
    val += delta;
    if (val < 1) val = 1;
    const max = parseInt(input.getAttribute('max')) || 999;
    if (val > max) val = max;
    input.value = val;
}

/** 加入购物车 */
async function addToCart(goodsId) {
    const input = document.getElementById('qcQtyInput');
    const quantity = input ? parseInt(input.value) || 1 : 1;
    try {
        const result = await API.cart.add(goodsId, quantity);
        if (isApiOk(result)) {
            showToast('已加入购物车', 'success');
            closeModal('productDetailModal');
        } else {
            showToast(result.message || '加入购物车失败', 'error');
        }
    } catch (e) {
        console.error('加入购物车失败:', e);
        showToast('网络错误', 'error');
    }
}

// 首页商品卡片
function createHomeGoodsCard(goods) {
    let imageHtml = '';
    if (goods.firstImage) {
        imageHtml = `<img src="${goods.firstImage}" alt="${escapeHtml(goods.name)}" class="product-image" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                     <div class="product-image-placeholder" style="display:none;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    } else {
        imageHtml = `<div class="product-image-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    }

    return `
        <div class="product-card goods-card" data-goods-id="${goods.goodsId}" data-collect-count="${goods.collectCount || 0}">
            <div class="product-image-wrapper" onclick="showGoodsDetail(${goods.goodsId})">
                ${imageHtml}
            </div>
            <div class="product-info">
                <p class="product-name goods-title" onclick="showGoodsDetail(${goods.goodsId})">${escapeHtml(goods.name)}</p>
                <div class="goods-meta">
                    <span class="goods-category">${escapeHtml(goods.categoryName || '未分类')}</span>
                    <button class="goods-collect-btn" onclick="toggleCollect(event, ${goods.goodsId})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        <span class="collect-count">${goods.collectCount || 0}</span>
                    </button>
                </div>
                <p class="product-price">¥${goods.price ? goods.price.toFixed(2) : '0.00'}</p>
            </div>
        </div>
    `;
}

// 切换收藏状态 - 抖音同款流畅效果
async function toggleCollect(event, goodsId) {
    event.stopPropagation();
    
    // 防重复请求
    if (pendingCollectRequests.has(goodsId)) {
        return;
    }
    
    pendingCollectRequests.add(goodsId);
    
    // 获取所有相关卡片和详情页
    const cards = document.querySelectorAll(`.goods-card[data-goods-id="${goodsId}"]`);
    const detailContainer = document.querySelector(`.goods-detail-container[data-goods-id="${goodsId}"]`);
    let currentCollected = false;
    let currentCount = 0;
    
    // 从第一张卡片或详情页获取当前状态
    if (cards.length > 0) {
        const firstCard = cards[0];
        const collectBtn = firstCard.querySelector('.goods-collect-btn');
        currentCollected = collectBtn ? collectBtn.classList.contains('collected') : false;
        currentCount = parseInt(firstCard.getAttribute('data-collect-count') || '0');
    } else if (detailContainer) {
        const collectBtn = detailContainer.querySelector('.detail-collect-btn');
        currentCollected = collectBtn ? collectBtn.classList.contains('collected') : false;
        currentCount = parseInt(detailContainer.getAttribute('data-collect-count') || '0');
    }
    
    try {
        // 乐观更新：立即切换UI，不等待后端
        const newCollected = !currentCollected;
        const newCount = newCollected ? currentCount + 1 : Math.max(0, currentCount - 1);
        
        // 更新商品卡片
        updateCollectUI(cards, '.goods-collect-btn', '.collect-count', newCollected, newCount);
        
        // 更新商品详情页
        if (detailContainer) {
            updateDetailCollectUI(detailContainer, newCollected, newCount);
        }
        
        // 显示收藏状态提示
        showToast(newCollected ? '已收藏' : '已取消收藏', 'success');
        
        const result = await API.goods.collect(goodsId);
        if (!isApiOk(result)) {
            showToast(result.message || '收藏操作失败', 'error');
        }
        
    } catch (error) {
        console.error('收藏操作异常:', error);
    } finally {
        // 移除请求锁
        setTimeout(() => {
            pendingCollectRequests.delete(goodsId);
        }, 300); // 300ms防抖间隔
    }
}

// 更新商品卡片的收藏UI
function updateCollectUI(cards, btnSelector, countSelector, isCollected, count) {
    cards.forEach(card => {
        card.setAttribute('data-collect-count', count);
        const collectBtn = card.querySelector(btnSelector);
        if (!collectBtn) return;
        
        const svg = collectBtn.querySelector('svg');
        const countSpan = collectBtn.querySelector(countSelector);
        
        if (isCollected) {
            collectBtn.classList.add('collected');
            svg.setAttribute('fill', '#374151');
            svg.setAttribute('stroke', '#374151');
        } else {
            collectBtn.classList.remove('collected');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
        }
        
        if (countSpan) {
            countSpan.textContent = count;
        }
    });
}

// 更新商品详情页的收藏UI
function updateDetailCollectUI(container, isCollected, count) {
    container.setAttribute('data-collect-count', count);
    const collectBtn = container.querySelector('.detail-collect-btn');
    if (!collectBtn) return;
    
    const svg = collectBtn.querySelector('svg');
    const countSpan = collectBtn.querySelector('.detail-collect-count');
    
    if (isCollected) {
        collectBtn.classList.add('collected');
        svg.setAttribute('fill', '#374151');
        svg.setAttribute('stroke', '#374151');
    } else {
        collectBtn.classList.remove('collected');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
    }
    
    if (countSpan) {
        countSpan.textContent = count;
    }
}

// 显示商品详情
async function showGoodsDetail(goodsId) {
    openModal('productDetailModal');
    const body = document.getElementById('productDetailBody');
    
    body.innerHTML = '<div class="loading-placeholder">加载中...</div>';

    try {
        const result = await API.goods.detail(goodsId);
        
        if (isApiOk(result) && result.data) {
            const goods = result.data;
            // 从列表数据中补充审核状态（myProductsData 是当前 tab 的商品列表）
            const listItem = myProductsData.find(p => p.goodsId == goodsId);
            if (listItem) {
                if (goods.auditStatus === undefined) goods.auditStatus = listItem.auditStatus;
                if (goods.shelfStatus === undefined) goods.shelfStatus = listItem.shelfStatus;
            }
            renderGoodsDetail(goods);
            // 缓存当前查看的商品审核状态，供上下架按钮判断是否显示编辑
            window._currentDetailAuditStatus = goods.auditStatus;
        } else {
            // 接口未开发，显示模板
            const mockData = {
                userId: 1,
                username: '用户昵称',
                avatar: '',
                goodsId: goodsId,
                createTime: new Date().toISOString(),
                imageUrls: [],
                description: '商品描述',
                price: 99.99
            };
            renderGoodsDetail(mockData);
        }
    } catch (error) {
        console.error('加载商品详情失败:', error);
        // 显示模板
        const mockData = {
            userId: 1,
            username: '用户昵称',
            avatar: '',
            goodsId: goodsId,
            createTime: new Date().toISOString(),
            imageUrls: [],
            description: '商品描述',
            price: 99.99
        };
        renderGoodsDetail(mockData);
    }
}

// 渲染商品详情
function renderGoodsDetail(goods, skipFooter) {
    const body = document.getElementById('productDetailBody');
    const footer = document.getElementById('productDetailFooter');

    const imageList = goods.imageUrls || goods.images || [];
    const totalImages = imageList.length;
    const isOwnProduct = currentUser && (goods.userId == currentUser.userId);

    // 图片轮播项
    let slidesHtml = '';
    if (totalImages > 0) {
        slidesHtml = imageList.map((url, index) => `
            <div class="slider-slide ${index === 0 ? 'active' : ''}">
                <img src="${url}" alt="商品图片" loading="${index === 0 ? 'eager' : 'lazy'}"/>
            </div>
        `).join('');
    } else {
        slidesHtml = `
            <div class="slider-slide active">
                <div class="no-image-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    <span>暂无图片</span>
                </div>
            </div>
        `;
    }

    // 圆点指示器
    let dotsHtml = '';
    if (totalImages > 1) {
        dotsHtml = `<div class="gd-dots">${imageList.map((_, i) => `<span class="gd-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>`;
    }

    // 左右箭头 + 计数器
    let arrowsHtml = '';
    if (totalImages > 1) {
        arrowsHtml = `
            <button class="slider-btn prev" onclick="prevSlide()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
            <button class="slider-btn next" onclick="nextSlide()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>
            <div class="image-counter">1/${totalImages}</div>
        `;
    }

    // 标签
    const catMap = { 'books':'教材', 'electronics':'电子', 'daily':'生活用品', 'other':'其他' };
    const tradeMap = { 'self':'自提', 'express':'快递', 'both':'自提/快递' };
    let tagsHtml = '';
    const tagPieces = [];
    if (goods.category) tagPieces.push(`<span class="gd-tag">${catMap[goods.category] || goods.category}</span>`);
    if (goods.condition) tagPieces.push(`<span class="gd-tag">${escapeHtml(goods.condition)}</span>`);
    // tradeType 仅在价格行右侧显示，不重复展示
    if (tagPieces.length > 0) tagsHtml = `<div class="gd-tags">${tagPieces.join('')}</div>`;

    // 卖家统计
    let sellerStats = '';
    if (goods.creditScore != null) sellerStats += getCreditLevel(goods.creditScore).name;
    if (goods.goodsCount != null) sellerStats += (sellerStats ? ' · ' : '') + goods.goodsCount + '件商品';

    // 默认头像 SVG
    const defaultAvatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="#E5E5E5" rx="24"/><circle cx="24" cy="18" r="8" fill="#CCCCCC"/><path d="M10 40c0-8 6-14 14-14s14 6 14 14" fill="#CCCCCC"/></svg>');

    const sellerSub = sellerStats || '点击查看卖家主页';

    body.innerHTML = `
        <div class="goods-detail-container" data-goods-id="${goods.goodsId}" data-collect-count="${goods.collectCount || 0}">
            <div class="gd-hero">
                <div class="gd-hero-toolbar">
                    <button type="button" class="gd-float-btn" onclick="closeModal('productDetailModal')" aria-label="返回">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                </div>
                <div class="image-slider">${slidesHtml}</div>
                ${dotsHtml}
                ${arrowsHtml}
            </div>

            <div class="gd-sheet">
                <button type="button" class="gd-seller-card" onclick="showSellerProfile(${goods.userId})">
                    <img src="${goods.avatar || defaultAvatar}" alt="" class="gd-seller-avatar"/>
                    <div class="gd-seller-meta">
                        <span class="gd-seller-name">${escapeHtml(goods.nickname || goods.username)}</span>
                        <span class="gd-seller-sub">${sellerSub}</span>
                    </div>
                    <svg class="gd-seller-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6 6-6"/></svg>
                </button>

                <div class="gd-content">
                    <div class="gd-price-block">
                        <div class="gd-price-main">
                            <span class="gd-price">¥${goods.price ? Number(goods.price).toFixed(2) : '0.00'}</span>
                            ${goods.originalPrice ? `<span class="gd-original-price">¥${Number(goods.originalPrice).toFixed(2)}</span>` : ''}
                        </div>
                        <div class="gd-price-extra">
                            ${goods.stock != null ? (goods.stock > 0 ? `<span class="gd-stock">库存 ${goods.stock} 件</span>` : `<span class="gd-stock gd-stock-empty">已售空</span>`) : ''}
                            <span class="gd-price-right">
                                ${renderAdminGoodsId(goods.goodsId)}
                                ${goods.transactionType === 1 ? '<span class="gd-price-tag">卖家上门</span>' : ''}
                                ${goods.transactionType === 2 ? '<span class="gd-price-tag" style="cursor:pointer" onclick="showPickupAddress(this)" data-dormitory="' + (goods.addressDormitory || '') + '">买家自提</span>' : ''}
                                ${goods.transactionType === 3 ? '<span class="gd-price-tag">自行协商</span>' : ''}
                                ${goods.stock > 0 ? `<span class="gd-cart-icon" onclick="addToCart(${goods.goodsId})" title="加入购物车">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                                    </span>` : ''}
                            </span>
                        </div>
                    </div>
                    <h1 class="gd-title">${escapeHtml(goods.name || goods.title || goods.goodsName || '')}</h1>
                    <div class="gd-info-row">
                        <span class="gd-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                            ${formatDateTime(goods.createTime)}
                        </span>
                        ${goods.location ? `<span class="gd-meta-item gd-meta-item--location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${escapeHtml(goods.location)}</span>` : ''}
                    </div>
                    ${tagsHtml}
                </div>

                <div class="gd-desc-section">
                    <div class="gd-section-header">
                        <span class="gd-section-title">商品描述</span>
                    </div>
                    <div class="gd-desc-text">${escapeHtml(goods.description || '暂无描述')}</div>
                </div>

                <div class="gd-bottom-space"></div>
            </div>
        </div>
    `;

    // 底部操作栏
    if (!skipFooter) {
    if (isOwnProduct) {
        if (goods.auditStatus === -2 || goods.auditStatus === -1 || goods.auditStatus === 0) {
            // 申诉待处理：不显示编辑，只根据上下架状态显示对应按钮
            if (goods.shelfStatus === 1) {
                footer.innerHTML = `<button class="gd-action-btn gd-action-danger" onclick="offShelfFromDetail(${goods.goodsId})">下架商品</button>`;
            } else {
                footer.innerHTML = `<button class="gd-action-btn gd-action-primary" onclick="onShelfFromDetail(${goods.goodsId})">重新上架</button>`;
            }
        } else {
            // 已出售或已售空的商品不显示操作按钮
            if (goods.saleStatus === 1 || goods.stock === 0) {
                footer.innerHTML = '';
            } else {
                // 根据上下架状态显示对应按钮
                const actionBtn = goods.shelfStatus === 1
                    ? `<button class="gd-action-btn gd-action-danger" onclick="offShelfFromDetail(${goods.goodsId})">下架商品</button>`
                    : `<button class="gd-action-btn gd-action-primary" onclick="onShelfFromDetail(${goods.goodsId})">重新上架</button>`;
                footer.innerHTML = `
                    <button class="gd-action-btn gd-action-outline" onclick="editMyProduct(${goods.goodsId})">编辑商品</button>
                    ${actionBtn}
                `;
            }
        }
    } else {
        footer.innerHTML = `
            <button class="gd-action-btn gd-action-outline" onclick="chatWithSeller(${goods.userId}, '${escapeHtml(goods.nickname || goods.username)}')">聊聊</button>
        `;
    }
    }

    // 初始化轮播
    if (totalImages > 1) {
        initImageSlider(totalImages);
    }
}

// 渲染管理员可见的商品ID（仅role=0的管理员可见）
function renderAdminGoodsId(goodsId) {
    if (!currentUser || (currentUser.role !== 0 && currentUser.role !== '0')) {
        return '';
    }
    return `<span class="admin-goods-id-compact" onclick="copyGoodsId(${goodsId}, this)" title="点击复制商品ID">
        <span class="admin-goods-id-text">ID:${goodsId}</span>
        <span class="admin-goods-id-copy-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
        </span>
        <span class="admin-goods-id-copied" style="display:none;">已复制</span>
    </span>`;
}

// 复制商品ID
async function copyGoodsId(goodsId, el) {
    try {
        await navigator.clipboard.writeText(String(goodsId));
        const copyIcon = el.querySelector('.admin-goods-id-copy-icon');
        const copiedText = el.querySelector('.admin-goods-id-copied');
        if (copyIcon) copyIcon.style.display = 'none';
        if (copiedText) copiedText.style.display = 'inline';
        el.classList.add('copied');
        setTimeout(() => {
            if (copyIcon) copyIcon.style.display = '';
            if (copiedText) copiedText.style.display = 'none';
            el.classList.remove('copied');
        }, 1500);
    } catch (e) {
        // 降级方案：使用传统方法
        const textarea = document.createElement('textarea');
        textarea.value = String(goodsId);
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const copyIcon = el.querySelector('.admin-goods-id-copy-icon');
        const copiedText = el.querySelector('.admin-goods-id-copied');
        if (copyIcon) copyIcon.style.display = 'none';
        if (copiedText) copiedText.style.display = 'inline';
        el.classList.add('copied');
        setTimeout(() => {
            if (copyIcon) copyIcon.style.display = '';
            if (copiedText) copiedText.style.display = 'none';
            el.classList.remove('copied');
        }, 1500);
    }
}

// 立即购买
function buyNow(goodsId) {
    showToast('立即购买功能开发中', 'info');
}

// 与卖家聊聊
async function chatWithSeller(userId, username) {
    if (!userId) { showToast('用户信息不完整', 'error'); return; }
    if (userId == getCurrentUserId()) { showToast('不能和自己聊天', 'info'); return; }
    closeModal('productDetailModal');
    try {
        const res = await API.chat.createSession(userId);
        if (isApiOk(res)) {
            showPage('messages');
            setTimeout(() => openChatSession(res.data.sessionId, userId, username), 300);
        } else {
            showToast(res.message || '创建会话失败', 'error');
        }
    } catch (e) {
        showToast('网络异常', 'error');
    }
}

// 分享商品
function shareGoods() {
    showToast('分享功能开发中', 'info');
}

// 举报商品
function reportGoods(goodsId) {
    showToast('举报功能开发中', 'info');
}

// ========== 意见反馈 ==========
var feedbackUploadedUrls = [];
var feedbackPendingUploads = 0;

function handleFeedbackFiles(files) {
    if (!files || files.length === 0) return;
    var previewContainer = document.getElementById('feedbackPreview');
    if (!previewContainer) return;

    Array.from(files).forEach(function(file) {
        if (!file.type.startsWith('image/')) {
            showToast('仅支持图片格式', 'warning');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('图片不能超过 10MB', 'warning');
            return;
        }
        // 显示本地预览
        var reader = new FileReader();
        reader.onload = function(e) {
            var wrap = document.createElement('div');
            wrap.className = 'feedback-img-wrap';

            var img = document.createElement('img');
            img.src = e.target.result;
            wrap.appendChild(img);

            var delBtn = document.createElement('button');
            delBtn.className = 'feedback-img-del';
            delBtn.innerHTML = '&times;';
            delBtn.setAttribute('data-url', ''); // 占位，上传后更新
            delBtn.onclick = function() {
                var idx = feedbackUploadedUrls.indexOf(this.getAttribute('data-url'));
                if (idx > -1) feedbackUploadedUrls.splice(idx, 1);
                wrap.remove();
            };
            wrap.appendChild(delBtn);

            previewContainer.appendChild(wrap);

            feedbackPendingUploads++;
            // 上传到服务器
            (function(w, f) {
                var formData = new FormData();
                formData.append('file', f);
                API.common.upload(formData).then(function(res) {
                    feedbackPendingUploads--;
                    if (isApiOk(res) && res.data) {
                        feedbackUploadedUrls.push(res.data);
                        w.querySelector('.feedback-img-del').setAttribute('data-url', res.data);
                    } else {
                        showToast('图片上传失败', 'error');
                    }
                }).catch(function() {
                    feedbackPendingUploads--;
                    showToast('图片上传失败', 'error');
                });
            })(wrap, file);
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('feedbackFileInput').value = '';
}

async function submitFeedback() {
    var category = document.getElementById('feedbackCategory').value;
    var content = document.getElementById('feedbackContent').value.trim();
    var contact = document.getElementById('feedbackContact').value.trim();

    if (!content) {
        showToast('请输入反馈内容', 'warning');
        return;
    }

    // 等待所有图片上传完成
    while (feedbackPendingUploads > 0) {
        await new Promise(function(resolve) { setTimeout(resolve, 200); });
    }

    try {
        var res = await API.feedback.submit({
            category: parseInt(category),
            content: content,
            contact: contact || undefined,
            images: feedbackUploadedUrls.length > 0 ? feedbackUploadedUrls.join(',') : undefined
        });
        if (isApiOk(res)) {
            showToast('感谢您的反馈！', 'success');
            document.getElementById('feedbackContent').value = '';
            document.getElementById('feedbackContact').value = '';
            document.getElementById('feedbackPreview').innerHTML = '';
            feedbackUploadedUrls = [];
        } else {
            showToast(res.message || '提交失败', 'error');
        }
    } catch (e) {
        showToast('网络异常', 'error');
    }
}

// 显示卖家个人中心
function showSellerProfile(userId) {
    closeModal('productDetailModal');
    // 打开卖家个人中心页面
    openModal('sellerProfileModal');
    loadSellerProfile(userId);
}

// 当前查看的卖家ID
let currentSellerId = null;
let sellerProfileTab = 'products';

// 加载卖家个人中心
async function loadSellerProfile(userId) {
    currentSellerId = userId;
    const body = document.getElementById('sellerProfileBody');
    
    body.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    
    try {
        console.log('调用接口获取卖家信息，userId:', userId);
        const result = await API.auth.getUserInfoById(userId);
        console.log('卖家信息接口返回:', result);
        
        if (isApiOk(result) && result.data) {
            const sellerData = result.data;
            // 先渲染页面结构
            renderSellerProfile(sellerData);
            // 然后立即加载闲置商品
            loadSellerProducts();
        } else {
            console.error('获取卖家信息失败:', result.message || result);
            // 使用默认数据兜底
            const defaultSellerData = {
                userId: userId,
                username: '卖家昵称',
                nickname: '卖家昵称',
                avatar: '',
                bio: '这个人很懒，什么都没写~',
                backgroundImage: '',
                creditScore: 0
            };
            renderSellerProfile(defaultSellerData);
            loadSellerProducts();
        }
    } catch (error) {
        console.error('加载卖家信息异常:', error);
        // 使用默认数据兜底
        const defaultSellerData = {
            userId: userId,
            username: '卖家昵称',
            nickname: '卖家昵称',
            avatar: '',
            bio: '这个人很懒，什么都没写~',
            backgroundImage: '',
            creditScore: 0
        };
        renderSellerProfile(defaultSellerData);
        loadSellerProducts();
    }
}

// 渲染卖家个人中心
function renderSellerProfile(seller) {
    const body = document.getElementById('sellerProfileBody');
    
    body.innerHTML = `
        <div class="profile-display-container">
            <!-- 顶部背景和头像区域 -->
            <div class="profile-display-header">
                <div class="profile-background" id="sellerBackground" style="${seller.background ? `background: url(${seller.background}) center/cover no-repeat` : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);'}">
                </div>
                <div class="profile-avatar-section">
                    <img src="${seller.avatar || 'https://campus-easytrade.oss-cn-beijing.aliyuncs.com/337f92f6-885b-470f-b024-7eed296773d4.jpg'}" alt="卖家头像" class="profile-avatar-large"/>
                </div>
            </div>
            
            <!-- 卖家基本信息 -->
            <div class="profile-info-section">
                <div class="profile-name-section">
                    <h2 class="profile-name-large">${escapeHtml(seller.nickname || seller.username)}</h2>
                </div>
                <p class="profile-bio">${escapeHtml(seller.intro || seller.bio || '这个人很懒，什么都没写~')}</p>
                
                <!-- 信誉积分 -->
                <div class="profile-credit-section">
                    <span class="profile-credit-label">信誉积分</span>
                    <span class="profile-credit-value">${seller.creditScore || 0}</span>
                </div>
                
                <!-- 性别、年龄、居住地 -->
                <div class="profile-meta-section">
                    <span class="profile-meta-item">${getGenderText(seller.gender)}</span>
                    <span class="profile-meta-divider">·</span>
                    <span class="profile-meta-item">${calculateAge(seller.birthday)}</span>
                    <span class="profile-meta-divider">·</span>
                    <span class="profile-meta-item">${seller.location || '未填写'}</span>
                </div>
                
                <!-- 功能按钮 -->
                <div class="profile-actions">
                    <button class="btn-edit-profile" onclick="closeModal('sellerProfileModal'); chatWithSeller(${seller.userId}, '${escapeHtml(seller.nickname || seller.username)}')">私信</button>
                </div>
            </div>
            
            <!-- 闲置和任务标签 -->
            <div class="profile-tabs-section">
                <button class="profile-tab-btn ${sellerProfileTab === 'products' ? 'active' : ''}" onclick="switchSellerTab('products')">闲置</button>
                <button class="profile-tab-btn ${sellerProfileTab === 'tasks' ? 'active' : ''}" onclick="switchSellerTab('tasks')">任务</button>
            </div>
            
            <!-- 内容区域 -->
            <div class="profile-content-section" id="sellerContent">
                ${renderSellerContent()}
            </div>
        </div>
    `;
}

// 渲染内容区域
function renderSellerContent() {
    if (sellerProfileTab === 'products') {
        return '<div class="loading-placeholder">加载中...</div>';
    } else {
        return '<div class="loading-placeholder">暂无数据</div>';
    }
}

// 加载卖家的闲置商品
async function loadSellerProducts() {
    const content = document.getElementById('sellerContent');
    if (!content) return;
    
    console.log('loadSellerProducts 被调用，currentSellerId:', currentSellerId);
    content.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    
    try {
        const params = {
            pageNum: 1,
            pageSize: 10
        };
        console.log('调用接口 /user/goods/commom-goods/' + currentSellerId, '参数:', params);
        const result = await API.goods.salerGoods(currentSellerId, params);
        console.log('接口返回结果:', result);
        
        if (result && result.records && result.records.length > 0) {
            console.log('开始渲染卖家闲置列表，共', result.records.length, '个商品');
            content.innerHTML = result.records.map((goods, index) => {
                console.log(`处理第${index + 1}个商品:`, goods);
                let imageHtml = '';
                let imageUrl = '';
                
                // 根据后端 GoodsQueryVO 使用 firstImage 字段
                if (goods.firstImage) {
                    console.log(`商品${index + 1}使用firstImage:`, goods.firstImage);
                    imageUrl = goods.firstImage;
                } else if (goods.imageUrls && goods.imageUrls.length > 0) {
                    console.log(`商品${index + 1}使用imageUrls:`, goods.imageUrls);
                    imageUrl = goods.imageUrls[0];
                } else if (goods.images) {
                    console.log(`商品${index + 1}使用images:`, goods.images);
                    const images = goods.images.split(',');
                    if (images.length > 0) {
                        imageUrl = images[0];
                    }
                } else {
                    console.log(`商品${index + 1}没有找到图片字段，所有字段:`, Object.keys(goods));
                }
                
                console.log(`商品${index + 1}最终imageUrl:`, imageUrl);
                
                // 根据后端 GoodsQueryVO 使用 name 字段
                const goodsName = goods.name || goods.goodsName || '';
                
                if (imageUrl) {
                    imageHtml = `<img src="${imageUrl}" alt="${escapeHtml(goodsName)}" class="slide-product-image">`;
                } else {
                    imageHtml = `<div class="slide-product-image" style="display:flex;align-items:center;justify-content:center;background:var(--bg-hover);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;color:var(--text-muted);">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                        </svg>
                    </div>`;
                }
                
                return `
                    <div class="slide-item slide-product-item" onclick="closeModal('sellerProfileModal');showGoodsDetail(${goods.goodsId})">
                        ${imageHtml}
                        <div class="slide-product-info">
                            <div class="slide-item-header" style="margin-bottom:4px;">
                                <span class="slide-item-title">${escapeHtml(goodsName)}</span>
                            </div>
                            <div class="slide-item-price" style="margin:0;">¥${goods.price ? goods.price.toFixed(2) : '0.00'}</div>
                            <div class="slide-item-meta" style="margin-bottom:12px;">
                                <span>${goods.categoryName || ''}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            content.innerHTML = '<div class="loading-placeholder">暂无闲置</div>';
        }
    } catch (error) {
        console.error('加载卖家闲置失败:', error);
        content.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

// 切换闲置/任务标签
function switchSellerTab(tab) {
    sellerProfileTab = tab;
    
    // 更新标签状态
    document.querySelectorAll('#sellerProfileBody .profile-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`#sellerProfileBody .profile-tab-btn[onclick="switchSellerTab('${tab}')"]`).classList.add('active');
    
    // 更新内容
    if (tab === 'products') {
        console.log('切换到闲置标签，开始加载数据');
        loadSellerProducts();
    } else {
        document.getElementById('sellerContent').innerHTML = renderSellerContent();
    }
}

// 个人中心当前标签
let profileTab = 'products';
// 个人中心商品分页变量
let profileProductsPageNum = 1;
let profileProductsPageSize = 10;
let profileProductsLoading = false;
let profileProductsHasMore = true;
let profileScrollListenerAdded = false;

// 切换个人中心标签
function switchProfileTab(tab) {
    profileTab = tab;
    
    // 更新标签状态
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.profile-tab-btn[data-tab="${tab}"]`).classList.add('active');
    
    // 更新内容
    if (tab === 'products') {
        console.log('个人中心切换到闲置标签，开始加载数据');
        loadProfileProducts(true);
    } else {
        document.getElementById('profileContentSection').innerHTML = '<div class="loading-placeholder">暂无数据</div>';
    }
}

// 加载个人中心内容
async function loadProfileContent() {
    console.log('加载个人中心内容');
    profileTab = 'products';
    
    // 重置标签状态
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('.profile-tab-btn[data-tab="products"]').classList.add('active');
    
    // 添加滚动事件监听（只添加一次）
    if (!profileScrollListenerAdded) {
        const profileContent = document.getElementById('profileContentSection');
        if (profileContent) {
            profileContent.addEventListener('scroll', function() {
                if (currentPage === 'profile' && profileTab === 'products' && !profileProductsLoading && profileProductsHasMore) {
                    const scrollTop = profileContent.scrollTop;
                    const scrollHeight = profileContent.scrollHeight;
                    const clientHeight = profileContent.clientHeight;
                    
                    if (scrollTop + clientHeight >= scrollHeight - 100) {
                        loadProfileProducts(false);
                    }
                }
            });
            profileScrollListenerAdded = true;
        }
    }
    
    // 调用接口获取用户详细信息
    await loadUserInfoForProfile();
    
    // 加载闲置商品
    loadProfileProducts(true);
}

// 加载用户信息并更新UI
async function loadUserInfoForProfile() {
    try {
        const userInfo = getUserInfo();
        if (!userInfo || !userInfo.userId) return;
        
        console.log('调用接口获取用户信息，userId:', userInfo.userId);
        const result = await API.auth.getUserInfoById(userInfo.userId);
        console.log('用户信息接口返回:', result);
        
        if (isApiOk(result) && result.data) {
            const userData = {
                ...result.data,
                role: userInfo.role // 保持原角色
            };
            
            // 更新左侧个人信息区域
            updateProfileLeftSection(userData);
            
            // 更新右侧钱包和信誉档案
            updateProfileRightSection(userData);
            
            // 同步更新localStorage和currentUser
            updateCurrentUser(userData);

            // 同步刷新右上角下拉框的余额、信誉分等信息
            updateUserInfo();
        } else {
            console.error('获取用户信息失败:', result.message || result);
        }
    } catch (error) {
        console.error('加载用户信息异常:', error);
    }
}

// 计算年龄
function calculateAge(birthday) {
    if (!birthday) return '--';
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age + '岁';
}

// 获取性别显示文本
function getGenderText(gender) {
    if (gender === 1) return '男';
    if (gender === 2) return '女';
    return '未知';
}

function getStatusColor(status) {
    var map = { 0: '#FF7D00', 1: '#1677FF', 2: '#722ED1', 3: '#07C160', 4: '#999', 5: '#FAAD14', 6: '#999' };
    return map[status] || '#999';
}

function getStatusText(status) {
    var map = { 0: '待付款', 1: '已付款', 2: '待发货', 3: '已完成', 4: '已取消', 5: '退款中', 6: '已退款' };
    return map[status] || '未知';
}

// 更新左侧个人信息区域
function updateProfileLeftSection(userData) {
    // 更新背景图
    const backgroundEl = document.getElementById('profileBackground');
    if (backgroundEl) {
        if (userData.background) {
            backgroundEl.style.backgroundImage = `url(${userData.background})`;
            backgroundEl.style.backgroundSize = 'cover';
            backgroundEl.style.backgroundPosition = 'center';
            backgroundEl.style.backgroundRepeat = 'no-repeat';
        } else {
            backgroundEl.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
    }
    
    // 更新头像
    const avatarImg = document.getElementById('profileAvatar');
    if (avatarImg && userData.avatar) {
        avatarImg.src = userData.avatar;
    }
    
    // 更新昵称
    const nicknameEl = document.getElementById('profileNickname');
    if (nicknameEl && userData.nickname) {
        nicknameEl.textContent = userData.nickname;
    } else if (nicknameEl && userData.username) {
        nicknameEl.textContent = userData.username;
    }
    
    // 更新简介
    const bioEl = document.getElementById('profileBio');
    if (bioEl && userData.intro) {
        bioEl.textContent = userData.intro;
    } else if (bioEl && userData.bio) {
        bioEl.textContent = userData.bio;
    } else if (bioEl) {
        bioEl.textContent = '这个人很懒，什么都没写~';
    }
    
    // 更新信誉分
    const creditEl = document.getElementById('profileCreditScore');
    if (creditEl && userData.creditScore !== undefined) {
        creditEl.textContent = userData.creditScore;
    }
    
    // 更新性别
    const genderEl = document.getElementById('profileGender');
    if (genderEl) {
        genderEl.textContent = getGenderText(userData.gender);
    }
    
    // 更新年龄
    const ageEl = document.getElementById('profileAge');
    if (ageEl) {
        ageEl.textContent = calculateAge(userData.birthday);
    }
    
    // 更新居住地
    const locationEl = document.getElementById('profileLocation');
    if (locationEl && userData.location) {
        locationEl.textContent = userData.location;
    } else if (locationEl) {
        locationEl.textContent = '未填写';
    }
}

// 更新右侧钱包和信誉档案
function updateProfileRightSection(userData) {
    // 更新可用余额
    const balanceEl = document.getElementById('walletBalance');
    if (balanceEl && userData.balance !== undefined) {
        balanceEl.textContent = `¥${parseFloat(userData.balance).toFixed(2)}`;
    }
    
    // 更新冻结金额
    const frozenEl = document.getElementById('walletFrozen');
    if (frozenEl && userData.frozenAmount !== undefined) {
        frozenEl.textContent = `¥${parseFloat(userData.frozenAmount).toFixed(2)}`;
    }
    
    // 更新信誉分
    const scoreEl = document.getElementById('walletCreditScore');
    if (scoreEl && userData.creditScore !== undefined) {
        scoreEl.textContent = userData.creditScore;

        // 计算等级
        const levelEl = document.getElementById('creditLevel');
        if (levelEl) {
            const level = Math.min(Math.floor(userData.creditScore / 10) + 1, 10);
            levelEl.textContent = `Lv.${level}`;
        }
    }
}

// 加载个人中心闲置商品
async function loadProfileProducts(reset = true) {
    const content = document.getElementById('profileContentSection');
    if (!content) return;

    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.userId) {
        content.innerHTML = '<div class="loading-placeholder">请先登录</div>';
        return;
    }

    if (reset) {
        profileProductsPageNum = 1;
        profileProductsHasMore = true;
        content.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    }

    if (profileProductsLoading || !profileProductsHasMore) return;
    
    profileProductsLoading = true;

    console.log('loadProfileProducts 被调用，userId:', userInfo.userId, 'page:', profileProductsPageNum);
    
    try {
        const params = {
            pageNum: profileProductsPageNum,
            pageSize: profileProductsPageSize
        };
        console.log('调用接口 /user/goods/commom-goods/' + userInfo.userId, '参数:', params);
        const result = await API.goods.salerGoods(userInfo.userId, params);
        console.log('接口返回结果:', result);
        
        let goodsList = [];
        if (result && result.records && result.records.length > 0) {
            goodsList = result.records;
        } else if (result && Array.isArray(result)) {
            goodsList = result;
        }
        
        if (goodsList.length > 0) {
            console.log('开始渲染个人中心闲置列表，共', goodsList.length, '个商品');
            
            const html = goodsList.map((goods, index) => {
                console.log(`处理第${index + 1}个商品:`, goods);
                let imageHtml = '';
                let imageUrl = '';
                
                // 根据后端 GoodsQueryVO 使用 firstImage 字段
                if (goods.firstImage) {
                    console.log(`商品${index + 1}使用firstImage:`, goods.firstImage);
                    imageUrl = goods.firstImage;
                } else if (goods.imageUrls && goods.imageUrls.length > 0) {
                    console.log(`商品${index + 1}使用imageUrls:`, goods.imageUrls);
                    imageUrl = goods.imageUrls[0];
                } else if (goods.images) {
                    console.log(`商品${index + 1}使用images:`, goods.images);
                    const images = goods.images.split(',');
                    if (images.length > 0) {
                        imageUrl = images[0];
                    }
                } else {
                    console.log(`商品${index + 1}没有找到图片字段，所有字段:`, Object.keys(goods));
                }
                
                console.log(`商品${index + 1}最终imageUrl:`, imageUrl);
                
                // 根据后端 GoodsQueryVO 使用 name 字段
                const goodsName = goods.name || goods.goodsName || '';
                
                if (imageUrl) {
                    imageHtml = `<img src="${imageUrl}" alt="${escapeHtml(goodsName)}" class="slide-product-image">`;
                } else {
                    imageHtml = `<div class="slide-product-image" style="display:flex;align-items:center;justify-content:center;background:var(--bg-hover);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;color:var(--text-muted);">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                        </svg>
                    </div>`;
                }
                
                return `
                    <div class="slide-item slide-product-item" onclick="showGoodsDetail(${goods.goodsId})">
                        ${imageHtml}
                        <div class="slide-product-info">
                            <div class="slide-item-header" style="margin-bottom:4px;">
                                <span class="slide-item-title">${escapeHtml(goodsName)}</span>
                            </div>
                            <div class="slide-item-price" style="margin:0;">¥${goods.price ? goods.price.toFixed(2) : '0.00'}</div>
                            <div class="slide-item-meta" style="margin-bottom:12px;">
                                <span>${goods.categoryName || ''}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            if (reset) {
                content.innerHTML = html;
            } else {
                content.innerHTML += html;
            }
            
            if (result && result.total) {
                profileProductsHasMore = (profileProductsPageNum * profileProductsPageSize) < result.total;
            } else {
                profileProductsHasMore = goodsList.length >= profileProductsPageSize;
            }
            
            profileProductsPageNum++;
        } else {
            if (reset) {
                content.innerHTML = '<div class="loading-placeholder">暂无闲置</div>';
            }
            profileProductsHasMore = false;
        }
    } catch (error) {
        console.error('加载个人中心闲置失败:', error);
        if (reset) {
            content.innerHTML = '<div class="loading-placeholder">加载失败</div>';
        }
    } finally {
        profileProductsLoading = false;
    }
}


let currentSlide = 0;
function initImageSlider(totalSlides) {
    currentSlide = 0;
}

// 上一张
function prevSlide() {
    const slides = document.querySelectorAll('.slider-slide');
    if (slides.length === 0) return;

    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    slides[currentSlide].classList.add('active');

    updateImageNav(slides.length);
}

// 下一张
function nextSlide() {
    const slides = document.querySelectorAll('.slider-slide');
    if (slides.length === 0) return;

    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');

    updateImageNav(slides.length);
}

// 跳转到指定图片
function goToSlide(index) {
    const slides = document.querySelectorAll('.slider-slide');
    if (slides.length === 0) return;

    slides[currentSlide].classList.remove('active');
    currentSlide = index;
    slides[currentSlide].classList.add('active');

    updateImageNav(slides.length);
}

// 更新图片导航（计数器 + 小圆点）
function updateImageNav(total) {
    // 更新计数器
    const counter = document.querySelector('.image-counter');
    if (counter) {
        counter.textContent = `${currentSlide + 1}/${total}`;
    }
    // 更新小圆点
    const dots = document.querySelectorAll('.gd-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });
}

// 加载分类
async function loadCategories() {
    try {
        const result = await API.category.list();
        if (isApiOk(result) && result.data) {
            const categories = result.data;
            
            // 加载到发布表单的下拉框
            const select = document.getElementById('goodsCategory');
            if (select) {
                select.innerHTML = '<option value="">请选择分类</option>';
                categories.forEach(category => {
                    select.innerHTML += `<option value="${category.id}">${escapeHtml(category.name)}</option>`;
                });
            }
            
            // 加载到杂货铺的分类下拉框（新布局）
            const categorySelect = document.getElementById('categorySelect');
            if (categorySelect) {
                categorySelect.innerHTML = '<option value="">全部</option>';
                categories.forEach(category => {
                    categorySelect.innerHTML += `<option value="${category.id}">${escapeHtml(category.name)}</option>`;
                });
            }
        }
    } catch (error) {
        console.error('加载分类失败:', error);
    }
}

// 分类下拉框变化处理
function onCategoryChange() {
    goodsCategoryId = document.getElementById('categorySelect').value;
    resetGoodsList();
    loadGoodsList();
}

// 重置杂货铺筛选条件
function resetGoodsFilters() {
    document.getElementById('categorySelect').value = '';
    document.getElementById('productSearchInput').value = '';
    goodsCategoryId = null;
    goodsSearchKeyword = '';
    resetGoodsList();
    loadGoodsList();
}

// 处理图片上传
async function handleImageUpload(files) {
    if (files.length === 0) return;
    
    // 限制最多9张图片
    const remainingSlots = 9 - uploadedImages.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    
    for (const file of filesToUpload) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const result = await API.common.upload(formData);
            if (isApiOk(result) && result.data) {
                uploadedImages.push(result.data);
            } else {
                showToast(result.message || '图片上传失败', 'error');
            }
        } catch (error) {
            console.error('图片上传失败:', error);
            showToast('图片上传失败', 'error');
        }
    }
    
    updateGoodsImageGrid();
}

// 更新商品图片网格
function updateGoodsImageGrid() {
    const grid = document.getElementById('imageUploadGrid');
    grid.innerHTML = '';
    
    // 显示已上传的图片
    uploadedImages.forEach((url, index) => {
        grid.innerHTML += `
            <div class="upload-preview-item">
                <img src="${url}" alt="商品图片" onclick="previewImage('${url}')"/>
                <button class="remove-image-btn" onclick="removeImage(${index})">&times;</button>
            </div>
        `;
    });
    
    // 显示上传按钮
    if (uploadedImages.length < 9) {
        grid.innerHTML += `
            <div class="upload-placeholder" onclick="document.getElementById('imageUpload').click()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>
                <span>添加图片</span>
            </div>
        `;
    }
}

// 预览图片
function previewImage(url) {
    window.open(url, '_blank');
}

// 删除图片
function removeImage(index) {
    uploadedImages.splice(index, 1);
    updateGoodsImageGrid();
}

// 提交发布表单
function adjustStock(delta) {
    const input = document.getElementById('goodsStock');
    let val = parseInt(input.value) || 1;
    val = Math.max(1, val + delta);
    input.value = val;
}

function validateStockInput() {
    const input = document.getElementById('goodsStock');
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) {
        input.value = 1;
    }
}

async function submitPublishForm() {
    const name = document.getElementById('goodsName').value.trim();
    const description = document.getElementById('goodsDescription').value.trim();
    const price = parseFloat(document.getElementById('goodsPrice').value);
    const categoryId = document.getElementById('goodsCategory').value;
    const stock = parseInt(document.getElementById('goodsStock').value) || 1;
    const transactionType = parseInt(document.querySelector('input[name="transactionType"]:checked').value);
    const addressId = transactionType === 2 ? parseInt(document.getElementById('sellerAddressSelect').value) || null : null;

    if (transactionType === 2 && !addressId) {
        showToast('请选择地址', 'error');
        return;
    }

    console.log('提交商品数据:', { transactionType, addressId });

    if (!name) {
        showToast('请输入商品名称', 'error');
        return;
    }

    if (!description) {
        showToast('请输入商品描述', 'error');
        return;
    }

    if (!price || price <= 0) {
        showToast('请输入正确的商品价格', 'error');
        return;
    }

    if (!categoryId) {
        showToast('请选择商品分类', 'error');
        return;
    }

    if (stock <= 0) {
        showToast('库存数量必须大于0', 'error');
        return;
    }

    if (uploadedImages.length === 0) {
        showToast('请至少上传一张商品图片', 'error');
        return;
    }

    if (editingGoodsId && originalEditData) {
        const hasChanges =
            name !== originalEditData.name ||
            description !== originalEditData.description ||
            price !== originalEditData.price ||
            categoryId != originalEditData.categoryId ||
            stock !== originalEditData.stock ||
            transactionType !== originalEditData.transactionType ||
            uploadedImages.join(',') !== originalEditData.images;
        
        if (!hasChanges) {
            showToast('该商品未做修改', 'info');
            return;
        }
    }
    
    try {
        let result;
        if (editingGoodsId) {
            // 编辑模式
            console.log('调用修改接口 /user/goods/update/' + editingGoodsId);
            result = await API.goods.update(editingGoodsId, {
                name: name,
                description: description,
                price: price,
                categoryId: parseInt(categoryId),
                stock: stock,
                transactionType: transactionType,
                addressId: addressId,
                images: uploadedImages.join(',')
            });
        } else {
            // 发布模式
            result = await API.goods.publish({
                name: name,
                description: description,
                price: price,
                categoryId: parseInt(categoryId),
                stock: stock,
                transactionType: transactionType,
                addressId: addressId,
                images: uploadedImages.join(',')
            });
        }
        
        if (isApiOk(result)) {
            showToast(editingGoodsId ? '修改成功' : '发布成功', 'success');
            
            // 清空表单
            document.getElementById('goodsName').value = '';
            document.getElementById('goodsDescription').value = '';
            document.getElementById('goodsPrice').value = '';
            document.getElementById('goodsCategory').value = '';
            document.getElementById('goodsStock').value = '1';
            document.querySelector('input[name="transactionType"][value="1"]').checked = true;
            // 同步交易方式选中态样式
            var ttGroup = document.getElementById('transactionTypeGroup');
            if (ttGroup) {
                ttGroup.querySelectorAll('.radio-item').forEach(function(el) {
                    el.classList.toggle('active', el.querySelector('input[type="radio"]').checked);
                });
            }
            // 清空地址选择
            var addrSelect = document.getElementById('sellerAddressSelect');
            if (addrSelect) {
                delete addrSelect.dataset.loaded;
                addrSelect.value = '';
            }
            uploadedImages = [];
            originalEditData = null;
            updateGoodsImageGrid();
            editingGoodsId = null;
            
            // 重置标题
            const modalTitle = document.querySelector('#productPublishModal .modal-header h3');
            if (modalTitle) {
                modalTitle.textContent = '发布闲置';
            }
            const submitBtn = document.querySelector('#productPublishModal .btn-primary');
            if (submitBtn) {
                submitBtn.textContent = '发布闲置';
            }
            
            closeModal('productPublishModal');

            // 刷新数据
            if (currentPage === 'market') {
                resetGoodsList();
                loadGoodsList();
            }
            loadHomeGoods();
            loadLatestGoods();
            loadMyProductsList();
            // 同时刷新个人中心主页的闲置列表
            loadProfileProducts();

            // 编辑成功后返回商品详情
            if (window._returnToGoodsDetail) {
                const gid = window._returnToGoodsDetail;
                window._returnToGoodsDetail = null;
                setTimeout(() => {
                    openModal('productDetailModal');
                    showGoodsDetail(gid);
                }, 300);
            }
        } else {
            showToast(result.message || (editingGoodsId ? '修改失败' : '发布失败'), 'error');
        }
    } catch (error) {
        console.error(editingGoodsId ? '修改失败:' : '发布失败:', error);
        showToast('网络错误', 'error');
    }
}

// 重置发布表单
function resetPublishForm() {
    editingGoodsId = null;
    
    // 重置标题
    const modalTitle = document.querySelector('#productPublishModal .modal-header h3');
    if (modalTitle) {
        modalTitle.textContent = '发布闲置';
    }
    const submitBtn = document.querySelector('#productPublishModal .btn-primary');
    if (submitBtn) {
        submitBtn.textContent = '发布闲置';
    }
    
    // 清空表单
    document.getElementById('goodsName').value = '';
    document.getElementById('goodsDescription').value = '';
    document.getElementById('goodsPrice').value = '';
    document.getElementById('goodsCategory').value = '';
    document.getElementById('goodsStock').value = '1';
    uploadedImages = [];
    originalEditData = null;
    updateGoodsImageGrid();
}

// 编辑商品
async function editMyProduct(goodsId) {
    console.log('========== 开始编辑商品 ==========');
    console.log('goodsId:', goodsId);
    try {
        // 先加载分类列表
        console.log('1. 开始加载分类列表...');
        await loadCategories();
        console.log('分类列表加载完成');
        
        console.log('2. 调用接口 /user/goods/edit-detail/' + goodsId);
        const result = await API.goods.editDetail(goodsId);
        console.log('3. 商品详情接口完整返回:', JSON.stringify(result, null, 2));
        
        if (isApiOk(result)) {
            const goods = result.data || result;
            console.log('4. 提取到的商品数据:', goods);
            console.log('商品名称:', goods.goodsName || goods.name);
            console.log('商品描述:', goods.description);
            console.log('商品价格:', goods.price);
            console.log('分类ID:', goods.categoryId);
            console.log('imageUrls字段:', goods.imageUrls);
            console.log('images字段:', goods.images);
            console.log('firstImage字段:', goods.firstImage);
            
            editingGoodsId = goodsId;

            // 先关闭详情模态框，再打开编辑模态框
            console.log('5. 关闭详情模态框，打开编辑模态框...');
            closeModal('productDetailModal');
            openModal('productPublishModal');
            
            // 等待一小会儿，确保DOM已更新
            setTimeout(() => {
                console.log('6. 开始设置模态框标题和按钮...');
                // 设置标题
                const modalTitle = document.querySelector('#productPublishModal .modal-header h3');
                if (modalTitle) {
                    modalTitle.textContent = '编辑闲置';
                    console.log('标题已设置');
                }
                const submitBtn = document.querySelector('#productPublishModal .btn-primary');
                if (submitBtn) {
                    submitBtn.textContent = '保存修改';
                    console.log('按钮已设置');
                }
                
                // 回显数据
                console.log('7. 开始回显数据...');
                const nameInput = document.getElementById('goodsName');
                const descInput = document.getElementById('goodsDescription');
                const priceInput = document.getElementById('goodsPrice');
                
                if (nameInput) {
                    nameInput.value = goods.goodsName || goods.name || '';
                    console.log('商品名称已设置:', nameInput.value);
                } else {
                    console.error('找不到商品名称输入框');
                }
                
                if (descInput) {
                    descInput.value = goods.description || '';
                    console.log('商品描述已设置:', descInput.value);
                } else {
                    console.error('找不到商品描述输入框');
                }
                
                if (priceInput) {
                    priceInput.value = goods.price || '';
                    updateCommissionDisplay();
                    console.log('商品价格已设置:', priceInput.value);
                } else {
                    console.error('找不到商品价格输入框');
                }
                
                // 设置分类选中
                const categorySelect = document.getElementById('goodsCategory');
                if (categorySelect && goods.categoryId) {
                    categorySelect.value = goods.categoryId;
                    console.log('分类已设置选中:', goods.categoryId);
                } else {
                    console.error('找不到分类选择框或没有分类ID');
                }

                console.log('7.15 设置交易方式...');
                if (goods.transactionType >= 1 && goods.transactionType <= 3) {
                    const ttRadio = document.querySelector('input[name="transactionType"][value="' + goods.transactionType + '"]');
                    if (ttRadio) {
                        ttRadio.checked = true;
                        console.log('交易方式已设置:', goods.transactionType);
                    }
                }
                // 同步交易方式选中态样式
                var ttGroup = document.getElementById('transactionTypeGroup');
                if (ttGroup) {
                    ttGroup.querySelectorAll('.radio-item').forEach(function(el) {
                        el.classList.toggle('active', el.querySelector('input[type="radio"]').checked);
                    });
                }
                // 编辑时加载地址并预选
                if (goods.transactionType === 2 && goods.addressId) {
                    var addrSelect = document.getElementById('sellerAddressSelect');
                    if (addrSelect) {
                        delete addrSelect.dataset.loaded;
                        loadSellerAddresses().then(function() {
                            addrSelect.value = goods.addressId;
                        });
                    }
                }
                toggleSellerAddress();

                console.log('7.1 设置库存...');
                const stockInput = document.getElementById('goodsStock');
                if (stockInput) {
                    stockInput.value = goods.stock != null ? goods.stock : 1;
                    console.log('库存已设置:', stockInput.value);
                } else {
                    console.error('找不到库存输入框');
                }
                
                // 处理图片
                console.log('8. 开始处理图片...');
                console.log('完整的商品对象所有字段:', Object.keys(goods));
                uploadedImages = [];
                
                if (goods.imageUrls && goods.imageUrls.length > 0) {
                    console.log('使用imageUrls字段:', goods.imageUrls);
                    uploadedImages = goods.imageUrls;
                } else if (goods.images) {
                    console.log('使用images字段:', goods.images);
                    uploadedImages = goods.images.split(',').filter(img => img.trim());
                } else if (goods.firstImage) {
                    console.log('使用firstImage字段:', goods.firstImage);
                    uploadedImages = [goods.firstImage];
                } else {
                    console.log('没有找到图片字段，尝试所有可能的字段:');
                    console.log('- goods.imageUrls:', goods.imageUrls);
                    console.log('- goods.images:', goods.images);
                    console.log('- goods.firstImage:', goods.firstImage);
                    console.log('- goods.image:', goods.image);
                    console.log('- goods.imageUrl:', goods.imageUrl);
                }
                console.log('最终已上传图片数组:', uploadedImages);
                console.log('最终已上传图片数组长度:', uploadedImages.length);
                
                console.log('9. 更新图片网格...');
                updateGoodsImageGrid();
                console.log('========== 编辑商品准备完成 ==========');
                
                originalEditData = {
                    name: goods.name || goods.goodsName || '',
                    description: goods.description || '',
                    price: parseFloat(goods.price) || 0,
                    categoryId: goods.categoryId != null ? goods.categoryId : '',
                    stock: goods.stock != null ? goods.stock : 1,
                    transactionType: goods.transactionType || 1,
                    images: uploadedImages.join(',')
                };

                // 标记来源，让取消/关闭按钮和提交成功都能返回商品详情
                window._returnToGoodsDetail = goods.goodsId || goodsId;
            }, 100);

            // 覆盖取消/关闭按钮行为 → 返回商品详情
            setTimeout(() => {
                const pm = document.getElementById('productPublishModal');
                if (!pm) return;
                const returnHandler = () => {
                    closeModal('productPublishModal');
                    editingGoodsId = null;
                    const gid = window._returnToGoodsDetail;
                    window._returnToGoodsDetail = null;
                    if (gid) {
                        openModal('productDetailModal');
                        showGoodsDetail(gid);
                    }
                };
                const closeBtn = pm.querySelector('.modal-close');
                const cancelBtn = pm.querySelector('.btn-secondary');
                if (closeBtn) closeBtn.onclick = returnHandler;
                if (cancelBtn) cancelBtn.onclick = returnHandler;
            }, 50);
        } else {
            console.error('接口返回不成功:', result);
            showToast(result.message || '获取商品详情失败', 'error');
        }
    } catch (error) {
        console.error('========== 获取商品详情异常 ==========');
        console.error('错误详情:', error);
        showToast('网络错误', 'error');
    }
}

// 加载任务列表
async function loadTaskList() {
    console.log('加载任务列表, pageNum:', taskPageNum);
    if (taskLoading || !taskHasMore) return;
    
    taskLoading = true;
    const container = document.getElementById('fullTaskList');
    
    if (!container) {
        console.error('任务列表容器 fullTaskList 未找到');
        taskLoading = false;
        return;
    }
    
    if (taskPageNum === 1) {
        container.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    }

    try {
        const params = {
            pageNum: taskPageNum,
            pageSize: taskPageSize
        };
        
        if (taskCategoryId) {
            params.categoryId = taskCategoryId;
        }
        if (taskKeyword) {
            params.keyword = taskKeyword;
        }

        console.log('请求任务列表参数:', params);
        const result = await API.task.list(params);
        console.log('任务列表API返回:', result);

        if (isApiOk(result) && result.data) {
            const pageResult = result.data;
            const taskList = pageResult.records || pageResult;
            
            if (taskPageNum === 1) {
                container.innerHTML = '';
            }

            if (taskList && taskList.length > 0) {
                taskList.forEach(task => {
                    container.innerHTML += createTaskCard(task);
                });
                
                if (pageResult.total) {
                    const loaded = taskPageNum * taskPageSize;
                    taskHasMore = loaded < pageResult.total;
                } else {
                    taskHasMore = taskList.length >= taskPageSize;
                }
                
                taskPageNum++;
            } else {
                if (taskPageNum === 1) {
                    container.innerHTML = '<div class="loading-placeholder">暂无任务</div>';
                }
                taskHasMore = false;
            }
        } else {
            if (taskPageNum === 1) {
                container.innerHTML = '<div class="loading-placeholder">暂无任务</div>';
            }
            taskHasMore = false;
        }
    } catch (error) {
        console.error('加载任务失败:', error);
        if (taskPageNum === 1) {
            container.innerHTML = '<div class="loading-placeholder">加载失败</div>';
        }
    } finally {
        taskLoading = false;
    }
}

// 重置任务列表
function resetTaskList() {
    taskPageNum = 1;
    taskHasMore = true;
    taskLoading = false;
}

// 创建任务卡片
function createTaskCard(task) {
    return `
        <div class="task-item">
            <div class="task-item-header">
                <h3 class="task-title">${escapeHtml(task.title)}</h3>
                <span class="task-price">¥${task.reward ? task.reward.toFixed(2) : '0.00'}</span>
            </div>
            <div class="task-meta">
                <span class="task-status ${task.status}">${getStatusText(task.status)}</span>
                <span>${task.publisher}</span>
                <span>${formatTime(task.createTime)}</span>
            </div>
        </div>
    `;
}

// 获取任务状态文本
function getStatusText(status) {
    const statusMap = {
        'pending': '待接取',
        'ongoing': '进行中',
        'completed': '已完成'
    };
    return statusMap[status] || status;
}

// 格式化时间
function formatTime(timeStr) {
    if (!timeStr) return '';
    
    try {
        const date = new Date(timeStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        // 小于1分钟
        if (diff < 60000) {
            return '刚刚';
        }
        // 小于1小时
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)}分钟前`;
        }
        // 小于24小时
        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)}小时前`;
        }
        // 小于30天
        if (diff < 2592000000) {
            return `${Math.floor(diff / 86400000)}天前`;
        }
        
        // 超过30天显示日期
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
        return timeStr;
    }
}

/** 格式化为具体时间 yyyy-MM-dd HH:mm */
function formatDateTime(timeStr) {
    if (!timeStr) return '';
    try {
        var d = new Date(timeStr);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (e) {
        return timeStr;
    }
}

// Toast提示
function showToast(message, type = 'info') {
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span class="toast-message">' + message + '</span>';
    // 堆叠偏移：多个 toast 依次向下排列
    var existingToasts = document.querySelectorAll('.toast.show');
    toast.style.top = (80 + existingToasts.length * 50) + 'px';
    document.body.appendChild(toast);

    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
    }, 2000);
}

// 点击商品详情中的"买家自提"标签时显示地址
function showPickupAddress(el) {
    const dormitory = el.getAttribute('data-dormitory');
    if (dormitory) {
        showToast('自提地址：' + dormitory, 'success');
    } else {
        showToast('该商品暂未设置自提地址', 'warning');
    }
}

function updateSchoolIndicator() {
    var nameEl = document.getElementById('schoolNameText');
    var bindEl = document.getElementById('navSchoolBind');
    if (!nameEl) return;
    API.map.getUserSchool().then(function(res) {
        if (isApiOk(res) && res.data && res.data.name) {
            nameEl.textContent = res.data.name;
            nameEl.style.color = '';
            if (bindEl) bindEl.style.display = 'none';
        } else {
            nameEl.textContent = '暂未绑定学校';
            nameEl.style.color = '#999';
            if (bindEl) bindEl.style.display = 'inline';
        }
    });
}

// 打开模态框
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        // 防止背景滚动
        document.body.style.overflow = 'hidden';
    }
}

// 关闭模态框
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        
        // 如果是关闭编辑资料模态框，同时关闭所有picker-modal
        if (modalId === 'editProfileModal') {
            closeAllPickers();
        }
        
        // 恢复背景滚动（仅当没有其他模态框或侧滑卡片打开时）
        const activeModals = document.querySelectorAll('.modal.active');
        const activeSlides = document.querySelectorAll('.slide-card.active');
        if (activeModals.length === 0 && activeSlides.length === 0) {
            document.body.style.overflow = '';
        }
        
        // 如果是发布/编辑闲置的模态框，关闭时重置表单
        if (modalId === 'productPublishModal') {
            resetPublishForm();
        }
    }
}

// 关闭所有选择器
function closeAllPickers() {
    closeGenderPicker();
    closeBirthdayPicker();
    closeLocationPicker();
    closeNicknameEdit();
    closeIntroEdit();
    closeUsernameEdit();
    closeAvatarCrop();
    closeBgCrop();
}

// 节流函数
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

// 防抖函数
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 登出
function logout() {
    if (confirm('确定要退出登录吗？')) {
        // 调用后端登出接口使 token 失效
        fetch(API_BASE_URL + '/user/user/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getCurrentToken() } }).catch(function() {});

        // 关闭 WebSocket 连接
        closeWebSocket();
        // 清除认证信息
        clearAuth();
        window.location.href = 'login.html';
    }
}

// 管理员切换
function switchToAdmin() {
    window.location.href = 'admin.html';
}

// ==================== 侧滑卡片相关逻辑 ====================

let currentSlideCard = null;
let myTasksTab = 'published';
let myProductsTab = 'published';
let myTasksKeyword = '';
let myProductsKeyword = '';

// 打开我的任务侧滑卡片
function openMyTasksSlide() {
    openSlideCard('myTasksSlide');
    loadMyTasksList();
}

// 打开我的闲置侧滑卡片
function openMyProductsSlide() {
    openSlideCard('myProductsSlide');
    loadMyProductsList();
}

// 打开交易订单侧滑卡片
function openMyAcceptedTasksSlide() {
    openSlideCard('myAcceptedTasksSlide');
    loadOrders();
    // 滚动加载更多
    var content = document.getElementById('myAcceptedTasksContent');
    if (content) {
        content.onscroll = function() {
            if (this.scrollTop + this.clientHeight >= this.scrollHeight - 50) {
                loadMoreOrders();
            }
        };
    }
}

// 打开侧滑卡片
function openSlideCard(cardId) {
    currentSlideCard = cardId;
    document.getElementById('slideOverlay').classList.add('active');
    document.getElementById(cardId).classList.add('active');
    // 防止背景滚动
    document.body.style.overflow = 'hidden';
}

// 关闭侧滑卡片
function closeSlideCard() {
    if (currentSlideCard) {
        // 移除滚动监听
        var content = document.getElementById('myAcceptedTasksContent');
        if (content) content.onscroll = null;
        document.getElementById('slideOverlay').classList.remove('active');
        document.getElementById(currentSlideCard).classList.remove('active');
        currentSlideCard = null;
        // 恢复背景滚动（仅当没有其他模态框打开时）
        const activeModals = document.querySelectorAll('.modal.active');
        if (activeModals.length === 0) {
            document.body.style.overflow = '';
        }
    }
}

// ==================== 我的任务逻辑 ====================

// 切换我的任务标签
function switchMyTasksTab(tab) {
    myTasksTab = tab;
    
    // 更新标签状态
    document.querySelectorAll('#myTasksSlide .slide-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`#myTasksSlide .slide-tab[data-tab="${tab}"]`).classList.add('active');
    
    loadMyTasksList();
}

// 搜索我的任务
function filterMyTasks() {
    myTasksKeyword = document.getElementById('myTasksSearch').value.trim();
    loadMyTasksList();
}

// 加载我的任务列表
async function loadMyTasksList() {
    const content = document.getElementById('myTasksContent');
    content.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    
    try {
        // 模拟数据，实际应该调用后端接口
        const mockTasks = [
            {
                id: 1,
                title: '帮我取个快递',
                reward: 5,
                status: 'pending',
                createTime: new Date().toISOString(),
                publisher: '我'
            },
            {
                id: 2,
                title: '代买一份早餐',
                reward: 8,
                status: 'pending',
                createTime: new Date().toISOString(),
                publisher: '我'
            }
        ];
        
        renderMyTasksList(mockTasks);
    } catch (error) {
        console.error('加载我的任务失败:', error);
        content.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

// 渲染我的任务列表
function renderMyTasksList(tasks) {
    const content = document.getElementById('myTasksContent');
    
    if (!tasks || tasks.length === 0) {
        content.innerHTML = '<div class="loading-placeholder">暂无任务</div>';
        return;
    }
    
    content.innerHTML = tasks.map(task => {
        let actionButtons = '';
        
        if (myTasksTab === 'published') {
            actionButtons = `
                <button class="slide-action-btn secondary" onclick="editMyTask(${task.id}); event.stopPropagation();">编辑</button>
                <button class="slide-action-btn danger" onclick="offlineMyTask(${task.id}); event.stopPropagation();">下架</button>
            `;
        } else {
            actionButtons = `
                <button class="slide-action-btn secondary" onclick="editMyTask(${task.id}); event.stopPropagation();">编辑</button>
                <button class="slide-action-btn primary" onclick="onlineMyTask(${task.id}); event.stopPropagation();">重新上架</button>
                <button class="slide-action-btn danger" onclick="deleteMyTask(${task.id}); event.stopPropagation();">删除</button>
            `;
        }
        
        return `
            <div class="slide-item" onclick="showTaskDetail(${task.id})">
                <div class="slide-item-header">
                    <span class="slide-item-title">${escapeHtml(task.title)}</span>
                    <span class="slide-item-price">¥${task.reward.toFixed(2)}</span>
                </div>
                <div class="slide-item-meta">
                    <span>${getStatusText(task.status)}</span>
                    <span>${formatTime(task.createTime)}</span>
                </div>
                <div class="slide-item-actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

// 编辑我的任务
function editMyTask(taskId) {
    showToast('编辑任务功能开发中', 'info');
}

// 下架任务
function offlineMyTask(taskId) {
    showToast('下架任务功能开发中', 'info');
}

// 重新上架任务
function onlineMyTask(taskId) {
    showToast('重新上架功能开发中', 'info');
}

// 删除任务
function deleteMyTask(taskId) {
    if (confirm('确定要删除这个任务吗？')) {
        showToast('删除任务功能开发中', 'info');
    }
}

// ==================== 交易订单逻辑 ====================

let orderRole = 'sell';
let orderStatus = '';
let orderKeyword = '';
let orderPageNum = 1;
let orderLoading = false;
let orderHasMore = true;
let orderSearchTimer = null;

// 切换主标签（我卖出的/我买到的）
function switchOrderRole(role) {
    orderRole = role;
    orderPageNum = 1;
    document.querySelectorAll('.order-main-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.order-main-tab[data-role="${role}"]`).classList.add('active');
    switchOrderStatus('');
}

// 切换状态子标签
function switchOrderStatus(status) {
    orderStatus = status;
    orderPageNum = 1;
    document.querySelectorAll('.order-sub-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.order-sub-tab[data-status="${status}"]`).classList.add('active');
    loadOrders();
}

// 搜索订单（防抖300ms）
function searchOrders() {
    if (orderSearchTimer) clearTimeout(orderSearchTimer);
    orderSearchTimer = setTimeout(() => {
        orderKeyword = document.getElementById('orderSearch').value.trim();
        loadOrders();
    }, 300);
}

// 加载订单列表
async function loadOrders() {
    const content = document.getElementById('myAcceptedTasksContent');
    if (!content) return;
    content.innerHTML = '<div class="loading-placeholder">加载中...</div>';

    // 重置分页状态
    orderPageNum = 1;
    orderHasMore = true;
    orderLoading = false;

    try {
        var tabVal = orderStatus !== '' ? parseInt(orderStatus) : undefined;
        const res = await API.order.list({ role: orderRole, tab: tabVal, keyword: orderKeyword || undefined, pageNum: orderPageNum, pageSize: 10 });
        if (!isApiOk(res) || !res.data) {
            content.innerHTML = '<div class="loading-placeholder">加载失败，请重试</div>';
            return;
        }
        const pageResult = res.data;
        const orders = pageResult.records || [];
        orderHasMore = orders.length >= 10;
        renderOrders(orders);
    } catch (error) {
        console.error('加载订单列表失败:', error);
        content.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

// 加载更多订单（滚动到底部触发）
async function loadMoreOrders() {
    if (orderLoading || !orderHasMore) return;
    orderLoading = true;
    orderPageNum++;
    try {
        var tabVal = orderStatus !== '' ? parseInt(orderStatus) : undefined;
        const res = await API.order.list({ role: orderRole, tab: tabVal, keyword: orderKeyword || undefined, pageNum: orderPageNum, pageSize: 10 });
        if (!isApiOk(res) || !res.data) {
            orderLoading = false;
            return;
        }
        const pageResult = res.data;
        const orders = pageResult.records || [];
        orderHasMore = orders.length >= 10;
        renderOrders(orders, true);
    } catch (e) {
        console.error('加载更多订单失败:', e);
        orderPageNum--;
    } finally {
        orderLoading = false;
    }
}

// 获取状态文本
function getOrderStatusText(status) {
    const map = {
        0: '待付款', 1: '待发货', 2: '待收货',
        3: '已完成', 4: '已取消', 5: '退款中', 6: '已退款'
    };
    return map[status] || '未知';
}

// 获取状态CSS类名
function getOrderStatusClass(status) {
    const map = {
        0: 'pending-pay', 1: 'paid', 2: 'shipped',
        3: 'completed', 4: 'cancelled', 5: 'refunding', 6: 'refunded'
    };
    return map[status] || '';
}

// 获取交易方式文本
function getTradeTypeText(type) {
    const map = { 1: '卖家上门', 2: '买家自提', 3: '自行协商' };
    return map[type] || '未知';
}

// 渲染订单商品列表（扁平条目，不含订单级信息）
function renderOrders(orders, append = false) {
    const content = document.getElementById('myAcceptedTasksContent');
    if (!content) return;

    if (!orders || orders.length === 0) {
        if (!append) {
            content.innerHTML = '<div class="loading-placeholder">暂无订单</div>';
        }
        return;
    }

    const html = orders.map(item => `
        <div class="slide-item" style="padding:12px 16px;cursor:pointer;" onclick="viewOrderDetail(${item.orderId}, ${item.orderItemId})">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <img src="${item.counterpartyAvatar || ''}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;background:#f3f4f6;cursor:pointer;"
                    onclick="event.stopPropagation();showSellerProfile(${item.counterpartyId})"
                    onerror="this.style.display='none'">
                <span style="font-size:13px;color:#333;font-weight:500;cursor:pointer;"
                    onclick="event.stopPropagation();showSellerProfile(${item.counterpartyId})">${orderRole === 'buy' ? '卖家' : '买家'}: ${escapeHtml(item.counterpartyNickname || '未知')}</span>
            </div>
            <div class="order-item">
                <img class="order-item-img" src="${item.goodsImage || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect fill=%22%23f3f4f6%22 width=%2264%22 height=%2264%22/></svg>'}" alt="${escapeHtml(item.goodsName)}"
                    onclick="event.stopPropagation();showGoodsDetail(${item.goodsId})"
                    style="cursor:pointer;"
                    onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect fill=%22%23f3f4f6%22 width=%2264%22 height=%2264%22/></svg>'">
                <div class="order-item-info">
                    <div class="order-item-name">${escapeHtml(item.goodsName)}</div>
                    <div class="order-item-spec">${item.tradeTypeText || '未知'}</div>
                </div>
                <div class="order-item-right">
                    <div class="order-item-price">¥${item.price ? item.price.toFixed(2) : '0.00'}</div>
                    <div class="order-item-qty">×${item.quantity || 0}</div>
                    <div class="order-item-status" style="font-size:12px;margin-top:2px;color:${getStatusColor(item.status)};">${item.statusText || ''}</div>
                </div>
            </div>
            ${item.status === 0 && orderRole === 'buy' ? `
                <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                    <button onclick="event.stopPropagation();cancelOrderById('${item.paymentNo}')" style="border:1px solid #d9d9d9;background:#fff;color:#666;font-size:13px;padding:6px 16px;border-radius:6px;cursor:pointer;">取消</button>
                    <button onclick="event.stopPropagation();viewPaymentGroupDetail('${item.paymentNo}')" style="border:none;background:#FF7D00;color:#fff;font-size:13px;padding:6px 16px;border-radius:6px;cursor:pointer;">去支付</button>
                </div>
            ` : ''}
            ${item.status === 1 && orderRole === 'sell' ? `
                <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                    <button onclick="event.stopPropagation();shipItem(${item.orderItemId})" style="border:none;background:#52c41a;color:#fff;font-size:13px;padding:6px 16px;border-radius:6px;cursor:pointer;">发货</button>
                </div>
            ` : ''}
            ${item.status === 2 && orderRole === 'buy' ? `
                <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                    <button onclick="event.stopPropagation();receiveItem(${item.orderItemId})" style="border:none;background:#1890ff;color:#fff;font-size:13px;padding:6px 16px;border-radius:6px;cursor:pointer;">确认收货</button>
                </div>
            ` : ''}
        </div>
    `).join('');

    if (append) {
        content.insertAdjacentHTML('beforeend', html);
    } else {
        content.innerHTML = html;
    }
}

/** 关联订单去支付 */
async function payNowFromGroup() {
    if (!payPaymentNo) { showToast('支付信息丢失', 'error'); return; }
    closeModal('paymentGroupModal');

    // 先展示支付弹窗（此时 #payQrContainer 内已有 .pay-loading 旋转器）
    document.getElementById('payOverlay').style.display = 'flex';
    document.getElementById('payAmount').textContent = '¥' + (payTotalAmount ? payTotalAmount.toFixed(2) : '0.00');
    document.getElementById('payOrderCount').textContent = '1笔';
    document.getElementById('payStatusText').textContent = '';
    document.getElementById('payCancelBtn').style.display = 'inline-flex';
    document.getElementById('paySuccessBtn').style.display = 'inline-flex';
    document.getElementById('paySuccessBtn').onclick = function () { paySuccessFromGroup(); };

    // 已有缓存二维码，直接渲染，跳过 API 调用
    if (payQrCodeStr) {
        var container = document.getElementById('payQrContainer');
        container.innerHTML = '';
        new QRCode(container, {
            text: payQrCodeStr,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        startPayPolling(payOrderNo);
        return;
    }

    try {
        var qrRes = await API.pay.create(payPaymentNo);
        if (!isApiOk(qrRes) || !qrRes.data) {
            showToast('支付创建失败', 'error');
            document.getElementById('payOverlay').style.display = 'none';
            return;
        }
        payQrCodeStr = qrRes.data;
        // 二维码就绪，替换 loading 旋转器
        var container = document.getElementById('payQrContainer');
        container.innerHTML = '';
        new QRCode(container, {
            text: qrRes.data,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        startPayPolling(payOrderNo);
    } catch (e) {
        document.getElementById('payOverlay').style.display = 'none';
        showToast('支付创建失败', 'error');
    }
}

/** 去支付（跳转确认订单页模拟） */
function payNow(paymentNo) {
    showToast('请在订单详情中完成支付', 'info');
}

/** 取消订单 */
async function cancelOrderById(paymentNo) {
    if (!confirm('确定要取消该订单吗？')) return;
    try {
        const res = await API.order.cancel(paymentNo);
        if (isApiOk(res)) {
            showToast('订单已取消', 'success');
            loadOrders();
        } else {
            showToast(res.msg || '取消失败', 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

/** 确认收货（从订单详情页点击） */
async function confirmReceive(itemId) {
    if (!confirm('确定要确认收货吗？')) return;
    try {
        const res = await API.order.receive(itemId);
        if (isApiOk(res)) {
            showToast('已确认收货', 'success');
            loadOrders();
            // 关闭详情弹窗（如果打开的话）
            closeModal('myAcceptedTasksModal');
        } else {
            showToast(res.msg || '确认收货失败', 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

/** 买家确认收货（从订单列表点击） */
async function receiveItem(itemId) {
    if (!confirm('确定要确认收货吗？')) return;
    try {
        const res = await API.order.receive(itemId);
        if (isApiOk(res)) {
            showToast('已确认收货', 'success');
            loadOrders();
        } else {
            showToast(res.msg || '确认收货失败', 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

/** 卖家发货 */
async function shipItem(itemId) {
    if (!confirm('确定要发货吗？')) return;
    try {
        const res = await API.order.ship(itemId);
        if (isApiOk(res)) {
            showToast('已发货', 'success');
            loadOrders();
        } else {
            showToast(res.msg || '发货失败', 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

/** 去发货 */
async function shipOrder(orderId) {
    showToast('发货功能开发中', 'info');
}

/** 查看订单详情 */
async function viewOrderDetail(orderId, orderItemId) {
    const content = document.getElementById('myAcceptedTasksContent');
    if (!content) return;
    content.innerHTML = '<div class="loading-placeholder">加载中...</div>';

    try {
        const res = await API.order.detail(orderId, orderItemId, orderRole);
        if (!isApiOk(res) || !res.data) {
            content.innerHTML = '<div class="loading-placeholder">加载失败</div>';
            return;
        }
        renderOrderDetail(res.data);
    } catch (e) {
        console.error('加载订单详情失败:', e);
        content.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

/** 渲染订单详情 */
function renderOrderDetail(detail) {
    const content = document.getElementById('myAcceptedTasksContent');
    if (!content) return;

    //响应式样式
    (function() {
        if (!document.getElementById('order-detail-bar-style')) {
            var s = document.createElement('style');
            s.id = 'order-detail-bar-style';
            s.textContent = '@media (max-width:480px){.order-bottom-bar{flex-direction:column;align-items:stretch!important}.order-bottom-bar>div:last-child{margin-left:0!important;justify-content:flex-end}}';
            document.head.appendChild(s);
        }
    })();

    const statusText = detail.statusText || '未知';
    const s = detail.status ?? 0;

    //状态胶囊配色
    var statusBg = '#999', statusColor = '#fff';
    var statusBgMap = { 0: '#faad14', 1: '#1890ff', 2: '#1890ff', 3: '#52c41a', 4: '#ff4d4f', 5: '#faad14', 6: '#999' };
    statusBg = statusBgMap[s] || '#999';

    //复制文本
    function copyText(text, label) {
        return ` onclick="copyToClipboard('${text}', '${label}')" `;
    }

    //友好时间
    function friendlyTime(t) {
        if (!t) return '—';
        try {
            var d = new Date(t);
            var pad = function(n) { return String(n).padStart(2, '0'); };
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch(e) { return t; }
    }

    //操作按钮（状态3/4只在顶部胶囊显示，底部不重复展示文字）
    var actionHtml = '';
    if (s === 0 && (orderRole || 'buy') === 'buy') {
        actionHtml = '<button onclick="viewPaymentGroupDetail(\'' + detail.paymentNo + '\')" style="border:none;background:#FF7D00;color:#fff;font-size:13px;padding:7px 20px;border-radius:6px;cursor:pointer;font-weight:500;">去支付</button>';
    } else if (s === 1 && (orderRole || 'buy') === 'sell') {
        actionHtml = '<button onclick="shipOrder(' + detail.orderId + ')" style="border:1px solid #FF7D00;color:#FF7D00;background:#fff;font-size:13px;padding:7px 20px;border-radius:6px;cursor:pointer;">去发货</button>';
    }

    const counterpartyLabel = (orderRole || 'buy') === 'buy' ? '卖家' : '买家';
    const roleSymbol = (orderRole || 'buy') === 'buy' ? 'sell' : 'buy';

    const html = `
        <div style="padding:16px;max-width:800px;margin:0 auto;">
            <!-- ===== 1. 头部 ===== -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <button onclick="loadOrders()" style="border:none;background:none;cursor:pointer;padding:4px;display:flex;border-radius:6px;transition:background 0.2s;"
                        onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" width="22" height="22">
                            <path d="M19 12H5m7-7l-7 7 7 7"/>
                        </svg>
                    </button>
                    <h3 style="margin:0;font-size:16px;font-weight:600;color:#333;line-height:1;">小订单详情</h3>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="display:inline-block;padding:3px 14px;border-radius:20px;background:${statusBg};color:${statusColor};font-size:12px;font-weight:500;line-height:1.8;">${statusText}</span>
                    <button onclick="loadOrders()" style="border:none;background:transparent;cursor:pointer;font-size:22px;color:#999;padding:4px 10px;border-radius:4px;line-height:1;transition:background 0.2s;"
                        onmouseover="this.style.background='#F5F5F5'" onmouseout="this.style.background='transparent'">×</button>
                </div>
            </div>

            <!-- ===== 2. 订单基础信息卡片 ===== -->
            <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;font-size:14px;line-height:2;">
                    <div style="color:#666;">
                        <span style="color:#999;font-size:12px;">订单号</span>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(detail.orderNo || '—')}</span>
                            <button onclick="copyToClipboard('${detail.orderNo || ''}', '订单号')" style="border:none;background:#f5f5f5;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:11px;color:#666;transition:background 0.2s;flex-shrink:0;"
                                onmouseover="this.style.background='#fff3e0'" onmouseout="this.style.background='#f5f5f5'">复制</button>
                        </div>
                    </div>
                    <div style="color:#666;">
                        <span style="color:#999;font-size:12px;">支付宝交易号</span>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(detail.alipayTradeNo || '—')}</span>
                            ${detail.alipayTradeNo ? '<button onclick="copyToClipboard(\'' + detail.alipayTradeNo + '\', \'支付宝交易号\')" style="border:none;background:#f5f5f5;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:11px;color:#666;transition:background 0.2s;flex-shrink:0;" onmouseover="this.style.background=\'#fff3e0\'" onmouseout="this.style.background=\'#f5f5f5\'">复制</button>' : ''}
                        </div>
                    </div>
                    <div style="color:#666;">
                        <span style="color:#999;font-size:12px;">下单时间</span>
                        <div style="color:#333;display:flex;align-items:center;">${detail.createTime ? friendlyTime(detail.createTime) : '—'}</div>
                    </div>
                    <div style="color:#666;">
                        <span style="color:#999;font-size:12px;">支付时间</span>
                        <div style="color:#333;display:flex;align-items:center;">${detail.payTime ? friendlyTime(detail.payTime) : '—'}</div>
                    </div>
                </div>
            </div>

            <!-- ===== 3. 卖家/买家信息卡片 ===== -->
            <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:14px;cursor:pointer;flex:1;"
                        onclick="showSellerProfile(${detail.counterpartyId})">
                        <img src="${detail.counterpartyAvatar || ''}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;background:#f3f4f6;border:2px solid #f0f0f0;flex-shrink:0;"
                            onerror="this.style.display='none'">
                        <div>
                            <div style="font-size:15px;font-weight:600;color:#333;">${counterpartyLabel}: ${escapeHtml(detail.counterpartyNickname || '未知')}</div>
                            <div style="font-size:12px;color:#999;display:flex;align-items:center;gap:4px;margin-top:2px;">
                                点击查看个人主页
                                <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" width="12" height="12">
                                    <path d="M9 18l6-6-6-6"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                    <button onclick="showSellerProfile(${detail.counterpartyId})" style="border:1px solid #FF7D00;color:#FF7D00;background:#fff;font-size:13px;padding:6px 16px;border-radius:12px;cursor:pointer;flex-shrink:0;transition:all 0.2s;white-space:nowrap;"
                        onmouseover="this.style.background='#FF7D00';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='#FF7D00'">联系${counterpartyLabel}</button>
                </div>
            </div>

            <!-- ===== 4. 商品信息卡片 ===== -->
            <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                <div style="display:flex;gap:12px;align-items:flex-start;">
                    <img src="${detail.goodsImage || ''}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;background:#f3f4f6;box-shadow:0 1px 4px rgba(0,0,0,0.06);flex-shrink:0;cursor:pointer;"
                        onclick="showGoodsDetail(${detail.goodsId})"
                        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><rect fill=%22%23f3f4f6%22 width=%2280%22 height=%2280%22/></svg>'">
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                            <div style="font-size:14px;font-weight:600;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;margin-right:8px;flex:1;"
                                onclick="showGoodsDetail(${detail.goodsId})">${escapeHtml(detail.goodsName || '未知商品')}</div>
                            <div style="font-size:14px;color:#333;white-space:nowrap;flex-shrink:0;">
                                ¥${detail.price ? detail.price.toFixed(2) : '0.00'} × ${detail.quantity || 0}
                            </div>
                        </div>
                        <div style="font-size:12px;color:#999;margin-top:4px;">${detail.tradeTypeText || '未知'}</div>
                    </div>
                </div>
                <div style="height:1px;background:#f0f0f0;margin:12px 0;"></div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:14px;color:#666;">小计</span>
                    <span style="font-size:20px;font-weight:700;color:#ff4d4f;">¥${detail.subtotal ? detail.subtotal.toFixed(2) : '0.00'}</span>
                </div>
                ${(orderRole || 'buy') === 'sell' && detail.commission != null ? `
                <div style="height:1px;background:#f0f0f0;margin:12px 0;"></div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
                    <span style="color:#999;">平台抽成</span>
                    <span style="color:#666;">-¥${detail.commission.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-top:6px;">
                    <span style="color:#999;">卖家实收</span>
                    <span style="color:#52c41a;font-weight:600;">¥${detail.sellerIncome ? detail.sellerIncome.toFixed(2) : '0.00'}</span>
                </div>` : ''}
            </div>

            <!-- ===== 5. 底部操作栏 ===== -->
            <div style="background:#fafafa;padding:16px;border-top:1px solid #f0f0f0;">
                <div class="order-bottom-bar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    ${(orderRole || 'buy') === 'sell' && detail.tradeType === 1
                        ? `<button onclick="viewBuyerAddress('${detail.paymentNo}')" style="border:1px solid #d9d9d9;background:#fff;color:#666;font-size:13px;padding:7px 16px;border-radius:6px;cursor:pointer;transition:all 0.2s;white-space:nowrap;"
                            onmouseover="this.style.borderColor='#FF7D00';this.style.color='#FF7D00'" onmouseout="this.style.borderColor='#d9d9d9';this.style.color='#666'">查看该买家地址</button>`
                        : (orderRole || 'buy') === 'buy' ? `<button onclick="viewPaymentGroupDetail('${detail.paymentNo}')" style="border:1px solid #d9d9d9;background:#fff;color:#666;font-size:13px;padding:7px 16px;border-radius:6px;cursor:pointer;transition:all 0.2s;white-space:nowrap;"
                            onmouseover="this.style.borderColor='#FF7D00';this.style.color='#FF7D00'" onmouseout="this.style.borderColor='#d9d9d9';this.style.color='#666'">查看全部关联订单 (${detail.paymentNo ? detail.paymentNo.slice(-8) : ''})</button>` : ''}
                    <div style="display:flex;align-items:center;gap:12px;margin-left:auto;">
                        ${actionHtml ? '<div>' + actionHtml + '</div>' : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    content.innerHTML = html;
}

/** 复制文本到剪贴板 */
function copyToClipboard(text, label) {
    if (!text) return;
    try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(label + '已复制', 'success');
    } catch (e) {
        showToast('复制失败', 'error');
    }
}

/** 查看买家地址（卖家视角） */
async function viewBuyerAddress(paymentNo) {
    if (!paymentNo) { showToast('支付单号为空', 'error'); return; }
    try {
        const addrRes = await API.order.addresses(paymentNo, 'sell');
        const addresses = isApiOk(addrRes) && addrRes.data ? addrRes.data : [];
        if (!addresses.length) {
            showToast('暂无买家地址信息', 'info');
            return;
        }
        const groups = {};
        addresses.forEach(function(addr) {
            var key = (addr.dormitoryName||'') + '|' + (addr.detailAddress||'') + '|' + (addr.name||'') + '|' + (addr.phone||'');
            if (!groups[key]) groups[key] = { dormitoryName: addr.dormitoryName, detailAddress: addr.detailAddress, name: addr.name, phone: addr.phone, goods: [] };
            groups[key].goods.push(addr.goodsName || '');
        });
        var html = '<div style="padding:8px 0;">';
        for (var k in groups) {
            var g = groups[k];
            html += '<div style="background:#fff;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,0.06);">';
            html += '<div style="font-size:13px;color:#333;line-height:1.8;">';
            html += '<div style="font-weight:600;margin-bottom:6px;">' + escapeHtml(g.goods.join('、')) + '</div>';
            html += '<div style="color:#666;">' + escapeHtml(g.dormitoryName||'') + ' ' + escapeHtml(g.detailAddress||'') + '</div>';
            html += '<div style="color:#666;">' + escapeHtml(g.name||'') + ' ' + escapeHtml(g.phone||'') + '</div>';
            html += '</div></div>';
        }
        html += '</div>';
        var body = document.getElementById('paymentGroupBody');
        if (body) {
            body.innerHTML = html;
            openModal('paymentGroupModal');
        }
    } catch (e) {
        console.error('加载买家地址失败:', e);
        showToast('加载失败', 'error');
    }
}

async function viewPaymentGroupDetail(paymentNo) {
    if (!paymentNo) { showToast('支付单号为空', 'error'); return; }
    const body = document.getElementById('paymentGroupBody');
    if (!body) return;
    body.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    openModal('paymentGroupModal');

    try {
        var role = orderRole || 'buy';
        const [groupRes, addrRes] = await Promise.all([
            API.order.groupDetail(paymentNo),
            API.order.addresses(paymentNo, role)
        ]);
        if (!isApiOk(groupRes) || !groupRes.data) {
            body.innerHTML = '<div class="loading-placeholder">加载失败</div>';
            return;
        }
        var addresses = isApiOk(addrRes) && addrRes.data ? addrRes.data : [];

        //同步存储当前支付信息到全局变量（供 payNowFromGroup 使用）
        payPaymentNo = paymentNo;
        payOrderNo = groupRes.data.orderNo;
        payTotalAmount = groupRes.data.totalAmount;

        //先渲染内容，不让预取阻塞弹窗展示
        renderPaymentGroupDetail(groupRes.data, addresses);

        //后台预取二维码，用户点"去支付"时直接用缓存，省去等待支付宝接口的时间
        try {
            const qrRes = await API.pay.create(paymentNo);
            if (isApiOk(qrRes) && qrRes.data) {
                payQrCodeStr = qrRes.data;
            }
        } catch (e) {
            //预取失败不影响用户手动点击
        }

    } catch (e) {
        console.error('加载大订单详情失败:', e);
        body.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

/** 渲染大订单详情（在模态框内） */
function renderPaymentGroupDetail(group, addresses) {
    const body = document.getElementById('paymentGroupBody');
    if (!body) return;

    var html = `
            <!-- 支付信息（同 OrderDetailVO 的订单信息） -->
            <div style="background:#fff;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,0.06);">
                <div style="font-size:13px;color:#999;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f5f5f5;display:flex;justify-content:space-between;align-items:center;">
                    <span>订单号: ${escapeHtml(group.orderNo || '—')}</span>
                    <span style="font-weight:500;color:${getStatusColor(group.status)};">${group.statusText || ''}</span>
                </div>
                <div style="font-size:13px;color:#666;line-height:2;">
                    <div>支付宝交易号: ${escapeHtml(group.alipayTradeNo || '—')}</div>
                    <div>下单时间: ${group.createTime ? formatDateTime(group.createTime) : '—'}</div>
                    ${group.payTime ? '<div>支付时间: ' + formatDateTime(group.payTime) + '</div>' : ''}
                    <div style="font-weight:700;color:#FF4D4F;font-size:16px;margin-top:4px;">合计: ¥${group.totalAmount ? group.totalAmount.toFixed(2) : '0.00'}</div>
                    ${group.status === 0 ? '<div style="display:flex;align-items:center;gap:12px;margin-top:6px;"><div id="paymentGroupCountdown" style="font-size:13px;color:#FF4D4F;font-weight:600;">支付剩余时间: 计算中...</div>' + ((orderRole || 'buy') === 'buy' ? '<button onclick="event.stopPropagation();payNowFromGroup()" style="border:none;background:#FF7D00;color:#fff;font-size:12px;padding:4px 12px;border-radius:4px;cursor:pointer;white-space:nowrap;">去支付</button>' : '') + '</div>' : ''}
                </div>
            </div>

            <!-- 各卖家分组（对方信息 + 商品列表） -->
            ${(group.sellers || []).map(function(seller) {
                return `
                    <div style="background:#fff;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,0.06);">
                        <!-- 对方信息（对应 OrderDetailVO 中的对方信息，role=sell 展示买家，role=buy 展示卖家） -->
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f5f5f5;">
                            <img src="${seller.counterpartyAvatar || ''}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#f3f4f6;cursor:pointer;"
                                onclick="showSellerProfile(${seller.counterpartyId})"
                                onerror="this.style.display='none'">
                            <div style="font-size:13px;font-weight:500;color:#333;">${(orderRole || 'buy') === 'buy' ? '卖家' : '买家'}: ${escapeHtml(seller.counterpartyNickname || '未知')}</div>
                        </div>
                        <!-- 商品列表（对应 OrderDetailVO 中的商品信息，但支持多个） -->
                        ${(seller.items || []).map(function(item) {
                            return `
                                <div style="display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #f8f8f8;">
                                    <img src="${item.goodsImage || ''}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;background:#f3f4f6;cursor:pointer;"
                                        onclick="showGoodsDetail(${item.goodsId})"
                                        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect fill=%22%23f3f4f6%22 width=%2264%22 height=%2264%22/></svg>'">
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.goodsName || '未知商品')}</div>
                                        <div style="font-size:12px;color:#999;">¥${item.price ? item.price.toFixed(2) : '0.00'} × ${item.quantity || 0}</div>
                                        <div style="font-size:11px;color:#bbb;">${item.tradeTypeText || ''}</div>
                                    </div>
                                    <div style="text-align:right;flex-shrink:0;">
                                        <div style="font-weight:600;color:#333;">¥${item.subtotal ? item.subtotal.toFixed(2) : '0.00'}</div>
                                        <div style="font-size:11px;margin-top:2px;color:${getStatusColor(item.status)};">${item.statusText || getStatusText(item.status)}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }).join('')}

        ${addresses && addresses.length ? `
            <!-- 地址信息（按相同地址合并） -->
            <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 6px rgba(0,0,0,0.06);">
                <div style="font-size:14px;font-weight:600;color:#333;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f5f5f5;">${(orderRole || 'buy') === 'buy' ? '取货地址' : '送货地址'}</div>
                ${function(){
                    var groups = {};
                    addresses.forEach(function(addr){
                        var key = (addr.dormitoryName||'') + '|' + (addr.detailAddress||'') + '|' + (addr.name||'') + '|' + (addr.phone||'');
                        if (!groups[key]) groups[key] = { dormitoryName: addr.dormitoryName, detailAddress: addr.detailAddress, name: addr.name, phone: addr.phone, goods: [] };
                        groups[key].goods.push(addr.goodsName || '');
                    });
                    var out = '';
                    for (var k in groups) {
                        var g = groups[k];
                        out += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f8f8f8;">';
                        out += '<div style="flex:1;font-size:13px;color:#555;line-height:1.8;">';
                        out += '<div style="font-weight:500;color:#333;">' + escapeHtml(g.goods.join('、')) + '</div>';
                        out += '<div>' + escapeHtml(g.dormitoryName||'') + ' ' + escapeHtml(g.detailAddress||'') + '</div>';
                        out += '<div>' + escapeHtml(g.name||'') + ' ' + escapeHtml(g.phone||'') + '</div>';
                        out += '</div></div>';
                    }
                    return out;
                }()}
            </div>
        ` : ''}
    `;

    body.innerHTML = html;

    //待付款订单倒计时（30分钟支付期限）
    if (group.status === 0 && group.createTime) {
        var deadline = new Date(group.createTime).getTime() + 30 * 60 * 1000;
        function updateCountdown() {
            var remaining = deadline - Date.now();
            var el = document.getElementById('paymentGroupCountdown');
            if (!el) return;
            if (remaining <= 0) {
                el.textContent = '支付已超时，订单已取消';
                el.style.color = '#999';
                clearInterval(timer);
                return;
            }
            var min = Math.floor(remaining / 60000);
            var sec = Math.floor((remaining % 60000) / 1000);
            el.textContent = '支付剩余时间: ' + min + '分' + (sec < 10 ? '0' : '') + sec + '秒';
        }
        updateCountdown();
        var timer = setInterval(updateCountdown, 1000);
    }
}

// 我的闲置编辑模式状态
let myProductsEditMode = false;
let myProductsData = []; // 存储当前加载的闲置列表数据
let appealingGoodsId = null;
let currentAppealGoodsId = null;
let originalEditData = null;

// 切换我的闲置标签
function switchMyProductsTab(tab) {
    myProductsTab = tab;
    
    // 更新标签状态
    document.querySelectorAll('#myProductsSlide .slide-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`#myProductsSlide .slide-tab[data-tab="${tab}"]`).classList.add('active');
    
    // 根据标签显示/隐藏批量管理按钮
    const editBtn = document.getElementById('myProductsEditBtn');
    if (editBtn) {
        if (tab === 'offline' || tab === 'disabled') {
            editBtn.style.display = 'flex';
        } else {
            editBtn.style.display = 'none';
            // 如果切换到已上架，退出编辑模式
            if (myProductsEditMode) {
                toggleMyProductsEditMode();
            }
        }
    }
    
    loadMyProductsList();
}

// 切换我的闲置编辑模式
function toggleMyProductsEditMode() {
    myProductsEditMode = !myProductsEditMode;
    const editBtn = document.getElementById('myProductsEditBtn');
    
    if (editBtn) {
        if (myProductsEditMode) {
            editBtn.classList.add('active');
            editBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                退出管理
            `;
        } else {
            editBtn.classList.remove('active');
            editBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                批量管理
            `;
        }
    }
    
    // 重新加载列表以更新UI
    loadMyProductsList();
}

// 搜索我的闲置
function filterMyProducts() {
    // 清除之前的定时器
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    
    // 设置新的定时器，300ms后执行
    searchDebounceTimer = setTimeout(() => {
        myProductsKeyword = document.getElementById('myProductsSearch').value.trim();
        loadMyProductsList();
    }, 300);
}

// 加载我的闲置列表
async function loadMyProductsList() {
    const content = document.getElementById('myProductsContent');
    content.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    
    try {
        const params = {
            pageNum: 1,
            pageSize: 10
        };
        
        if (myProductsKeyword) {
            params.keyword = myProductsKeyword;
        }
        
        if (myProductsTab === 'published') {
            // 已上架：tab=1
            params.tab = 1;
        } else if (myProductsTab === 'offline') {
            // 已下架：tab=2
            params.tab = 2;
        } else if (myProductsTab === 'disabled') {
            // 违规商品：tab=3
            params.tab = 3;
        } else if (myProductsTab === 'pending_review') {
            // 审核待处理：tab=4
            params.tab = 4;
        } else if (myProductsTab === 'appeal_review') {
            // 申诉待处理：tab=5
            params.tab = 5;
        }
        
        const result = await API.goods.userGoods(params);
        
        if (result && result.records) {
            renderMyProductsList(result.records);
        } else {
            renderMyProductsList([]);
        }
    } catch (error) {
        console.error('加载我的闲置失败:', error);
        content.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

// 渲染我的闲置列表
function renderMyProductsList(products) {
    const content = document.getElementById('myProductsContent');
    // 保存到全局变量，供 goAppealFromIntercept 获取 appealCount
    myProductsData = products || [];
    
    if (!products || products.length === 0) {
        content.innerHTML = '<div class="loading-placeholder">暂无闲置</div>';
        return;
    }
    
    let toolbarHtml = '';
    if (myProductsEditMode && (myProductsTab === 'offline' || myProductsTab === 'disabled')) {
        toolbarHtml = `
            <div class="my-products-toolbar">
                <label class="select-all-checkbox">
                    <input type="checkbox" id="selectAllMyProducts" onchange="toggleSelectAllMyProducts(this)">
                    <span>全选</span>
                </label>
                <button class="btn-danger btn-sm" onclick="batchDeleteMyProducts()" id="batchDeleteMyProductsBtn" disabled>
                    批量删除 (<span id="selectedMyProductsCount">0</span>)
                </button>
            </div>
        `;
    }
    
    let productsHtml = products.map(product => {
        let actionButtons = '';
        let statusBadgeHtml = '';
        
        if (myProductsEditMode && (myProductsTab === 'offline' || myProductsTab === 'disabled')) {
            actionButtons = `
                <div class="product-checkbox-wrapper-inline">
                    <input type="checkbox" class="my-product-checkbox" value="${product.goodsId}" onchange="updateSelectedMyProductsCount()">
                    <button class="delete-single-btn-small" onclick="event.stopPropagation(); deleteSingleMyProduct(${product.goodsId})" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
        } else if (myProductsTab === 'published') {
            actionButtons = `
                <button class="slide-action-btn secondary" onclick="editMyProduct(${product.goodsId}); event.stopPropagation();">编辑</button>
                <button class="slide-action-btn danger" onclick="offlineMyProduct(${product.goodsId}); event.stopPropagation();">下架</button>
            `;
        } else if (myProductsTab === 'offline') {
            if (product.saleStatus === 1) {
                actionButtons = `
                    <button class="slide-action-btn danger" onclick="deleteMyProduct(${product.goodsId}); event.stopPropagation();">删除</button>
                `;
            } else {
                actionButtons = `
                    <button class="slide-action-btn secondary" onclick="editMyProduct(${product.goodsId}); event.stopPropagation();">编辑</button>
                    <button class="slide-action-btn primary" onclick="onlineMyProduct(${product.goodsId}); event.stopPropagation();">重新上架</button>
                    <button class="slide-action-btn danger" onclick="deleteMyProduct(${product.goodsId}); event.stopPropagation();">删除</button>
                `;
            }
        } else if (myProductsTab === 'disabled') {
            statusBadgeHtml = `<span class="audit-status-badge disabled">${getAuditStatusText(product.auditStatus)}</span>`;
            actionButtons = `
                <button class="slide-action-btn secondary" onclick="editMyProduct(${product.goodsId}); event.stopPropagation();">编辑</button>
                <button class="slide-action-btn info intercept-detail-btn" data-goodsid="${product.goodsId}">违规详情</button>
            `;
        } else if (myProductsTab === 'pending_review') {
            statusBadgeHtml = `<span class="audit-status-badge pending">${getAuditStatusText(product.auditStatus)}</span>`;
        } else if (myProductsTab === 'appeal_review') {
            statusBadgeHtml = `<span class="audit-status-badge appeal">${getAuditStatusText(product.auditStatus)}</span>`;
            actionButtons = `
                <button class="slide-action-btn info appeal-detail-btn" data-goodsid="${product.goodsId}">申诉详情</button>
            `;
        }
        
        let imageHtml = '';
        if (product.firstImage) {
            imageHtml = `<img src="${product.firstImage}" alt="${escapeHtml(product.name)}" class="slide-product-image">`;
        } else {
            imageHtml = `<div class="slide-product-image" style="display:flex;align-items:center;justify-content:center;background:var(--bg-hover);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;color:var(--text-muted);">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                </svg>
            </div>`;
        }
        
        return `
            <div class="slide-item slide-product-item ${myProductsEditMode ? 'edit-mode-item' : ''}" onclick="${myProductsEditMode ? '' : `showGoodsDetail(${product.goodsId})`}">
                ${imageHtml}
                <div class="slide-product-info">
                    <div class="slide-item-header" style="margin-bottom:4px;">
                        <span class="slide-item-title">${escapeHtml(product.name)}</span>
                    </div>
                    <div class="slide-item-price" style="margin:0;">¥${product.price ? product.price.toFixed(2) : '0.00'}</div>
                    <div class="slide-item-meta" style="margin-bottom:8px;">
                        <span>${product.categoryName || ''}</span>
                        ${product.stock != null ? `<span class="stock-badge">可售: ${product.stock}</span>` : ''}
                        ${product.realStock != null ? `<span class="stock-badge stock-badge-physical">库存: ${product.realStock}</span>` : ''}
                        ${product.stock === 0 ? `<span class="stock-badge stock-badge-soldout">已售空</span>` : ''}
                        ${statusBadgeHtml}
                    </div>
                    <div class="slide-item-actions">
                        ${actionButtons}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    content.innerHTML = toolbarHtml + productsHtml;
    
    document.querySelectorAll('.intercept-detail-btn').forEach(el => {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            const goodsId = this.getAttribute('data-goodsid');
            if (goodsId) {
                showInterceptDetail(goodsId);
            }
        });
    });
    
    document.querySelectorAll('.appeal-detail-btn').forEach(el => {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            const goodsId = this.getAttribute('data-goodsid');
            if (goodsId) {
                showAppealDetail(goodsId);
            }
        });
    });
}

function getAuditStatusText(status) {
    const map = {
        1: '审核通过',
        0: '待系统审核',
        '-1': '待人工审核',
        '-2': '待申诉审核',
        '-3': '系统拦截',
        '-4': '人工拦截'
    };
    return map[status] || '状态未知';
}

// 显示申诉确认弹窗
function showAppealConfirm(goodsId, appealCount) {
    appealingGoodsId = goodsId;
    document.getElementById('appealRemainingCount').textContent = appealCount;
    openModal('appealConfirmModal');
}

// 确认申诉
function confirmAppeal() {
    closeModal('appealConfirmModal');
    const textarea = document.getElementById('appealContentInput');
    textarea.value = '';
    // 重置字数统计
    const counter = document.getElementById('appealCharCount');
    if (counter) counter.textContent = '0';
    openModal('appealContentModal');
    // 自动聚焦
    setTimeout(() => textarea.focus(), 300);
}

// 提交申诉内容
async function submitAppealContent() {
    const content = document.getElementById('appealContentInput').value.trim();
    if (!content) {
        showToast('请输入申诉内容', 'error');
        return;
    }
    if (content.length < 10) {
        showToast('申诉内容至少10个字符', 'error');
        return;
    }
    if (content.length > 500) {
        showToast('申诉内容不能超过500个字符', 'error');
        return;
    }
    if (!appealingGoodsId) {
        showToast('商品ID无效', 'error');
        return;
    }

    try {
        const result = await API.goods.submitAppeal(appealingGoodsId, { appealContent: content });
        if (isApiOk(result)) {
            showToast('申诉提交成功，请等待审核', 'success');
            closeModal('appealContentModal');
            appealingGoodsId = null;
            loadMyProductsList();
        } else {
            showToast(result.msg || '申诉提交失败', 'error');
        }
    } catch (error) {
        console.error('申诉提交失败:', error);
        showToast('网络错误', 'error');
    }
}

// 当前查看违规详情的商品ID（供"去申诉"按钮使用）
let currentInterceptGoodsId = null;

/**
 * 格式化审核管理员显示
 * interceptTarget 格式: "工号4" 或 "系统001"
 * 返回: "工号 4" 或 "系统自动拦截"
 */
function formatAdminDisplay(target) {
    if (!target) return '无';
    if (target.includes('系统')) return '系统自动拦截';
    // "工号4" → "工号 4"
    const match = target.match(/工号(\d+)/);
    if (match) return `工号 ${match[1]}`;
    return target;
}

// 将时间转为具体绝对时间格式 YYYY-MM-DD HH:mm:ss
function formatAbsoluteTime(timeStr) {
    if (!timeStr) return '未知';
    try {
        const d = new Date(timeStr);
        if (isNaN(d.getTime())) return timeStr;
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `${Y}-${M}-${D} ${h}:${m}:${s}`;
    } catch (e) {
        return timeStr;
    }
}

// 显示违规详情（美化版）
async function showInterceptDetail(goodsId) {
    if (!goodsId) {
        showToast('商品ID无效', 'error');
        return;
    }

    currentInterceptGoodsId = goodsId;

    try {
        const result = await API.goods.interceptDetail(goodsId);
        if (!isApiOk(result)) {
            showToast('获取违规详情失败', 'error');
            return;
        }

        const data = result.data;
        const body = document.getElementById('interceptDetailBody');
        // 使用具体绝对时间
        const timeStr = data.interceptTime ? formatAbsoluteTime(data.interceptTime) : '未知';
        const adminDisplay = formatAdminDisplay(data.interceptTarget);

        body.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:#fafafa;border-radius:8px;border:1px solid #f0f0f0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#FF7D00" stroke-width="2" width="18" height="18" style="flex-shrink:0;margin-top:1px;">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <div>
                        <div style="font-size:12px;color:#999;font-weight:500;margin-bottom:2px;">拦截时间</div>
                        <div style="font-size:14px;font-weight:600;color:#333;">${escapeHtml(timeStr)}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:#fafafa;border-radius:8px;border:1px solid #f0f0f0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" width="18" height="18" style="flex-shrink:0;margin-top:1px;">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <div>
                        <div style="font-size:12px;color:#999;font-weight:500;margin-bottom:2px;">审核管理员</div>
                        <div style="font-size:14px;font-weight:600;color:#333;">${escapeHtml(adminDisplay)}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:#fff8f8;border-radius:8px;border:1px solid #ffe0e0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" width="18" height="18" style="flex-shrink:0;margin-top:1px;">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <div>
                        <div style="font-size:12px;color:#999;font-weight:500;margin-bottom:2px;">违规原因</div>
                        <div style="font-size:14px;color:#e74c3c;line-height:1.6;word-break:break-word;white-space:pre-wrap;">${escapeHtml(data.interceptReason || '暂无违规原因')}</div>
                    </div>
                </div>
            </div>
        `;

        openModal('interceptDetailModal');
    } catch (error) {
        console.error('获取违规详情失败:', error);
        showToast('获取违规详情失败', 'error');
    }
}

/**
 * 从违规详情弹窗跳转到申诉（美化版）
 * 先根据商品数据获取剩余申诉次数，再弹出确认框
 */
function goAppealFromIntercept() {
    if (!currentInterceptGoodsId) {
        showToast('商品ID无效', 'error');
        return;
    }
    closeModal('interceptDetailModal');

    // 从已加载的商品数据中获取 appealCount（后端 GoodsQueryVO 字段）
    const product = myProductsData.find(p => p.goodsId == currentInterceptGoodsId);
    const appealCount = product ? (product.appealCount || 0) : 0;

    // 如果 appealCount 为 0，给出提示并阻止
    if (appealCount <= 0) {
        showToast('申诉次数已用完，无法继续申诉', 'error');
        return;
    }

    showAppealConfirm(currentInterceptGoodsId, appealCount);
}

// 显示申诉详情
async function showAppealDetail(goodsId) {
    if (!goodsId) {
        showToast('商品ID无效', 'error');
        return;
    }

    currentAppealGoodsId = goodsId;

    try {
        const result = await API.goods.appealDetail(goodsId);
        if (!isApiOk(result)) {
            showToast('获取申诉详情失败', 'error');
            return;
        }

        const data = result.data;
        const body = document.getElementById('appealDetailBody');
        const headerClose = document.getElementById('appealDetailHeaderClose');
        const closeBtn = document.getElementById('appealDetailCloseBtn');
        const confirmBtn = document.getElementById('appealDetailConfirmBtn');

        if (data.appealStatuss === 0) {
            // 申诉处理中
            body.innerHTML = `
                <div class="intercept-detail-section">
                    <div style="font-size:14px;font-weight:600;color:#f59e0b;margin-bottom:12px;">申诉处理中</div>
                    <div class="intercept-detail-item">
                        <span class="intercept-detail-label">申诉内容</span>
                        <span class="intercept-detail-value">${escapeHtml(data.appealContent || '暂无申诉内容')}</span>
                    </div>
                </div>
            `;
            if (headerClose) headerClose.style.display = 'none';
            if (closeBtn) closeBtn.style.display = 'none';
            confirmBtn.onclick = function() {
                closeModal('appealDetailModal');
                currentAppealGoodsId = null;
            };
        } else {
            // 申诉已完成：显示VO所有数据
            body.innerHTML = `
                <div class="intercept-detail-section">
                    <div class="intercept-detail-item">
                        <span class="intercept-detail-label">申诉内容</span>
                        <span class="intercept-detail-value">${escapeHtml(data.appealContent || '暂无申诉内容')}</span>
                    </div>
                    <div class="intercept-detail-item">
                        <span class="intercept-detail-label">审核人</span>
                        <span class="intercept-detail-value">${escapeHtml(data.auditAdmin || '无')}</span>
                    </div>
                    <div class="intercept-detail-item">
                        <span class="intercept-detail-label">申诉结果</span>
                        <span class="intercept-detail-value">${escapeHtml(data.auditReason || '无')}</span>
                    </div>
                    <div class="intercept-detail-item">
                        <span class="intercept-detail-label">申诉状态</span>
                        <span class="intercept-detail-value">${escapeHtml(data.appealStatus || '已完成')}</span>
                    </div>
                </div>
            `;
            if (headerClose) headerClose.style.display = '';
            if (closeBtn) closeBtn.style.display = '';
            confirmBtn.onclick = confirmBlock;
        }

        openModal('appealDetailModal');
    } catch (error) {
        console.error('获取申诉详情失败:', error);
        showToast('获取申诉详情失败', 'error');
    }
}

// 确认收到申诉结果
async function confirmBlock() {
    if (!currentAppealGoodsId) {
        showToast('商品ID无效', 'error');
        return;
    }

    try {
        const result = await API.goods.blockConfirm(currentAppealGoodsId);
        if (isApiOk(result)) {
            showToast('已确认申诉结果', 'success');
            closeModal('appealDetailModal');
            currentAppealGoodsId = null;
            loadMyProductsList();
        } else {
            showToast(result.msg || '操作失败', 'error');
        }
    } catch (error) {
        console.error('确认申诉结果失败:', error);
        showToast('网络错误', 'error');
    }
}

// 下架闲置
async function offlineMyProduct(goodsId) {
    if (!confirm('确定要下架这个闲置吗？')) {
        return;
    }
    
    try {
        console.log('调用下架接口 /user/goods/offShelf/' + goodsId);
        const result = await API.goods.offShelf(goodsId);
        
        if (isApiOk(result)) {
            showToast('下架成功', 'success');
            loadMyProductsList();
            // 同时刷新个人中心主页的闲置列表
            loadProfileProducts();
        } else {
            showToast(result?.msg || '下架失败', 'error');
        }
    } catch (error) {
        console.error('下架失败:', error);
        showToast('下架失败', 'error');
    }
}

// 从详情页下架商品（复用 offlineMyProduct 逻辑）
function confirmOffShelf(goodsId) {
    offlineMyProduct(goodsId);
}

// 重新上架闲置
async function onlineMyProduct(goodsId) {
    if (!confirm('确定要重新上架这个闲置吗？')) {
        return;
    }
    
    try {
        console.log('调用上架接口 /user/goods/onShelf/' + goodsId);
        const result = await API.goods.onShelf(goodsId);
        
        if (isApiOk(result)) {
            showToast('上架成功', 'success');
            loadMyProductsList();
            // 同时刷新个人中心主页的闲置列表
            loadProfileProducts();
        } else {
            showToast(result?.msg || '上架失败', 'error');
        }
    } catch (error) {
        console.error('上架失败:', error);
        showToast('上架失败', 'error');
    }
}

// 从详情页下架商品，成功后切换为重新上架按钮
async function offShelfFromDetail(goodsId) {
    if (!confirm('确定要下架这个闲置吗？')) {
        return;
    }
    try {
        const result = await API.goods.offShelf(goodsId);
        if (isApiOk(result)) {
            showToast('下架成功', 'success');
            loadMyProductsList();
            loadProfileProducts();
            const footer = document.getElementById('productDetailFooter');
            if (footer) {
                var auditStatus = window._currentDetailAuditStatus;
                if (auditStatus === -2 || auditStatus === -1 || auditStatus === 0) {
                    footer.innerHTML = `<button class="gd-action-btn gd-action-primary" onclick="onShelfFromDetail(${goodsId})">重新上架</button>`;
                } else {
                    footer.innerHTML = `
                        <button class="gd-action-btn gd-action-outline" onclick="editMyProduct(${goodsId})">编辑商品</button>
                        <button class="gd-action-btn gd-action-primary" onclick="onShelfFromDetail(${goodsId})">重新上架</button>
                    `;
                }
            }
        } else {
            showToast(result?.msg || '下架失败', 'error');
        }
    } catch (error) {
        console.error('下架失败:', error);
        showToast('下架失败', 'error');
    }
}

// 从详情页重新上架商品，成功后切换为下架按钮
async function onShelfFromDetail(goodsId) {
    if (!confirm('确定要重新上架这个闲置吗？')) {
        return;
    }
    try {
        const result = await API.goods.onShelf(goodsId);
        if (isApiOk(result)) {
            showToast('上架成功', 'success');
            loadMyProductsList();
            loadProfileProducts();
            const footer = document.getElementById('productDetailFooter');
            if (footer) {
                var auditStatus = window._currentDetailAuditStatus;
                if (auditStatus === -2 || auditStatus === -1 || auditStatus === 0) {
                    footer.innerHTML = `<button class="gd-action-btn gd-action-danger" onclick="offShelfFromDetail(${goodsId})">下架商品</button>`;
                } else {
                    footer.innerHTML = `
                        <button class="gd-action-btn gd-action-outline" onclick="editMyProduct(${goodsId})">编辑商品</button>
                        <button class="gd-action-btn gd-action-danger" onclick="offShelfFromDetail(${goodsId})">下架商品</button>
                    `;
                }
            }
        } else {
            showToast(result?.msg || '上架失败', 'error');
        }
    } catch (error) {
        console.error('上架失败:', error);
        showToast('上架失败', 'error');
    }
}

// 删除闲置（非编辑模式）
async function deleteMyProduct(goodsId) {
    if (!confirm('确定要删除这个闲置吗？')) {
        return;
    }
    
    try {
        showToast('正在删除...', 'info');
        console.log('单个删除商品，goodsId:', goodsId);
        
        const result = await API.goods.deleteGoods([goodsId]);
        console.log('删除接口返回结果:', result);
        
        if (isApiOk(result)) {
            showToast('删除成功', 'success');
            // 重新加载列表
            loadMyProductsList();
            // 同时刷新个人中心主页的闲置列表
            loadProfileProducts();
        } else {
            console.error('删除失败，错误码:', result.code, '消息:', result.message);
            showToast(result.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除商品异常:', error);
        showToast('网络错误: ' + (error.message || '请求失败'), 'error');
    }
}

// 切换全选（我的闲置）
function toggleSelectAllMyProducts(checkbox) {
    const checkboxes = document.querySelectorAll('.my-product-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateSelectedMyProductsCount();
}

// 更新选中数量（我的闲置）
function updateSelectedMyProductsCount() {
    const checkedBoxes = document.querySelectorAll('.my-product-checkbox:checked');
    const count = checkedBoxes.length;
    const selectedCountEl = document.getElementById('selectedMyProductsCount');
    const batchDeleteBtn = document.getElementById('batchDeleteMyProductsBtn');
    
    if (selectedCountEl) {
        selectedCountEl.textContent = count;
    }
    
    if (batchDeleteBtn) {
        batchDeleteBtn.disabled = count === 0;
    }
}

// 单个删除商品（我的闲置）
async function deleteSingleMyProduct(goodsId) {
    if (!confirm('确定要删除这个商品吗？')) {
        return;
    }
    
    try {
        showToast('正在删除...', 'info');
        console.log('单个删除商品，goodsId:', goodsId);
        
        const result = await API.goods.deleteGoods([goodsId]);
        console.log('删除接口返回结果:', result);
        
        if (isApiOk(result)) {
            showToast('删除成功', 'success');
            // 重新加载列表
            loadMyProductsList();
            // 同时刷新个人中心主页的闲置列表
            loadProfileProducts();
        } else {
            console.error('删除失败，错误码:', result.code, '消息:', result.message);
            showToast(result.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除商品异常:', error);
        showToast('网络错误: ' + (error.message || '请求失败'), 'error');
    }
}

// 批量删除商品（我的闲置）
async function batchDeleteMyProducts() {
    const checkedBoxes = document.querySelectorAll('.my-product-checkbox:checked');
    
    if (checkedBoxes.length === 0) {
        showToast('请先选择要删除的商品', 'warning');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${checkedBoxes.length} 个商品吗？`)) {
        return;
    }
    
    // 获取选中的商品ID列表
    const goodsIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
    
    try {
        showToast('正在批量删除...', 'info');
        console.log('批量删除商品，goodsIds:', goodsIds);
        
        const result = await API.goods.deleteGoods(goodsIds);
        console.log('批量删除接口返回结果:', result);
        
        if (isApiOk(result)) {
            showToast(`成功删除 ${goodsIds.length} 个商品`, 'success');
            // 重新加载列表
            loadMyProductsList();
            // 同时刷新个人中心主页的闲置列表
            loadProfileProducts();
        } else {
            console.error('批量删除失败，错误码:', result.code, '消息:', result.message);
            showToast(result.message || '批量删除失败', 'error');
        }
    } catch (error) {
        console.error('批量删除异常:', error);
        showToast('网络错误: ' + (error.message || '请求失败'), 'error');
    }
}

// ==================== Hero 轮播控制（已废弃 - 公告现为文字滚动条）====================

// ==================== 画廊空白装饰系统（纯添加剂，不修改任何现有代码）====================
(function() {
    'use strict';

    var trackEl = document.getElementById('galleryTrack');
    if (!trackEl) return;

    function updateGalleryCount() {
        var container = document.getElementById('campusNewsBar');
        if (!container) return;
        var slides = trackEl.querySelectorAll(':scope > .gallery-slide:not(.gallery-slide-empty)');
        var emptySlides = trackEl.querySelectorAll(':scope > .gallery-slide-empty');
        var count;
        if (emptySlides.length > 0 && slides.length === 0) {
            count = 0;
        } else {
            count = Math.min(slides.length, 3);
        }
        container.dataset.galleryCount = String(count);
    }

    // 观察画廊DOM变化
    var observer = new MutationObserver(updateGalleryCount);
    observer.observe(trackEl, { childList: true });

    // 初始化
    updateGalleryCount();

    // 页面可见性 - 暂停动画
    var decorEl = document.querySelector('.gallery-decoration');
    if (decorEl) {
        document.addEventListener('visibilitychange', function() {
            decorEl.classList.toggle('paused', document.hidden);
        });
    }
})();

// ==================== 地址管理 ====================

/** 当前编辑中的地址ID */
let editingAddressId = null;
/** 当前编辑中的宿舍楼ID */
let editingDormitoryId = null;

/** 打开发布闲置时从空状态跳转至新增地址模块 */
function openAddressSlideAndAdd() {
    // 先关闭发布弹窗
    closeModal('productPublishModal');
    // 打开地址管理侧滑并切换到新增地址表单
    openAddressSlide();
    setTimeout(function() {
        showAddressForm();
    }, 300);
}

/** 打开地址管理侧滑卡片 */
async function openAddressSlide() {
    closeDropdown();
    const slide = document.getElementById('addressSlide');
    const overlay = document.getElementById('slideOverlay');
    slide.classList.add('active');
    overlay.classList.add('active');
    loadAddressList();
    loadDormitoryList();
}

/** 关闭地址管理侧滑卡片 */
function closeAddressSlide() {
    const slide = document.getElementById('addressSlide');
    const overlay = document.getElementById('slideOverlay');
    slide.classList.remove('active');
    overlay.classList.remove('active');
}

/** 加载地址列表 */
async function loadAddressList() {
    const container = document.getElementById('addressList');
    container.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    try {
        const res = await API.address.list();
        if (!isApiOk(res)) {
            container.innerHTML = '<div class="empty-state">加载失败</div>';
            return;
        }
        const list = res.data;
        if (!list || list.length === 0) {
            container.innerHTML = '<div class="empty-state-address">' +
                '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#999999" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>' +
                '<div class="empty-state-title">暂无收货地址</div>' +
                '<div class="empty-state-hint">点击右上角「新增」添加收货地址</div>' +
                '</div>';
            return;
        }
        container.innerHTML = list.map(a => `
            <div class="address-item${a.isDefault === 1 ? ' default' : ''}">
                <div class="address-item-radio${a.isDefault === 1 ? ' active' : ''}" data-id="${a.id}" onclick="setDefaultAddress(this)" title="设为默认地址"></div>
                <div class="address-item-info">
                    <div class="address-item-top">
                        <span class="address-item-name">${escapeHtml(a.name || '未设置')}</span>
                        <span class="address-item-phone">${escapeHtml(a.phone || '')}</span>
                        ${a.isDefault === 1 ? '<span class="address-item-badge">默认</span>' : ''}
                    </div>
                    <div class="address-item-detail">${[escapeHtml(a.schoolName), escapeHtml(a.dormitoryName), escapeHtml(a.detailAddress)].filter(Boolean).join(' ')}</div>
                    <div class="address-item-region">${[a.province, a.city, a.district, a.universityAddress].filter(Boolean).join(' ')}</div>
                </div>
                <div class="address-item-actions">
                    <button class="address-action-btn" onclick="editAddress(${a.id})" title="编辑">编辑</button>
                    <button class="address-action-btn danger" onclick="deleteAddress(${a.id})" title="删除">删除</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

/** 加载宿舍楼列表 */
async function loadDormitoryList() {
    const container = document.getElementById('dormitoryList');
    container.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    try {
        const res = await API.address.dormitoryList();
        if (!isApiOk(res)) {
            container.innerHTML = '<div class="empty-state">加载失败</div>';
            return;
        }
        const list = res.data;
        if (!list || list.length === 0) {
            container.innerHTML = '<div class="empty-state-address">' +
                '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#999999" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21V11h6v10"/><path d="M12 7h.01"/></svg></div>' +
                '<div class="empty-state-title">暂无宿舍楼</div>' +
                '<div class="empty-state-hint">点击右上角「新建」添加宿舍楼</div>' +
                '</div>';
            return;
        }
        container.innerHTML = list.map(d => `
            <div class="dormitory-item">
                <div class="dormitory-item-info">
                    <span class="dormitory-item-name">${escapeHtml(d.name)}</span>
                    <span class="dormitory-item-count">剩余修改 ${d.remainingUpdates} 次</span>
                </div>
                ${d.remainingUpdates > 0 ? `<button class="address-action-btn" onclick="editDormitory(${d.id}, '${escapeHtml(d.name)}', ${d.latitude}, ${d.longitude})">修改</button>` : ''}
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

/** 显示新增地址表单 */
async function showAddressForm() {
    editingAddressId = null;
    document.getElementById('addressFormTitle').textContent = '新增地址';
    document.getElementById('addressDetailInput').value = '';
    document.getElementById('addressNameInput').value = '';
    document.getElementById('addressPhoneInput').value = '';
    var addrEl = document.getElementById('addressUniversityAddr');
    if (addrEl) { addrEl.value = ''; addrEl.dataset.userEdited = ''; }
    // 加载宿舍楼下拉
    const select = document.getElementById('addressDormitorySelect');
    select.innerHTML = '<option value="">请选择宿舍楼</option>';
    try {
        const res = await API.address.dormitoryList();
        if (isApiOk(res) && res.data) {
            res.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.name;
                select.appendChild(opt);
            });
        }
    } catch (e) {}
    loadAddressUniversityInfo();
    openModal('addressFormModal');
}

/** 显示编辑地址表单 */
async function editAddress(id) {
    editingAddressId = id;
    document.getElementById('addressFormTitle').textContent = '修改地址';
    // 加载宿舍楼下拉
    const select = document.getElementById('addressDormitorySelect');
    select.innerHTML = '<option value="">请选择宿舍楼</option>';
    try {
        const res = await API.address.dormitoryList();
        if (isApiOk(res) && res.data) {
            res.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.name;
                select.appendChild(opt);
            });
        }
    } catch (e) {}
    // 查找地址数据预填
    try {
        const listRes = await API.address.list();
        if (isApiOk(listRes) && listRes.data) {
            const addr = listRes.data.find(a => a.id === id);
            if (addr) {
                select.value = addr.dormitoryId || '';
                document.getElementById('addressDetailInput').value = addr.detailAddress || '';
                document.getElementById('addressNameInput').value = addr.name || '';
                document.getElementById('addressPhoneInput').value = addr.phone || '';
                var uniAddrEl = document.getElementById('addressUniversityAddr');
                if (uniAddrEl) { uniAddrEl.value = addr.universityAddress || ''; uniAddrEl.dataset.userEdited = '1'; }
            }
        }
    } catch (e) {}
    loadAddressUniversityInfo();
    openModal('addressFormModal');
}

/** 关闭地址表单 */
function closeAddressForm() {
    closeModal('addressFormModal');
}

/** 提交地址表单 */
async function submitAddressForm() {
    const dormitoryId = document.getElementById('addressDormitorySelect').value;
    const detailAddress = document.getElementById('addressDetailInput').value.trim();
    const name = document.getElementById('addressNameInput').value.trim();
    const phone = document.getElementById('addressPhoneInput').value.trim();
    const universityAddress = document.getElementById('addressUniversityAddr').value.trim();
    if (!dormitoryId) {
        showToast('请选择宿舍楼', 'error');
        return;
    }
    if (!detailAddress) {
        showToast('请输入详细地址', 'error');
        return;
    }
    if (!name) {
        showToast('请输入联系人姓名', 'error');
        return;
    }
    if (!phone) {
        showToast('请输入联系电话', 'error');
        return;
    }
    try {
        if (editingAddressId) {
            const res = await API.address.update(editingAddressId, { dormitoryId: Number(dormitoryId), detailAddress, name, phone, universityAddress });
            if (isApiOk(res)) {
                showToast('修改成功', 'success');
                closeAddressForm();
                loadAddressList();
            } else {
                showToast(res.msg || '修改失败', 'error');
            }
        } else {
            const res = await API.address.add({ dormitoryId: Number(dormitoryId), detailAddress, name, phone, universityAddress });
            if (isApiOk(res)) {
                showToast('添加成功', 'success');
                closeAddressForm();
                loadAddressList();
            } else {
                showToast(res.msg || '添加失败', 'error');
            }
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

/** 加载地址表单中的大学信息 */
async function loadAddressUniversityInfo() {
    const nameEl = document.getElementById('addressUniversityName');
    const bindEl = document.getElementById('addressUniversityBind');
    const addrEl = document.getElementById('addressUniversityAddr');
    if (!nameEl || !bindEl) return;
    try {
        const res = await API.map.getUserSchool();
        if (isApiOk(res) && res.data && res.data.name) {
            nameEl.textContent = res.data.name;
            nameEl.style.color = '#333';
            bindEl.style.display = 'none';
            if (addrEl && !addrEl.dataset.userEdited) {
                var parts = [res.data.province, res.data.city, res.data.district].filter(Boolean);
                addrEl.value = parts.join(' ');
            }
        } else {
            nameEl.textContent = '当前未绑定学校';
            nameEl.style.color = '#999';
            bindEl.style.display = 'inline';
            if (addrEl) { addrEl.value = ''; addrEl.dataset.userEdited = ''; }
        }
    } catch (e) {
        nameEl.textContent = '当前未绑定学校';
        nameEl.style.color = '#999';
        bindEl.style.display = 'inline';
        if (addrEl) { addrEl.value = ''; addrEl.dataset.userEdited = ''; }
    }
}

/** 去绑定学校 - 跳转校园虚拟跳蚤市场并自动定位 */
function goBindUniversity() {
    closeAddressForm();
    closeAddressSlide();
    switchPage('fleamarket');
    var attempts = 0;
    function waitForLocate() {
        if (fmGeolocation) {
            fmTogglePanel(false);
            setTimeout(fmLocateMe, 500);
            return;
        }
        if (attempts++ < 30) setTimeout(waitForLocate, 200);
    }
    waitForLocate();
}

/** 删除地址 */
async function deleteAddress(id) {
    if (!confirm('确定要删除该地址吗？')) return;
    try {
        const res = await API.address.delete(id);
        if (isApiOk(res)) {
            showToast('删除成功', 'success');
            loadAddressList();
        } else {
            showToast(res.msg || '删除失败', 'error');
        }
    } catch (e) {
        showToast('删除失败', 'error');
    }
}

/** 设置默认地址 */
async function setDefaultAddress(radioEl) {
    const id = radioEl.dataset.id;
    if (!id) return;
    try {
        const res = await API.address.setDefault(Number(id));
        if (isApiOk(res)) {
            showToast('已设为默认地址', 'success');
            // 直接在DOM中切换状态，不重新渲染列表，避免列表跳动
            document.querySelectorAll('.address-item').forEach(el => el.classList.remove('default'));
            document.querySelectorAll('.address-item-radio').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.address-item-badge').forEach(el => el.remove());
            const item = radioEl.closest('.address-item');
            if (item) {
                item.classList.add('default');
                radioEl.classList.add('active');
                // 添加"默认"徽章
                const top = item.querySelector('.address-item-top');
                if (top) {
                    const badge = document.createElement('span');
                    badge.className = 'address-item-badge';
                    badge.textContent = '默认';
                    top.appendChild(badge);
                }
            }
        } else {
            showToast(res.msg || '设置失败', 'error');
        }
    } catch (e) {
        showToast('设置失败', 'error');
    }
}

/** 宿舍楼地图实例 */
let dormitoryCreateMap = null;
let dormitoryCreateMarker = null;
let dormitoryEditMap = null;
let dormitoryEditMarker = null;
let selectedDormitoryLat = null;
let selectedDormitoryLng = null;
let selectedEditDormitoryLat = null;
let selectedEditDormitoryLng = null;

/** 显示新建宿舍楼弹窗 */
async function showDormitoryCreate() {
    selectedDormitoryLat = null;
    selectedDormitoryLng = null;
    document.getElementById('dormitoryNameInput').value = '';
    document.getElementById('dormitoryCreateLocation').textContent = '拖动地图或点击选择位置';
    // 获取剩余次数
    try {
        const res = await API.address.remainingCreation();
        if (isApiOk(res)) {
            const remaining = res.data;
            if (remaining <= 0) {
                showToast('已达到创建宿舍楼上限（12次）', 'error');
                return;
            }
            if (!confirm(`您还有 ${remaining} 次创建机会，确定继续吗？`)) return;
        } else {
            if (res.msg && res.msg.includes('请先绑定学校')) {
                if (confirm('请先绑定学校')) {
                    goBindUniversity();
                }
            } else {
                alert(res.msg || '无法获取创建次数');
            }
            return;
        }
    } catch (e) {}
    openModal('dormitoryCreateModal');
    // 等modal动画结束后初始化地图
    setTimeout(initDormitoryCreateMap, 350);
}

/** 初始化创建宿舍楼地图(只创建一次，后续复用) */
function initDormitoryCreateMap() {
    if (dormitoryCreateMap) {
        dormitoryCreateMap.resize();
        // 清除旧标记
        if (dormitoryCreateMarker) {
            dormitoryCreateMap.remove(dormitoryCreateMarker);
            dormitoryCreateMarker = null;
        }
        if (dormitoryCreateUserMarker) {
            dormitoryCreateMap.remove(dormitoryCreateUserMarker);
            dormitoryCreateUserMarker = null;
        }
        updateDormitoryCreateCenter();
        return;
    }
    const container = document.getElementById('dormitoryMapContainer');
    if (!container || container.offsetWidth === 0) return;
    // 先尝试获取学校定位，失败则显示中国全貌
    const schoolPromise = (async function() {
        try {
            const res = await API.map.getUserSchool();
            if (isApiOk(res) && res.data && res.data.latitude && res.data.longitude) {
                return { lng: Number(res.data.longitude), lat: Number(res.data.latitude), zoom: 15 };
            }
        } catch (e) {}
        return { lng: 116.397428, lat: 39.90923, zoom: 5 };
    })();

    schoolPromise.then(function(pos) {
        dormitoryCreateMap = new AMap.Map('dormitoryMapContainer', {
            zoom: pos.zoom,
            center: [pos.lng, pos.lat],
            resizeEnable: true,
            layers: [new AMap.TileLayer()],
            mapStyle: 'amap://styles/light',
            features: ['bg', 'road', 'building', 'point']
        });
        dormitoryCreateMap.on('complete', function() {
            dormitoryCreateMap.resize();
        });
        dormitoryCreateMap.on('dragend', updateDormitoryCreateCenter);
        dormitoryCreateMap.on('click', function(e) {
            placeDormitoryCreateMarker(e.lnglat.getLng(), e.lnglat.getLat());
        });
        updateDormitoryCreateCenter();
    });
}

/** 更新创建弹窗地图中心坐标显示 */
function updateDormitoryCreateCenter() {
    if (!dormitoryCreateMap) return;
    var center = dormitoryCreateMap.getCenter();
    placeDormitoryCreateMarker(center.lng, center.lat, false);
}

/** geocoder实例缓存 */
var dormitoryGeocoder = null;
var geocodeCache = {};

/** 反向地理编码获取地址描述(带缓存，减少API调用) */
function reverseGeocode(lng, lat, callback) {
    var key = lng.toFixed(5) + ',' + lat.toFixed(5);
    if (geocodeCache[key]) {
        callback(geocodeCache[key]);
        return;
    }
    if (!dormitoryGeocoder) {
        dormitoryGeocoder = new AMap.Geocoder({ extensions: 'base', city: '' });
    }
    dormitoryGeocoder.getAddress([lng, lat], function(status, result) {
        var addr = '';
        if (status === 'complete' && result && result.regeocode) {
            addr = result.regeocode.formattedAddress || '';
        } else {
            addr = lat.toFixed(4) + ', ' + lng.toFixed(4);
        }
        geocodeCache[key] = addr;
        callback(addr);
    });
}

/** 在创建弹窗地图上放置标记 */
function placeDormitoryCreateMarker(lng, lat, moveMap) {
    selectedDormitoryLng = lng;
    selectedDormitoryLat = lat;
    reverseGeocode(lng, lat, function(addr) {
        document.getElementById('dormitoryCreateLocation').textContent = addr;
    });
    if (dormitoryCreateMarker) {
        dormitoryCreateMarker.setPosition([lng, lat]);
    } else {
        dormitoryCreateMarker = new AMap.Marker({
            position: [lng, lat],
            map: dormitoryCreateMap
        });
    }
    if (moveMap !== false && dormitoryCreateMap) {
        dormitoryCreateMap.setCenter([lng, lat]);
    }
}

/** 我的位置-创建宿舍楼 */
let dormitoryCreateUserMarker = null;
function locateDormitoryCreate() {
    if (!dormitoryCreateMap) return;
    AMap.plugin('AMap.Geolocation', function() {
        var geolocation = new AMap.Geolocation({
            enableHighAccuracy: false,
            timeout: 10000
        });
        geolocation.getCurrentPosition(function(status, result) {
            if (status === 'complete') {
                var lng = result.position.lng;
                var lat = result.position.lat;
                // 显示我的位置标记（红色水滴）
                if (dormitoryCreateUserMarker) {
                    dormitoryCreateUserMarker.setPosition([lng, lat]);
                } else {
                    dormitoryCreateUserMarker = new AMap.Marker({
                        position: [lng, lat],
                        icon: new AMap.Icon({
                            size: new AMap.Size(26, 34),
                            image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
                            imageSize: new AMap.Size(26, 34)
                        }),
                        offset: new AMap.Pixel(-13, -34)
                    });
                    dormitoryCreateUserMarker.setMap(dormitoryCreateMap);
                }
                dormitoryCreateMap.setCenter([lng, lat]);
                dormitoryCreateMap.setZoom(16);
                updateDormitoryCreateCenter();
            } else {
                showToast('定位失败，请检查定位权限', 'error');
            }
        });
    });
}

/** 关闭创建宿舍楼弹窗 */
function closeDormitoryCreateModal() {
    closeModal('dormitoryCreateModal');
    selectedDormitoryLat = null;
    selectedDormitoryLng = null;
}

/** 提交新建宿舍楼 */
async function submitDormitoryCreate() {
    const name = document.getElementById('dormitoryNameInput').value.trim();
    if (!name) {
        showToast('请输入宿舍楼名称', 'error');
        return;
    }
    if (!selectedDormitoryLat || !selectedDormitoryLng) {
        showToast('请在地图上点击选择位置', 'error');
        return;
    }
    try {
        const res = await API.address.addDormitory({
            name,
            latitude: selectedDormitoryLat,
            longitude: selectedDormitoryLng
        });
        if (isApiOk(res)) {
            showToast('创建成功', 'success');
            closeDormitoryCreateModal();
            loadDormitoryList();
        } else {
            closeDormitoryCreateModal();
            setTimeout(() => alert(res.msg || '创建失败'), 100);
        }
    } catch (e) {
        showToast('创建失败', 'error');
    }
}

/** 显示修改宿舍楼弹窗 */
async function editDormitory(id, name, lat, lng) {
    editingDormitoryId = id;
    selectedEditDormitoryLat = lat;
    selectedEditDormitoryLng = lng;
    document.getElementById('editDormitoryNameInput').value = name;
    document.getElementById('editDormitoryLocation').textContent = '';
    openModal('dormitoryEditModal');
    setTimeout(initDormitoryEditMap, 350);
}

/** 初始化修改宿舍楼地图 */
function initDormitoryEditMap() {
    const container = document.getElementById('editDormitoryMapContainer');
    if (!container || container.offsetWidth === 0) return;
    if (dormitoryEditMap) {
        dormitoryEditMap.resize();
        if (dormitoryEditMarker) {
            dormitoryEditMap.remove(dormitoryEditMarker);
            dormitoryEditMarker = null;
        }
        if (dormitoryEditUserMarker) {
            dormitoryEditMap.remove(dormitoryEditUserMarker);
            dormitoryEditUserMarker = null;
        }
        updateDormitoryEditCenter();
        return;
    }
    const center = selectedEditDormitoryLng ? [selectedEditDormitoryLng, selectedEditDormitoryLat] : [116.397428, 39.90923];
    dormitoryEditMap = new AMap.Map('editDormitoryMapContainer', {
        zoom: selectedEditDormitoryLng ? 16 : 5,
        center: center,
        resizeEnable: true,
        layers: [new AMap.TileLayer()],
        mapStyle: 'amap://styles/light',
        features: ['bg', 'road', 'building', 'point']
    });
    dormitoryEditMap.on('complete', function() {
        dormitoryEditMap.resize();
    });
    // 显示现有位置标记
    if (selectedEditDormitoryLng) {
        dormitoryEditMarker = new AMap.Marker({
            position: [selectedEditDormitoryLng, selectedEditDormitoryLat],
            map: dormitoryEditMap
        });
    }
    // 拖拽更新中心坐标
    dormitoryEditMap.on('dragend', updateDormitoryEditCenter);
    // 点击放置标记
    dormitoryEditMap.on('click', function(e) {
        placeDormitoryEditMarker(e.lnglat.getLng(), e.lnglat.getLat());
    });
    // 初始化坐标显示
    updateDormitoryEditCenter();
}

/** 更新修改弹窗地图中心坐标 */
function updateDormitoryEditCenter() {
    if (!dormitoryEditMap) return;
    var center = dormitoryEditMap.getCenter();
    placeDormitoryEditMarker(center.lng, center.lat, false);
}

/** 在修改弹窗地图上放置标记 */
function placeDormitoryEditMarker(lng, lat, moveMap) {
    selectedEditDormitoryLng = lng;
    selectedEditDormitoryLat = lat;
    document.getElementById('editDormitoryLocation').textContent = '';
    reverseGeocode(lng, lat, function(addr) {
        document.getElementById('editDormitoryLocation').textContent = addr;
    });
    if (dormitoryEditMarker) {
        dormitoryEditMarker.setPosition([lng, lat]);
    } else {
        dormitoryEditMarker = new AMap.Marker({
            position: [lng, lat],
            map: dormitoryEditMap
        });
    }
    if (moveMap !== false && dormitoryEditMap) {
        dormitoryEditMap.setCenter([lng, lat]);
    }
}

/** 我的位置-修改宿舍楼 */
let dormitoryEditUserMarker = null;
function locateDormitoryEdit() {
    if (!dormitoryEditMap) return;
    AMap.plugin('AMap.Geolocation', function() {
        var geolocation = new AMap.Geolocation({
            enableHighAccuracy: false,
            timeout: 10000
        });
        geolocation.getCurrentPosition(function(status, result) {
            if (status === 'complete') {
                var lng = result.position.lng;
                var lat = result.position.lat;
                // 显示我的位置标记（红色水滴）
                if (dormitoryEditUserMarker) {
                    dormitoryEditUserMarker.setPosition([lng, lat]);
                } else {
                    dormitoryEditUserMarker = new AMap.Marker({
                        position: [lng, lat],
                        icon: new AMap.Icon({
                            size: new AMap.Size(26, 34),
                            image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
                            imageSize: new AMap.Size(26, 34)
                        }),
                        offset: new AMap.Pixel(-13, -34)
                    });
                    dormitoryEditUserMarker.setMap(dormitoryEditMap);
                }
                dormitoryEditMap.setCenter([lng, lat]);
                dormitoryEditMap.setZoom(16);
                updateDormitoryEditCenter();
            } else {
                showToast('定位失败，请检查定位权限', 'error');
            }
        });
    });
}

/** 关闭修改宿舍楼弹窗 */
function closeDormitoryEditModal() {
    closeModal('dormitoryEditModal');
    editingDormitoryId = null;
    selectedEditDormitoryLat = null;
    selectedEditDormitoryLng = null;
}

/** 提交修改宿舍楼 */
async function submitDormitoryEdit() {
    const name = document.getElementById('editDormitoryNameInput').value.trim();
    if (!name) {
        showToast('请输入宿舍楼名称', 'error');
        return;
    }
    if (!selectedEditDormitoryLat || !selectedEditDormitoryLng) {
        showToast('请在地图上点击选择位置', 'error');
        return;
    }
    try {
        const res = await API.address.updateDormitory(editingDormitoryId, {
            name,
            latitude: selectedEditDormitoryLat,
            longitude: selectedEditDormitoryLng
        });
        if (isApiOk(res)) {
            showToast('修改成功', 'success');
            closeDormitoryEditModal();
            loadDormitoryList();
        } else {
            showToast(res.msg || '修改失败', 'error');
        }
    } catch (e) {
        showToast('修改失败', 'error');
    }
}

// ==================== 购物车 ====================

let cartKeywordTimer = null;

/** 加载购物车数据 */
async function loadCartData(keyword) {
    const emptyEl = document.getElementById('cartEmpty');
    const bodyEl = document.getElementById('cartBody');
    const itemsEl = document.getElementById('cartItems');
    const searchSect = document.getElementById('cartSearchSect');

    try {
        const kw = keyword || '';
        const result = await API.cart.list(1, 100, kw);
        const pageData = result.data;
        if (!isApiOk(result) || !pageData || !pageData.records || pageData.records.length === 0) {
            emptyEl.style.display = 'flex';
            bodyEl.style.display = 'none';
            searchSect.style.display = kw ? '' : 'none';
            return;
        }

        const groups = pageData.records;
        //按卖家分组渲染
        itemsEl.innerHTML = groups.map(group => {
            const avatarHtml = group.sellerAvatar
                ? `<img src="${group.sellerAvatar}" alt="" class="cs-avatar" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23d1d5db%22><circle cx=%2212%22 cy=%228%22 r=%224%22/><path d=%22M4 22c0-4 4-7 8-7s8 3 8 7%22/></svg>'">`
                : `<div class="cs-avatar cs-avatar-placeholder">${escapeHtml((group.sellerNickname || '?')[0])}</div>`;

            const allValid = group.items.every(i => i.auditStatus === 1 && i.shelfStatus === 1 && i.stock > 0);
            const allSelected = allValid && group.items.every(i => i.selected === 1);

            const itemsHtml = group.items.map(item => {
                const valid = item.auditStatus === 1 && item.shelfStatus === 1 && item.stock > 0;
                const imgHtml = item.firstImage
                    ? `<img src="${item.firstImage}" alt="${escapeHtml(item.goodsName)}" class="cart-item-img" onerror="this.style.display='none'">`
                    : `<div class="cart-item-img" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
                return `
                    <div class="cart-item" data-cart-id="${item.id}" data-goods-id="${item.goodsId}" data-price="${item.price}" data-stock="${item.stock}">
                        <div class="ci-check">
                            <input type="checkbox" class="ci-checkbox" data-goods-id="${item.goodsId}" ${valid ? '' : 'disabled'} ${valid && item.selected === 1 ? 'checked' : ''} onchange="toggleItemSelect(this)">
                        </div>
                        <div class="ci-img" onclick="showGoodsDetail(${item.goodsId})" style="cursor:pointer">
                            ${imgHtml}
                        </div>
                        <div class="ci-info" onclick="showGoodsDetail(${item.goodsId})" style="cursor:pointer">
                            <div class="ci-name">${escapeHtml(item.goodsName)}</div>
                            <div class="ci-meta">${item.stock > 0 ? '库存 ' + item.stock : '已售空'}</div>
                        </div>
                        <div class="ci-price">¥${item.price.toFixed(2)}</div>
                        <div class="ci-qty">
                            <div class="ci-qty-wrap">
                                <button class="ci-qty-btn" onclick="changeCartQuantity(${item.goodsId}, -1)">−</button>
                                <input class="ci-qty-input" data-goods-id="${item.goodsId}" data-last-value="${item.quantity}" value="${item.quantity}" onchange="validateCartInput(this)">
                                <button class="ci-qty-btn" onclick="changeCartQuantity(${item.goodsId}, 1)">+</button>
                            </div>
                        </div>
                        <div class="ci-subtotal">¥${(item.price * item.quantity).toFixed(2)}</div>
                        <div class="ci-trade${item.tradeType === 2 ? ' ci-trade-clickable' : ''}"${item.tradeType === 2 ? ` data-dormitory="${item.addressDormitory || ''}" onclick="showPickupAddress(this)"` : ''}>${getTradeTypeText(item.tradeType) || '—'}</div>
                        <div class="ci-action"><button class="ci-remove" onclick="confirmRemoveCartItem(${item.goodsId})">删除</button></div>
                    </div>
                `;
            }).join('');

            return `
                <div class="cart-seller-group" data-seller-id="${group.sellerId}">
                    <div class="cs-header">
                        <div class="cs-check"><input type="checkbox" class="cs-checkbox" data-seller-id="${group.sellerId}" ${allSelected ? 'checked' : ''} onchange="toggleSellerSelect(this)"></div>
                        ${avatarHtml}
                        <span class="cs-nickname">${escapeHtml(group.sellerNickname || '未知用户')}</span>
                        <span class="cs-count">共 ${group.items.length} 件</span>
                    </div>
                    <div class="cs-items">${itemsHtml}</div>
                </div>
            `;
        }).join('');

        emptyEl.style.display = 'none';
        bodyEl.style.display = '';
        searchSect.style.display = '';
        document.getElementById('cartSearchClear').style.display = kw ? '' : 'none';
        updateCartTotal();
    } catch (e) {
        console.error('加载购物车失败:', e);
        emptyEl.style.display = 'flex';
        bodyEl.style.display = 'none';
        searchSect.style.display = 'none';
    }
}

/** 搜索防抖 */
function debounceCartSearch() {
    clearTimeout(cartKeywordTimer);
    cartKeywordTimer = setTimeout(doCartSearch, 300);
}

/** 执行搜索 */
function doCartSearch() {
    const kw = document.getElementById('cartKeyword').value.trim();
    loadCartData(kw);
}

/** 清除搜索关键词 */
function clearCartKeyword() {
    document.getElementById('cartKeyword').value = '';
    document.getElementById('cartSearchClear').style.display = 'none';
    loadCartData('');
}

/** 全选/取消全选 */
/** 同步勾选/取消勾选到后端 */
async function syncCartSelect(goodsIds) {
    if (!goodsIds || !goodsIds.length) return;
    try {
        const res = await API.cart.select(goodsIds);
        if (!isApiOk(res) && res.message) {
            showToast(res.message, 'warning');
            loadCartData();
        }
    } catch (e) {
        //静默处理
    }
}

function toggleAllCart() {
    const checked = document.getElementById('cartSelectAll').checked;
    const toggleIds = [];
    document.querySelectorAll('.ci-checkbox:not(:disabled)').forEach(cb => {
        if (cb.checked !== checked) toggleIds.push(parseInt(cb.dataset.goodsId));
        cb.checked = checked;
    });
    document.querySelectorAll('.cs-checkbox').forEach(cb => {
        const group = cb.closest('.cart-seller-group');
        const itemCbs = group.querySelectorAll('.ci-checkbox:not(:disabled)');
        cb.checked = itemCbs.length > 0 && Array.from(itemCbs).every(c => c.checked);
    });
    updateCartTotal();
    updateCartBatchBar();
    syncCartSelect(toggleIds);
}

/** 切换卖家下所有商品的选择状态 */
function toggleSellerSelect(el) {
    const group = el.closest('.cart-seller-group');
    const itemCbs = group.querySelectorAll('.ci-checkbox:not(:disabled)');
    const allChecked = itemCbs.length > 0 && Array.from(itemCbs).every(c => c.checked);
    const toggleIds = [];
    itemCbs.forEach(c => {
        if (c.checked === allChecked) toggleIds.push(parseInt(c.dataset.goodsId));
        c.checked = !allChecked;
    });
    el.checked = !allChecked;
    updateCartTotal();
    updateCartBatchBar();
    syncCartSelect(toggleIds);
}

/** 切换单个商品选择状态 */
function toggleItemSelect(el) {
    if (el.disabled) {
        showToast('该商品已下架或未通过审核，无法选择', 'warning');
        return;
    }
    const group = el.closest('.cart-seller-group');
    const sellerCb = group.querySelector('.cs-checkbox');
    const itemCbs = group.querySelectorAll('.ci-checkbox:not(:disabled)');
    sellerCb.checked = itemCbs.length > 0 && Array.from(itemCbs).every(c => c.checked);
    updateCartTotal();
    updateCartBatchBar();
    syncCartSelect([parseInt(el.dataset.goodsId)]);
}

/** 修改数量 */
async function changeCartQuantity(goodsId, delta) {
    const input = document.querySelector(`.ci-qty-input[data-goods-id="${goodsId}"]`);
    if (!input) return;
    const item = document.querySelector(`.cart-item[data-goods-id="${goodsId}"]`);
    const stock = parseInt(item?.dataset?.stock || 0);
    let val = parseInt(input.value) + delta;
    if (delta < 0 && val < 1) {
        if (confirm('确定要移除此商品吗？')) {
            removeCartItem(goodsId);
        }
        return;
    }
    if (val > stock) val = stock;
    input.value = val;
    input.dataset.lastValue = val;
    // 同步服务端
    try {
        await API.cart.updateQuantity(goodsId, val);
    } catch (e) {
        //静默处理
    }
    // 更新小计
    const price = parseFloat(item.dataset.price || '0');
    const subtotalEl = item.querySelector('.ci-subtotal');
    if (subtotalEl) subtotalEl.textContent = '¥' + (price * val).toFixed(2);
    updateCartTotal();
}

/** 删除购物车项（不含确认弹窗，供内部调用） */
async function removeCartItem(goodsId) {
    const cartId = getCartIdByGoodsId(goodsId);
    if (!cartId) return;
    try {
        const res = await API.cart.deleteByIds([cartId]);
        if (!isApiOk(res)) {
            showToast(res.message || '删除失败', 'error');
            return;
        }
    } catch (e) {
        showToast('网络异常', 'error');
        return;
    }
    const item = document.querySelector(`.cart-item[data-goods-id="${goodsId}"]`);
    if (item) {
        const group = item.closest('.cart-seller-group');
        item.remove();
        //卖家分组已空则移除整个分组头部
        if (group && !group.querySelector('.cart-item')) {
            group.remove();
        }
    }
    if (document.querySelectorAll('.cart-item').length === 0) {
        document.getElementById('cartEmpty').style.display = 'flex';
        document.getElementById('cartBody').style.display = 'none';
    }
    updateCartTotal();
}

/** 删除购物车项（带确认弹窗，供按钮点击调用） */
function confirmRemoveCartItem(goodsId) {
    if (confirm('确定要移除此商品吗？')) {
        removeCartItem(goodsId);
    }
}

/** 批量删除选中购物车商品 */
async function deleteSelectedCart() {
    const checkedBoxes = document.querySelectorAll('.ci-checkbox:checked');
    if (!checkedBoxes.length) return;
    if (!confirm(`确定要删除选中的 ${checkedBoxes.length} 件商品吗？`)) return;
    const cartIds = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.goodsId)).map(goodsId => getCartIdByGoodsId(goodsId)).filter(id => id);
    if (!cartIds.length) return;
    try {
        const res = await API.cart.deleteByIds(cartIds);
        if (!isApiOk(res)) {
            showToast(res.message || '删除失败', 'error');
            return;
        }
    } catch (e) {
        showToast('网络异常', 'error');
        return;
    }
    //删除DOM
    const removeGroups = new Set();
    checkedBoxes.forEach(cb => {
        const item = cb.closest('.cart-item');
        if (item) {
            const group = item.closest('.cart-seller-group');
            item.remove();
            if (group) removeGroups.add(group);
        }
    });
    //清理已空的卖家分组
    removeGroups.forEach(g => {
        if (!g.querySelector('.cart-item')) g.remove();
    });
    if (document.querySelectorAll('.cart-item').length === 0) {
        document.getElementById('cartEmpty').style.display = 'flex';
        document.getElementById('cartBody').style.display = 'none';
    }
    updateCartTotal();
    updateCartBatchBar();
}

/** 根据商品id获取购物车记录id */
function getCartIdByGoodsId(goodsId) {
    const item = document.querySelector(`.cart-item[data-goods-id="${goodsId}"]`);
    return item ? parseInt(item.dataset.cartId) : null;
}

/** 手动输入数量校验 */
function validateCartInput(input) {
    const goodsId = parseInt(input.dataset.goodsId);
    const item = document.querySelector(`.cart-item[data-goods-id="${goodsId}"]`);
    if (!item) return;
    const stock = parseInt(item.dataset.stock || 0);
    let val = parseInt(input.value);

    if (isNaN(val) || val < 1) {
        val = parseInt(input.dataset.lastValue || 1);
        input.value = val;
        return;
    }
    if (val > stock) {
        val = parseInt(input.dataset.lastValue || stock);
        input.value = val;
        return;
    }

    input.dataset.lastValue = val;
    // 同步服务端
    API.cart.updateQuantity(goodsId, val).catch(function() {});
    // 更新小计
    const price = parseFloat(item.dataset.price || '0');
    const subtotalEl = item.querySelector('.ci-subtotal');
    if (subtotalEl) subtotalEl.textContent = '¥' + (price * val).toFixed(2);
    updateCartTotal();
}

/** 更新批量删除栏 */
function updateCartBatchBar() {
    const bar = document.getElementById('cartBatchBar');
    if (!bar) return;
    const count = document.querySelectorAll('.ci-checkbox:checked').length;
    const countEl = document.getElementById('cartBatchCount');
    if (countEl) countEl.textContent = count;
    bar.style.display = count > 0 ? 'flex' : 'none';
}

/** 计算总计 */
function updateCartTotal() {
    let total = 0;
    let count = 0;
    document.querySelectorAll('.cart-item').forEach(item => {
        const cb = item.querySelector('.ci-checkbox');
        if (!cb || !cb.checked) return;
        const price = parseFloat(item.dataset.price || '0');
        const qty = parseInt(item.querySelector('.ci-qty-input').value || '1');
        total += price * qty;
        count++;
    });
    const allCbs = document.querySelectorAll('.ci-checkbox:not(:disabled)');
    const allChecked = allCbs.length > 0 && Array.from(allCbs).every(c => c.checked);
    document.getElementById('cartSelectAll').checked = allChecked;
    document.getElementById('csbCount').textContent = count + ' 件';
    document.getElementById('csbSubtotal').textContent = '¥' + total.toFixed(2);
    document.getElementById('csbTotal').textContent = '¥' + total.toFixed(2);
}

/** 结算 */
async function checkoutCart() {
    const selected = [];
    document.querySelectorAll('.cart-item').forEach(item => {
        const cb = item.querySelector('.ci-checkbox');
        if (cb && cb.checked) {
            selected.push({
                goodsId: parseInt(item.dataset.goodsId),
                quantity: parseInt(item.querySelector('.ci-qty-input').value || '1')
            });
        }
    });
    if (selected.length === 0) {
        showToast('请选择要结算的商品', 'warning');
        return;
    }

    // 结算前校验：检查库存/上下架
    try {
        const res = await API.cart.checkout(selected.map(i => i.goodsId));
        if (!isApiOk(res)) {
            alert(res.message || '商品状态异常，请刷新购物车');
            loadCartData();
            return;
        }
        // 保存是否需要买家地址的标志（根据商品交易方式是否有卖家上门）
        coState.needAddress = res.data && res.data.needAddress !== undefined ? res.data.needAddress : true;
    } catch (e) {
        showToast('网络异常，请重试', 'error');
        return;
    }

    localStorage.setItem('checkoutItems', JSON.stringify(selected));
    showPage('confirmOrder');
}

// ==================== 确认订单 ====================

const coState = {
    addresses: [],
    selectedAddrId: null,
    items: [],
    needAddress: true,
    paymentMethod: 'alipay',
    invoiceType: 'none',
    editingAddress: null,
    dormitories: [],
    savingAddress: false,
    submitting: false
};

/** 加载确认订单数据 */
async function loadConfirmOrderData() {
    const container = document.getElementById('coAddrList');
    if (!container) return;
    container.innerHTML = '<div class="co-empty">加载中...</div>';
    document.getElementById('coItemsContainer').innerHTML = '';

    // 并发加载确认订单所需数据（地址列表、宿舍楼、商品详情彼此独立）
    try {
        const cached = localStorage.getItem('checkoutItems');
        let goodsPromise = Promise.resolve(null);
        let goodsIds = [];
        if (cached) {
            const items = JSON.parse(cached);
            goodsIds = items.map(i => i.goodsId);
            goodsPromise = API.goods.batchDetail(goodsIds);
        }

        const [addrRes, dormRes, goodsRes] = await Promise.all([
            API.address.list().catch(e => { console.error('加载地址失败:', e); return null; }),
            API.address.dormitoryList().catch(e => { console.error('加载宿舍楼失败:', e); return null; }),
            goodsPromise
        ]);

        if (isApiOk(addrRes) && addrRes.data && addrRes.data.length) {
            coState.addresses = addrRes.data;
            const def = addrRes.data.find(a => a.isDefault === 1);
            coState.selectedAddrId = def ? def.id : addrRes.data[0].id;
        }

        if (isApiOk(dormRes) && dormRes.data) coState.dormitories = dormRes.data;

        if (isApiOk(goodsRes) && goodsRes.data && cached) {
            const items = JSON.parse(cached);
            coState.items = goodsRes.data.map(g => ({
                ...g,
                quantity: items.find(i => i.goodsId === g.goodsId)?.quantity || 1,
                sellerId: g.userId,
                sellerNickname: g.username,
                sellerAvatar: g.avatar,
                firstImage: g.imageUrls?.[0] || ''
            }));
        }
    } catch (e) { console.error('加载确认订单数据失败:', e); }

    // 根据needAddress显示/隐藏收货地址模块
    const addrCard = document.querySelector('#confirmOrderPage .co-left > .co-card:first-child');
    if (addrCard) {
        addrCard.style.display = coState.needAddress ? '' : 'none';
    }

    if (coState.needAddress) {
        renderConfirmAddresses();
    }
    renderConfirmItems();
    updateConfirmTotal();
    updateConfirmDormitorySelect();
    loadPickupAddresses();
}

/** 渲染地址列表（只显示当前选中的地址 + 更换地址按钮） */
function renderConfirmAddresses() {
    const list = document.getElementById('coAddrList');
    if (!list) return;
    if (!coState.addresses.length) {
        list.innerHTML = '<div class="co-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>暂无收货地址，请新增</div>';
        return;
    }
    const addr = coState.selectedAddrId
        ? coState.addresses.find(a => a.id === coState.selectedAddrId)
        : coState.addresses[0];
    if (!addr) return;
    if (!coState.selectedAddrId) coState.selectedAddrId = addr.id;
    list.innerHTML = `<div class="co-addr-display">
        <div class="co-addr-info">
            <div class="co-addr-top">
                <span class="co-addr-name">${escapeHtml(addr.name)}</span>
                <span class="co-addr-phone">${escapeHtml(addr.phone)}</span>
                ${addr.isDefault === 1 ? '<span class="co-addr-tag">默认</span>' : ''}
            </div>
            <div class="co-addr-detail">${escapeHtml(addr.schoolName || '')} ${escapeHtml(addr.dormitoryName || '')} ${escapeHtml(addr.detailAddress || '')}</div>
        </div>
        ${coState.addresses.length > 1 ? '<button class="co-change-addr-btn" onclick="showConfirmAddrPicker()">更换地址</button>' : ''}
    </div>`;
}

/** 选择地址 */
function selectConfirmAddress(id) {
    coState.selectedAddrId = id;
    renderConfirmAddresses();
}

/** 打开地址选择弹窗 */
function showConfirmAddrPicker() {
    const list = document.getElementById('coAddrPickerList');
    if (!list) return;
    list.innerHTML = coState.addresses.map(a => `
        <div class="co-picker-item ${coState.selectedAddrId === a.id ? 'selected' : ''}" onclick="selectAddrFromPicker(${a.id})">
            <div class="co-picker-info">
                <div class="co-picker-top">
                    <span class="co-addr-name">${escapeHtml(a.name)}</span>
                    <span class="co-addr-phone">${escapeHtml(a.phone)}</span>
                    ${a.isDefault === 1 ? '<span class="co-addr-tag">默认</span>' : ''}
                </div>
                <div class="co-addr-detail">${escapeHtml(a.schoolName || '')} ${escapeHtml(a.dormitoryName || '')} ${escapeHtml(a.detailAddress || '')}</div>
            </div>
            <div class="co-picker-radio ${coState.selectedAddrId === a.id ? 'selected' : ''}"><div class="pay-radio-dot"></div></div>
        </div>
    `).join('');
    document.getElementById('coAddrPickerOverlay').style.display = 'flex';
}

/** 从选择弹窗选中地址 */
function selectAddrFromPicker(id) {
    coState.selectedAddrId = id;
    renderConfirmAddresses();
    closeAddrPicker();
}

/** 关闭地址选择弹窗 */
function closeAddrPicker(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('coAddrPickerOverlay').style.display = 'none';
}

/** 获取交易方式文本 */
function getTradeTypeText(type) {
    const map = { 1: '卖家上门', 2: '买家自提', 3: '自行协商' };
    return map[type] || type;
}

/** 渲染商品列表（按卖家分组） */
function renderConfirmItems() {
    const container = document.getElementById('coItemsContainer');
    if (!container) return;
    if (!coState.items.length) {
        container.innerHTML = '<div class="co-empty">暂无商品</div>';
        document.getElementById('coTotalCount').textContent = '共 0 件商品';
        return;
    }

    const groups = {};
    coState.items.forEach(item => {
        const sid = item.sellerId || 'unknown';
        if (!groups[sid]) groups[sid] = { sellerId: sid, sellerNickname: item.sellerNickname || '未知用户', sellerAvatar: item.sellerAvatar || '', items: [] };
        groups[sid].items.push(item);
    });

    let totalQty = 0;
    let html = '<div class="co-items-header"><div class="co-th">商品信息</div><div class="co-th">单价</div><div class="co-th">数量</div><div class="co-th">小计</div><div class="co-th">交易方式</div></div>';
    Object.values(groups).forEach(g => {
        const avatarHtml = g.sellerAvatar
            ? `<img class="co-seller-avatar" src="${g.sellerAvatar}" onerror="this.style.display='none'">`
            : `<div class="co-seller-avatar co-seller-avatar-placeholder">${escapeHtml((g.sellerNickname || '?')[0])}</div>`;
        html += `<div class="co-seller-group">`;
        html += `<div class="co-seller-header"><div class="co-seller-info">${avatarHtml}<span class="co-seller-name">${escapeHtml(g.sellerNickname)}</span></div><div></div><div></div><div></div><div></div></div>`;
        g.items.forEach(item => {
            totalQty += item.quantity;
            const imgHtml = item.firstImage
                ? `<img class="co-item-img" src="${item.firstImage}" onerror="this.style.display='none'">`
                : `<div class="co-img-placeholder">暂无图片</div>`;
            html += `<div class="co-order-item">
                <div class="co-item-info-col">
                    ${imgHtml}
                    <div class="co-item-name">${escapeHtml(item.goodsName)}</div>
                </div>
                <div class="co-item-price-col">¥${(item.price || 0).toFixed(2)}</div>
                <div class="co-item-qty-col">
                    <span class="co-qty-num" id="coQty_${item.goodsId}">${item.quantity}</span>
                </div>
                <div class="co-item-sub-col" id="coSub_${item.goodsId}">¥${((item.price || 0) * item.quantity).toFixed(2)}</div>
                <div class="co-item-trade-col">${getTradeTypeText(item.transactionType)}</div>
            </div>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
    document.getElementById('coTotalCount').textContent = `共 ${totalQty} 件商品`;
}

/** 修改数量 */
function changeConfirmQty(goodsId, delta) {
    const item = coState.items.find(i => i.goodsId == goodsId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty < 1) return;
    if (delta > 0 && item.stock != null && newQty > item.stock) {
        showToast('不能超过库存数量', 'warning');
        return;
    }
    item.quantity = newQty;
    const qtyEl = document.getElementById(`coQty_${goodsId}`);
    const subEl = document.getElementById(`coSub_${goodsId}`);
    if (qtyEl) qtyEl.textContent = newQty;
    if (subEl) subEl.textContent = `¥${((item.price || 0) * newQty).toFixed(2)}`;
    updateConfirmTotal();
    // 更新总件数
    const totalQty = coState.items.reduce((s, i) => s + i.quantity, 0);
    document.getElementById('coTotalCount').textContent = `共 ${totalQty} 件商品`;
}

/** 更新总价 */
function updateConfirmTotal() {
    const total = coState.items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
    const tp = document.getElementById('coTotalPrice');
    const fp = document.getElementById('coFinalPrice');
    if (tp) tp.textContent = `¥${total.toFixed(2)}`;
    if (fp) fp.textContent = `¥${total.toFixed(2)}`;
}

/** 加载自提商品卖家地址 */
async function loadPickupAddresses() {
    const list = document.getElementById('coPickupList');
    if (!list) return;

    const pickupItems = coState.items.filter(function(i) { return i.transactionType === 2; });
    if (!pickupItems.length) {
        list.innerHTML = '<div class="co-empty" style="padding: 8px 0;">暂无自提商品</div>';
        return;
    }

    var token = getCurrentToken();
    var goodsIds = pickupItems.map(function(i) { return i.goodsId; });

    try {
        var res = await fetch(API_BASE_URL + '/user/cart/addres/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? 'Bearer ' + token : ''
            },
            body: JSON.stringify({ goodsIdList: goodsIds })
        }).then(function(r) { return r.json(); });

        if (isApiOk(res) && res.data && res.data.length) {
            list.innerHTML = res.data.map(function(addr) {
                return '<div class="co-pickup-item">' +
                    '<div class="co-pickup-goods">' + escapeHtml(addr.goodsName || '') + '</div>' +
                    '<div class="co-pickup-addr">' + escapeHtml(addr.dormitoryName || '') + ' ' + escapeHtml(addr.detailAddress || '') + '</div>' +
                    '<div class="co-pickup-contact">' + escapeHtml(addr.name || '') + ' ' + escapeHtml(addr.phone || '') + '</div>' +
                    '</div>';
            }).join('');
        } else {
            list.innerHTML = '<div class="co-empty" style="padding: 8px 0;">暂无自提商品</div>';
        }
    } catch (e) {
        console.error('加载自提地址失败:', e);
        list.innerHTML = '<div class="co-empty" style="padding: 8px 0;">加载失败</div>';
    }
}

/** 选择支付方式 */
function selectConfirmPayment(el) {
    el.closest('.co-card').querySelectorAll('.co-pay-opt[data-value]').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    coState.paymentMethod = el.dataset.value;
}

/** 选择发票 */
function selectConfirmInvoice(el) {
    el.closest('.co-card').querySelectorAll('.co-pay-opt[data-value]').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    coState.invoiceType = el.dataset.value;
}

/** 更新地址弹窗的宿舍楼下拉 */
function updateConfirmDormitorySelect() {
    const sel = document.getElementById('coAddrDormitory');
    if (!sel) return;
    sel.innerHTML = '<option value="">请选择宿舍楼</option>' +
        coState.dormitories.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
}

/** 打开新增地址弹窗 */
function showConfirmAddrDialog() {
    coState.editingAddress = null;
    document.getElementById('coAddrDialogTitle').textContent = '新增地址';
    document.getElementById('coAddrName').value = '';
    document.getElementById('coAddrPhone').value = '';
    document.getElementById('coAddrDormitory').value = '';
    document.getElementById('coAddrDetail').value = '';
    document.getElementById('coAddrOverlay').style.display = 'flex';
}

/** 关闭地址弹窗 */
function closeConfirmAddrDialog(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('coAddrOverlay').style.display = 'none';
}

/** 编辑地址 */
function editConfirmAddress(id) {
    const addr = coState.addresses.find(a => a.id === id);
    if (!addr) return;
    coState.editingAddress = addr;
    document.getElementById('coAddrDialogTitle').textContent = '修改地址';
    document.getElementById('coAddrName').value = addr.name || '';
    document.getElementById('coAddrPhone').value = addr.phone || '';
    document.getElementById('coAddrDormitory').value = addr.dormitoryId || '';
    document.getElementById('coAddrDetail').value = addr.detailAddress || '';
    document.getElementById('coAddrOverlay').style.display = 'flex';
}

/** 删除地址 */
async function deleteConfirmAddress(id) {
    if (!confirm('确定要删除该地址吗？')) return;
    try {
        const res = await API.address.delete(id);
        if (isApiOk(res)) {
            coState.addresses = coState.addresses.filter(a => a.id !== id);
            if (coState.selectedAddrId === id) coState.selectedAddrId = coState.addresses[0]?.id || null;
            renderConfirmAddresses();
            showToast('删除成功', 'success');
        } else {
            showToast(res.msg || '删除失败', 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

/** 保存地址 */
async function saveConfirmAddress() {
    if (coState.savingAddress) return;
    const name = document.getElementById('coAddrName').value.trim();
    const phone = document.getElementById('coAddrPhone').value.trim();
    const dormitoryId = document.getElementById('coAddrDormitory').value;
    const detailAddress = document.getElementById('coAddrDetail').value.trim();
    if (!name || !phone || !dormitoryId || !detailAddress) {
        showToast('请填写完整地址信息', 'warning');
        return;
    }
    coState.savingAddress = true;
    document.getElementById('coAddrSaveBtn').disabled = true;
    try {
        if (coState.editingAddress) {
            const res = await API.address.update(coState.editingAddress.id, {
                name, phone, dormitoryId: parseInt(dormitoryId), detailAddress
            });
            if (isApiOk(res)) {
                Object.assign(coState.editingAddress, { name, phone, dormitoryId: parseInt(dormitoryId), detailAddress });
                // 更新宿舍楼名称
                const dorm = coState.dormitories.find(d => d.id === parseInt(dormitoryId));
                if (dorm) coState.editingAddress.dormitoryName = dorm.name;
                showToast('修改成功', 'success');
            } else {
                showToast(res.msg || '修改失败', 'error');
                coState.savingAddress = false;
                document.getElementById('coAddrSaveBtn').disabled = false;
                return;
            }
        } else {
            const res = await API.address.add({ name, phone, dormitoryId: parseInt(dormitoryId), detailAddress });
            if (isApiOk(res)) {
                const newAddr = res.data || { id: Date.now(), name, phone, dormitoryId: parseInt(dormitoryId), detailAddress, isDefault: coState.addresses.length === 0 ? 1 : 0 };
                const dorm = coState.dormitories.find(d => d.id === parseInt(dormitoryId));
                if (dorm) { newAddr.dormitoryName = dorm.name; newAddr.schoolName = ''; }
                coState.addresses.push(newAddr);
                if (!coState.selectedAddrId) coState.selectedAddrId = newAddr.id;
                showToast('新增成功', 'success');
            } else {
                showToast(res.msg || '新增失败', 'error');
                coState.savingAddress = false;
                document.getElementById('coAddrSaveBtn').disabled = false;
                return;
            }
        }
        closeConfirmAddrDialog();
        renderConfirmAddresses();
    } catch (e) {
        showToast('网络错误', 'error');
    }
    coState.savingAddress = false;
    document.getElementById('coAddrSaveBtn').disabled = false;
}

/** 提交订单 */
async function submitConfirmOrder() {
    if (coState.submitting) return;
    if (coState.needAddress && !coState.selectedAddrId) {
        showToast('请选择收货地址', 'warning');
        return;
    }
    if (!coState.items.length) {
        showToast('没有要提交的商品', 'warning');
        return;
    }
    coState.submitting = true;
    const btn = document.getElementById('coSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }
    try {
        //1.提交订单（三步合一：校验+Lua扣减+创建订单）
        const payMethod = coState.paymentMethod === 'alipay' ? 1 : 2;
        const res = await API.order.submit(payMethod, coState.selectedAddrId);
        if (!isApiOk(res)) {
            var errMsg = res.msg || '订单提交失败';
            showToast(errMsg, 'error');
            //库存不足/商品状态异常时跳转回购物车
            if (errMsg.indexOf('库存不足') !== -1 || errMsg.indexOf('已下架') !== -1 || errMsg.indexOf('审核未通过') !== -1) {
                setTimeout(() => showPage('cart'), 1500);
            }
            return;
        }
        const orderList = res.data;
        if (!orderList || !orderList.length) {
            showToast('订单数据异常', 'error');
            return;
        }

        const paymentNo = orderList[0].paymentNo;
        //计算总金额
        const totalAmount = coState.items.reduce(function(sum, item) {
            return sum + (item.price || 0) * (item.quantity || 0);
        }, 0);

        //2.生成支付二维码
        const qrRes = await API.pay.create(paymentNo);
        if (!isApiOk(qrRes) || !qrRes.data) {
            showToast('支付创建失败', 'error');
            return;
        }

        //3.清除本地缓存，打开支付弹窗
        localStorage.removeItem('checkoutItems');
        showPaymentModal(paymentNo, orderList, qrRes.data, totalAmount);
    } catch (e) {
        showToast('网络错误', 'error');
    } finally {
        coState.submitting = false;
        if (btn) { btn.disabled = false; btn.textContent = '立即支付'; }
    }
}

/** 模拟支付：提交订单后调用模拟接口，直接跳转购物车 */
async function mockPayConfirmOrder() {
    if (coState.submitting) return;
    if (coState.needAddress && !coState.selectedAddrId) {
        showToast('请选择收货地址', 'warning');
        return;
    }
    if (!coState.items.length) {
        showToast('没有要提交的商品', 'warning');
        return;
    }
    coState.submitting = true;
    const mockBtn = document.getElementById('coMockPayBtn');
    const payBtn = document.getElementById('coSubmitBtn');
    if (mockBtn) { mockBtn.disabled = true; mockBtn.textContent = '处理中...'; }
    if (payBtn) { payBtn.disabled = true; }
    try {
        const payMethod = coState.paymentMethod === 'alipay' ? 1 : 2;
        const res = await API.order.submit(payMethod, coState.selectedAddrId);
        if (!isApiOk(res)) {
            var errMsg = res.msg || '订单提交失败';
            showToast(errMsg, 'error');
            if (errMsg.indexOf('库存不足') !== -1 || errMsg.indexOf('已下架') !== -1 || errMsg.indexOf('审核未通过') !== -1) {
                setTimeout(() => showPage('cart'), 1500);
            }
            return;
        }
        const orderList = res.data;
        if (!orderList || !orderList.length) {
            showToast('订单数据异常', 'error');
            return;
        }
        const paymentNo = orderList[0].paymentNo;
        localStorage.removeItem('checkoutItems');
        await API.pay.mock(paymentNo).catch(function(){});
        showToast('模拟支付成功', 'success');
        showPage('cart');
        // 跳转关联订单（大订单）详情
        setTimeout(() => viewPaymentGroupDetail(paymentNo), 500);
    } catch (e) {
        showToast('网络错误', 'error');
    } finally {
        coState.submitting = false;
        if (mockBtn) { mockBtn.disabled = false; mockBtn.textContent = '模拟支付'; }
        if (payBtn) { payBtn.disabled = false; }
    }
}

// ==================== 支付弹窗 ====================

let payPollTimer = null;
let payOrderList = [];
let payPaymentNo = '';
let payOrderNo = '';
let payTotalAmount = 0;
let userConfirmedPayment = false;
let payQrCodeStr = '';

/** 显示支付二维码弹窗 */
function showPaymentModal(paymentNo, orderList, qrCodeStr, totalAmount) {
    payPaymentNo = paymentNo;
    payOrderList = orderList;
    payOrderNo = orderList[0].orderNo;

    const overlay = document.getElementById('payOverlay');
    const container = document.getElementById('payQrContainer');
    const amountEl = document.getElementById('payAmount');
    const orderCountEl = document.getElementById('payOrderCount');
    const statusEl = document.getElementById('payStatusText');
    const cancelBtn = document.getElementById('payCancelBtn');
    const successBtn = document.getElementById('paySuccessBtn');

    //清空容器，生成二维码
    container.innerHTML = '';
    new QRCode(container, {
        text: qrCodeStr,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    amountEl.textContent = '¥' + (totalAmount ? totalAmount.toFixed(2) : '0.00');
    orderCountEl.textContent = orderList.length + '笔';
    statusEl.textContent = '';
    statusEl.className = 'pay-status-text';
    cancelBtn.style.display = 'inline-flex';
    successBtn.style.display = 'inline-flex';
    successBtn.onclick = function () { paySuccessFromGroup(); };
    overlay.style.display = 'flex';

    //开始轮询订单状态
    startPayPolling(orderList[0].orderNo);
}

/** 轮询订单支付状态 */
function startPayPolling(orderNo) {
    stopPayPolling();
    const statusEl = document.getElementById('payStatusText');
    const cancelBtn = document.getElementById('payCancelBtn');
    const successBtn = document.getElementById('paySuccessBtn');

    payPollTimer = setInterval(async () => {
        try {
            const res = await API.order.status(orderNo);
            if (!isApiOk(res) || !res.data) return;

            const status = res.data.status;
            if (status === 1) { //已支付
                stopPayPolling();
                statusEl.textContent = '支付成功!';
                statusEl.className = 'pay-status-text pay-status-success';
                cancelBtn.style.display = 'none';
                successBtn.style.display = 'inline-flex';
                showToast('支付成功', 'success');
                //2秒后关闭弹窗，弹出关联订单
                setTimeout(() => {
                    if (!payPaymentNo) return;
                    var pno = payPaymentNo;
                    closePaymentModal();
                    viewPaymentGroupDetail(pno);
                }, 2000);
            } else if (status === 4) { //已取消
                stopPayPolling();
                statusEl.textContent = '订单已取消';
                statusEl.className = 'pay-status-text pay-status-cancelled';
                cancelBtn.style.display = 'none';
                setTimeout(() => closePaymentModal(), 2000);
            }
        } catch (e) {
            console.error('轮询订单状态失败:', e);
        }
    }, 3000);
}

function stopPayPolling() {
    if (payPollTimer) {
        clearInterval(payPollTimer);
        payPollTimer = null;
    }
}

/** 手动确认支付成功（用户点击"已完成支付"） */
function paySuccessFromGroup() {
    var pno = payPaymentNo;
    stopPayPolling();
    userConfirmedPayment = true;
    closePaymentModal();
    showToast('支付成功', 'success');
    viewPaymentGroupDetail(pno);
}

/** 取消支付 */
async function cancelPayment() {
    if (!payPaymentNo) return;
    var pno = payPaymentNo;
    stopPayPolling();
    try {
        await API.order.cancel(pno);
    } catch (e) {
        console.error('取消订单失败:', e);
    }
    closePaymentModal();
    showToast('订单已取消', 'info');
    viewPaymentGroupDetail(pno);
}

/** 关闭支付弹窗（X按钮：不取消订单，保持待付款，等待超时自动取消） */
function closePayModal() {
    stopPayPolling();
    document.getElementById('payOverlay').style.display = 'none';
    var pno = payPaymentNo;
    if (!userConfirmedPayment) {
        showToast('订单已保存，30分钟内未支付将自动取消', 'info');
    }
    if (pno) viewPaymentGroupDetail(pno);
}

/** 关闭支付弹窗（支付成功/已取消后自动关闭） */
function closePaymentModal() {
    stopPayPolling();
    document.getElementById('payOverlay').style.display = 'none';
    payPaymentNo = '';
    payOrderList = [];
    payOrderNo = '';
    payTotalAmount = 0;
    userConfirmedPayment = false;
    payQrCodeStr = '';
}

/** 关闭关联订单模态框并跳转购物车 */
function closePaymentGroupModal() {
    closeModal('paymentGroupModal');
    showPage('cart');
}

// ========== AI智能客服 ==========
var aiSending = false;

// 恢复主题
(function() {
    var theme = localStorage.getItem('aiTheme');
    if (theme === 'dark') {
        var page = document.getElementById('aiPage');
        if (page) page.setAttribute('data-theme', 'dark');
    }
})();

// Enter发送，Shift+Enter换行
(function() {
    var input = document.getElementById('aiInput');
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAiMsg();
            }
        });
    }
})();

function toggleAiTheme() {
    var page = document.getElementById('aiPage');
    if (!page) return;
    var isDark = page.getAttribute('data-theme') === 'dark';
    if (isDark) {
        page.removeAttribute('data-theme');
        localStorage.setItem('aiTheme', 'light');
    } else {
        page.setAttribute('data-theme', 'dark');
        localStorage.setItem('aiTheme', 'dark');
    }
}

function clearAiChat() {
    var container = document.getElementById('aiMsgContainer');
    if (!container) return;
    container.innerHTML = '' +
        '<div class="ai-msg-row bot">' +
            '<div class="ai-msg-avatar">' +
                '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
                    '<rect x="3" y="4" width="18" height="18" rx="3.5" fill="#FF7D00"/>' +
                    '<circle cx="8.5" cy="12.5" r="1.2" fill="#fff"/>' +
                    '<circle cx="12" cy="12" r="1.2" fill="#fff"/>' +
                    '<circle cx="15.5" cy="12.5" r="1.2" fill="#fff"/>' +
                    '<rect x="10.5" y="1.5" width="3" height="2.8" rx="1.2" fill="#FF7D00"/>' +
                '</svg>' +
            '</div>' +
            '<div class="ai-msg-content">' +
                '<div class="ai-msg-bubble">你好！我是校易帮智能客服，有什么可以帮助你的？<br><br>' +
                '直接告诉我你想干什么，比如：<br>' +
                '• "有没有薯片卖" — 搜索商品<br>' +
                '• "把薯片加入购物车" — 添加商品<br>' +
                '• "平台有什么公告" — 查询公告<br>' +
                '• "交易规则是什么" — 规则问答<br><br>' +
                '平台发布信息查询：<br>' +
                '<div class="ai-quick-btns">' +
                    '<button class="ai-q-btn" onclick="queryPlatformPosts(1)">平台公告</button>' +
                    '<button class="ai-q-btn" onclick="queryPlatformPosts(2)">平台动态</button>' +
                    '<button class="ai-q-btn" onclick="queryPlatformPosts(3)">校园资讯</button>' +
                '</div></div>' +
                '<div class="ai-msg-time">刚刚</div>' +
            '</div>' +
        '</div>';
}

function onAiInput(textarea) {
    // 自动调整高度
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 72) + 'px';
    // 启用/禁用发送按钮
    var btn = document.getElementById('aiSendBtn');
    if (btn) btn.disabled = !(textarea.value.trim());
}

function getNowTime() {
    var now = new Date();
    var h = now.getHours().toString().padStart(2, '0');
    var m = now.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
}

/**
 * 将 AI 返回的轻量 markdown 转为 HTML 渲染
 * 支持 **粗体**、![图片](url)、链接、换行
 */
function aiMarkdownToHtml(text) {
    var html = (text || '').toString();
    // 转义 HTML 特殊字符（&, <, > 先转义，再还原已经安全的标签）
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // **粗体**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // ![图片](url)
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="ai-md-img">');
    // [链接](url)
    html = html.replace(/\[(.+?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
}

function sendAiMsg() {
    if (aiSending) return;
    var input = document.getElementById('aiInput');
    var text = (input.value || '').trim();
    if (!text) return;

    input.value = '';
    onAiInput(input);
    addAiMsg('user', text);
    setAiLoading(true);

    var token = getCurrentToken();
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 20000);

    fetch(API_BASE_URL + '/user/ai/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? 'Bearer ' + token : ''
        },
        body: JSON.stringify({ input: text }),
        signal: controller.signal
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        clearTimeout(timeoutId);
        setAiLoading(false);
        if (res && (res.code === 0 || res.code === 200)) {
            var answer = res.data.answer || '暂无回答';
            var html = aiMarkdownToHtml(answer);
            // 如果后端同时返回了商品列表，渲染可点击的商品卡片
            if (res.data.goodsList && res.data.goodsList.length > 0) {
                html += renderGoodsListHtml(res.data.goodsList);
            }
            addAiMsgHtml('bot', html);
        } else {
            addAiMsg('bot', '服务暂时不可用，请稍后再试。');
        }
    })
    .catch(function() {
        clearTimeout(timeoutId);
        setAiLoading(false);
        addAiMsg('bot', '智能客服暂时无法连接，请确保AI服务已启动或稍后再试。');
    });
}

function addAiMsg(role, text) {
    var container = document.getElementById('aiMsgContainer');
    if (!container) return;

    var typing = document.querySelector('.ai-typing-wrapper');
    if (typing) typing.remove();

    var row = document.createElement('div');
    row.className = 'ai-msg-row ' + role;

    var avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar';
    if (role === 'bot') {
        avatar.innerHTML = '' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
                '<rect x="3" y="4" width="18" height="18" rx="3.5" fill="#FF7D00"/>' +
                '<circle cx="8.5" cy="12.5" r="1.2" fill="#fff"/>' +
                '<circle cx="12" cy="12" r="1.2" fill="#fff"/>' +
                '<circle cx="15.5" cy="12.5" r="1.2" fill="#fff"/>' +
                '<rect x="10.5" y="1.5" width="3" height="2.8" rx="1.2" fill="#FF7D00"/>' +
            '</svg>';
    } else {
        avatar.innerHTML = '' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
                '<circle cx="12" cy="8" r="4.5" fill="#999"/>' +
                '<path d="M3 22c0-5.52 4.48-10 10-10s10 4.48 10 10" fill="#999"/>' +
            '</svg>';
    }

    var content = document.createElement('div');
    content.className = 'ai-msg-content';

    var bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';
    bubble.textContent = text;

    var time = document.createElement('div');
    time.className = 'ai-msg-time';
    time.textContent = getNowTime();

    content.appendChild(bubble);
    content.appendChild(time);
    row.appendChild(avatar);
    row.appendChild(content);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

/**
 * 添加富文本消息（支持HTML渲染）
 */
function addAiMsgHtml(role, html) {
    var container = document.getElementById('aiMsgContainer');
    if (!container) return;

    var typing = document.querySelector('.ai-typing-wrapper');
    if (typing) typing.remove();

    var row = document.createElement('div');
    row.className = 'ai-msg-row ' + role;

    var avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar';
    if (role === 'bot') {
        avatar.innerHTML = '' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
                '<rect x="3" y="4" width="18" height="18" rx="3.5" fill="#FF7D00"/>' +
                '<circle cx="8.5" cy="12.5" r="1.2" fill="#fff"/>' +
                '<circle cx="12" cy="12" r="1.2" fill="#fff"/>' +
                '<circle cx="15.5" cy="12.5" r="1.2" fill="#fff"/>' +
                '<rect x="10.5" y="1.5" width="3" height="2.8" rx="1.2" fill="#FF7D00"/>' +
            '</svg>';
    } else {
        avatar.innerHTML = '' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
                '<circle cx="12" cy="8" r="4.5" fill="#999"/>' +
                '<path d="M3 22c0-5.52 4.48-10 10-10s10 4.48 10 10" fill="#999"/>' +
            '</svg>';
    }

    var content = document.createElement('div');
    content.className = 'ai-msg-content';

    var bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';
    bubble.innerHTML = html;

    var time = document.createElement('div');
    time.className = 'ai-msg-time';
    time.textContent = getNowTime();

    content.appendChild(bubble);
    content.appendChild(time);
    row.appendChild(avatar);
    row.appendChild(content);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

/**
 * 查询平台公开信息（公告/动态/资讯）
 */
var aiPostsLoading = false;
function queryPlatformPosts(type) {
    if (aiPostsLoading) return;
    aiPostsLoading = true;
    setAiLoading(true);

    var typeNames = {1: '平台公告', 2: '平台动态', 3: '校园资讯'};
    addAiMsg('user', '查询' + (typeNames[type] || '平台信息'));

    var token = getCurrentToken();
    fetch(API_BASE_URL + '/ai-api/platform/posts?type=' + type, {
        headers: { 'Authorization': token ? 'Bearer ' + token : '' }
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        setAiLoading(false);
        aiPostsLoading = false;
        if (res && (res.code === 0 || res.code === 200)) {
            var data = res.data;
            if (data && data.records && data.records.length > 0) {
                renderPlatformPosts(data.records, typeNames[type] || '平台信息');
            } else {
                addAiMsg('bot', '暂无' + (typeNames[type] || '相关信息'));
            }
        } else {
            addAiMsg('bot', '服务暂时不可用，请稍后再试。');
        }
    })
    .catch(function() {
        setAiLoading(false);
        aiPostsLoading = false;
        addAiMsg('bot', '网络异常，请检查连接后重试。');
    });
}

/**
 * 渲染平台信息列表
 */
function renderPlatformPosts(records, title) {
    var html = '<div class="ai-result-header">📋 ' + title + '</div>';
    for (var i = 0; i < records.length; i++) {
        var r = records[i];
        var itemTitle = r.title || (r.content ? r.content.substring(0, 40) + (r.content.length > 40 ? '...' : '') : '无标题');
        var time = r.createTime || r.publishTime || '';
        var imgHtml = r.coverImage ? '<img class="ai-post-img" src="' + r.coverImage + '" alt="">' : '';
        html += '<div class="ai-post-item" onclick="viewPlatformPost(\'' + encodeURIComponent(JSON.stringify(r)) + '\')">' +
                    imgHtml +
                    '<div class="ai-post-info">' +
                        '<div class="ai-post-title">' + escapeHtml(itemTitle) + '</div>' +
                        '<div class="ai-post-time">' + escapeHtml(time) + '</div>' +
                    '</div>' +
                '</div>';
    }
    addAiMsgHtml('bot', html);
}

/**
 * 查看平台信息详情（弹窗展示）
 */
function viewPlatformPost(encoded) {
    try {
        var item = JSON.parse(decodeURIComponent(encoded));
        if (!item) return;

        var typeNames = {1: '平台公告', 2: '平台动态', 3: '校园资讯'};
        document.getElementById('postModalTitle').textContent = typeNames[item.type] || '详情';

        var imgHtml = item.coverImage
            ? '<div style="margin-bottom:14px;"><img src="' + item.coverImage + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;" alt=""></div>'
            : '';
        var titleHtml = item.title
            ? '<h2 style="font-size:18px;font-weight:600;margin-bottom:10px;line-height:1.4;">' + escapeHtml(item.title) + '</h2>'
            : '';
        var timeHtml = item.publishTime
            ? '<div style="font-size:13px;color:#999;margin-bottom:14px;">' + escapeHtml(item.publishTime) + '</div>'
            : '';
        var contentHtml = item.content
            ? '<div style="font-size:15px;line-height:1.8;color:#333;white-space:pre-wrap;">' + escapeHtml(item.content) + '</div>'
            : '';

        document.getElementById('postModalBody').innerHTML =
            imgHtml + titleHtml + timeHtml + contentHtml;

        openModal('platformPostModal');
    } catch(e) {}
}

/**
 * 商品搜索（"我要买XXX商品"触发）
 */
var aiGoodsLoading = false;
function queryGoodsByKeyword(keyword) {
    if (aiGoodsLoading) return;
    aiGoodsLoading = true;
    setAiLoading(true);

    var token = getCurrentToken();
    fetch(API_BASE_URL + '/ai-api/goods/search?keyword=' + encodeURIComponent(keyword), {
        headers: { 'Authorization': token ? 'Bearer ' + token : '' }
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        setAiLoading(false);
        aiGoodsLoading = false;
        if (res && (res.code === 0 || res.code === 200)) {
            var data = res.data;
            if (data && data.records && data.records.length > 0) {
                renderGoodsList(data.records);
            } else {
                addAiMsg('bot', '未找到相关商品，换个关键词试试吧');
            }
        } else {
            addAiMsg('bot', '服务暂时不可用，请稍后再试。');
        }
    })
    .catch(function() {
        setAiLoading(false);
        aiGoodsLoading = false;
        addAiMsg('bot', '网络异常，请检查连接后重试。');
    });
}

/**
 * 生成商品卡片 HTML（不含 header，可嵌入 AI 回答中）
 */
function renderGoodsListHtml(goodsList) {
    var html = '';
    for (var i = 0; i < goodsList.length; i++) {
        var g = goodsList[i];
        var name = g.goodsName || g.name || '未知商品';
        var price = g.price != null ? '￥' + g.price : '';
        var img = g.firstImage || g.goodsImage || g.image || '';
        var goodsId = g.goodsId || g.id || '';
        var imgHtml = img ? '<img class="ai-goods-img" src="' + img + '" alt="">' : '<div class="ai-goods-img-placeholder">📦</div>';
        html += '<div class="ai-goods-card" onclick="viewGoodsDetail(\'' + goodsId + '\')">' +
                    imgHtml +
                    '<div class="ai-goods-info">' +
                        '<div class="ai-goods-name">' + escapeHtml(name) + '</div>' +
                        '<div class="ai-goods-price">' + escapeHtml(price) + '</div>' +
                    '</div>' +
                '</div>';
    }
    html += '<div class="ai-cart-prompt">是否为您添加商品至购物车？</div>';
    return html;
}

/**
 * 渲染商品搜索结果（快捷按钮和直接调用用）
 */
function renderGoodsList(goodsList) {
    var html = '<div class="ai-result-header">🛒 商品搜索结果</div>';
    html += renderGoodsListHtml(goodsList);
    addAiMsgHtml('bot', html);
}

/**
 * 查看商品详情（打开商品详情弹窗）
 */
function viewGoodsDetail(goodsId) {
    if (goodsId && typeof showGoodsDetail === 'function') {
        showGoodsDetail(goodsId);
    }
}

let aiLoadingStartTime = 0;
function setAiLoading(loading) {
    var btn = document.getElementById('aiSendBtn');
    var container = document.getElementById('aiMsgContainer');
    aiSending = loading;

    var typing = document.querySelector('.ai-typing-wrapper');

    if (loading) {
        aiLoadingStartTime = Date.now();
        if (btn) btn.disabled = true;
        if (!typing && container) {
            var row = document.createElement('div');
            row.className = 'ai-msg-row bot ai-typing-wrapper';
            var avatar = document.createElement('div');
            avatar.className = 'ai-msg-avatar';
            avatar.innerHTML = '' +
                '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
                    '<rect x="3" y="4" width="18" height="18" rx="3.5" fill="#FF7D00"/>' +
                    '<circle cx="8.5" cy="12.5" r="1.2" fill="#fff"/>' +
                    '<circle cx="12" cy="12" r="1.2" fill="#fff"/>' +
                    '<circle cx="15.5" cy="12.5" r="1.2" fill="#fff"/>' +
                    '<rect x="10.5" y="1.5" width="3" height="2.8" rx="1.2" fill="#FF7D00"/>' +
                '</svg>';
            var content = document.createElement('div');
            content.className = 'ai-msg-content';
            var bubble = document.createElement('div');
            bubble.className = 'ai-msg-bubble';
            bubble.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
            content.appendChild(bubble);
            row.appendChild(avatar);
            row.appendChild(content);
            container.appendChild(row);
            container.scrollTop = container.scrollHeight;
        }
    } else {
        // 最少显示 600ms 的加载状态，避免闪一下
        var elapsed = Date.now() - aiLoadingStartTime;
        var minShow = 600;
        if (elapsed < minShow) {
            setTimeout(function () {
                hideAiLoading(btn);
            }, minShow - elapsed);
            return;
        }
        hideAiLoading(btn);
    }
}

function hideAiLoading(btn) {
    var container = document.getElementById('aiMsgContainer');
    var typing = document.querySelector('.ai-typing-wrapper');
    if (btn) {
        var input = document.getElementById('aiInput');
        btn.disabled = !(input && input.value.trim());
    }
    if (typing) typing.remove();
    aiSending = false;
}

// ==================== 聊天 ====================

let chatCurrentSessionId = null;
let chatCurrentOtherUserId = null;
let chatCurrentOtherName = '';
let chatCurrentOtherAvatar = '';
let chatMessagePage = 1;
let chatLoading = false;
let chatHasMore = true;
/** 快捷获取当前用户ID */
function getCurrentUserId() {
    try {
        const info = JSON.parse(getCurrentUserInfo() || '{}');
        return info.userId;
    } catch(e) { return null; }
}

/** 加载会话列表 */
async function loadChatSessions() {
    const list = document.getElementById('chatSessionList');
    if (!list) return;
    list.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    try {
        const res = await API.chat.getSessions();
        if (!isApiOk(res) || !res.data || res.data.length === 0) {
            list.innerHTML = '<div class="loading-placeholder">暂无聊天</div>';
            updateMsgBadge(0);
            return;
        }
        list.innerHTML = res.data.map(s => renderSessionItem(s)).join('');
        // 总未读设为0（前端不显示红点）
        updateMsgBadge(0);
    } catch (e) {
        list.innerHTML = '<div class="loading-placeholder" style="color:var(--danger);">加载失败，点击重试</div>';
        list.onclick = () => { list.onclick = null; loadChatSessions(); };
    }
}

/** 更新顶部消息中心徽章 */
function updateMsgBadge(count) {
    const badge = document.getElementById('msgBadge');
    const mobileBadge = document.getElementById('mobileMsgBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
    if (mobileBadge) {
        if (count > 0) {
            mobileBadge.textContent = count > 99 ? '99+' : count;
            mobileBadge.classList.add('show');
        } else {
            mobileBadge.classList.remove('show');
        }
    }
}

function renderSessionItem(s) {
    const avatarHtml = s.otherAvatar
        ? `<img src="${s.otherAvatar}" alt="">`
        : (s.otherNickname ? s.otherNickname.charAt(0) : '?');
    const timeStr = formatChatTime(s.lastTime);
    const otherAvatarForJs = s.otherAvatar ? `'${escapeHtml(s.otherAvatar)}'` : "''";
    return `<div class="chat-session-item" onclick="openChatSession(${s.sessionId},${s.otherUserId},'${escapeHtml(s.otherNickname)}',${otherAvatarForJs})">
        <div class="chat-session-avatar">${avatarHtml}</div>
        <div class="chat-session-info">
            <div class="chat-session-name">${escapeHtml(s.otherNickname || '已注销')}</div>
            <div class="chat-session-preview">${escapeHtml(s.lastMessage || '')}</div>
        </div>
        <div class="chat-session-right">
            <div class="chat-session-time">${timeStr}</div>
        </div>
    </div>`;
}

/** 打开聊天会话 */
async function openChatSession(sessionId, otherUserId, otherName, otherAvatar) {
    chatCurrentSessionId = sessionId;
    chatCurrentOtherUserId = otherUserId;
    chatCurrentOtherName = otherName || '聊天';
    chatCurrentOtherAvatar = otherAvatar || '';
    chatMessagePage = 1;
    chatHasMore = true;

    document.getElementById('chatSessionView').style.display = 'none';
    const detailView = document.getElementById('chatDetailView');
    detailView.style.display = 'flex';
    document.getElementById('chatDetailTitle').textContent = chatCurrentOtherName;
    document.getElementById('chatMessages').innerHTML = '<div class="loading-placeholder">加载中...</div>';

    await loadChatMessages(true);
    // 页面重新加载后刷新会话列表（未读数已变）
    loadChatSessions();
}

/** 返回会话列表 */
function backToChatSessions() {
    chatCurrentSessionId = null;
    document.getElementById('chatSessionView').style.display = '';
    document.getElementById('chatDetailView').style.display = 'none';
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('chatInput').value = '';
    loadChatSessions();
}

/** 加载消息 */
async function loadChatMessages(reset = false) {
    if (!chatCurrentSessionId || chatLoading) return;
    if (!reset && !chatHasMore) return;

    chatLoading = true;
    const container = document.getElementById('chatMessages');
    try {
        const res = await API.chat.getMessages(chatCurrentSessionId, chatMessagePage, 20);
        if (!isApiOk(res) || !res.data || !res.data.records) {
            if (reset) container.innerHTML = '<div class="loading-placeholder">暂无消息</div>';
            chatHasMore = false;
            chatLoading = false;
            return;
        }
        const msgs = res.data.records;
        chatHasMore = res.data.current < res.data.pages;
        if (reset) {
            container.innerHTML = '';
            chatMessagePage = 1;
            if (msgs.length === 0) {
                container.innerHTML = '<div class="loading-placeholder">暂无消息，发送第一条吧</div>';
                chatLoading = false;
                return;
            }
        }
        if (!reset && chatHasMore) chatMessagePage++;

        let html = '';
        if (!reset && msgs.length > 0) {
            html += '<div class="chat-load-more" onclick="loadMoreMessages()">加载更多</div>';
        } else if (reset && chatHasMore && msgs.length > 0) {
            html += '<div class="chat-load-more" onclick="loadMoreMessages()">点击加载更多</div>';
        }

        // 按时间正序显示（后端已反转）
        const displayMsgs = reset ? msgs : msgs;
        let lastDate = '';
        for (const m of displayMsgs) {
            const dateStr = formatChatDate(m.createTime);
            if (dateStr !== lastDate) {
                html += `<div class="chat-date-divider"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }
            html += renderMessage(m);
        }

        if (reset) {
            container.innerHTML = html;
        } else {
            const loadMore = container.querySelector('.chat-load-more');
            if (loadMore) {
                loadMore.insertAdjacentHTML('afterend', html);
            } else {
                container.innerHTML = html + container.innerHTML;
            }
        }

        if (reset) {
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
        }
    } catch (e) {
        if (reset) container.innerHTML = '<div class="loading-placeholder" style="color:var(--danger);">加载失败</div>';
    }
    chatLoading = false;
}

function loadMoreMessages() {
    if (!chatHasMore || chatLoading) return;
    chatMessagePage++;
    loadChatMessages(false);
}

function renderMessage(m) {
    const cls = m.isMine ? 'mine' : 'other';
    const timeStr = formatChatTime(m.createTime);
    let content;
    if (m.msgType === '2') {
        content = `<img src="${escapeHtml(m.content)}" class="chat-msg-img" alt="" onclick="window.open('${escapeHtml(m.content)}','_blank')">`;
    } else if (m.msgType === '3' && m.goodsId) {
        // 商品卡片
        let cardName = m.content;
        let cardImg = '';
        let cardPrice = '';
        try {
            var parsed = JSON.parse(m.content);
            if (parsed.name) cardName = parsed.name;
            if (parsed.image) cardImg = parsed.image;
            if (parsed.price) cardPrice = parsed.price;
        } catch(e) {}
        var imgHtml = cardImg
            ? '<img class="chat-goods-card-img" src="' + escapeHtml(cardImg) + '" onerror="this.style.display=\'none\'">'
            : '<div class="chat-goods-card-img"></div>';
        var priceHtml = cardPrice ? '<div class="chat-goods-card-price">¥' + Number(cardPrice).toFixed(2) + '</div>' : '';
        content = '<div class="chat-goods-card" onclick="showGoodsDetail(' + m.goodsId + ')" style="cursor:pointer;">'
            + imgHtml
            + '<div class="chat-goods-card-info">'
            + '<div class="chat-goods-card-name">' + escapeHtml(cardName) + '</div>'
            + priceHtml
            + '<div class="chat-goods-card-badge">查看详情 →</div>'
            + '</div></div>';
    } else {
        content = escapeHtml(m.content);
    }
    // 对方头像
    let otherAvatarHtml;
    if (chatCurrentOtherAvatar) {
        otherAvatarHtml = `<img src="${chatCurrentOtherAvatar}" alt="" onerror="this.style.display='none'">`;
    } else {
        otherAvatarHtml = `<span class="msg-avatar-fallback">${(chatCurrentOtherName || '?').charAt(0)}</span>`;
    }
    // 我的头像
    let myAvatar = '';
    try {
        const info = JSON.parse(getCurrentUserInfo() || '{}');
        if (info.avatar) myAvatar = info.avatar;
    } catch(e) {}
    let myAvatarHtml;
    if (myAvatar) {
        myAvatarHtml = `<img src="${myAvatar}" alt="" onerror="this.style.display='none'">`;
    } else {
        myAvatarHtml = `<span class="msg-avatar-fallback">我</span>`;
    }
    return `<div class="chat-message-row ${cls}">
        <div class="msg-avatar-col">${m.isMine ? myAvatarHtml : otherAvatarHtml}</div>
        <div class="msg-content-col">
            <div class="chat-message-bubble">${content}</div>
            <div class="chat-message-time">${timeStr}</div>
        </div>
    </div>`;
}

/** 发送消息 */
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (!content) return;
    if (!chatCurrentSessionId || !chatCurrentOtherUserId) {
        showToast('请先选择会话', 'info');
        return;
    }
    input.value = '';
    // 立即显示自己的消息
    const container = document.getElementById('chatMessages');
    const placeholder = container.querySelector('.loading-placeholder');
    if (placeholder) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', renderMessage({
        isMine: true, content: content, createTime: new Date().toISOString(), msgType: '1'
    }));
    container.scrollTop = container.scrollHeight;

    try {
        const res = await API.chat.sendMessage({
            sessionId: chatCurrentSessionId,
            receiverId: chatCurrentOtherUserId,
            content: content,
            msgType: '1'
        });
        if (!isApiOk(res)) {
            showToast(res.message || '发送失败', 'error');
        }
        // 后台刷新会话列表（未读、最后消息）
        loadChatSessions();
    } catch (e) {
        showToast('发送失败，请重试', 'error');
    }
}

/** 发送文件（图片）消息 */
async function sendChatFile(files) {
    if (!files || files.length === 0) return;
    if (!chatCurrentSessionId || !chatCurrentOtherUserId) {
        showToast('请先选择会话', 'info');
        return;
    }
    const file = files[0];
    // 只允许图片
    if (!file.type.startsWith('image/')) {
        showToast('暂仅支持发送图片', 'warning');
        document.getElementById('chatFileInput').value = '';
        return;
    }
    // 限制大小 10MB
    if (file.size > 10 * 1024 * 1024) {
        showToast('图片不能超过 10MB', 'warning');
        document.getElementById('chatFileInput').value = '';
        return;
    }
    try {
        const formData = new FormData();
        formData.append('file', file);
        const result = await API.common.upload(formData);
        if (!isApiOk(result) || !result.data) {
            showToast(result.message || '上传失败', 'error');
            document.getElementById('chatFileInput').value = '';
            return;
        }
        const imgUrl = result.data;
        // 立即显示图片消息
        const container = document.getElementById('chatMessages');
        const placeholder = container.querySelector('.loading-placeholder');
        if (placeholder) container.innerHTML = '';
        container.insertAdjacentHTML('beforeend', renderMessage({
            isMine: true, content: imgUrl, createTime: new Date().toISOString(), msgType: '2'
        }));
        container.scrollTop = container.scrollHeight;
        // 调用发送接口
        const res = await API.chat.sendMessage({
            sessionId: chatCurrentSessionId,
            receiverId: chatCurrentOtherUserId,
            content: imgUrl,
            msgType: '2'
        });
        if (!isApiOk(res)) {
            showToast(res.message || '发送失败', 'error');
        }
        loadChatSessions();
    } catch (e) {
        showToast('发送失败，请重试', 'error');
    }
    document.getElementById('chatFileInput').value = '';
}

/** 切换聊天附件菜单 */
function toggleChatMenu() {
    const menu = document.getElementById('chatFileMenu');
    if (!menu) return;
    menu.classList.toggle('active');
}

/** 选择图片上传 */
function selectChatImage() {
    document.getElementById('chatFileMenu').classList.remove('active');
    document.getElementById('chatFileInput').click();
}

/** 关闭聊天菜单（点击外部时） */
document.addEventListener('click', function(e) {
    const wrap = document.querySelector('.chat-file-btn-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const menu = document.getElementById('chatFileMenu');
        if (menu) menu.classList.remove('active');
    }
});

/** 打开选择商品弹窗 */
async function showChatOrderPicker() {
    document.getElementById('chatFileMenu').classList.remove('active');
    const modal = document.getElementById('chatOrderPickerModal');
    const list = document.getElementById('chatOrderList');
    if (!modal || !list) return;
    modal.classList.add('active');
    list.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    try {
        const res = await API.order.list({ role: 'buy', pageNum: 1, pageSize: 50 });
        if (!isApiOk(res) || !res.data) {
            list.innerHTML = '<div class="loading-placeholder" style="color:var(--danger);">暂无订单</div>';
            return;
        }
        const orders = res.data.records || [];
        if (orders.length === 0) {
            list.innerHTML = '<div class="loading-placeholder">暂无已购买的商品</div>';
            return;
        }
        // 去重：同一个商品可能有多条订单，只保留一个
        const seen = new Set();
        const unique = [];
        orders.forEach(function(item) {
            if (!seen.has(item.goodsId)) {
                seen.add(item.goodsId);
                unique.push(item);
            }
        });
        list.innerHTML = unique.map(function(item) {
            var img = item.goodsImage
                ? '<img class="chat-order-item-img" src="' + escapeHtml(item.goodsImage) + '" onerror="this.style.display=\'none\'">'
                : '<div class="chat-order-item-img" style="background:#f3f4f6;"></div>';
            return '<div class="chat-order-item" onclick="sendChatOrderCard(' + item.goodsId + ',\'' + escapeHtml(item.goodsName || '') + '\',\'' + escapeHtml(item.goodsImage || '') + '\',' + (item.price || 0) + ')">'
                + img
                + '<div class="chat-order-item-info">'
                + '<div class="chat-order-item-name">' + escapeHtml(item.goodsName || '未知商品') + '</div>'
                + '<div class="chat-order-item-price">¥' + (item.price ? item.price.toFixed(2) : '0.00') + '</div>'
                + '</div></div>';
        }).join('');
    } catch (e) {
        list.innerHTML = '<div class="loading-placeholder" style="color:var(--danger);">加载失败</div>';
    }
}

function closeChatOrderPicker() {
    document.getElementById('chatOrderPickerModal').classList.remove('active');
}

/** 发送商品卡片消息 */
async function sendChatOrderCard(goodsId, goodsName, goodsImage, price) {
    closeChatOrderPicker();
    if (!chatCurrentSessionId || !chatCurrentOtherUserId) {
        showToast('请先选择会话', 'info');
        return;
    }
    // 商品描述文本
    var content = goodsName || '商品卡片';
    // 立即显示商品卡片
    var container = document.getElementById('chatMessages');
    var placeholder = container.querySelector('.loading-placeholder');
    if (placeholder) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', renderMessage({
        isMine: true,
        content: JSON.stringify({ name: goodsName || '商品', image: goodsImage || '', price: price || 0 }),
        createTime: new Date().toISOString(),
        msgType: '3',
        goodsId: goodsId
    }));
    container.scrollTop = container.scrollHeight;
    try {
        var res = await API.chat.sendMessage({
            sessionId: chatCurrentSessionId,
            receiverId: chatCurrentOtherUserId,
            content: content,
            msgType: '3',
            goodsId: goodsId
        });
        if (!isApiOk(res)) {
            showToast(res.message || '发送失败', 'error');
        }
        loadChatSessions();
    } catch (e) {
        showToast('发送失败，请重试', 'error');
    }
}

/** 格式化时间 */
function formatChatTime(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const ymd = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        if (ymd === today) return hm;
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const ymdY = `${yesterday.getFullYear()}-${pad(yesterday.getMonth()+1)}-${pad(yesterday.getDate())}`;
        if (ymd === ymdY) return '昨天 ' + hm;
        return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${hm}`;
    } catch(e) { return ''; }
}

function formatChatDate(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const ymd = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        if (ymd === today) return '今天';
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const ymdY = `${yesterday.getFullYear()}-${pad(yesterday.getMonth()+1)}-${pad(yesterday.getDate())}`;
        if (ymd === ymdY) return '昨天';
        return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    } catch(e) { return ''; }
}

// 当 showPage 切换到 messages 时加载会话列表
(function() {
    const orig = window.showPage;
    if (orig) {
        window.showPage = function(pageId) {
            orig(pageId);
            if (pageId === 'messages') {
                backToChatSessions();
            }
        };
    }
})();
