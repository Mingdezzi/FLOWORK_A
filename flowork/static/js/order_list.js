class OrderListApp {
    constructor() {
        this.container = null;
        this.csrfToken = null;
        this.updateStatusUrl = null;
        this.handlers = {};
    }

    init(container) {
        this.container = container;
        this.csrfToken = Flowork.getCsrfToken();
        this.updateStatusUrl = document.body.dataset.updateStatusUrl || '/api/update_order_status';

        this.handlers.statusClick = (e) => this.handleStatusClick(e);
        this.container.addEventListener('click', this.handlers.statusClick);
    }

    destroy() {
        if (this.container) {
            this.container.removeEventListener('click', this.handlers.statusClick);
        }
        this.container = null;
        this.handlers = {};
    }

    async handleStatusClick(e) {
        const targetButton = e.target.closest('.status-btn');
        
        if (!targetButton || targetButton.classList.contains('active')) {
            return;
        }

        const orderId = targetButton.dataset.orderId;
        const newStatus = targetButton.dataset.newStatus;
        
        if (!orderId || !newStatus) return;

        if (confirm(`주문(ID: ${orderId})의 상태를 [${newStatus}](으)로 변경하시겠습니까?`)) {
            try {
                const response = await fetch(this.updateStatusUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.csrfToken
                    },
                    body: JSON.stringify({
                        order_id: orderId,
                        new_status: newStatus
                    })
                });

                const data = await response.json();

                if (response.ok && data.status === 'success') {
                    alert('상태가 변경되었습니다.');
                    if (TabManager && TabManager.activeTabId) {
                        const tab = TabManager.tabs.find(t => t.id === TabManager.activeTabId);
                        if (tab) TabManager.loadContent(tab.id, tab.url);
                    } else {
                        window.location.reload();
                    }
                } else {
                    throw new Error(data.message || '상태 변경에 실패했습니다.');
                }
            } catch (error) {
                console.error('Order status update error:', error);
                alert(`오류: ${error.message}`);
            }
        }
    }
}

window.PageRegistry = window.PageRegistry || {};
window.PageRegistry['order_list'] = new OrderListApp();