# Plans — FileTraceViz

> แผนงานแยกตาม Phase สำหรับรอ execute — อ่านคู่กับ `CLAUDE.md` (context/สถาปัตยกรรม) และ `CONVENTIONS.md` (แนวทางเขียนโค้ด)

## ลำดับการ execute

| ลำดับ | แผน | Phase | สถานะ | ขึ้นกับ |
|---|---|---|---|---|
| 1 | [phase-1-hooks.md](phase-1-hooks.md) | Hook scripts เขียน JSONL log | ✅ executed 2026-08-12 | — |
| 2 | [phase-2-parser.md](phase-2-parser.md) | Vault parser + log mapper | ✅ executed 2026-08-12 | — |
| 3 | — | Platform UI | ✅ เสร็จแล้ว (ย้ายเข้า `platform/` ใน Phase 4) | — |
| 4 | [phase-4-integration.md](phase-4-integration.md) | เสียบ UI เข้ากับข้อมูลจริง: folder picker + session panel + replay | ✅ executed 2026-08-12 | Phase 1 + 2 |
| 5 | [phase-5-packaging.md](phase-5-packaging.md) | Packaging, README, error handling | ✅ executed 2026-08-12 (open items: dogfood session จริง, node ผี UX, วัด SVG กับ vault ใหญ่) | Phase 4 |

## การตัดสินใจล่าสุด (2026-08-12 — ยืนยันกับผู้ใช้แล้ว เป็น multiple choice)

1. **เก็บบทสนทนาผ่าน hook เพิ่ม** — `UserPromptSubmit`/`beforeSubmitPrompt` เก็บ prompt, `Stop` hook ดึงคำตอบ agent จาก transcript → event ใหม่ `user_prompt`/`agent_response` ใน JSONL ไฟล์เดียวกับ read log (1 ไฟล์ = 1 session ครบจบ)
2. **เก็บข้อความเต็มทั้ง prompt และ response** — ไม่ตัด (panel เป็นคนย่อตอนแสดง) → ห้าม commit log ลง git + เตือน privacy ใน README
3. **Platform เลือก folder ใน browser** ด้วย File System Access API (`showDirectoryPicker`) ทั้ง vault folder และ log folder (log มีหลายไฟล์ session รวมกันได้) — ตัดแนวทาง pre-compile `data.json` ออก, parser ต้อง browser-compatible
4. **Session panel ฝั่งขวา (float, เปิด/ปิดได้)** — เลือกดูทีละ 1 session, list label = วันเวลา + editor + preview prompt แรก, ใน session แสดงคู่ prompt/response ต่อ turn + play sync กับกราฟ

## หลักการที่ทุกแผนต้องยึด (สรุปจาก CLAUDE.md / CONVENTIONS.md)

- **Log-first, ไม่มี server รันตลอด** — hook เขียนไฟล์ตรงๆ ไม่ยิง HTTP, platform เป็น local web app เปิดดูย้อนหลัง (replay ไม่ใช่ realtime)
- **Hook ต้อง fail-open เสมอ** — error/timeout ห้าม block การอ่านไฟล์ของ agent
- **Parser/mapper deterministic ล้วนๆ** — ห้ามเรียก LLM
- **Log append-only** — ห้ามแก้/ลบบรรทัดเก่า
- **ระบบสี: heat-scale เดียว (เทา→แดง ตามความถี่อ่านสะสม)** — ห้ามเพิ่มสีตาม folder/category กลับเข้าไปโดยไม่ถามก่อน
- ทุก log entry มี `schema_version: 1` ตั้งแต่ต้น
