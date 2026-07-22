#!/usr/bin/env node
/* Agent Studio — activity logger hook.
 * Reads a Claude Code hook payload on stdin and appends one JSONL event
 * to the shared activity log. Never fails the tool: all errors are swallowed
 * and it always exits 0. Append-only (concurrency-safe across sessions);
 * trims the log opportunistically to stay bounded.
 */
const fs = require("fs");
const path = require("path");

const LOG = path.join(__dirname, "activity.jsonl");
const MAX_LINES = 600;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const h = JSON.parse(raw || "{}");
    const eventName = h.hook_event_name || "PostToolUse";
    const isSub = eventName === "SubagentStart" || eventName === "SubagentStop";
    const parent = String(h.session_id || "unknown").slice(0, 8);
    const agentType = subagentType(h);
    const ev = {
      ts: new Date().toISOString(),
      // 세부 에이전트는 부모 세션에 묶인 별도 워커 id 로 기록
      session: isSub ? parent + "~" + agentType.replace(/[^\w:-]/g, "-").slice(0, 28) : parent,
      project: path.basename(h.cwd || process.cwd() || "workspace"),
      event: eventName,
      tool: h.tool_name || "",
      summary: summarize(h),
    };
    if (isSub) { ev.kind = "subagent"; ev.parent = parent; ev.agentType = agentType; }
    fs.appendFileSync(LOG, JSON.stringify(ev) + "\n");
    // opportunistic trim to keep the file bounded
    try {
      const stat = fs.statSync(LOG);
      if (stat.size > 220 * 1024) {
        let lines = fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean);
        if (lines.length > MAX_LINES) {
          fs.writeFileSync(LOG, lines.slice(-MAX_LINES).join("\n") + "\n");
        }
      }
    } catch (_) {}
  } catch (_) {
    /* never break the host tool */
  }
  process.exit(0);
});

function clip(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function subagentType(h) {
  const i = h.tool_input || {};
  return (
    String(
      h.subagent_type || h.agent_type || i.subagent_type || i.description || "subagent"
    ).trim() || "subagent"
  );
}

function summarize(h) {
  const e = h.hook_event_name;
  if (e === "SubagentStart") return subagentType(h) + " 소환";
  if (e === "SubagentStop") return subagentType(h) + " 완료";
  if (e === "SessionStart") return "세션 시작";
  if (e === "Stop") return "턴 종료";
  if (e === "UserPromptSubmit") return clip(h.prompt || "새 지시 수신", 60);
  const t = h.tool_name || "";
  const i = h.tool_input || {};
  const base = (p) => (p ? path.basename(String(p)) : "");
  switch (t) {
    case "Edit":
    case "Write":
    case "Read":
    case "NotebookEdit":
      return `${t} ${base(i.file_path || i.notebook_path)}`;
    case "Bash":
      return clip(i.command || "bash", 60);
    case "Grep":
      return `Grep "${clip(i.pattern, 30)}"`;
    case "Glob":
      return `Glob ${clip(i.pattern, 30)}`;
    case "Task":
    case "Agent":
      return clip("agent: " + (i.description || i.subagent_type || ""), 50);
    case "WebFetch":
    case "WebSearch":
      return clip(t + " " + (i.url || i.query || ""), 50);
    default:
      return t || "activity";
  }
}
