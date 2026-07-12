/* API_BASE_URL 由先加载的 api.js 提供 */

function apiErrorText(result, fallback) {
    if (!result) return fallback;
    return result.msg || result.message || fallback;
}

document.addEventListener('DOMContentLoaded', function() {
    initRegisterModal();
    initLoginPanel();
    initHeroScroll();
    initLoginForm();
    initRegisterForm();
    initPasswordStrength();
    initForgotPwdModal();
    initForgotPwdForm();
});

function initRegisterModal() {
    const modal = document.getElementById('registerModal');
    const openBtn = document.getElementById('openRegisterBtn');
    const closeBtn = document.getElementById('closeRegisterBtn');
    const backdrop = document.getElementById('registerModalBackdrop');

    if (!modal) return;

    if (openBtn) {
        openBtn.addEventListener('click', function (e) {
            e.preventDefault();
            openRegisterModal();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            closeRegisterModal();
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeRegisterModal);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (modal.classList.contains('is-open')) {
            closeRegisterModal();
            return;
        }
        closeLoginPanel();
    });
}

function initLoginPanel() {
    const closeBtn = document.getElementById('closeLoginBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            closeLoginPanel();
        });
    }
}

function openLoginPanel() {
    const loginSection = document.getElementById('loginSection');
    const registerModal = document.getElementById('registerModal');
    if (!loginSection) return;

    if (registerModal && registerModal.classList.contains('is-open')) {
        closeRegisterModal();
    }

    loginSection.hidden = false;
    requestAnimationFrame(function () {
        loginSection.classList.add('is-visible');
        const firstInput = document.getElementById('loginUsername');
        if (firstInput) {
            setTimeout(function () { firstInput.focus(); }, 380);
        }
    });
}

function closeLoginPanel() {
    const loginSection = document.getElementById('loginSection');
    if (!loginSection || !loginSection.classList.contains('is-visible')) return;

    loginSection.classList.remove('is-visible');

    const onEnd = function () {
        if (!loginSection.classList.contains('is-visible')) {
            loginSection.hidden = true;
            loginSection.removeEventListener('transitionend', onEnd);
        }
    };
    loginSection.addEventListener('transitionend', onEnd);
    setTimeout(function () {
        if (!loginSection.classList.contains('is-visible')) {
            loginSection.hidden = true;
        }
    }, 350);
}

function openRegisterModal() {
    const modal = document.getElementById('registerModal');
    const registerWrapper = document.querySelector('.form-wrapper--register');
    if (!modal) return;

    closeLoginPanel();

    modal.hidden = false;
    requestAnimationFrame(function () {
        modal.classList.add('is-open');
    });
    document.body.style.overflow = 'hidden';

    if (registerWrapper) {
        registerWrapper.scrollTop = 0;
        requestAnimationFrame(function () {
            registerWrapper.scrollTop = 0;
        });
    }
}

function closeRegisterModal() {
    const modal = document.getElementById('registerModal');
    if (!modal) return;

    modal.classList.remove('is-open');
    document.body.style.overflow = '';

    const onEnd = function () {
        if (!modal.classList.contains('is-open')) {
            modal.hidden = true;
            modal.removeEventListener('transitionend', onEnd);
        }
    };
    modal.addEventListener('transitionend', onEnd);
    setTimeout(function () {
        if (!modal.classList.contains('is-open')) {
            modal.hidden = true;
        }
    }, 300);
}

function initHeroScroll() {
    const strollBtn = document.getElementById('scrollToLoginBtn');
    const loginSection = document.getElementById('loginSection');

    if (!strollBtn || !loginSection) return;

    strollBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (loginSection.classList.contains('is-visible')) {
            const firstInput = document.getElementById('loginUsername');
            if (firstInput) firstInput.focus();
            return;
        }
        openLoginPanel();
    });
}

