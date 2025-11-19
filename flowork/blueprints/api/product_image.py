import uuid
import threading
import traceback
from flask import request, jsonify, current_app
from flask_login import login_required, current_user
from sqlalchemy import text
from sqlalchemy.orm import selectinload
from flowork.models import db, Product
from . import api_bp
from .tasks import TASKS, run_async_image_process

@api_bp.route('/api/product/images', methods=['GET'])
@login_required
def get_product_image_status():
    if not current_user.brand_id:
        return jsonify({'status': 'error', 'message': '브랜드 계정이 필요합니다.'}), 403

    try:
        # 1. 상품 및 옵션 정보 로드
        products = Product.query.options(selectinload(Product.variants))\
            .filter_by(brand_id=current_user.current_brand_id).all()
        
        groups = {}
        for p in products:
            style_code = p.product_number
            
            if style_code not in groups:
                groups[style_code] = {
                    'style_code': style_code,
                    'product_name': p.product_name,
                    'total_colors': 0,
                    'status': 'READY',
                    'thumbnail': None,
                    'detail': None,
                    'message': ''
                }
            
            group = groups[style_code]
            unique_colors = set(v.color for v in p.variants if v.color)
            group['total_colors'] = len(unique_colors) if unique_colors else 1
            
            _update_group_status_and_links(group, p)

    except Exception as e:
        print(f"⚠️ DB 조회 중 오류: {e}")
        db.session.rollback()
        return jsonify({'status': 'error', 'message': f'DB 조회 오류: {str(e)}'}), 500

    # 리스트 변환 및 정렬
    result_list = list(groups.values())
    result_list.sort(key=lambda x: x['style_code'])

    return jsonify({'status': 'success', 'data': result_list})

def _update_group_status_and_links(group, product):
    """그룹 상태 및 정보 최신화"""
    current_status = group['status']
    item_status = product.image_status or 'READY'
    
    # 상태 우선순위: PROCESSING > FAILED > COMPLETED > READY
    if item_status == 'PROCESSING' or current_status == 'PROCESSING':
        group['status'] = 'PROCESSING'
    elif item_status == 'FAILED' and current_status != 'PROCESSING':
        group['status'] = 'FAILED'
    elif item_status == 'COMPLETED' and current_status == 'READY':
        group['status'] = 'COMPLETED'
        
    # 썸네일/상세이미지 링크
    if product.thumbnail_url and not group['thumbnail']:
        group['thumbnail'] = product.thumbnail_url
    if product.detail_image_url and not group['detail']:
        group['detail'] = product.detail_image_url
        
    # 에러 메시지나 상태 메시지 저장
    if product.last_message:
        # 실패 메시지가 있으면 우선 표시
        if item_status == 'FAILED':
            group['message'] = product.last_message
        elif not group['message']:
            group['message'] = product.last_message

@api_bp.route('/api/product/images/process', methods=['POST'])
@login_required
def trigger_image_process():
    if not current_user.brand_id:
         return jsonify({'status': 'error', 'message': '권한이 없습니다.'}), 403
         
    data = request.json
    style_codes = data.get('style_codes', [])
    
    if not style_codes:
        return jsonify({'status': 'error', 'message': '선택된 품번이 없습니다.'}), 400

    try:
        # 1. 선택된 품번들의 상태를 PROCESSING으로 변경
        for code in style_codes:
            products = Product.query.filter_by(
                brand_id=current_user.current_brand_id,
                product_number=code
            ).all()
            for p in products:
                p.image_status = 'PROCESSING'
                p.last_message = '작업 시작됨...'
        db.session.commit()

        # 2. 비동기 작업 시작
        task_id = str(uuid.uuid4())
        TASKS[task_id] = {
            'status': 'processing', 
            'current': 0, 
            'total': len(style_codes), 
            'percent': 0
        }
        
        thread = threading.Thread(
            target=run_async_image_process,
            args=(
                current_app._get_current_object(),
                task_id,
                current_user.current_brand_id,
                style_codes
            )
        )
        thread.start()

        return jsonify({
            'status': 'success', 
            'message': '이미지 처리가 시작되었습니다.', 
            'task_id': task_id
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/product/images/reset', methods=['POST'])
@login_required
def reset_image_process_status():
    """선택한 품번의 작업을 강제 초기화 (진행중 멈춤 해결용)"""
    if not current_user.brand_id:
         return jsonify({'status': 'error', 'message': '권한이 없습니다.'}), 403

    data = request.json
    style_codes = data.get('style_codes', [])

    if not style_codes:
        return jsonify({'status': 'error', 'message': '선택된 품번이 없습니다.'}), 400

    try:
        count = 0
        for code in style_codes:
            products = Product.query.filter_by(
                brand_id=current_user.current_brand_id,
                product_number=code
            ).all()
            for p in products:
                p.image_status = 'READY'
                p.last_message = '사용자에 의해 초기화됨'
                count += 1
        db.session.commit()
        
        return jsonify({'status': 'success', 'message': f'{len(style_codes)}개 품번({count}개 상품)의 상태를 초기화했습니다.'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
