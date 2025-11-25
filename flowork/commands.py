import click
from flask.cli import with_appcontext
from .extensions import db
from .models import (
    Brand, Store, User, Product, Variant, StoreStock, StockHistory,
    Order, OrderProcessing, Sale, SaleItem,
    Staff, ScheduleEvent, Setting, Announcement, Comment,
    StockTransfer, Customer, Repair,
    Attendance, CompetitorBrand, CompetitorSale,
    Suggestion, SuggestionComment, StoreMail,
    StoreOrder, StoreReturn, UpdateLog
)

@click.command("init-db")
@with_appcontext
def init_db_command():
    print("Dropping all tables...")
    db.drop_all() 
    print("Creating all tables...")
    db.create_all() 
    print("✅ 모든 DB 테이블 초기화 완료. (모든 데이터 삭제됨)")

@click.command("update-db")
@with_appcontext
def update_db_command():
    print("Checking and creating missing tables...")
    db.create_all()
    print("✅ DB 업데이트 완료. (누락된 테이블 생성됨)")

@click.command("reset-transactions")
@with_appcontext
def reset_transactions_command():
    try:
        db.session.query(OrderProcessing).delete()
        db.session.query(Order).delete()
        db.session.query(StoreOrder).delete()
        db.session.query(StoreReturn).delete()
        db.session.query(SaleItem).delete()
        db.session.query(Sale).delete()
        db.session.query(Repair).delete()
        db.session.query(Customer).delete()
        db.session.query(StockTransfer).delete()
        db.session.query(CompetitorSale).delete()
        db.session.query(Attendance).delete()
        db.session.commit()
        print("✅ 거래 내역(주문/판매/고객/근태)이 초기화되었습니다.")
    except Exception as e:
        db.session.rollback()
        print(f"❌ 초기화 실패: {e}")

@click.command("reset-products")
@with_appcontext
def reset_products_command():
    try:
        db.session.query(StockHistory).delete()
        db.session.query(StoreStock).delete()
        db.session.query(Variant).delete()
        db.session.query(Product).delete()
        db.session.commit()
        print("✅ 상품 및 재고 데이터가 초기화되었습니다.")
    except Exception as e:
        db.session.rollback()
        print(f"❌ 초기화 실패: {e} (먼저 거래 내역을 초기화하세요)")

@click.command("reset-community")
@with_appcontext
def reset_community_command():
    try:
        db.session.query(Comment).delete()
        db.session.query(Announcement).delete()
        db.session.query(SuggestionComment).delete()
        db.session.query(Suggestion).delete()
        db.session.query(StoreMail).delete()
        db.session.commit()
        print("✅ 커뮤니티 데이터가 초기화되었습니다.")
    except Exception as e:
        db.session.rollback()
        print(f"❌ 초기화 실패: {e}")

@click.command("list-brands")
@with_appcontext
def list_brands_command():
    brands = Brand.query.all()
    print(f"{'ID':<5} | {'Brand Name':<20}")
    print("-" * 30)
    for b in brands:
        print(f"{b.id:<5} | {b.brand_name:<20}")

@click.command("reset-brand")
@click.argument("brand_id", type=int)
@with_appcontext
def reset_brand_command(brand_id):
    target_brand = db.session.get(Brand, brand_id)
    if not target_brand:
        print(f"❌ Error: 브랜드 ID {brand_id}를 찾을 수 없습니다.")
        return

    print(f"🚨 경고: 브랜드 '{target_brand.brand_name}' (ID: {brand_id})의 모든 데이터를 삭제합니다.")

    try:
        store_ids = [s.id for s in target_brand.stores]

        if store_ids:
            db.session.query(OrderProcessing).filter(OrderProcessing.source_store_id.in_(store_ids)).delete(synchronize_session=False)
            db.session.query(Order).filter(Order.store_id.in_(store_ids)).delete(synchronize_session=False)
            db.session.query(StoreOrder).filter(StoreOrder.store_id.in_(store_ids)).delete(synchronize_session=False)
            db.session.query(StoreReturn).filter(StoreReturn.store_id.in_(store_ids)).delete(synchronize_session=False)
            
            db.session.query(SaleItem).join(Sale).filter(Sale.store_id.in_(store_ids)).delete(synchronize_session=False)
            db.session.query(Sale).filter(Sale.store_id.in_(store_ids)).delete(synchronize_session=False)
            
            db.session.query(Repair).filter(Repair.store_id.in_(store_ids)).delete(synchronize_session=False)
            db.session.query(Customer).filter(Customer.store_id.in_(store_ids)).delete(synchronize_session=False)
            
            db.session.query(StockTransfer).filter(
                (StockTransfer.source_store_id.in_(store_ids)) | (StockTransfer.target_store_id.in_(store_ids))
            ).delete(synchronize_session=False)
            
            db.session.query(CompetitorSale).filter(CompetitorSale.store_id.in_(store_ids)).delete(synchronize_session=False)
            db.session.query(Attendance).filter(Attendance.store_id.in_(store_ids)).delete(synchronize_session=False)
            db.session.query(StoreMail).filter(
                (StoreMail.sender_store_id.in_(store_ids)) | (StoreMail.receiver_store_id.in_(store_ids))
            ).delete(synchronize_session=False)

        db.session.query(StockHistory).join(Store).filter(Store.brand_id == brand_id).delete(synchronize_session=False)
        db.session.query(StoreStock).join(Store).filter(Store.brand_id == brand_id).delete(synchronize_session=False)
        
        products = Product.query.filter_by(brand_id=brand_id).all()
        product_ids = [p.id for p in products]
        if product_ids:
            db.session.query(Variant).filter(Variant.product_id.in_(product_ids)).delete(synchronize_session=False)
            db.session.query(Product).filter(Product.brand_id == brand_id).delete(synchronize_session=False)

        db.session.query(Comment).join(Announcement).filter(Announcement.brand_id == brand_id).delete(synchronize_session=False)
        db.session.query(Announcement).filter_by(brand_id=brand_id).delete(synchronize_session=False)
        db.session.query(SuggestionComment).join(Suggestion).filter(Suggestion.brand_id == brand_id).delete(synchronize_session=False)
        db.session.query(Suggestion).filter_by(brand_id=brand_id).delete(synchronize_session=False)
        db.session.query(Setting).filter_by(brand_id=brand_id).delete(synchronize_session=False)

        if store_ids:
            db.session.query(Staff).filter(Staff.store_id.in_(store_ids)).delete(synchronize_session=False)
        
        db.session.query(User).filter(User.brand_id == brand_id).delete(synchronize_session=False)
        db.session.query(Store).filter(Store.brand_id == brand_id).delete(synchronize_session=False)

        db.session.commit()
        print(f"✅ 브랜드 '{target_brand.brand_name}'의 데이터가 초기화되었습니다.")

    except Exception as e:
        db.session.rollback()
        print(f"❌ 초기화 실패: {e}")
        import traceback
        traceback.print_exc()