function initLoginForm() {
    const loginForm = document.getElementById('loginForm');

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        if (!username || !password) {
            showToast('请填写用户名和密码', 'error');
            return;
        }

        const submitBtn = this.querySelector('.submit-btn');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/user/user/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();
            console.log('登录响应:', result);

            if (isApiOk(result) && result.data) {
                const payload = result.data;
                const token = payload.token || payload.tokenStr;
                const loginUserData = payload.user || payload;

                console.log('登录返回的完整数据:', result.data);

                // 使用 sessionStorage 存储认证信息（每个标签页独立）
                setToken(token);

                // 临时存储userId，用于调用个人信息接口
                const tempUserInfo = {
                    userId: loginUserData.userId || loginUserData.id,
                    role: loginUserData.role
                };
                setUserInfo(tempUserInfo);

                if (rememberMe) {
                    // 记住密码使用 localStorage（跨标签页共享）
                    localStorage.setItem('savedUsername', username);
                    localStorage.setItem('savedPassword', password);
                } else {
                    localStorage.removeItem('savedUsername');
                    localStorage.removeItem('savedPassword');
                }

                showToast('登录成功！', 'success');

                const role = loginUserData.role;
                // 异步获取用户信息（不阻塞跳转）
                fetch(`${API_BASE_URL}/user/user/info/${tempUserInfo.userId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()).then(infoResult => {
                    if (infoResult.code === 0 || infoResult.code === 1 || infoResult.code === 200) {
                        setUserInfo({
                            ...infoResult.data,
                            role: loginUserData.role
                        });
                    }
                }).catch(e => console.error('获取用户信息失败:', e));

                // 短暂延迟让 toast 展示后立即跳转
                setTimeout(() => {
                    window.location.href = role === 0 || role === '0' ? 'admin.html' : 'user.html';
                }, 300);
            } else {
                showToast(apiErrorText(result, '登录失败'), 'error');
            }
        } catch (error) {
            console.error('登录错误:', error);
            showToast('网络错误，请检查后端服务', 'error');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
}

function initRegisterForm() {
    const registerForm = document.getElementById('registerForm');

    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const username = document.getElementById('regUsername').value.trim();
        const nickname = document.getElementById('regNickname').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        const code = document.getElementById('regCode').value.trim();

        if (!username || !nickname || !email || !phone || !password || !confirmPassword || !code) {
            showToast('请填写所有字段', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showToast('两次密码输入不一致', 'error');
            return;
        }

        if (password.length < 6 || password.length > 20) {
            showToast('密码长度应为6-20位', 'error');
            return;
        }

        const submitBtn = this.querySelector('.submit-btn');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const registerResponse = await fetch(`${API_BASE_URL}/user/user/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    nickname,
                    email,
                    phone,
                    password,
                    confirmPassword,
                    emailCode: code
                })
            });

            const registerResult = await registerResponse.json();

            if (isApiOk(registerResult)) {
                showToast('注册成功，正在登录...', 'success');

                setTimeout(async () => {
                    try {
                        const loginResponse = await fetch(`${API_BASE_URL}/user/user/login`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ username, password })
                        });

                        const loginResult = await loginResponse.json();

                        if (isApiOk(loginResult) && loginResult.data) {
                            const payload = loginResult.data;
                            const token = payload.token || payload.tokenStr;
                            const loginUserData = payload.user || payload;

                            setToken(token);

                            const tempUserInfo = {
                                userId: loginUserData.userId || loginUserData.id,
                                role: loginUserData.role
                            };
                            setUserInfo(tempUserInfo);

                            const role = loginUserData.role;

                            // 异步获取用户信息（不阻塞跳转）
                            fetch(`${API_BASE_URL}/user/user/info/${tempUserInfo.userId}`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            }).then(r => r.json()).then(infoResult => {
                                if (infoResult.code === 0 || infoResult.code === 1 || infoResult.code === 200) {
                                    setUserInfo({
                                        ...infoResult.data,
                                        role
                                    });
                                }
                            }).catch(e => console.error('获取用户信息失败:', e));

                            window.location.href = role === 0 || role === '0' ? 'admin.html' : 'user.html';
                        } else {
                            showToast('注册成功，请手动登录', 'info');
                            closeRegisterModal();
                        }
                    } catch (error) {
                        showToast('注册成功，请手动登录', 'info');
                        closeRegisterModal();
                    }
                }, 300);
            } else {
                showToast(apiErrorText(registerResult, '注册失败'), 'error');
            }
        } catch (error) {
            showToast('网络错误，请检查后端服务', 'error');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
}

