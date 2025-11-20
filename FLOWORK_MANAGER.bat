@echo off
chcp 65001 > nul
cls

:: ====================================================
:: [설정] 서버 정보
:: ====================================================
set SERVER_IP=212.47.68.72
set USER=root
set PROJECT_DIR=~/flowork
:: ====================================================

:MAIN_MENU
cls
echo.
echo ======================================================
echo         FLOWORK 서버 매니저 (v3.3 Custom)
echo ======================================================
echo.
echo  [1] 🚀  스마트 업데이트 (Git Pull + 재시작)
echo      - 가장 많이 쓰는 기능. 변경된 코드만 반영합니다.
echo      - DB 데이터는 안전하게 유지됩니다.
echo.
echo  [2] 🛠️  초기화 및 DB 관리 (Reset & DB)
echo      - DB 스키마 업데이트, 코드 재배포, 공장 초기화 등
echo.
echo  [3] 🔍  모니터링 및 백업 (Monitor & Backup)
echo      - 실시간 로그, 서버 상태 점검, 데이터 백업
echo.
echo  [4] ⚡  서버 제어 (Power)
echo      - 멈춤, 시작, 재부팅
echo.
echo  [5] ⌨️  커스텀 명령어 실행 (Execute Command) ★NEW
echo      - 원하는 리눅스 명령어를 입력해서 바로 실행합니다.
echo.
echo  [6] 💾  기초 설치 (Docker) - 최초 1회
echo  [7] 💻  SSH 터미널 접속
echo.
echo ======================================================
set /p choice="명령을 선택하세요 (번호 입력): "

if "%choice%"=="1" goto UPDATE
if "%choice%"=="2" goto RESET_MENU
if "%choice%"=="3" goto MONITOR_MENU
if "%choice%"=="4" goto CONTROL_MENU
if "%choice%"=="5" goto CUSTOM_CMD
if "%choice%"=="6" goto INSTALL
if "%choice%"=="7" goto SSH_CONNECT
goto MAIN_MENU

:: ----------------------------------------------------
:: [2] 초기화 및 DB 관리 메뉴
:: ----------------------------------------------------
:RESET_MENU
cls
echo.
echo ======================================================
echo           🛠️ 초기화 및 DB 관리
echo ======================================================
echo.
echo  [1] 🏗️  DB 스키마 업데이트 (Update DB) [안전]
echo      - 데이터 유지. 모델(Model) 변경 사항만 DB에 반영합니다.
echo.
echo  [2] 🧹  코드 캐시 초기화 (Re-deploy)
echo      - DB 유지. 도커 캐시를 지우고 코드를 새로 빌드합니다.
echo      - 코드가 꼬였거나 수정 사항이 반영 안 될 때 사용.
echo.
echo  ---------------- [주의 구역] ----------------
echo.
echo  [3] ♻️   DB 테이블 초기화 (Schema Reset)
echo      - 'flask init-db' 실행
echo      - 모든 테이블을 DROP 하고 다시 만듭니다. (데이터 삭제됨)
echo.
echo  [4] 💥  DB 데이터 완전 삭제 (Volume Wipe)
echo      - DB 파일을 영구 삭제하고 DB를 새로 만듭니다.
echo.
echo  [5] 🧨  공장 초기화 (Factory Reset)
echo      - [코드 + DB + 설정] 모든 것을 삭제하고 처음부터 다시 설치합니다.
echo      - 서버를 처음 샀을 때 상태로 되돌립니다.
echo.
echo  [0] 뒤로 가기
echo.
echo ======================================================
set /p r_choice="선택하세요: "

if "%r_choice%"=="1" goto DB_UPDATE
if "%r_choice%"=="2" goto RESET_CODE
if "%r_choice%"=="3" goto RESET_DB_TABLES
if "%r_choice%"=="4" goto RESET_DB_VOLUME
if "%r_choice%"=="5" goto FACTORY_RESET
if "%r_choice%"=="0" goto MAIN_MENU
goto RESET_MENU

