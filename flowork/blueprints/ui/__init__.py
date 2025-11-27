from flask import Blueprint, request, render_template as flask_render_template

ui_bp = Blueprint('ui', __name__, template_folder='../../templates')

# [핵심] 템플릿 렌더링 함수 래핑 (SPA 지원)
def render_template(template_name_or_list, **context):
    """
    AJAX 요청(TabManager)인 경우 내용만 있는 base_ajax.html을 상속받고,
    일반 브라우저 접속인 경우 뼈대가 있는 base.html을 상속받도록 처리합니다.
    """
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        context['extends_template'] = 'base_ajax.html'
    else:
        context['extends_template'] = 'base.html'
        
    return flask_render_template(template_name_or_list, **context)

# 하위 뷰 모듈 임포트 (순서 중요)
from . import main, product, order, sales, admin, errors, processors, stock_transfer, crm, operations, network, store_order, online