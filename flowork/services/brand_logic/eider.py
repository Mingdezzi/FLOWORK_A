def get_size_mapping_key(row):
    """
    [아이더] 사이즈 매핑 키 결정
    품번 분석을 통해 '상의', '신발', '키즈' 등을 도출
    """
    pn = str(row.get('product_number', '')).strip().upper()
    if not pn: return '기타'

    first = pn[0] if len(pn) > 0 else ''
    gender = pn[1] if len(pn) > 1 else ''
    code = pn[5] if len(pn) > 5 else ''

    # 1. J로 시작하면 키즈
    if first == "J":
        return "키즈"
    
    # 2. 6번째 글자(code)에 따른 분류
    if code in ["1", "2", "4", "5", "6", "M", "7"]:
        return "상의"
    if code in ["G", "N"]:
        return "신발"
    if code == "C":
        return "모자"
    if code == "S":
        return "양말"
    if code in ["B", "T"]:
        return "가방스틱"
    if code == "V":
        return "장갑"
    if code in ["A", "8", "9"]:
        return "기타"
    
    # 3. 바지(code=3)는 성별 확인
    if code == "3":
        if gender == "M": return "남성하의"
        if gender == "W": return "여성하의"
        return "남성하의"

    # 예외: 규칙에 없으면 엑셀 값 사용
    val = str(row.get('item_category', '')).strip()
    if val and val not in ['nan', 'None', '']:
         return val
         
    return "기타"

def get_db_item_category(row, mapping_config=None):
    """
    [아이더] DB 저장용 카테고리 결정
    """
    product_code = str(row.get('product_number', '')).strip().upper()
    
    # 1. J로 시작하면 키즈 (최우선)
    if product_code.startswith("J"):
         return "키즈"

    # 2. JSON 매핑 규칙 사용
    if mapping_config:
        target_index = mapping_config.get('INDEX', 5)
        mapping_map = mapping_config.get('MAP', {})
        default_value = mapping_config.get('DEFAULT', '기타')

        if len(product_code) > target_index:
            code_char = product_code[target_index]
            return mapping_map.get(code_char, default_value)
    
    # 3. 기본값
    val = str(row.get('item_category', '')).strip()
    return val if val and val not in ['nan', 'None'] else '기타'