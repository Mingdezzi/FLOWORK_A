import traceback
from datetime import datetime
from flask import request, jsonify, abort
from flask_login import login_required, current_user
from flowork.models import db, StockTransfer, StoreStock, StockHistory, Variant, Store
from . import api_bp

@api_bp.route('/api/stock_transfer/request', methods=['POST'])
@login_required
def request_transfer():
    """매장 요청 (B매장이 A매장에 요청)"""
    if not current_user.store_id:
        return jsonify({'status': 'error', 'message': '매장 계정만 요청할 수 있습니다.'}), 403

    data = request.json
    source_store_id = data.get('source_store_id')
    variant_id = data.get('variant_id')
    quantity = int(data.get('quantity', 0))

    if quantity <= 0:
        return jsonify({'status': 'error', 'message': '수량은 1개 이상이어야 합니다.'}), 400

    try:
        transfer = StockTransfer(
            transfer_type='REQUEST',
            status='REQUESTED',
            source_store_id=source_store_id,
            target_store_id=current_user.store_id, # 요청한 본인이 받는 매장
            variant_id=variant_id,
            quantity=quantity
        )
        db.session.add(transfer)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '재고 이동 요청이 등록되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/stock_transfer/instruct', methods=['POST'])
@login_required
def instruct_transfer():
    """본사 지시 (본사가 A->B 이동 지시)"""
    if current_user.store_id: # 본사 관리자만 가능
        return jsonify({'status': 'error', 'message': '본사 관리자만 지시할 수 있습니다.'}), 403

    data = request.json
    source_store_id = data.get('source_store_id')
    target_store_id = data.get('target_store_id')
    variant_id = data.get('variant_id')
    quantity = int(data.get('quantity', 0))

    if quantity <= 0:
        return jsonify({'status': 'error', 'message': '수량 오류'}), 400

    try:
        transfer = StockTransfer(
            transfer_type='INSTRUCTION',
            status='REQUESTED', # 지시됨 상태 (시스템상 REQUESTED와 동일 취급하거나 구분 가능)
            source_store_id=source_store_id,
            target_store_id=target_store_id,
            variant_id=variant_id,
            quantity=quantity
        )
        db.session.add(transfer)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '이동 지시가 등록되었습니다.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/stock_transfer/<int:t_id>/ship', methods=['POST'])
@login_required
def ship_transfer(t_id):
    """이동등록 (출고확정): 보내는 매장(A)에서 실행 -> 재고 차감"""
    transfer = db.session.get(StockTransfer, t_id)
    if not transfer: return jsonify({'status': 'error', 'message': '내역 없음'}), 404
    
    if transfer.source_store_id != current_user.store_id:
        return jsonify({'status': 'error', 'message': '보내는 매장만 출고 처리할 수 있습니다.'}), 403
        
    if transfer.status != 'REQUESTED':
        return jsonify({'status': 'error', 'message': '처리할 수 없는 상태입니다.'}), 400

    try:
        # 재고 차감
        stock = StoreStock.query.filter_by(
            store_id=transfer.source_store_id, 
            variant_id=transfer.variant_id
        ).with_for_update().first()
        
        if not stock or stock.quantity < transfer.quantity:
            return jsonify({'status': 'error', 'message': '재고가 부족합니다.'}), 400
            
        stock.quantity -= transfer.quantity
        
        # 이력 기록
        history = StockHistory(
            store_id=transfer.source_store_id,
            variant_id=transfer.variant_id,
            user_id=current_user.id,
            change_type='TRANSFER_OUT',
            quantity_change=-transfer.quantity,
            current_quantity=stock.quantity
        )
        db.session.add(history)
        
        transfer.status = 'SHIPPED'
        db.session.commit()
        return jsonify({'status': 'success', 'message': '출고(이동등록) 처리되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/stock_transfer/<int:t_id>/receive', methods=['POST'])
@login_required
def receive_transfer(t_id):
    """입고확정: 받는 매장(B)에서 실행 -> 재고 증가"""
    transfer = db.session.get(StockTransfer, t_id)
    if not transfer: return jsonify({'status': 'error', 'message': '내역 없음'}), 404
    
    if transfer.target_store_id != current_user.store_id:
        return jsonify({'status': 'error', 'message': '받는 매장만 입고 처리할 수 있습니다.'}), 403
        
    if transfer.status != 'SHIPPED':
        return jsonify({'status': 'error', 'message': '아직 출고되지 않았거나 이미 처리된 건입니다.'}), 400

    try:
        # 재고 증가 (없으면 생성)
        stock = StoreStock.query.filter_by(
            store_id=transfer.target_store_id, 
            variant_id=transfer.variant_id
        ).with_for_update().first()
        
        if not stock:
            stock = StoreStock(store_id=transfer.target_store_id, variant_id=transfer.variant_id, quantity=0)
            db.session.add(stock)
            
        stock.quantity += transfer.quantity
        
        history = StockHistory(
            store_id=transfer.target_store_id,
            variant_id=transfer.variant_id,
            user_id=current_user.id,
            change_type='TRANSFER_IN',
            quantity_change=transfer.quantity,
            current_quantity=stock.quantity
        )
        db.session.add(history)
        
        transfer.status = 'RECEIVED'
        db.session.commit()
        return jsonify({'status': 'success', 'message': '입고 확정되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/stock_transfer/<int:t_id>/reject', methods=['POST'])
@login_required
def reject_transfer(t_id):
    """출고거부: 보내는 매장(A)에서 거부"""
    transfer = db.session.get(StockTransfer, t_id)
    if not transfer: return jsonify({'status': 'error', 'message': '내역 없음'}), 404
    
    if transfer.source_store_id != current_user.store_id:
        return jsonify({'status': 'error', 'message': '권한이 없습니다.'}), 403
        
    if transfer.status != 'REQUESTED':
        return jsonify({'status': 'error', 'message': '거부할 수 없는 상태입니다.'}), 400
        
    try:
        transfer.status = 'REJECTED'
        db.session.commit()
        return jsonify({'status': 'success', 'message': '요청을 거부했습니다.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500