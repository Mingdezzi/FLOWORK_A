import pandas as pd
import io

def transform_horizontal_to_vertical(file_stream, size_mapping_config, category_mapping_config, column_map_indices):
    """
    가로형 재고 데이터를 세로형으로 변환합니다.
    사용자가 선택한 열(column_map_indices)을 '절대 기준'으로 데이터를 추출합니다.
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

    # 컬럼명 공백 제거 (참고용)
    df_stock.columns = df_stock.columns.astype(str).str.strip()

    # 2. [핵심] 사용자가 선택한 열 인덱스로 데이터 추출
    extracted_data = pd.DataFrame()
    
    # UI에서 넘겨준 인덱스 맵 (예: {'product_number': 0, 'color': 2 ...})
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
        # 사용자가 열을 선택했고(idx is not None), 그 열이 유효한 범위라면
        if idx is not None and 0 <= idx < total_cols:
            # iloc으로 정확히 그 열의 데이터를 가져옴
            extracted_data[field] = df_stock.iloc[:, idx]
        else:
            # 선택 안 했으면 None (나중에 로직으로 채움)
            extracted_data[field] = None

    # 3. 사이즈 컬럼(0~29) 자동 식별 (이건 파일 구조상 고정이므로 자동)
    size_cols = [col for col in df_stock.columns if col in [str(i) for i in range(30)]]
    if not size_cols:
        print("Warning: 사이즈 컬럼(0~29)을 찾을 수 없습니다.")
        return [] 

    # 추출한 식별자 데이터와 사이즈 데이터를 옆으로 합침
    df_merged = pd.concat([extracted_data, df_stock[size_cols]], axis=1)

    # -------------------------------------------------------------------------
    # [로직 1] 사이즈 분류용 키 결정 (Mapping_Key)
    # -------------------------------------------------------------------------
    def get_size_mapping_key(row):
        # 사용자가 '품목(구분)' 열을 선택했다면 그 값을 우선 사용
        category_val = str(row.get('item_category', '')).strip()
        
        product_code = str(row.get('product_number', '')).strip()
        if not product_code or product_code == 'nan': return '기타'

        # 1. 키즈 체크
        if product_code.startswith('J'): return '키즈'
        
        # 2. 품번 분석
        if len(product_code) > 2:
            gender_code = product_code[1]
            item_type_code = product_code[2]
        else:
            gender_code = ''
            item_type_code = ''

        # 3. 하의 정밀 분류
        if '하의' in category_val or item_type_code == '3':
            if gender_code == 'M': return '남성하의'
            elif gender_code == 'W': return '여성하의'
            elif gender_code == 'U': return '남성하의'
        
        # 4. 상의/신발/용품 분류
        if '상의' in category_val or item_type_code in ['1', '2', '4', '5', '6']: return '상의'
        elif '신발' in category_val or 'G' in product_code or 'N' in product_code: return '신발'
        elif '모자' in category_val: return '모자'
        elif '양말' in category_val: return '양말'
        elif '장갑' in category_val: return '장갑'
        elif '가방' in category_val or '스틱' in category_val: return '가방스틱'
            
        # 매칭 안되면 사용자가 지정한 열의 값(구분)을 그대로 반환 (JSON에 있으면 매핑됨)
        return category_val if category_val and category_val != 'None' and category_val != 'nan' else '기타'

    # -------------------------------------------------------------------------
    # [로직 2] DB 저장용 품목 결정 (DB_Category)
    # -------------------------------------------------------------------------
    def get_db_item_category(row):
        # 1순위: 사용자가 '품목' 열을 매핑했고 값이 있다면 그것을 사용
        mapped_category = row.get('item_category')
        if mapped_category and str(mapped_category).strip() and str(mapped_category).strip() != 'nan' and str(mapped_category).strip() != 'None':
             return str(mapped_category).strip()

        # 2순위: 품번 분석 (JSON 규칙 사용)
        product_code = str(row.get('product_number', '')).strip()
        
        if not category_mapping_config: return "기타"

        target_index = category_mapping_config.get('INDEX', 5)
        mapping_map = category_mapping_config.get('MAP', {})
        default_value = category_mapping_config.get('DEFAULT', '기타')

        if len(product_code) <= target_index: return default_value
            
        code_char = product_code[target_index]
        return mapping_map.get(code_char, default_value)

    # 컬럼 생성
    df_merged['Mapping_Key'] = df_merged.apply(get_size_mapping_key, axis=1)
    df_merged['DB_Category'] = df_merged.apply(get_db_item_category, axis=1)

    # 3. 데이터 변환 (Melt: 가로 -> 세로)
    id_vars = ['product_number', 'product_name', 'color', 'original_price', 'sale_price', 'release_year', 'DB_Category', 'Mapping_Key']
    
    df_melted = df_merged.melt(
        id_vars=id_vars, 
        value_vars=size_cols, 
        var_name='Size_Code', 
        value_name='Quantity'
    )

    # 재고 수량 정리 (숫자로 변환)
    df_melted['Quantity'] = pd.to_numeric(df_melted['Quantity'], errors='coerce').fillna(0).astype(int)
    
    # 재고가 0보다 큰 것만 남김
    df_melted = df_melted[df_melted['Quantity'] > 0]

    # 4. 사이즈 코드 -> 실제 사이즈 매핑
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
    
    # 매핑 실패한 데이터 제거
    df_final = df_melted[df_melted['Real_Size'] != "Unknown"]

    # 5. 결과 리스트 생성
    result_list = []
    for _, row in df_final.iterrows():
        
        # 가격 데이터 정제 (사용자가 열을 선택하지 않았으면 0)
        try: op = int(float(row.get('original_price', 0) or 0))
        except: op = 0
        try: sp = int(float(row.get('sale_price', 0) or 0))
        except: sp = 0
        # 둘 중 하나만 있으면 채워주기
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