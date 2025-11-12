import pandas as pd
import io

def transform_horizontal_to_vertical(file_stream, size_mapping_config):
    """
    가로형 재고 데이터를 세로형으로 변환하고, 품번을 분석하여 카테고리를 매핑합니다.
    :param file_stream: 업로드된 엑셀 파일 객체
    :param size_mapping_config: 브랜드 설정(JSON)에서 불러온 사이즈 매핑 딕셔너리
    """
    # 1. 파일 로딩 (엑셀 또는 CSV)
    # 파일 포인터 위치 초기화
    file_stream.seek(0)
    
    try:
        # 엑셀로 시도
        df_stock = pd.read_excel(file_stream)
    except:
        # 실패 시 CSV로 재시도 (인코딩 문제 대비)
        file_stream.seek(0)
        try:
            df_stock = pd.read_csv(file_stream, encoding='utf-8')
        except UnicodeDecodeError:
            file_stream.seek(0)
            df_stock = pd.read_csv(file_stream, encoding='cp949')

    # 2. 품번 기반 카테고리 판별 로직 (고급 분류)
    def get_mapping_category(row):
        product_code = str(row.get('상품코드', '')).strip()
        original_category = str(row.get('구분', '')).strip()
        
        # (1) 키즈 체크 (품번 J로 시작)
        if product_code.startswith('J'):
            return '키즈'
        
        # (2) 성별/아이템 코드 추출 (인덱스 에러 방지)
        gender_code = product_code[1] if len(product_code) > 1 else ''
        item_type_code = product_code[2] if len(product_code) > 2 else ''

        # (3) 하의 정밀 분류 (구분에 '하의'가 있거나 품번 3번째 자리가 '3')
        if '하의' in original_category or item_type_code == '3':
            if gender_code == 'M': return '남성하의'
            elif gender_code == 'W': return '여성하의'
            elif gender_code == 'U': return '남성하의' # 공용 하의는 남성 사이즈 체계 따름
        
        # (4) 상의/신발/용품 분류
        # 상의 코드: 1(자켓), 2(티셔츠), 4(셔츠), 5(다운), 6(베스트)
        if '상의' in original_category or item_type_code in ['1', '2', '4', '5', '6']:
            return '상의'
        # 신발 코드: G(고어텍스), N(일반) 등 추정
        elif '신발' in original_category or 'G' in product_code or 'N' in product_code:
            return '신발'
        elif '모자' in original_category: return '모자'
        elif '양말' in original_category: return '양말'
        elif '장갑' in original_category: return '장갑'
        elif '가방' in original_category or '스틱' in original_category: return '가방스틱'
            
        # 매칭 안되면 원래 구분 반환 (매핑 실패 가능성)
        return original_category

    # DataFrame에 카테고리 컬럼 추가
    df_stock['Mapping_Category'] = df_stock.apply(get_mapping_category, axis=1)

    # 3. 데이터 변환 (Melt: 가로 -> 세로)
    # 식별자 컬럼 정의
    id_vars = ['상품코드', '상품명', '칼라', '현판매가', '구분', 'Mapping_Category']
    # 실제 파일에 존재하는 식별자 컬럼만 사용
    available_id_vars = [col for col in id_vars if col in df_stock.columns]
    
    # 사이즈 컬럼 찾기 (0 ~ 19 등 숫자형 컬럼)
    # 파일의 컬럼명이 정수일 수도, 문자열일 수도 있으므로 모두 문자열로 변환해 비교
    value_vars = [col for col in df_stock.columns if str(col) in [str(i) for i in range(25)]]

    if not value_vars:
        raise ValueError("사이즈 컬럼(0~19)을 찾을 수 없습니다.")

    df_melted = df_stock.melt(
        id_vars=available_id_vars, 
        value_vars=value_vars, 
        var_name='Size_Code', 
        value_name='Quantity'
    )

    # 재고 수량 정리 (NaN -> 0, 0인 행 제거)
    df_melted['Quantity'] = pd.to_numeric(df_melted['Quantity'], errors='coerce').fillna(0).astype(int)
    df_melted = df_melted[df_melted['Quantity'] > 0]

    # 4. 사이즈 코드(0,1...) -> 실제 사이즈(95, 100...) 매핑
    def get_real_size(row):
        category = row['Mapping_Category']
        size_code = str(row['Size_Code']) # JSON 키는 문자열이므로 변환
        
        # JSON 설정에서 가져온 매핑표 참조
        if category in size_mapping_config:
            mapping = size_mapping_config[category]
            # 매핑표에 해당 코드가 있으면 반환
            if size_code in mapping:
                return str(mapping[size_code])
        
        # 매핑 실패 시 (기타 카테고리 시도 또는 원본 코드 반환)
        if '기타' in size_mapping_config and size_code in size_mapping_config['기타']:
             return str(size_mapping_config['기타'][size_code])
             
        return "Unknown"

    df_melted['Real_Size'] = df_melted.apply(get_real_size, axis=1)
    
    # 매핑 실패한 데이터(Unknown) 제거 (또는 로그 남기기)
    df_final = df_melted[df_melted['Real_Size'] != "Unknown"]

    # 5. 결과 데이터를 표준 딕셔너리 리스트로 변환 (DB 저장용 포맷)
    result_list = []
    for _, row in df_final.iterrows():
        item_data = {
            'product_number': str(row.get('상품코드', '')).strip(),
            'product_name': str(row.get('상품명', '')).strip(),
            'color': str(row.get('칼라', '')).strip(),
            'size': str(row.get('Real_Size', '')).strip(),
            'hq_stock': int(row.get('Quantity', 0)),
            'sale_price': int(row.get('현판매가', 0)),
            'original_price': int(row.get('현판매가', 0)), # 최초가 정보 없으면 판매가 사용
            'item_category': str(row.get('Mapping_Category', '')),
            'release_year': None, # 파일에 년도 정보가 없으면 None
            'is_favorite': 0
        }
        result_list.append(item_data)

    return result_list