from flask import request, jsonify, abort
from flask_login import login_required, current_user
from flowork.models import db, Suggestion, SuggestionComment, StoreMail, Store
from . import api_bp

# --- 건의사항 API ---

@api_bp.route('/api/suggestions', methods=['POST'])
@login_required
def create_suggestion():
    data = request.json
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    is_private = data.get('is_private', False)
    
    if not title or not content:
        return jsonify({'status': 'error', 'message': '제목과 내용은 필수입니다.'}), 400
        
    try:
        s = Suggestion(
            brand_id=current_user.current_brand_id,
            store_id=current_user.store_id, # None이면 본사
            title=title,
            content=content,
            is_private=is_private
        )
        db.session.add(s)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '건의사항이 등록되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/suggestions/<int:s_id>/comment', methods=['POST'])
@login_required
def add_suggestion_comment(s_id):
    content = request.json.get('content', '').strip()
    if not content: return jsonify({'status': 'error', 'message': '내용 없음'}), 400
    
    try:
        c = SuggestionComment(suggestion_id=s_id, user_id=current_user.id, content=content)
        db.session.add(c)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '댓글 등록 완료'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/suggestions/<int:s_id>', methods=['DELETE'])
@login_required
def delete_suggestion(s_id):
    s = Suggestion.query.filter_by(id=s_id, brand_id=current_user.current_brand_id).first()
    if not s: return jsonify({'status': 'error', 'message': '게시글 없음'}), 404
    
    # 본인 글이거나 관리자만 삭제 가능
    is_author = (s.store_id == current_user.store_id) if current_user.store_id else (s.store_id is None)
    if not is_author and not current_user.is_admin:
        return jsonify({'status': 'error', 'message': '삭제 권한이 없습니다.'}), 403
        
    db.session.delete(s)
    db.session.commit()
    return jsonify({'status': 'success', 'message': '삭제되었습니다.'})

# --- 점간메일 API ---

@api_bp.route('/api/mails', methods=['POST'])
@login_required
def send_mail():
    data = request.json
    target_store_id = data.get('target_store_id') # 'HQ' 문자열이면 본사
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    
    if not title or not content:
        return jsonify({'status': 'error', 'message': '제목/내용 필수'}), 400
    
    receiver_id = None
    if target_store_id != 'HQ':
        try:
            receiver_id = int(target_store_id)
        except:
            return jsonify({'status': 'error', 'message': '수신처 오류'}), 400
            
    try:
        mail = StoreMail(
            brand_id=current_user.current_brand_id,
            sender_store_id=current_user.store_id,
            receiver_store_id=receiver_id,
            title=title,
            content=content
        )
        db.session.add(mail)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '메일이 발송되었습니다.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@api_bp.route('/api/mails/<int:m_id>', methods=['DELETE'])
@login_required
def delete_mail(m_id):
    mail = StoreMail.query.filter_by(id=m_id, brand_id=current_user.current_brand_id).first()
    if not mail: return jsonify({'status': 'error'}), 404
    
    # 보낸사람이나 받은사람만 삭제 가능
    is_sender = (mail.sender_store_id == current_user.store_id)
    is_receiver = (mail.receiver_store_id == current_user.store_id)
    
    if not is_sender and not is_receiver:
        return jsonify({'status': 'error', 'message': '권한 없음'}), 403
        
    db.session.delete(mail)
    db.session.commit()
    return jsonify({'status': 'success', 'message': '삭제되었습니다.'})