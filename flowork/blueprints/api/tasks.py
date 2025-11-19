import os
import uuid
import traceback
from flask import jsonify, current_app
from . import api_bp
from flowork.services.excel import process_stock_upsert_excel, import_excel_file
from flowork.services.image_process import process_style_code_group

TASKS = {}

def update_task_status(task_id, current, total):
    if task_id in TASKS:
        TASKS[task_id]['current'] = current
        TASKS[task_id]['total'] = total
        TASKS[task_id]['percent'] = int((current / total) * 100) if total > 0 else 0

def run_async_stock_upsert(app, task_id, file_path, form, stock_type, brand_id, target_store_id, excluded_indices, allow_create=True):
    with app.app_context():
        try:
            processed, created, message, category = process_stock_upsert_excel(
                file_path, form, stock_type, 
                brand_id, 
                target_store_id,
                progress_callback=lambda c, t: update_task_status(task_id, c, t),
                excluded_row_indices=excluded_indices,
                allow_create=allow_create
            )
            TASKS[task_id]['status'] = 'completed'
            TASKS[task_id]['result'] = {'message': message, 'category': category}
        except Exception as e:
            print(f"Async task error: {e}")
            traceback.print_exc()
            TASKS[task_id]['status'] = 'error'
            TASKS[task_id]['message'] = str(e)
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)

def run_async_import_db(app, task_id, file_path, form_data, brand_id):
    with app.app_context():
        try:
            with open(file_path, 'rb') as f:
                success, message, category = import_excel_file(
                    f, form_data, brand_id,
                    progress_callback=lambda c, t: update_task_status(task_id, c, t)
                )
            
            if success:
                TASKS[task_id]['status'] = 'completed'
                TASKS[task_id]['result'] = {'message': message, 'category': category}
            else:
                TASKS[task_id]['status'] = 'error'
                TASKS[task_id]['message'] = message
                
        except Exception as e:
            print(f"Async DB import error: {e}")
            traceback.print_exc()
            TASKS[task_id]['status'] = 'error'
            TASKS[task_id]['message'] = str(e)
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)

def run_async_image_process(app, task_id, brand_id, style_codes):
    with app.app_context():
        try:
            total = len(style_codes)
            success_count = 0
            results = []

            for i, code in enumerate(style_codes):
                update_task_status(task_id, i, total)
                
                success, msg = process_style_code_group(brand_id, code)
                results.append({'code': code, 'success': success, 'message': msg})
                if success:
                    success_count += 1
            
            update_task_status(task_id, total, total)
            TASKS[task_id]['status'] = 'completed'
            TASKS[task_id]['result'] = {
                'message': f"이미지 처리 완료: 성공 {success_count}/{total}건",
                'details': results
            }
            
        except Exception as e:
            print(f"Async image process error: {e}")
            traceback.print_exc()
            TASKS[task_id]['status'] = 'error'
            TASKS[task_id]['message'] = str(e)

@api_bp.route('/api/task_status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    task = TASKS.get(task_id)
    if not task:
        return jsonify({'status': 'not_found'}), 404
    
    if task['status'] in ['completed', 'error']:
        response = jsonify(task)
        del TASKS[task_id]
        return response
        
    return jsonify(task)