import re
from sqlalchemy import or_
from flowork.extensions import db
from flowork.models import Product, Variant
from flowork.utils import clean_string_upper, get_choseong

def get_filter_options_from_db(brand_id):
    """상품 목록 페이지의 상세 검색 필터 옵션(카테고리, 년도, 컬러, 사이즈 등)을 DB에서 추출"""
    try:
        # 카테고리 목록
        categories = [r[0] for r in db.session.query(Product.item_category)
                      .filter(Product.brand_id == brand_id)
                      .distinct().order_by(Product.item_category).all() if r[0]]
        
        # 출시년도 목록
        years = [r[0] for r in db.session.query(Product.release_year)
                 .filter(Product.brand_id == brand_id)
                 .distinct().order_by(Product.release_year.desc()).all() if r[0]]
        
        # 변형(Variant) 관련 쿼리 (컬러, 사이즈, 가격)
        variant_query = db.session.query(Variant).join(Product).filter(Product.brand_id == brand_id)
        
        colors = [r[0] for r in variant_query.distinct(Variant.color)
                  .with_entities(Variant.color).order_by(Variant.color).all() if r[0]]
        
        sizes_raw = [r[0] for r in variant_query.distinct(Variant.size)
                     .with_entities(Variant.size).all() if r[0]]
        
        # 사이즈 정렬 로직
        def size_sort_key(size_str):
            s = str(size_str).upper().strip()
            custom_order = {'2XS': 'XXS', '2XL': 'XXL', '3XL': 'XXXL'}
            s = custom_order.get(s, s)
            order_map = {'XXS': 0, 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6, 'XXXL': 7, 'FREE': 99}
            
            if s.isdigit(): return (1, int(s))
            if s in order_map: return (2, order_map[s])
            return (3, s)
            
        sizes = sorted(sizes_raw, key=size_sort_key)
        
        # 가격 목록
        original_prices = [r[0] for r in variant_query.distinct(Variant.original_price)
                           .with_entities(Variant.original_price).order_by(Variant.original_price.desc()).all() if r[0] and r[0] > 0]
        
        sale_prices = [r[0] for r in variant_query.distinct(Variant.sale_price)
                       .with_entities(Variant.sale_price).order_by(Variant.sale_price.desc()).all() if r[0] and r[0] > 0]
                       
        return {
            'categories': categories,
            'years': years,
            'colors': colors,
            'sizes': sizes,
            'original_prices': original_prices,
            'sale_prices': sale_prices
        }
    except Exception as e:
        print(f"Filter Option Error: {e}")
        return {
            'categories': [], 'years': [], 'colors': [], 'sizes': [],
            'original_prices': [], 'sale_prices': []
        }

def sync_missing_data_in_db(brand_id):
    """누락된 상품 정보(가격, 카테고리 등)를 동일 품번의 다른 데이터로 채워넣음"""
    updated_variant_count = 0
    updated_product_count = 0
    
    try:
        all_variants = db.session.query(Variant).join(Product).filter(Product.brand_id == brand_id).all()
        all_products = db.session.query(Product).filter(Product.brand_id == brand_id).all()

        # 데이터 채우기를 위한 참조 룩업 테이블 생성
        product_default_lookup = {}
        
        for v in all_variants:
            pn = v.product.product_number 
            if pn not in product_default_lookup: product_default_lookup[pn] = {}
            
            if 'original_price' not in product_default_lookup[pn] and v.original_price > 0:
                 product_default_lookup[pn]['original_price'] = v.original_price
            if 'sale_price' not in product_default_lookup[pn] and v.sale_price > 0:
                 product_default_lookup[pn]['sale_price'] = v.sale_price

        for p in all_products:
             if p.product_number not in product_default_lookup: product_default_lookup[p.product_number] = {}
             if 'item_category' not in product_default_lookup[p.product_number] and p.item_category:
                  product_default_lookup[p.product_number]['item_category'] = p.item_category
             if 'release_year' not in product_default_lookup[p.product_number] and p.release_year:
                  product_default_lookup[p.product_number]['release_year'] = p.release_year

        # 1. 가격 정보 업데이트
        variants_to_update = db.session.query(Variant).join(Product).filter(
            Product.brand_id == brand_id,
            or_(Variant.original_price == 0, Variant.original_price.is_(None),
                Variant.sale_price == 0, Variant.sale_price.is_(None))
        ).all()

        for variant in variants_to_update:
            defaults = product_default_lookup.get(variant.product.product_number)
            if defaults:
                updated = False
                if (not variant.original_price) and 'original_price' in defaults:
                    variant.original_price = defaults['original_price']
                    updated = True
                if (not variant.sale_price) and 'sale_price' in defaults:
                    variant.sale_price = defaults['sale_price']
                    updated = True
                if updated: updated_variant_count += 1

        # 2. 상품 정보(카테고리, 년도, 초성) 업데이트
        products_to_update = db.session.query(Product).filter(
             Product.brand_id == brand_id,
             or_(Product.item_category.is_(None), Product.item_category == '',
                 Product.release_year.is_(None),
                 Product.product_name_choseong.is_(None)) 
        ).all()
        
        year_pattern = re.compile(r'^M(2[0-9])')

        for product in products_to_update:
            defaults = product_default_lookup.get(product.product_number)
            updated = False
            
            if (not product.item_category) and defaults and 'item_category' in defaults:
                product.item_category = defaults['item_category']
                updated = True
            
            if product.release_year is None:
                if defaults and 'release_year' in defaults:
                    product.release_year = defaults['release_year']
                    updated = True
                else:
                    pn_cleaned = product.product_number_cleaned or clean_string_upper(product.product_number)
                    match = year_pattern.match(pn_cleaned)
                    if match:
                        product.release_year = int(f"20{match.group(1)}")
                        updated = True
            
            if not product.product_name_choseong:
                product.product_name_choseong = get_choseong(product.product_name)
                updated = True

            if updated: updated_product_count += 1
        
        if updated_variant_count > 0 or updated_product_count > 0:
            db.session.commit()
            return True, f"동기화 완료: 상품 {updated_product_count}개, 옵션 {updated_variant_count}개 업데이트", "success"
        else:
            return True, "동기화할 데이터가 없습니다.", "info"

    except Exception as e:
        db.session.rollback()
        return False, f"동기화 오류: {e}", "error"