:: ----------------------------------------------------
:: [3] 모니터링 및 백업 메뉴
:: ----------------------------------------------------
:MONITOR_MENU
cls
echo.
echo ======================================================
echo           🔍 모니터링 및 백업
echo ======================================================
echo.
echo  [1] 📊  실시간 로그 보기 (Live Logs)
echo      - 서버의 동작 로그를 실시간으로 확인합니다. (종료: Ctrl+C)
echo.
echo  [2] 🏥  서버 상태 점검 (Health Check)
echo      - CPU, RAM, 디스크 용량을 확인합니다.
echo.
echo  [3] 💾  데이터 백업 (Backup to PC)
echo      - DB와 이미지 폴더를 압축해서 바탕화면으로 가져옵니다.
echo.
echo  [4] 🧹  디스크 정리 (Disk Clean)
echo      - 불필요한 캐시 파일을 삭제하여 용량을 확보합니다.
echo.
echo  [0] 뒤로 가기
echo.
echo ======================================================
set /p m_choice="선택하세요: "

if "%m_choice%"=="1" goto LOGS
if "%m_choice%"=="2" goto HEALTH
if "%m_choice%"=="3" goto BACKUP
if "%m_choice%"=="4" goto CLEANUP
if "%m_choice%"=="0" goto MAIN_MENU
goto MONITOR_MENU

:: ----------------------------------------------------
:: [4] 서버 제어 메뉴
:: ----------------------------------------------------
:CONTROL_MENU
cls
echo.
echo ======================================================
echo           ⚡ 서버 제어
echo ======================================================
echo  [1] ⏹  서버 멈추기 (Stop)
echo  [2] ▶  서버 다시 켜기 (Start)
echo  [3] 🔄  강제 재시작 (Restart)
echo  [0] 뒤로 가기
echo ======================================================
set /p c_choice="선택하세요: "

if "%c_choice%"=="1" goto STOP
if "%c_choice%"=="2" goto START
if "%c_choice%"=="3" goto RESTART
if "%c_choice%"=="0" goto MAIN_MENU
goto CONTROL_MENU


:: ====================================================
::                 동작 스크립트 모음
:: ====================================================

:UPDATE
echo.
echo [서버] Git Pull 및 컨테이너 업데이트... (비번 입력)
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && git pull origin main && docker compose build && docker compose up -d"
echo.
echo ✅ 업데이트 완료.
pause
goto MAIN_MENU

:DB_UPDATE
echo.
echo [서버] DB 스키마를 업데이트합니다 (update-db)... (비번 입력)
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker exec flowork_app flask --app run.py update-db"
echo.
echo ✅ DB 업데이트 완료.
pause
goto DB_MENU

:RESET_CODE
echo.
echo [서버] 코드 캐시를 삭제하고 재배포합니다... (비번 입력)
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker compose down && docker builder prune -af && git pull origin main && docker compose build --no-cache && docker compose up -d"
echo.
echo ✅ 코드 초기화 및 재배포 완료.
pause
goto DB_MENU

:RESET_DB_TABLES
echo.
echo [서버] DB 테이블을 재생성합니다 (init-db)... (비번 입력)
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker exec flowork_app flask --app run.py init-db"
echo ✅ 완료.
pause
goto DB_MENU

:RESET_DB_VOLUME
echo.
echo ⚠️ 경고: DB 데이터가 영구 삭제됩니다!
echo 진행하려면 'y'를 입력하세요.
set /p confirm="입력: "
if not "%confirm%"=="y" goto DB_MENU

echo.
echo [서버] DB 볼륨 삭제 및 재시작... (비번 입력)
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker compose down -v && docker compose build && docker compose up -d && echo 'DB 생성 대기 중...' && sleep 10 && docker exec flowork_app flask --app run.py update-db"
echo ✅ 완료.
pause
goto DB_MENU

