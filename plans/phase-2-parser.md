# Phase 2 — Vault parser + log mapper (TypeScript)

> **เป้าหมาย:** แปลง (vault directory + log folder ที่มี session-*.jsonl หลายไฟล์) → โครงสร้างข้อมูลที่ UI ใน Phase 4 ใช้ได้เลย: กราฟของ vault + รายการ session + ต่อ session มี turns ที่ครบทั้งไฟล์ที่อ่านและบทสนทนา

> **อัปเดต 2026-08-12:** (1) log มี event เพิ่ม `user_prompt`/`agent_response` (ดู phase-1) (2) platform เลือก folder ผ่าน File System Access API ใน browser → **core parser ต้องเป็น pure function ที่ browser ใช้ได้** (ห้ามผูก Node `fs` ใน core) (3) log เป็น folder หลายไฟล์ ไม่ใช่ไฟล์เดียว

## Deliverables

```
parser/
  package.json            ← TypeScript, Node ≥ 20, Vitest; bundle ได้ด้วย esbuild (Phase 4 ใช้)
  tsconfig.json
  src/
    types.ts              ← VaultNode, VaultLink, LogEntry (union ตาม event), SessionTurn, SessionMeta
    vault-parser.ts       ← (fileName, content)[] → nodes + links   ← pure, ไม่แตะ filesystem
    log-parser.ts         ← เนื้อไฟล์ .jsonl → LogEntry[] (validate schema_version + event type)
    mapper.ts             ← LogEntry[] + nodes → Session (turns พร้อม read/prompt/response)
    index.ts              ← parseVault(files), parseSessions(logFiles) → ประกอบเป็น API เดียว
    io-node.ts            ← adapter อ่านไฟล์ฝั่ง Node (ใช้ใน test/CLI) — I/O อยู่ที่นี่ที่เดียว
  test/
    fixtures/
      sample-vault/       ← vault เล็กๆ ~6-8 ไฟล์ ครอบเคส wikilink/frontmatter/subfolder
      logs/               ← session-*.jsonl หลายไฟล์ (รวม fixture จาก dogfood ของ Phase 1)
    vault-parser.test.ts
    log-parser.test.ts
    mapper.test.ts
```

**หลักสำคัญ:** core (`vault-parser`, `log-parser`, `mapper`) รับ **เนื้อไฟล์เป็น string** ไม่ใช่ path — ฝั่ง browser (Phase 4) อ่านผ่าน File System Access API แล้วส่ง string เข้ามา, ฝั่ง Node ใช้ `io-node.ts` — logic เดียวกันเป๊ะทั้งสองสภาพแวดล้อม

## Output shape

```ts
interface GraphData {            // ส่วนกราฟ — ต้อง match field ที่ prototype ใช้
  nodes: VaultNode[];            // { id, label, group } — group = path prefix ใช้ clustering เท่านั้น ไม่ใช่สี
  links: VaultLink[];            // { source, target }
}

interface SessionMeta {          // ให้ panel ฝั่งขวาแสดง list
  sessionId: string;
  tool: 'cursor' | 'claude-code';
  startTs: string;               // จาก entry แรก
  firstPrompt: string;           // preview สำหรับ label ใน list (ตัดตอนแสดงผล ไม่ตัดในข้อมูล)
  turnCount: number;
  fileName: string;              // ชื่อไฟล์ jsonl ต้นทาง
}

interface SessionTurn {
  turnId: number;
  prompt: string | null;         // null = ไม่ได้ capture (เช่น Cursor ไม่มี hook response, session เก่าก่อน schema นี้)
  response: string | null;
  read: string[];                // node ids ที่ถูกอ่านใน turn นี้ (unique ภายใน turn)
  unmatched: string[];           // file_path ที่ map เข้า vault ไม่ได้ (แสดงเป็น warning)
}
```
> ก่อนลงมือ เปิด `obsidian-style-graph-view-v3.html` ยืนยัน field names ที่ mock data ฝั่งกราฟใช้จริง แล้วยึดตามนั้น (UI ส่วนกราฟเสร็จแล้ว — parser ปรับเข้าหา UI ไม่ใช่กลับกัน) ส่วน `turns` เดิมของ mock (`{ read: [...] }`) จะขยาย field ได้เพราะ Phase 4 เป็นคนแก้จุดใช้อยู่แล้ว

## Tasks

### 2.1 Types + project setup (`parser/`)
- `npm init`, TypeScript strict, Vitest, ESLint + typescript-eslint, Prettier default
- `LogEntry` เป็น discriminated union ตาม `event`: `ReadEntry | UserPromptEntry | AgentResponseEntry`
- snake_case ใน JSON ↔ camelCase ใน TS ผ่าน parse layer

