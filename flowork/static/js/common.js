/**
 * FLOWORK Common Utilities
 * - API 통신 래퍼 (CSRF 자동 처리)
 * - 포맷팅 함수 (금액, 날짜)
 * - 페이지 레지스트리 초기화 (SPA)
 */

const Flowork = {
    // CSRF 토큰 가져오기
    getCsrfToken: () => {
        return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    },

    // API 요청 래퍼 (fetch)
    api: async (url, options = {}) => {
        const defaults = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': Flowork.getCsrfToken()
            }
        };
        
        // 옵션 병합
        const settings = { ...defaults, ...options };
        if (options.headers) {
            settings.headers = { ...defaults.headers, ...options.headers };
        }

        try {
            const response = await fetch(url, settings);
            
            // 응답이 리다이렉트(로그인 페이지 이동 등)인 경우 처리
            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `Server Error: ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error("API Error:", error);
            throw error;
        }
    },

    // GET 요청 단축
    get: async (url) => {
        return await Flowork.api(url, { method: 'GET' });
    },

    // POST 요청 단축
    post: async (url, body) => {
        return await Flowork.api(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    // 숫자 포맷 (3자리 콤마)
    fmtNum: (num) => {
        return (num || 0).toLocaleString();
    },

    // 날짜 포맷 (YYYY-MM-DD)
    fmtDate: (dateObj) => {
        if (!dateObj) dateObj = new Date();
        if (typeof dateObj === 'string') dateObj = new Date(dateObj);
        
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};

// 전역 객체 등록
window.Flowork = Flowork;

// [신규] SPA 페이지 모듈 레지스트리 초기화
window.PageRegistry = window.PageRegistry || {};