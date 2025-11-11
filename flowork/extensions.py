from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

# 순환 참조 방지를 위해 확장 모듈 인스턴스를 여기서 생성합니다.
db = SQLAlchemy()
login_manager = LoginManager()