import uuid
import threading
from flask import request, jsonify, current_app
from flask_login import login_required, current_user
from flowork.models import db, Product
from . import api_bp
from .tasks import TASKS, run_async_image_process

@api_bp.route('/api/product/images', methods=['GET'])
@login_required
def get_product_image_status():
    if not current_user.brand_id:
        return jsonify({'status': 'error', 'message': '브랜드 계정이 필요합니다.'}), 403

    try:
        # 해당 브랜드의 모든 상품 조회
        products = Product.query.filter_by(brand_id=current_user.current_brand_id).all()
        
        groups = {}
        for p in products:
            # 품번 그룹핑 로직 (뒤 2자리를 컬러코드로 가정하고 절삭)
            # 예: ABC12301 -> ABC123
            style_code = p.product_number
            if len(p.product_number) > 2:
                style_code = p.product_number[:-2]
            
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
            group['total_colors'] += 1
            
            # 상태 우선순위 결정 (PROCESSING > FAILED > COMPLETED > READY)
            current_status = group['status']
            item_status = p.image_status or 'READY'
            
            if item_status == 'PROCESSING' or current_status == 'PROCESSING':
                group['status'] = 'PROCESSING'
            elif item_status == 'FAILED' and current_status != 'PROCESSING':
                group['status'] = 'FAILED'
            elif item_status == 'COMPLETED' and current_status == 'READY':
                group['status'] = 'COMPLETED'
                
            # 대표 이미지 링크 (하나라도 있으면 표시)
            if p.thumbnail_url and not group['thumbnail']:
                group['thumbnail'] = p.thumbnail_url
            if p.detail_image_url and not group['detail']:
                group['detail'] = p.detail_image_url

        # 리스트 변환 및 정렬 (품번순)
        result_list = list(groups.values())
        result_list.sort(key=lambda x: x['style_code'])

        return jsonify({'status': 'success', 'data': result_list})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
        # 1. 선택된 품번들의 상태를 먼저 'PROCESSING'으로 변경 (UI 즉시 반영용)
        for code in style_codes:
            products = Product.query.filter_by(brand_id=current_user.current_brand_id).filter(
                Product.product_number.like(f"{code}%")
            ).all()
            for p in products:
                p.image_status = 'PROCESSING'
        db.session.commit()

        # 2. 비동기 백그라운드 작업 시작
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
            'message': '이미지 처리가 시작되었습니다. 잠시 후 새로고침 하세요.', 
            'task_id': task_id
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500