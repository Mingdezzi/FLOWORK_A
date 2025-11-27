class CrmApp {
    constructor() {
        this.container = null;
        this.csrfToken = null;
        this.dom = {};
        this.handlers = {};
    }

    init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        
        // --- 1. 고객 관리 페이지 로직 ---
        const custTbody = container.querySelector('#customer-tbody');
        if (custTbody) {
            this.initCustomerList(custTbody);
        }

        // --- 2. 수선 관리 페이지 로직 ---
        const repModalEl = container.querySelector('#repairModal');
        if (repModalEl) {
            this.initRepairList(repModalEl);
        }
    }

    destroy() {
        // 고객 관리 핸들러 제거
        if (this.dom.btnSearchCust) this.dom.btnSearchCust.removeEventListener('click', this.handlers.searchCust);
        if (this.dom.searchCustInput) this.dom.searchCustInput.removeEventListener('keydown', this.handlers.searchCustKey);
        if (this.dom.formAddCust) this.dom.formAddCust.removeEventListener('submit', this.handlers.addCust);

        // 수선 관리 핸들러 제거
        if (this.dom.btnSaveRep) this.dom.btnSaveRep.removeEventListener('click', this.handlers.saveRep);
        // 이벤트 위임 제거 (상태 변경)
        if (this.dom.repTable) this.dom.repTable.removeEventListener('change', this.handlers.changeRepStatus);

        // 모달 백드롭 제거
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bd => bd.remove());

        this.container = null;
        this.dom = {};
        this.handlers = {};
    }

    // --- Sub Init Functions ---

    initCustomerList(custTbody) {
        this.dom.custTbody = custTbody;
        this.dom.searchCustInput = this.container.querySelector('#search-query');
        this.dom.btnSearchCust = this.container.querySelector('#btn-search');
        this.dom.formAddCust = this.container.querySelector('#form-add-customer');
        
        // base.html의 dataset이 아닌, 현재 container 내부나 하드코딩된 URL 사용
        // SPA 전환 시 템플릿의 body_attrs가 적용되지 않으므로 URL 하드코딩 또는 메타데이터 조회 방식 권장
        this.urls = {
            list: '/api/customers',
            add: '/api/customers'
        };

        this.handlers.searchCust = () => this.loadCustomers(1);
        this.handlers.searchCustKey = (e) => { if(e.key==='Enter') this.loadCustomers(1); };
        this.handlers.addCust = (e) => this.submitAddCustomer(e);

        this.dom.btnSearchCust.addEventListener('click', this.handlers.searchCust);
        this.dom.searchCustInput.addEventListener('keydown', this.handlers.searchCustKey);
        this.dom.formAddCust.addEventListener('submit', this.handlers.addCust);

        this.loadCustomers();
    }

    initRepairList(repModalEl) {
        this.repModal = new bootstrap.Modal(repModalEl);
        this.dom.btnSaveRep = this.container.querySelector('#btn-save-repair');
        this.dom.repDateInput = this.container.querySelector('#rep-date');
        this.dom.repTable = this.container.querySelector('.table-responsive'); // 상태 변경 이벤트 위임용

        // 초기 날짜 설정
        const today = new Date().toISOString().split('T')[0];
        if(this.dom.repDateInput) this.dom.repDateInput.value = today;

        this.handlers.saveRep = () => this.submitRepair();
        this.handlers.changeRepStatus = (e) => this.handleChangeStatus(e);

        this.dom.btnSaveRep.addEventListener('click', this.handlers.saveRep);
        this.dom.repTable.addEventListener('change', this.handlers.changeRepStatus);
    }

    // --- Actions ---

    loadCustomers(page=1) {
        const query = this.dom.searchCustInput.value.trim();
        fetch(`${this.urls.list}?page=${page}&query=${encodeURIComponent(query)}`)
            .then(r => r.json())
            .then(data => {
                this.dom.custTbody.innerHTML = '';
                if (data.customers.length === 0) {
                    this.dom.custTbody.innerHTML = '<tr><td colspan="5" class="p-4 text-muted">등록된 고객이 없습니다.</td></tr>';
                    return;
                }
                data.customers.forEach(c => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${c.code}</td>
                        <td class="fw-bold">${c.name}</td>
                        <td>${c.phone}</td>
                        <td>${c.address}</td>
                        <td>${c.created_at}</td>
                    `;
                    this.dom.custTbody.appendChild(tr);
                });
            });
    }

    submitAddCustomer(e) {
        e.preventDefault();
        const payload = {
            name: this.container.querySelector('#new-name').value,
            phone: this.container.querySelector('#new-phone').value,
            address: this.container.querySelector('#new-address').value
        };
        
        fetch(this.urls.add, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify(payload)
        }).then(r => r.json()).then(data => {
            if (data.status === 'success') {
                alert(data.message);
                this.dom.formAddCust.reset();
                this.loadCustomers(1);
            } else {
                alert(data.message);
            }
        });
    }

    submitRepair() {
        const payload = {
            date: this.container.querySelector('#rep-date').value,
            customer_name: this.container.querySelector('#rep-name').value,
            customer_phone: this.container.querySelector('#rep-phone').value,
            product_code: this.container.querySelector('#rep-code').value,
            product_info: this.container.querySelector('#rep-prod').value,
            color: this.container.querySelector('#rep-color').value,
            size: this.container.querySelector('#rep-size').value,
            description: this.container.querySelector('#rep-desc').value
        };
        
        if(!payload.customer_name || !payload.customer_phone || !payload.description) {
            alert('고객명, 연락처, 수선 내용은 필수입니다.'); return;
        }
        
        fetch('/api/repairs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify(payload)
        }).then(r => r.json()).then(data => {
            if (data.status === 'success') {
                alert(data.message);
                // SPA 방식에서는 페이지 리로드 대신 현재 탭을 리로드하거나 리스트 갱신 로직을 호출해야 함.
                // 편의상 탭 리로드
                if (TabManager.activeTabId) {
                    const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                    if(tab) TabManager.loadContent(tab.id, tab.url);
                }
            } else {
                alert(data.message);
            }
        });
    }

    handleChangeStatus(e) {
        if (e.target.classList.contains('status-select')) {
            const id = e.target.dataset.id;
            const newStatus = e.target.value;
            // API prefix도 하드코딩하거나 템플릿에서 전달받아야 함
            const statusUrl = '/api/repairs'; 
            
            fetch(`${statusUrl}/${id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify({ status: newStatus })
            }).then(r => r.json()).then(data => {
                if (data.status === 'success') {
                    const row = e.target.closest('tr');
                    const badge = row.querySelector('.status-badge');
                    if(badge) {
                        badge.textContent = newStatus;
                        // 배지 색상 변경 로직 추가 가능
                    }
                } else {
                    alert(data.message);
                }
            });
        }
    }
}

// 하나의 인스턴스를 두 페이지 모듈에 공유 등록
const crmApp = new CrmApp();
window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['customer_list'] = crmApp;
window.PageRegistry['repair_list'] = crmApp;