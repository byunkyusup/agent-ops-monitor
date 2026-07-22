#!/usr/bin/env python3
"""Agent Studio — 로컬 서버 (정적 파일 + 웹 승인 API).

기존 `python -m http.server`를 대체합니다. 추가로:
  GET  /api/pending          대기 중인 승인 요청 목록(JSON)
  POST /api/decision {id,decision}   승인(allow)/거부(deny) 기록

의존성 없음(표준 라이브러리만). 127.0.0.1 바인딩 = 로컬 전용.
"""
import json, os, socketserver, http.server
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PEND = os.path.join(ROOT, "approvals", "pending")
DEC = os.path.join(ROOT, "approvals", "decisions")
PORT = int(os.environ.get("PORT", "9191"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == "/api/pending":
            items = []
            try:
                for fn in sorted(os.listdir(PEND)):
                    if fn.endswith(".json"):
                        try:
                            with open(os.path.join(PEND, fn), encoding="utf-8") as f:
                                items.append(json.load(f))
                        except Exception:
                            pass
            except FileNotFoundError:
                pass
            return self._json(200, items)
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path == "/api/decision":
            try:
                n = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(n) or b"{}")
                rid = "".join(c for c in str(data.get("id", "")) if c.isalnum() or c in "-_")
                dec = data.get("decision")
                if rid and dec in ("allow", "deny"):
                    os.makedirs(DEC, exist_ok=True)
                    with open(os.path.join(DEC, rid + ".json"), "w", encoding="utf-8") as f:
                        json.dump({"id": rid, "decision": dec}, f)
                    return self._json(200, {"ok": True})
            except Exception:
                pass
            return self._json(400, {"ok": False})
        self.send_error(404)

    def log_message(self, *a):
        pass  # quiet


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.makedirs(PEND, exist_ok=True)
    os.makedirs(DEC, exist_ok=True)
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"▶ Agent Studio: http://127.0.0.1:{PORT}/monitor.html  (승인 API 포함)")
        httpd.serve_forever()
