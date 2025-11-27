class OrderApp {
    constructor() {
        this.container = null;
        this.dom = {};
        this.urls = {};
        this.data = {};
        this.handlers = {};
    }

    init(container) {
        this.container = container;
        
        this.dom = {
            receptionToggles: container.querySelector('#reception-method-toggles'),
            addressWrapper: container.querySelector('#address-fields-wrapper'),
            addressRequiredText: container.querySelector('#address-required-text'),
            statusSelect: container.querySelector('#order_status'),
            shippingWrapper: container.querySelector('#shipping-fields-wrapper'),
            completionWrapper: container.querySelector('#completion-date-wrapper'),
            completionInput: container.querySelector('#completed_at'),
            btnSearchAddress: container.querySelector('#btn-search-address'),
            pnInput: container.querySelector('#product_number'),
            pNameInput: container.querySelector('#product_name'),
            colorSelect: container.querySelector('#color'),
            sizeSelect: container.querySelector('#size'),
            statusText: container.querySelector('#product-lookup-status'),
            btnSearch: container.querySelector('#btn-product-search'),
            resultsDiv: container.querySelector('#product-search-results'),
            processingBody: container.querySelector('#processing-table-body'),
            btnAddRow: container.querySelector('#btn-add-processing-row'),
            rowTemplate: container.querySelector('#processing-row-template'),
            btnDeleteOrder: container.querySelector('#btn-delete-order'),
            formOrder: container.querySelector('#order-form'),
            formDelete: container.querySelector('#delete-order-form'),
            btnEnableEdit: container.querySelector('#btn-enable-edit')
        };

        const bodyDs = document.body.dataset;
        this.urls = {
            lookup: bodyDs.productLookupUrl || '/api/find_product_details',
            search: bodyDs.productSearchUrl || '/api/order_product_search'
        };
        
        this.data = {
            color: bodyDs.currentColor,
            size: bodyDs.currentSize
        };

        this.bindEvents();
        this.toggleAddressFields();
        this.toggleStatusFields();

        if(this.dom.pnInput && this.dom.pnInput.value) {
            this.fetchProductOptions(this.dom.pnInput.value);
        }
    }

    destroy() {
        if(this.dom.receptionToggles) this.dom.receptionToggles.removeEventListener('change', this.handlers.toggleAddress);
        if(this.dom.statusSelect) this.dom.statusSelect.removeEventListener('change', this.handlers.toggleStatus);
        if(this.dom.btnSearchAddress) this.dom.btnSearchAddress.removeEventListener('click', this.handlers.searchAddress);
        if(this.dom.btnSearch) this.dom.btnSearch.removeEventListener('click', this.handlers.searchProduct);
        if(this.dom.resultsDiv) this.dom.resultsDiv.removeEventListener('click', this.handlers.selectProduct);
        if(this.dom.pnInput) this.dom.pnInput.removeEventListener('keydown', this.handlers.pnKeydown);
        document.removeEventListener('click', this.handlers.closeSearch);
        if(this.dom.btnAddRow) this.dom.btnAddRow.removeEventListener('click', this.handlers.addRow);
        if(this.dom.processingBody) this.dom.processingBody.removeEventListener('click', this.handlers.deleteRow);
        if(this.dom.btnDeleteOrder) this.dom.btnDeleteOrder.removeEventListener('click', this.handlers.deleteOrder);
        if(this.dom.formOrder) this.dom.formOrder.removeEventListener('submit', this.handlers.validate);
        if(this.dom.btnEnableEdit) this.dom.btnEnableEdit.removeEventListener('click', this.handlers.enableEdit);

        this.container = null;
        this.dom = {};
    }

    bindEvents() {
        this.handlers = {
            toggleAddress: () => this.toggleAddressFields(),
            toggleStatus: () => this.toggleStatusFields(),
            searchAddress: () => this.execDaumPostcode(),
            searchProduct: () => this.searchProduct(),
            selectProduct: (e) => {
                const target = e.target.closest('.list-group-item-action');
                if(target) {
                    e.preventDefault();
                    this.selectProduct(target.dataset.pn);
                }
            },
            pnKeydown: (e) => {
                if(e.key === 'Enter') { e.preventDefault(); this.dom.btnSearch.click(); }
            },
            closeSearch: (e) => {
                if(this.dom.pnInput) {
                    const container = this.dom.pnInput.closest('.position-relative');
                    if(container && !container.contains(e.target)) this.dom.resultsDiv.style.display = 'none';
                }
            },
            addRow: () => this.addProcessingRow(),
            deleteRow: (e) => {
                if(e.target.closest('.btn-delete-row')) this.deleteProcessingRow(e.target);
            },
            deleteOrder: () => {
                if(confirm('🚨 경고!\n이 주문 내역을 삭제하시겠습니까?')) this.dom.formDelete.submit();
            },
            validate: (e) => this.validateForm(e),
            enableEdit: (e) => {
                e.preventDefault();
                document.body.dataset.pageMode = 'edit';
                this.container.querySelectorAll('.editable-on-demand').forEach(el => {
                    el.disabled = false; el.readOnly = false;
                });
                this.container.querySelector('#created_at').focus();
            }
        };

        if(this.dom.receptionToggles) this.dom.receptionToggles.addEventListener('change', this.handlers.toggleAddress);
        if(this.dom.statusSelect) this.dom.statusSelect.addEventListener('change', this.handlers.toggleStatus);
        if(this.dom.btnSearchAddress) this.dom.btnSearchAddress.addEventListener('click', this.handlers.searchAddress);
        if(this.dom.btnSearch) this.dom.btnSearch.addEventListener('click', this.handlers.searchProduct);
        if(this.dom.resultsDiv) this.dom.resultsDiv.addEventListener('click', this.handlers.selectProduct);
        if(this.dom.pnInput) this.dom.pnInput.addEventListener('keydown', this.handlers.pnKeydown);
        document.addEventListener('click', this.handlers.closeSearch);
        if(this.dom.btnAddRow) this.dom.btnAddRow.addEventListener('click', this.handlers.addRow);
        if(this.dom.processingBody) this.dom.processingBody.addEventListener('click', this.handlers.deleteRow);
        if(this.dom.btnDeleteOrder) this.dom.btnDeleteOrder.addEventListener('click', this.handlers.deleteOrder);
        if(this.dom.formOrder) this.dom.formOrder.addEventListener('submit', this.handlers.validate);
        if(this.dom.btnEnableEdit) this.dom.btnEnableEdit.addEventListener('click', this.handlers.enableEdit);
    }

    execDaumPostcode() {
        new daum.Postcode({
            oncomplete: (data) => {
                this.container.querySelector('#postcode').value = data.zonecode;
                this.container.querySelector('#address1').value = data.roadAddress || data.jibunAddress;
                this.container.querySelector('#address2').focus();
            }
        }).open();
    }

    toggleAddressFields() {
        if(!this.dom.receptionToggles) return;
        const selected = this.dom.receptionToggles.querySelector('input:checked');
        const isDelivery = selected && selected.value === '택배수령';
        
        this.dom.addressWrapper.style.display = isDelivery ? 'block' : 'none';
        this.dom.addressRequiredText.style.display = isDelivery ? 'block' : 'none';
        this.container.querySelector('#address1').required = isDelivery;
        this.container.querySelector('#address2').required = isDelivery;
    }

    toggleStatusFields() {
        if(!this.dom.statusSelect) return;
        const status = this.dom.statusSelect.value;
        
        this.dom.shippingWrapper.style.display = (status === '택배 발송') ? 'block' : 'none';
        this.dom.completionWrapper.style.display = (status === '완료') ? 'block' : 'none';
        
        if(status === '완료' && !this.dom.completionInput.value) {
            this.dom.completionInput.value = Flowork.fmtDate(new Date());
        }
    }

    async searchProduct() {
        const query = this.dom.pnInput.value.trim();
        if(!query) {
            this.setStatus('검색어를 입력하세요.', true);
            this.dom.resultsDiv.style.display = 'none';
            return;
        }

        this.setStatus('검색 중...', false);
        this.dom.resultsDiv.innerHTML = '<div class="list-group-item">검색 중...</div>';
        this.dom.resultsDiv.style.display = 'block';

        try {
            const data = await Flowork.post(this.urls.search, { query });
            this.dom.resultsDiv.innerHTML = '';
            
            if(data.status === 'success') {
                this.setStatus(`${data.products.length}개 발견`, false);
                data.products.forEach(p => {
                    const html = `<button type="button" class="list-group-item list-group-item-action" data-pn="${p.product_number}">
                        <div class="fw-bold">${p.product_name}</div>
                        <div class="small text-muted">${p.product_number}</div>
                    </button>`;
                    this.dom.resultsDiv.insertAdjacentHTML('beforeend', html);
                });
            } else {
                this.setStatus(data.message, true);
                this.dom.resultsDiv.innerHTML = `<div class="list-group-item text-danger">${data.message}</div>`;
            }
        } catch(e) {
            this.setStatus('오류 발생', true);
            this.dom.resultsDiv.innerHTML = `<div class="list-group-item text-danger">오류 발생</div>`;
        }
    }

    selectProduct(pn) {
        this.dom.pnInput.value = pn;
        this.dom.resultsDiv.style.display = 'none';
        this.fetchProductOptions(pn);
    }

    async fetchProductOptions(pn) {
        if(!pn) return;
        this.setStatus('옵션 조회 중...', false);
        
        try {
            const data = await Flowork.post(this.urls.lookup, { product_number: pn });
            if(data.status === 'success') {
                this.dom.pNameInput.value = data.product_name;
                this.dom.pnInput.value = data.product_number;
                this.setStatus(`상품명: ${data.product_name}`, false);
                
                this.populateSelect(this.dom.colorSelect, data.colors, this.data.color);
                this.populateSelect(this.dom.sizeSelect, data.sizes, this.data.size);
            } else {
                this.setStatus(data.message, true);
            }
        } catch(e) { this.setStatus('조회 오류', true); }
    }

    populateSelect(select, items, currentVal) {
        select.innerHTML = `<option value="">-- 선택 --</option>`;
        items.forEach(i => {
            const selected = (i === currentVal) ? 'selected' : '';
            select.insertAdjacentHTML('beforeend', `<option value="${i}" ${selected}>${i}</option>`);
        });
    }

    setStatus(msg, isError) {
        this.dom.statusText.textContent = msg;
        this.dom.statusText.className = isError ? 'form-text text-danger' : 'form-text';
    }

    addProcessingRow() {
        const clone = this.dom.rowTemplate.content.cloneNode(true);
        this.dom.processingBody.appendChild(clone);
    }

    deleteProcessingRow(btn) {
        if(this.dom.processingBody.querySelectorAll('tr').length > 1) {
            btn.closest('tr').remove();
        } else {
            alert('최소 1개의 처리 내역이 필요합니다.');
        }
    }

    validateForm(e) {
        const selected = this.dom.receptionToggles.querySelector('input:checked');
        if(selected && selected.value === '택배수령') {
            if(!this.container.querySelector('#address1').value) {
                e.preventDefault(); alert('주소를 입력해주세요.'); return;
            }
        }
        
        const selects = this.dom.processingBody.querySelectorAll('select[name="processing_source"]');
        for(let s of selects) {
            if(!s.value) {
                e.preventDefault(); alert('주문처를 선택해주세요.'); s.focus(); return;
            }
        }
    }
}

window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['order'] = new OrderApp();