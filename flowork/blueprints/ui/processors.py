from flask_login import current_user
from flowork.models import Setting
from . import ui_bp

@ui_bp.app_context_processor
def inject_image_helpers():
    # 1. 기본값 설정
    # (설정이 없을 경우 기존 머렐 방식: 품번만 사용)
    default_prefix = 'https://files.ebizway.co.kr/files/10249/Style/'
    default_rule = '{product_number}' 

    # 2. 현재 브랜드의 설정 로드
    prefix = default_prefix
    rule = default_rule
    
    try:
        if current_user.is_authenticated and current_user.brand_id:
            # Prefix 조회
            setting_prefix = Setting.query.filter_by(
                brand_id=current_user.brand_id, key='IMAGE_URL_PREFIX'
            ).first()
            if setting_prefix and setting_prefix.value:
                prefix = setting_prefix.value
            
            # Naming Rule 조회
            setting_rule = Setting.query.filter_by(
                brand_id=current_user.brand_id, key='IMAGE_NAMING_RULE'
            ).first()
            if setting_rule and setting_rule.value:
                rule = setting_rule.value
                
    except Exception as e:
        print(f"Error fetching image settings: {e}")

    # 3. 이미지 URL 생성 함수 (템플릿에서 사용)
    def get_image_url(product):
        if not product: return ''
        
        # 품번 (공백 제거)
        pn = product.product_number.split(' ')[0]
        
        # [신규] 연도 추출 로직 (아이더 품번 예: DWW24...)
        # 품번의 4~5번째 글자가 숫자라면 연도로 인식 (예: 24 -> 2024)
        year = ''
        if len(pn) >= 5 and pn[3:5].isdigit():
            year = f"20{pn[3:5]}"
        
        # 컬러 처리
        color = ''
        if '{color}' in rule:
            if product.variants:
                # 가나다순/우선순위 정렬이 되어있다면 첫번째, 아니면 그냥 첫번째
                first_variant = product.variants[0]
                color = first_variant.color
            else:
                color = '00' # 컬러 정보가 없으면 기본값

        # 파일명 생성
        try:
            filename = rule.format(
                product_number=pn,
                color=color,
                year=year  # [신규] year 변수 추가
            )
        except Exception:
            # 포맷팅 에러 시 기본값(품번) 사용
            filename = pn
            
        return f"{prefix}{filename}"

    # 템플릿에 함수와 변수 전달
    return dict(
        IMAGE_URL_PREFIX=prefix, # 기존 호환성 유지
        get_image_url=get_image_url
    )

@ui_bp.app_context_processor
def inject_global_vars():
    # 상단바에 표시할 매장/브랜드 이름
    shop_name = 'FLOWORK' 
    try:
        if current_user.is_authenticated:
            if current_user.is_super_admin:
                shop_name = 'FLOWORK (Super Admin)'
            elif current_user.store_id:
                shop_name = current_user.store.store_name
            elif current_user.brand_id:
                shop_name = f"{current_user.brand.brand_name} (본사)"
            else:
                shop_name = 'FLOWORK (계정 오류)'
                
    except Exception as e:
        print(f"Warning: Could not fetch shop name. Error: {e}")
    
    return dict(shop_name=shop_name)