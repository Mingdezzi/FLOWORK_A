import os
import re
import shutil
from datetime import datetime

# ------------------------------------------------------------------------------
# [설정]
# ------------------------------------------------------------------------------
TEMPLATE_DIR = os.path.join('flowork', 'templates')
BACKUP_DIR = os.path.join('flowork', f'templates_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}')
BASE_TEMPLATE = 'base.html'

# 작업 제외 파일
EXCLUDED_FILES = [
    'base.html', '_header.html', '_navigation.html', '_bottom_nav.html', 
    'login.html', 'register.html', 'register_store.html',
    '403.html', '404.html', '500.html'
]

# ------------------------------------------------------------------------------
# [정규식 패턴]
# ------------------------------------------------------------------------------
# 1. Jinja2 태그 제거용 (기존에 잘못 적용된 상속/블록 태그 삭제)
JINJA_EXTENDS_PATTERN = re.compile(r'{%\s*extends\s*.*?%}', re.IGNORECASE)
JINJA_BLOCK_PATTERN = re.compile(r'{%\s*(block|endblock)\s*.*?%}', re.IGNORECASE)

# 2. HTML 구조 추출
BODY_ATTR_PATTERN = re.compile(r'<body\s+([^>]*)>', re.IGNORECASE)
BODY_CONTENT_PATTERN = re.compile(r'<body[^>]*>(.*?)</body>', re.DOTALL | re.IGNORECASE)
SCRIPT_PATTERN = re.compile(r'<script.*?>.*?</script>', re.DOTALL | re.IGNORECASE)

# 3. 불필요 요소 제거
INCLUDE_HEADER_PATTERN = re.compile(r'{%\s*include\s*[\'"]_header\.html[\'"]\s*%}', re.IGNORECASE)
INCLUDE_NAV_PATTERN = re.compile(r'{%\s*include\s*[\'"]_navigation\.html[\'"]\s*%}', re.IGNORECASE)
FLASH_MSG_PATTERN = re.compile(r'{%\s*with\s*messages\s*=\s*get_flashed_messages.*?{%\s*endwith\s*%}', re.DOTALL)
DOCTYPE_PATTERN = re.compile(r'<!DOCTYPE html>', re.IGNORECASE)
HTML_TAG_PATTERN = re.compile(r'<html.*?>|</html>', re.IGNORECASE)
HEAD_TAG_PATTERN = re.compile(r'<head.*?>.*?</head>', re.DOTALL | re.IGNORECASE)

def process_file(filepath, filename):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"❌ [실패] 파일 읽기 오류: {filename} ({e})")
        return

    # [1단계] 클리닝: 기존에 잘못 적용된 Jinja 구문이나 HTML 껍데기 제거
    # 만약 이전에 스크립트가 extends를 추가했다면 제거하고 원본 내용만 남김
    clean_content = JINJA_EXTENDS_PATTERN.sub('', content)
    clean_content = JINJA_BLOCK_PATTERN.sub('', clean_content)

    # [2단계] 본문 추출
    # <body> 태그 내부를 찾습니다.
    body_match = BODY_CONTENT_PATTERN.search(content) # 원본 content에서 찾음 (안전)
    
    if not body_match:
        # body 태그가 없다면, 이미 정리된 파일이거나 조각 파일일 수 있음
        # 하지만 "반영 안됨" 문제 해결을 위해 강제로 내부 내용을 찾음
        print(f"⚠️  [주의] <body> 태그 없음. 전체 내용을 본문으로 간주: {filename}")
        body_inner = clean_content
        body_attrs = ""
    else:
        body_inner = body_match.group(1)
        attr_match = BODY_ATTR_PATTERN.search(content)
        body_attrs = attr_match.group(1).strip() if attr_match else ""

    # [3단계] 불필요한 코드 제거 (헤더, 네비게이션, 플래시메시지, HTML 태그 등)
    body_inner = INCLUDE_HEADER_PATTERN.sub('', body_inner)
    body_inner = INCLUDE_NAV_PATTERN.sub('', body_inner)
    body_inner = FLASH_MSG_PATTERN.sub('', body_inner)
    
    # 실수로 남은 DOCTYPE, HTML, HEAD 태그 등이 body 내부에 있다면 제거
    body_inner = DOCTYPE_PATTERN.sub('', body_inner)
    body_inner = HTML_TAG_PATTERN.sub('', body_inner)
    body_inner = HEAD_TAG_PATTERN.sub('', body_inner)

    # [4단계] 스크립트 분리
    extracted_scripts = []
    def script_handler(match):
        s = match.group(0)
        # 공통 라이브러리 스크립트는 삭제 (base.html에 있음)
        if 'bootstrap' in s.lower() or 'jquery' in s.lower():
            return ''
        extracted_scripts.append(s)
        return ''

    body_inner = SCRIPT_PATTERN.sub(script_handler, body_inner)
    body_inner = body_inner.strip()

    # [5단계] 최종 파일 내용 조립
    new_lines = []
    new_lines.append("{% extends 'base.html' %}")
    new_lines.append("")

    if body_attrs:
        new_lines.append("{% block body_attrs %}")
        new_lines.append(body_attrs)
        new_lines.append("{% endblock %}")
        new_lines.append("")

    new_lines.append("{% block content %}")
    new_lines.append(body_inner)
    new_lines.append("{% endblock %}")
    new_lines.append("")

    if extracted_scripts:
        new_lines.append("{% block scripts %}")
        for script in extracted_scripts:
            new_lines.append(script)
        new_lines.append("{% endblock %}")
    
    # [6단계] 덮어쓰기
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("\n".join(new_lines))
    
    print(f"✅ [수정완료] {filename}")

def main():
    if not os.path.exists(TEMPLATE_DIR):
        print("❌ 템플릿 폴더를 찾을 수 없습니다.")
        return

    # 안전을 위해 백업 생성
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)
        print(f"📦 안전 백업 생성 중... ({BACKUP_DIR})")
    
    count = 0
    for root, dirs, files in os.walk(TEMPLATE_DIR):
        for file in files:
            if file.endswith('.html') and file not in EXCLUDED_FILES:
                src_path = os.path.join(root, file)
                # 백업
                shutil.copy(src_path, os.path.join(BACKUP_DIR, file))
                # 처리
                process_file(src_path, file)
                count += 1
    
    print(f"\n✨ 총 {count}개 파일 강제 변환 완료.")
    print(f"   혹시 문제가 생기면 '{BACKUP_DIR}' 폴더의 파일로 복구하세요.")

if __name__ == '__main__':
    main()