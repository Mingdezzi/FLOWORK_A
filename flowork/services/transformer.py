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
        'item_category': column_map_indices.get('item_category'), # 사용자가 선택한 '구분' 열
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
    # [로직 1] 사이즈 분류용 키 결정 (사용자 선택 열 + 품번 보조)
    # -------------------------------------------------------------------------
    def get_size_mapping_key(row):
        # 사용자가 매핑한 '구분' 열의 값을 가져옵니다.
        category_val = str(row.get('item_category', '')).strip()
        if category_val == 'nan' or category_val == 'None': category_val = ''
        
        product_code = str(row.get('product_number', '')).strip()
        
        # 보조 로직: 품번으로 키즈/성별 판단
        if product_code.startswith('J'): return '키즈'
        
        gender_code = product_code[1] if len(product_code) > 1 else ''
        item_type_code = product_code[2] if len(product_code) > 2 else ''

        if '하의' in category_val or item_type_code == '3':
            if gender_code == 'M': return '남성하의'
            elif gender_code == 'W': return '여성하의'
            elif gender_code == 'U': return '남성하의'
        
        if '상의' in category_val or item_type_code in ['1', '2', '4', '5', '6']: return '상의'
        elif '신발' in category_val or 'G' in product_code or 'N' in product_code: return '신발'
        
        # 매칭되는 특수 로직이 없으면, 엑셀에 적힌 값('모자', '장갑' 등)을 그대로 반환
        return category_val if category_val else '기타'

    # -------------------------------------------------------------------------
    # [로직 2] DB 저장용 품목 결정 (JSON 규칙 우선)
    # -------------------------------------------------------------------------
    def get_db_item_category(row):
        # JSON에 규칙(CATEGORY_MAPPING_RULE)이 있다면 무조건 그 규칙을 따릅니다.
        # (사용자가 선택한 '구분' 열은 무시하고, 품번 6번째 자리로 결정)
        if category_mapping_config:
            product_code = str(row.get('product_number', '')).strip()
            target_index = category_mapping_config.get('INDEX', 5)
            mapping_map = category_mapping_config.get('MAP', {})
            default_value = category_mapping_config.get('DEFAULT', '기타')

            if len(product_code) <= target_index: return default_value
            code_char = product_code[target_index]
            return mapping_map.get(code_char, default_value)
        
        # 규칙이 없는 브랜드라면, 사용자가 매핑한 값을 그대로 사용
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
    df_melted = df_melted[df_melted['Quantity'] > 0]

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
            'item_category': str(row.get('DB_Category', '기타')), # 규칙으로 생성된 품목
            'release_year': ry,
            'is_favorite': 0
        }
        result_list.append(item_data)

    return result_list