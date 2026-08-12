# Phase 5 — Packaging, README, error handling & hardening

> **เป้าหมาย:** คนอื่น (หรือตัวเองในเครื่องใหม่) ติดตั้งและใช้ FileTraceViz ได้จบใน ~5 นาทีจาก README เดียว และเครื่องมือไม่พังกับข้อมูลจริงที่สกปรก/ใหญ่

## Tasks

### 5.1 ตัดสินใจรูปแบบ distribution
เงื่อนไขจากผล Phase 4: UI ใช้ File System Access API เลือก folder เอง → ตัวแอปเป็น static bundle ล้วน แต่ **ต้อง serve ผ่าน localhost** (secure context — เปิด `file://` ตรงๆ ใช้ picker ไม่ได้) ดังนั้นทางเลือกจริงคือวิธี serve:

| ทาง | รูปแบบ | เหมาะเมื่อ |
|---|---|---|
| A. npm package (แนวโน้มหลัก) | `npx filetraceviz` → เปิด static server ชั่วคราว serve bundle + เปิด browser ให้ (ไม่มี data API — ข้อมูลยังมาจาก folder picker ใน browser) | UX จบในคำสั่งเดียว, ตรง Phase 4 ที่สุด |
| B. Single HTML | ไฟล์ `filetraceviz.html` ไฟล์เดียว (inline JS/CSS, D3 vendored) — ผู้ใช้ serve เอง (`npx serve`) | แจกจ่ายง่ายสุดเป็นทางเสริมของ A |

> server ใน A รันเฉพาะตอนเปิดดู ไม่ขัดหลัก "ไม่มี server รันตลอด" (ข้อห้ามคือ server ที่ต้องรันระหว่างใช้ Cursor/Claude Code) — ระบุให้ชัดใน README

### 5.2 Error handling / hardening (จาก CLAUDE.md ข้อ 6)
- **ไฟล์ใน log ที่ไม่มีใน vault แล้ว:** ยกระดับจาก warning ตัวเลข (Phase 4.5) เป็น UX ที่ตั้งใจ — เช่น แสดงเป็น node ผี (โปร่งแสง/เส้นประ, ยัง heat ได้) หรือ list แยก → **ถามผู้ใช้ก่อนเลือกแนวทาง เพราะกระทบภาพกราฟ**
- **Vault ใหญ่:** วัดจริงก่อน (สร้าง synthetic vault 500 / 1,000 / 3,000 ไฟล์) ว่า force-simulation เริ่มหน่วงที่เท่าไหร่ → ค่อยเลือกวิธีตามข้อมูล: ลด warm-start ticks, เลิก per-node drop-shadow เมื่อ node เกิน threshold, หรือขั้นสุดคือ canvas renderer (อย่าทำก่อนวัด)
- ไฟล์ log ใหญ่/หลาย session: ถ้าเปิดหลายไฟล์ session ให้เลือกทีละ session (scope เดิม: replay ทีละ session — multi-session รวมเป็น feature ใหม่ ต้องถามก่อน)
- Empty states ครบ: vault ว่าง, log ว่าง, log ทั้งไฟล์ unmatched

### 5.3 README.md หลักของโปรเจค
- คืออะไร/แก้ปัญหาอะไร (ย่อจาก CLAUDE.md ข้อ 1) + screenshot/GIF ของกราฟจริง
- Quick start แยก per editor: ติดตั้ง hook ลง `.cursor/hooks.json` / `.claude/settings.json` (copy-paste ได้เลย), เปิดดูผล
- อธิบาย 2 โหมด + ความหมายของ heat-scale (เทา→แดง = ความถี่อ่านสะสม, cap ที่ 4) + session panel (เลือก session, อ่านบทสนทนา, play)
- **คำเตือน privacy:** log เก็บ prompt/response เต็มความยาว — ระวังก่อนแชร์ไฟล์ log ให้คนอื่น และห้าม commit ลง git (`.gitignore` ครอบไว้แล้วจาก Phase 1)
- ข้อจำกัดที่รู้: ไม่ realtime (by design), turn semantics, browser ที่รองรับ (CSS `@property` = Chrome/Edge)
- Schema reference: ชี้ไป `schema/log-entry.schema.json` + นโยบาย `schema_version`

### 5.4 Housekeeping ปิดโปรเจค
- อัปเดต `CLAUDE.md`: ตารางสถานะข้อ 6 + ย้ายรายละเอียด "สิ่งที่ยังเป็น mock" ที่แก้ไปแล้วออก
- เช็ค `CONVENTIONS.md` ยังตรงกับโค้ดจริง (เช่น โครง directory)
- ลบ/เก็บ `obsidian-style-graph-view-v3.html` ต้นฉบับ (ย้ายไป `platform/` แล้วใน Phase 4) — เก็บไว้ใน git history พอ

## Definition of Done
- [ ] ติดตั้งจากศูนย์ตาม README บนเครื่องสะอาด (หรือ directory ใหม่) แล้วใช้ได้จริงทั้ง Cursor และ Claude Code path
- [ ] vault ระดับ ~1,000 ไฟล์เปิดได้โดย interaction ยังลื่น (หรือมี graceful degradation ที่ตั้งใจ)
- [ ] ทุก edge case ใน 5.2 มีพฤติกรรมที่ตั้งใจ ไม่ fail เงียบ
- [ ] เอกสารทุกไฟล์ (README, CLAUDE.md, CONVENTIONS.md) ตรงกับสถานะจริง
