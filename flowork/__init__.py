import os
from flask import Flask
from flask_wtf.csrf import CSRFProtect
from .extensions import db, login_manager
from .models import User
from .commands import init_db_command, update_db_command

csrf = CSRFProtect()

login_manager.login_view = 'auth.login'
login_manager.login_message = '로그인이 필요합니다.'
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

def create_app(config_class):
    app = Flask(__name__,
                template_folder='templates',
                static_folder='static')
    app.config.from_object(config_class)
    
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = config_class.SQLALCHEMY_ENGINE_OPTIONS

    # 1. 확장 모듈 초기화
    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)

    # 2. CLI 명령어 등록
    app.cli.add_command(init_db_command)
    app.cli.add_command(update_db_command)

    # 3. 블루프린트 등록
    from .blueprints.ui import ui_bp
    from .blueprints.api import api_bp
    from .blueprints.auth import auth_bp
    
    app.register_blueprint(ui_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(auth_bp)
    
    return app