# db_patch.py
from flask import Flask
from flowork import create_app
from flowork.extensions import db
from config import Config
from sqlalchemy import text

app = create_app(Config)

def add_columns():
    with app.app_context():
        print("DB 컬럼 추가 작업을 시작합니다...")
        
        # 실행할 SQL 명령어들 (PostgreSQL 기준)
        commands = [
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_status VARCHAR(20) DEFAULT 'READY'",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_drive_link VARCHAR(500)",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500)",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS detail_image_url VARCHAR(500)"
        ]

        try:
            with db.engine.connect() as conn:
                for sql in commands:
                    try:
                        conn.execute(text(sql))
                        print(f"성공: {sql}")
                    except Exception as e:
                        print(f"건너뜀 (또는 에러): {e}")
                conn.commit()
            print("✅ DB 패치 완료! 이제 서버를 재시작하세요.")
            
        except Exception as e:
            print(f"❌ 치명적 오류 발생: {e}")

if __name__ == '__main__':
    add_columns()