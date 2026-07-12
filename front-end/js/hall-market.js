// 杂货铺页面逻辑
let currentProductCategory = 'all';
let uploadedImages = [];

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadCategories();  // 加载分类数据
    loadProducts();
    initSearch();
});

// 加载分类列表（从接口获取）
async function loadCategories() {
    try {
        const token = getCurrentToken();
        if (!token) return;

        const response = await fetch(API_BASE_URL + '/user/category/list', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (response.ok) {
            const data = await response.json();
            const categories = data.data || data || [];
            const select = document.getElementById('categorySelect');

            // 清空现有选项（保留"全部"）
            select.innerHTML = '<option value="all">全部</option>';

            // 动态添加分类选项
            if (Array.isArray(categories)) {
                categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.id || cat.name || cat;
                    option.textContent = cat.name || cat;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载分类失败:', error);
        // 如果接口失败，使用默认分类作为后备
        const defaultCategories = [
            { id: 'books', name: '教材' },
            { id: 'electronics', name: '电子' },
            { id: 'daily', name: '生活' },
            { id: 'other', name: '其他' }
        ];
        const select = document.getElementById('categorySelect');
        select.innerHTML = '<option value="all">全部</option>';
        defaultCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
    }
}

// 分类选择变化处理
function onCategoryChange() {
    currentProductCategory = document.getElementById('categorySelect').value;
    loadProducts(getSearchQuery());
}

// 重置筛选条件
function resetFilters() {
    document.getElementById('categorySelect').value = 'all';
    document.getElementById('productSearchInput').value = '';
    currentProductCategory = 'all';
    loadProducts();
}

// 初始化搜索
function initSearch() {
    const input = document.getElementById('productSearchInput');
    let timeout;
    input.addEventListener('input', function() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            loadProducts(this.value);
        }, 300);
    });
}

// 获取当前搜索关键词
function getSearchQuery() {
    return document.getElementById('productSearchInput').value.trim();
}

// 清除搜索（保留以兼容性）
function clearSearch() {
    document.getElementById('productSearchInput').value = '';
    loadProducts();
}

// 加载商品列表
async function loadProducts(searchQuery = '') {
    const listEl = document.getElementById('fullProductList');
    listEl.innerHTML = '<div class="loading-placeholder">加载中...</div>';
    
// ⚠️ 关键检查2：是否已删除/注销（兼容 deleted 和 isDelete 两种字段名）
const isDeleted = userStatusInfo.deleted === 1 || 
                 userStatusInfo.deleted === '1' || 
                 userStatusInfo.isDelete === 1 || 
                 userStatusInfo.isDelete === '1';

if (isDeleted) {
    handleAccountDisabled('您的账号已被注销');
    return;
}    try {
        const token = getCurrentToken();
        if (!token) {
            showToast('请先登录', 'error');
            return;
        }
        
        let url = API_BASE_URL + '/products';
        const params = new URLSearchParams();
        
        if (currentProductCategory !== 'all') {
            params.append('category', currentProductCategory);
        }
        if (searchQuery) {
            params.append('search', searchQuery);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderProducts(data.products || []);
        } else {
            renderProducts([]);
        }
    } catch (error) {
        console.error('加载商品失败:', error);
        renderProducts([]);
    }
}

