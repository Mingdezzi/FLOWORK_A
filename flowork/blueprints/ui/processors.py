from flask_login import current_user
from . import ui_bp

@ui_bp.app_context_processor
def inject_image_url_prefix():
    # 이미지 경로 프리픽스
    return dict(IMAGE_URL_PREFIX='https://files.ebizway.co.kr/files/10249/Style/')

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