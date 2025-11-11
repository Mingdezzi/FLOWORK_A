from flask import Blueprint

ui_bp = Blueprint('ui', __name__, template_folder='../../templates')

# Import the routes that belong to the UI blueprint
from . import main, product, order, sales, admin