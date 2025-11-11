from flask import Blueprint

ui_bp = Blueprint('ui', __name__, template_folder='../../templates')

# 아래 모듈들은 flowork/blueprints/ui/ 폴더 안에 있어야 함
from . import main, product, order, sales, admin, errors, processors