:FACTORY_RESET
echo.
echo 🧨 경고: 코드, DB, 설정 등 모든 데이터를 삭제하고 처음부터 다시 설치합니다.
echo 정말 진행하시겠습니까? (y/n)
set /p confirm="입력: "
if not "%confirm%"=="y" goto RESET_MENU
echo.
echo [서버] 공장 초기화 진행 중... (시간이 좀 걸립니다)
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker compose down -v && docker system prune -af --volumes && docker builder prune -af && git fetch origin && git reset --hard origin/main && docker compose build && docker compose up -d && echo 'DB 생성중...' && sleep 10 && docker exec flowork_app flask --app run.py update-db"
echo.
echo ✅ 공장 초기화 및 재설치 완료.
pause
goto RESET_MENU

:CUSTOM_CMD
cls
echo.
echo ======================================================
echo           ⌨️ 커스텀 명령어 실행
echo ======================================================
echo.
echo [서버] 실행할 리눅스 명령어를 입력하세요.
echo (예: ls -al, docker ps, df -h, cat flowork/requirements.txt)
echo.
set /p user_cmd="명령어 입력: "

if "%user_cmd%"=="" goto MAIN_MENU

echo.
echo [서버] 명령을 실행합니다... (비번 입력)
echo ---------------------------------------------------
ssh %USER%@%SERVER_IP% "%user_cmd%"
echo ---------------------------------------------------
echo.
echo ✅ 실행 완료.
pause
goto MAIN_MENU

:LOGS
echo.
echo [서버] 실시간 로그를 연결합니다. (종료하려면 Ctrl+C)
echo.
ssh -t %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker compose logs -f --tail=50"
goto MONITOR_MENU

:HEALTH
echo.
echo [서버] 상태 점검 결과:
echo ---------------------------------------------------
ssh %USER%@%SERVER_IP% "echo '[디스크 용량]' && df -h | grep '/$' && echo '' && echo '[메모리 사용량]' && free -h && echo '' && echo '[도커 상태]' && docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'"
echo ---------------------------------------------------
pause
goto MONITOR_MENU

:BACKUP
echo.
echo [서버] 백업 파일을 생성하고 다운로드합니다...
echo (바탕화면에 저장됩니다)
set DEST=%USERPROFILE%\Desktop\FLOWORK_BACKUP_%date:~0,4%%date:~5,2%%date:~8,2%
mkdir "%DEST%"

echo 1. DB 백업 생성 중...
ssh %USER%@%SERVER_IP% "docker exec flowork_db pg_dump -U flowork_user flowork_db > ~/flowork/backup_db.sql"

echo 2. PC로 다운로드 중... (비밀번호 입력)
scp %USER%@%SERVER_IP%:~/flowork/backup_db.sql "%DEST%\backup_db.sql"

echo.
echo ✅ 백업 완료: %DEST%
pause
goto MONITOR_MENU

:CLEANUP
echo.
echo [서버] 불필요한 파일 정리 중...
ssh %USER%@%SERVER_IP% "docker system prune -f"
echo ✅ 정리 완료.
pause
goto MONITOR_MENU

:STOP
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker compose stop"
echo ⏹ 정지됨.
pause
goto CONTROL_MENU

:START
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker compose start"
echo ▶ 시작됨.
pause
goto CONTROL_MENU

:RESTART
ssh %USER%@%SERVER_IP% "cd %PROJECT_DIR% && docker compose restart"
echo 🔄 재시작됨.
pause
goto CONTROL_MENU

:INSTALL
echo.
echo [서버] Docker 및 필수 구성요소 설치... (비밀번호 입력)
ssh %USER%@%SERVER_IP% "apt update && apt install -y docker.io docker-compose-plugin git && git clone https://github.com/mingdezzi/flowork.git %PROJECT_DIR%"
echo ✅ 완료.
pause
goto MAIN_MENU

:SSH_CONNECT
start ssh %USER%@%SERVER_IP%
goto MAIN_MENU