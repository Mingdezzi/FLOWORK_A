from datetime import datetime
from flask import request, jsonify, abort
from flask_login import login_required, current_user
from flowork.models import db, StoreOrder, StoreReturn, Variant, StoreStock, StockHistory
from . import api_bp

# --- 매장 주문 (Store Order) API ---

@api_bp.route('/api/store_orders', methods=['POST'])
@login_required
def create_store_order():
    """매장: 본사에 주문 요청"""
    if not current_user.store_id:
        return jsonify({'status': 'error', 'message': '매장 계정만 가능합니다.'}), 403
        
    data = request.json
    variant_id = data.get('variant_id')
    quantity = int(data.get('quantity', 0))
    order_date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    if quantity <= 0: return jsonify({'status': 'error', 'message': '수량은 1개 이상이어야 합니다.'}), 400
    
    try:
        order = StoreOrder(
            store_id=current_user.store_id,
            variant_id=variant_id,
            order_date=datetime.strptime(order_date, '%Y-%m-%d').date(),
            quantity=quantity,
            status='REQUESTED'
        )
        db.session.add(order)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '주문이 요청되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/store_orders/<int:oid>/status', methods=['POST'])
@login_required
def update_store_order_status(oid):
    """본사: 주문 승인(출고) 또는 거절"""
    if current_user.store_id: return jsonify({'status': 'error', 'message': '본사 관리자만 가능합니다.'}), 403
    
    data = request.json
    new_status = data.get('status') # APPROVED, REJECTED
    confirmed_qty = int(data.get('confirmed_quantity', 0))
    
    order = db.session.get(StoreOrder, oid)
    if not order: return jsonify({'status': 'error', 'message': '주문 내역 없음'}), 404
    if order.status != 'REQUESTED': return jsonify({'status': 'error', 'message': '이미 처리된 주문입니다.'}), 400
    
    try:
        if new_status == 'APPROVED':
            if confirmed_qty <= 0: return jsonify({'status': 'error', 'message': '확정 수량 오류'}), 400
            
            # 1. 본사 재고 차감
            variant = db.session.get(Variant, order.variant_id)
            variant.hq_quantity -= confirmed_qty
            
            # 2. 매장 재고 증가
            stock = StoreStock.query.filter_by(store_id=order.store_id, variant_id=order.variant_id).first()
            if not stock:
                stock = StoreStock(store_id=order.store_id, variant_id=order.variant_id, quantity=0)
                db.session.add(stock)
            stock.quantity += confirmed_qty
            
            # 3. 이력 (매장 기준 입고)
            history = StockHistory(
                store_id=order.store_id,
                variant_id=order.variant_id,
                user_id=current_user.id,
                change_type='ORDER_IN',
                quantity_change=confirmed_qty,
                current_quantity=stock.quantity
            )
            db.session.add(history)
            
            order.confirmed_quantity = confirmed_qty
            order.status = 'APPROVED'
            
        elif new_status == 'REJECTED':
            order.status = 'REJECTED'
            
        db.session.commit()
        return jsonify({'status': 'success', 'message': '처리되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500


# --- 매장 반품 (Store Return) API ---

@api_bp.route('/api/store_returns', methods=['POST'])
@login_required
def create_store_return():
    """매장: 본사에 반품 요청"""
    if not current_user.store_id: return jsonify({'status': 'error'}), 403
        
    data = request.json
    variant_id = data.get('variant_id')
    quantity = int(data.get('quantity', 0))
    return_date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    if quantity <= 0: return jsonify({'status': 'error', 'message': '수량 오류'}), 400
    
    try:
        ret = StoreReturn(
            store_id=current_user.store_id,
            variant_id=variant_id,
            return_date=datetime.strptime(return_date, '%Y-%m-%d').date(),
            quantity=quantity,
            status='REQUESTED'
        )
        db.session.add(ret)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '반품이 요청되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/store_returns/<int:rid>/status', methods=['POST'])
@login_required
def update_store_return_status(rid):
    """본사: 반품 승인(입고) 또는 거절"""
    if current_user.store_id: return jsonify({'status': 'error'}), 403
    
    data = request.json
    new_status = data.get('status')
    confirmed_qty = int(data.get('confirmed_quantity', 0))
    
    ret = db.session.get(StoreReturn, rid)
    if not ret: return jsonify({'status': 'error'}), 404
    if ret.status != 'REQUESTED': return jsonify({'status': 'error', 'message': '이미 처리됨'}), 400
    
    try:
        if new_status == 'APPROVED':
            if confirmed_qty <= 0: return jsonify({'status': 'error', 'message': '수량 오류'}), 400
            
            # 1. 매장 재고 차감
            stock = StoreStock.query.filter_by(store_id=ret.store_id, variant_id=ret.variant_id).first()
            if stock:
                stock.quantity -= confirmed_qty
                
                history = StockHistory(
                    store_id=ret.store_id,
                    variant_id=ret.variant_id,
                    user_id=current_user.id,
                    change_type='RETURN_OUT',
                    quantity_change=-confirmed_qty,
                    current_quantity=stock.quantity
                )
                db.session.add(history)
            
            # 2. 본사 재고 증가
            variant = db.session.get(Variant, ret.variant_id)
            variant.hq_quantity += confirmed_qty
            
            ret.confirmed_quantity = confirmed_qty
            ret.status = 'APPROVED'
            
        elif new_status == 'REJECTED':
            ret.status = 'REJECTED'
            
        db.session.commit()
        return jsonify({'status': 'success', 'message': '처리되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500