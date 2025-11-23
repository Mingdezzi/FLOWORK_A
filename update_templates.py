import os
import re

# --- 설정 ---
# 프로젝트 루트에서 실행한다고 가정합니다. (flowork 폴더가 보이는 위치)
TEMPLATE_DIR = os.path.join('flowork', 'templates')
BASE_TEMPLATE = 'base.html'

# 변경하지 않을 파일 목록
EXCLUDED_FILES = [
    'base.html', 
    '_header.html', 
    '_navigation.html', 
    '_bottom_nav.html', 
    'login.html', 
    'register.html', 
    'register_store.html',
    '403.html', 
    '404.html', 
    '500.html'
]

# --- 정규식 ---
# 1. <body> 태그의 속성 추출 (예: data-api-url 등)
BODY_ATTR_PATTERN = re.compile(r'<body([^>]*)>', re.IGNORECASE)

# 2. <body>...</body> 내부 내용 추출 (DOTALL로 개행 포함)
BODY_CONTENT_PATTERN = re.compile(r'<body[^>]*>(.*?)</body>', re.DOTALL | re.IGNORECASE)

# 3. <script> 태그 추출 (하단 스크립트 이동용)
SCRIPT_PATTERN = re.compile(r'<script.*?>.*?</script>', re.DOTALL | re.IGNORECASE)

def process_file(filepath):
    filename = os.path.basename(filepath)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. 이미 작업된 파일인지 확인
    if "{% extends" in content:
        print(f"⏭️  [건너뜀] 이미 상속 중: {filename}")
        return

    # 2. body 태그 찾기
    body_match = BODY_CONTENT_PATTERN.search(content)
    if not body_match:
        print(f"⚠️  [건너뜀] <body> 태그를 찾을 수 없음: {filename}")
        return

    print(f"🔄 [처리중] {filename}...", end='')

    # --- 데이터 추출 ---
    
    # A. Body 속성 (data-* 등)
    attr_match = BODY_ATTR_PATTERN.search(content)
    body_attrs = attr_match.group(1).strip() if attr_match else ""

    # B. 본문 내용 (body 태그 내부)
    body_inner = body_match.group(1)

    # C. 불필요한 include 제거 (_header, _navigation)
    body_inner = re.sub(r'{%\s*include\s*[\'"]_header\.html[\'"]\s*%}', '', body_inner)
    body_inner = re.sub(r'{%\s*include\s*[\'"]_navigation\.html[\'"]\s*%}', '', body_inner)

    # D. Flash Message 영역 제거 (base.html에 이미 있음)
    flash_pattern = re.compile(r'{%\s*with\s*messages\s*=\s*get_flashed_messages.*?{%\s*endwith\s*%}', re.DOTALL)
    body_inner = flash_pattern.sub('', body_inner)

    # E. <script> 태그 분리
    scripts = []
    def extract_scripts(match):
        s = match.group(0)
        # bootstrap 등 공통 라이브러리는 제외 (base.html에 있음)
        if 'bootstrap' in s or 'jquery' in s:
            return ''
        scripts.append(s)
        return '' # 본문에서 제거

    body_inner = SCRIPT_PATTERN.sub(extract_scripts, body_inner)

    # --- 새 내용 조립 ---
    new_content = f"{{% extends '{BASE_TEMPLATE}' %}}\n\n"

    # 1. Body 속성이 있다면 block으로 전달
    if body_attrs:
        new_content += f"{{% block body_attrs %}}{body_attrs}{{% endblock %}}\n\n"

    # 2. 본문 내용 (block content)
    new_content += "{% block content %}\n"
    new_content += body_inner.strip()
    new_content += "\n{% endblock %}\n\n"

    # 3. 스크립트 (block scripts)
    if scripts:
        new_content += "{% block scripts %}\n"
        new_content += "\n".join(scripts)
        new_content += "\n{% endblock %}\n"

    # --- 파일 쓰기 ---
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(" 완료 ✅")

def main():
    if not os.path.exists(TEMPLATE_DIR):
        print(f"❌ 오류: 템플릿 폴더를 찾을 수 없습니다: {os.path.abspath(TEMPLATE_DIR)}")
        print("   >> 이 스크립트는 'flowork' 폴더가 보이는 '프로젝트 최상위 루트'에서 실행해야 합니다.")
        return

    print(f"📂 검색 경로: {os.path.abspath(TEMPLATE_DIR)}")
    
    count = 0
    for root, dirs, files in os.walk(TEMPLATE_DIR):
        for file in files:
            if file.endswith('.html') and file not in EXCLUDED_FILES:
                process_file(os.path.join(root, file))
                count += 1
    
    print(f"\n✨ 총 {count}개의 파일을 검사했습니다.")

if __name__ == '__main__':
    main()