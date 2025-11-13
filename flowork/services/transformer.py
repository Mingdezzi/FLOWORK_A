import pandas as pd
import io

def transform_horizontal_to_vertical(file_stream, size_mapping_config, category_mapping_config, column_map_indices):
    """
    가로형 재고 데이터를 세로형으로 변환합니다.
    사용자가 선택한 열(column_map_indices)을 기준으로 식별자를 추출합니다.
    """
    # 1. 파일 로딩
    file_stream.seek(0)
    try:
        df_stock = pd.read_excel(file_stream)
    except:
        file_stream.seek(0)
        try:
            df_stock = pd.read_csv(file_stream, encoding='utf-8')
        except UnicodeDecodeError:
            file_stream.seek(0)
            df_stock = pd.read_csv(file_stream, encoding='cp949')

    # 컬럼명 공백 제거
    df_stock.columns = df_stock.columns.astype(str).str.strip()

    # 2. 사용자가 매핑한 열 인덱스로 데이터 추출
    extracted_data = pd.DataFrame()
    
    field_to_col_idx = {
        'product_number': column_map_indices.get('product_number'),
        'product_name': column_map_indices.get('product_name'),
        'color': column_map_indices.get('color'),
        'original_price': column_map_indices.get('original_price'),
        'sale_price': column_map_indices.get('sale_price'),
        'release_year': column_map_indices.get('release_year'),
        'item_category': column_map_indices.get('item_category'), 
    }

    total_cols = len(df_stock.columns)

    for field, idx in field_to_col_idx.items():
        if idx is not None and 0 <= idx < total_cols:
            extracted_data[field] = df_stock.iloc[:, idx]
        else:
            extracted_data[field] = None

    # 3. 사이즈 컬럼(0~29) 자동 식별
    size_cols = [col for col in df_stock.columns if col in [str(i) for i in range(30)]]
    if not size_cols:
        return [] 

    # 데이터 병합
    df_merged = pd.concat([extracted_data, df_stock[size_cols]], axis=1)

    # -------------------------------------------------------------------------
    # [로직 1] 사이즈 분류용 키 결정 (사용자 수식 100% 반영)
    # -------------------------------------------------------------------------
    def get_size_mapping_key(row):
        # 1. 품번 가져오기
        pn = str(row.get('product_number', '')).strip().upper()
        if not pn: return '기타'

        # 2. 수식에 따른 변수 정의
        # first: 첫 글자 (LEFT 1)
        first = pn[0] if len(pn) > 0 else ''
        # gender: 두 번째 글자 (MID 2, 1)
        gender = pn[1] if len(pn) > 1 else ''
        # code: 여섯 번째 글자 (MID 6, 1) -> 파이썬 인덱스 5
        code = pn[5] if len(pn) > 5 else ''

        # 3. 사용자 수식 로직 구현
        if first == "J":
            return "키즈"
        
        if code in ["1", "2", "4", "5", "6", "M", "7"]:
            return "상의"
        
        if code in ["G", "N"]:
            return "신발"
        
        if code == "C":
            return "모자"
        
        if code == "S":
            return "양말"
        
        if code in ["B", "T"]:
            return "가방스틱" # JSON에 "가방스틱" 키가 있어야 함
        
        if code == "V":
            return "장갑"
        
        if code in ["A", "8", "9"]:
            return "기타"
        
        if code == "3":
            if gender == "M": return "남성하의"
            if gender == "W": return "여성하의"
            if gender == "U": return "남성하의" # 남녀공용 -> 남성하의 (기본)
            return "남성하의" # 기본값

        # 위 규칙에 해당하지 않으면 엑셀의 '품목' 값 사용 (보조)
        category_val = str(row.get('item_category', '')).strip()
        if category_val and category_val != 'nan' and category_val != 'None':
             return category_val
             
        return "기타"

    # -------------------------------------------------------------------------
    # [로직 2] DB 저장용 품목 결정 (JSON 규칙 우선)
    # -------------------------------------------------------------------------
    def get_db_item_category(row):
        # JSON 규칙이 있으면 그것을 따름
        if category_mapping_config:
            product_code = str(row.get('product_number', '')).strip()
            target_index = category_mapping_config.get('INDEX', 5)
            mapping_map = category_mapping_config.get('MAP', {})
            default_value = category_mapping_config.get('DEFAULT', '기타')

            if len(product_code) <= target_index: return default_value
            code_char = product_code[target_index]
            return mapping_map.get(code_char, default_value)
        
        # 규칙이 없으면 엑셀 값 사용
        mapped_val = row.get('item_category')
        return str(mapped_val).strip() if mapped_val else '기타'

    # 컬럼 생성
    df_merged['Mapping_Key'] = df_merged.apply(get_size_mapping_key, axis=1)
    df_merged['DB_Category'] = df_merged.apply(get_db_item_category, axis=1)

    # 4. 데이터 변환 (Melt)
    id_vars = ['product_number', 'product_name', 'color', 'original_price', 'sale_price', 'release_year', 'DB_Category', 'Mapping_Key']
    
    df_melted = df_merged.melt(
        id_vars=id_vars, 
        value_vars=size_cols, 
        var_name='Size_Code', 
        value_name='Quantity'
    )

    df_melted['Quantity'] = pd.to_numeric(df_melted['Quantity'], errors='coerce').fillna(0).astype(int)
    
    # [수정] 재고가 0이어도 상품 정보를 등록하기 위해 필터링 로직 제거
    # df_melted = df_melted[df_melted['Quantity'] > 0] 

    # 5. 사이즈 매핑
    def get_real_size(row):
        mapping_key = row['Mapping_Key']
        size_code = str(row['Size_Code'])
        
        if mapping_key in size_mapping_config:
            mapping = size_mapping_config[mapping_key]
            if size_code in mapping:
                return str(mapping[size_code])
        
        if '기타' in size_mapping_config and size_code in size_mapping_config['기타']:
             return str(size_mapping_config['기타'][size_code])
             
        return "Unknown"

    df_melted['Real_Size'] = df_melted.apply(get_real_size, axis=1)
    
    # "Unknown" 사이즈(매핑 규칙에 없는 사이즈 코드)는 제거 (유효한 사이즈 옵션만 남김)
    df_final = df_melted[df_melted['Real_Size'] != "Unknown"]

    # 6. 결과 반환
    result_list = []
    for _, row in df_final.iterrows():
        
        try: op = int(float(row.get('original_price', 0) or 0))
        except: op = 0
        try: sp = int(float(row.get('sale_price', 0) or 0))
        except: sp = 0
        if sp == 0 and op > 0: sp = op
        if op == 0 and sp > 0: op = sp

        try: ry = int(float(row.get('release_year'))) if row.get('release_year') else None
        except: ry = None

        item_data = {
            'product_number': str(row.get('product_number', '')).strip(),
            'product_name': str(row.get('product_name', '')).strip(),
            'color': str(row.get('color', '')).strip(),
            'size': str(row.get('Real_Size', '')).strip(),
            'hq_stock': int(row.get('Quantity', 0)),
            'sale_price': sp,
            'original_price': op,
            'item_category': str(row.get('DB_Category', '기타')), 
            'release_year': ry,
            'is_favorite': 0
        }
        result_list.append(item_data)

    return result_list