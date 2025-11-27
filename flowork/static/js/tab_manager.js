/**
 * TabManager: SPA Core Engine (Optimized with Caching)
 */
const TabManager = {
    tabs: [],
    activeTabId: null,
    tabHeaderContainer: null,
    tabContentContainer: null,
    htmlCache: {}, // [최적화] HTML 템플릿 캐시 저장소

    init: function() {
        this.tabHeaderContainer = document.getElementById('app-tabs');
        this.tabContentContainer = document.getElementById('tab-content-container');
        
        // 탭 내부 링크 클릭 가로채기 (AJAX 처리)
        this.tabContentContainer.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link || link.target === '_blank' || link.href.startsWith('javascript:') || link.href.includes('#')) return;
            if (link.hasAttribute('download')) return;

            if (this.activeTabId) {
                e.preventDefault();
                this.loadContent(this.activeTabId, link.href);
            }
        });
    },

    open: function(title, url, id, isStatic = false) {
        const existingTab = this.tabs.find(t => t.id === id);
        if (existingTab) {
            this.activate(id);
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

        // JS 모듈 정리
        const contentDiv = document.getElementById(`tab-pane-${id}`);
        if (contentDiv) {
            const moduleName = contentDiv.dataset.moduleName;
            if (moduleName && window.PageRegistry && window.PageRegistry[moduleName]) {
                try {
                    if (typeof window.PageRegistry[moduleName].destroy === 'function') {
                        window.PageRegistry[moduleName].destroy();
                    }
                } catch (e) { console.error(`Error destroying module ${moduleName}:`, e); }
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
        
        // [최적화] 캐시된 HTML이 있으면 즉시 렌더링
        // (단, URL에 쿼리 파라미터가 있거나 데이터 갱신이 필요한 페이지는 캐시 정책을 주의해야 함.
        //  여기서는 기본 UI 뼈대 로딩 속도 향상을 위해 URL 기반 단순 캐싱 적용)
        if (this.htmlCache[url]) {
            console.log(`[SPA] Cache Hit: ${url}`);
            this.renderHtml(pane, this.htmlCache[url], id);
            return;
        }

        pane.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-primary" role="status"></div></div>';

        try {
            const response = await fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            
            if (response.redirected) {
                window.location.href = response.url;
                return;
            }
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

            const html = await response.text();
            
            // [최적화] 성공한 HTML 캐싱
            this.htmlCache[url] = html;
            
            this.renderHtml(pane, html, id);

            // URL 업데이트 (페이지네이션 등)
            const tab = this.tabs.find(t => t.id === id);
            if (tab) {
                tab.isLoaded = true;
                tab.url = url; 
            }

        } catch (error) {
            console.error('Tab Load Error:', error);
            pane.innerHTML = `<div class="alert alert-danger m-3">
                <h5 class="alert-heading">로드 실패</h5>
                <p>${error.message}</p>
                <button class="btn btn-outline-danger btn-sm" onclick="TabManager.loadContent('${id}', '${url}')">재시도</button>
            </div>`;
        }
    },

    renderHtml: function(pane, html, id) {
        pane.innerHTML = html;

        const contentWrapper = pane.querySelector('.page-content-wrapper');
        if (contentWrapper) {
            const moduleName = contentWrapper.dataset.pageModule;
            pane.dataset.moduleName = moduleName;

            if (moduleName && window.PageRegistry && window.PageRegistry[moduleName]) {
                try {
                    if (typeof window.PageRegistry[moduleName].init === 'function') {
                        // 모듈 실행 (여기서 API 데이터를 비동기로 가져와 화면을 채움)
                        window.PageRegistry[moduleName].init(contentWrapper);
                    }
                } catch (e) { console.error(`Error initializing module ${moduleName}:`, e); }
            }
        }
    }
};