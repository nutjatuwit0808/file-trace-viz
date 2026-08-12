# Phase 4 — เสียบ UI จริง: folder picker + session panel + replay จริง

> **เป้าหมาย:** เปิด platform ใน browser → เลือก folder vault + folder log → เห็นกราฟจริงของ vault ตัวเอง, panel ฝั่งขวาเลือก session แล้วเห็นบทสนทนา (prompt/response) ต่อ turn, กด play เพื่อดู flow การไล่อ่านไฟล์ของ session นั้น — โดย **พฤติกรรมกราฟทุกอย่างเหมือน prototype เป๊ะ** (สี physics interaction ผ่านการ iterate มาแล้ว ห้ามเปลี่ยนโดยไม่ถาม)

> **อัปเดต 2026-08-12 (ตัดสินใจแล้วกับผู้ใช้):**
> - เข้าถึงข้อมูลด้วย **File System Access API ใน browser** (`showDirectoryPicker` 2 ครั้ง: vault + log folder) — ไม่มี server, ไม่มีขั้น pre-compile `data.json` (แนวทาง CLI เดิมตัดออก; จะกลับมาเป็นทางเสริมได้ใน Phase 5 ถ้าคุ้ม)
> - log folder มี `session-*.jsonl` กี่ไฟล์ก็ได้ (สะสมจากหลาย session ทั้งสอง editor รวมกัน)
> - **Panel float ฝั่งขวา เปิด/ปิดได้** — list session ให้เลือกดู **ทีละ 1 session**, label = วันเวลา + editor + preview prompt แรก
> - ใน session ที่เลือก: แสดงทุก turn เป็นคู่ prompt (user) / response (agent) + ปุ่ม play ไล่ flow การอ่านไฟล์

## จุดตั้งต้น

- ย้าย `obsidian-style-graph-view-v3.html` → `platform/index.html` (โครงตาม CONVENTIONS.md ข้อ 4)
- ต้องมี build step เล็กๆ แล้ว (esbuild) เพราะ bundle parser จาก Phase 2 เข้า browser — output ยัง serve แบบ static ได้ (เปิดผ่าน localhost; File System Access API ต้องการ secure context ดังนั้น `npx serve`/`http-server` ชั่วคราวตอน dev, การ package จริงเป็นเรื่อง Phase 5)
- โค้ด UI: split เป็นโมดูลได้แล้วเมื่อรวม feature ใหม่เกิน ~400 บรรทัด (ตาม convention) — แนะแนว: `graph.js` (ของเดิมจาก prototype แตะน้อยสุด), `data-loader.js` (FS Access API + เรียก parser), `session-panel.js` (panel ใหม่)

## Tasks

### 4.1 แยก "data layer" ออกจาก "render layer" ใน prototype
- หาจุด hardcode `nodes`, `links`, `turns` → ห่อเป็น `initGraph(graphData)` + `loadSession(turns)` ที่รับข้อมูลภายนอก และเรียกซ้ำได้ (เปลี่ยน session โดยไม่ reload หน้า — ต้อง reset สี/heat/slider ให้สะอาดทุกครั้ง)
- เก็บ mock data เดิมเป็น `platform/fixtures/mock-data.js` + query param `?demo=1` โหลด mock (fixture สำหรับ manual QA ตาม CONVENTIONS.md ข้อ 8)
- **ระวังบั๊กที่เคยเจอตอนแตะ render:**
  - per-node `<radialGradient>` อยู่ใน `<defs>` ซึ่งเป็น sibling ของ `<g>` zoom/pan — ต้อง select จาก `defs` เท่านั้น ไม่งั้น selection ว่างเงียบๆ
  - clear `stroke-dasharray` หลัง entrance animation จบ + ตอนเริ่ม drag
  - เปลี่ยน session ใหม่ = สร้าง node/gradient ชุดใหม่ — เช็คว่า gradient เก่าถูกลบจาก `defs` ไม่รั่วสะสม

### 4.2 Data loading ผ่าน File System Access API (`data-loader.js`)
- หน้า empty state ตอนเปิดครั้งแรก: ปุ่ม "เลือก vault folder" + "เลือก log folder" (ไม่ใช่จอดำเปล่า) + ลิงก์ `?demo=1`
- vault: `showDirectoryPicker()` → เดิน recursive หา `*.md` → อ่านเป็น `{ path, content }[]` → `parseVault()`
- log folder: `showDirectoryPicker()` → หาไฟล์ `session-*.jsonl` (และ `.jsonl` อื่นๆ เผื่อผู้ใช้ rename) → `parseSessions()`
- browser รองรับ: Chrome/Edge — โปรเจคจำกัดแค่นี้อยู่แล้วจาก CSS `@property`; ตรวจ `window.showDirectoryPicker` แล้วแสดงข้อความชัดๆ ถ้าไม่รองรับ
- ปุ่ม "reload data" อ่านซ้ำจาก handle เดิมโดยไม่ต้องเลือกใหม่ (มี log session ใหม่เพิ่มระหว่างเปิดอยู่)
- (nice-to-have, ไม่ block) จำ directory handle ผ่าน IndexedDB ให้เปิดครั้งถัดไปกดยืนยัน permission ครั้งเดียว

