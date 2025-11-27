/**
 * Dashboard & Search Logic (Refactored for SPA)
 */

class DashboardApp {
    constructor() {
        this.container = null;
        this.debounceTimer = null;
        this.isKorShiftActive = false;
        
        // 상수 및 매핑 데이터
        this.korKeyMap = { 'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ', 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ' };
        this.korReverseKeyMap = { 'ㅃ': 'ㅂ', 'ㅉ': 'ㅈ', 'ㄸ': 'ㄷ', 'ㄲ': 'ㄱ', 'ㅆ': 'ㅅ', 'ㅒ': 'ㅐ', 'ㅖ': 'ㅔ' };
        
        // 이벤트 핸들러 바인딩 (제거를 위해 저장)
        this.handlers = {
            productListClick: (e) => this.handleProductListClick(e),
            backButtonClick: () => this.handleBackButtonClick(),
            keypadClick: (e) => this.handleKeypadClick(e),
            categoryClick: (e) => this.handleCategoryClick(e),
            clearTopClick: () => this.handleClearTopClick(),
            searchInput: (e) => this.handleSearchInput(e),
            searchKeydown: (e) => this.handleSearchKeydown(e),
            searchSubmit: (e) => { e.preventDefault(); clearTimeout(this.debounceTimer); this.performSearch(1); }
        };
    }

    init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        this.liveSearchUrl = document.body.dataset.liveSearchUrl; // base.html의 data 속성 활용

        // DOM 요소 캐싱 (Scoped)
        this.dom = {
            searchInput: container.querySelector('#search-query-input'),
            clearTopBtn: container.querySelector('#keypad-clear-top'),
            categoryBar: container.querySelector('#category-bar'),
            hiddenCategoryInput: container.querySelector('#selected-category'),
            keypadContainer: container.querySelector('#keypad-container'),
            keypadNum: container.querySelector('#keypad-num'),
            keypadKor: container.querySelector('#keypad-kor'),
            keypadEng: container.querySelector('#keypad-eng'),
            korShiftBtn: container.querySelector('#keypad-kor [data-key="shift-kor"]'),
            
            productListUl: container.querySelector('#product-list-ul'),
            listContainer: container.querySelector('#product-list-view'),
            detailContainer: container.querySelector('#product-detail-view'),
            detailIframe: container.querySelector('#product-detail-iframe'),
            backButton: container.querySelector('#btn-back-to-list'),
            productListHeader: container.querySelector('#product-list-header'),
            paginationUL: container.querySelector('#search-pagination'),
            searchForm: container.querySelector('#search-form')
        };

        // 모바일 체크 및 속성 설정
        if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            if (this.dom.searchInput) {
                this.dom.searchInput.setAttribute('readonly', true);
                this.dom.searchInput.setAttribute('inputmode', 'none');
            }
        }

        this.bindEvents();
        
        // 초기화 로직
        if(this.dom.keypadContainer) this.showKeypad('num');
        
        // 카테고리 초기 상태 반영
        if (this.dom.hiddenCategoryInput && this.dom.categoryBar) {
            const currentCategory = this.dom.hiddenCategoryInput.value || '전체';
            const btns = this.dom.categoryBar.querySelectorAll('.category-btn');
            btns.forEach(btn => {
                if (btn.dataset.category === currentCategory) btn.classList.add('active');
            });
        }

