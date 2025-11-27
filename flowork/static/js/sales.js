/**
 * Sales POS Application Logic (Refactored for Tab System)
 */

class SalesApp {
    constructor() {
        this.urls = null;
        this.mode = 'sales';
        this.cart = [];
        this.heldCart = null;
        this.isOnline = false;
        this.refundSaleId = null;
        this.config = { amount_discounts: [] };
        this.container = null;
        this.dom = {};
        
        this.handlers = {
            search: () => this.search(),
            searchKey: (e) => { if(e.key==='Enter') this.search(); },
            toggleOnline: () => this.toggleOnline(),
            clearCart: () => { this.cart = []; this.renderCart(); },
            submitSale: () => this.submitSale(),
            submitRefund: () => this.submitRefund(),
            resetRefund: () => this.resetRefund(),
            toggleHold: () => this.toggleHold(),
            applyDiscount: () => this.applyAutoDiscount(),
            setModeSales: () => this.setMode('sales'),
            setModeRefund: () => this.setMode('refund'),
            focusSearch: () => { if(this.dom.searchInput) this.dom.searchInput.focus(); }
        };
    }

    init(container) {
        this.container = container;
        
        // [수정] 데이터셋 병합 (전역 설정 + 탭별 설정)
        const dataset = Object.assign({}, document.body.dataset, container.dataset);
        this.urls = dataset.apiUrls ? JSON.parse(dataset.apiUrls) : {};
        
        this.dom = {
            leftPanel: container.querySelector('#sales-left-panel'),
            dateSales: container.querySelector('#date-area-sales'),
            dateRefund: container.querySelector('#date-area-refund'),
            saleDate: container.querySelector('#sale-date'),
            refundStart: container.querySelector('#refund-start'),
            refundEnd: container.querySelector('#refund-end'),
            modeSales: container.querySelector('#mode-sales'),
            modeRefund: container.querySelector('#mode-refund'),
            searchInput: container.querySelector('#search-input'),
            btnSearch: container.querySelector('#btn-search'),
            leftThead: container.querySelector('#left-table-head'),
            leftTbody: container.querySelector('#left-table-body'),
            cartTbody: container.querySelector('#cart-tbody'),
            totalQty: container.querySelector('#total-qty'),
            totalAmt: container.querySelector('#total-amount'),
            salesActions: container.querySelector('#sales-actions'),
            refundActions: container.querySelector('#refund-actions'),
            refundInfo: container.querySelector('#refund-target-info'),
            btnSubmitSale: container.querySelector('#btn-submit-sale'),
            btnSubmitRefund: container.querySelector('#btn-submit-refund'),
            btnCancelRefund: container.querySelector('#btn-cancel-refund'),
            btnToggleOnline: container.querySelector('#btn-toggle-online'),
            btnClearCart: container.querySelector('#btn-clear-cart'),
            btnHold: container.querySelector('#btn-hold-sale'),
            btnDiscount: container.querySelector('#btn-apply-discount'),
            rightPanelTitle: container.querySelector('#right-panel-title'),
            detailModalEl: container.querySelector('#detail-modal'),
            recordsModalEl: container.querySelector('#records-modal')
        };

        if (this.dom.detailModalEl) this.detailModal = new bootstrap.Modal(this.dom.detailModalEl);
        if (this.dom.recordsModalEl) this.recordsModal = new bootstrap.Modal(this.dom.recordsModalEl);

        this.initData();
        this.bindEvents();
    }

    destroy() {
        if(this.dom.btnSearch) this.dom.btnSearch.removeEventListener('click', this.handlers.search);
        if(this.dom.searchInput) this.dom.searchInput.removeEventListener('keydown', this.handlers.searchKey);
        
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bd => bd.remove());
        
