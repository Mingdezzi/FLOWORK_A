class SettingApp {
    constructor() {
        this.container = null;
        this.dom = {};
        this.handlers = {};
        this.urls = {};
        
        // Modal instances
        this.modalStore = null;
        this.modalStaff = null;
    }

    init(container) {
        this.container = container;
        const bodyDs = document.body.dataset;
        
        // API URL 설정 (base.html의 dataset 활용)
        this.urls = {
            setBrand: bodyDs.apiBrandNameSetUrl,
            addStore: bodyDs.apiStoresAddUrl,
            updateStore: bodyDs.apiStoreUpdateUrlPrefix,
            delStore: bodyDs.apiStoreDeleteUrlPrefix,
            approveStore: bodyDs.apiStoreApproveUrlPrefix,
            toggleActive: bodyDs.apiStoreToggleActiveUrlPrefix,
            resetStore: bodyDs.apiStoreResetUrlPrefix,
            addStaff: bodyDs.apiStaffAddUrl,
            updateStaff: bodyDs.apiStaffUpdateUrlPrefix,
            delStaff: bodyDs.apiStaffDeleteUrlPrefix,
            loadSettings: bodyDs.apiLoadSettingsUrl,
            updateSetting: bodyDs.apiSettingUrl
        };

        this.dom = {
            formBrand: container.querySelector('#form-brand-name'),
            btnLoadSettings: container.querySelector('#btn-load-settings'),
            statusLoadSettings: container.querySelector('#load-settings-status'),
            
            formAddStore: container.querySelector('#form-add-store'),
            tableStores: container.querySelector('#all-stores-table'),
            statusAddStore: container.querySelector('#add-store-status'),
            
            formAddStaff: container.querySelector('#form-add-staff'),
            tableStaff: container.querySelector('#all-staff-table'),
            statusAddStaff: container.querySelector('#add-staff-status'),
            
            formCat: container.querySelector('#form-category-config'),
            catContainer: container.querySelector('#cat-buttons-container'),
            btnCatAdd: container.querySelector('#btn-add-cat-row'),
            catStatus: container.querySelector('#category-config-status'),
            
            // Modals (Scoped)
            modalStoreEl: container.querySelector('#edit-store-modal'),
            modalStaffEl: container.querySelector('#edit-staff-modal'),
            
            // Modal Save Buttons
            btnSaveStore: container.querySelector('#btn-save-edit-store'),
            btnSaveStaff: container.querySelector('#btn-save-edit-staff'),
            
            // Backup Selects
            ordersSelect: container.querySelector('#orders_target_store'),
            stockSelect: container.querySelector('#stock_target_store')
        };

        // Initialize Modals
        if (this.dom.modalStoreEl) this.modalStore = new bootstrap.Modal(this.dom.modalStoreEl);
        if (this.dom.modalStaffEl) this.modalStaff = new bootstrap.Modal(this.dom.modalStaffEl);

        this.bindEvents();
        this.initCategoryForm();
        this.initBackupSelects();
    }

    destroy() {
        if(this.dom.formBrand) this.dom.formBrand.removeEventListener('submit', this.handlers.setBrand);
        if(this.dom.btnLoadSettings) this.dom.btnLoadSettings.removeEventListener('click', this.handlers.loadSettings);
        if(this.dom.formAddStore) this.dom.formAddStore.removeEventListener('submit', this.handlers.addStore);
        if(this.dom.tableStores) this.dom.tableStores.removeEventListener('click', this.handlers.storeTableClick);
        if(this.dom.formAddStaff) this.dom.formAddStaff.removeEventListener('submit', this.handlers.addStaff);
        if(this.dom.tableStaff) this.dom.tableStaff.removeEventListener('click', this.handlers.staffTableClick);
        
        if(this.dom.btnCatAdd) this.dom.btnCatAdd.removeEventListener('click', this.handlers.addCatRow);
        if(this.dom.catContainer) this.dom.catContainer.removeEventListener('click', this.handlers.removeCatRow);
        if(this.dom.formCat) this.dom.formCat.removeEventListener('submit', this.handlers.saveCat);
        
        if(this.dom.btnSaveStore) this.dom.btnSaveStore.removeEventListener('click', this.handlers.saveStore);
        if(this.dom.btnSaveStaff) this.dom.btnSaveStaff.removeEventListener('click', this.handlers.saveStaff);
        
        if(this.dom.ordersSelect) this.dom.ordersSelect.removeEventListener('change', this.handlers.updateOrdersHidden);
        if(this.dom.stockSelect) this.dom.stockSelect.removeEventListener('change', this.handlers.updateStockHidden);

        // 모달 백드롭 제거
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bd => bd.remove());

        this.container = null;
        this.dom = {};
        this.handlers = {};
    }

    bindEvents() {
        this.handlers = {
            setBrand: (e) => this.setBrandName(e),
            loadSettings: () => this.loadSettings(),
            addStore: (e) => this.addStore(e),
            storeTableClick: (e) => this.handleStoreTableClick(e),
            addStaff: (e) => this.addStaff(e),
            staffTableClick: (e) => this.handleStaffTableClick(e),
            saveStore: () => this.saveStoreEdit(),
            saveStaff: () => this.saveStaffEdit(),
            addCatRow: () => this.addCategoryRow(),
            removeCatRow: (e) => { if(e.target.closest('.btn-remove-cat')) e.target.closest('.cat-row').remove(); },
            saveCat: (e) => this.saveCategoryConfig(e),
            updateOrdersHidden: () => this.updateHiddenInputs(this.dom.ordersSelect),
            updateStockHidden: () => this.updateHiddenInputs(this.dom.stockSelect)
        };

        if(this.dom.formBrand) this.dom.formBrand.addEventListener('submit', this.handlers.setBrand);
        if(this.dom.btnLoadSettings) this.dom.btnLoadSettings.addEventListener('click', this.handlers.loadSettings);
        if(this.dom.formAddStore) this.dom.formAddStore.addEventListener('submit', this.handlers.addStore);
        if(this.dom.tableStores) this.dom.tableStores.addEventListener('click', this.handlers.storeTableClick);
        if(this.dom.formAddStaff) this.dom.formAddStaff.addEventListener('submit', this.handlers.addStaff);
        if(this.dom.tableStaff) this.dom.tableStaff.addEventListener('click', this.handlers.staffTableClick);
        if(this.dom.btnSaveStore) this.dom.btnSaveStore.addEventListener('click', this.handlers.saveStore);
        if(this.dom.btnSaveStaff) this.dom.btnSaveStaff.addEventListener('click', this.handlers.saveStaff);
        
        if(this.dom.btnCatAdd) this.dom.btnCatAdd.addEventListener('click', this.handlers.addCatRow);
        if(this.dom.catContainer) this.dom.catContainer.addEventListener('click', this.handlers.removeCatRow);
        if(this.dom.formCat) this.dom.formCat.addEventListener('submit', this.handlers.saveCat);
        
        if(this.dom.ordersSelect) this.dom.ordersSelect.addEventListener('change', this.handlers.updateOrdersHidden);
        if(this.dom.stockSelect) this.dom.stockSelect.addEventListener('change', this.handlers.updateStockHidden);
    }

    // --- Logic Methods ---

    async setBrandName(e) {
        e.preventDefault();
        const name = this.container.querySelector('#brand-name-input').value.trim();
        if(!name) return alert('이름 필수');
        
        try {
            const res = await Flowork.post(this.urls.setBrand, { brand_name: name });
            this.container.querySelector('#brand-name-status').innerHTML = `<div class="alert alert-success mt-2">${res.message}</div>`;
        } catch(e) { alert('저장 실패'); }
    }

    async loadSettings() {
        if(!confirm('설정 파일을 로드하시겠습니까?')) return;
        this.dom.btnLoadSettings.disabled = true;
        this.dom.statusLoadSettings.innerHTML = '<div class="alert alert-info">로딩 중...</div>';
        
        try {
            const res = await Flowork.post(this.urls.loadSettings, {});
            this.dom.statusLoadSettings.innerHTML = `<div class="alert alert-success mt-2">${res.message}</div>`;
        } catch(e) {
            this.dom.statusLoadSettings.innerHTML = `<div class="alert alert-danger mt-2">${e.message}</div>`;
        } finally {
            this.dom.btnLoadSettings.disabled = false;
        }
    }

    async addStore(e) {
        e.preventDefault();
        const payload = {
            store_code: this.container.querySelector('#new_store_code').value,
            store_name: this.container.querySelector('#new_store_name').value,
            store_phone: this.container.querySelector('#new_store_phone').value
        };
        
        try {
            const res = await Flowork.post(this.urls.addStore, payload);
            this.dom.statusAddStore.innerHTML = `<div class="alert alert-success">${res.message}</div>`;
            this.refreshTab(); // Reload tab
        } catch(e) {
            this.dom.statusAddStore.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
        }
    }

    handleStoreTableClick(e) {
        const btn = e.target.closest('button');
        if(!btn) return;
        
        const id = btn.dataset.id;
        if(btn.classList.contains('btn-delete-store')) this.deleteStore(id, btn);
        if(btn.classList.contains('btn-edit-store')) this.openStoreModal(btn);
        if(btn.classList.contains('btn-approve-store')) this.approveStore(id);
        if(btn.classList.contains('btn-reset-store')) this.resetStore(id);
        if(btn.classList.contains('btn-toggle-active-store')) this.toggleStoreActive(id);
    }

    async deleteStore(id, btn) {
        if(!confirm('삭제하시겠습니까?')) return;
        try {
            await Flowork.api(`${this.urls.delStore}${id}`, { method: 'DELETE' });
            btn.closest('tr').remove();
        } catch(e) { alert(e.message); }
    }

    openStoreModal(btn) {
        this.container.querySelector('#edit_store_code').value = btn.dataset.code;
        this.container.querySelector('#edit_store_name').value = btn.dataset.name;
        this.container.querySelector('#edit_store_phone').value = btn.dataset.phone;
        this.dom.btnSaveStore.dataset.storeId = btn.dataset.id;
        this.modalStore.show();
    }

    async saveStoreEdit() {
        const id = this.dom.btnSaveStore.dataset.storeId;
        const payload = {
            store_code: this.container.querySelector('#edit_store_code').value,
            store_name: this.container.querySelector('#edit_store_name').value,
            store_phone: this.container.querySelector('#edit_store_phone').value
        };
        try {
            await Flowork.post(`${this.urls.updateStore}${id}`, payload);
            this.modalStore.hide();
            this.refreshTab();
        } catch(e) { alert(e.message); }
    }

    async approveStore(id) {
        if(!confirm('승인하시겠습니까?')) return;
        try { await Flowork.post(`${this.urls.approveStore}${id}`, {}); this.refreshTab(); }
        catch(e) { alert(e.message); }
    }

    async resetStore(id) {
        if(!confirm('초기화하시겠습니까?')) return;
        try { await Flowork.post(`${this.urls.resetStore}${id}`, {}); this.refreshTab(); }
        catch(e) { alert(e.message); }
    }

    async toggleStoreActive(id) {
        if(!confirm('상태 변경?')) return;
        try { await Flowork.post(`${this.urls.toggleActive}${id}`, {}); this.refreshTab(); }
        catch(e) { alert(e.message); }
    }

    async addStaff(e) {
        e.preventDefault();
        const payload = {
            name: this.container.querySelector('#new_staff_name').value,
            position: this.container.querySelector('#new_staff_position').value,
            contact: this.container.querySelector('#new_staff_contact').value
        };
        try {
            await Flowork.post(this.urls.addStaff, payload);
            this.refreshTab();
        } catch(e) { alert(e.message); }
    }

    handleStaffTableClick(e) {
        const btn = e.target.closest('button');
        if(!btn) return;
        if(btn.classList.contains('btn-delete-staff')) this.deleteStaff(btn);
        if(btn.classList.contains('btn-edit-staff')) this.openStaffModal(btn);
    }

    async deleteStaff(btn) {
        if(!confirm('삭제?')) return;
        try {
            await Flowork.api(`${this.urls.delStaff}${btn.dataset.id}`, { method: 'DELETE' });
            btn.closest('tr').remove();
        } catch(e) { alert(e.message); }
    }

    openStaffModal(btn) {
        this.container.querySelector('#edit_staff_name').value = btn.dataset.name;
        this.container.querySelector('#edit_staff_position').value = btn.dataset.position;
        this.container.querySelector('#edit_staff_contact').value = btn.dataset.contact;
        this.dom.btnSaveStaff.dataset.staffId = btn.dataset.id;
        this.modalStaff.show();
    }

    async saveStaffEdit() {
        const id = this.dom.btnSaveStaff.dataset.staffId;
        const payload = {
            name: this.container.querySelector('#edit_staff_name').value,
            position: this.container.querySelector('#edit_staff_position').value,
            contact: this.container.querySelector('#edit_staff_contact').value
        };
        try {
            await Flowork.post(`${this.urls.updateStaff}${id}`, payload);
            this.modalStaff.hide();
            this.refreshTab();
        } catch(e) { alert(e.message); }
    }

    // Category Logic
    initCategoryForm() {
        if(!this.dom.formCat) return;
        // window.initialCategoryConfig는 setting.html의 인라인 스크립트에 있음.
        // SPA에서는 이를 수동으로 실행하거나 데이터를 파싱해야 함.
        let savedConfig = null;
        
        // 1. 인라인 스크립트 실행 시도
        const scripts = this.container.querySelectorAll('script');
        scripts.forEach(s => {
            if (s.innerText.includes('window.initialCategoryConfig')) {
                try { eval(s.innerText); savedConfig = window.initialCategoryConfig; } catch(e) {}
            }
        });

        if (savedConfig) {
            if(savedConfig.columns) this.container.querySelector('#cat-columns').value = savedConfig.columns;
            if(savedConfig.buttons) {
                this.dom.catContainer.innerHTML = '';
                savedConfig.buttons.forEach(b => this.addCategoryRow(b.label, b.value));
            }
        } else {
            if(this.dom.catContainer.children.length === 0) {
                ['전체','신발','의류','용품'].forEach(t => this.addCategoryRow(t, t));
            }
        }
    }

    addCategoryRow(l='', v='') {
        const html = `
            <div class="input-group mb-2 cat-row">
                <span class="input-group-text">라벨</span><input type="text" class="form-control cat-label" value="${l}">
                <span class="input-group-text">값</span><input type="text" class="form-control cat-value" value="${v}">
                <button type="button" class="btn btn-outline-danger btn-remove-cat"><i class="bi bi-x-lg"></i></button>
            </div>`;
        this.dom.catContainer.insertAdjacentHTML('beforeend', html);
    }

    async saveCategoryConfig(e) {
        e.preventDefault();
        const buttons = [];
        this.dom.catContainer.querySelectorAll('.cat-row').forEach(r => {
            const l = r.querySelector('.cat-label').value.trim();
            const v = r.querySelector('.cat-value').value.trim();
            if(l && v) buttons.push({label: l, value: v});
        });
        
        const config = {
            columns: parseInt(this.container.querySelector('#cat-columns').value),
            buttons: buttons
        };
        
        try {
            await Flowork.post(this.urls.updateSetting, { key: 'CATEGORY_CONFIG', value: config });
            this.dom.catStatus.innerHTML = '<div class="alert alert-success mt-2">저장됨</div>';
        } catch(e) {
            this.dom.catStatus.innerHTML = `<div class="alert alert-danger mt-2">${e.message}</div>`;
        }
    }

    // Backup Select Logic
    initBackupSelects() {
        if(this.dom.ordersSelect) this.updateHiddenInputs(this.dom.ordersSelect);
        if(this.dom.stockSelect) this.updateHiddenInputs(this.dom.stockSelect);
    }

    updateHiddenInputs(select) {
        if (!select) return;
        const val = select.value;
        const form = select.closest('.card-body').querySelector('form');
        if (form) {
            const hidden = form.querySelector('.target-store-id-input');
            if(hidden) hidden.value = val;
        }
    }

    refreshTab() {
        if(TabManager.activeTabId) {
            const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
            if(tab) TabManager.loadContent(tab.id, tab.url);
        }
    }
}

window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['setting'] = new SettingApp();