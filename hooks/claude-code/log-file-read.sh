#!/usr/bin/env bash
# FileTraceViz — Claude Code PreToolUse hook (matcher: "Read").
# Writes a `read` entry with the file path raw as reported — the Phase 2 mapper owns
# path normalization, keeping every file (no .md filter here, plan 1.3).
# Fail-open by design (CONVENTIONS.md §5): every path exits 0, stdout stays empty.

set -u

FTV_DIR="${HOME}/.filetraceviz"
LOG_DIR="${FTV_DIR}/logs"
STATE_DIR="${FTV_DIR}/state"

log_err() {
  mkdir -p "$LOG_DIR" 2>/dev/null || return 0
  printf '%s [claude-code/log-file-read] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" \
    >> "$LOG_DIR/hook-errors.log" 2>/dev/null || true
}

payload=$(cat 2>/dev/null) || payload=""
[ -n "$payload" ] || { log_err "empty stdin"; exit 0; }
# jq may be freshly installed via winget while the editor still holds the old PATH —
# fall back to the standard winget locations before giving up.
if ! command -v jq >/dev/null 2>&1; then
  _lad="${LOCALAPPDATA:-$HOME/AppData/Local}"
  command -v cygpath >/dev/null 2>&1 && _lad=$(cygpath -u "$_lad" 2>/dev/null || printf '%s' "$_lad")
  for _p in "$_lad/Microsoft/WinGet/Links" "$_lad"/Microsoft/WinGet/Packages/jqlang.jq_*; do
    if [ -x "$_p/jq.exe" ] || [ -x "$_p/jq" ]; then PATH="$PATH:$_p"; break; fi
  done
fi
command -v jq >/dev/null 2>&1 || { log_err "jq not found on PATH"; exit 0; }

session_id=$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null) || session_id=""
[ -n "$session_id" ] || { log_err "missing session_id (bad JSON?)"; exit 0; }
sid_safe=$(printf '%s' "$session_id" | tr -cd 'A-Za-z0-9._-')
[ -n "$sid_safe" ] || { log_err "session_id sanitized to empty: $session_id"; exit 0; }

file_path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || file_path=""
[ -n "$file_path" ] || { log_err "no tool_input.file_path in payload"; exit 0; }

mkdir -p "$LOG_DIR" "$STATE_DIR" 2>/dev/null || { log_err "mkdir failed"; exit 0; }

# Reads only observe the turn counter; the prompt hook is the only writer (plan 1.2).
# Missing counter (session started before hooks were installed) counts as turn 1.
turn=$(cat "$STATE_DIR/turn-$sid_safe" 2>/dev/null) || turn=""
case "$turn" in '' | *[!0-9]* | 0) turn=1 ;; esac

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
entry=$(printf '%s' "$payload" | jq -c --arg ts "$ts" --argjson turn "$turn" '{
  schema_version: 1, ts: $ts, session_id: .session_id, turn_id: $turn,
  tool: "claude-code", event: "read", file_path: .tool_input.file_path,
  agent_id: (.agent_id // null), agent_type: (.agent_type // null)
}' 2>/dev/null) || entry=""
[ -n "$entry" ] || { log_err "jq entry build failed"; exit 0; }

printf '%s\n' "$entry" >> "$LOG_DIR/session-$sid_safe.jsonl" 2>/dev/null || log_err "log append failed"
exit 0
