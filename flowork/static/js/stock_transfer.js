class StockTransferApp {
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
        
        this.dom = {
            // Out & In common
            table: container.querySelector('.table-responsive'),
            
            // In (Request Modal)
            reqPnInput: container.querySelector('#req-pn'),
            searchBtn: container.querySelector('#btn-search-prod'),
            searchResults: container.querySelector('#search-results'),
            colorSelect: container.querySelector('#req-color'),
            sizeSelect: container.querySelector('#req-size'),
            submitReqBtn: container.querySelector('#btn-submit-request'),
            reqSourceStore: container.querySelector('#req-source-store'),
            reqQty: container.querySelector('#req-qty')
        };

        // 1. 상태 변경 이벤트 위임 (출고/입고/거절)
        if (this.dom.table) {
            this.handlers.tableClick = (e) => this.handleTableClick(e);
            this.dom.table.addEventListener('click', this.handlers.tableClick);
        }

        // 2. 이동 요청 모달 로직 (In 페이지)
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

        if (this.dom.submitReqBtn) {
            this.handlers.submitReq = () => this.submitRequest();
            this.dom.submitReqBtn.addEventListener('click', this.handlers.submitReq);
        }
    }

    destroy() {
        if (this.dom.table) this.dom.table.removeEventListener('click', this.handlers.tableClick);
        if (this.dom.searchBtn) this.dom.searchBtn.removeEventListener('click', this.handlers.searchProd);
        if (this.dom.colorSelect) this.dom.colorSelect.removeEventListener('change', this.handlers.colorChange);
        if (this.dom.sizeSelect) this.dom.sizeSelect.removeEventListener('change', this.handlers.sizeChange);
        if (this.dom.submitReqBtn) this.dom.submitReqBtn.removeEventListener('click', this.handlers.submitReq);

        // 모달 백드롭 제거
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bd => bd.remove());

        this.container = null;
        this.dom = {};
        this.handlers = {};
        this.variantsCache = [];
    }

    // --- Actions ---

    async handleTableClick(e) {
        if (e.target.classList.contains('btn-ship')) {
            if (!confirm('출고 확정하시겠습니까?\n(확정 시 내 매장 재고가 차감됩니다.)')) return;
            await this.updateStatus(e.target.dataset.id, 'ship');
        }
        else if (e.target.classList.contains('btn-reject')) {
            if (!confirm('요청을 거부하시겠습니까?')) return;
            await this.updateStatus(e.target.dataset.id, 'reject');
        }
        else if (e.target.classList.contains('btn-receive')) {
            if (!confirm('물품을 수령하셨습니까?\n(확정 시 내 매장 재고가 증가합니다.)')) return;
            await this.updateStatus(e.target.dataset.id, 'receive');
        }
    }

    async updateStatus(id, action) {
        try {
            const res = await fetch(`/api/stock_transfer/${id}/${action}`, {
                method: 'POST',
                headers: { 'X-CSRFToken': this.csrfToken }
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert(data.message);
                // 현재 탭 리로드
                if (TabManager.activeTabId) {
                    const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                    if(tab) TabManager.loadContent(tab.id, tab.url);
                }
            } else {
                alert(data.message);
            }
        } catch (err) {
            alert('서버 통신 오류');
        }
    }

    async searchProduct() {
        const query = this.dom.reqPnInput.value.trim();
        if (!query) return;
        
        // 템플릿의 body_attrs는 적용되지 않으므로 URL을 직접 사용하거나 
        // base_ajax.html에서 data 속성을 전달받아야 함. 여기서는 API 경로 직접 사용.
        const url = '/api/order_product_search'; // document.body.dataset.productSearchUrl 대체
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify({ query })
        });
        const data = await res.json();
        
        const resultsDiv = this.dom.searchResults;
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'block';
        
        if(data.products) {
            data.products.forEach(p => {
                const item = document.createElement('button');
                item.className = 'list-group-item list-group-item-action';
                item.textContent = `${p.product_name} (${p.product_number})`;
                item.onclick = (e) => {
                    e.preventDefault(); 
                    this.selectProduct(p.product_number);
                };
                resultsDiv.appendChild(item);
            });
        } else {
            resultsDiv.innerHTML = '<div class="p-2">검색 결과 없음</div>';
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
            op.value = c;
            op.textContent = c;
            this.dom.colorSelect.appendChild(op);
        });
    }

    handleColorChange() {
        const color = this.dom.colorSelect.value;
        this.dom.sizeSelect.innerHTML = '<option value="">선택</option>';
        
        const sizes = this.variantsCache.filter(v => v.color === color);
        sizes.forEach(v => {
            const op = document.createElement('option');
            op.value = v.variant_id; // value에 ID 저장
            op.textContent = v.size;
            this.dom.sizeSelect.appendChild(op);
        });
        this.dom.sizeSelect.disabled = false;
    }

    async submitRequest() {
        const sourceId = this.dom.reqSourceStore.value;
        const qty = this.dom.reqQty.value;
        
        if(!sourceId || !this.selectedVariantId || !qty) {
            alert('모든 항목을 입력하세요.'); return;
        }
        
        try {
            const res = await fetch('/api/stock_transfer/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify({
                    source_store_id: sourceId,
                    variant_id: this.selectedVariantId,
                    quantity: qty
                })
            });
            const data = await res.json();
            if(data.status === 'success') {
                alert('요청되었습니다.');
                if (TabManager.activeTabId) {
                    const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                    if(tab) TabManager.loadContent(tab.id, tab.url);
                }
            } else {
                alert(data.message);
            }
        } catch(e) { alert('오류 발생'); }
    }
}

// 하나의 인스턴스를 관련 페이지 모듈에 공유 등록
const stockTransferApp = new StockTransferApp();
window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['transfer_in'] = stockTransferApp;
window.PageRegistry['transfer_out'] = stockTransferApp;
window.PageRegistry['transfer_status'] = stockTransferApp;