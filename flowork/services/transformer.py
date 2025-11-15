import pandas as pd
import io
from flowork.services.brand_logic import get_brand_logic

def transform_horizontal_to_vertical(file_stream, size_mapping_config, category_mapping_config, column_map_indices):
    # 1. 파일 읽기
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

    df_stock.columns = df_stock.columns.astype(str).str.strip()

    # 2. 필요한 컬럼 추출 (메타데이터)
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

    # 3. 사이즈 컬럼(0~29) 식별
    size_cols = [col for col in df_stock.columns if col in [str(i) for i in range(30)]]
    if not size_cols:
        return [] 

    df_merged = pd.concat([extracted_data, df_stock[size_cols]], axis=1)

    # -------------------------------------------------------------------------
    # [핵심] 브랜드별 로직 주입 (Strategy Pattern)
    # -------------------------------------------------------------------------
    
    # JSON 설정에서 'LOGIC' 필드를 읽어옴 (없으면 'GENERIC')
    logic_name = category_mapping_config.get('LOGIC', 'GENERIC')
    
    # 해당 로직 모듈 가져오기 (예: eider.py)
    logic_module = get_brand_logic(logic_name)

    # 로직 적용
    df_merged['Mapping_Key'] = df_merged.apply(logic_module.get_size_mapping_key, axis=1)
    df_merged['DB_Category'] = df_merged.apply(lambda r: logic_module.get_db_item_category(r, category_mapping_config), axis=1)

    # -------------------------------------------------------------------------

    # 5. 데이터 변환 (Unpivot/Melt)
    id_vars = ['product_number', 'product_name', 'color', 'original_price', 'sale_price', 'release_year', 'DB_Category', 'Mapping_Key']
    
    df_melted = df_merged.melt(
        id_vars=id_vars, 
        value_vars=size_cols, 
        var_name='Size_Code', 
        value_name='Quantity'
    )

    df_melted['Quantity'] = pd.to_numeric(df_melted['Quantity'], errors='coerce').fillna(0).astype(int)
    
    # 6. 사이즈 코드 매핑
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
    
    # 매핑되지 않은 사이즈 제거
    df_final = df_melted[df_melted['Real_Size'] != "Unknown"]

    # 7. 최종 결과 리스트 생성
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