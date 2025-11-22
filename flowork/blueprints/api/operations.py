from datetime import datetime
from flask import request, jsonify
from flask_login import login_required, current_user
from flowork.models import db, Attendance, CompetitorBrand, CompetitorSale, Staff
from . import api_bp

# --- 근태 관리 API ---

@api_bp.route('/api/attendance', methods=['GET'])
@login_required
def get_attendance():
    if not current_user.store_id:
        return jsonify({'status': 'error', 'message': '매장 권한이 필요합니다.'}), 403
    
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'status': 'error', 'message': '날짜가 필요합니다.'}), 400
        
    target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    
    # 해당 매장의 모든 직원 조회
    staffs = Staff.query.filter_by(store_id=current_user.store_id, is_active=True).all()
    
    # 해당 날짜의 근태 기록 조회
    attendances = Attendance.query.filter_by(
        store_id=current_user.store_id,
        work_date=target_date
    ).all()
    att_map = {a.staff_id: a for a in attendances}
    
    result = []
    for s in staffs:
        att = att_map.get(s.id)
        result.append({
            'staff_id': s.id,
            'name': s.name,
            'position': s.position,
            'status': att.status if att else '출근', # 기본값
            'check_in': att.check_in_time.strftime('%H:%M') if att and att.check_in_time else '',
            'check_out': att.check_out_time.strftime('%H:%M') if att and att.check_out_time else '',
            'memo': att.memo if att else ''
        })
        
    return jsonify({'status': 'success', 'data': result})

@api_bp.route('/api/attendance', methods=['POST'])
@login_required
def save_attendance():
    if not current_user.store_id: return jsonify({'status': 'error'}), 403
    
    data = request.json
    date_str = data.get('date')
    records = data.get('records', [])
    
    if not date_str or not records:
        return jsonify({'status': 'error', 'message': '데이터 누락'}), 400
        
    target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    
    try:
        for rec in records:
            staff_id = rec['staff_id']
            
            att = Attendance.query.filter_by(
                store_id=current_user.store_id,
                staff_id=staff_id,
                work_date=target_date
            ).first()
            
            if not att:
                att = Attendance(
                    store_id=current_user.store_id,
                    staff_id=staff_id,
                    work_date=target_date
                )
                db.session.add(att)
            
            att.status = rec.get('status', '출근')
            att.memo = rec.get('memo', '')
            
            in_time = rec.get('check_in')
            out_time = rec.get('check_out')
            
            att.check_in_time = datetime.strptime(in_time, '%H:%M').time() if in_time else None
            att.check_out_time = datetime.strptime(out_time, '%H:%M').time() if out_time else None
            
        db.session.commit()
        return jsonify({'status': 'success', 'message': '근태 기록이 저장되었습니다.'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500


# --- 타사 매출 관리 API ---

@api_bp.route('/api/competitor/brands', methods=['GET', 'POST'])
@login_required
def manage_competitor_brands():
    if not current_user.store_id: return jsonify({'status': 'error'}), 403
    
    if request.method == 'GET':
        brands = CompetitorBrand.query.filter_by(store_id=current_user.store_id, is_active=True).all()
        return jsonify({
            'status': 'success', 
            'brands': [{'id': b.id, 'name': b.name} for b in brands]
        })
        
    elif request.method == 'POST':
        name = request.json.get('name', '').strip()
        if not name: return jsonify({'status': 'error', 'message': '브랜드명 필수'}), 400
        
        try:
            brand = CompetitorBrand(store_id=current_user.store_id, name=name)
            db.session.add(brand)
            db.session.commit()
            return jsonify({'status': 'success', 'message': '추가되었습니다.', 'id': brand.id})
        except Exception as e:
            db.session.rollback()
            return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/competitor/brands/<int:brand_id>', methods=['DELETE'])
@login_required
def delete_competitor_brand(brand_id):
    if not current_user.store_id: return jsonify({'status': 'error'}), 403
    
    try:
        brand = CompetitorBrand.query.filter_by(id=brand_id, store_id=current_user.store_id).first()
        if brand:
            brand.is_active = False # Soft Delete
            db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/competitor/sales', methods=['GET'])
@login_required
def get_competitor_sales():
    if not current_user.store_id: return jsonify({'status': 'error'}), 403
    
    date_str = request.args.get('date')
    if not date_str: return jsonify({'status': 'error'}), 400
    
    target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    
    brands = CompetitorBrand.query.filter_by(store_id=current_user.store_id, is_active=True).all()
    sales = CompetitorSale.query.filter_by(store_id=current_user.store_id, sale_date=target_date).all()
    
    sale_map = {s.competitor_id: s for s in sales}
    
    result = []
    for b in brands:
        s = sale_map.get(b.id)
        result.append({
            'brand_id': b.id,
            'brand_name': b.name,
            'off_norm': s.offline_normal if s else 0,
            'off_evt': s.offline_event if s else 0,
            'on_norm': s.online_normal if s else 0,
            'on_evt': s.online_event if s else 0
        })
        
    return jsonify({'status': 'success', 'data': result})

@api_bp.route('/api/competitor/sales', methods=['POST'])
@login_required
def save_competitor_sales():
    if not current_user.store_id: return jsonify({'status': 'error'}), 403
    
    data = request.json
    date_str = data.get('date')
    records = data.get('records', [])
    
    if not date_str: return jsonify({'status': 'error'}), 400
    target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    
    try:
        for rec in records:
            brand_id = rec['brand_id']
            sale = CompetitorSale.query.filter_by(
                store_id=current_user.store_id,
                competitor_id=brand_id,
                sale_date=target_date
            ).first()
            
            if not sale:
                sale = CompetitorSale(
                    store_id=current_user.store_id,
                    competitor_id=brand_id,
                    sale_date=target_date
                )
                db.session.add(sale)
            
            sale.offline_normal = int(rec.get('off_norm', 0))
            sale.offline_event = int(rec.get('off_evt', 0))
            sale.online_normal = int(rec.get('on_norm', 0))
            sale.online_event = int(rec.get('on_evt', 0))
            
        db.session.commit()
        return jsonify({'status': 'success', 'message': '매출이 저장되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500