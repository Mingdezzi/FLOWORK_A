document.addEventListener('DOMContentLoaded', () => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    const btnStart = document.getElementById('btn-start-process');
    const btnReset = document.getElementById('btn-reset-status');
    const btnCancelAll = document.getElementById('btn-cancel-all');
    const statusText = document.getElementById('status-text');
    
    const bodyData = document.body.dataset;
    const API_LIST = bodyData.apiList;
    const API_PROCESS = bodyData.apiProcess;
    const API_RESET = bodyData.apiReset;
    const API_RESET_ALL = bodyData.apiResetAll;
    const API_DOWNLOAD = "/api/product/download/";
    const API_DELETE = "/api/product/delete_image_data";

    // 옵션 UI 요소
    const optPadding = document.getElementById('opt-padding');
    const optDirection = document.getElementById('opt-direction');
    const optBgColorPicker = document.getElementById('opt-bgcolor-picker');
    const optBgColorText = document.getElementById('opt-bgcolor-text');
    const optLogoAlign = document.getElementById('opt-logo-align');

    // 배경색 피커와 텍스트 입력 동기화
    if (optBgColorPicker && optBgColorText) {
        optBgColorPicker.addEventListener('input', (e) => {
            optBgColorText.value = e.target.value.toUpperCase();
        });
        optBgColorText.addEventListener('input', (e) => {
            const val = e.target.value;
            if (/^#[0-9A-F]{6}$/i.test(val)) {
                optBgColorPicker.value = val;
            }
        });
    }

    let isProcessing = false;
    
    const paginationState = {
        processing: 1,
        ready: 1,
        failed: 1,
        completed: 1,
        all: 1
    };

    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            const tabType = e.target.dataset.tabType;
            loadData(tabType, paginationState[tabType]); 
        });
    });

    ['search-all', 'search-completed'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const tabType = id.replace('search-', '');
                    paginationState[tabType] = 1;
                    loadData(tabType, 1);
                }
            });
        }
    });

    async function loadData(tabType, page) {
        if (isProcessing) return;

        let query = '';
        const searchInput = document.getElementById(`search-${tabType}`);
        if (searchInput) query = searchInput.value.trim();

        const tbodyId = `tbody-${tabType}`;
        const paginationId = `pagination-${tabType}`;
        const tbody = document.getElementById(tbodyId);

        if(tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5"><div class="spinner-border text-secondary" role="status"></div><div class="mt-2 text-muted">데이터 불러오는 중...</div></td></tr>`;

        try {
            const params = new URLSearchParams({
                page: page,
                limit: 50,
                tab: tabType,
                query: query
            });

            const res = await fetch(`${API_LIST}?${params.toString()}`);
            const json = await res.json();

            if (json.status === 'success') {
                renderTableRows(tbodyId, json.data);
                renderPaginationControls(paginationId, tabType, json.pagination);
                
                const badge = document.getElementById(`count-${tabType}`);
                if(badge) badge.textContent = json.pagination.total_items;

                updateGlobalStatus(json.pagination.total_items, tabType);
            }
        } catch (e) {
            console.error("Load error:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger p-4">데이터 로드 실패</td></tr>`;
        }
    }

    function updateGlobalStatus(count, tabType) {
        if (tabType === 'processing') {
            if (count > 0) {
                statusText.innerHTML = `<span class="spinner-border spinner-border-sm text-primary me-1"></span> 총 ${count}건 작업 진행 중...`;
                statusText.classList.add('text-primary');
            } else {
                statusText.textContent = "현재 진행 중인 작업 없음";
                statusText.classList.remove('text-primary');
                statusText.classList.add('text-muted');
            }
        }
    }

    function renderTableRows(tbodyId, items) {
        const tbody = document.getElementById(tbodyId);
        tbody.innerHTML = '';

        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-muted">데이터가 없습니다.</td></tr>`;
            return;
        }

        items.forEach(item => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'bg-secondary';
            let statusLabel = '대기';
            if (item.status === 'PROCESSING') { badgeClass = 'bg-primary'; statusLabel = '진행중'; }
            else if (item.status === 'COMPLETED') { badgeClass = 'bg-success'; statusLabel = '완료'; }
            else if (item.status === 'FAILED') { badgeClass = 'bg-danger'; statusLabel = '실패'; }
            
            const rawMessage = item.message || '';
            const safeMessage = rawMessage.replace(/"/g, '&quot;');
            const titleAttr = rawMessage ? `title="${safeMessage}"` : '';
            const dataMsgAttr = rawMessage ? `data-message="${safeMessage}"` : '';
            
            const thumbHtml = item.thumbnail ? `<a href="${item.thumbnail}" target="_blank"><img src="${item.thumbnail}" class="img-preview"></a>` : `<div class="img-placeholder"><i class="bi bi-image"></i></div>`;
            const detailLink = item.detail ? `<a href="${item.detail}" target="_blank" class="btn btn-sm btn-outline-info"><i class="bi bi-file-earmark-image"></i></a>` : `-`;
            const driveLink = item.drive_link ? `<a href="${item.drive_link}" target="_blank" class="btn btn-sm btn-outline-success"><i class="bi bi-google"></i></a>` : `-`;
            
            const disabled = item.status === 'PROCESSING' ? 'disabled' : '';

            const isCompleted = item.status === 'COMPLETED';
            const downloadBtn = isCompleted 
                ? `<button class="btn btn-sm btn-outline-dark me-1 btn-download" title="전체 저장"><i class="bi bi-download"></i></button>`
                : `<button class="btn btn-sm btn-outline-secondary me-1" disabled><i class="bi bi-download"></i></button>`;
            
            const deleteBtn = `<button class="btn btn-sm btn-outline-danger btn-delete-data" title="데이터 삭제"><i class="bi bi-trash"></i></button>`;

            tr.innerHTML = `
                <td><input type="checkbox" class="form-check-input item-check" value="${item.style_code}" ${disabled}></td>
                <td class="fw-bold">${item.style_code}</td>
                <td class="text-start text-truncate" style="max-width: 150px;">${item.product_name}</td>
                <td>${item.total_colors}</td>
                <td>${driveLink}</td>
                <td>-</td>
                <td>${thumbHtml}</td>
                <td>${detailLink}</td>
                <td><span class="badge ${badgeClass} status-badge" ${titleAttr} ${dataMsgAttr}>${statusLabel}</span></td>
                <td>
                    <div class="d-flex justify-content-center">
                        ${downloadBtn}
                        ${deleteBtn}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        updateButtons();
    }

    function renderPaginationControls(containerId, tabType, pagination) {
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = '';
        
        const { current_page, total_pages } = pagination;
        if (total_pages <= 1) return;

        const ul = document.createElement('ul');
        ul.className = 'pagination pagination-sm';

        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${!pagination.has_prev ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous">&laquo;</a>`;
        prevLi.onclick = (e) => { e.preventDefault(); if(pagination.has_prev) changePage(tabType, current_page - 1); };
        ul.appendChild(prevLi);

        let startPage = Math.max(1, current_page - 2);
        let endPage = Math.min(total_pages, startPage + 4);
        if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === current_page ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            li.onclick = (e) => { e.preventDefault(); changePage(tabType, i); };
            ul.appendChild(li);
        }

        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${!pagination.has_next ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next">&raquo;</a>`;
        nextLi.onclick = (e) => { e.preventDefault(); if(pagination.has_next) changePage(tabType, current_page + 1); };
        ul.appendChild(nextLi);

        container.appendChild(ul);
    }

    function changePage(tabType, page) {
        paginationState[tabType] = page;
        loadData(tabType, page);
    }

    document.querySelectorAll('.check-all-tab').forEach(checkAll => {
        checkAll.addEventListener('change', (e) => {
            const targetId = e.target.dataset.target;
            const isChecked = e.target.checked;
            const tbody = document.getElementById(targetId);
            if (tbody) {
                tbody.querySelectorAll('.item-check:not(:disabled)').forEach(cb => {
                    cb.checked = isChecked;
                });
                updateButtons();
            }
        });
    });

    document.body.addEventListener('change', (e) => {
        if (e.target.classList.contains('item-check')) {
            updateButtons();
        }
    });

    document.body.addEventListener('click', async (e) => {
        if (e.target.classList.contains('status-badge') && e.target.classList.contains('bg-danger')) {
            const message = e.target.dataset.message;
            if (message) {
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(message).then(() => alert("오류 로그가 복사되었습니다:\n" + message)).catch(err => alert("복사 실패: " + err));
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = message;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-9999px";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        alert("오류 로그가 복사되었습니다:\n" + message);
                    } catch (err) {
                        alert("복사하기 실패 (보안 제한): " + message);
                    }
                    document.body.removeChild(textArea);
                }
            }
        }

        const downBtn = e.target.closest('.btn-download');
        if (downBtn) {
            const row = downBtn.closest('tr');
            const styleCode = row.querySelector('.item-check').value;
            window.location.href = API_DOWNLOAD + styleCode;
            return;
        }

        const delBtn = e.target.closest('.btn-delete-data');
        if (delBtn) {
            const row = delBtn.closest('tr');
            const styleCode = row.querySelector('.item-check').value;
            
            if (!confirm(`[${styleCode}]의 이미지 데이터와 파일을 삭제하시겠습니까?\n(상태가 초기화됩니다)`)) return;
            
            try {
                const res = await fetch(API_DELETE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                    body: JSON.stringify({ style_codes: [styleCode] })
                });
                const json = await res.json();
                if (json.status === 'success') {
                    alert(json.message);
                    const activeTabBtn = document.querySelector('.nav-link.active');
                    if(activeTabBtn) loadData(activeTabBtn.dataset.tabType, 1);
                } else {
                    alert('삭제 실패: ' + json.message);
                }
            } catch (err) {
                alert('서버 통신 오류');
            }
        }
    });

    function updateButtons() {
        const allChecked = document.querySelectorAll('.item-check:checked');
        const count = new Set(Array.from(allChecked).map(cb => cb.value)).size;
        
        if(btnStart) {
            btnStart.disabled = count === 0;
            btnStart.innerHTML = count > 0 
                ? `<i class="bi bi-play-fill me-1"></i> ${count}건 처리 시작` 
                : `<i class="bi bi-play-fill me-1"></i> 처리 시작`;
        }
        if(btnReset) {
            btnReset.disabled = count === 0;
            btnReset.innerHTML = count > 0
                ? `<i class="bi bi-arrow-counterclockwise me-1"></i> ${count}건 선택 초기화`
                : `<i class="bi bi-arrow-counterclockwise me-1"></i> 선택 초기화`;
        }
    }

    function getSelectedCodes() {
        const allChecked = document.querySelectorAll('.item-check:checked');
        return Array.from(new Set(Array.from(allChecked).map(cb => cb.value)));
    }

    async function sendRequest(url, data) {
        isProcessing = true;
        if(btnStart) {
            btnStart.disabled = true;
            btnStart.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 요청 중...';
        }
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            alert(json.message);
        } catch (e) {
            alert('서버 통신 오류가 발생했습니다.');
        } finally {
            isProcessing = false;
            const activeTabBtn = document.querySelector('.nav-link.active');
            if(activeTabBtn) loadData(activeTabBtn.dataset.tabType, 1);
        }
    }

    if(btnStart) btnStart.addEventListener('click', () => {
        const codes = getSelectedCodes();
        if (codes.length === 0) return;
        
        // 옵션값 수집
        const options = {
            padding: document.getElementById('opt-padding').value,
            direction: document.getElementById('opt-direction').value,
            bg_color: document.getElementById('opt-bgcolor-text').value,
            logo_align: document.getElementById('opt-logo-align').value
        };

        if (confirm(`${codes.length}건 품번의 이미지 작업을 시작하시겠습니까?`)) {
            sendRequest(API_PROCESS, { 
                style_codes: codes,
                options: options
            });
        }
    });

    if(btnReset) btnReset.addEventListener('click', () => {
        const codes = getSelectedCodes();
        if (codes.length === 0) return;
        if (confirm(`${codes.length}건 품번의 상태를 '대기'로 초기화하시겠습니까?`)) {
            sendRequest(API_RESET, { style_codes: codes });
        }
    });

    if(btnCancelAll) btnCancelAll.addEventListener('click', () => {
        if (confirm('진행 중인 모든 작업을 취소(초기화)하시겠습니까?')) {
            sendRequest(API_RESET_ALL, {});
        }
    });

    const initialTab = document.querySelector('.nav-link.active');
    if(initialTab) loadData(initialTab.dataset.tabType, 1);
    
    setInterval(() => {
        const activeTabBtn = document.querySelector('.nav-link.active');
        if(activeTabBtn && activeTabBtn.dataset.tabType === 'processing') {
            loadData('processing', paginationState.processing);
        }
    }, 10000);
});