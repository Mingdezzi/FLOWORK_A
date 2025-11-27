import json
import traceback
from flask import render_template, request, abort, current_app
from flask_login import login_required, current_user
from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from flowork.models import db, Product, Variant, Store, Setting
from flowork.utils import clean_string_upper
from flowork.services.db import get_filter_options_from_db
from flowork.services.product_service import ProductService
from . import ui_bp

@ui_bp.route('/product/<int:product_id>')
@login_required
def product_detail(product_id):
    if current_user.is_super_admin:
        abort(403, description="슈퍼 관리자는 상품 상세를 볼 수 없습니다.")

    is_partial = request.args.get('partial') == '1'

    try:
        current_brand_id = current_user.current_brand_id
        my_store_id = current_user.store_id
        
        # 서비스 호출로 로직 위임
        data = ProductService.get_product_detail_context(product_id, current_brand_id, my_store_id)
        
        if not data:
            abort(404, description="상품을 찾을 수 없거나 권한이 없습니다.")

        context = {
            'active_page': 'product_detail', 
            'is_partial': is_partial,
            **data 
        }
        return render_template('detail.html', **context)

    except Exception as e:
        current_app.logger.error(f"Error loading product detail: {e}")
        traceback.print_exc()
        abort(500, description="상품 상세 정보를 불러오는 중 오류가 발생했습니다.")

@ui_bp.route('/stock_overview')
@login_required
def stock_overview():
    if not current_user.is_admin or current_user.store_id:
        abort(403, description="통합 재고 현황은 본사 관리자만 조회할 수 있습니다.")
    
    try:
        # 서비스 호출로 로직 위임
        data = ProductService.get_stock_overview_matrix(current_user.current_brand_id)

        context = {
            'active_page': 'stock_overview',
            **data # all_stores, all_variants, stock_matrix 포함
        }
        return render_template('stock_overview.html', **context)

    except Exception as e:
        current_app.logger.error(f"Error loading stock overview: {e}")
        traceback.print_exc()
        abort(500, description="통합 재고 현황 로드 중 오류가 발생했습니다.")

@ui_bp.route('/list')
@login_required
def list_page():
    """
    [최적화] 상품 목록 페이지 (껍데기만 렌더링)
    실제 데이터는 클라이언트에서 API를 통해 비동기로 로드합니다.
    이미지 폴백 규칙을 DB에서 가져와 템플릿에 주입합니다.
    """
    if current_user.is_super_admin:
        abort(403, description="슈퍼 관리자는 상세 검색을 사용할 수 없습니다.")

    try:
        # 필터 옵션만 로드 (캐시 적용됨)
        filter_options = get_filter_options_from_db(current_user.current_brand_id)
        
        # [수정] DB에서 이미지 폴백 규칙 가져오기
        fallback_rules_json = '[]'
        try:
            setting = Setting.query.filter_by(brand_id=current_user.current_brand_id, key='IMAGE_FALLBACK_RULES').first()
            if setting and setting.value:
                # DB에 저장된 JSON 문자열이 유효한지 확인 후 그대로 전달
                json.loads(setting.value) 
                fallback_rules_json = setting.value
        except:
            fallback_rules_json = '[]'

        context = {
            'active_page': 'list',
            'filter_options': filter_options,
            'fallback_rules': fallback_rules_json
        }
        
        return render_template('list.html', **context)

    except Exception as e:
        current_app.logger.error(f"Error loading list page: {e}")
        traceback.print_exc()
        abort(500, description="페이지 로드 중 오류가 발생했습니다.")

@ui_bp.route('/check')
@login_required
def check_page():
    all_stores = []
    if not current_user.store_id:
        all_stores = Store.query.filter_by(
            brand_id=current_user.current_brand_id,
            is_active=True
        ).order_by(Store.store_name).all()
        
    return render_template('check.html', active_page='check', all_stores=all_stores)

@ui_bp.route('/stock')
@login_required
def stock_management():
    try:
        missing_data_products = Product.query.filter(
            Product.brand_id == current_user.current_brand_id, 
            or_(
                Product.item_category.is_(None),
                Product.item_category == '',
                Product.release_year.is_(None)
            )
        ).order_by(Product.product_number).all()
        
        all_stores = []
        if not current_user.store_id:
            all_stores = Store.query.filter_by(
                brand_id=current_user.current_brand_id,
                is_active=True
            ).order_by(Store.store_name).all()
        
        context = {
            'active_page': 'stock',
            'missing_data_products': missing_data_products,
            'all_stores': all_stores
        }
        return render_template('stock.html', **context)

    except Exception as e:
        current_app.logger.error(f"Error loading stock management page: {e}")
        abort(500, description="DB 관리 페이지 로드 중 오류가 발생했습니다.")