import traceback
from datetime import datetime, date
from sqlalchemy import func, exc
from flask import current_app
from flowork.extensions import db
from flowork.models import Sale, SaleItem, StoreStock, StockHistory, Variant, Store
from flowork.constants import SaleStatus, StockChangeType

class SalesService:
    @staticmethod
    def create_sale(store_id, user_id, sale_date_str, items, payment_method, is_online):
        try:
            store = db.session.query(Store).with_for_update().get(store_id)
            if not store:
                raise ValueError("매장을 찾을 수 없습니다.")

            sale_date = datetime.strptime(sale_date_str, '%Y-%m-%d').date() if sale_date_str else date.today()
            
            last_sale = Sale.query.filter_by(store_id=store_id, sale_date=sale_date)\
                                  .order_by(Sale.daily_number.desc()).first()
            next_num = (last_sale.daily_number + 1) if last_sale else 1
            
            new_sale = Sale(
                store_id=store_id,
                user_id=user_id,
                payment_method=payment_method,
                sale_date=sale_date,
                daily_number=next_num,
                status=SaleStatus.VALID,
                is_online=is_online
            )
            db.session.add(new_sale)
            db.session.flush()
            
            total_amount = 0
            
            for item in items:
                variant_id = item.get('variant_id')
                
                try:
                    qty = int(item.get('quantity', 1))
                except (ValueError, TypeError):
                    raise ValueError("수량은 숫자여야 합니다.")
                    
                if qty <= 0:
                    raise ValueError(f"판매 수량은 1개 이상이어야 합니다. 입력값: {qty}")
                
                variant = db.session.get(Variant, variant_id)
                if not variant:
                    raise ValueError(f"상품 정보를 찾을 수 없습니다. Variant ID: {variant_id}")

                unit_price = variant.sale_price
                
                discount_amt = int(item.get('discount_amount', 0))
                if discount_amt < 0: discount_amt = 0
                if discount_amt > unit_price:
                    raise ValueError(f"할인 금액이 상품 가격보다 클 수 없습니다. {variant.product.product_name}")

                discounted_price = unit_price - discount_amt
                subtotal = discounted_price * qty
                
                stock = db.session.query(StoreStock).filter_by(store_id=store_id, variant_id=variant_id).with_for_update().first()
                if not stock:
                    try:
                        with db.session.begin_nested():
                            stock = StoreStock(store_id=store_id, variant_id=variant_id, quantity=0)
                            db.session.add(stock)
                    except exc.IntegrityError:
                        stock = db.session.query(StoreStock).filter_by(store_id=store_id, variant_id=variant_id).with_for_update().first()
                
                stock.quantity -= qty
                
                history = StockHistory(
                    store_id=store_id,
                    variant_id=variant_id,
                    change_type=StockChangeType.SALE,
                    quantity_change=-qty,
                    current_quantity=stock.quantity,
                    user_id=user_id
                )
                db.session.add(history)
                
                sale_item = SaleItem(
                    sale_id=new_sale.id,
                    variant_id=variant_id,
                    product_name=variant.product.product_name,
                    product_number=variant.product.product_number,
                    color=variant.color,
                    size=variant.size,
                    original_price=variant.original_price,
                    unit_price=unit_price,
                    discount_amount=discount_amt,
                    discounted_price=discounted_price,
                    quantity=qty,
                    subtotal=subtotal
                )
                db.session.add(sale_item)
                total_amount += subtotal
                
            new_sale.total_amount = total_amount
            db.session.commit()
            
            return {
                'status': 'success', 
                'message': f'판매 등록 완료 {new_sale.receipt_number}', 
                'sale_id': new_sale.id
            }
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Sale Creation Error: {e}")
            traceback.print_exc()
            return {'status': 'error', 'message': f'판매 등록 중 오류 발생: {str(e)}'}

    @staticmethod
    def refund_sale_full(sale_id, store_id, user_id):
        try:
            sale = Sale.query.filter_by(id=sale_id, store_id=store_id).with_for_update().first()
            if not sale: return {'status': 'error', 'message': '내역 없음'}
            if sale.status == SaleStatus.REFUNDED: 
                return {'status': 'error', 'message': '이미 환불된 건입니다.'}
            
            for item in sale.items:
                if item.quantity <= 0: continue
                
                stock = StoreStock.query.filter_by(store_id=store_id, variant_id=item.variant_id).with_for_update().first()
                if not stock:
                    try:
                        with db.session.begin_nested():
                            stock = StoreStock(store_id=store_id, variant_id=item.variant_id, quantity=0)
                            db.session.add(stock)
                    except exc.IntegrityError:
                        stock = StoreStock.query.filter_by(store_id=store_id, variant_id=item.variant_id).with_for_update().first()

                stock.quantity += item.quantity
                
                history = StockHistory(
                    store_id=store_id,
                    variant_id=item.variant_id,
                    change_type=StockChangeType.REFUND_FULL,
                    quantity_change=item.quantity,
                    current_quantity=stock.quantity,
                    user_id=user_id
                )
                db.session.add(history)
                
            sale.status = SaleStatus.REFUNDED
            db.session.commit()
            return {'status': 'success', 'message': f'환불 완료 {sale.receipt_number}'}
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Refund Full Error: {e}")
            return {'status': 'error', 'message': str(e)}

    @staticmethod
    def refund_sale_partial(sale_id, store_id, user_id, refund_items):
        try:
            sale = Sale.query.filter_by(id=sale_id, store_id=store_id).with_for_update().first()
            if not sale: return {'status': 'error', 'message': '내역 없음'}
            if sale.status == SaleStatus.REFUNDED: 
                return {'status': 'error', 'message': '이미 전체 환불된 건입니다.'}

            total_refunded_amount = 0

            for r_item in refund_items:
                variant_id = r_item['variant_id']
                refund_qty = int(r_item['quantity'])
                
                if refund_qty <= 0: continue

                sale_item = SaleItem.query.filter_by(sale_id=sale.id, variant_id=variant_id).first()
                
                if sale_item and sale_item.quantity >= refund_qty:
                    refund_amount = sale_item.discounted_price * refund_qty
                    
                    sale_item.quantity -= refund_qty
                    sale_item.subtotal -= refund_amount
                    sale.total_amount -= refund_amount
                    total_refunded_amount += refund_amount
                    
                    stock = StoreStock.query.filter_by(store_id=store_id, variant_id=variant_id).with_for_update().first()
                    if not stock:
                        try:
                            with db.session.begin_nested():
                                stock = StoreStock(store_id=store_id, variant_id=variant_id, quantity=0)
                                db.session.add(stock)
                        except exc.IntegrityError:
                            stock = StoreStock.query.filter_by(store_id=store_id, variant_id=variant_id).with_for_update().first()

                    stock.quantity += refund_qty
                        
                    history = StockHistory(
                        store_id=store_id,
                        variant_id=variant_id,
                        change_type=StockChangeType.REFUND_PARTIAL,
                        quantity_change=refund_qty,
                        current_quantity=stock.quantity,
                        user_id=user_id
                    )
                    db.session.add(history)

            all_zero = True
            for item in sale.items:
                if item.quantity > 0:
                    all_zero = False
                    break
            
            if all_zero:
                sale.status = SaleStatus.REFUNDED

            db.session.commit()
            return {'status': 'success', 'message': '부분 환불이 완료되었습니다.'}

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Refund Partial Error: {e}")
            return {'status': 'error', 'message': str(e)}