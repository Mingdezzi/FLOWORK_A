# 안정적인 Python 3.11 버전 사용
FROM python:3.11-slim as builder

WORKDIR /app

COPY requirements.txt .
# 라이브러리 설치
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim

WORKDIR /app

# 빌더 이미지에서 설치된 패키지 복사 (3.11 경로 확인)
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 필수 시스템 패키지 및 Git 설치
RUN apt-get update && \
    apt-get install -y curl git && \
    mkdir -p /app/models && \
    curl -L -o /app/models/u2net.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY . .

# 환경 변수 설정
ENV CUDA_VISIBLE_DEVICES=-1
ENV PYTHONUNBUFFERED=1

# 서버 실행
CMD ["gunicorn", "-c", "gunicorn.conf.py", "run:app"]