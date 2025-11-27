class OnlineManager {
    constructor() {
        this.container = null;
        this.urls = {};
        this.pagination = {};
        this.currentBatch = JSON.parse(sessionStorage.getItem('currentBatchCodes') || '[]');
        this.pollingInterval = null;
        this.isProcessing = false;
        this.loadedTabs = new Set();
        this.isSearchChanged = false;
        this.dom = {};
        this.handlers = {};
        
        // Modal instances
        this.imgModal = null;
        this.folderModal = null;
    }

    init(container) {
        this.container = container;
        const bodyDs = document.body.dataset;
        // base.html의 data 속성은 SPA에서 그대로 유지됨
        this.urls = {
            list: '/api/product/images',
            process: '/api/product/images/process',
            options: '/api/product/options',
            taskStatus: '/api/task_status/',
            folder: '/api/product/folder/',
            logoUpload: '/api/setting/logo',
            download: '/api/product/download/',
            delete: '/api/product/delete_image_data'
        };

        this.dom = {
            btnStart: container.querySelector('#btn-start-process'),
            btnReset: container.querySelector('#btn-reset-selection'),
            btnClear: container.querySelector('#btn-clear-current-batch'),
            btnSearch: container.querySelector('#btn-search-exec'),
            btnSearchReset: container.querySelector('#btn-search-reset'),
            searchMulti: container.querySelector('#search-multi-codes'),
            searchName: container.querySelector('#search-name'),
            searchYear: container.querySelector('#search-year'),
            searchCat: container.querySelector('#search-category'),
            btnLogo: container.querySelector('#btn-upload-logo'),
            inputLogo: container.querySelector('#logo-file'),
            progBar: container.querySelector('#progress-bar'),
            progText: container.querySelector('#progress-text'),
            progContainer: container.querySelector('#progress-container'),
            // 모달 요소 Scoped 검색
            imgModalEl: container.querySelector('#imagePreviewModal'),
            folderModalEl: container.querySelector('#folderViewModal'),
            tabs: container.querySelectorAll('button[data-bs-toggle="tab"]')
        };

        this.imgModal = new bootstrap.Modal(this.dom.imgModalEl);
        this.folderModal = new bootstrap.Modal(this.dom.folderModalEl);

        this.initHandlers();
        this.bindEvents();
        this.loadUserOptions();

        // 초기 탭 로드
        const activeTab = container.querySelector('.nav-link.active');
        if (activeTab) this.loadTabContent(activeTab);
        
        // 전역 함수 연결 (HTML onclick 대응용 - 지양해야 하지만 템플릿 수정 최소화)
        // SPA에서는 전역 오염을 피해야 하므로, 이벤트 위임 방식으로 변경하는 것이 좋음.
        // renderTable 메서드에서 HTML 생성 시 onclick 대신 class를 주고 위임 처리하도록 수정함.
    }

    destroy() {
        if(this.pollingInterval) clearInterval(this.pollingInterval);
        
        this.dom.tabs.forEach(tab => tab.removeEventListener('shown.bs.tab', this.handlers.tabShown));
        if(this.dom.btnSearch) this.dom.btnSearch.removeEventListener('click', this.handlers.search);
        if(this.dom.btnSearchReset) this.dom.btnSearchReset.removeEventListener('click', this.handlers.searchReset);
        if(this.dom.btnLogo) this.dom.btnLogo.removeEventListener('click', this.handlers.uploadLogo);
        if(this.dom.btnStart) this.dom.btnStart.removeEventListener('click', this.handlers.startProcess);
        if(this.dom.btnReset) this.dom.btnReset.removeEventListener('click', this.handlers.resetSelection);
        if(this.dom.btnClear) this.dom.btnClear.removeEventListener('click', this.handlers.clearBatch);
        
        this.container.removeEventListener('change', this.handlers.delegatedChange);
        this.container.removeEventListener('click', this.handlers.delegatedClick);

        // 모달 백드롭 제거
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bd => bd.remove());

        this.container = null;
        this.dom = {};
        this.handlers = {};
    }

    initHandlers() {
        this.handlers = {
            tabShown: (e) => this.loadTabContent(e.target),
            search: () => this.search(),
            searchReset: () => this.resetSearch(),
            uploadLogo: () => this.uploadLogo(),
            startProcess: () => this.startProcess(),
            resetSelection: () => this.resetSelection(),
            clearBatch: () => {
                if(confirm('현재 작업 목록을 비우시겠습니까?')) {
                    this.currentBatch = [];
                    sessionStorage.setItem('currentBatchCodes', '[]');
                    this.dom.btnClear.style.display = 'none';
                    this.refreshActiveTab('current');
                }
            },
            delegatedChange: (e) => {
                if(e.target.classList.contains('check-all')) {
                    const table = e.target.closest('table');
                    table.querySelectorAll('.item-check:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
                    this.updateBtnState();
                }
                if(e.target.classList.contains('item-check')) this.updateBtnState();
            },
            delegatedClick: (e) => {
                // 동적 생성된 버튼 처리 (이미지보기, 다운로드 등)
                const target = e.target.closest('button, img');
                if(!target) return;
                
                if(target.classList.contains('img-preview')) {
                    this.container.querySelector('#preview-image-target').src = target.src;
                    this.imgModal.show();
                }
                else if(target.classList.contains('btn-download')) { // onclick="downloadImages" 대체
                    window.location.href = `${this.urls.download}${target.dataset.code}`;
                }
                else if(target.classList.contains('btn-folder')) { // onclick="showFolderModal" 대체
                    this.showFolder(target.dataset.code);
                }
                else if(target.classList.contains('btn-delete-img')) { // onclick="deleteImages" 대체
                    this.deleteImages(target.dataset.code);
                }
                else if(target.classList.contains('page-link')) { // Pagination
                    e.preventDefault();
                    if(!target.parentElement.classList.contains('disabled')) {
                        const targetId = target.closest('.tab-pane').id;
                        this.pagination[targetId] = parseInt(target.dataset.page);
                        const tabBtn = this.container.querySelector(`button[data-bs-target="#${targetId}"]`);
                        this.loadedTabs.delete(targetId);
                        this.loadTabContent(tabBtn);
                    }
                }
            }
        };
    }

    bindEvents() {
        this.dom.tabs.forEach(tab => tab.addEventListener('shown.bs.tab', this.handlers.tabShown));
        this.dom.btnSearch.addEventListener('click', this.handlers.search);
        this.dom.btnSearchReset.addEventListener('click', this.handlers.searchReset);
        this.dom.btnLogo.addEventListener('click', this.handlers.uploadLogo);
        this.dom.btnStart.addEventListener('click', this.handlers.startProcess);
        this.dom.btnReset.addEventListener('click', this.handlers.resetSelection);
        if(this.dom.btnClear) this.dom.btnClear.addEventListener('click', this.handlers.clearBatch);
        if(this.currentBatch.length > 0 && this.dom.btnClear) this.dom.btnClear.style.display = 'block';

        this.container.addEventListener('change', this.handlers.delegatedChange);
        this.container.addEventListener('click', this.handlers.delegatedClick);
    }

    async loadUserOptions() {
        try {
            const data = await Flowork.get(this.urls.options);
            if (data.status === 'success' && data.options) {
                const o = data.options;
                const setVal = (sel, val) => { const el = this.container.querySelector(sel); if(el) el.value = val; };
                if(o.padding) setVal('#opt-padding', o.padding);
                if(o.direction) setVal('#opt-direction', o.direction);
                if(o.logo_align) setVal('#opt-logo-align', o.logo_align);
                if(o.bg_color) {
                    setVal('#opt-bgcolor-text', o.bg_color);
                    setVal('#opt-bgcolor-picker', o.bg_color);
                }
            }
        } catch (e) {}
    }

    async uploadLogo() {
        const file = this.dom.inputLogo.files[0];
        if(!file) return alert('파일 선택 필수');
        
        const formData = new FormData();
        formData.append('logo_file', file);
        this.dom.btnLogo.disabled = true;
        
        try {
            await fetch(this.urls.logoUpload, {
                method: 'POST',
                headers: { 'X-CSRFToken': Flowork.getCsrfToken() },
                body: formData
            });
            alert('로고 업로드 성공');
            this.dom.inputLogo.value = '';
        } catch (e) { alert('업로드 실패'); }
        finally { this.dom.btnLogo.disabled = false; }
    }

    loadTabContent(tab) {
        const targetId = tab.dataset.bsTarget.substring(1);
        if (this.loadedTabs.has(targetId) && !this.isSearchChanged) return;

        const type = tab.dataset.tabType;
        const scope = tab.dataset.scope;
        const page = this.pagination[targetId] || 1;
        this.loadData(targetId, type, scope, page);
    }

    refreshActiveTab(scope = null) {
        const sel = scope ? `.nav-link.active[data-scope="${scope}"]` : '.nav-link.active';
        const active = this.container.querySelector(sel);
        if(active) {
            const targetId = active.dataset.bsTarget.substring(1);
            this.loadedTabs.delete(targetId);
            this.loadTabContent(active);
        }
    }

    async loadData(targetId, type, scope, page) {
        const contentDiv = this.container.querySelector(`#${targetId} .table-responsive`);
        if(!contentDiv) return;

        if (scope === 'current' && this.currentBatch.length === 0) {
            contentDiv.innerHTML = '<div class="text-center p-5 text-muted">작업 목록 없음</div>';
            const badge = this.container.querySelector(`#${targetId.replace('tab-', 'cnt-')}`);
            if(badge) badge.textContent = '0';
            return;
        }

        contentDiv.innerHTML = '<div class="text-center p-5">로딩 중...</div>';

        const params = new URLSearchParams({ page, limit: 20, tab: type });
        if (scope === 'history') {
            if(this.dom.searchMulti.value) params.append('multi_codes', this.dom.searchMulti.value);
            if(this.dom.searchName.value) params.append('product_name', this.dom.searchName.value);
            if(this.dom.searchYear.value) params.append('release_year', this.dom.searchYear.value);
            if(this.dom.searchCat.value) params.append('item_category', this.dom.searchCat.value);
        } else {
            params.append('batch_codes', this.currentBatch.join(','));
        }

        try {
            const data = await Flowork.get(`${this.urls.list}?${params.toString()}`);
            if(data.status === 'success') {
                this.renderTable(targetId, data.data);
                this.renderPagination(targetId, data.pagination);
                const badge = this.container.querySelector(`#${targetId.replace('tab-', 'cnt-')}`);
                if(badge) badge.textContent = data.pagination.total_items;
                
                this.loadedTabs.add(targetId);
                this.isSearchChanged = false;
            } else {
                contentDiv.innerHTML = `<div class="text-danger p-5">${data.message}</div>`;
            }
        } catch (e) { contentDiv.innerHTML = '<div class="text-danger p-5">오류 발생</div>'; }
    }

    renderTable(targetId, items) {
        const contentDiv = this.container.querySelector(`#${targetId} .table-responsive`);
        const template = this.container.querySelector('#table-template');
        
        if(!items || items.length === 0) {
            contentDiv.innerHTML = '<div class="text-center p-5 text-muted">데이터 없음</div>';
            return;
        }

        const clone = template.content.cloneNode(true);
        const tbody = clone.querySelector('tbody');

        items.forEach(i => {
            const tr = document.createElement('tr');
            let statusHtml = `<span class="badge bg-secondary">대기</span>`;
            let disabled = '';
            if (i.status === 'PROCESSING') { statusHtml = `<span class="badge bg-primary">진행</span>`; disabled='disabled'; }
            else if (i.status === 'COMPLETED') statusHtml = `<span class="badge bg-success">완료</span>`;
            else if (i.status === 'FAILED') statusHtml = `<span class="badge bg-danger">실패</span>`;

            const thumb = i.thumbnail ? `<img src="${i.thumbnail}" class="img-preview" style="cursor:pointer">` : `<div class="img-placeholder">-</div>`;
            const detail = i.detail ? `<img src="${i.detail}" class="img-preview" style="cursor:pointer">` : `-`;
            const dlBtn = i.status === 'COMPLETED' ? `<button class="btn btn-sm btn-outline-dark btn-download" data-code="${i.style_code}"><i class="bi bi-download"></i></button>` : '';
            
            tr.innerHTML = `
                <td><input type="checkbox" class="item-check form-check-input" value="${i.style_code}" ${disabled}></td>
                <td class="fw-bold">${i.style_code}</td>
                <td class="text-truncate" style="max-width:150px;">${i.product_name}</td>
                <td>${i.total_colors}</td>
                <td>${thumb}</td>
                <td>${detail}</td>
                <td><button class="btn btn-sm btn-outline-info btn-folder" data-code="${i.style_code}"><i class="bi bi-folder"></i></button></td>
                <td>${statusHtml}</td>
                <td><div class="btn-group">${dlBtn}<button class="btn btn-sm btn-outline-danger btn-delete-img" data-code="${i.style_code}"><i class="bi bi-trash"></i></button></div></td>
            `;
            tbody.appendChild(tr);
        });
        contentDiv.innerHTML = '';
        contentDiv.appendChild(clone);
        this.updateBtnState();
    }

    renderPagination(targetId, pg) {
        const container = this.container.querySelector(`#${targetId.replace('tab-', 'page-')}`);
        if(!container || pg.total_pages <= 1) { if(container) container.innerHTML=''; return; }
        
        let html = '<ul class="pagination pagination-sm mb-0">';
        const addPage = (p, txt, cls='') => {
            html += `<li class="page-item ${cls}"><a class="page-link" href="#" data-page="${p}">${txt}</a></li>`;
        };
        addPage(pg.current_page - 1, '«', pg.has_prev ? '' : 'disabled');
        let start = Math.max(1, pg.current_page - 2);
        let end = Math.min(pg.total_pages, start + 4);
        for(let i=start; i<=end; i++) addPage(i, i, i===pg.current_page ? 'active' : '');
        addPage(pg.current_page + 1, '»', pg.has_next ? '' : 'disabled');
        
        container.innerHTML = html + '</ul>';
        // Click handler is delegated in bindEvents (delegatedClick)
    }

    updateBtnState() {
        const cnt = this.container.querySelectorAll('.item-check:checked').length;
        this.dom.btnStart.disabled = cnt === 0;
        this.dom.btnStart.innerHTML = cnt > 0 ? `<i class="bi bi-play-fill"></i> ${cnt}건 시작` : `<i class="bi bi-play-fill"></i> 시작`;
        this.dom.btnReset.disabled = cnt === 0;
    }

    async startProcess() {
        const codes = Array.from(this.container.querySelectorAll('.item-check:checked')).map(c => c.value);
        if(codes.length === 0) return;
        
        const options = {
            padding: this.container.querySelector('#opt-padding').value,
            direction: this.container.querySelector('#opt-direction').value,
            bg_color: this.container.querySelector('#opt-bgcolor-text').value,
            logo_align: this.container.querySelector('#opt-logo-align').value
        };

        if(!confirm(`${codes.length}건 처리 시작?`)) return;
        
        this.dom.btnStart.disabled = true;
        try {
            const res = await Flowork.post(this.urls.process, { style_codes: codes, options });
            if(res.status === 'success') {
                const newBatch = new Set([...this.currentBatch, ...codes]);
                this.currentBatch = Array.from(newBatch);
                sessionStorage.setItem('currentBatchCodes', JSON.stringify(this.currentBatch));
                if(this.dom.btnClear) this.dom.btnClear.style.display = 'block';
                
                this.pollTask(res.task_id);
                
                const tab = this.container.querySelector('button[data-bs-target="#tab-current-processing"]');
                new bootstrap.Tab(tab).show();
                this.refreshActiveTab('current');
            } else alert(res.message);
        } catch(e) { alert('요청 실패'); }
        finally { this.dom.btnStart.disabled = false; }
    }

    pollTask(taskId) {
        if(this.pollingInterval) clearInterval(this.pollingInterval);
        this.dom.progContainer.style.display = 'block';
        this.isProcessing = true;

        this.pollingInterval = setInterval(async () => {
            try {
                const task = await Flowork.get(`${this.urls.taskStatus}${taskId}`);
                if(task.status === 'processing') {
                    const pct = task.percent || 0;
                    this.dom.progBar.style.width = `${pct}%`;
                    this.dom.progText.textContent = `${pct}%`;
                } else {
                    clearInterval(this.pollingInterval);
                    this.isProcessing = false;
                    this.dom.progBar.style.width = '100%';
                    this.dom.progText.textContent = task.status === 'completed' ? '완료' : '오류';
                    setTimeout(() => {
                        this.dom.progContainer.style.display = 'none';
                        this.dom.progBar.style.width = '0%';
                        this.loadedTabs.clear();
                        this.refreshActiveTab();
                    }, 2000);
                }
            } catch(e) { clearInterval(this.pollingInterval); }
        }, 1000);
    }

    async resetSelection() {
        const codes = Array.from(this.container.querySelectorAll('.item-check:checked')).map(c => c.value);
        if(codes.length === 0) return;
        if(!confirm('선택 항목 초기화?')) return;
        
        try {
            await Flowork.post('/api/product/images/reset', { style_codes: codes });
            alert('초기화 완료');
            this.loadedTabs.clear();
            this.refreshActiveTab();
        } catch(e) { alert('오류'); }
    }

    async deleteImages(code) {
        if(!confirm('삭제하시겠습니까?')) return;
        try {
            await Flowork.post(this.urls.delete, { style_codes: [code] });
            alert('삭제 완료');
            this.loadedTabs.clear();
            this.refreshActiveTab();
        } catch(e) { alert('삭제 실패'); }
    }

    async showFolder(code) {
        const list = this.container.querySelector('#folder-list-container');
        list.innerHTML = '로딩중...';
        this.folderModal.show();
        
        try {
            const data = await Flowork.get(`${this.urls.folder}${code}`);
            if(data.status === 'success' && data.items.length > 0) {
                list.innerHTML = data.items.map(i => `
                    <a href="${i.url}" target="_blank" class="list-group-item list-group-item-action">
                        <i class="bi ${i.type === 'dir' ? 'bi-folder' : 'bi-file-earmark'} me-2"></i> ${i.name}
                    </a>
                `).join('');
            } else {
                list.innerHTML = '<div class="p-3 text-center">파일 없음</div>';
            }
        } catch(e) { list.innerHTML = '오류'; }
    }

    search() {
        this.isSearchChanged = true;
        this.loadedTabs.clear();
        const tab = this.container.querySelector('button[data-bs-target="#tab-hist-all"]');
        new bootstrap.Tab(tab).show();
        this.pagination['tab-hist-all'] = 1;
        this.loadTabContent(tab);
    }

    resetSearch() {
        this.dom.searchMulti.value = '';
        this.dom.searchName.value = '';
        this.dom.searchYear.value = '';
        this.dom.searchCat.value = '';
        this.search();
    }
}

window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['online_mgmt'] = new OnlineManager();