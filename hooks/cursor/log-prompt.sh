#!/usr/bin/env bash
# FileTraceViz — Cursor beforeSubmitPrompt hook.
# Owns the turn counter for Cursor sessions (+1 per prompt), writes a `user_prompt` entry.
# session_id = Cursor's conversation_id (plan 1.4).
# Fail-open by design (CONVENTIONS.md §5): every path exits 0, stdout stays empty so
# Cursor falls back to its default "continue" behavior.

set -u

FTV_DIR="${HOME}/.filetraceviz"
LOG_DIR="${FTV_DIR}/logs"
STATE_DIR="${FTV_DIR}/state"

log_err() {
  mkdir -p "$LOG_DIR" 2>/dev/null || return 0
  printf '%s [cursor/log-prompt] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" \
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

session_id=$(printf '%s' "$payload" | jq -r '.conversation_id // empty' 2>/dev/null) || session_id=""
[ -n "$session_id" ] || { log_err "missing conversation_id (bad JSON?)"; exit 0; }
sid_safe=$(printf '%s' "$session_id" | tr -cd 'A-Za-z0-9._-')
[ -n "$sid_safe" ] || { log_err "conversation_id sanitized to empty: $session_id"; exit 0; }

mkdir -p "$LOG_DIR" "$STATE_DIR" 2>/dev/null || { log_err "mkdir failed"; exit 0; }

# Turn counter (plan 1.2): no locking on purpose — Cursor fires hooks sequentially
# within a conversation, so concurrent writers are practically impossible.
counter_file="$STATE_DIR/turn-$sid_safe"
turn=$(cat "$counter_file" 2>/dev/null) || turn=""
case "$turn" in '' | *[!0-9]*) turn=0 ;; esac
turn=$((turn + 1))
printf '%s' "$turn" > "$counter_file" 2>/dev/null || log_err "counter write failed"

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
entry=$(printf '%s' "$payload" | jq -c --arg ts "$ts" --argjson turn "$turn" '{
  schema_version: 1, ts: $ts, session_id: .conversation_id, turn_id: $turn,
  tool: "cursor", event: "user_prompt", text: (.prompt // "")
}' 2>/dev/null) || entry=""
[ -n "$entry" ] || { log_err "jq entry build failed"; exit 0; }

printf '%s\n' "$entry" >> "$LOG_DIR/session-$sid_safe.jsonl" 2>/dev/null || log_err "log append failed"
exit 0
