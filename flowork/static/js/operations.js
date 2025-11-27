class OperationsApp {
    constructor() {
        this.container = null;
        this.csrfToken = null;
        this.dom = {};
        this.handlers = {};
    }

    init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        const today = new Date().toISOString().split('T')[0];

        // --- 1. 근태 관리 로직 ---
        const attTbody = container.querySelector('#att-tbody');
        if (attTbody) {
            this.initAttendance(attTbody, today);
        }

        // --- 2. 타사 매출 관리 로직 ---
        const salesTbody = container.querySelector('#sales-tbody');
        if (salesTbody) {
            this.initCompetitorSales(salesTbody, today);
        }
    }

    destroy() {
        // 근태 핸들러 해제
        if (this.dom.btnLoadAtt) this.dom.btnLoadAtt.removeEventListener('click', this.handlers.loadAtt);
        if (this.dom.btnSaveAtt) this.dom.btnSaveAtt.removeEventListener('click', this.handlers.saveAtt);

        // 매출 핸들러 해제
        if (this.dom.btnLoadSales) this.dom.btnLoadSales.removeEventListener('click', this.handlers.loadSales);
        if (this.dom.btnSaveSales) this.dom.btnSaveSales.removeEventListener('click', this.handlers.saveSales);
        if (this.dom.btnAddBrand) this.dom.btnAddBrand.removeEventListener('click', this.handlers.addBrand);
        if (this.dom.brandList) this.dom.brandList.removeEventListener('click', this.handlers.delBrand);

        this.container = null;
        this.dom = {};
        this.handlers = {};
    }

    // --- Sub Init Functions ---

    initAttendance(attTbody, today) {
        this.dom.attTbody = attTbody;
        this.dom.dateInputAtt = this.container.querySelector('#work-date');
        this.dom.btnLoadAtt = this.container.querySelector('#btn-load');
        this.dom.btnSaveAtt = this.container.querySelector('#btn-save');
        
        this.dom.dateInputAtt.value = today;
        
        const urls = {
            get: '/api/attendance',
            save: '/api/attendance'
        };

        this.handlers.loadAtt = () => this.loadAttendance(urls.get);
        this.handlers.saveAtt = () => this.saveAttendance(urls.save, urls.get);

        this.dom.btnLoadAtt.addEventListener('click', this.handlers.loadAtt);
        this.dom.btnSaveAtt.addEventListener('click', this.handlers.saveAtt);

        this.loadAttendance(urls.get);
    }

    initCompetitorSales(salesTbody, today) {
        this.dom.salesTbody = salesTbody;
        this.dom.dateInputSales = this.container.querySelector('#sale-date');
        this.dom.btnLoadSales = this.container.querySelector('#btn-load-sales');
        this.dom.btnSaveSales = this.container.querySelector('#btn-save-sales');
        this.dom.brandList = this.container.querySelector('#brand-list');
        this.dom.btnAddBrand = this.container.querySelector('#btn-add-brand');
        this.dom.newBrandInput = this.container.querySelector('#new-brand-name');
        
        this.dom.dateInputSales.value = today;

        const urls = {
            brand: '/api/competitor/brands',
            sales: '/api/competitor/sales'
        };

        this.handlers.loadSales = () => this.loadSales(urls.sales);
        this.handlers.saveSales = () => this.saveSales(urls.sales);
        this.handlers.addBrand = () => this.addBrand(urls.brand, urls.sales);
        this.handlers.delBrand = (e) => this.deleteBrand(e, urls.brand, urls.sales);

        this.dom.btnLoadSales.addEventListener('click', this.handlers.loadSales);
        this.dom.btnSaveSales.addEventListener('click', this.handlers.saveSales);
        this.dom.btnAddBrand.addEventListener('click', this.handlers.addBrand);
        this.dom.brandList.addEventListener('click', this.handlers.delBrand);

        this.loadSales(urls.sales);
        this.loadBrands(urls.brand);
    }

    // --- Attendance Logic ---

    loadAttendance(url) {
        const date = this.dom.dateInputAtt.value;
        fetch(`${url}?date=${date}`)
            .then(r => r.json())
            .then(data => {
                this.dom.attTbody.innerHTML = '';
                if (data.data.length === 0) {
                    this.dom.attTbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center">등록된 직원이 없습니다.</td></tr>';
                    return;
                }
                data.data.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.dataset.staffId = r.staff_id;
                    tr.innerHTML = `
                        <td class="fw-bold">${r.name}</td>
                        <td>${r.position || '-'}</td>
                        <td>
                            <select class="form-select form-select-sm status-sel">
                                ${['출근', '결근', '휴가', '반차', '병가', '지각', '조퇴', '휴무'].map(s => 
                                    `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`
                                ).join('')}
                            </select>
                        </td>
                        <td><input type="time" class="form-control form-control-sm in-time" value="${r.check_in}"></td>
                        <td><input type="time" class="form-control form-control-sm out-time" value="${r.check_out}"></td>
                        <td><input type="text" class="form-control form-control-sm memo" value="${r.memo}"></td>
                    `;
                    this.dom.attTbody.appendChild(tr);
                });
            });
    }

    saveAttendance(urlSave, urlGet) {
        const records = [];
        this.dom.attTbody.querySelectorAll('tr').forEach(tr => {
            records.push({
                staff_id: tr.dataset.staffId,
                status: tr.querySelector('.status-sel').value,
                check_in: tr.querySelector('.in-time').value,
                check_out: tr.querySelector('.out-time').value,
                memo: tr.querySelector('.memo').value
            });
        });
        
        fetch(urlSave, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify({ date: this.dom.dateInputAtt.value, records: records })
        }).then(r => r.json()).then(d => {
            alert(d.message);
            if(d.status==='success') this.loadAttendance(urlGet);
        });
    }

    // --- Sales Logic ---

    loadSales(url) {
        const date = this.dom.dateInputSales.value;
        fetch(`${url}?date=${date}`)
            .then(r => r.json())
            .then(data => {
                this.dom.salesTbody.innerHTML = '';
                if (data.data.length === 0) {
                    this.dom.salesTbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center">등록된 경쟁사 브랜드가 없습니다.</td></tr>';
                    return;
                }
                data.data.forEach(r => {
                    const total = r.off_norm + r.off_evt + r.on_norm + r.on_evt;
                    const tr = document.createElement('tr');
                    tr.dataset.brandId = r.brand_id;
                    tr.innerHTML = `
                        <td class="fw-bold bg-light">${r.brand_name}</td>
                        <td><input type="number" class="form-control form-control-sm text-end off-norm" value="${r.off_norm}"></td>
                        <td><input type="number" class="form-control form-control-sm text-end off-evt" value="${r.off_evt}"></td>
                        <td><input type="number" class="form-control form-control-sm text-end on-norm" value="${r.on_norm}"></td>
                        <td><input type="number" class="form-control form-control-sm text-end on-evt" value="${r.on_evt}"></td>
                        <td class="fw-bold total-cell">${total.toLocaleString()}</td>
                    `;
                    
                    tr.addEventListener('input', () => {
                        const v = cls => parseInt(tr.querySelector('.'+cls).value) || 0;
                        const sum = v('off-norm') + v('off-evt') + v('on-norm') + v('on-evt');
                        tr.querySelector('.total-cell').textContent = sum.toLocaleString();
                    });
                    
                    this.dom.salesTbody.appendChild(tr);
                });
            });
    }

    loadBrands(url) {
        fetch(url)
            .then(r => r.json())
            .then(data => {
                this.dom.brandList.innerHTML = '';
                data.brands.forEach(b => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item d-flex justify-content-between align-items-center';
                    li.innerHTML = `
                        ${b.name}
                        <button class="btn btn-sm btn-outline-danger btn-del-brand" data-id="${b.id}">&times;</button>
                    `;
                    this.dom.brandList.appendChild(li);
                });
            });
    }

    saveSales(url) {
        const records = [];
        this.dom.salesTbody.querySelectorAll('tr').forEach(tr => {
            records.push({
                brand_id: tr.dataset.brandId,
                off_norm: tr.querySelector('.off-norm').value,
                off_evt: tr.querySelector('.off-evt').value,
                on_norm: tr.querySelector('.on-norm').value,
                on_evt: tr.querySelector('.on-evt').value
            });
        });
        
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify({ date: this.dom.dateInputSales.value, records: records })
        }).then(r => r.json()).then(d => {
            alert(d.message);
        });
    }

    addBrand(urlBrand, urlSales) {
        const name = this.dom.newBrandInput.value.trim();
        if (!name) return;
        
        fetch(urlBrand, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
            body: JSON.stringify({ name: name })
        }).then(r => r.json()).then(d => {
            if (d.status === 'success') {
                this.dom.newBrandInput.value = '';
                this.loadBrands(urlBrand);
                this.loadSales(urlSales);
            } else {
                alert(d.message);
            }
        });
    }

    deleteBrand(e, urlBrand, urlSales) {
        if (e.target.classList.contains('btn-del-brand')) {
            if (!confirm('정말 삭제하시겠습니까? (기존 매출 기록은 유지됩니다)')) return;
            const id = e.target.dataset.id;
            fetch(`${urlBrand}/${id}`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': this.csrfToken }
            }).then(() => {
                this.loadBrands(urlBrand);
                this.loadSales(urlSales);
            });
        }
    }
}

const operationsApp = new OperationsApp();
window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['attendance'] = operationsApp;
window.PageRegistry['competitor_sales'] = operationsApp;