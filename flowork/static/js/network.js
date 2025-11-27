/**
 * Network Logic (Announcement, Suggestion, Mail) - Refactored for SPA
 */

class NetworkApp {
    constructor() {
        this.container = null;
        this.csrfToken = null;
        this.handlers = {};
    }

    init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        
        // 1. 건의사항 작성 (suggestion_detail.html)
        const suggForm = container.querySelector('#suggestion-form');
        if (suggForm) {
            this.handlers.submitSuggestion = (e) => this.submitSuggestion(e);
            suggForm.addEventListener('submit', this.handlers.submitSuggestion);
        }

        // 2. 건의사항 댓글 (suggestion_detail.html)
        const btnComment = container.querySelector('#btn-save-comment');
        if (btnComment) {
            this.handlers.submitComment = () => this.submitComment(btnComment);
            btnComment.addEventListener('click', this.handlers.submitComment);
        }

        // 3. 건의사항 삭제 (suggestion_detail.html)
        const btnDelSugg = container.querySelector('.btn-delete-sugg');
        if (btnDelSugg) {
            this.handlers.deleteSuggestion = () => this.deleteSuggestion(btnDelSugg);
            btnDelSugg.addEventListener('click', this.handlers.deleteSuggestion);
        }

        // 4. 메일 발송 (mail_compose.html)
        const mailForm = container.querySelector('#mail-form');
        if (mailForm) {
            this.handlers.submitMail = (e) => this.submitMail(e);
            mailForm.addEventListener('submit', this.handlers.submitMail);
        }

        // 5. 메일 삭제 (mail_detail.html)
        const btnDelMail = container.querySelector('.btn-delete-mail');
        if (btnDelMail) {
            this.handlers.deleteMail = () => this.deleteMail(btnDelMail);
            btnDelMail.addEventListener('click', this.handlers.deleteMail);
        }
    }

    destroy() {
        // 등록된 핸들러가 있는 요소들만 찾아 제거
        const suggForm = this.container.querySelector('#suggestion-form');
        if (suggForm && this.handlers.submitSuggestion) {
            suggForm.removeEventListener('submit', this.handlers.submitSuggestion);
        }

        const btnComment = this.container.querySelector('#btn-save-comment');
        if (btnComment && this.handlers.submitComment) {
            btnComment.removeEventListener('click', this.handlers.submitComment);
        }

        const btnDelSugg = this.container.querySelector('.btn-delete-sugg');
        if (btnDelSugg && this.handlers.deleteSuggestion) {
            btnDelSugg.removeEventListener('click', this.handlers.deleteSuggestion);
        }

        const mailForm = this.container.querySelector('#mail-form');
        if (mailForm && this.handlers.submitMail) {
            mailForm.removeEventListener('submit', this.handlers.submitMail);
        }

        const btnDelMail = this.container.querySelector('.btn-delete-mail');
        if (btnDelMail && this.handlers.deleteMail) {
            btnDelMail.removeEventListener('click', this.handlers.deleteMail);
        }

        this.handlers = {};
        this.container = null;
    }

    // --- Action Methods ---

    async submitSuggestion(e) {
        e.preventDefault();
        const url = document.body.dataset.apiCreateUrl; // data-api-create-url은 suggestion_detail 템플릿 내 body_attrs로 설정됨 (SPA에서는 TabManager가 body를 갈아끼우지 않으므로 주의)
        // [수정] SPA에서는 body 속성을 갈아끼우지 않으므로, base_ajax.html의 wrapper에 속성을 넣고 container.dataset으로 접근해야 함.
        // 하지만 현재 구조상 템플릿에서 {% block body_attrs %}는 base.html의 body에 렌더링되는데,
        // base_ajax.html에서는 body 태그가 없습니다.
        // 따라서 각 템플릿의 <form>이나 wrapper div에 data 속성을 직접 넣는 방식으로 템플릿 수정이 필요할 수 있습니다.
        // 일단 현재는 container.dataset을 확인하거나, form 자체의 action을 활용하는 것이 좋습니다.
        
        // 임시 해결책: API URL을 하드코딩하거나 템플릿 내 input hidden으로 전달받음.
        // 여기서는 기존 로직 호환을 위해 '/api/suggestions' 직접 호출
        const apiUrl = '/api/suggestions';

        const title = this.container.querySelector('#title').value;
        const content = this.container.querySelector('#content').value;
        const isPrivate = this.container.querySelector('#is_private')?.checked || false;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify({ title, content, is_private: isPrivate })
            });
            const data = await response.json();
            
            if(data.status === 'success') {
                alert(data.message);
                // 탭 이동: 리스트로 복귀
                TabManager.open('건의사항', '/network/suggestions', 'suggestion');
            } else {
                alert(data.message);
            }
        } catch (e) { console.error(e); alert('오류 발생'); }
    }

    async submitComment(btn) {
        const id = btn.dataset.id;
        const content = this.container.querySelector('#comment-content').value;
        if (!content) return;
        
        try {
            const response = await fetch(`/api/suggestions/${id}/comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify({ content })
            });
            const data = await response.json();
            
            if(data.status === 'success') {
                // 현재 탭 리로드 (간단히 같은 URL 다시 로드)
                const currentTab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                if(currentTab) TabManager.loadContent(currentTab.id, currentTab.url);
            }
            else alert(data.message);
        } catch (e) { alert('오류 발생'); }
    }

    async deleteSuggestion(btn) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const id = btn.dataset.id;
        try {
            const response = await fetch(`/api/suggestions/${id}`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': this.csrfToken }
            });
            const data = await response.json();
            
            if(data.status === 'success') {
                TabManager.open('건의사항', '/network/suggestions', 'suggestion');
            }
            else alert(data.message);
        } catch (e) { alert('오류 발생'); }
    }

    async submitMail(e) {
        e.preventDefault();
        // mail_compose.html 템플릿의 body_attrs는 적용되지 않으므로 URL 하드코딩
        const apiUrl = '/api/mails'; 
        
        const payload = {
            target_store_id: this.container.querySelector('#receiver').value,
            title: this.container.querySelector('#title').value,
            content: this.container.querySelector('#content').value
        };
        
        if (!payload.target_store_id) {
            alert('받는 사람을 선택하세요.'); return;
        }
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrfToken },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if(data.status === 'success') {
                alert(data.message);
                TabManager.open('보낸 편지함', '/network/mail?type=sent', 'mail');
            } else {
                alert(data.message);
            }
        } catch (e) { alert('오류 발생'); }
    }

    async deleteMail(btn) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const id = btn.dataset.id;
        try {
            const response = await fetch(`/api/mails/${id}`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': this.csrfToken }
            });
            const data = await response.json();
            
            if(data.status === 'success') {
                // 뒤로가기 대신 목록으로 이동
                TabManager.open('점간메일', '/network/mail', 'mail');
            }
            else alert(data.message);
        } catch (e) { alert('오류 발생'); }
    }
}

// 전역 등록 (여러 페이지 모듈 키에 동일 인스턴스 사용)
const networkApp = new NetworkApp();
window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['announcements'] = networkApp;
window.PageRegistry['suggestion'] = networkApp;
window.PageRegistry['mail'] = networkApp;