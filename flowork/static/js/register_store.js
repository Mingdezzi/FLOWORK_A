class RegisterStoreApp {
    constructor() {
        this.container = null;
        this.csrfToken = null;
        this.dom = {};
        this.handlers = {};
    }

    init(container) {
        this.container = container;
        // 메타 태그가 없으면 폼 내부나 다른 방식으로 가져와야 함 (독립 페이지일 경우 메타 태그 있음)
        const meta = document.querySelector('meta[name="csrf-token"]');
        this.csrfToken = meta ? meta.getAttribute('content') : '';

        // 독립 페이지는 body.dataset, 탭 내부라면 container 상위 등.. 상황에 따라 다름.
        // register_store.html은 독립 페이지이므로 document.body.dataset 사용 가능
        this.apiBaseUrl = document.body.dataset.apiGetStoresUrl || '/api/brands/0/unregistered_stores';

        this.dom = {
            brandSelect: container.querySelector('#brand_id'),
            storeSelect: container.querySelector('#store_id')
        };

        if (!this.dom.brandSelect || !this.dom.storeSelect) return;

        this.handlers.brandChange = () => this.handleBrandChange();
        this.dom.brandSelect.addEventListener('change', this.handlers.brandChange);
    }

    destroy() {
        if (this.dom.brandSelect) {
            this.dom.brandSelect.removeEventListener('change', this.handlers.brandChange);
        }
        this.container = null;
        this.dom = {};
        this.handlers = {};
    }

    async handleBrandChange() {
        const brandId = this.dom.brandSelect.value;
        const storeSelect = this.dom.storeSelect;
        
        if (!brandId) {
            storeSelect.innerHTML = '<option value="">-- 브랜드를 먼저 선택하세요 --</option>';
            storeSelect.disabled = true;
            return;
        }

        storeSelect.innerHTML = '<option value="">매장 목록 로드 중...</option>';
        storeSelect.disabled = true;

        const fetchUrl = this.apiBaseUrl.replace('/0/', `/${brandId}/`);

        try {
            const response = await fetch(fetchUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken
                }
            });
            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                throw new Error(data.message || '매장 목록 로드 실패');
            }

            storeSelect.innerHTML = '';
            if (data.stores.length === 0) {
                storeSelect.innerHTML = '<option value="">-- 가입 가능한 매장이 없습니다 --</option>';
            } else {
                storeSelect.innerHTML = '<option value="">-- 매장을 선택하세요 --</option>';
                data.stores.forEach(store => {
                    const option = document.createElement('option');
                    option.value = store.id;
                    option.textContent = `${store.name} (코드: ${store.code})`;
                    storeSelect.appendChild(option);
                });
                storeSelect.disabled = false;
            }

        } catch (error) {
            console.error('Fetch unregistered stores error:', error);
            storeSelect.innerHTML = `<option value="">-- ${error.message} --</option>`;
            storeSelect.disabled = true;
        }
    }
}

// 탭 매니저가 있으면 레지스트리에 등록, 없으면(독립 페이지) 즉시 실행
if (window.PageRegistry) {
    window.PageRegistry['register_store'] = new RegisterStoreApp();
}

// 독립 페이지(로그인 전) 실행 지원
if (!window.TabManager) {
    document.addEventListener('DOMContentLoaded', () => {
        new RegisterStoreApp().init(document);
    });
}