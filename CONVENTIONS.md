# FileTraceViz — Code Conventions

> ไฟล์นี้คู่กับ `CLAUDE.md` — `CLAUDE.md` บอกว่า "โปรเจคนี้คืออะไร/ทำอะไรไปแล้ว" ส่วนไฟล์นี้บอกว่า "เขียนโค้ดยังไงให้สอดคล้องกันทั้งโปรเจค"

## 1. Language & tooling ต่อ component

| Component | ภาษา | เหตุผล |
|---|---|---|
| Hook scripts (Cursor/Claude Code) | Bash + `jq` สำหรับ parse JSON จาก stdin | ต้องเบา, เร็ว, ไม่มี dependency ติดตั้งเพิ่ม เพราะรันทุกครั้งที่ agent อ่านไฟล์ |
| Vault parser + log mapper | TypeScript (Node ≥ 20) | ต้องการ type safety สำหรับ schema ของ node/edge/log entry ที่ pass ไปมาหลายจุด |
| Platform (web UI) | เริ่มจาก vanilla TS/D3 ไฟล์เดียวแบบ prototype ปัจจุบัน ค่อย split เป็นโมดูลตอนโค้ดเริ่มยาวเกิน ~400 บรรทัด | Prototype ที่มีอยู่แล้วเขียนแบบ vanilla ไม่มี framework — คงแนวทางเดิมไว้ก่อน ไม่ต้อง migrate ไป React/Vue โดยไม่จำเป็น |

**Package manager:** npm (ให้ตรงกับ `npm-name`/`registry.npmjs.org` ที่อนุญาตใน network config อยู่แล้ว)

## 2. Format & Lint

- **Prettier** default config (2-space indent, semicolons, single quotes) — รันผ่าน `prettier --write` ก่อน commit
- **ESLint** + `typescript-eslint` recommended ruleset สำหรับไฟล์ `.ts`
- Hook scripts (`.sh`): ผ่าน `shellcheck` ก่อน commit — เพราะรันเป็น arbitrary code ทุกครั้งที่ agent อ่านไฟล์ พลาดนิดเดียวกระทบ workflow จริงของผู้ใช้

## 3. Naming conventions

| ประเภท | รูปแบบ | ตัวอย่างจากโค้ดที่มีอยู่แล้ว |
|---|---|---|
| ไฟล์/โมดูล | kebab-case | `vault-parser.ts`, `log-file-read.sh` |
| ตัวแปร/ฟังก์ชัน | camelCase | `readCountUpTo()`, `heatColorFor()`, `gradVars()` |
| ค่าคงที่ระดับ config | UPPER_SNAKE_CASE | `HEAT_GRAY`, `HEAT_RED`, `HEAT_CAP` |
| CSS custom property | kebab-case, prefix สั้นบอกความหมาย | `--nc-mid` (node color mid), `--nc-edge` (node color edge), `--lk-color` (link color) — **ใช้ prefix เดิมต่อ ถ้าเพิ่ม custom property ใหม่ให้ตั้งชื่อในแนวเดียวกัน** |
| Type/Interface (TS) | PascalCase | `VaultNode`, `LogEntry`, `SessionTurn` |
| JSON field ใน log schema | snake_case | `session_id`, `turn_id`, `file_path` (ตาม schema ที่ตกลงไว้ใน `CLAUDE.md` ข้อ 3) |

## 4. โครงสร้างโปรเจคที่แนะนำ

```
filetraceviz/
  CLAUDE.md
  CONVENTIONS.md
  hooks/
    cursor/hooks.json + log-file-read.sh
    claude-code/settings.json + log-file-read.sh
  parser/                 ← TypeScript: vault parser + log mapper (Phase 2)
    src/
    test/
  platform/                ← Web UI (Phase 3, มี prototype แล้ว)
    index.html
  schema/
    log-entry.schema.json  ← JSON schema ของ log entry พร้อม schema_version
```

## 5. หลักการเขียนโค้ด (deterministic-first)

สอดคล้องกับแนวทางที่ใช้ในโปรเจคอื่นของทีมอยู่แล้ว (`b2c-toolkit`, `sdlc-copilot`):

- **Parser และ mapper ต้อง deterministic ล้วนๆ** — ห้ามเรียก LLM/AI ใดๆ ในขั้นตอน parse vault หรือ map log เข้ากับ graph (ไม่มีเหตุผลต้องใช้ ทั้งสองอย่างเป็น pure data transformation)
- **Hook ต้อง fail-open เสมอ** — ถ้า hook script error/timeout ห้าม block การอ่านไฟล์ของ agent ให้ log error แล้วปล่อยผ่าน (`beforeReadFile`/`PreToolUse` ของทั้งสอง editor มี default เป็น fail-open อยู่แล้ว อย่า set `failClosed: true`)
- **Log เขียนแบบ append-only** — ห้ามแก้ไข/ลบบรรทัดเก่าในไฟล์ log ใดๆ ระหว่าง session (เพื่อ integrity ของ replay)

## 6. Comment style

จากโค้ด prototype ที่มีอยู่ ใช้แนวทาง **comment อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร"** เช่น:
```js
.attr("r", d=>rOf(d)*1.45)   // aura — keep radius tight, not too wide
```
ไม่ใช่ comment บอกสิ่งที่โค้ดบอกอยู่แล้ว (`// set radius`) — คงแนวทางนี้ต่อ โดยเฉพาะจุดที่เป็น design decision (ทำไมเลือกค่านี้ ไม่ใช่ค่าอื่น) ให้ comment ไว้เสมอเพราะช่วยเวลากลับมาแก้ทีหลัง (ดูตัวอย่างบั๊กที่เจอใน `CLAUDE.md` — ถ้ามี comment อธิบาย DOM structure ตั้งแต่แรกอาจจับบั๊ก `defs` vs `g` ได้เร็วกว่านี้)

## 7. Git commit convention

**Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) — เข้ากับ workflow Jira/agile ที่ทีมใช้อยู่แล้ว ตัวอย่าง:
```
feat(hooks): add Claude Code PreToolUse log writer
fix(platform): clear stroke-dasharray after entrance animation to prevent broken links on drag
refactor(color): replace folder-based palette with single heat scale
```

## 8. Testing

| ส่วน | วิธีทดสอบ |
|---|---|
| Vault parser | Unit test ด้วย Vitest — ป้อน vault ตัวอย่างเล็กๆ (fixture) เช็คว่า node/edge ที่ parse ออกมาตรง |
| Log mapper | Unit test — ป้อน log entries ปลอม เช็ค `readCountUpTo()` และการ map เข้า turn ถูกต้อง |
| Hook scripts | ทดสอบ manual ด้วยการยิง JSON ปลอมเข้า stdin ตรงๆ (`echo '{...}' \| ./log-file-read.sh`) ก่อนต่อเข้า editor จริง |
| Platform UI | Visual/manual testing ก่อน (ไม่มี framework ยังไม่คุ้มตั้ง Playwright) — เก็บ mock data ปัจจุบันไว้เป็น fixture สำหรับ manual QA ต่อได้ |

## 9. Schema versioning

ใส่ `schema_version` ในทุก log entry ตั้งแต่ต้น แม้ยังเป็น v1 เพื่อกัน breaking change ในอนาคต:
```json
{"schema_version": 1, "ts": "...", "session_id": "...", "turn_id": 3, "file_path": "...", "event": "read"}
```
Parser ฝั่ง platform ควร reject หรือ warn ถ้าเจอ `schema_version` ที่ไม่รู้จัก แทนที่จะ parse มั่วแล้ว fail เงียบๆ
