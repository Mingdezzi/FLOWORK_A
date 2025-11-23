import os
import re

# ------------------------------------------------------------------------------
# [설정] 스크립트 실행 환경 설정
# ------------------------------------------------------------------------------
# 템플릿 디렉토리 경로 (프로젝트 루트 기준)
TEMPLATE_DIR = os.path.join('flowork', 'templates')

# 작업에서 제외할 파일 목록 (이미 구조가 잡혀있거나, 부품으로 쓰이는 파일들)
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

# ------------------------------------------------------------------------------
# [정규식 패턴 정의]
# ------------------------------------------------------------------------------

# 1. <body> 태그의 속성 추출 (예: data-api-url="..." 등)
#    - 대소문자 무시, 태그 안의 속성 그룹 캡처
BODY_ATTR_PATTERN = re.compile(r'<body\s+([^>]*)>', re.IGNORECASE)

# 2. <body>...</body> 내부 내용 전체 추출
#    - 개행 문자 포함(DOTALL)
BODY_CONTENT_PATTERN = re.compile(r'<body[^>]*>(.*?)</body>', re.DOTALL | re.IGNORECASE)

# 3. <script> 태그 추출 (src 속성이 있거나, 내부 스크립트가 있는 경우 모두)
SCRIPT_PATTERN = re.compile(r'<script.*?>.*?</script>', re.DOTALL | re.IGNORECASE)

# 4. 제거할 include 구문들 (_header, _navigation)
INCLUDE_HEADER_PATTERN = re.compile(r'{%\s*include\s*[\'"]_header\.html[\'"]\s*%}', re.IGNORECASE)
INCLUDE_NAV_PATTERN = re.compile(r'{%\s*include\s*[\'"]_navigation\.html[\'"]\s*%}', re.IGNORECASE)

# 5. 제거할 Flash Message 블록 ({% with messages ... %} ... {% endwith %})
FLASH_MSG_PATTERN = re.compile(r'{%\s*with\s*messages\s*=\s*get_flashed_messages.*?{%\s*endwith\s*%}', re.DOTALL)

# 6. 중복된 Bootstrap JS 제거용
BOOTSTRAP_JS_PATTERN = re.compile(r'<script\s+src=[\'"].*bootstrap.*[\'"].*?>\s*</script>', re.IGNORECASE)


# ------------------------------------------------------------------------------
# [핵심 로직] 파일 처리 함수
# ------------------------------------------------------------------------------
def process_file(filepath):
    filename = os.path.basename(filepath)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"❌ [오류] 파일 읽기 실패 ({filename}): {e}")
        return

    # 1. 이미 작업된 파일인지 확인 (base.html 상속 여부)
    if "{% extends" in content:
        print(f"⏭️  [건너뜀] 이미 상속 적용됨: {filename}")
        return

    # 2. <body> 태그 찾기 (없으면 처리 불가)
    body_match = BODY_CONTENT_PATTERN.search(content)
    if not body_match:
        print(f"⚠️  [건너뜀] <body> 태그를 찾을 수 없음: {filename}")
        return

    print(f"🔄 [처리중] {filename}...", end='')

    # --- 데이터 추출 시작 ---
    
    # A. Body 속성 추출
    #    예: <body data-url="..."> -> data-url="..."
    attr_match = BODY_ATTR_PATTERN.search(content)
    body_attrs = attr_match.group(1).strip() if attr_match else ""

    # B. 본문 내용 추출 (body 태그 내부의 raw HTML)
    body_inner = body_match.group(1)

    # --- 불필요한 코드 제거 (Cleaning) ---

    # C. Header/Navigation Include 제거 (base.html에 이미 있음)
    body_inner = INCLUDE_HEADER_PATTERN.sub('', body_inner)
    body_inner = INCLUDE_NAV_PATTERN.sub('', body_inner)

    # D. Flash Message 영역 제거 (base.html에 이미 있음)
    body_inner = FLASH_MSG_PATTERN.sub('', body_inner)

    # E. 스크립트 분리 및 정리
    extracted_scripts = []

    def script_handler(match):
        script_tag = match.group(0)
        # Bootstrap JS나 jQuery는 base.html에 있으므로 본문에서 삭제만 함
        if 'bootstrap' in script_tag.lower() or 'jquery' in script_tag.lower():
            return ''
        
        # 그 외 스크립트(커스텀 JS 등)는 리스트에 담고 본문에서 삭제
        extracted_scripts.append(script_tag)
        return ''

    # 본문에서 스크립트를 찾아내고(extracted_scripts에 저장), 본문에서는 지움
    body_inner = SCRIPT_PATTERN.sub(script_handler, body_inner)

    # F. 불필요한 공백 정리
    body_inner = body_inner.strip()

    # --- 새로운 파일 내용 조립 (Jinja2 Template) ---
    
    new_content_lines = []
    
    # 1. 상속 선언
    new_content_lines.append("{% extends 'base.html' %}")
    new_content_lines.append("")

    # 2. Body 속성 블록 (속성이 있을 때만 생성)
    if body_attrs:
        new_content_lines.append("{% block body_attrs %}")
        new_content_lines.append(body_attrs)
        new_content_lines.append("{% endblock %}")
        new_content_lines.append("")

    # 3. Extra Head 블록 (필요하다면 추가, 여기서는 기본적으로 비워둠)
    #    기존 파일 <head> 내의 특정 스타일이 있다면 수동으로 옮겨야 할 수 있음.
    #    현재 로직은 body 내부만 처리함.

    # 4. 본문 컨텐츠 블록
    new_content_lines.append("{% block content %}")
    new_content_lines.append(body_inner)
    new_content_lines.append("{% endblock %}")
    new_content_lines.append("")

    # 5. 스크립트 블록 (추출된 스크립트가 있을 때만 생성)
    if extracted_scripts:
        new_content_lines.append("{% block scripts %}")
        for script in extracted_scripts:
            new_content_lines.append(script)
        new_content_lines.append("{% endblock %}")
        new_content_lines.append("")

    # --- 파일 덮어쓰기 ---
    new_file_content = "\n".join(new_content_lines)
    
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_file_content)
        print(" 완료 ✅")
    except Exception as e:
        print(f" ❌ [실패] 파일 쓰기 오류: {e}")


# ------------------------------------------------------------------------------
# [메인 실행부]
# ------------------------------------------------------------------------------
def main():
    # 템플릿 디렉토리 존재 확인
    if not os.path.exists(TEMPLATE_DIR):
        print("="*60)
        print(f"❌ [오류] 템플릿 폴더를 찾을 수 없습니다.")
        print(f"   경로: {os.path.abspath(TEMPLATE_DIR)}")
        print("   >> 이 스크립트는 'flowork' 폴더가 보이는 최상위 경로에서 실행해야 합니다.")
        print("="*60)
        return

    print(f"📂 템플릿 폴더 스캔 시작: {os.path.abspath(TEMPLATE_DIR)}\n")
    
    processed_count = 0
    total_count = 0

    for root, dirs, files in os.walk(TEMPLATE_DIR):
        for file in files:
            if file.endswith('.html') and file not in EXCLUDED_FILES:
                total_count += 1
                full_path = os.path.join(root, file)
                process_file(full_path)
                processed_count += 1
    
    print("\n" + "="*60)
    print(f"✨ 작업 완료: 총 {total_count}개 파일 스캔됨.")
    print("="*60)

if __name__ == '__main__':
    main()