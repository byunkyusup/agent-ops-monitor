#!/usr/bin/env node
/* Agent Studio — 웹 승인 훅 (PreToolUse).
 *
 * 기본 OFF. 세션 환경변수 AGENT_STUDIO_WEB_APPROVE=1 일 때만 작동한다.
 *   활성 시: 승인 요청을 approvals/pending 에 기록하고, 웹 대시보드에서
 *   승인/거부(approvals/decisions)가 올 때까지 최대 25초 대기 → 권한 결정 반환.
 *   시간 초과 시 아무 결정도 내리지 않고(exit 0) Claude Code 기본 프롬프트로 넘긴다.
 *
 * 안전장치: env 게이트를 최우선으로 검사 → 미설정 세션에는 전혀 영향 없음.
 */
if (process.env.AGENT_STUDIO_WEB_APPROVE !== "1") process.exit(0); // passthrough

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "approvals");
const PEND = path.join(DIR, "pending");
const DEC = path.join(DIR, "decisions");
const POLL_MS = 500;
const WAIT_MS = 25000;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let out = null;
  try { out = run(JSON.parse(raw || "{}")); } catch (_) {}
  if (out) process.stdout.write(JSON.stringify(out));
  process.exit(0);
});

function summarize(h) {
  const i = h.tool_input || {};
  const b = (p) => (p ? path.basename(String(p)) : "");
  switch (h.tool_name) {
    case "Bash": return String(i.command || "").replace(/\s+/g, " ").trim().slice(0, 90);
    case "Edit":
    case "Write": return h.tool_name + " " + b(i.file_path);
    default: return h.tool_name || "tool";
  }
}

function sleep(ms) {
  // 동기 sleep (블로킹 폴링용)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(h) {
  fs.mkdirSync(PEND, { recursive: true });
  fs.mkdirSync(DEC, { recursive: true });

  const session = String(h.session_id || "unknown").slice(0, 8);
  const id = (session + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7))
    .replace(/[^\w-]/g, "");
  const req = {
    id,
    session,
    project: path.basename(h.cwd || process.cwd() || "workspace"),
    tool: h.tool_name || "",
    summary: summarize(h),
    ts: new Date().toISOString(),
  };
  const pfile = path.join(PEND, id + ".json");
  const dfile = path.join(DEC, id + ".json");
  try { fs.writeFileSync(pfile, JSON.stringify(req)); } catch (_) { return null; }

  let decision = null;
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(dfile)) { decision = JSON.parse(fs.readFileSync(dfile, "utf8")); break; }
    } catch (_) {}
    sleep(POLL_MS);
  }

  try { fs.unlinkSync(pfile); } catch (_) {}
  try { if (decision) fs.unlinkSync(dfile); } catch (_) {}

  if (decision && (decision.decision === "allow" || decision.decision === "deny")) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision.decision,
        permissionDecisionReason:
          "Agent Studio 웹 대시보드에서 " + (decision.decision === "allow" ? "승인됨" : "거부됨"),
      },
    };
  }
  return null; // 타임아웃 → Claude Code 기본 프롬프트로 위임
}
