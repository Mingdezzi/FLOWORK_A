import traceback
from flask import request, jsonify, abort
from flask_login import login_required, current_user
from sqlalchemy.orm import joinedload

from flowork.models import db, ScheduleEvent
from . import api_bp
from .utils import admin_required, _parse_iso_date_string

@api_bp.route('/api/schedule/events', methods=['GET'])
@login_required
def get_schedule_events():
    if not current_user.store_id:
        abort(403, description="일정 관리는 매장 계정만 사용할 수 있습니다.")

    try:
        start_str = request.args.get('start')
        end_str = request.args.get('end')

        start_date = _parse_iso_date_string(start_str)
        end_date = _parse_iso_date_string(end_str)

        if not start_date or not end_date:
            return jsonify({'status': 'error', 'message': '날짜 범위가 잘못되었습니다.'}), 400
        
        events_query = ScheduleEvent.query.options(
            joinedload(ScheduleEvent.staff) 
        ).filter(
            ScheduleEvent.store_id == current_user.store_id,
            ScheduleEvent.start_time >= start_date,
            ScheduleEvent.start_time < end_date
        )
        
        events = events_query.all()
        
        calendar_events = []
        for event in events:
            staff_name = event.staff.name if event.staff else '매장'
            
            calendar_events.append({
                'id': event.id,
                'title': f"[{staff_name}] {event.title}",
                'start': event.start_time.isoformat(),
                'end': event.end_time.isoformat() if event.end_time else None,
                'allDay': event.all_day,
                'color': event.color,
                'extendedProps': {
                    'staff_id': event.staff_id or 0,
                    'event_type': event.event_type,
                    'raw_title': event.title
                },
                'classNames': [f'event-type-{event.event_type}']
            })
            
        return jsonify(calendar_events)

    except Exception as e:
        print(f"Error fetching schedule events: {e}")
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'서버 오류: {e}'}), 500

@api_bp.route('/api/schedule/events', methods=['POST'])
@admin_required
def add_schedule_event():
    if not current_user.store_id:
        abort(403, description="일정 관리는 매장 관리자만 가능합니다.")

    data = request.json
    
    try:
        staff_id = int(data.get('staff_id', 0))
        start_date = _parse_iso_date_string(data.get('start_time'))
        end_date = _parse_iso_date_string(data.get('end_time'))
        all_day = bool(data.get('all_day', True))
        title = data.get('title', '').strip()
        event_type = data.get('event_type', '일정').strip()
        color = data.get('color', '#0d6efd')

        if not all([start_date, title, event_type]):
             return jsonify({'status': 'error', 'message': '필수 항목(시작일, 제목, 종류)이 누락되었습니다.'}), 400
        
        final_staff_id = staff_id if staff_id > 0 else None
        
        final_end_time = None
        if not all_day and end_date:
            final_end_time = end_date
        elif all_day and end_date and end_date > start_date:
            final_end_time = end_date 

        new_event = ScheduleEvent(
            store_id=current_user.store_id,
            staff_id=final_staff_id,
            title=title,
            event_type=event_type,
            start_time=start_date,
            end_time=final_end_time,
            all_day=all_day,
            color=color
        )
        db.session.add(new_event)
        db.session.commit()
        
        return jsonify({'status': 'success', 'message': '일정이 등록되었습니다.', 'event_id': new_event.id}), 201
    
    except Exception as e:
        db.session.rollback()
        print(f"Error adding schedule event: {e}")
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'서버 오류: {e}'}), 500

@api_bp.route('/api/schedule/events/<int:event_id>', methods=['POST'])
@admin_required
def update_schedule_event(event_id):
    if not current_user.store_id:
        abort(403, description="일정 관리는 매장 관리자만 가능합니다.")
        
    event = ScheduleEvent.query.filter_by(
        id=event_id, 
        store_id=current_user.store_id
    ).first()
    
    if not event:
        return jsonify({'status': 'error', 'message': '수정할 일정을 찾을 수 없습니다.'}), 404
        
    data = request.json
    
    try:
        staff_id = int(data.get('staff_id', 0))
        start_date = _parse_iso_date_string(data.get('start_time'))
        end_date = _parse_iso_date_string(data.get('end_time'))
        all_day = bool(data.get('all_day', True))
        title = data.get('title', '').strip()
        event_type = data.get('event_type', '일정').strip()
        color = data.get('color', '#0d6efd')

        if not all([start_date, title, event_type]):
             return jsonify({'status': 'error', 'message': '필수 항목(시작일, 제목, 종류)이 누락되었습니다.'}), 400
        
        event.staff_id = staff_id if staff_id > 0 else None
        event.title = title
        event.event_type = event_type
        event.start_time = start_date
        event.all_day = all_day
        event.color = color

        final_end_time = None
        if not all_day and end_date:
            final_end_time = end_date
        elif all_day and end_date and end_date > start_date:
            final_end_time = end_date
        event.end_time = final_end_time
        
        db.session.commit()
        
        return jsonify({'status': 'success', 'message': '일정이 수정되었습니다.'})
    
    except Exception as e:
        db.session.rollback()
        print(f"Error updating schedule event: {e}")
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'서버 오류: {e}'}), 500

@api_bp.route('/api/schedule/events/<int:event_id>', methods=['DELETE'])
@admin_required
def delete_schedule_event(event_id):
    if not current_user.store_id:
        abort(403, description="일정 관리는 매장 관리자만 가능합니다.")
        
    try:
        event = ScheduleEvent.query.filter_by(
            id=event_id, 
            store_id=current_user.store_id
        ).first()
        
        if not event:
            return jsonify({'status': 'error', 'message': '삭제할 일정을 찾을 수 없습니다.'}), 404
            
        db.session.delete(event)
        db.session.commit()
        
        return jsonify({'status': 'success', 'message': '일정이 삭제되었습니다.'})
        
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting schedule event: {e}")
        return jsonify({'status': 'error', 'message': f'서버 오류: {e}'}), 500