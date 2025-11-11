import json
import traceback
from flask import render_template, flash, redirect, url_for, abort
from flask_login import login_required, current_user
from sqlalchemy.orm import selectinload

from flowork.models import db, Product, Setting
from . import ui_bp

@ui_bp.route('/')
@login_required
def home():
    if current_user.is_super_admin:
        flash("슈퍼 관리자 계정입니다. (시스템 설정)", "info")
        return redirect(url_for('ui.setting_page'))
        
    return render_template('index.html', active_page='home')

@ui_bp.route('/search')
@login_required
def search_page():
    if current_user.is_super_admin:
        abort(403, description="슈퍼 관리자는 상품 검색을 사용할 수 없습니다.")

    try:
        current_brand_id = current_user.current_brand_id
        
        category_setting = Setting.query.filter_by(
            brand_id=current_brand_id, 
            key='CATEGORY_CONFIG'
        ).first()
        
        category_config = {
            'columns': 4,
            'buttons': [
                {'label': '전체', 'value': '전체'},
                {'label': '신발', 'value': '신발'},
                {'label': '의류', 'value': '의류'},
                {'label': '용품', 'value': '용품'}
            ]
        }
        
        if category_setting and category_setting.value:
            try:
                category_config = json.loads(category_setting.value)
            except json.JSONDecodeError:
                pass 

        products_query = Product.query.options(selectinload(Product.variants)).filter(
            Product.brand_id == current_brand_id, 
            Product.is_favorite == 1
        )
        products = products_query.order_by(Product.item_category, Product.product_name).all()
        
        context = {
            'active_page': 'search',
            'showing_favorites': True,
            'products': products,
            'query': '',
            'selected_category': '전체',
            'category_config': category_config
        }
        return render_template('search.html', **context)
    
    except Exception as e:
        print(f"Error loading search page: {e}")
        traceback.print_exc()
        flash("페이지 로드 중 오류가 발생했습니다.", "error")
        return render_template('search.html', active_page='search', showing_favorites=True, products=[], query='', selected_category='전체')