class StoreOrderApp {
    constructor() {
        this.container = null;
        this.csrfToken = null;
        this.dom = {};
        this.handlers = {};
        this.variantsCache = [];
        this.selectedVariantId = null;
    }

    init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        const today = new Date().toISOString().split('T')[0];

        this.dom = {
            dateInput: container.querySelector('#req-date'),
            reqPnInput: container.querySelector('#req-pn'),
            searchBtn: container.querySelector('#btn-search-prod'),
            searchResults: container.querySelector('#search-results'),
            colorSelect: container.querySelector('#req-color'),
            sizeSelect: container.querySelector('#req-size'),
            reqQty: container.querySelector('#req-qty'),
            // 주문/반품 버튼 ID가 다를 수 있음
            btnSubmit: container.querySelector('#btn-submit-order') || container.querySelector('#btn-submit-return'),
            // 관리자용 테이블
            table: container.querySelector('.table-responsive')
        };

        if (this.dom.dateInput) this.dom.dateInput.value = today;

        // API URL 결정 (주문 vs 반품)
        // 템플릿의 body_attrs 대신 버튼 ID 등을 보고 판단하거나, URL 패턴 사용
        // 여기서는 버튼 ID로 구분
        if (this.dom.btnSubmit && this.dom.btnSubmit.id === 'btn-submit-order') {
            this.apiUrl = '/api/store_orders';
        } else {
            this.apiUrl = '/api/store_returns';
        }

        // 1. 상품 검색 및 선택
        if (this.dom.searchBtn) {
            this.handlers.searchProd = () => this.searchProduct();
            this.dom.searchBtn.addEventListener('click', this.handlers.searchProd);
        }

        if (this.dom.colorSelect) {
            this.handlers.colorChange = () => this.handleColorChange();
            this.dom.colorSelect.addEventListener('change', this.handlers.colorChange);
        }

        if (this.dom.sizeSelect) {
            this.handlers.sizeChange = () => { this.selectedVariantId = this.dom.sizeSelect.value; };
            this.dom.sizeSelect.addEventListener('change', this.handlers.sizeChange);
        }

        // 2. 요청 제출
        if (this.dom.btnSubmit) {
            this.handlers.submit = () => this.submitRequest();
            this.dom.btnSubmit.addEventListener('click', this.handlers.submit);
        }

