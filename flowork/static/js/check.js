class CheckApp {
    constructor() {
        this.container = null;
        this.isScanning = false;
        this.scanList = {}; // 탭별 독립된 스캔 목록
        this.targetStoreId = null;
        this.alertTimeout = null;
        this.handlers = {};
    }

    init(container) {
        this.container = container;
        
        // DOM 캐싱 (Scoped)
        this.dom = {
            barcodeInput: container.querySelector('#barcode-input'),
            toggleBtn: container.querySelector('#toggle-scan-btn'),
            scanTableBody: container.querySelector('#scan-table-body'),
            scanStatusAlert: container.querySelector('#scan-status-alert'),
            scanStatusMessage: container.querySelector('#scan-status-message'),
            scanTotalStatus: container.querySelector('#scan-total-status'),
            clearBtn: container.querySelector('#clear-scan-btn'),
            submitBtn: container.querySelector('#submit-scan-btn'),
            targetStoreSelect: container.querySelector('#target_store_select'),
            exportBtn: container.querySelector('#btn-export-excel'),
            resetHiddenInput: container.querySelector('#reset_target_store_id'),
            resetForm: container.querySelector('#form-reset-stock')
        };

        this.urls = {
            fetchVariant: document.body.dataset.apiFetchVariantUrl || '/api/fetch_variant',
            updateActual: document.body.dataset.bulkUpdateActualStockUrl || '/bulk_update_actual_stock'
        };

        // 초기 상태 설정
        if(this.dom.scanStatusAlert) this.dom.scanStatusAlert.style.display = 'none';
        
        // 매장 선택 로직 초기화
        if (this.dom.targetStoreSelect) {
            this.targetStoreId = this.dom.targetStoreSelect.value;
            this.updateUiForStore(this.targetStoreId);
        } else {
            this.targetStoreId = null; // 매장 관리자는 서버 세션 store_id 사용
        }

        this.bindEvents();
    }

    destroy() {
        if(this.dom.toggleBtn) this.dom.toggleBtn.removeEventListener('click', this.handlers.toggleScan);
        if(this.dom.barcodeInput) this.dom.barcodeInput.removeEventListener('keydown', this.handlers.barcodeKey);
        if(this.dom.clearBtn) this.dom.clearBtn.removeEventListener('click', this.handlers.clearList);
        if(this.dom.submitBtn) this.dom.submitBtn.removeEventListener('click', this.handlers.submit);
        if(this.dom.targetStoreSelect) this.dom.targetStoreSelect.removeEventListener('change', this.handlers.storeChange);
        if(this.dom.resetForm) this.dom.resetForm.removeEventListener('submit', this.handlers.resetSubmit);
        if(this.dom.scanTableBody) this.dom.scanTableBody.removeEventListener('change', this.handlers.qtyChange);

        clearTimeout(this.alertTimeout);
        this.container = null;
        this.dom = {};
        this.scanList = {};
    }

    bindEvents() {
        this.handlers = {
            toggleScan: () => this.toggleScanner(),
            barcodeKey: (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const code = this.dom.barcodeInput.value.trim();
                    if(code) this.processBarcode(code);
                    this.dom.barcodeInput.value = '';
                }
            },
            clearList: () => {
                if (confirm('스캔 목록을 초기화하시겠습니까?')) this.clearScanList();
            },
            submit: () => this.submitScan(),
            storeChange: () => {
                this.targetStoreId = this.dom.targetStoreSelect.value;
                this.updateUiForStore(this.targetStoreId);
                if (Object.keys(this.scanList).length > 0) {
                    if (confirm('매장이 변경되어 현재 스캔 목록을 초기화합니다.')) this.clearScanList();
                }
            },
            resetSubmit: (e) => {
                if (this.dom.targetStoreSelect && !this.dom.resetHiddenInput.value) {
                    e.preventDefault();
                    alert('초기화할 매장을 선택해주세요.');
                }
            },
            qtyChange: (e) => {
                if(e.target.classList.contains('qty-input')) {
                    const bc = e.target.dataset.barcode;
                    const newQty = parseInt(e.target.value);
                    if(this.scanList[bc] && newQty >= 0) {
                        this.scanList[bc].scan_quantity = newQty;
                        this.renderTable();
                    }
                }
            }
        };

        if(this.dom.toggleBtn) this.dom.toggleBtn.addEventListener('click', this.handlers.toggleScan);
        if(this.dom.barcodeInput) this.dom.barcodeInput.addEventListener('keydown', this.handlers.barcodeKey);
        if(this.dom.clearBtn) this.dom.clearBtn.addEventListener('click', this.handlers.clearList);
        if(this.dom.submitBtn) this.dom.submitBtn.addEventListener('click', this.handlers.submit);
        if(this.dom.targetStoreSelect) this.dom.targetStoreSelect.addEventListener('change', this.handlers.storeChange);
        if(this.dom.resetForm) this.dom.resetForm.addEventListener('submit', this.handlers.resetSubmit);
        // 이벤트 위임 for qty inputs
        if(this.dom.scanTableBody) this.dom.scanTableBody.addEventListener('change', this.handlers.qtyChange);
    }

    updateUiForStore(storeId) {
        if (this.dom.exportBtn) {
            const originalHref = this.dom.exportBtn.getAttribute('href').split('?')[0];
            this.dom.exportBtn.setAttribute('href', storeId ? `${originalHref}?target_store_id=${storeId}` : originalHref);
        }
        if (this.dom.resetHiddenInput) {
            this.dom.resetHiddenInput.value = storeId || '';
        }
    }

    toggleScanner() {
        if (this.dom.targetStoreSelect && !this.targetStoreId) {
            alert('작업할 매장을 먼저 선택해주세요.');
            this.dom.targetStoreSelect.focus();
            return;
        }

        this.isScanning = !this.isScanning;
        const btn = this.dom.toggleBtn;
        const input = this.dom.barcodeInput;

        if (this.isScanning) {
            btn.classList.replace('btn-success', 'btn-danger');
            btn.innerHTML = '<i class="bi bi-power me-1"></i> 리딩 OFF';
            input.disabled = false;
            input.placeholder = "바코드를 스캔하세요...";
            input.focus();
        } else {
            btn.classList.replace('btn-danger', 'btn-success');
            btn.innerHTML = '<i class="bi bi-power me-1"></i> 리딩 ON';
            input.disabled = true;
            input.placeholder = "리딩 OFF 상태...";
            input.value = '';
        }
    }

    async processBarcode(barcode) {
        try {
            const response = await fetch(this.urls.fetchVariant, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': Flowork.getCsrfToken()
                },
                body: JSON.stringify({ 
                    barcode: barcode,
                    target_store_id: this.targetStoreId 
                })
            });

            const data = await response.json();

            if (response.ok && data.status === 'success') {
                this.addToList(data);
                this.showStatus(`스캔 성공: ${data.product_name} (${data.color}/${data.size})`, 'success');
            } else {
                this.showStatus(`오류: ${data.message}`, 'danger');
            }
        } catch (error) {
            console.error('Error:', error);
            this.showStatus('서버 통신 오류 발생', 'danger');
        }
    }

    addToList(data) {
        const key = data.barcode;
        if (this.scanList[key]) {
            this.scanList[key].scan_quantity += 1;
        } else {
            this.scanList[key] = { ...data, scan_quantity: 1 };
        }
        this.renderTable();
    }

    renderTable() {
        this.dom.scanTableBody.innerHTML = '';
        let totalItems = 0;
        let totalQty = 0;
        const items = Object.values(this.scanList).reverse();

        items.forEach(item => {
            const diff = item.scan_quantity - item.store_stock;
            let diffClass = diff > 0 ? 'text-primary fw-bold' : (diff < 0 ? 'text-danger fw-bold' : 'text-success');
            let diffText = diff > 0 ? `+${diff}` : (diff === 0 ? '0 (일치)' : diff);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div class="fw-bold">${item.product_name}</div><div class="small text-muted">${item.product_number}</div></td>
                <td>${item.color}</td>
                <td>${item.size}</td>
                <td>${item.store_stock}</td>
                <td><input type="number" class="form-control form-control-sm qty-input" style="width: 70px;" data-barcode="${item.barcode}" value="${item.scan_quantity}" min="0"></td>
                <td class="${diffClass}">${diffText}</td>
            `;
            this.dom.scanTableBody.appendChild(tr);
            totalItems++;
            totalQty += item.scan_quantity;
        });

        if(this.dom.scanTotalStatus) {
            this.dom.scanTotalStatus.innerHTML = `총 <strong>${totalItems}</strong> 개 품목 (<strong>${totalQty}</strong>개)`;
        }
    }

    clearScanList() {
        this.scanList = {};
        this.renderTable();
        this.showStatus('목록이 초기화되었습니다.', 'info');
        if(this.dom.barcodeInput) this.dom.barcodeInput.focus();
    }

    async submitScan() {
        const items = Object.values(this.scanList);
        if (items.length === 0) return alert('저장할 스캔 내역이 없습니다.');
        if (this.dom.targetStoreSelect && !this.targetStoreId) return alert('작업할 매장이 선택되지 않았습니다.');
        if (!confirm(`총 ${items.length}개 품목의 실사 재고를 반영하시겠습니까?\n(기존 실사 재고를 덮어씁니다)`)) return;

        try {
            const payload = {
                items: items.map(item => ({ barcode: item.barcode, quantity: item.scan_quantity })),
                target_store_id: this.targetStoreId
            };

            const response = await fetch(this.urls.updateActual, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': Flowork.getCsrfToken() },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (response.ok && result.status === 'success') {
                alert(result.message);
                this.clearScanList();
            } else {
                alert(`저장 실패: ${result.message}`);
            }
        } catch (error) { alert('서버 통신 중 오류가 발생했습니다.'); }
    }

    showStatus(msg, type) {
        if(!this.dom.scanStatusMessage) return;
        this.dom.scanStatusMessage.textContent = msg;
        this.dom.scanStatusAlert.className = `alert alert-${type} alert-dismissible fade show`;
        this.dom.scanStatusAlert.style.display = 'block';
        
        clearTimeout(this.alertTimeout);
        this.alertTimeout = setTimeout(() => {
            // this.dom.scanStatusAlert.style.display = 'none'; // UX 선택사항
        }, 3000);
    }
}

window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['check'] = new CheckApp();