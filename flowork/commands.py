import click
from flask.cli import with_appcontext
from .extensions import db
from .models import (
    Brand, Store, User, Product, Variant, StoreStock, 
    Order, OrderProcessing, Setting, Announcement,
    Staff, ScheduleEvent, Sale, SaleItem
)

@click.command("init-db")
@with_appcontext
def init_db_command():
    """기존 데이터를 삭제하고 새 테이블을 생성합니다."""
    print("Dropping all tables...")
    db.drop_all() 
    print("Creating all tables...")
    db.create_all() 
    print("✅ 모든 DB 테이블 초기화 완료. (모든 데이터 삭제됨)")