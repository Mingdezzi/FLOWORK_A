from . import generic, eider

# 로직 등록소
LOGIC_MAP = {
    'GENERIC': generic,
    'EIDER': eider,
    # 추후 추가되는 브랜드는 여기에 등록 (예: 'NORTHFACE': northface)
}

def get_brand_logic(logic_name):
    """
    설정된 로직 이름(예: 'EIDER')에 해당하는 모듈을 반환합니다.
    없으면 기본값인 'GENERIC' 모듈을 반환합니다.
    """
    return LOGIC_MAP.get(logic_name, generic)