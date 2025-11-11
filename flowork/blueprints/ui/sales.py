from flask import render_template, request, abort
from flask_login import login_required, current_user
from flowork.models import Sale
from . import ui_bp

@ui_bp.route('/sales')
@login_required
def sales_register():
    if not current_user.store_id:
        abort(403, description="판매 등록은 매장 계정만 사용할 수 있습니다.")
    return render_template('sales.html', active_page='sales')

@ui_bp.route('/sales/record')
@login_required
def sales_record():
    if not current_user.store_id:
        abort(403, description="판매 내역은 매장 계정만 사용할 수 있습니다.")
        
    page = request.args.get('page', 1, type=int)
    
    sales_query = Sale.query.filter_by(store_id=current_user.store_id).order_by(Sale.created_at.desc())
    pagination = sales_query.paginate(page=page, per_page=20, error_out=False)
    
    return render_template('sales_record.html', active_page='sales', pagination=pagination, sales=pagination.items)

@ui_bp.route('/sales/<int:sale_id>')
@login_required
def sales_detail(sale_id):
    if not current_user.store_id:
        abort(403, description="매장 계정만 접근 가능합니다.")
        
    sale = Sale.query.filter_by(id=sale_id, store_id=current_user.store_id).first()
    if not sale:
        abort(404, description="판매 내역을 찾을 수 없습니다.")
        
    return render_template('sales_detail.html', active_page='sales', sale=sale)