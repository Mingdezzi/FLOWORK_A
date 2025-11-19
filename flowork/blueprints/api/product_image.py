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
        # 1. 상품 및 옵션 정보 로드 (N+1 방지)
        products = Product.query.options(selectinload(Product.variants))\
            .filter_by(brand_id=current_user.current_brand_id).all()
        
        groups = {}
        for p in products:
            # [수정] 품번 자르지 않고 그대로 사용
            style_code = p.product_number
            
            # 품번별 그룹핑 (이미 같은 품번이면 덮어쓰거나 정보 갱신)
            if style_code not in groups:
                groups[style_code] = {
                    'style_code': style_code,
                    'product_name': p.product_name,
                    'total_colors': 0,
                    'status': 'READY',
                    'thumbnail': None,
                    'detail': None
                }
            
            group = groups[style_code]
            
            # 컬러 수 계산: Variant 개수 합산 (또는 유니크 컬러 수)
            unique_colors = set(v.color for v in p.variants if v.color)
            group['total_colors'] = len(unique_colors) if unique_colors else 1
            
            # 상태 및 이미지 링크 업데이트
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
    """그룹 상태 및 대표 이미지 링크 최신화"""
    current_status = group['status']
    item_status = product.image_status or 'READY'
    
    # 상태 우선순위: PROCESSING > FAILED > COMPLETED > READY
    if item_status == 'PROCESSING' or current_status == 'PROCESSING':
        group['status'] = 'PROCESSING'
    elif item_status == 'FAILED' and current_status != 'PROCESSING':
        group['status'] = 'FAILED'
    elif item_status == 'COMPLETED' and current_status == 'READY':
        group['status'] = 'COMPLETED'
        
    # 썸네일/상세이미지 링크 (있으면 채움)
    if product.thumbnail_url and not group['thumbnail']:
        group['thumbnail'] = product.thumbnail_url
    if product.detail_image_url and not group['detail']:
        group['detail'] = product.detail_image_url

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
            # [수정] 품번 정확 일치 검색
            products = Product.query.filter_by(
                brand_id=current_user.current_brand_id,
                product_number=code
            ).all()
            for p in products:
                p.image_status = 'PROCESSING'
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
