/**
 * TabManager: SPA Core Engine
 */
const TabManager = {
    tabs: [],
    activeTabId: null,
    tabHeaderContainer: null,
    tabContentContainer: null,

    init: function() {
        this.tabHeaderContainer = document.getElementById('app-tabs');
        this.tabContentContainer = document.getElementById('tab-content-container');
        
        // [신규 기능] 탭 내부의 링크 클릭(페이지네이션 등)을 가로채서 AJAX로 처리하는 전역 리스너
        this.tabContentContainer.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            
            // 링크가 아니거나, target="_blank"거나, javascript: 호출인 경우 무시
            if (!link || link.target === '_blank' || link.href.startsWith('javascript:') || link.href.includes('#')) return;
            
            // 다운로드 링크 등은 제외 (필요시 클래스로 구분)
            if (link.hasAttribute('download')) return;

            // 현재 활성화된 탭 찾기
            if (this.activeTabId) {
                e.preventDefault(); // 기본 이동 막기
                const url = link.href;
                console.log(`[SPA] Intercepting link to: ${url}`);
                
                // 현재 탭의 내용을 해당 URL로 교체
                this.loadContent(this.activeTabId, url);
                
                // (선택사항) 탭 객체의 URL 정보 업데이트 (새로고침 시 유지용)
                const tab = this.tabs.find(t => t.id === this.activeTabId);
                if (tab) tab.url = url;
            }
        });
    },

    open: function(title, url, id, isStatic = false) {
        const existingTab = this.tabs.find(t => t.id === id);
        if (existingTab) {
            this.activate(id);
            // 이미 열려있어도 내용을 최신으로 갱신하고 싶다면 아래 주석 해제
            // this.loadContent(id, url); 
            return;
        }

        const tabId = id;
        
        const tabHeader = document.createElement('li');
        tabHeader.className = 'nav-item';
        tabHeader.innerHTML = `
            <a class="nav-link" id="tab-link-${tabId}" onclick="TabManager.activate('${tabId}')">
                ${title}
                ${!isStatic ? `<i class="bi bi-x-lg btn-close-tab" onclick="event.stopPropagation(); TabManager.close('${tabId}')"></i>` : ''}
            </a>
        `;
        this.tabHeaderContainer.appendChild(tabHeader);

        const tabContent = document.createElement('div');
        tabContent.id = `tab-pane-${tabId}`;
        tabContent.className = 'tab-pane-wrapper';
        this.tabContentContainer.appendChild(tabContent);

        this.tabs.push({ id: tabId, url: url, title: title, isLoaded: false });

        this.loadContent(tabId, url);
        this.activate(tabId);
        
        if (window.innerWidth < 992) {
            const offcanvasEl = document.getElementById('mobileMenuSidebar');
            if (typeof bootstrap !== 'undefined' && offcanvasEl) {
                const offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
                if (offcanvas) offcanvas.hide();
            }
        }
    },

    activate: function(id) {
        this.activeTabId = id;

        this.tabs.forEach(tab => {
            const link = document.getElementById(`tab-link-${tab.id}`);
            const pane = document.getElementById(`tab-pane-${tab.id}`);
            
            if (tab.id === id) {
                if(link) link.classList.add('active');
                if(pane) pane.classList.add('active');
            } else {
                if(link) link.classList.remove('active');
                if(pane) pane.classList.remove('active');
            }
        });
    },

    close: function(id) {
        const tabIndex = this.tabs.findIndex(t => t.id === id);
        if (tabIndex === -1) return;

        const contentDiv = document.getElementById(`tab-pane-${id}`);
        if (contentDiv) {
            const moduleName = contentDiv.dataset.moduleName;
            if (moduleName && window.PageRegistry && window.PageRegistry[moduleName]) {
                try {
                    if (typeof window.PageRegistry[moduleName].destroy === 'function') {
                        window.PageRegistry[moduleName].destroy();
                    }
                } catch (e) {
                    console.error(`Error destroying module ${moduleName}:`, e);
                }
            }
        }

        const link = document.getElementById(`tab-link-${id}`);
        if (link && link.parentNode) link.parentNode.remove();
        if (contentDiv) contentDiv.remove();

        this.tabs.splice(tabIndex, 1);

        if (this.activeTabId === id) {
            if (this.tabs.length > 0) {
                const nextTab = this.tabs[Math.min(tabIndex, this.tabs.length - 1)];
                this.activate(nextTab.id);
            } else {
                this.activeTabId = null;
            }
        }
    },

    loadContent: async function(id, url) {
        const pane = document.getElementById(`tab-pane-${id}`);
        // 로딩 중 표시 (기존 내용 유지하고 위에 띄우거나, 내용을 지우고 띄울 수 있음. 여기선 지우고 띄움)
        pane.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-primary" role="status"></div></div>';

        try {
            const response = await fetch(url, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }

            const html = await response.text();
            pane.innerHTML = html;

            const contentWrapper = pane.querySelector('.page-content-wrapper');
            if (contentWrapper) {
                const moduleName = contentWrapper.dataset.pageModule;
                pane.dataset.moduleName = moduleName;

                if (moduleName && window.PageRegistry && window.PageRegistry[moduleName]) {
                    try {
                        if (typeof window.PageRegistry[moduleName].init === 'function') {
                            window.PageRegistry[moduleName].init(contentWrapper);
                        }
                    } catch (e) {
                        console.error(`Error initializing module ${moduleName}:`, e);
                    }
                }
            }

            const tab = this.tabs.find(t => t.id === id);
            if (tab) {
                tab.isLoaded = true;
                tab.url = url; // 현재 URL 업데이트 (페이지네이션 이동 등 반영)
            }

        } catch (error) {
            console.error('Tab Load Error:', error);
            pane.innerHTML = `<div class="alert alert-danger m-3">
                <h5 class="alert-heading">페이지 로드 실패</h5>
                <p>${error.message}</p>
                <button class="btn btn-outline-danger btn-sm" onclick="TabManager.loadContent('${id}', '${url}')">재시도</button>
            </div>`;
        }
    }
};