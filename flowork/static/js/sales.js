document.addEventListener('DOMContentLoaded', () => {
    const urls = JSON.parse(document.body.dataset.apiUrls);
    
    // State
    let cart = []; 
    let heldCart = null;
    let isOnline = false;
    let salesConfig = { amount_discounts: [] };
    let currentRefundSaleId = null;
    let currentRefundPage = 1;

    // DOM Elements
    const dom = {
        dateInput: document.getElementById('sale-date'),
        modeSalesBtn: document.getElementById('mode-sales'),
        modeRefundBtn: document.getElementById('mode-refund'),
        salesInput: document.getElementById('sales-input'),
        cartTbody: document.getElementById('cart-tbody'),
        totalAmount: document.getElementById('total-amount'),
        searchResults: document.getElementById('search-results'),
        onlineBadge: document.getElementById('online-badge'),
        
        refundSearchInput: document.getElementById('refund-search-input'),
        refundHistoryList: document.getElementById('refund-history-list'),
        refundTargetInfo: document.getElementById('refund-target-info'),
        pagination: document.getElementById('history-pagination'),
        
        btnSubmit: document.getElementById('btn-submit-sale'),
        btnHold: document.getElementById('btn-hold-sale'),
        btnNew: document.getElementById('btn-new-sale'),
        btnDiscount: document.getElementById('btn-apply-discount'),
        btnOnline: document.getElementById('btn-toggle-online'),
        btnRefundOnly: document.getElementById('btn-refund-only'),
        btnRefundRewrite: document.getElementById('btn-refund-rewrite'),
        btnRefundCancel: document.getElementById('btn-refund-cancel'),

        productModalEl: document.getElementById('product-modal'),
        modalTitle: document.getElementById('modal-product-title'),
        modalTbody: document.getElementById('modal-variants-tbody'),
        
        recordModalEl: document.getElementById('record-modal'),
        recordDatePicker: document.getElementById('record-lookup-date'),
        recordTbody: document.getElementById('record-lookup-tbody')
    };

    const productModal = new bootstrap.Modal(dom.productModalEl);
    const recordModal = new bootstrap.Modal(dom.recordModalEl);
    const settingsModal = new bootstrap.Modal(document.getElementById('settings-modal'));

    dom.dateInput.valueAsDate = new Date();
    loadSettings();

    // Mode Switching
    dom.modeSalesBtn.addEventListener('change', () => switchMode('sales'));
    dom.modeRefundBtn.addEventListener('change', () => switchMode('refund'));

    function switchMode(mode) {
        if (mode === 'sales') {
            document.body.classList.remove('mode-refund');
            resetRefundUI();
        } else {
            document.body.classList.add('mode-refund');
            cart = []; renderCart();
        }
    }

    // Sales Logic
    let debounceTimer;

    dom.salesInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);
        if (!query) { dom.searchResults.style.display = 'none'; return; }
        debounceTimer = setTimeout(() => performSearch(query), 300);
    });

    dom.salesInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = dom.salesInput.value.trim();
            if (!q) return;
            clearTimeout(debounceTimer); 
            
            try {
                const res = await fetch(urls.fetchVariant, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ barcode: q })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    addToCart({
                        variant_id: data.variant_id,
                        name: data.product_name,
                        pn: data.product_number,
                        color: data.color,
                        size: data.size,
                        price: data.sale_price,
                        discount_amount: 0,
                        quantity: 1
                    });
                    dom.salesInput.value = '';
                    dom.searchResults.style.display = 'none';
                } else {
                    performSearch(q);
                }
            } catch (err) { 
                console.error(err);
                performSearch(q);
            }
        }
    });

    async function performSearch(query) {
        try {
            const res = await fetch(urls.liveSearch, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, category: '전체' })
            });
            const data = await res.json();
            if (data.status === 'success' && data.products.length > 0) {
                renderSearchResults(data.products);
            } else {
                dom.searchResults.style.display = 'none';
            }
        } catch (error) { console.error(error); }
    }

    function renderSearchResults(products) {
        dom.searchResults.innerHTML = '';
        products.forEach(p => {
            const item = document.createElement('a');
            item.className = 'list-group-item list-group-item-action';
            item.href = '#';
            item.innerHTML = `<div class="d-flex justify-content-between align-items-center"><div><strong>${p.product_name}</strong><br><small class="text-muted">${p.product_number}</small></div><span class="badge bg-light text-dark">${p.sale_price}</span></div>`;
            item.addEventListener('click', (e) => {
                e.preventDefault();
                openProductModal(p.product_id);
                dom.searchResults.style.display = 'none';
                dom.salesInput.value = '';
            });
            dom.searchResults.appendChild(item);
        });
        dom.searchResults.style.display = 'block';
    }

    async function openProductModal(productId) {
        try {
            const res = await fetch(urls.productVariants, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: productId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                dom.modalTitle.textContent = `${data.product_name} (${data.product_number})`;
                renderModalVariants(data.variants, data.product_name, data.product_number);
                productModal.show();
            }
        } catch (err) { alert('상품 정보를 불러오는데 실패했습니다.'); }
    }

    function renderModalVariants(variants, pName, pNum) {
        dom.modalTbody.innerHTML = '';
        variants.forEach(v => {
            const tr = document.createElement('tr');
            tr.className = 'variant-row';
            tr.innerHTML = `<td>${v.color}</td><td>${v.size}</td><td>${v.price.toLocaleString()}원</td><td class="${v.stock <= 0 ? 'text-danger' : ''}">${v.stock}</td><td><button class="btn btn-sm btn-primary btn-add">선택</button></td>`;
            
            const addItem = () => {
                addToCart({ variant_id: v.variant_id, name: pName, pn: pNum, color: v.color, size: v.size, price: v.price, discount_amount: 0, quantity: 1 });
            };
            tr.addEventListener('dblclick', addItem);
            tr.querySelector('.btn-add').addEventListener('click', addItem);
            dom.modalTbody.appendChild(tr);
        });
    }

    function addToCart(item) {
        const existing = cart.find(c => c.variant_id === item.variant_id);
        if (existing) existing.quantity++;
        else cart.push(item);
        renderCart();
    }

    function renderCart() {
        dom.cartTbody.innerHTML = '';
        let total = 0;
        cart.forEach((item, idx) => {
            const unitPrice = item.price - item.discount_amount;
            const subtotal = unitPrice * item.quantity;
            total += subtotal;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${idx + 1}</td><td class="text-start"><strong>${item.name}</strong><br><small>${item.pn}</small></td><td>${item.color} / ${item.size}</td><td>${item.price.toLocaleString()}</td><td><span class="text-danger">${item.discount_amount > 0 ? '-' + item.discount_amount : ''}</span></td><td><input type="number" class="form-control form-control-sm qty-input" value="${item.quantity}" min="1" data-idx="${idx}"></td><td class="fw-bold">${subtotal.toLocaleString()}</td><td><button class="btn btn-sm btn-outline-danger btn-del" data-idx="${idx}">&times;</button></td>`;
            dom.cartTbody.appendChild(tr);
        });
        dom.totalAmount.textContent = total.toLocaleString();
        
        dom.cartTbody.querySelectorAll('.qty-input').forEach(el => {
            el.addEventListener('change', (e) => {
                const i = e.target.dataset.idx;
                const val = parseInt(e.target.value);
                if (val > 0) { cart[i].quantity = val; renderCart(); }
            });
        });
        dom.cartTbody.querySelectorAll('.btn-del').forEach(el => {
            el.addEventListener('click', (e) => {
                cart.splice(e.target.dataset.idx, 1);
                renderCart();
            });
        });
    }

    // Actions
    dom.btnHold.addEventListener('click', () => {
        if (heldCart) {
            if (confirm('복원하시겠습니까?')) {
                cart = JSON.parse(heldCart);
                heldCart = null;
                dom.btnHold.textContent = '판매보류';
                dom.btnHold.classList.remove('btn-danger');
                dom.btnHold.classList.add('btn-warning');
                renderCart();
            }
        } else {
            if (cart.length === 0) return alert('보류할 상품이 없습니다.');
            heldCart = JSON.stringify(cart);
            cart = [];
            dom.btnHold.textContent = '보류중 (복원)';
            dom.btnHold.classList.remove('btn-warning');
            dom.btnHold.classList.add('btn-danger');
            renderCart();
        }
    });

    dom.btnNew.addEventListener('click', () => { if (confirm('초기화?')) { cart = []; renderCart(); } });

    dom.btnOnline.addEventListener('click', () => {
        isOnline = !isOnline;
        dom.onlineBadge.style.display = isOnline ? 'inline-block' : 'none';
        dom.btnOnline.classList.toggle('active');
    });

    dom.btnDiscount.addEventListener('click', () => {
        let currentTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        let appliedRule = null;
        if (salesConfig.amount_discounts) {
            const rules = salesConfig.amount_discounts.sort((a, b) => b.limit - a.limit);
            for (const rule of rules) { if (currentTotal >= rule.limit) { appliedRule = rule; break; } }
        }
        if (appliedRule) {
            alert(`${appliedRule.limit}원이상 ${appliedRule.discount}원 할인`);
            if (cart.length > 0) { cart[0].discount_amount += appliedRule.discount; renderCart(); }
        } else alert('할인 없음');
    });

    dom.btnSubmit.addEventListener('click', async () => {
        if (cart.length === 0) return alert('상품 없음');
        if (!confirm('등록하시겠습니까?')) return;
        dom.btnSubmit.disabled = true;
        try {
            const res = await fetch(urls.submitSales, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ items: cart, sale_date: dom.dateInput.value, is_online: isOnline })
            });
            const data = await res.json();
            if (data.status === 'success') { alert(data.message); cart = []; renderCart(); }
            else alert(data.message);
        } catch (e) { alert('오류'); } finally { dom.btnSubmit.disabled = false; }
    });

    // Refund Logic
    document.getElementById('btn-refund-search').addEventListener('click', () => { currentRefundPage = 1; searchRefundHistory(); });

    async function searchRefundHistory() {
        const q = dom.refundSearchInput.value.trim();
        if (!q) return;
        const res = await fetch(urls.searchHistory, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: q, page: currentRefundPage })
        });
        const data = await res.json();
        renderRefundHistory(data.results);
    }

    function renderRefundHistory(list) {
        dom.refundHistoryList.innerHTML = '';
        if (list.length === 0) { dom.refundHistoryList.innerHTML = '<div class="p-3 text-center text-muted">없음</div>'; return; }
        list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'p-2 border-bottom history-list-item';
            div.innerHTML = `<div class="d-flex justify-content-between"><strong>${item.receipt_number}</strong><span class="badge ${item.status === 'valid' ? 'bg-success' : 'bg-secondary'}">${item.status}</span></div><div class="small">${item.date}</div><div class="small text-muted">${item.product_info}</div>`;
            div.addEventListener('click', async () => {
                currentRefundSaleId = item.sale_id;
                dom.refundTargetInfo.textContent = item.receipt_number;
                const res = await fetch(urls.saleDetails.replace('999999', item.sale_id));
                const details = await res.json();
                if (details.status === 'success') {
                    cart = details.items.map(i => ({...i, price: i.price, discount_amount: i.discount_amount || 0}));
                    renderCart();
                }
            });
            dom.refundHistoryList.appendChild(div);
        });
    }

    dom.btnRefundOnly.addEventListener('click', async () => {
        if (!currentRefundSaleId) return;
        if (!confirm('환불?')) return;
        await processRefund(currentRefundSaleId);
        resetRefundUI();
    });

    dom.btnRefundRewrite.addEventListener('click', async () => {
        if (!currentRefundSaleId) return;
        if (!confirm('환불 후 재등록?')) return;
        const success = await processRefund(currentRefundSaleId);
        if (success) {
            alert('환불완료. 재등록하세요.');
            dom.modeSalesBtn.click();
        }
    });

    dom.btnRefundCancel.addEventListener('click', resetRefundUI);

    async function processRefund(id) {
        try {
            const res = await fetch(urls.refund.replace('999999', id), {method: 'POST'});
            const data = await res.json();
            if (data.status === 'success') return true;
            else { alert(data.message); return false; }
        } catch (e) { return false; }
    }

    function resetRefundUI() {
        currentRefundSaleId = null;
        cart = []; renderCart();
        dom.refundTargetInfo.textContent = '없음';
        dom.refundHistoryList.innerHTML = '';
        dom.refundSearchInput.value = '';
    }

    async function loadSettings() {
        try {
            const res = await fetch(urls.settings);
            const data = await res.json();
            if (data.status === 'success') salesConfig = data.config;
        } catch (e) {}
    }
    
    document.getElementById('btn-view-records').addEventListener('click', () => {
        dom.recordDatePicker.valueAsDate = new Date();
        loadDailyRecords();
        recordModal.show();
    });
    
    dom.recordDatePicker.addEventListener('change', loadDailyRecords);

    async function loadDailyRecords() {
        const dateStr = dom.recordDatePicker.value;
        if (!dateStr) return;
        try {
            const res = await fetch(`${urls.listSales}?date=${dateStr}`);
            const data = await res.json();
            dom.recordTbody.innerHTML = '';
            if (data.status === 'success' && data.sales.length > 0) {
                data.sales.forEach(s => {
                    const tr = document.createElement('tr');
                    const statusBadge = s.status === 'refunded' ? '<span class="badge bg-danger">환불</span>' : '<span class="badge bg-success">정상</span>';
                    tr.innerHTML = `<td>${s.receipt_number}</td><td>${s.time}</td><td class="text-truncate" style="max-width: 200px;">${s.items_summary}</td><td class="text-end">${s.total_amount.toLocaleString()}</td><td class="text-center">${statusBadge}</td>`;
                    dom.recordTbody.appendChild(tr);
                });
            } else {
                dom.recordTbody.innerHTML = '<tr><td colspan="5" class="text-center p-3 text-muted">내역이 없습니다.</td></tr>';
            }
        } catch (e) { console.error(e); }
    }

    document.getElementById('btn-export-daily').addEventListener('click', () => {
        const date = dom.dateInput.value;
        window.location.href = `${urls.exportDaily}?date=${date}`;
    });
    
    document.getElementById('btn-save-settings').addEventListener('click', async () => {
        await loadSettings();
        settingsModal.hide();
    });
});