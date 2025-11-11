import os
from flask import Flask
from sqlalchemy import text
from apscheduler.schedulers.background import BackgroundScheduler

from .extensions import db, login_manager
from .models import User 
from .commands import init_db_command  # [신규] 명령어 import

login_manager.login_view = 'auth.login' 
login_manager.login_message = '로그인이 필요합니다.'
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id)) 

def keep_db_awake(app):
    """DB 연결 끊김 방지용 스케줄러 작업"""
    try:
        with app.app_context():
            db.session.execute(text('SELECT 1'))
            print("Neon DB keep-awake (from scheduler).")
    except Exception as e:
        print(f"Keep-awake scheduler error: {e}")

def create_app(config_class):
    app = Flask(__name__,
                template_folder='templates',
                static_folder='static')
    app.config.from_object(config_class)
    
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = config_class.SQLALCHEMY_ENGINE_OPTIONS

    # 1. 확장 모듈 초기화
    db.init_app(app)
    login_manager.init_app(app) 

    # 2. CLI 명령어 등록
    app.cli.add_command(init_db_command)

    # 3. 블루프린트 등록
    from .blueprints.ui import ui_bp 
    from .blueprints.api import api_bp
    from .routes_auth import auth_bp 
    
    app.register_blueprint(ui_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(auth_bp) 
    
    # 4. 스케줄러 설정 (Render 환경)
    if os.environ.get('RENDER'):
        scheduler = BackgroundScheduler(daemon=True)
        scheduler.add_job(lambda: keep_db_awake(app), 'interval', minutes=3)
        scheduler.start()
        print("APScheduler started (Render environment).")
    else:
        print("APScheduler skipped (Not in RENDER environment).")
    
    return app