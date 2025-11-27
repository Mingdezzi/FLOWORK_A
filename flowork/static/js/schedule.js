class ScheduleApp {
    constructor() {
        this.container = null;
        this.calendar = null;
        this.modal = null;
        this.csrfToken = null;
        this.apiUrls = {};
        this.dom = {};
        this.handlers = {};
        this.holidays = {};
    }

    async init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        const bodyData = document.body.dataset; // 공통 데이터

        // API URL (base.html의 dataset 또는 schedule.html의 dataset 활용. 
        // 템플릿 구조상 schedule.html의 body_attrs는 적용되지 않으므로, base_ajax 템플릿의 wrapper에 데이터를 넣거나,
        // 아니면 여기서 직접 URL을 정의해야 함. 
        // *중요: 기존 template 코드를 수정하여 base_ajax.html의 wrapper div에 data 속성을 넣는 것이 가장 좋으나,
        // 여기서는 하드코딩된 URL 패턴을 사용하거나, 템플릿 내에 숨겨진 input으로 전달받는 방식을 가정하고 안전하게 처리함.
        
        // 임시: schedule.html 템플릿이 수정되지 않았다고 가정하고 기본 URL 사용
        this.apiUrls = {
            fetch: '/api/schedule/events',
            add: '/api/schedule/events',
            updatePrefix: '/api/schedule/events/',
            deletePrefix: '/api/schedule/events/'
        };

        this.dom = {
            calendarEl: container.querySelector('#calendar'),
            eventModalEl: container.querySelector('#event-modal'),
            form: container.querySelector('#form-schedule-event'),
            modalTitle: container.querySelector('#eventModalLabel'),
            eventId: container.querySelector('#event_id'),
            staffSelect: container.querySelector('#event_staff'),
            typeSelect: container.querySelector('#event_type'),
            titleInput: container.querySelector('#event_title'),
            startDate: container.querySelector('#event_start_date'),
            allDay: container.querySelector('#event_all_day'),
            endDateWrapper: container.querySelector('#event_end_date_wrapper'),
            endDate: container.querySelector('#event_end_date'),
            btnSave: container.querySelector('#btn-save-event'),
            btnDelete: container.querySelector('#btn-delete-event'),
            modalStatus: container.querySelector('#event-modal-status')
        };

        if (!this.dom.calendarEl || !this.dom.eventModalEl) return;

        this.modal = new bootstrap.Modal(this.dom.eventModalEl);

        // 공휴일 데이터 로드
        try {
            const response = await fetch('/api/holidays');
            if (response.ok) this.holidays = await response.json();
        } catch (error) { console.error('Holidays fetch error:', error); }

        this.initCalendar();
        this.bindEvents();
    }

    destroy() {
        if (this.calendar) {
            this.calendar.destroy();
            this.calendar = null;
        }
        
        // 이벤트 핸들러 제거
        if(this.dom.allDay) this.dom.allDay.removeEventListener('change', this.handlers.toggleAllDay);
        if(this.dom.typeSelect) this.dom.typeSelect.removeEventListener('change', this.handlers.typeChange);
        if(this.dom.btnSave) this.dom.btnSave.removeEventListener('click', this.handlers.save);
        if(this.dom.btnDelete) this.dom.btnDelete.removeEventListener('click', this.handlers.delete);
        if(this.dom.eventModalEl) this.dom.eventModalEl.removeEventListener('hidden.bs.modal', this.handlers.resetModal);

        // 모달 백드롭 제거
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bd => bd.remove());

        this.container = null;
    }

    initCalendar() {
        this.calendar = new FullCalendar.Calendar(this.dom.calendarEl, {
            locale: 'ko',
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek'
            },
            buttonText: { today: '오늘', month: '월', week: '주' },
            editable: true,
            selectable: true,
            events: this.apiUrls.fetch,
            
            dayCellDidMount: (info) => {
                const dateStr = info.date.toISOString().split('T')[0];
                const dayOfWeek = info.date.getDay();
                const holidayName = this.holidays[dateStr];
                
                const dayNumberEl = info.el.querySelector('.fc-daygrid-day-number');
                if ((dayOfWeek === 0 || dayOfWeek === 6 || holidayName) && dayNumberEl) {
                    dayNumberEl.style.color = '#dc3545';
                    dayNumberEl.style.fontWeight = 'bold';
                }
                if (holidayName) {
                    const holidayEl = document.createElement('div');
                    holidayEl.textContent = holidayName;
                    holidayEl.style.fontSize = '0.75em';
                    holidayEl.style.color = '#dc3545';
                    holidayEl.style.textAlign = 'left';
                    holidayEl.style.paddingLeft = '4px';
                    const topEl = info.el.querySelector('.fc-daygrid-day-top');
                    if (topEl) topEl.appendChild(holidayEl);
                }
            },

            dateClick: (info) => {
                this.resetModalState();
                this.dom.modalTitle.textContent = '새 일정 등록';
                this.dom.startDate.value = info.dateStr;
                this.dom.allDay.checked = true;
                this.toggleAllDayFields();
                this.modal.show();
            },

            eventClick: (info) => {
                this.resetModalState();
                this.dom.modalTitle.textContent = '일정 수정';
                
                const event = info.event;
                const props = event.extendedProps;
                
                this.dom.eventId.value = event.id;
                this.dom.titleInput.value = props.raw_title;
                this.dom.startDate.value = event.startStr.split('T')[0];
                this.dom.allDay.checked = event.allDay;
                
                if (event.end) {
                    if (event.allDay) {
                        let endDate = new Date(event.endStr);
                        endDate.setDate(endDate.getDate() - 1);
                        this.dom.endDate.value = endDate.toISOString().split('T')[0];
                    } else {
                        this.dom.endDate.value = event.endStr.split('T')[0];
                    }
                }

                this.dom.staffSelect.value = props.staff_id || "0";
                this.dom.typeSelect.value = props.event_type || "일정";
                
                this.dom.btnDelete.style.display = 'block';
                this.toggleAllDayFields();
                this.modal.show();
            }
        });

        this.calendar.render();
    }

    bindEvents() {
        this.handlers = {
            toggleAllDay: () => this.toggleAllDayFields(),
            typeChange: () => {
                const opt = this.dom.typeSelect.options[this.dom.typeSelect.selectedIndex];
                const val = opt.value;
                if(val !== '일정') this.dom.titleInput.value = val;
                else if(['휴무','연차','반차','병가'].includes(this.dom.titleInput.value)) this.dom.titleInput.value = '';
            },
            save: () => this.saveEvent(),
            delete: () => this.deleteEvent(),
            resetModal: () => this.resetModalState()
        };

        this.dom.allDay.addEventListener('change', this.handlers.toggleAllDay);
        this.dom.typeSelect.addEventListener('change', this.handlers.typeChange);
        this.dom.btnSave.addEventListener('click', this.handlers.save);
        this.dom.btnDelete.addEventListener('click', this.handlers.delete);
        this.dom.eventModalEl.addEventListener('hidden.bs.modal', this.handlers.resetModal);
    }

    toggleAllDayFields() {
        if (this.dom.allDay.checked) {
            this.dom.endDateWrapper.style.display = 'block';
        } else {
            this.dom.endDateWrapper.style.display = 'none';
            this.dom.endDate.value = '';
        }
    }

    async saveEvent() {
        if (!this.dom.startDate.value || !this.dom.titleInput.value || !this.dom.typeSelect.value) {
            this.showModalStatus('필수 항목을 입력하세요.', 'danger');
            return;
        }

        const opt = this.dom.typeSelect.options[this.dom.typeSelect.selectedIndex];
        const color = opt.dataset.color || '#0d6efd';

        const eventData = {
            id: this.dom.eventId.value || null,
            staff_id: this.dom.staffSelect.value,
            event_type: this.dom.typeSelect.value,
            title: this.dom.titleInput.value.trim(),
            start_time: this.dom.startDate.value,
            all_day: this.dom.allDay.checked,
            end_time: this.dom.endDate.value || null,
            color: color
        };

        if (eventData.all_day && eventData.end_time) {
             let endDate = new Date(eventData.end_time);
             endDate.setDate(endDate.getDate() + 1);
             eventData.end_time = endDate.toISOString().split('T')[0];
        }

        const isNew = !eventData.id;
        const url = isNew ? this.apiUrls.add : `${this.apiUrls.updatePrefix}${eventData.id}`;
        
        this.setLoading(true);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify(eventData)
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.message || '저장 실패');

            this.showModalStatus(data.message, 'success');
            this.calendar.refetchEvents();
            
            setTimeout(() => {
                this.modal.hide();
                this.setLoading(false);
            }, 1000);

        } catch (error) {
            this.showModalStatus(`오류: ${error.message}`, 'danger');
            this.setLoading(false);
        }
    }

    async deleteEvent() {
        const id = this.dom.eventId.value;
        if (!id || !confirm('정말 삭제하시겠습니까?')) return;
        
        this.setLoading(true);
        try {
            const response = await fetch(`${this.apiUrls.deletePrefix}${id}`, { 
                method: 'DELETE',
                headers: { 'X-CSRFToken': this.csrfToken }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            this.showModalStatus(data.message, 'success');
            this.calendar.refetchEvents();
            setTimeout(() => {
                this.modal.hide();
                this.setLoading(false);
            }, 1000);
        } catch (error) {
            this.showModalStatus(`오류: ${error.message}`, 'danger');
            this.setLoading(false);
        }
    }

    resetModalState() {
        this.dom.form.reset();
        this.dom.eventId.value = '';
        this.dom.staffSelect.value = "0";
        this.dom.typeSelect.value = "일정";
        this.dom.allDay.checked = true;
        this.toggleAllDayFields();
        this.dom.btnDelete.style.display = 'none';
        this.dom.modalStatus.innerHTML = '';
        this.setLoading(false);
    }

    showModalStatus(msg, type) {
        this.dom.modalStatus.innerHTML = `<div class="alert alert-${type} mb-0">${msg}</div>`;
    }

    setLoading(isLoading) {
        this.dom.btnSave.disabled = isLoading;
        this.dom.btnDelete.disabled = isLoading;
        this.dom.btnSave.innerHTML = isLoading ? '<span class="spinner-border spinner-border-sm"></span> 저장 중...' : '저장';
    }
}

window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['schedule'] = new ScheduleApp();