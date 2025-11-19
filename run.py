from flowork import create_app
from config import Config
from flowork.extensions import db
from sqlalchemy import text, inspect

app = create_app(Config)

def auto_patch_db():
    """서버 시작 시 DB 컬럼 자동 패치"""
    with app.app_context():
        inspector = inspect(db.engine)
        
        # Products 테이블에 컬럼이 있는지 확인하고 없으면 추가
        if 'products' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('products')]
            
            patch_queries = []
            if 'image_status' not in columns:
                patch_queries.append("ALTER TABLE products ADD COLUMN image_status VARCHAR(20) DEFAULT 'READY'")
            if 'image_drive_link' not in columns:
                patch_queries.append("ALTER TABLE products ADD COLUMN image_drive_link VARCHAR(500)")
            if 'thumbnail_url' not in columns:
                patch_queries.append("ALTER TABLE products ADD COLUMN thumbnail_url VARCHAR(500)")
            if 'detail_image_url' not in columns:
                patch_queries.append("ALTER TABLE products ADD COLUMN detail_image_url VARCHAR(500)")
                
            if patch_queries:
                print(f"🔄 [DB Patch] {len(patch_queries)}개 컬럼 추가 중...")
                try:
                    with db.engine.connect() as conn:
                        for sql in patch_queries:
                            conn.execute(text(sql))
                        conn.commit()
                    print("✅ [DB Patch] 컬럼 추가 완료!")
                except Exception as e:
                    print(f"❌ [DB Patch] 오류: {e}")

if __name__ == '__main__':
    auto_patch_db() # 로컬 실행 시 패치
    app.run(debug=True, host='0.0.0.0', port=5000)
else:
    # Gunicorn 실행 시 패치 (프로덕션 환경)
    auto_patch_db()
