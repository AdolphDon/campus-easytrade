document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadUserInfo();
});

function checkAuth() {
    const token = getToken();
    const userInfo = getUserInfo();

    if (!token || !userInfo) {
        window.location.href = '../pages/login.html';
        return;
    }

    if (userInfo.role === 0) {
        document.body.classList.add('admin');
    }
}

function loadUserInfo() {
    const userInfo = getUserInfo();

    if (userInfo) {
        document.getElementById('userNickname').textContent = userInfo.nickname || userInfo.username;

        if (userInfo.avatar) {
            document.getElementById('userAvatar').src = userInfo.avatar;
        }

        if (document.getElementById('creditScore')) {
            document.getElementById('creditScore').textContent = userInfo.creditScore || '--';
        }

        if (document.getElementById('balance') && userInfo.balance !== undefined) {
            document.getElementById('balance').textContent = '¥' + userInfo.balance;
        }
    }
}

window.logout = function() {
    // 调用后端登出接口使 token 失效
    if (window.API_BASE_URL) {
        fetch(API_BASE_URL + '/user/user/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getCurrentToken() } }).catch(function() {});
    }
    clearAuth();
    showToast('已退出登录', 'info');
    setTimeout(() => {
        window.location.href = '../pages/login.html';
    }, 1000);
};

function showToast(message, type = 'info') {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
