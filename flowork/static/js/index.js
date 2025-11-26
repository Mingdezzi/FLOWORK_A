// 이미지 폴백 함수는 base.html의 head로 이동했으므로 여기서 제거해도 되지만, 
// 혹시 모를 호환성을 위해 window 객체 체크 후 정의합니다.
if (!window.imgFallback) {
    window.imgFallback = function(img) {
        const src = img.src;
        if (src.includes('_DF_01.jpg')) {
            img.src = src.replace('_DF_01.jpg', '_DM_01.jpg');
        } else if (src.includes('_DM_01.jpg')) {
            img.src = src.replace('_DM_01.jpg', '_DG_01.jpg');
        } else {
            img.style.visibility = 'hidden';
        }
    };
}

let currentIndexApp = null;

class IndexApp {
    constructor() {
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        this.liveSearchUrl = document.body.dataset.liveSearchUrl;
        this.debounceTimer = null;
        this.isKorShiftActive = false;

        this.dom = {
            searchInput: document.getElementById('search-query-input'),
            clearTopBtn: document.getElementById('keypad-clear-top'),
            categoryBar: document.getElementById('category-bar'),
            categoryButtons: document.querySelectorAll('.category-btn'),
            hiddenCategoryInput: document.getElementById('selected-category'),
            keypadContainer: document.getElementById('keypad-container'),
            keypadNum: document.getElementById('keypad-num'),
            keypadKor: document.getElementById('keypad-kor'),
            keypadEng: document.getElementById('keypad-eng'),
            productListUl: document.getElementById('product-list-ul'),
            listContainer: document.getElementById('product-list-view'),
            detailContainer: document.getElementById('product-detail-view'),
            detailIframe: document.getElementById('product-detail-iframe'),
            backButton: document.getElementById('btn-back-to-list'),
            productListHeader: document.getElementById('product-list-header'),
            paginationUL: document.getElementById('search-pagination'),
            searchForm: document.getElementById('search-form'),
            korShiftBtn: document.querySelector('#keypad-kor [data-key="shift-kor"]')
        };

        this.korKeyMap = {
            'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ',
            'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ'
        };
        this.korReverseKeyMap = {
            'ㅃ': 'ㅂ', 'ㅉ': 'ㅈ', 'ㄸ': 'ㄷ', 'ㄲ': 'ㄱ', 'ㅆ': 'ㅅ',
            'ㅒ': 'ㅐ', 'ㅖ': 'ㅔ'
        };

        this.init();
    }

    init() {
        this.checkMobile();
        this.bindEvents();
        this.showKeypad('num');
        
        if (this.dom.hiddenCategoryInput) {
            const currentCategory = this.dom.hiddenCategoryInput.value || '전체';
            this.dom.categoryButtons.forEach(btn => {
                if (btn.dataset.category === currentCategory) {
                    btn.classList.add('active');
                }
            });
        }
        
        // 페이지 로드 시 자동 검색 (검색창이 있고 값이 있을 때만)
        if (this.dom.searchInput && this.dom.searchInput.value.trim() !== '') {
             this.performSearch(1);
        } else if (this.dom.searchInput) {
             // 초기 로드 시 전체 목록 조회
             this.performSearch(1);
        }
    }

