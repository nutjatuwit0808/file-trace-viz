#!/usr/bin/env bash
# FileTraceViz — Claude Code Stop hook.
# Pulls the agent's final text of the turn out of transcript_path and writes an
# `agent_response` entry. This is the most fragile hook (transcript format can change
# between Claude Code versions — plan §risks), so extraction is maximally defensive:
# anything unexpected means "skip the entry", never "write a broken one".
# Fail-open by design (CONVENTIONS.md §5): every path exits 0, stdout stays empty.

set -u

FTV_DIR="${HOME}/.filetraceviz"
LOG_DIR="${FTV_DIR}/logs"
STATE_DIR="${FTV_DIR}/state"

log_err() {
  mkdir -p "$LOG_DIR" 2>/dev/null || return 0
  printf '%s [claude-code/log-response] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" \
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

transcript=$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null) || transcript=""
[ -n "$transcript" ] || { log_err "no transcript_path in payload"; exit 0; }
# Claude Code on Windows hands us a C:\... path; Git Bash needs it converted to read it.
if command -v cygpath >/dev/null 2>&1; then
  transcript=$(cygpath -u "$transcript" 2>/dev/null) || transcript=""
fi
[ -n "$transcript" ] && [ -r "$transcript" ] || { log_err "transcript not readable: $transcript"; exit 0; }

# Last assistant text in the transcript = the final response of the turn just ended.
# -Rs + fromjson? tolerates non-JSON lines; output stays a JSON-encoded string so
# newlines/quotes/Thai survive into the entry untouched.
resp_json=$(jq -Rs '
  [ split("\n")[]
    | select(length > 0)
    | (fromjson? // empty)
    | select(.type == "assistant")
    | (.message.content // empty)
    | if type == "array" then ([ .[] | select(.type == "text") | .text ] | join("\n"))
      elif type == "string" then .
      else empty
      end
    | select(length > 0)
  ] | last // empty' "$transcript" 2>/dev/null) || resp_json=""
[ -n "$resp_json" ] || { log_err "no assistant text found in transcript (format changed?)"; exit 0; }

mkdir -p "$LOG_DIR" "$STATE_DIR" 2>/dev/null || { log_err "mkdir failed"; exit 0; }

turn=$(cat "$STATE_DIR/turn-$sid_safe" 2>/dev/null) || turn=""
case "$turn" in '' | *[!0-9]* | 0) turn=1 ;; esac

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
entry=$(jq -cn --arg ts "$ts" --arg sid "$session_id" --argjson turn "$turn" --argjson text "$resp_json" '{
  schema_version: 1, ts: $ts, session_id: $sid, turn_id: $turn,
  tool: "claude-code", event: "agent_response", text: $text
}' 2>/dev/null) || entry=""
[ -n "$entry" ] || { log_err "jq entry build failed"; exit 0; }

printf '%s\n' "$entry" >> "$LOG_DIR/session-$sid_safe.jsonl" 2>/dev/null || log_err "log append failed"
exit 0