async function sendCode() {
    const email = document.getElementById('regEmail').value.trim();
    const sendCodeBtn = document.getElementById('sendCodeBtn');

    if (!email) {
        showToast('请先输入邮箱', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('请输入有效的邮箱格式', 'error');
        return;
    }

    sendCodeBtn.disabled = true;
    sendCodeBtn.classList.add('countdown');

    let countdown = 60;
    const countdownInterval = setInterval(() => {
        countdown--;
        sendCodeBtn.querySelector('.btn-countdown').textContent = `${countdown}s`;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            sendCodeBtn.disabled = false;
            sendCodeBtn.classList.remove('countdown');
            sendCodeBtn.querySelector('.btn-normal').textContent = '重新发送';
        }
    }, 1000);

    try {
        const response = await fetch(`${API_BASE_URL}/user/user/send-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, type: 1 })
        });

        const result = await response.json();

        if (isApiOk(result)) {
            showToast('验证码已发送', 'success');
        } else {
            showToast(apiErrorText(result, '发送失败'), 'error');
            clearInterval(countdownInterval);
            sendCodeBtn.disabled = false;
            sendCodeBtn.classList.remove('countdown');
            sendCodeBtn.querySelector('.btn-normal').textContent = '发送验证码';
        }
    } catch (error) {
        showToast('网络错误，请检查后端服务', 'error');
        clearInterval(countdownInterval);
        sendCodeBtn.disabled = false;
        sendCodeBtn.classList.remove('countdown');
        sendCodeBtn.querySelector('.btn-normal').textContent = '发送验证码';
    }
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.classList.add('active');
    } else {
        input.type = 'password';
        btn.classList.remove('active');
    }
}

function initPasswordStrength() {
    const passwordInput = document.getElementById('regPassword');
    const strengthFill = document.querySelectorAll('.strength-segment');
    const strengthLabel = document.getElementById('strengthLabel');

    passwordInput.addEventListener('input', function() {
        const password = this.value;
        const strength = calculatePasswordStrength(password);

        strengthFill.forEach((segment, index) => {
            segment.classList.remove('active', 'weak', 'medium', 'strong');
            if (index < strength) {
                segment.classList.add('active');
                if (strength === 1) segment.classList.add('weak');
                else if (strength === 2) segment.classList.add('medium');
                else segment.classList.add('strong');
            }
        });

        if (password.length === 0) {
            strengthLabel.textContent = '强度将随输入更新';
            strengthLabel.style.color = '';
        } else if (strength === 1) {
            strengthLabel.textContent = '密码强度：弱';
            strengthLabel.style.color = '#EF4444';
        } else if (strength === 2) {
            strengthLabel.textContent = '密码强度：中等';
            strengthLabel.style.color = '#F59E0B';
        } else if (strength === 3) {
            strengthLabel.textContent = '密码强度：良好';
            strengthLabel.style.color = '#10B981';
        } else if (strength === 4) {
            strengthLabel.textContent = '密码强度：强';
            strengthLabel.style.color = '#10B981';
        }
    });

    const confirmInput = document.getElementById('regConfirmPassword');
    confirmInput.addEventListener('input', function() {
        const password = document.getElementById('regPassword').value;
        const confirm = this.value;
        const statusIcon = document.getElementById('confirmStatus');
        const wrapper = this.closest('.input-shell');

        if (confirm.length === 0) {
            wrapper.classList.remove('success', 'error');
            statusIcon.textContent = '';
        } else if (password === confirm) {
            wrapper.classList.remove('error');
            wrapper.classList.add('success');
            statusIcon.textContent = '✓';
        } else {
            wrapper.classList.remove('success');
            wrapper.classList.add('error');
            statusIcon.textContent = '✗';
        }
    });
}

function calculatePasswordStrength(password) {
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) strength++;
    return Math.min(strength, 4);
}

/* ========== 忘记密码弹窗 ========== */

function initForgotPwdModal() {
    const modal = document.getElementById('forgotPwdModal');
    const closeBtn = document.getElementById('closeForgotPwdBtn');
    const backdrop = document.getElementById('forgotPwdModalBackdrop');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeForgotPwdModal);
    }
    if (backdrop) {
        backdrop.addEventListener('click', closeForgotPwdModal);
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeForgotPwdModal();
    });
}

function openForgotPwdModal() {
    const modal = document.getElementById('forgotPwdModal');
    if (!modal) return;
    closeLoginPanel();

    modal.hidden = false;
    requestAnimationFrame(function () {
        modal.classList.add('is-open');
    });
    document.body.style.overflow = 'hidden';
}

function closeForgotPwdModal() {
    const modal = document.getElementById('forgotPwdModal');
    if (!modal) return;

    modal.classList.remove('is-open');
    document.body.style.overflow = '';

    const onEnd = function () {
        if (!modal.classList.contains('is-open')) {
            modal.hidden = true;
            modal.removeEventListener('transitionend', onEnd);
        }
    };
    modal.addEventListener('transitionend', onEnd);
    setTimeout(function () {
        if (!modal.classList.contains('is-open')) {
            modal.hidden = true;
        }
    }, 300);
}

async function sendFpCode() {
    const email = document.getElementById('fpEmail').value.trim();
    const btn = document.getElementById('fpSendCodeBtn');

    if (!email) {
        showToast('请输入邮箱', 'error');
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('请输入有效的邮箱格式', 'error');
        return;
    }

    btn.disabled = true;
    btn.classList.add('countdown');

    let countdown = 60;
    const countdownInterval = setInterval(() => {
        countdown--;
        btn.querySelector('.btn-countdown').textContent = countdown + 's';
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            btn.disabled = false;
            btn.classList.remove('countdown');
            btn.querySelector('.btn-normal').textContent = '重新发送';
        }
    }, 1000);

    try {
        const response = await fetch(API_BASE_URL + '/user/user/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, type: 2 })
        });
        const result = await response.json();

        if (isApiOk(result)) {
            showToast('验证码已发送', 'success');
        } else {
            showToast(apiErrorText(result, '发送失败'), 'error');
            clearInterval(countdownInterval);
            btn.disabled = false;
            btn.classList.remove('countdown');
            btn.querySelector('.btn-normal').textContent = '发送验证码';
        }
    } catch (e) {
        showToast('网络错误，请检查后端服务', 'error');
        clearInterval(countdownInterval);
        btn.disabled = false;
        btn.classList.remove('countdown');
        btn.querySelector('.btn-normal').textContent = '发送验证码';
    }
}

function initForgotPwdForm() {
    const form = document.getElementById('forgotPwdForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const email = document.getElementById('fpEmail').value.trim();
        const code = document.getElementById('fpCode').value.trim();
        const password = document.getElementById('fpPassword').value;
        const confirmPassword = document.getElementById('fpConfirmPassword').value;

        if (!email || !code || !password || !confirmPassword) {
            showToast('请填写所有字段', 'error');
            return;
        }
        if (password !== confirmPassword) {
            showToast('两次密码输入不一致', 'error');
            return;
        }
        if (password.length < 6 || password.length > 20) {
            showToast('密码长度应为6-20位', 'error');
            return;
        }

        const submitBtn = form.querySelector('.submit-btn');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const response = await fetch(API_BASE_URL + '/user/user/forgot-password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    code: code,
                    newPassword: password,
                    confirmPassword: confirmPassword
                })
            });
            const result = await response.json();

            if (isApiOk(result)) {
                showToast('密码重置成功，请重新登录', 'success');
                setTimeout(function () {
                    closeForgotPwdModal();
                    openLoginPanel();
                }, 500);
            } else {
                showToast(apiErrorText(result, '重置失败'), 'error');
            }
        } catch (e) {
            showToast('网络错误，请检查后端服务', 'error');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
}

function loadSavedCredentials() {
    const savedUsername = localStorage.getItem('savedUsername');
    const savedPassword = localStorage.getItem('savedPassword');

    if (savedUsername) {
        document.getElementById('loginUsername').value = savedUsername;
        document.getElementById('rememberMe').checked = true;
    }
    if (savedPassword) {
        document.getElementById('loginPassword').value = savedPassword;
    }
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    const toastIcon = toast.querySelector('.toast-icon');
    const toastMessage = toast.querySelector('.toast-message');

    toast.classList.remove('show', 'success', 'error', 'info', 'shake');

    toastMessage.textContent = message;
    toast.classList.add(type);

    if (type === 'success') toastIcon.textContent = '✓';
    else if (type === 'error') toastIcon.textContent = '✗';
    else toastIcon.textContent = 'ℹ';

    toast.classList.add('show');

    if (type === 'error') {
        toast.classList.add('shake');
    }

    setTimeout(() => {
        toast.classList.remove('show', 'shake');
    }, 2000);
}