// 渲染商品列表
function renderProducts(products) {
    const listEl = document.getElementById('fullProductList');
    
    if (!products || products.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🛍️</div>
                <div class="empty-text">暂无商品</div>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = products.map(product => `
        <div class="product-card" onclick="showProductDetail(${product.id})">
            <div class="product-image">${product.images && product.images[0] ? 
                `<img src="${product.images[0]}" alt="${escapeHtml(product.name)}">` : 
                '🛍️'}</div>
            <div class="product-info">
                <div class="product-name">${escapeHtml(product.name || '')}</div>
                <div class="product-price">¥${product.price || 0}</div>
                <div class="product-condition">${product.condition || ''} · ${product.category || ''}</div>
            </div>
        </div>
    `).join('');
}

// 过滤商品分类（已废弃，保留以兼容性，现使用 onCategoryChange）
function filterProducts(category) {
    currentProductCategory = category;
    loadProducts();
}

// 显示发布商品弹窗
function showProductPublish() {
    uploadedImages = [];
    document.getElementById('productName').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productCategory').value = 'books';
    document.getElementById('productCondition').value = '全新';
    document.getElementById('productDesc').value = '';
    renderImageUpload();
    openModal('productPublishModal');
}

// 渲染图片上传区域
function renderImageUpload() {
    const grid = document.getElementById('imageUploadGrid');
    let html = '';
    
    uploadedImages.forEach((img, index) => {
        html += `
            <div class="uploaded-image" onclick="removeImage(${index})">
                <img src="${img}" alt="商品图片">
                <span class="remove-icon">×</span>
            </div>
        `;
    });
    
    if (uploadedImages.length < 9) {
        html += `
            <div class="upload-placeholder" onclick="uploadImage()">
                <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                </svg>
                <span class="upload-text">点击上传</span>
            </div>
        `;
    }
    
    grid.innerHTML = html;
}

// 模拟上传图片
function uploadImage() {
    // 这里应该是实际的文件上传逻辑
    // 目前模拟添加一个占位图
    const mockUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%2321262d" width="100" height="100"/><text x="50" y="55" fill="%238b949e" text-anchor="middle" font-size="40">📷</text></svg>';
    uploadedImages.push(mockUrl);
    renderImageUpload();
}

// 删除图片
function removeImage(index) {
    uploadedImages.splice(index, 1);
    renderImageUpload();
}

// 提交商品
async function submitProduct() {
    const name = document.getElementById('productName').value.trim();
    const price = document.getElementById('productPrice').value;
    const category = document.getElementById('productCategory').value;
    const condition = document.getElementById('productCondition').value;
    const desc = document.getElementById('productDesc').value.trim();
    const tradeType = document.querySelector('input[name="tradeType"]:checked').value;
    
    if (!name) {
        showToast('请输入商品名称', 'error');
        return;
    }
    
    if (!price || parseFloat(price) <= 0) {
        showToast('请输入有效的价格', 'error');
        return;
    }
    
    try {
        const token = getCurrentToken();
        const response = await fetch(API_BASE_URL + '/products', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                price: parseFloat(price),
                category,
                condition,
                description: desc,
                tradeType,
                images: uploadedImages
            })
        });
        
        if (response.ok) {
            showToast('发布成功', 'success');
            closeModal('productPublishModal');
            loadProducts();
        } else {
            const data = await response.json();
            showToast(data.message || '发布失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

// 显示商品详情
async function showProductDetail(productId) {
    try {
        const token = getCurrentToken();
        const response = await fetch(API_BASE_URL + '/products/' + productId, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            const product = await response.json();
            const body = document.getElementById('productDetailBody');
            
            body.innerHTML = `
                <div class="product-detail">
                    <div class="detail-images">
                        ${(product.images && product.images.length > 0) ? 
                            product.images.map(img => `<img src="${img}" alt="商品图片">`).join('') :
                            '<div class="detail-placeholder">🛍️</div>'
                        }
                    </div>
                    <div class="detail-header">
                        <h3 class="detail-title">${escapeHtml(product.name || '')}</h3>
                        <span class="detail-price">¥${product.price || 0}</span>
                    </div>
                    <div class="detail-meta">
                        <span class="detail-tag">${product.condition || ''}</span>
                        <span class="detail-tag">${getCategoryText(product.category)}</span>
                        <span class="detail-tag">${getTradeTypeText(product.tradeType)}</span>
                    </div>
                    <div class="detail-desc">${escapeHtml(product.description || '暂无描述')}</div>
                </div>
            `;
            
            openModal('productDetailModal');
        }
    } catch (error) {
        showToast('加载失败', 'error');
    }
}

// 购买商品
async function buyProduct(productId) {
    try {
        const token = getCurrentToken();
        const response = await fetch(API_BASE_URL + '/products/' + productId + '/buy', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            showToast('购买成功', 'success');
            closeModal('productDetailModal');
            loadProducts();
        } else {
            const data = await response.json();
            showToast(data.message || '购买失败', 'error');
        }
    } catch (error) {
        showToast('网络错误', 'error');
    }
}

// 辅助函数
function getCategoryText(category) {
    const map = {
        'books': '📚 教材',
        'electronics': '📱 电子',
        'daily': '🛋️ 生活',
        'other': '📦 其他'
    };
    return map[category] || category;
}

function getTradeTypeText(type) {
    const map = {
        'self': '自提',
        'express': '快递',
        'both': '自提/快递'
    };
    return map[type] || type;
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
