# Phase 1 — Hook scripts: เก็บ log การอ่านไฟล์ + บทสนทนา เป็น JSONL

> **เป้าหมาย:** ทุก session ที่คุยกับ agent (Cursor หรือ Claude Code) ให้มี 1 ไฟล์ `session-<id>.jsonl` ใน `~/.filetraceviz/logs/` ที่บันทึกครบทั้ง (1) event อ่านไฟล์ (2) prompt ของ user (3) คำตอบของ agent — ครบจบในไฟล์เดียวต่อ session โดยไม่กระทบ workflow ของ agent เลยแม้ hook จะพัง

> **อัปเดต 2026-08-12:** ขยาย scope จากเดิมที่เก็บแค่ read event — ผู้ใช้ยืนยันแล้วว่าต้องเก็บ prompt/response **เต็มความยาวทั้งคู่** ผ่าน hook (ไม่ parse transcript ของ editor) เพื่อให้ panel ฝั่งขวาใน platform แสดงบทสนทนาประกอบ replay ได้

## Deliverables

```
hooks/
  cursor/
    hooks.json            ← ผูก beforeReadFile + beforeSubmitPrompt (+ stop ถ้ามี) เข้ากับ scripts
    log-file-read.sh
    log-prompt.sh
  claude-code/
    settings.json         ← ผูก PreToolUse(Read) + UserPromptSubmit + Stop เข้ากับ scripts
    log-file-read.sh
    log-prompt.sh         ← UserPromptSubmit: เก็บ prompt + increment turn counter
    log-response.sh       ← Stop: ดึงคำตอบล่าสุดของ agent จาก transcript_path
schema/
  log-entry.schema.json   ← JSON Schema ครอบทุก event type (มี schema_version)
```

## Log schema v1 (ขยายจากที่ตกลงใน CLAUDE.md ข้อ 3)

ทุก entry มี field ร่วม: `schema_version: 1`, `ts` (ISO 8601 UTC), `session_id`, `turn_id`, `tool` (`"cursor"` | `"claude-code"`), `event`

```jsonl
{"schema_version":1,"ts":"...","session_id":"sess-abc","turn_id":3,"tool":"claude-code","event":"user_prompt","text":"ช่วยแก้บั๊ก..."}
{"schema_version":1,"ts":"...","session_id":"sess-abc","turn_id":3,"tool":"claude-code","event":"read","file_path":"/abs/path/file.md","agent_id":null}
{"schema_version":1,"ts":"...","session_id":"sess-abc","turn_id":3,"tool":"claude-code","event":"agent_response","text":"ผมแก้โดย..."}
```

- `event: "read"` → มี `file_path` (raw ตามที่ editor ส่งมา ไม่ normalize ใน hook), `agent_id` (null = main agent)
- `event: "user_prompt"` / `"agent_response"` → มี `text` **เก็บเต็ม ไม่ตัด** (ตามที่ผู้ใช้เลือก — แลกกับไฟล์ log ใหญ่ขึ้นและต้องระวังเวลาแชร์ log ให้คนอื่น ให้เขียนคำเตือนนี้ไว้ใน README ตอน Phase 5)
- 1 turn = 1 คู่ prompt→response โดย `turn_id` เริ่มที่ 1 และ +1 ทุกครั้งที่ user ส่ง prompt
- field เป็น snake_case ทั้งหมด

## Tasks

### 1.1 สร้าง `schema/log-entry.schema.json`
- JSON Schema draft 2020-12 — ใช้ `oneOf` แยกตาม `event` (read / user_prompt / agent_response) กำหนด required + type ต่อแบบ
- เป็น source of truth ให้ Phase 2 validate ตอน parse

### 1.2 Turn counter (แกนกลางของ phase นี้ — ตัดสินใจแล้ว)
- ใช้ไฟล์ counter ต่อ session: `~/.filetraceviz/state/turn-<session_id>` เก็บเลข turn ปัจจุบัน
- hook ของ prompt (UserPromptSubmit / beforeSubmitPrompt) เป็นคน increment ก่อนเขียน entry → hook อื่นใน turn เดียวกันแค่อ่านค่า
- ถ้าไฟล์ counter ยังไม่มี (session เริ่มก่อนติด hook / read มาก่อน prompt แรก) → ถือเป็น turn 1
- เขียน/อ่าน counter แบบง่ายที่สุด ไม่ต้อง lock (hook รันตามลำดับ event อยู่แล้ว ชนกันจริงยากมาก — comment เหตุผลไว้)

