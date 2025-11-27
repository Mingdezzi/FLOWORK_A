class DetailApp {
    constructor() {
        this.container = null;
        this.csrfToken = null;
        this.dom = {};
        this.handlers = {};
        this.isActualStockEnabled = false;
        
        // 데이터 (기존 전역 변수 대체)
        this.data = {
            hqStockData: {},
            allVariants: [],
            myStoreID: 0,
            productID: 0
        };
    }

    init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        
        const bodyData = document.body.dataset; // 공통 데이터
        
        // 1. [중요] SPA 환경에서 인라인 스크립트가 실행되지 않으므로 수동으로 데이터 로드
        // detail.html 하단에 있는 window.hqStockData 할당 스크립트를 찾아서 실행
        const scripts = container.querySelectorAll('script');
        scripts.forEach(script => {
            if (script.innerText.includes('window.hqStockData')) {
                try {
                    // window.hqStockData = {...} 구문을 실행하여 전역에 할당 유도하거나
                    // 코드를 파싱해서 this.data에 할당. 
                    // 여기서는 기존 템플릿 호환을 위해 eval로 실행 후 데이터를 가져옴.
                    eval(script.innerText);
                    this.data.hqStockData = window.hqStockData || {};
                    this.data.allVariants = window.allVariants || [];
                } catch (e) {
                    console.error('Data script eval error:', e);
                }
            }
        });

        // 템플릿의 body_attrs는 적용되지 않으므로, base_ajax.html의 wrapper에서 데이터를 가져옴
        // (단, 현재 템플릿 구조상 wrapper에 데이터가 없으므로 HTML 파싱 또는 
        //  템플릿 수정 없이 작동하도록 기존 방식(전역변수)과 DOM 데이터 속성 활용)
        
        // .product-info 등 템플릿 내 특정 요소에 데이터가 있다고 가정하거나
        // 이미 렌더링된 DOM에서 정보를 긁어와야 함.
        // detail.html의 {% block body_attrs %} 내용은 SPA 로드시 누락됨.
        // 해결책: DOM 내의 hidden input이나 특정 요소의 dataset을 활용하도록 템플릿 수정이 권장되나,
        // 여기서는 기존 로직 유지를 위해 'DOM 요소 존재 여부'로 판단하거나 안전장치 추가.

        // 임시: body_attrs의 데이터가 없으면 기능이 동작하지 않을 수 있음.
        // --> 실제 구현 시에는 detail.html의 최상위 div에 data-속성을 넣는 수정이 필요함.
        // 현재는 안전하게 null 체크.
        
        // URL 정보 (하드코딩 또는 공통 상수 사용)
        this.urls = {
            updateStock: '/update_stock',
            toggleFavorite: '/toggle_favorite',
            updateActual: '/update_actual_stock',
            updateDetails: '/api/update_product_details'
        };

        this.dom = {
            storeSelector: container.querySelector('#hq-store-selector'),
            variantsTbody: container.querySelector('#variants-tbody'),
            rowTemplate: container.querySelector('#variant-row-template'),
            addRowTemplate: container.querySelector('#add-variant-row-template'),
            toggleActualStockBtn: container.querySelector('#toggle-actual-stock-btn'),
            favButton: container.querySelector('#fav-btn'),
            editProductBtn: container.querySelector('#edit-product-btn'),
            saveProductBtn: container.querySelector('#save-product-btn'),
            cancelEditBtn: container.querySelector('#cancel-edit-btn'),
            deleteProductBtn: container.querySelector('#delete-product-btn'),
            deleteProductForm: container.querySelector('#delete-product-form')
        };

        // DOM에서 ID 추출 (favButton 등에 dataset이 있음)
        if (this.dom.favButton) {
            this.data.productID = this.dom.favButton.dataset.productId;
        }
        // myStoreID는 storeSelector의 selected 값 등으로 추론하거나 전역 변수 활용
        // (로그인 유저 정보는 변경되지 않으므로 base.html의 값 활용 가능하면 좋음)
        // 여기서는 selector의 기본값 활용
        if (this.dom.storeSelector) {
            this.data.myStoreID = parseInt(this.dom.storeSelector.value) || 0;
        }

        this.bindEvents();
        
        // 초기 테이블 렌더링
        let initialStoreId = 0;
        if (this.dom.storeSelector) {
            initialStoreId = parseInt(this.dom.storeSelector.value, 10) || 0;
        } else {
            // selector가 없다면(매장 계정), user store id가 필요함.
            // 임시로 0으로 두고 렌더링 (서버 템플릿에서 이미 그려져 왔을 수도 있음)
        }
        this.renderStockTable(initialStoreId);
    }

    destroy() {
        if (this.dom.storeSelector) this.dom.storeSelector.removeEventListener('change', this.handlers.storeChange);
        if (this.dom.variantsTbody) this.dom.variantsTbody.removeEventListener('click', this.handlers.tbodyClick);
        if (this.dom.toggleActualStockBtn) this.dom.toggleActualStockBtn.removeEventListener('click', this.handlers.toggleActual);
        if (this.dom.favButton) this.dom.favButton.removeEventListener('click', this.handlers.toggleFav);
        if (this.dom.editProductBtn) this.dom.editProductBtn.removeEventListener('click', this.handlers.editMode);
        if (this.dom.cancelEditBtn) this.dom.cancelEditBtn.removeEventListener('click', this.handlers.cancelEdit);
        if (this.dom.saveProductBtn) this.dom.saveProductBtn.removeEventListener('click', this.handlers.saveProduct);
        if (this.dom.deleteProductBtn) this.dom.deleteProductBtn.removeEventListener('click', this.handlers.deleteProduct);

        this.container = null;
        this.dom = {};
        this.handlers = {};
        this.data = {};
    }

    bindEvents() {
        this.handlers = {
            storeChange: () => this.renderStockTable(parseInt(this.dom.storeSelector.value, 10)),
            tbodyClick: (e) => this.handleTableClick(e),
            toggleActual: () => {
                if (!document.body.classList.contains('edit-mode')) this.toggleActualStockMode();
            },
            toggleFav: (e) => this.handleFavorite(e),
            editMode: () => {
                if (confirm('✏️ 상품 정보 수정 모드로 전환합니다.')) {
                    document.body.classList.add('edit-mode');
                    const sid = this.dom.storeSelector ? parseInt(this.dom.storeSelector.value) : 0;
                    this.renderStockTable(sid);
                }
            },
            cancelEdit: () => {
                if (confirm('⚠️ 수정 취소?')) {
                    document.body.classList.remove('edit-mode');
                    const sid = this.dom.storeSelector ? parseInt(this.dom.storeSelector.value) : 0;
                    this.renderStockTable(sid);
                }
            },
            saveProduct: () => this.saveProductDetails(),
            deleteProduct: () => {
                if (confirm('🚨 상품을 삭제하시겠습니까?')) {
                    this.dom.deleteProductForm.submit();
                }
            }
        };

        if (this.dom.storeSelector) this.dom.storeSelector.addEventListener('change', this.handlers.storeChange);
        if (this.dom.variantsTbody) this.dom.variantsTbody.addEventListener('click', this.handlers.tbodyClick);
        if (this.dom.toggleActualStockBtn) this.dom.toggleActualStockBtn.addEventListener('click', this.handlers.toggleActual);
        if (this.dom.favButton) this.dom.favButton.addEventListener('click', this.handlers.toggleFav);
        if (this.dom.editProductBtn) this.dom.editProductBtn.addEventListener('click', this.handlers.editMode);
        if (this.dom.cancelEditBtn) this.dom.cancelEditBtn.addEventListener('click', this.handlers.cancelEdit);
        if (this.dom.saveProductBtn) this.dom.saveProductBtn.addEventListener('click', this.handlers.saveProduct);
        if (this.dom.deleteProductBtn) this.dom.deleteProductBtn.addEventListener('click', this.handlers.deleteProduct);
    }

    renderStockTable(selectedStoreId) {
        if (!this.dom.variantsTbody || !this.dom.rowTemplate || !this.data.allVariants) return;

        this.dom.variantsTbody.innerHTML = '';
        const isMyStore = (selectedStoreId === this.data.myStoreID);

        if (this.dom.toggleActualStockBtn) {
            if (isMyStore) this.dom.toggleActualStockBtn.style.display = 'inline-block';
            else {
                this.dom.toggleActualStockBtn.style.display = 'none';
                if (this.isActualStockEnabled) this.toggleActualStockMode(false);
            }
        }

        this.data.allVariants.forEach(variant => {
            const storeStockData = this.data.hqStockData[selectedStoreId]?.[variant.id] || {};
            const storeQty = storeStockData.quantity || 0;
            const actualQty = storeStockData.actual_stock;
            
            let diffVal = '-';
            let diffClass = 'bg-light text-dark';
            if (actualQty !== null && actualQty !== undefined) {
                const diff = storeQty - actualQty;
                diffVal = diff;
                if (diff > 0) diffClass = 'bg-primary';
                else if (diff < 0) diffClass = 'bg-danger';
                else diffClass = 'bg-secondary';
            }

            const html = this.dom.rowTemplate.innerHTML
                .replace(/__BARCODE__/g, variant.barcode)
                .replace(/__VARIANT_ID__/g, variant.id)
                .replace(/__COLOR__/g, variant.color || '')
                .replace(/__SIZE__/g, variant.size || '')
                .replace(/__STORE_QTY__/g, storeQty)
                .replace(/__STORE_QTY_CLASS__/g, storeQty === 0 ? 'text-danger' : '')
                .replace(/__HQ_QTY__/g, variant.hq_quantity || 0)
                .replace(/__HQ_QTY_CLASS__/g, (variant.hq_quantity || 0) === 0 ? 'text-danger' : 'text-muted')
                .replace(/__ACTUAL_QTY_VAL__/g, (actualQty !== null && actualQty !== undefined) ? actualQty : '')
                .replace(/__DIFF_VAL__/g, diffVal)
                .replace(/__DIFF_CLASS__/g, diffClass)
                .replace(/__SHOW_IF_MY_STORE__/g, isMyStore ? '' : 'd-none')
                .replace(/__SHOW_IF_NOT_MY_STORE__/g, isMyStore ? 'd-none' : '');
            
            this.dom.variantsTbody.insertAdjacentHTML('beforeend', html);
        });

        if (document.body.classList.contains('edit-mode') && this.dom.addRowTemplate) {
            this.dom.variantsTbody.insertAdjacentHTML('beforeend', this.dom.addRowTemplate.innerHTML);
        }
        
        this.updateActualStockInputsState();
    }

    handleTableClick(e) {
        // 재고 증감
        const stockButton = e.target.closest('button.btn-inc, button.btn-dec');
        if (stockButton) {
            const barcode = stockButton.dataset.barcode;
            const change = parseInt(stockButton.dataset.change, 10);
            
            const currentSelectedStoreId = this.dom.storeSelector ? parseInt(this.dom.storeSelector.value) : this.data.myStoreID;
            if (currentSelectedStoreId !== this.data.myStoreID) {
                alert('재고 수정은 \'내 매장\'이 선택된 경우에만 가능합니다.'); return;
            }
            
            if (confirm(`재고를 변경하시겠습니까?`)) {
                this.updateStockOnServer(barcode, change);
            }
        }

        // 실사 재고 저장
        const saveButton = e.target.closest('button.btn-save-actual');
        if (saveButton && !saveButton.disabled) {
            const barcode = saveButton.dataset.barcode;
            const inputElement = this.container.querySelector(`#actual-${barcode}`);
            const val = inputElement.value;
            
            saveButton.disabled = true;
            this.saveActualStock(barcode, val, saveButton, inputElement);
        }

        // 행 추가
        if (e.target.closest('#btn-add-variant')) {
            this.handleAddVariantRow();
        }

        // 행 삭제
        if (e.target.closest('.btn-delete-variant')) {
            if (confirm('이 행을 삭제하시겠습니까?')) {
                const row = e.target.closest('tr');
                if (row.dataset.variantId) {
                    row.style.display = 'none';
                    row.dataset.action = 'delete';
                } else {
                    row.remove();
                }
            }
        }
    }

    updateStockOnServer(barcode, change) {
        fetch(this.urls.updateStock, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken }, 
            body: JSON.stringify({ barcode: barcode, change: change, target_store_id: this.data.myStoreID }) 
        })
        .then(r => r.json()).then(data => {
            if (data.status === 'success') {
                const span = this.container.querySelector(`#stock-${data.barcode}`);
                if(span) {
                    span.textContent = data.new_quantity;
                    span.classList.toggle('text-danger', data.new_quantity === 0);
                }
            } else { alert(data.message); }
        });
    }

    saveActualStock(barcode, actualStock, saveButton, inputElement) {
        fetch(this.urls.updateActual, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken }, 
            body: JSON.stringify({ barcode: barcode, actual_stock: actualStock, target_store_id: this.data.myStoreID }) 
        })
        .then(r => r.json()).then(data => {
            if (data.status === 'success') {
                const diffSpan = this.container.querySelector(`#diff-${barcode}`);
                if(diffSpan) diffSpan.textContent = data.new_stock_diff || '-';
                inputElement.value = data.new_actual_stock;
                saveButton.disabled = true;
                inputElement.disabled = !this.isActualStockEnabled;
            } else {
                 alert(data.message);
                 saveButton.disabled = false;
            }
        });
    }

    toggleActualStockMode(forceState) {
        if (forceState !== undefined) this.isActualStockEnabled = !forceState; // toggle below will flip it back
        
        this.isActualStockEnabled = !this.isActualStockEnabled;
        this.updateActualStockInputsState();
        
        const btn = this.dom.toggleActualStockBtn;
        if (this.isActualStockEnabled) {
            btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> 등록 완료';
            btn.classList.add('active', 'btn-success');
            btn.classList.remove('btn-secondary');
        } else {
            btn.innerHTML = '<i class="bi bi-pencil-square me-1"></i> 실사재고 등록';
            btn.classList.remove('active', 'btn-success');
            btn.classList.add('btn-secondary');
        }
    }

    updateActualStockInputsState() {
        const inputs = this.dom.variantsTbody.querySelectorAll('.actual-stock-input');
        const btns = this.dom.variantsTbody.querySelectorAll('.btn-save-actual');
        
        inputs.forEach(input => {
            input.disabled = !this.isActualStockEnabled;
            // 리스너 중복 방지 체크 후 등록
            if (!input.dataset.spaListener) {
                input.dataset.spaListener = 'true';
                input.addEventListener('input', (e) => {
                    const bc = e.target.dataset.barcode;
                    const btn = this.container.querySelector(`.btn-save-actual[data-barcode="${bc}"]`);
                    if(btn && this.isActualStockEnabled) btn.disabled = false;
                });
            }
        });
        btns.forEach(b => b.disabled = true);
    }

    handleFavorite(e) {
        const btn = e.target.closest('button');
        const pid = btn.dataset.productId;
        btn.disabled = true;
        
        fetch(this.urls.toggleFavorite, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken }, 
            body: JSON.stringify({ product_id: pid }) 
        })
        .then(r => r.json()).then(data => {
             if (data.status === 'success') {
                 if (data.new_favorite_status === 1) {
                     btn.innerHTML = '<i class="bi bi-star-fill me-1"></i> 즐겨찾기 해제';
                     btn.classList.add('btn-warning');
                     btn.classList.remove('btn-outline-secondary');
                 } else {
                     btn.innerHTML = '<i class="bi bi-star me-1"></i> 즐겨찾기 추가';
                     btn.classList.remove('btn-warning');
                     btn.classList.add('btn-outline-secondary');
                 }
             } else { alert(data.message); }
        }).finally(() => { btn.disabled = false; });
    }

    handleAddVariantRow() {
        const addRow = this.container.querySelector('#add-variant-row');
        if(!addRow) return;
        const color = addRow.querySelector('[data-field="new-color"]').value.trim();
        const size = addRow.querySelector('[data-field="new-size"]').value.trim();
        
        if (!color || !size) { alert('입력 필수'); return; }

        const newRow = document.createElement('tr');
        newRow.dataset.action = 'add';
        newRow.innerHTML = `
             <td class="variant-edit-cell"><input type="text" class="form-control form-control-sm variant-edit-input" data-field="color" value="${color}"></td>
             <td class="variant-edit-cell"><input type="text" class="form-control form-control-sm variant-edit-input" data-field="size" value="${size}"></td>
             <td></td><td></td><td></td><td></td>
             <td class="edit-field"><button class="btn btn-danger btn-sm btn-delete-variant"><i class="bi bi-trash-fill"></i></button></td>
        `;
        this.dom.variantsTbody.insertBefore(newRow, addRow);
        
        addRow.querySelector('[data-field="new-color"]').value = '';
        addRow.querySelector('[data-field="new-size"]').value = '';
    }

    async saveProductDetails() {
        if (!confirm('수정 내용을 저장하시겠습니까?')) return;

        const productData = {
            product_id: this.data.productID,
            product_name: this.container.querySelector('#edit-product-name').value,
            release_year: this.container.querySelector('#edit-release-year').value,
            item_category: this.container.querySelector('#edit-item-category').value,
            variants: []
        };
        const op = this.container.querySelector('#edit-original-price-field').value;
        const sp = this.container.querySelector('#edit-sale-price-field').value;

        this.dom.variantsTbody.querySelectorAll('tr[data-variant-id], tr[data-action="add"]').forEach(row => {
            if (row.id === 'add-variant-row' || (row.style.display === 'none' && row.dataset.action !== 'delete')) return;
            
            const action = row.dataset.action || 'update';
            const vid = row.dataset.variantId || null;

            if (action === 'delete') {
                productData.variants.push({ variant_id: vid, action: 'delete' });
            } else {
                productData.variants.push({
                    variant_id: vid,
                    action: action,
                    color: row.querySelector('[data-field="color"]').value,
                    size: row.querySelector('[data-field="size"]').value,
                    original_price: op,
                    sale_price: sp
                });
            }
        });

        const btn = this.dom.saveProductBtn;
        btn.disabled = true;
        
        try {
            const res = await fetch(this.urls.updateDetails, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify(productData)
            });
            const data = await res.json();
            if(data.status === 'success') {
                alert('저장되었습니다.');
                // 현재 탭 리로드
                if(TabManager.activeTabId) {
                    const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                    if(tab) TabManager.loadContent(tab.id, tab.url);
                }
            } else throw new Error(data.message);
        } catch(e) { alert(e.message); btn.disabled = false; }
    }
}

window.PageRegistry = window.PageRegistry || {};
// 모듈 키가 상품 ID에 따라 동적으로 생성될 수 있음 (product_detail_123)
// TabManager에서 init 호출 시 wrapper의 data-page-module 값을 사용함.
// 템플릿(detail.html)에서는 active_page='search'를 넘기지만, 
// base_ajax.html에서 이 값을 data-page-module에 넣음.
// 따라서 detail.html의 active_page를 'product_detail'로 변경하거나,
// search 키를 공유해야 함.
// 여기서는 'search' 키를 공유하지만, index.js의 DashboardApp과 충돌할 수 있음.
// 해결: detail.html 렌더링 시 active_page='product_detail'로 컨텍스트를 넘기도록 
// ui/product.py 수정이 필요함. (JS 파일만 수정하는 범위 내에서는 아래와 같이 처리)

// 임시: 'search' 키를 detailApp이 덮어쓰면 안되므로, 'product_detail'이라는 별도 키 사용 가정.
window.PageRegistry['product_detail'] = new DetailApp();
// 참고: Step 4. 실행 계획에서 ui/product.py의 active_page 값을 'product_detail'로 수정해야 함.