from ..extensions import db
from .auth import Brand, User
from .store import Store, Staff, ScheduleEvent, Setting, Announcement
from .product import Product, Variant, StoreStock
from .sales import Order, OrderProcessing, Sale, SaleItem

# 기존 models.py 역할을 이 파일이 대신합니다.