### 1.3 Claude Code hooks
- **`log-prompt.sh`** (UserPromptSubmit): payload มี `prompt`, `session_id` → increment counter + เขียน entry `user_prompt` (text เต็ม)
- **`log-file-read.sh`** (PreToolUse, matcher `"Read"`): payload มี `tool_input.file_path`, `session_id`, และ `agent_id`/`agent_type` ถ้าเป็น subagent → เขียน entry `read` ด้วย turn จาก counter
- **`log-response.sh`** (Stop): payload มี `transcript_path` → อ่าน transcript แล้วดึงข้อความ assistant ล่าสุด (text block สุดท้ายของ turn) เขียน entry `agent_response` (text เต็ม)
  - Stop จะไม่ fire ตอน user interrupt กลางคัน → turn นั้นอาจไม่มี agent_response ใน log — **ยอมรับได้** ให้ Phase 2/4 รองรับ turn ที่ response หาย (แสดงเป็น "(no response captured)")
- ทุก script: fail-open (`exit 0` เสมอ, error ลง `~/.filetraceviz/logs/hook-errors.log`), ไม่พ่นอะไรออก stdout, `mkdir -p` directory ก่อนเขียน
- filter ไฟล์: **เก็บทุกไฟล์** ไม่กรอง `.md` ใน hook — mapper ฝั่ง Phase 2 เป็นคนตัดสิน
- Config `settings.json`: ผูก 3 hook ข้างบน, ห้าม `failClosed: true`
- (stretch, ไม่บังคับ) `InstructionsLoaded` → `event: "instructions_loaded"` แยก auto-injected context

### 1.4 Cursor hooks
- **`log-prompt.sh`** (beforeSubmitPrompt): เก็บ prompt เต็ม + increment counter — `session_id` = `conversation_id`
- **`log-file-read.sh`** (beforeReadFile): payload มี `file_path`, `conversation_id`, `generation_id` → entry `read` (เก็บ `generation_id` ดิบไว้เป็น field เสริมด้วย เผื่อ debug)
- **agent_response ฝั่ง Cursor:** ตรวจสอบตอน implement ว่า Cursor มี hook จังหวะจบ turn ที่ให้เข้าถึงข้อความตอบได้หรือไม่ (เช่น `stop`/`afterAgentResponse` — เอกสาร hook ของ Cursor เปลี่ยนบ่อย) → ถ้าไม่มี ให้ปล่อย turn ของ Cursor ไม่มี `agent_response` และบันทึกข้อจำกัดนี้ใน README (UI แสดง "(not available on Cursor)") — **อย่า block phase นี้เพื่อรอ feature ที่ editor ไม่มี**
- Config `hooks.json` ผูกทุก hook

### 1.5 ทดสอบ (manual ตาม CONVENTIONS.md ข้อ 8)
- ยิง JSON ปลอมเข้า stdin ของทุก script → เช็ค jsonl valid ตาม schema, ลำดับ turn ถูก (prompt → read หลายอัน → response → prompt ถัดไป turn+1)
- เคส error: JSON เพี้ยน, stdin ว่าง, counter หาย, transcript อ่านไม่ได้ — ทุกเคส exit 0
- prompt ที่มีอักขระพิเศษ: ขึ้นบรรทัดใหม่, quote, อีโมจิ, **ภาษาไทย** — ต้องรอดใน JSONL (ให้ `jq` เป็นคน encode ห้ามประกอบ JSON string ด้วยมือ)
- `shellcheck` ผ่านทุก script
- Dogfood: ติด hook กับโปรเจคนี้เอง เปิด session จริง 2-3 turns → ได้ log ที่ครบทั้ง 3 event type เก็บเป็น fixture ให้ Phase 2

## ข้อควรระวัง / ความเสี่ยง

- **เครื่อง dev เป็น Windows** — Bash script รันผ่าน Git Bash; path ใน payload เป็น Windows path → เก็บดิบ อย่า normalize ใน hook; เช็ค `$HOME` ชี้ `%USERPROFILE%` ถูกต้อง
- การดึง response จาก transcript (1.3) เป็นจุดเปราะสุดของ phase — format transcript อาจเปลี่ยนตามเวอร์ชัน Claude Code → เขียนแบบ defensive: ดึงไม่ได้ = ข้าม entry นั้นไป (fail-open) ไม่ใช่เขียน entry เพี้ยน
- log มีข้อความสนทนาเต็ม → **ห้าม commit ไฟล์ log ลง git** ใส่ `.gitignore` ตั้งแต่ต้น

## Definition of Done
- [ ] Session จริงบน Claude Code ได้ log ครบ 3 event type, turn_id ไล่ถูก, valid ตาม schema
- [ ] Session จริงบน Cursor ได้อย่างน้อย user_prompt + read (agent_response ตามที่ editor เอื้อ)
- [ ] hook พังทุกรูปแบบไม่ block agent
- [ ] prompt ภาษาไทย/multiline ไม่ทำ JSONL พัง
- [ ] shellcheck ผ่าน, มี fixture log จริงอย่างน้อย 1 session ให้ Phase 2