        // 3. 관리자 승인/거절 (이벤트 위임)
        if (this.dom.table) {
            this.handlers.adminAction = (e) => this.handleAdminAction(e);
            this.dom.table.addEventListener('click', this.handlers.adminAction);
        }
    }

    destroy() {
        if (this.dom.searchBtn) this.dom.searchBtn.removeEventListener('click', this.handlers.searchProd);
        if (this.dom.colorSelect) this.dom.colorSelect.removeEventListener('change', this.handlers.colorChange);
        if (this.dom.sizeSelect) this.dom.sizeSelect.removeEventListener('change', this.handlers.sizeChange);
        if (this.dom.btnSubmit) this.dom.btnSubmit.removeEventListener('click', this.handlers.submit);
        if (this.dom.table) this.dom.table.removeEventListener('click', this.handlers.adminAction);

        // 모달 백드롭 제거
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bd => bd.remove());

        this.container = null;
        this.dom = {};
        this.handlers = {};
        this.variantsCache = [];
    }

    // --- Methods ---

    async searchProduct() {
        const query = this.dom.reqPnInput.value.trim();
        if (!query) return;
        
        const url = '/api/order_product_search'; 
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify({ query })
        });
        const data = await res.json();
        
        this.dom.searchResults.innerHTML = '';
        this.dom.searchResults.style.display = 'block';
        
        if(data.products) {
            data.products.forEach(p => {
                const item = document.createElement('button');
                item.className = 'list-group-item list-group-item-action';
                item.textContent = `${p.product_name} (${p.product_number})`;
                item.onclick = (e) => { 
                    e.preventDefault(); 
                    this.selectProduct(p.product_number); 
                };
                this.dom.searchResults.appendChild(item);
            });
        } else {
            this.dom.searchResults.innerHTML = '<div class="p-2">검색 결과 없음</div>';
        }
    }

    async selectProduct(pn) {
        this.dom.searchResults.style.display = 'none';
        this.dom.reqPnInput.value = pn;
        
        const detailRes = await fetch('/api/sales/search_products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify({ query: pn, mode: 'detail_stock' })
        });
        const detailData = await detailRes.json();
        
        this.dom.colorSelect.innerHTML = '<option value="">선택</option>';
        this.dom.sizeSelect.innerHTML = '<option value="">선택</option>';
        this.dom.colorSelect.disabled = false;
        this.dom.sizeSelect.disabled = true;
        
        this.variantsCache = detailData.variants || [];
        const colors = [...new Set(this.variantsCache.map(v => v.color))];
        colors.forEach(c => {
            const op = document.createElement('option');
            op.value = c; op.textContent = c;
            this.dom.colorSelect.appendChild(op);
        });
    }

    handleColorChange() {
        const color = this.dom.colorSelect.value;
        this.dom.sizeSelect.innerHTML = '<option value="">선택</option>';
        const sizes = this.variantsCache.filter(v => v.color === color);
        sizes.forEach(v => {
            const op = document.createElement('option');
            op.value = v.variant_id; op.textContent = v.size;
            this.dom.sizeSelect.appendChild(op);
        });
        this.dom.sizeSelect.disabled = false;
    }

    async submitRequest() {
        if (!this.selectedVariantId) { alert('상품을 선택하세요.'); return; }
        const qty = this.dom.reqQty.value;

        const res = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify({
                variant_id: this.selectedVariantId,
                quantity: qty,
                date: this.dom.dateInput.value
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert(data.message);
            if (TabManager.activeTabId) {
                const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                if(tab) TabManager.loadContent(tab.id, tab.url);
            }
        } else {
            alert(data.message);
        }
    }

    async handleAdminAction(e) {
        // 이 모듈이 주문/반품 모두 쓰이므로 URL Prefix 판단 필요
        // 현재 페이지 모듈 이름이나 URL을 보고 판단 가능하지만, 간단히 API 엔드포인트 두개를 다 시도할 수는 없음.
        // 버튼 클릭 시점에, 탭의 URL이나 어떤 힌트를 통해 주문인지 반품인지 알아야 함.
        // 하지만 여기선 DOM에 힌트가 없으므로... 임시로 버튼의 class나 data 속성을 활용.
        // (템플릿 수정 없이 하려면 URL 판단이 제일 좋음)
        
        // 현재 탭의 URL로 판단
        let prefix = '';
        if (TabManager.activeTabId) {
            const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
            if (tab.url.includes('store/orders')) prefix = '/api/store_orders/';
            else prefix = '/api/store_returns/';
        } else {
            // Fallback (일반 로드)
            if (window.location.href.includes('store/orders')) prefix = '/api/store_orders/';
            else prefix = '/api/store_returns/';
        }

        if (e.target.classList.contains('btn-approve')) {
            const id = e.target.dataset.id;
            const reqQty = e.target.dataset.qty;
            const confQty = prompt('확정 수량을 입력하세요:', reqQty);
            
            if (confQty !== null) {
                await this.updateStatus(prefix + id + '/status', 'APPROVED', confQty);
            }
        }
        else if (e.target.classList.contains('btn-reject')) {
            if (!confirm('거절하시겠습니까?')) return;
            const id = e.target.dataset.id;
            await this.updateStatus(prefix + id + '/status', 'REJECTED', 0);
        }
    }

    async updateStatus(url, status, qty) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify({ status: status, confirmed_quantity: qty })
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert(data.message);
                if (TabManager.activeTabId) {
                    const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                    if(tab) TabManager.loadContent(tab.id, tab.url);
                }
            } else {
                alert(data.message);
            }
        } catch(e) { alert('통신 오류'); }
    }
}

const storeOrderApp = new StoreOrderApp();
window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['store_orders'] = storeOrderApp;
window.PageRegistry['store_returns'] = storeOrderApp;