    destroy() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        // 필요한 경우 이벤트 리스너 해제 로직 추가 가능
    }

    checkMobile() {
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile && this.dom.searchInput) {
            this.dom.searchInput.setAttribute('readonly', true);
            this.dom.searchInput.setAttribute('inputmode', 'none');
        }
    }

    bindEvents() {
        // 상품 리스트 클릭
        if (this.dom.productListUl) {
            this.dom.productListUl.addEventListener('click', (e) => {
                const link = e.target.closest('a.product-item');
                if (link && window.innerWidth >= 992) {
                    e.preventDefault();
                    const targetUrl = link.getAttribute('href');
                    const detailUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'partial=1';
                    if (this.dom.detailIframe) this.dom.detailIframe.src = detailUrl;
                    if (this.dom.listContainer && this.dom.detailContainer) {
                        this.dom.listContainer.style.display = 'none';
                        this.dom.detailContainer.style.display = 'flex';
                    }
                }
            });
        }

        // 뒤로가기 버튼
        if (this.dom.backButton) {
            this.dom.backButton.addEventListener('click', () => {
                if (this.dom.listContainer && this.dom.detailContainer) {
                    this.dom.listContainer.style.display = 'flex';
                    this.dom.detailContainer.style.display = 'none';
                }
                if (this.dom.detailIframe) this.dom.detailIframe.src = 'about:blank';
            });
        }

        // 키패드 클릭
        if (this.dom.keypadContainer) {
            this.dom.keypadContainer.addEventListener('click', (e) => this.handleKeypadClick(e));
        }

        // 카테고리 버튼
        if (this.dom.categoryBar) {
            this.dom.categoryBar.addEventListener('click', (e) => {
                const target = e.target.closest('.category-btn');
                if (!target) return;
                this.dom.categoryButtons.forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
                this.dom.hiddenCategoryInput.value = target.dataset.category;
                this.performSearch(1);
                this.dom.searchInput.focus();
            });
        }

        // Clear 버튼
        if (this.dom.clearTopBtn) {
            this.dom.clearTopBtn.addEventListener('click', () => {
                this.dom.searchInput.value = '';
                this.performSearch(1);
                this.dom.searchInput.focus();
            });
        }

        // 검색어 입력
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener('input', (e) => {
                if (e.isTrusted && !e.target.readOnly) this.triggerSearch();
            });
            this.dom.searchInput.addEventListener('keydown', (e) => {
                if (!e.target.readOnly && e.key === 'Enter') {
                    clearTimeout(this.debounceTimer);
                    this.performSearch(1);
                }
            });
        }

        // 폼 제출
        if (this.dom.searchForm) {
            this.dom.searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                clearTimeout(this.debounceTimer);
                this.performSearch(1);
            });
        }
    }

    updateKorKeypadVisuals() {
        if (this.isKorShiftActive) {
            if (this.dom.korShiftBtn) {
                this.dom.korShiftBtn.classList.add('active', 'btn-primary');
                this.dom.korShiftBtn.classList.remove('btn-outline-secondary');
            }
            for (const [base, shifted] of Object.entries(this.korKeyMap)) {
                const keyEl = this.dom.keypadKor.querySelector(`[data-key="${base}"]`);
                if (keyEl) {
                    keyEl.dataset.key = shifted;
                    keyEl.textContent = shifted;
                }
            }
        } else {
            if (this.dom.korShiftBtn) {
                this.dom.korShiftBtn.classList.remove('active', 'btn-primary');
                this.dom.korShiftBtn.classList.add('btn-outline-secondary');
            }
            for (const [shifted, base] of Object.entries(this.korReverseKeyMap)) {
                const keyEl = this.dom.keypadKor.querySelector(`[data-key="${shifted}"]`);
                if (keyEl) {
                    keyEl.dataset.key = base;
                    keyEl.textContent = base;
                }
            }
        }
    }

    showKeypad(mode) {
        if(this.dom.keypadNum) this.dom.keypadNum.classList.add('keypad-hidden');
        if(this.dom.keypadKor) this.dom.keypadKor.classList.add('keypad-hidden');
        if(this.dom.keypadEng) this.dom.keypadEng.classList.add('keypad-hidden');

        if (mode === 'kor') {
            if(this.dom.keypadKor) this.dom.keypadKor.classList.remove('keypad-hidden');
            document.body.dataset.inputMode = 'kor';
        } else if (mode === 'eng') {
            if(this.dom.keypadEng) this.dom.keypadEng.classList.remove('keypad-hidden');
            document.body.dataset.inputMode = 'eng';
        } else {
            if(this.dom.keypadNum) this.dom.keypadNum.classList.remove('keypad-hidden');
            document.body.dataset.inputMode = 'num';
        }
    }

    handleKeypadClick(e) {
        const key = e.target.closest('.keypad-btn, .qwerty-key');
        if (!key) return;

        const dataKey = key.dataset.key;
        if (!dataKey) return;

        if (dataKey === 'backspace') {
            let currentValue = this.dom.searchInput.value;
            if (currentValue.length > 0) {
                // 한글 자모 분리 로직 (Hangul.js가 있다면)
                if (window.Hangul && Hangul.isComplete(currentValue.slice(-1))) {
                    let disassembled = Hangul.disassemble(currentValue);
                    disassembled.pop();
                    this.dom.searchInput.value = Hangul.assemble(disassembled);
                } else {
                    this.dom.searchInput.value = currentValue.slice(0, -1);
                }
            }
            this.triggerSearch();
        } else if (dataKey === 'mode-kor') {
            this.showKeypad('kor');
        } else if (dataKey === 'mode-eng') {
            this.showKeypad('eng');
            if (this.isKorShiftActive) {
                this.isKorShiftActive = false;
                this.updateKorKeypadVisuals();
            }
        } else if (dataKey === 'mode-num') {
            this.showKeypad('num');
            if (this.isKorShiftActive) {
                this.isKorShiftActive = false;
                this.updateKorKeypadVisuals();
            }
        } else if (dataKey === 'shift-kor') {
            this.isKorShiftActive = !this.isKorShiftActive;
            this.updateKorKeypadVisuals();
        } else if (dataKey === 'shift-eng') {
            // 영어 Shift 기능 (필요 시 구현)
        } else if (dataKey === ' ') {
            this.dom.searchInput.value += ' ';
            this.triggerSearch();
        } else {
            // 한글 조합
            if (window.Hangul) {
                this.dom.searchInput.value = Hangul.assemble(this.dom.searchInput.value + dataKey);
            } else {
                this.dom.searchInput.value += dataKey;
            }
            this.triggerSearch();
        }
        this.dom.searchInput.focus();
    }

    triggerSearch() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => { this.performSearch(1); }, 300);
    }

    async performSearch(page = 1) {
        const query = this.dom.searchInput.value;
        const category = this.dom.hiddenCategoryInput ? this.dom.hiddenCategoryInput.value : '전체';
        const perPage = 10;

        if (this.dom.productListUl) {
            this.dom.productListUl.innerHTML = '<li class="list-group-item text-center text-muted p-4">검색 중...</li>';
        }
        if (this.dom.paginationUL) {
            this.dom.paginationUL.innerHTML = '';
        }

        try {
            const response = await fetch(this.liveSearchUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.csrfToken
                },
                body: JSON.stringify({ 
                    query: query, 
                    category: category,
                    page: page,
                    per_page: perPage
                })
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            
            if (data.status === 'success') {
                if (this.dom.listContainer && this.dom.detailContainer) {
                    if (window.innerWidth >= 992) {
                        // 데스크탑: 리스트 유지
                    } else {
                        // 모바일: 검색 시 리스트 보여주기
                        this.dom.listContainer.style.display = 'flex';
                        this.dom.detailContainer.style.display = 'none';
                    }
                }
                
                this.renderResults(data.products, data.showing_favorites, data.selected_category);
                this.renderPagination(data.total_pages, data.current_page);
            } else { 
                throw new Error(data.message || 'API error'); 
            }
        } catch (error) {
            console.error('실시간 검색 오류:', error);
            if (this.dom.productListUl) {
                this.dom.productListUl.innerHTML = '<li class="list-group-item text-center text-danger p-4">검색 중 오류가 발생했습니다.</li>';
            }
        }
    }

    renderResults(products, showingFavorites, selectedCategory) {
        if (!this.dom.productListHeader || !this.dom.productListUl) return;

        if (showingFavorites) {
            this.dom.productListHeader.innerHTML = '<i class="bi bi-star-fill me-2 text-warning"></i>즐겨찾기 목록';
        } else {
            let categoryBadge = '';
            if (selectedCategory && selectedCategory !== '전체') {
                categoryBadge = `<span class="badge bg-success ms-2 rounded-0">${selectedCategory}</span>`;
            }
            this.dom.productListHeader.innerHTML = `<i class="bi bi-card-list me-2"></i>상품 검색 결과 ${categoryBadge}`;
        }
        this.dom.productListUl.innerHTML = '';
        if (!products || products.length === 0) {
            const message = showingFavorites ? '즐겨찾기 상품 없음.' : '검색된 상품 없음.';
            this.dom.productListUl.innerHTML = `<li class="list-group-item text-center text-muted p-5">${message}</li>`;
            return;
        }
        products.forEach(product => {
            const productHtml = `
                <li class="list-group-item p-3">
                    <a href="/product/${product.product_id}" class="product-item d-flex align-items-center text-decoration-none text-body">
                        <img src="${product.image_url}" alt="${product.product_name}" class="item-image rounded-0 border flex-shrink-0 p-1" style="width:60px; height:60px; object-fit:contain; background:#fff;" onerror="imgFallback(this)">
                        <div class="item-details flex-grow-1 ms-3">
                            <div class="product-name fw-bold text-dark">${product.product_name}</div>
                            <div class="product-meta small text-muted mt-1">
                                <span class="meta-item me-2 badge bg-light text-dark border rounded-0">${product.product_number}</span>
                                ${product.colors ? `<span class="meta-item d-inline-block me-2 text-secondary"><i class="bi bi-palette"></i> ${product.colors}</span>` : ''}
                                <span class="meta-item me-2 fw-bold text-primary">${product.sale_price}</span>
                                <span class="meta-item discount ${product.original_price > 0 ? 'text-danger fw-bold' : 'text-secondary'}">${product.discount}</span>
                            </div>
                        </div>
                    </a>
                </li>
            `;
            this.dom.productListUl.insertAdjacentHTML('beforeend', productHtml);
        });
    }

    renderPagination(totalPages, currentPage) {
        if (!this.dom.paginationUL) return;
        this.dom.paginationUL.innerHTML = '';
        if (totalPages <= 1) return;

        const createPageItem = (pageNum, text, isActive = false, isDisabled = false) => {
            const li = document.createElement('li');
            li.className = `page-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`;
            
            const a = document.createElement('a');
            a.className = 'page-link rounded-0';
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

// [중요] 중복 실행 방지 로직
if (!window.isIndexAppLoaded) {
    window.isIndexAppLoaded = true;
    
    document.addEventListener('turbo:load', () => {
        if (document.getElementById('search-query-input')) {
            if (currentIndexApp) {
                currentIndexApp.destroy();
            }
            currentIndexApp = new IndexApp();
        }
    });

    document.addEventListener('turbo:before-cache', () => {
        if (currentIndexApp) {
            currentIndexApp.destroy();
            currentIndexApp = null;
        }
    });
}