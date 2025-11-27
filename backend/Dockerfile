FROM python:3.11-slim

WORKDIR /app

# 필수 시스템 패키지 설치
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# 1. 라이브러리 설치 (캐싱 활용을 위해 먼저 수행)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. 소스 코드 복사 (구조 유지: /app/backend 폴더 안으로 복사)
COPY . ./backend

# 3. 파이썬이 /app 경로에서 'backend' 패키지를 찾을 수 있게 설정
ENV PYTHONPATH=/app

# 4. 실행 명령 수정 (backend 폴더 안의 run.py 실행)
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "backend.run:app"]