### 4.3 Session panel ฝั่งขวา (`session-panel.js`) — ของใหม่ทั้งหมด
- **Float panel ฝั่งขวา เปิด/ปิดได้** ด้วยปุ่ม toggle ติดขอบ (คงสไตล์ dark glass เดียวกับ UI เดิม); ปิดแล้วกราฟใช้พื้นที่เต็ม
- **มุมมอง list:** ทุก session จาก log folder เรียงใหม่→เก่า — แต่ละแถว: วันเวลาเริ่ม, badge editor (cursor / claude-code), preview prompt แรก (ตัด ~2 บรรทัด), จำนวน turn
- **เลือก session (ทีละ 1):** สลับเข้าโหมด Session ของกราฟ + โหลด turns ของ session นั้นเข้า session bar เดิม
- **มุมมอง conversation:** ไล่ turn เป็นคู่ — prompt ของ user / response ของ agent (แสดงย่อ ~3-4 บรรทัด กดขยายอ่านเต็มได้ เพราะเก็บเต็มมาแล้ว), turn ที่ response เป็น null แสดง "(no response captured)"
- แต่ละ turn ใน panel แสดงจำนวนไฟล์ที่อ่าน + คลิก turn → กระโดด slider ไป turn นั้น (sync สองทางกับ session bar)
- ตอน **play**: highlight turn ปัจจุบันใน panel + auto-scroll ตาม — ผู้ใช้เห็นพร้อมกันว่า "prompt นี้ → agent ไล่อ่านไฟล์พวกนี้" ซึ่งคือ core value ของเครื่องมือ
- ปุ่ม play/pause ใช้ของเดิมใน session bar — เพิ่มจุด entry ใน panel ได้แต่ต้องควบคุม state เดียวกัน (single source of truth)

### 4.4 ต่อ turns จริงเข้า session bar เดิม
- source เปลี่ยนจาก mock เป็น turns ของ session ที่เลือก; label ของ turn ใช้เลข turn (มี timestamp ใน tooltip)
- เคส session ยาว (turn เยอะกว่า mock 8 turns มาก): slider ยังใช้ได้ ไม่ล้น layout
- ยังไม่เลือก session → กราฟอยู่โหมด Normal (เทาล้วน), session bar ซ่อนตามพฤติกรรมเดิม

### 4.5 แสดง warnings จาก parser
- มุมเล็กๆ ไม่รบกวน: จำนวน unmatched log entries / broken wikilinks พร้อมกดดูรายการ (hardening เต็มรูปแบบเป็น Phase 5 — ที่นี่เอาแค่ข้อมูลไม่หายเงียบ)

### 4.6 Manual QA (visual, ตาม CONVENTIONS.md ข้อ 8)
- `?demo=1` → พฤติกรรมกราฟเหมือน prototype เดิมทุกข้อ (regression: 2 โหมด, heat ไล่สีถูก, hover/dim, double-click focus, search, drag ไม่ทำเส้นขาด)
- ข้อมูลจริง (vault จริง + log หลาย session จาก dogfood Phase 1): เลือก folder ทั้งสอง, เปิด/ปิด panel, สลับ session ไปมาหลายรอบ (เช็ค reset สะอาด), play แล้ว panel sync, prompt ภาษาไทยแสดงถูก
- session ของ Cursor ที่ไม่มี response → panel แสดง placeholder ไม่พัง

## สิ่งที่ห้ามแตะโดยไม่ถามก่อน (จาก CLAUDE.md ข้อ 5)
- ระบบสี heat-scale เดียว (`HEAT_GRAY`/`HEAT_RED`/`HEAT_CAP=4`, easing `** 0.6`) — ห้ามเพิ่มสี folder/aura/filament กลับมา
- ค่า physics (`distance:78`, `charge(-260)`, warm-start ~180 ticks ฯลฯ)
- โครงสร้าง node 3 ชั้น (rim gradient / ellipse highlight / text) + สูตรรัศมี `6 + degree*2.1`

## Definition of Done
- [ ] เลือก 2 folder ใน browser แล้วเห็นกราฟจริง + panel session ใช้งานครบ (list → เลือก → conversation → play sync)
- [ ] `?demo=1` ยังโหลดได้ พฤติกรรมตรง prototype เดิม
- [ ] สลับ session หลายรอบไม่มี state รั่ว (สี/gradient/slider reset ถูก)
- [ ] ไฟล์ใน log ที่ไม่อยู่ใน vault ไม่ทำ UI พัง มี warning แสดง
- [ ] อัปเดตตารางสถานะใน `CLAUDE.md` ข้อ 6