        // 페이지 진입 시 자동 검색 (검색 페이지인 경우)
        if (this.dom.productListUl) {
            this.performSearch(1);
        }
    }

    destroy() {
        if (this.dom.productListUl) this.dom.productListUl.removeEventListener('click', this.handlers.productListClick);
        if (this.dom.backButton) this.dom.backButton.removeEventListener('click', this.handlers.backButtonClick);
        if (this.dom.keypadContainer) this.dom.keypadContainer.removeEventListener('click', this.handlers.keypadClick);
        if (this.dom.categoryBar) this.dom.categoryBar.removeEventListener('click', this.handlers.categoryClick);
        if (this.dom.clearTopBtn) this.dom.clearTopBtn.removeEventListener('click', this.handlers.clearTopClick);
        
        if (this.dom.searchInput) {
            this.dom.searchInput.removeEventListener('input', this.handlers.searchInput);
            this.dom.searchInput.removeEventListener('keydown', this.handlers.searchKeydown);
        }
        if (this.dom.searchForm) this.dom.searchForm.removeEventListener('submit', this.handlers.searchSubmit);

        clearTimeout(this.debounceTimer);
        this.container = null;
        this.dom = {};
    }

    bindEvents() {
        if (this.dom.productListUl) this.dom.productListUl.addEventListener('click', this.handlers.productListClick);
        if (this.dom.backButton) this.dom.backButton.addEventListener('click', this.handlers.backButtonClick);
        if (this.dom.keypadContainer) this.dom.keypadContainer.addEventListener('click', this.handlers.keypadClick);
        if (this.dom.categoryBar) this.dom.categoryBar.addEventListener('click', this.handlers.categoryClick);
        if (this.dom.clearTopBtn) this.dom.clearTopBtn.addEventListener('click', this.handlers.clearTopClick);
        
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener('input', this.handlers.searchInput);
            this.dom.searchInput.addEventListener('keydown', this.handlers.searchKeydown);
        }
        if (this.dom.searchForm) this.dom.searchForm.addEventListener('submit', this.handlers.searchSubmit);
    }

    // --- Event Handlers ---

    handleProductListClick(e) {
        const link = e.target.closest('a.product-item');
        if (link) {
            if (window.innerWidth >= 992) {
                e.preventDefault();
                const targetUrl = link.getAttribute('href');
                const detailUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'partial=1';
                
                if (this.dom.detailIframe) this.dom.detailIframe.src = detailUrl;
                
                if (this.dom.listContainer && this.dom.detailContainer) {
                    this.dom.listContainer.style.display = 'none';
                    this.dom.detailContainer.style.display = 'flex';
                }
            } else {
                // 모바일에서는 TabManager를 통해 새 탭이나 현재 탭 이동 처리
                // href가 있으므로 기본 동작(페이지 이동) 대신 탭 열기로 가로채야 함
                e.preventDefault();
                const url = link.getAttribute('href');
                // 상세 페이지는 고유 ID를 생성하기 어려우므로 'product_detail' 같은 고정 ID를 쓰거나 타임스탬프 사용
                // 여기서는 간단히 'product_detail' ID 재사용 (하나만 열림)
                TabManager.open('상품상세', url, 'product_detail_' + url.split('/').pop());
            }
        }
    }

    handleBackButtonClick() {
        if (this.dom.listContainer && this.dom.detailContainer) {
            this.dom.listContainer.style.display = 'flex';
            this.dom.detailContainer.style.display = 'none';
        }
        if (this.dom.detailIframe) {
            this.dom.detailIframe.src = 'about:blank';
        }
    }

    handleKeypadClick(e) {
        const key = e.target.closest('.keypad-btn, .qwerty-key');
        if (!key) return;

        const dataKey = key.dataset.key;
        if (!dataKey) return;

        const input = this.dom.searchInput;

        if (dataKey === 'backspace') {
            let currentValue = input.value;
            if (currentValue.length > 0) {
                input.value = currentValue.slice(0, -1);
            }
            this.triggerSearch();
        } 
        else if (dataKey === 'mode-kor') { this.showKeypad('kor'); } 
        else if (dataKey === 'mode-eng') { 
            this.showKeypad('eng'); 
            if (this.isKorShiftActive) { this.isKorShiftActive = false; this.updateKorKeypadVisuals(); }
        } 
        else if (dataKey === 'mode-num') { 
            this.showKeypad('num'); 
            if (this.isKorShiftActive) { this.isKorShiftActive = false; this.updateKorKeypadVisuals(); }
        }
        else if (dataKey === 'shift-kor') {
            this.isKorShiftActive = !this.isKorShiftActive;
            this.updateKorKeypadVisuals();
        }
        else if (dataKey === 'shift-eng') { /* 영문 쉬프트 로직 생략 */ }
        else if (dataKey === ' ') {
            input.value += ' ';
            this.triggerSearch();
        }
        else {
            input.value = Hangul.assemble(input.value + dataKey);
            this.triggerSearch();
        }
        
        input.focus();
    }

    handleCategoryClick(e) {
        const target = e.target.closest('.category-btn');
        if (!target) return;

        const btns = this.dom.categoryBar.querySelectorAll('.category-btn');
        btns.forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
        this.dom.hiddenCategoryInput.value = target.dataset.category;
        this.performSearch(1);
        this.dom.searchInput.focus();
    }

    handleClearTopClick() {
        this.dom.searchInput.value = '';
        this.performSearch(1);
        this.dom.searchInput.focus();
    }

    handleSearchInput(e) {
        if (e.isTrusted && !e.target.readOnly) { 
            this.triggerSearch();
        }
    }

    handleSearchKeydown(e) {
        if (e.target.readOnly) return;
        if (e.key === 'Enter') {
            clearTimeout(this.debounceTimer);
            this.performSearch(1);
        }
    }

    // --- Helper Methods ---

    updateKorKeypadVisuals() {
        // container 내부에서 다시 찾아야 안전
        const shiftBtn = this.dom.korShiftBtn; 
        if(!shiftBtn) return;

        if (this.isKorShiftActive) {
            shiftBtn.classList.add('active', 'btn-primary');
            shiftBtn.classList.remove('btn-outline-secondary');
            for (const [base, shifted] of Object.entries(this.korKeyMap)) {
                const keyEl = this.dom.keypadKor.querySelector(`[data-key="${base}"]`);
                if (keyEl) { keyEl.dataset.key = shifted; keyEl.textContent = shifted; }
            }
        } else {
            shiftBtn.classList.remove('active', 'btn-primary');
            shiftBtn.classList.add('btn-outline-secondary');
            for (const [shifted, base] of Object.entries(this.korReverseKeyMap)) {
                const keyEl = this.dom.keypadKor.querySelector(`[data-key="${shifted}"]`);
                if (keyEl) { keyEl.dataset.key = base; keyEl.textContent = base; }
            }
        }
    }

    showKeypad(mode) {
        this.dom.keypadNum.classList.add('keypad-hidden');
        this.dom.keypadKor.classList.add('keypad-hidden');
        this.dom.keypadEng.classList.add('keypad-hidden');

        if (mode === 'kor') {
            this.dom.keypadKor.classList.remove('keypad-hidden');
        } else if (mode === 'eng') {
            this.dom.keypadEng.classList.remove('keypad-hidden');
        } else {
            this.dom.keypadNum.classList.remove('keypad-hidden');
        }
    }

    triggerSearch() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => { this.performSearch(1); }, 300);
    }

    async performSearch(page = 1) {
        if(!this.dom.productListUl) return;

        const query = this.dom.searchInput.value;
        const category = this.dom.hiddenCategoryInput ? this.dom.hiddenCategoryInput.value : '전체';
        const perPage = 10;

        this.dom.productListUl.innerHTML = '<li class="list-group-item text-center text-muted p-4">검색 중...</li>';
        this.dom.paginationUL.innerHTML = '';

        try {
            const response = await fetch(this.liveSearchUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken
                },
                body: JSON.stringify({ query, category, page, per_page: perPage })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                if (this.dom.listContainer && this.dom.detailContainer) {
                    this.dom.listContainer.style.display = 'flex';
                    this.dom.detailContainer.style.display = 'none';
                }
                if (this.dom.detailIframe) this.dom.detailIframe.src = 'about:blank';

                this.renderResults(data.products, data.showing_favorites, data.selected_category);
                this.renderPagination(data.total_pages, data.current_page);
            } else { 
                throw new Error(data.message || 'API error'); 
            }
        } catch (error) {
            console.error('Search error:', error);
            this.dom.productListUl.innerHTML = '<li class="list-group-item text-center text-danger p-4">오류가 발생했습니다.</li>';
        }
    }

    renderResults(products, showingFavorites, selectedCategory) {
        if (this.dom.productListHeader) {
            if (showingFavorites) {
                this.dom.productListHeader.innerHTML = '<i class="bi bi-star-fill me-2 text-warning"></i>즐겨찾기 목록';
            } else {
                let categoryBadge = '';
                if (selectedCategory && selectedCategory !== '전체') {
                    categoryBadge = `<span class="badge bg-success ms-2">${selectedCategory}</span>`;
                }
                this.dom.productListHeader.innerHTML = `<i class="bi bi-card-list me-2"></i>상품 검색 결과 ${categoryBadge}`;
            }
        }

        this.dom.productListUl.innerHTML = '';
        if (products.length === 0) {
            const message = showingFavorites ? '즐겨찾기 상품 없음.' : '검색된 상품 없음.';
            this.dom.productListUl.innerHTML = `<li class="list-group-item text-center text-muted p-4">${message}</li>`;
            return;
        }

        products.forEach(product => {
            const productHtml = `
                <li class="list-group-item">
                    <a href="/product/${product.product_id}" class="product-item d-flex align-items-center text-decoration-none text-body">
                        <img src="${product.image_url}" alt="${product.product_name}" class="item-image rounded border flex-shrink-0" onerror="imgFallback(this)">
                        <div class="item-details flex-grow-1 ms-3">
                            <div class="product-name fw-bold">${product.product_name}</div>
                            <div class="product-meta small text-muted">
                                <span class="meta-item me-2">${product.product_number}</span>
                                ${product.colors ? `<span class="meta-item d-block d-sm-inline me-2"><i class="bi bi-palette"></i> ${product.colors}</span>` : ''}
                                <span class="meta-item me-2 fw-bold text-dark">${product.sale_price}</span>
                                <span class="meta-item discount ${product.original_price > 0 ? 'text-danger' : 'text-secondary'}">${product.discount}</span>
                            </div>
                        </div>
                    </a>
                </li>
            `;
            this.dom.productListUl.insertAdjacentHTML('beforeend', productHtml);
        });
    }

    renderPagination(totalPages, currentPage) {
        this.dom.paginationUL.innerHTML = '';
        if (totalPages <= 1) return;

        const createPageItem = (pageNum, text, isActive = false, isDisabled = false) => {
            const li = document.createElement('li');
            li.className = `page-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`;
            
            const a = document.createElement('a');
            a.className = 'page-link';
            a.href = '#';
            a.textContent = text;
            
            if (!isDisabled && !isActive) {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.performSearch(pageNum);
                });
            }
            li.appendChild(a);
            return li;
        };

        this.dom.paginationUL.appendChild(createPageItem(currentPage - 1, '«', false, currentPage === 1));

        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);

        if (endPage - startPage < 4) {
            if (startPage === 1) endPage = Math.min(totalPages, startPage + 4);
            else if (endPage === totalPages) startPage = Math.max(1, endPage - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            this.dom.paginationUL.appendChild(createPageItem(i, i, i === currentPage));
        }

        this.dom.paginationUL.appendChild(createPageItem(currentPage + 1, '»', false, currentPage === totalPages));
    }
}

// 전역 등록
window.PageRegistry = window.PageRegistry || {};
// home과 search 2개 템플릿에서 모두 사용될 수 있으므로
const dashboardApp = new DashboardApp();
window.PageRegistry['home'] = dashboardApp;
window.PageRegistry['search'] = dashboardApp;