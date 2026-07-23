# Agent Studio 모니터 — 표준 라이브러리만 쓰는 파이썬 서버.
# 의존성이 없으므로 slim 이미지 + 코드만 있으면 된다.
FROM python:3.12-slim

WORKDIR /app

# 소스는 bind-mount 로 주입하지만(개발 편의 + 훅이 쓰는 파일 공유),
# 이미지 단독으로도 돌아가도록 서버 스크립트만 복사해 둔다.
COPY approve-server.py /app/approve-server.py

# 컨테이너 안에서는 모든 인터페이스에 바인딩하고(호스트에서 접근 가능),
# 포트 공개는 compose 에서 127.0.0.1 로 제한해 로컬 전용을 유지한다.
ENV HOST=0.0.0.0 \
    PORT=9191 \
    PYTHONUNBUFFERED=1

EXPOSE 9191

CMD ["python3", "approve-server.py"]
