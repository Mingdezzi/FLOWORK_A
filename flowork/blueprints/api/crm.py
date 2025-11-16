import traceback
from datetime import datetime
from flask import request, jsonify
from flask_login import login_required, current_user
from flowork.models import db, Customer, Repair
from . import api_bp

# --- 고객 관리 API ---

@api_bp.route('/api/customers', methods=['GET'])
@login_required
def get_customers():
    if not current_user.store_id:
        return jsonify({'status': 'error', 'message': '매장 권한이 필요합니다.'}), 403
        
    query = request.args.get('query', '').strip()
    page = request.args.get('page', 1, type=int)
    
    base_query = Customer.query.filter_by(store_id=current_user.store_id)
    
    if query:
        base_query = base_query.filter(
            (Customer.name.contains(query)) | (Customer.phone.contains(query))
        )
        
    pagination = base_query.order_by(Customer.created_at.desc()).paginate(page=page, per_page=20, error_out=False)
    
    customers = [{
        'id': c.id,
        'code': c.customer_code,
        'name': c.name,
        'phone': c.phone,
        'address': c.address or '',
        'created_at': c.created_at.strftime('%Y-%m-%d')
    } for c in pagination.items]
    
    return jsonify({
        'status': 'success',
        'customers': customers,
        'total_pages': pagination.pages,
        'current_page': page
    })

@api_bp.route('/api/customers', methods=['POST'])
@login_required
def add_customer():
    if not current_user.store_id:
        return jsonify({'status': 'error', 'message': '매장 권한이 필요합니다.'}), 403
        
    data = request.json
    name = data.get('name')
    phone = data.get('phone')
    address = data.get('address')
    
    if not name or not phone:
        return jsonify({'status': 'error', 'message': '이름과 연락처는 필수입니다.'}), 400
        
    try:
        # 고객 코드 생성 (C-날짜-난수 또는 순번)
        today_str = datetime.now().strftime('%Y%m%d')
        count = Customer.query.filter(Customer.customer_code.like(f"C-{today_str}-%")).count()
        code = f"C-{today_str}-{str(count+1).zfill(3)}"
        
        customer = Customer(
            store_id=current_user.store_id,
            name=name,
            phone=phone,
            address=address,
            customer_code=code
        )
        db.session.add(customer)
        db.session.commit()
        
        return jsonify({'status': 'success', 'message': '고객이 등록되었습니다.', 'customer_id': customer.id})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

# --- 수선 관리 API ---

@api_bp.route('/api/repairs', methods=['POST'])
@login_required
def add_repair():
    if not current_user.store_id:
        return jsonify({'status': 'error', 'message': '매장 권한이 필요합니다.'}), 403
        
    data = request.json
    customer_id = data.get('customer_id')
    
    # 신규 고객이면 동시에 등록할 수도 있으나, 여기선 기존 고객 선택을 가정
    # (만약 이름/전화번호만 왔다면 고객 검색 후 없으면 생성하는 로직 추가 가능)
    
    if not customer_id:
        # 간편 등록: 고객 정보가 텍스트로 온 경우 처리
        name = data.get('customer_name')
        phone = data.get('customer_phone')
        if name and phone:
            # 기존 고객 검색
            cust = Customer.query.filter_by(store_id=current_user.store_id, phone=phone, name=name).first()
            if not cust:
                # 신규 생성
                today_str = datetime.now().strftime('%Y%m%d')
                count = Customer.query.filter(Customer.customer_code.like(f"C-{today_str}-%")).count()
                code = f"C-{today_str}-{str(count+1).zfill(3)}"
                cust = Customer(store_id=current_user.store_id, name=name, phone=phone, customer_code=code)
                db.session.add(cust)
                db.session.flush()
            customer_id = cust.id
        else:
             return jsonify({'status': 'error', 'message': '고객 정보가 필요합니다.'}), 400

    try:
        repair = Repair(
            store_id=current_user.store_id,
            customer_id=customer_id,
            reception_date=datetime.strptime(data.get('date', datetime.now().strftime('%Y-%m-%d')), '%Y-%m-%d'),
            product_info=data.get('product_info'),
            product_code=data.get('product_code'),
            color=data.get('color'),
            size=data.get('size'),
            description=data.get('description'),
            status='접수'
        )
        db.session.add(repair)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '수선 접수가 완료되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/repairs/<int:repair_id>/status', methods=['POST'])
@login_required
def update_repair_status(repair_id):
    if not current_user.store_id:
        return jsonify({'status': 'error'}), 403
        
    new_status = request.json.get('status')
    if not new_status:
        return jsonify({'status': 'error', 'message': '상태 값 누락'}), 400
        
    try:
        repair = Repair.query.filter_by(id=repair_id, store_id=current_user.store_id).first()
        if not repair:
            return jsonify({'status': 'error', 'message': '수선 내역을 찾을 수 없습니다.'}), 404
            
        repair.status = new_status
        db.session.commit()
        return jsonify({'status': 'success', 'message': f'상태가 {new_status}(으)로 변경되었습니다.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500