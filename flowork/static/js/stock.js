let currentStockApp = null;

class StockApp {
    constructor() {
        this.dom = {
            analyzeExcelUrl: document.body.dataset.analyzeExcelUrl,
            horizontalSwitches: document.querySelectorAll('.horizontal-mode-switch')
        };
        
        this.pollingInterval = null;
        
        console.log("StockApp Initialized"); // 디버깅용 로그
        this.init();
    }

    init() {
        // 각 업로드 폼 설정
        const configs = [
            {
                fileInputId: 'store_stock_excel_file',
                formId: 'form-update-store',
                wrapperId: 'wrapper-store-file',
                statusId: 'status-store-file',
                gridId: 'grid-update-store',
            },
            {
                fileInputId: 'hq_stock_excel_file_full',
                formId: 'form-update-hq-full',
                wrapperId: 'wrapper-hq-file-full',
                statusId: 'status-hq-file-full',
                gridId: 'grid-update-hq-full',
            },
            {
                fileInputId: 'db_excel_file',
                formId: 'form-import-db',
                wrapperId: 'wrapper-db-file',
                statusId: 'status-db-file',
                gridId: 'grid-import-db',
            }
        ];

        configs.forEach(config => this.setupExcelAnalyzer(config));

        // 가로형 모드 스위치
        if (this.dom.horizontalSwitches) {
            this.dom.horizontalSwitches.forEach(sw => {
                sw.addEventListener('change', (e) => this.toggleHorizontalMode(e.target));
                this.toggleHorizontalMode(sw);
            });
        }
    }

    destroy() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    toggleHorizontalMode(switchEl) {
        const form = switchEl.closest('form');
        if (!form) return;
        const isHorizontal = switchEl.checked;
        const conditionalFields = form.querySelectorAll('.conditional-field[data-show-if="vertical"]');
        
        conditionalFields.forEach(wrapper => {
            wrapper.style.display = isHorizontal ? 'none' : 'block';
            const select = wrapper.querySelector('select');
            if (select) {
                select.disabled = isHorizontal;
                if (isHorizontal) select.removeAttribute('required');
            }
        });
    }

    setupExcelAnalyzer(config) {
        const { fileInputId, formId, wrapperId, statusId, gridId } = config;
        
        const fileInput = document.getElementById(fileInputId);
        const form = document.getElementById(formId);
        const wrapper = document.getElementById(wrapperId);
        const statusText = document.getElementById(statusId);
        const grid = document.getElementById(gridId);
        
        // 요소가 하나라도 없으면 스킵 (다른 페이지이거나 권한 없음)
        if (!fileInput || !form || !grid) {
            // console.log(`Skipping setup for ${formId} (elements missing)`);
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        const progressBar = form.querySelector('.progress-bar');
        
        // 셀렉트 박스들 캐싱
        const selects = grid.querySelectorAll('select');
        let currentPreviewData = {};
        let currentColumnLetters = [];

        const resetUi = () => {
            if(wrapper) {
                wrapper.classList.remove('border-success', 'border-danger', 'bg-success-subtle', 'bg-danger-subtle');
                wrapper.classList.add('bg-light');
            }
            if(statusText) statusText.textContent = '엑셀 파일을 선택하세요.';
            grid.style.display = 'none';
            if(submitButton) submitButton.style.display = 'none';
            fileInput.value = '';
        };

        // 파일 선택 이벤트 (핵심)
        fileInput.addEventListener('change', async (e) => {
            console.log(`File changed: ${fileInputId}`);
            const file = e.target.files[0];
            if (!file) { resetUi(); return; }

            // 로딩 표시
            if(wrapper) {
                wrapper.classList.remove('bg-light', 'border-danger');
                wrapper.classList.add('bg-warning-subtle');
            }
            if(statusText) statusText.textContent = '파일 분석 중...';
            grid.style.display = 'none';
            if(submitButton) submitButton.style.display = 'none';

            const formData = new FormData();
            formData.append('excel_file', file);

            try {
                const response = await fetch(this.dom.analyzeExcelUrl, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': Flowork.getCsrfToken() },
                    body: formData
                });
                
                const data = await response.json();

                if (data.status !== 'success') {
                    throw new Error(data.message || "분석 실패");
                }

                // 성공 처리
                currentPreviewData = data.preview_data;
                currentColumnLetters = data.column_letters;
                
                // 드롭다운 옵션 채우기
                selects.forEach(select => {
                    const defaultText = select.querySelector('option:first-child')?.textContent || '-- 열 선택 --';
                    select.innerHTML = `<option value="">${defaultText}</option>`;
                    currentColumnLetters.forEach(letter => {
                        const opt = document.createElement('option');
                        opt.value = letter;
                        opt.textContent = letter;
                        select.appendChild(opt);
                    });
                    select.disabled = false;
                });

                // UI 업데이트
                if(wrapper) {
                    wrapper.classList.remove('bg-warning-subtle');
                    wrapper.classList.add('border-success', 'bg-success-subtle');
                }
                if(statusText) statusText.textContent = `분석 완료: ${file.name}`;
                
                grid.style.display = 'grid';
                if(submitButton) submitButton.style.display = 'block';

            } catch (error) {
                console.error(error);
                resetUi();
                if(wrapper) {
                    wrapper.classList.remove('bg-warning-subtle');
                    wrapper.classList.add('border-danger', 'bg-danger-subtle');
                }
                if(statusText) statusText.textContent = '분석 실패';
                alert(`분석 오류: ${error.message}`);
            }
        });

        // 열 선택 시 미리보기
        grid.addEventListener('change', (e) => {
            if(e.target.tagName !== 'SELECT') return;
            const letter = e.target.value;
            const previewEl = e.target.closest('.mapping-item-wrapper')?.querySelector('.col-preview');
            
            if(previewEl) {
                if(letter && currentPreviewData[letter]) {
                    const items = currentPreviewData[letter].slice(0,3).map(v => `<div>${v||'(빈 값)'}</div>`).join('');
                    previewEl.innerHTML = `<div class="small text-muted mt-1">${items}</div>`;
                } else {
                    previewEl.innerHTML = '';
                }
            }
        });

        // 폼 제출
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!confirm('업로드를 진행하시겠습니까?')) return;