        this.container = null;
    }

    initData() {
        const today = new Date();
        const lastMonth = new Date();
        lastMonth.setMonth(today.getMonth() - 1);
        
        if(this.dom.saleDate) this.dom.saleDate.value = Flowork.fmtDate(today);
        if(this.dom.refundEnd) this.dom.refundEnd.value = Flowork.fmtDate(today);
        if(this.dom.refundStart) this.dom.refundStart.value = Flowork.fmtDate(lastMonth);

        this.loadSettings();
    }

    bindEvents() {
        if(this.dom.modeSales) this.dom.modeSales.addEventListener('change', this.handlers.setModeSales);
        if(this.dom.modeRefund) this.dom.modeRefund.addEventListener('change', this.handlers.setModeRefund);
        if(this.dom.searchInput) this.dom.searchInput.addEventListener('keydown', this.handlers.searchKey);
        if(this.dom.btnSearch) this.dom.btnSearch.addEventListener('click', this.handlers.search);
        if(this.dom.btnToggleOnline) this.dom.btnToggleOnline.addEventListener('click', this.handlers.toggleOnline);
        if(this.dom.btnClearCart) this.dom.btnClearCart.addEventListener('click', this.handlers.clearCart);
        if(this.dom.btnSubmitSale) this.dom.btnSubmitSale.addEventListener('click', this.handlers.submitSale);
        if(this.dom.btnSubmitRefund) this.dom.btnSubmitRefund.addEventListener('click', this.handlers.submitRefund);
        if(this.dom.btnCancelRefund) this.dom.btnCancelRefund.addEventListener('click', this.handlers.resetRefund);
        if(this.dom.btnHold) this.dom.btnHold.addEventListener('click', this.handlers.toggleHold);
        if(this.dom.btnDiscount) this.dom.btnDiscount.addEventListener('click', this.handlers.applyDiscount);

        if(this.dom.detailModalEl) this.dom.detailModalEl.addEventListener('hidden.bs.modal', this.handlers.focusSearch);
        if(this.dom.recordsModalEl) this.dom.recordsModalEl.addEventListener('hidden.bs.modal', this.handlers.focusSearch);
    }

    async loadSettings() {
        try {
            const data = await Flowork.get(this.urls.salesSettings);
            if (data.status === 'success') this.config = data.config;
        } catch (e) { console.error("Settings Load Failed", e); }
    }

    setMode(mode) {
        this.mode = mode;
        this.cart = [];
        this.renderCart();
        this.dom.leftTbody.innerHTML = '';
        this.dom.searchInput.value = '';

        const isSales = (mode === 'sales');
        this.dom.leftPanel.className = isSales ? 'sales-left mode-sales-bg' : 'sales-left mode-refund-bg';
        
        this.dom.dateSales.style.display = isSales ? 'block' : 'none';
        this.dom.dateRefund.style.display = isSales ? 'none' : 'block';
        
        this.dom.salesActions.style.display = isSales ? 'block' : 'none';
        this.dom.refundActions.style.display = isSales ? 'none' : 'flex';
        
        const titleHtml = isSales ? '<i class="bi bi-cart4"></i> 판매 목록' : '<i class="bi bi-arrow-return-left"></i> 환불 목록';
        this.dom.rightPanelTitle.innerHTML = titleHtml;
    }

    toggleOnline() {
        this.isOnline = !this.isOnline;
        const btn = this.dom.btnToggleOnline;
        btn.textContent = this.isOnline ? 'ONLINE' : 'OFFLINE';
        btn.classList.toggle('btn-outline-dark');
        btn.classList.toggle('btn-info');
    }

    async search() {
        const query = this.dom.searchInput.value.trim();
        if (!query) return;

        const headers = this.mode === 'sales' 
            ? ['품번','품명','컬러','년도','최초가','판매가','재고'] 
            : ['품번','품명','컬러','년도','최초가','판매가','판매량'];
        
        this.dom.leftThead.innerHTML = `<tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr>`;
        this.dom.leftTbody.innerHTML = '<tr><td colspan="7" class="text-center">검색 중...</td></tr>';

        try {
            const payload = {
                query, 
                mode: this.mode,
                start_date: this.dom.refundStart.value,
                end_date: this.dom.refundEnd.value
            };
            
            const data = await Flowork.post(this.urls.searchSalesProducts, payload);
            this.dom.leftTbody.innerHTML = '';

            if (!data.results || data.results.length === 0) {
                this.dom.leftTbody.innerHTML = '<tr><td colspan="7" class="text-center">검색 결과가 없습니다.</td></tr>';
                return;
            }

            data.results.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="fw-bold">${item.product_number}</td>
                    <td>${item.product_name}</td>
                    <td>${item.color}</td>
                    <td>${item.year || '-'}</td>
                    <td class="text-end">${Flowork.fmtNum(item.original_price)}</td>
                    <td class="text-end">${Flowork.fmtNum(item.sale_price)}</td>
                    <td class="text-center fw-bold">${item.stat_qty}</td>
                `;
                tr.onclick = () => this.handleResultClick(item);
                this.dom.leftTbody.appendChild(tr);
            });
        } catch (e) {
            this.dom.leftTbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">오류 발생</td></tr>';
        }
    }

    async handleResultClick(item) {
        if (this.mode === 'sales') {
            this.showDetailModal(item);
        } else {
            this.showRefundRecords(item);
        }
    }

    async showDetailModal(item) {
        const title = this.dom.detailModalEl.querySelector('#detail-modal-title');
        const tbody = this.dom.detailModalEl.querySelector('#detail-modal-tbody');
        title.textContent = `${item.product_name} (${item.product_number})`;
        tbody.innerHTML = '<tr><td colspan="6">로딩중...</td></tr>';
        this.detailModal.show();

        try {
            const data = await Flowork.post(this.urls.searchSalesProducts, { 
                query: item.product_number, 
                mode: 'detail_stock' 
            });
            
            tbody.innerHTML = '';
            data.variants.forEach(v => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${v.color}</td>
                    <td>${v.size}</td>
                    <td>${Flowork.fmtNum(v.original_price)}</td>
                    <td>${Flowork.fmtNum(v.sale_price)}</td>
                    <td class="${v.stock <= 0 ? 'text-danger' : ''}">${v.stock}</td>
                    <td><button class="btn btn-sm btn-primary btn-add">추가</button></td>
                `;
                const addHandler = () => {
                    this.addToCart({ ...item, ...v, quantity: 1 });
                    this.detailModal.hide();
                };
                tr.querySelector('.btn-add').onclick = addHandler;
                tr.ondblclick = addHandler;
                tbody.appendChild(tr);
            });
        } catch (e) { tbody.innerHTML = '<tr><td colspan="6">오류 발생</td></tr>'; }
    }

    async showRefundRecords(item) {
        const title = this.dom.recordsModalEl.querySelector('#records-modal-title');
        const tbody = this.dom.recordsModalEl.querySelector('#records-modal-tbody');
        title.textContent = `판매 기록: ${item.product_number} (${item.color})`;
        tbody.innerHTML = '<tr><td colspan="8">조회중...</td></tr>';
        this.recordsModal.show();

        try {
            const data = await Flowork.post(this.urls.getRefundRecords, {
                product_number: item.product_number,
                color: item.color,
                start_date: this.dom.refundStart.value,
                end_date: this.dom.refundEnd.value
            });

            tbody.innerHTML = '';
            if (data.records.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8">기록 없음</td></tr>';
                return;
            }

            data.records.forEach(rec => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.innerHTML = `
                    <td>${rec.sale_date}</td>
                    <td>${rec.receipt_number}</td>
                    <td>${rec.product_number}</td>
                    <td>${rec.product_name}</td>
                    <td>${rec.color}</td>
                    <td>${rec.size}</td>
                    <td>${rec.quantity}</td>
                    <td class="text-end">${Flowork.fmtNum(rec.total_amount)}</td>
                `;
                tr.onclick = async () => {
                    await this.loadRefundCart(rec.sale_id, rec.receipt_number);
                    this.recordsModal.hide();
                };
                tbody.appendChild(tr);
            });
        } catch (e) { tbody.innerHTML = '<tr><td colspan="8">오류 발생</td></tr>'; }
    }

    async loadRefundCart(saleId, receiptNumber) {
        try {
            const url = this.urls.saleDetails.replace('999999', saleId);
            const data = await Flowork.get(url);
            
            if (data.status === 'success') {
                this.refundSaleId = saleId;
                this.dom.refundInfo.textContent = receiptNumber;
                this.cart = data.items.map(i => ({
                    variant_id: i.variant_id,
                    product_name: i.name,
                    product_number: i.pn,
                    color: i.color,
                    size: i.size,
                    original_price: i.original_price || i.price,
                    sale_price: i.price,
                    discount_amount: i.discount_amount,
                    quantity: i.quantity
                }));
                this.renderCart();
            }
        } catch (e) { alert('불러오기 실패'); }
    }

    addToCart(item) {
        const existing = this.cart.find(c => c.variant_id === item.variant_id);
        if (existing) existing.quantity++;
        else {
            this.cart.push({
                variant_id: item.variant_id,
                product_name: item.product_name,
                product_number: item.product_number,
                color: item.color,
                size: item.size,
                original_price: item.original_price,
                sale_price: item.sale_price,
                discount_amount: 0,
                quantity: 1
            });
        }
        this.renderCart();
    }

    renderCart() {
        const tbody = this.dom.cartTbody;
        tbody.innerHTML = '';
        let totalQty = 0;
        let totalAmt = 0;

        this.cart.forEach((item, idx) => {
            const org = item.original_price || item.sale_price;
            const sale = item.sale_price;
            let discountRate = (org > 0 && org > sale) ? Math.round((1 - (sale / org)) * 100) : 0;
            
            const unit = sale - item.discount_amount;
            const sub = unit * item.quantity;
            
            totalQty += item.quantity;
            totalAmt += sub;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td class="text-start">
                    <strong>${item.product_name}</strong><br>
                    <small class="text-muted">${item.product_number}</small>
                </td>
                <td>${item.color} / ${item.size}</td>
                <td class="text-end text-muted text-decoration-line-through small">${Flowork.fmtNum(org)}</td>
                <td class="text-end fw-bold">${Flowork.fmtNum(sale)}</td>
                <td><span class="badge bg-secondary">${discountRate}%</span></td>
                <td><input type="number" class="form-control form-control-sm cart-input disc-in" value="${item.discount_amount}" min="0" data-idx="${idx}"></td>
                <td><input type="number" class="form-control form-control-sm cart-input qty-in" value="${item.quantity}" min="1" data-idx="${idx}"></td>
                <td><button class="btn btn-sm btn-outline-danger btn-del" data-idx="${idx}">&times;</button></td>
            `;
            tbody.appendChild(tr);
        });

        this.dom.totalQty.textContent = Flowork.fmtNum(totalQty);
        this.dom.totalAmt.textContent = Flowork.fmtNum(totalAmt);

        tbody.querySelectorAll('.qty-in').forEach(el => {
            el.onchange = (e) => {
                const v = parseInt(e.target.value);
                if (v > 0) { this.cart[e.target.dataset.idx].quantity = v; this.renderCart(); }
            };
        });
        tbody.querySelectorAll('.disc-in').forEach(el => {
            el.onchange = (e) => {
                const v = parseInt(e.target.value);
                if (v >= 0) { this.cart[e.target.dataset.idx].discount_amount = v; this.renderCart(); }
            };
        });
        tbody.querySelectorAll('.btn-del').forEach(el => {
            el.onclick = (e) => {
                this.cart.splice(e.target.dataset.idx, 1);
                this.renderCart();
            };
        });
    }

    toggleHold() {
        const btn = this.dom.btnHold;
        if (this.heldCart) {
            if (confirm('보류된 판매 목록을 복원하시겠습니까?')) {
                this.cart = JSON.parse(this.heldCart);
                this.heldCart = null;
                btn.innerHTML = '<i class="bi bi-pause-circle"></i> 판매보류';
                btn.classList.replace('btn-danger', 'btn-warning');
                this.renderCart();
            }
        } else {
            if (this.cart.length === 0) return alert('상품이 없습니다.');
            this.heldCart = JSON.stringify(this.cart);
            this.cart = [];
            btn.innerHTML = '<i class="bi bi-play-circle"></i> 보류중 (복원)';
            btn.classList.replace('btn-warning', 'btn-danger');
            this.renderCart();
        }
    }

    applyAutoDiscount() {
        if (this.cart.length === 0) return alert('상품이 없습니다.');
        const currentTotal = this.cart.reduce((sum, i) => sum + (i.sale_price * i.quantity), 0);
        
        let rule = null;
        if (this.config.amount_discounts) {
            rule = this.config.amount_discounts.sort((a, b) => b.limit - a.limit).find(r => currentTotal >= r.limit);
        }

        if (rule) {
            alert(`${Flowork.fmtNum(rule.limit)}원 이상: ${Flowork.fmtNum(rule.discount)}원 할인 적용`);
            this.cart[0].discount_amount += rule.discount;
            this.renderCart();
        } else {
            alert('적용 가능한 할인 규칙이 없습니다.');
        }
    }

    async submitSale() {
        if (this.cart.length === 0) return alert('상품이 없습니다.');
        if (!confirm('판매를 등록하시겠습니까?')) return;

        try {
            const payload = {
                items: this.cart.map(i => ({
                    variant_id: i.variant_id,
                    quantity: i.quantity,
                    price: i.sale_price,
                    discount_amount: i.discount_amount
                })),
                sale_date: this.dom.saleDate.value,
                is_online: this.isOnline
            };

            const res = await Flowork.post(this.urls.submitSales, payload);
            if (res.status === 'success') {
                alert('판매 등록 완료');
                this.cart = []; 
                this.renderCart();
            } else {
                alert('오류: ' + res.message);
            }
        } catch (e) { alert('등록 실패'); }
    }

    async submitRefund() {
        if (!this.refundSaleId) return alert('환불할 영수증을 선택하세요.');
        if (!confirm('전체 환불 처리하시겠습니까?')) return;

        try {
            const url = this.urls.refund.replace('999999', this.refundSaleId);
            const res = await Flowork.post(url, {});
            if (res.status === 'success') {
                alert('환불 완료');
                this.resetRefund();
            } else {
                alert(res.message);
            }
        } catch (e) { alert('오류 발생'); }
    }

    resetRefund() {
        this.refundSaleId = null;
        this.dom.refundInfo.textContent = '선택되지 않음';
        this.cart = [];
        this.renderCart();
    }
}

window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['sales'] = new SalesApp();