import traceback
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload, joinedload
from flask import current_app
from flowork.extensions import db, cache
from flowork.models import Product, Variant, Store, StoreStock
from flowork.utils import clean_string_upper

class ProductService:
    # ... (기존 get_product_detail_context, get_stock_overview_matrix 메서드 유지) ...

    @staticmethod
    def search_products(brand_id, params, page=1, per_page=20):
        """
        [신규] 상세 검색 로직 (UI 뷰에서 분리됨)
        """
        try:
            query = db.session.query(Product).options(selectinload(Product.variants)).filter(
                 Product.brand_id == brand_id
            )
            
            needs_variant_join = False
            variant_filters = []
            
            # 필터 조건 적용
            if params.get('product_name'):
                query = query.filter(Product.product_name_cleaned.like(f"%{clean_string_upper(params['product_name'])}%"))
            if params.get('product_number'):
                query = query.filter(Product.product_number_cleaned.like(f"%{clean_string_upper(params['product_number'])}%"))
            if params.get('item_category'):
                query = query.filter(Product.item_category == params['item_category'])
            if params.get('release_year'):
                query = query.filter(Product.release_year == int(params['release_year']))

            # Variant 관련 필터
            if params.get('color'):
                needs_variant_join = True
                variant_filters.append(Variant.color_cleaned == clean_string_upper(params['color']))
            if params.get('size'):
                needs_variant_join = True
                variant_filters.append(Variant.size_cleaned == clean_string_upper(params['size']))
            if params.get('original_price'):
                needs_variant_join = True
                variant_filters.append(Variant.original_price == int(params['original_price']))
            if params.get('sale_price'):
                needs_variant_join = True
                variant_filters.append(Variant.sale_price == int(params['sale_price']))
            if params.get('min_discount'):
                try:
                    min_discount_val = float(params['min_discount']) / 100.0
                    if min_discount_val > 0:
                        needs_variant_join = True
                        variant_filters.append(Variant.original_price > 0)
                        variant_filters.append((Variant.sale_price / Variant.original_price) <= (1.0 - min_discount_val))
                except (ValueError, TypeError):
                    pass 

            if needs_variant_join:
                query = query.join(Product.variants).filter(*variant_filters)
            
            # 정렬 및 페이징
            pagination = query.order_by(
                Product.release_year.desc(), Product.product_name
            ).paginate(page=page, per_page=per_page, error_out=False)
            
            return {
                'items': pagination.items,
                'total': pagination.total,
                'pages': pagination.pages,
                'current_page': page,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            }

        except Exception as e:
            current_app.logger.error(f"Search products error: {e}")
            raise e