            const formData = new FormData(form);
            if(submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 처리 중...';
            }

            // (1) 검증 API
            try {
                const verifyResp = await fetch('/api/verify_excel', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': Flowork.getCsrfToken() },
                    body: formData
                });
                const vData = await verifyResp.json();
                
                if(vData.status !== 'success') throw new Error(vData.message);

                // (2) 업로드 시작
                if (vData.suspicious_rows && vData.suspicious_rows.length > 0) {
                    this.showVerificationModal(
                        vData.suspicious_rows, 
                        formData, 
                        () => this.startUpload(form.action, formData, progressBar, submitButton)
                    );
                } else {
                    await this.startUpload(form.action, formData, progressBar, submitButton);
                }

            } catch(error) {
                alert(`오류: ${error.message}`);
                if(submitButton) {
                    submitButton.disabled = false;
                    submitButton.innerHTML = '업로드 시작';
                }
            }
        });
    }

    async startUpload(url, formData, progressBar, submitButton) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'X-CSRFToken': Flowork.getCsrfToken() },
                body: formData
            });
            const data = await response.json();

            if(data.status === 'success') {
                if(data.task_id) {
                    this.pollTask(data.task_id, progressBar);
                } else {
                    alert(data.message);
                    window.location.reload();
                }
            } else {
                throw new Error(data.message);
            }
        } catch(e) {
            alert(`업로드 실패: ${e.message}`);
            if(submitButton) submitButton.disabled = false;
        }
    }

    pollTask(taskId, progressBar) {
        if(this.pollingInterval) clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/task_status/${taskId}`);
                const task = await res.json();
                
                if(task.status === 'processing') {
                    if(progressBar) {
                        progressBar.style.width = `${task.percent}%`;
                        progressBar.textContent = `${task.percent}%`;
                    }
                } else {
                    clearInterval(this.pollingInterval);
                    if(task.status === 'completed') {
                        alert(task.result.message);
                        window.location.reload();
                    } else {
                        alert(`작업 실패: ${task.message}`);
                    }
                }
            } catch(e) {}
        }, 1000);
    }

    showVerificationModal(rows, formData, confirmCallback) {
        const modalEl = document.getElementById('verification-modal');
        
        if (!modalEl || typeof bootstrap === 'undefined') {
            if(confirm(`검증 경고: ${rows.length}개의 의심스러운 행이 발견되었습니다.\n그래도 진행하시겠습니까?`)) {
                confirmCallback();
            }
            return;
        }
        
        const modal = new bootstrap.Modal(modalEl);
        const tbody = document.getElementById('suspicious-rows-tbody');
        const countSpan = document.getElementById('suspicious-count');
        if(countSpan) countSpan.textContent = rows.length;
        
        if(tbody) {
            tbody.innerHTML = rows.map(r => `
                <tr data-row-index="${r.row_index}">
                    <td class="text-center">${r.row_index}</td>
                    <td>${r.preview}</td>
                    <td class="text-danger small">${r.reasons}</td>
                    <td class="text-center">
                        <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btn-exclude rounded-0">제외</button>
                    </td>
                </tr>
            `).join('');

            tbody.onclick = (e) => {
                const btn = e.target.closest('.btn-exclude');
                if (btn) {
                    const tr = btn.closest('tr');
                    tr.classList.toggle('table-danger');
                    tr.classList.toggle('text-decoration-line-through');
                    tr.classList.toggle('excluded');
                    btn.classList.toggle('active');
                    btn.textContent = btn.classList.contains('active') ? '복구' : '제외';
                }
            };
        }

        const btnConfirm = document.getElementById('btn-confirm-upload');
        const newBtn = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
        
        newBtn.onclick = () => {
            const excluded = Array.from(tbody.querySelectorAll('tr.excluded')).map(tr => tr.dataset.rowIndex);
            formData.append('excluded_row_indices', excluded.join(','));
            modal.hide();
            confirmCallback();
        };

        modal.show();
    }
}

document.addEventListener('turbo:load', () => {
    if (document.querySelector('.update-stock-form')) {
        if (currentStockApp) currentStockApp.destroy();
        currentStockApp = new StockApp();
    }
});