### 2.2 `vault-parser.ts`
- input: รายการ `{ path, content }` ของทุก `*.md` (การเดิน directory เป็นหน้าที่ adapter)
  - `id` = path relative จาก vault root (normalize forward slash เสมอ — สำคัญบน Windows)
  - `label` = ชื่อไฟล์ไม่รวม `.md`
  - `group` = path prefix ระดับแรก (`po/`, `dev/`, `qa/`, `skill/`, อื่นๆ = root) — **clustering เท่านั้น**
- edges จาก `[[wikilink]]` (รองรับ `[[name|alias]]`, `[[name#heading]]` — ตัด alias/heading) + frontmatter references (YAML field ที่เป็น wikilink หรือ list)
- resolve แบบ Obsidian: จับคู่ basename ก่อน, ซ้ำหลายไฟล์เลือก path สั้นสุด + warning
- ลิงก์ชี้ไฟล์ไม่มีจริง → ข้าม (ไม่สร้าง node ผี) + เก็บใน warnings
- ข้าม code block/inline code ตอนหา wikilink

### 2.3 `log-parser.ts`
- parse `.jsonl` ทีละบรรทัด → validate ต่อบรรทัดตาม `schema/log-entry.schema.json`
- `schema_version` ไม่รู้จัก → warn ชัดๆ ไม่ parse มั่ว; `event` ไม่รู้จัก → ข้าม + warning (forward-compatible กับ event ใหม่เช่น `instructions_loaded`)
- บรรทัด JSON พัง → ข้าม + นับใน warnings ไม่ fail ทั้งไฟล์
- deterministic ล้วน ห้ามเรียก LLM

### 2.4 `mapper.ts`
- **ต่อ session (1 ไฟล์ jsonl = 1 session):** สร้าง `SessionMeta` + `SessionTurn[]`
- จัดกลุ่มเป็น turn ด้วย `turn_id` ตรงๆ (Phase 1 ตัดสินแล้วว่า hook นับ turn ให้จาก UserPromptSubmit) — เรียง entry ใน turn ด้วย `ts`
- turn ที่ไม่มี prompt หรือ response (interrupt / Cursor ไม่มี hook response) → field เป็น `null` ห้าม throw
- **จับคู่ `file_path` → node id:** `normalizePath()` util เดียวใช้ทุกจุด — Windows `\`→`/`, case-insensitive บน Windows, match แบบ suffix เทียบ relative path จาก vault root
- path นอก vault / ไฟล์ที่ไม่มีใน vault แล้ว → เข้า `unmatched` ของ turn นั้น ไม่ throw
- read ซ้ำใน turn เดียว = นับ 1 (heat-scale ของ UI นับ "จำนวน turn ที่ได้อ่าน" — เปลี่ยน semantic ต้องถามผู้ใช้ก่อน; comment เหตุผลไว้)

### 2.5 `index.ts` — API รวม
```ts
parseVault(files): { graph: GraphData, warnings }
parseSessions(logFiles, graph): { sessions: { meta, turns }[], warnings }
```
- เรียง sessions ตาม `startTs` ใหม่→เก่า (ให้ panel list ใช้ได้เลย)
- pure ทั้งหมด — Phase 4 bundle ด้วย esbuild เข้า browser ตรงๆ

### 2.6 Tests (Vitest)
- vault: wikilink ปกติ / alias / heading / ลิงก์เสีย / ในโค้ดบล็อก / frontmatter / subfolder / basename ซ้ำ
- log: หลาย session, หลาย turn, อ่านซ้ำหลาย turn (semantic heat), turn ที่ไม่มี response, prompt ภาษาไทย/multiline, entry นอก vault, บรรทัดพัง, schema_version/event แปลก
- path: `C:\`, mixed slash, OneDrive path อักขระไทย (โปรเจคนี้อยู่ใน `OneDrive\เอกสาร\...` จริง — ใช้เป็น test case ได้เลย)
- integration: fixture จาก dogfood session จริงของ Phase 1

## ข้อควรระวัง
- Path บน Windows คือบ่อบั๊กหลัก — `normalizePath()` ที่เดียว + test ครบ
- อย่า optimize ก่อนเวลา — vault ระดับพันไฟล์เป็น scope Phase 5

## Definition of Done
- [ ] `parseVault` + `parseSessions` ผ่าน test ทุกเคสรวม fixture จริงจาก Phase 1
- [ ] core ไม่ import อะไรจาก Node (`fs`/`path`) เลย — พิสูจน์ด้วยการ bundle ผ่าน esbuild แบบ platform browser สำเร็จ
- [ ] ข้อมูลเสียทุกแบบ → warnings ไม่ crash
- [ ] ESLint + Prettier ผ่าน
