#!/usr/bin/env bash
# Agent Studio — 로컬 서버 실행 스크립트
# file:// 로 열면 브라우저 CORS 때문에 activity.jsonl fetch가 막힙니다.
# 반드시 http 로 서빙해야 상황판이 로그를 읽습니다.
set -euo pipefail

cd "$(dirname "$0")"
PORT="${1:-9191}"

echo "▶ Agent Studio 모니터 실행 중"
echo "  http://127.0.0.1:${PORT}/monitor.html"
echo "  (종료: Ctrl+C)"
python3 -m http.server "$PORT" --bind 127.0.0.1
