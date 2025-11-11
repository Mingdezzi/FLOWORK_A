from flask import Blueprint

ui_bp = Blueprint('ui', __name__, template_folder='../../templates')

# 뷰 모듈
from . import main, product, order, sales, admin

# 에러 핸들러 및 컨텍스트 프로세서 등록 (Import만 하면 데코레이터에 의해 등록됨)
from . import errors, processors