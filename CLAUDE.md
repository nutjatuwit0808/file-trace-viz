# FileTraceViz — Project Context

> อ่านไฟล์นี้ก่อนเริ่มทำงานใดๆ ในโปรเจคนี้ นี่คือ context ทั้งหมดที่คุยตกลงกันไว้แล้วก่อนเริ่มลงมือสร้างจริง

## 1. โปรเจคนี้คืออะไร

**FileTraceViz** คือเครื่องมือ debug สำหรับ agentic coding workflow ที่ใช้ LLM wiki/vault (ไฟล์ .md ที่ link กันแบบ Obsidian) เป็นแหล่ง context ให้ agent (Cursor / Claude Code) อ่าน

**ปัญหาที่แก้:** เวลา agent ทำงานใน session ยาวๆ ผู้ใช้ไม่รู้ว่าแต่ละ prompt/turn ใน session นั้น agent ไปอ่านไฟล์ไหนในvault บ้าง ทำให้ debug ยากว่า context ที่ agent ใช้จริงตรงกับที่ตั้งใจออกแบบไว้หรือไม่

**วิธีแก้:** เก็บ log การอ่านไฟล์ผ่าน hook ของแต่ละ editor แล้วแสดงผลเป็นกราฟแบบ Obsidian graph view ที่ node เปลี่ยนสีจากเทาไปแดงเข้มขึ้นเรื่อยๆ ตามความถี่ที่ไฟล์นั้นถูกอ่านสะสมถึง turn ที่เลือกดู

## 2. สถาปัตยกรรมหลักที่ตกลงกันแล้ว (สำคัญ — อย่าเปลี่ยนโดยไม่ถาม)

**Log-first, ไม่มี server รันตลอด:**

```
Hook (Cursor/Claude Code)  →  เขียน JSONL log ลง disk ตรงๆ (ไม่ยิง HTTP POST)
                                          ↓
                              (จบ session แล้วค่อยเปิดดูทีหลัง)
                                          ↓
Vault (.md files)  +  session-*.jsonl  →  Platform parse ทั้งคู่ตอนเปิด  →  แสดงกราฟ
```

- **ไม่ realtime** — เป็นเครื่องมือ replay ย้อนหลัง ไม่ใช่ live monitor
- **ไม่มี server ที่ต้องรันตลอดเวลา** ระหว่างใช้ Cursor/Claude Code — ลด effort ฝั่ง infrastructure ให้เหลือน้อยที่สุด
- Platform เป็น **local web app** (เปิดใน browser จาก localhost หรือแม้แต่เปิดไฟล์ static ตรงๆ) ไม่ใช่ VS Code/Cursor extension — เพราะรองรับทั้งสอง editor ด้วย schema เดียว, dev/debug ง่ายกว่า (refresh browser แทน reload extension), ใช้ library เว็บได้เต็มที่ไม่ติด webview sandbox

## 3. Data capture layer (Phase 1 — ยังไม่ได้ implement)

### Cursor
ผูก hook `beforeReadFile` ใน `.cursor/hooks.json` — รับ JSON payload ผ่าน stdin ก่อนไฟล์จะถูกอ่านจริง มี field `file_path`, `conversation_id`, `generation_id` (= turn id) ให้ใช้

### Claude Code
ผูก hook `PreToolUse` พร้อม `matcher: "Read"` ใน `.claude/settings.json` — รับ JSON ผ่าน stdin มี `tool_name`, `tool_input.file_path`, `tool_use_id`, `session_id`, และถ้าเป็น subagent จะมี `agent_id`/`agent_type` ติดมาด้วย (ใช้แยกได้ว่า agent ตัวไหนอ่านไฟล์ไหนถ้ามี multi-agent pipeline)

Claude Code ยังมี `InstructionsLoaded` event แยกต่างหาก สำหรับตอนที่ CLAUDE.md/rules ถูกโหลดเข้า context อัตโนมัติ (ต่างจากตอน agent เลือกอ่านไฟล์เอง) — ถ้าอยากแยก node type ระหว่าง "auto-injected context" กับ "agent เลือกอ่านเอง" ใช้ event นี้แยกได้

### Log schema (ให้ทั้งสอง editor เขียนออกมาแบบเดียวกัน)

```json
{"ts": "2026-08-12T10:15:32Z", "session_id": "sess-abc123", "turn_id": 3, "tool": "cursor|claude-code", "file_path": "/abs/path/to/file.md", "event": "read", "agent_id": null}
```

Hook script แค่ `echo "$JSON" >> ~/.filetraceviz/logs/session-<id>.jsonl` — ไม่ต้อง retry/error-handling ซับซ้อนเพราะเป็นการเขียนไฟล์ล้วนๆ ไม่มี network call

## 4. Vault parser (Phase 2 — ยังไม่ได้ implement)

- Parse ไฟล์ `.md` ทั้งหมดใน vault directory → สร้าง node (1 ไฟล์ = 1 node) + edge (จาก `[[wikilink]]` และ frontmatter references)
- Group node ด้วย **path prefix** ของ folder (เช่น `po/`, `dev/`, `qa/`, `skill/`, ที่เหลือ root) — ใช้เป็น **layout clustering เท่านั้น** (จัดตำแหน่ง node ให้กลุ่มเดียวกันอยู่ใกล้กัน) ไม่ได้ใช้กำหนดสีอีกต่อไป (ดูข้อ 5 เรื่องระบบสี)
- Mapper: จับคู่ `file_path` จาก log เข้ากับ node id ในกราฟ ต่อ `turn_id` → ได้ read-state ต่อ turn

## 5. Platform UI — มี prototype แล้ว (Phase 3 ✅ เสร็จเกือบหมด)

**ไฟล์ prototype:** `obsidian-style-graph-view-v3.html` (แนบมาพร้อม context นี้ — เอาไปใช้เป็นจุดเริ่มต้นได้เลย ยังใช้ mock data อยู่ทั้งหมด ต้องเปลี่ยนมาโหลดจากผลลัพธ์จริงของ Phase 1+2)

### Tech stack ของ prototype
- D3.js v7 (`d3-force` สำหรับ physics, `d3-zoom`, `d3-drag`)
- Vanilla HTML/CSS/JS ไฟล์เดียว ไม่มี framework
- ใช้ CSS `@property` (Chrome/Edge) ทำให้ custom property เป็น color ที่ animate ได้จริง เพื่อให้การเปลี่ยนสี node/link นุ่มนวล ไม่กระตุกทันที

### โครงสร้าง node (ต่อ 1 ไฟล์ในกราฟ)
```
<g class="node">
  <circle class="rim">   ← ทรงกลมแก้วหลัก, fill = per-node radialGradient (id: grad-{cssId(nodeId)})
                            gradient มี 3 stop: 0% ขาว (shine คงที่), 55% var(--nc-mid), 100% var(--nc-edge)
                            filter: feDropShadow (ให้เงาลอยมีมิติ)
  <ellipse>              ← แสงสะท้อนคงที่ (specular highlight) มุมบนซ้าย ไม่เปลี่ยนสีตาม state
  <text>                 ← ชื่อไฟล์ (ไม่รวม .md) แสดงเสมอถ้า degree≥3, อื่นๆ แสดงตอน hover/search
</g>
```
รัศมี node = `6 + 3.21 * sqrt(degree(node))` (ไฟล์ที่มี link เยอะจะดูใหญ่กว่า เหมือน Obsidian จริง)

> **อัปเดต 2026-08-12 (dogfood):** เดิมเป็น linear `6 + degree*2.1` แต่ลองกับ vault จริงที่หนาแน่น (23 ไฟล์ 97 links, avg degree 8.4) แล้ว node หลักบวมถึง ~35px จนชิดกันเกือบทับ ทั้งที่ physics settle สมบูรณ์แล้ว (ทดสอบยืนยันด้วย synthetic benchmark ถึง 20,000 ticks) — สาเหตุคือ `charge(-260)`/`link distance 78` เป็นค่าคงที่ ไม่ได้ปรับตามขนาด node ผู้ใช้อนุมัติให้เปลี่ยนสูตรรัศมีจาก linear → sqrt-based (`RADIUS_SCALE=3.21` calibrate ให้ node ที่ avg degree ของ demo vault เดิม ~2.34 มีขนาดใกล้เคียงของเดิม) เพื่อบีบเฉพาะ hub node ที่ degree สูงมากๆ ไม่ให้บวมจนชนกัน — ค่า physics อื่น (`distance:78`, `charge(-260)`, warm-start ticks) ยังไม่แตะ

**สำคัญ: แต่ละ node ต้องมี `<radialGradient>` ของตัวเอง แยกกันเป็นอิสระ** (ไม่ใช้ gradient เดียวร่วมกันทุก node) ไม่งั้นเปลี่ยนสี node หนึ่งจะกระทบทุก node — นี่คือบั๊กที่เจอมาแล้วรอบหนึ่ง

### ⚠️ บั๊กที่เจอแล้วและแก้ไปแล้ว (ห้ามพลาดซ้ำตอนสร้างใหม่)
`<radialGradient>` ของแต่ละ node ถูกสร้างไว้ใน `<defs>` ซึ่งเป็น **sibling** ของ `<g>` (กลุ่มที่ทำ zoom/pan) ใต้ `<svg>` — **ไม่ใช่ descendant กัน** ถ้า select ด้วย `g.selectAll("radialGradient...")` จะได้ selection ว่างเปล่าแบบเงียบๆ (ไม่ error) ทำให้การอัปเดตสีไม่มีผลอะไรเลย สีจะค้างอยู่ที่ค่า default ของ `@property` (เทา) ตลอดไป **ต้อง select จาก `defs` เท่านั้น**: `defs.selectAll("radialGradient.nodeGrad").filter(n => n.id === d.id)`

### 2 โหมดการแสดงผล
| โหมด | สีที่แสดง | Legend | Session bar |
|---|---|---|---|
| **Normal** (ปุ่มชื่อ `modeVault` ในโค้ด แต่ label แสดงผลคือ "Normal") | เทาล้วนทุก node (`#454b58`) ไม่มีสีอื่นเลย | swatch เทาอันเดียว "ไฟล์ทั้งหมด (เทา)" | ซ่อน |
| **Session** | ไล่จาก **เทา → แดงเข้ม** ตามจำนวนครั้งที่ไฟล์ถูกอ่านสะสมถึง turn ที่เลือก | แถบไล่สี (gradient bar) เทา→แดง พร้อม label "ไม่เคยอ่าน" / "อ่านบ่อย" | แสดง (slider + play/pause) |

### ระบบสี (สำคัญมาก — ผ่านการ iterate หลายรอบกว่าจะได้ข้อสรุปนี้)

> **เวอร์ชันล่าสุด: เรียบง่ายเหลือ scale เดียว** ก่อนหน้านี้เคยลองระบบสีที่ซับซ้อนกว่านี้มาก (สีแยกตาม folder 5 สี, แยก read-now/read-earlier เป็น hue คนละสี ฯลฯ) แล้วสรุปว่า**ไม่เอาแล้ว** ตัดทิ้งทั้งหมด เหลือแค่มิติเดียว: **ความถี่การอ่าน** เท่านั้น — ห้ามเพิ่มสีตาม category/folder กลับเข้าไปในระบบสีอีกโดยไม่ถามก่อน (จะใช้ folder ได้แค่เป็น physics clustering สำหรับจัดตำแหน่ง ไม่ใช่สี)

**Constants:**
```js
HEAT_GRAY = "#454b58"   // ไม่เคยอ่าน / โหมด Normal ทั้งหมด
HEAT_RED  = "#ff2d40"   // อ่านบ่อยที่สุด (deep red)
HEAT_CAP  = 4            // อ่านครบเท่านี้ = แดงเข้มสุด ไม่เข้มไปกว่านี้อีก
heatScale = d3.interpolateRgb(HEAT_GRAY, HEAT_RED)
```

**Logic การเลือกสี:**
- **Normal mode** → ทุก node เป็น `HEAT_GRAY` เสมอ ไม่มีเงื่อนไขอื่น
- **Session mode** → นับจำนวนครั้งที่ node ถูกอ่านสะสม **ตั้งแต่ turn แรกจนถึง turn ที่เลือกอยู่ (รวม turn นั้นด้วย)**:
  ```js
  function readCountUpTo(id, i){
    let c=0;
    for(let t=0;t<=i;t++) if(turns[t].read.includes(id)) c++;
    return c;
  }
  function heatColorFor(count){
    const t = Math.min(1, count/HEAT_CAP) ** 0.6;   // easing: อ่านครั้งแรกก็เห็นสีชัดแล้ว ไม่จางเกินไป
    return heatScale(t);
  }
  ```
  แล้วใช้สีนี้เป็นทั้ง `mid` ของ glass gradient โดยตรง (ไม่ต้องปรับ hue/saturation เพิ่มแบบเวอร์ชันก่อนหน้า), `edge` = `d3.color(mid).darker(1.0)`

- **เส้นเชื่อม (link):** ใช้ scale เดียวกันเป๊ะ — เอา `count` ที่มากกว่าของสอง endpoint มาคำนวณสี ถ้า `count===0` ให้เป็นเทาโปร่งใส `rgba(255,255,255,0.13)` เหมือน Normal mode สีจะ**ค้างไว้ตาม state จริง ไม่ fade กลับเอง**

**หลักการสำคัญ:** เดิมเคยแยกสีตาม folder (แต่ละ folder มี hue ของตัวเอง แล้วไล่ความสว่างตาม read-state) — **เลิกใช้แนวทางนั้นแล้ว** ตอนนี้ node ทุกไฟล์ใช้ hue เดียวกันหมด (เทา→แดง) ต่างกันแค่ "ความเข้ม" ตามความถี่การอ่าน ไม่สนใจว่าไฟล์อยู่ folder ไหน

### แนวคิดที่เคยลองแล้ว "ตัดออก" ไปแล้ว — อย่าเพิ่มกลับมาเองโดยไม่ถามก่อน
- ❌ **สีแยกตาม folder** (blue/green/gold/pink/violet ต่อ 5 folder) — ตัดออกแล้ว เหลือ heat-scale เดียว
- ❌ **แยก read-now vs read-earlier เป็นคนละ hue** (ส้ม vs ทอง) — ตัดออกแล้ว เปลี่ยนเป็นนับความถี่สะสมแทนแยก state แบบ binary
- ❌ **Aura/glow** — เคยทำ blurred halo รอบ node (feGaussianBlur + mix-blend-mode:screen) แล้วตัดออกตามคำขอผู้ใช้ ("ตัด concept aura ออกไปเลย")
- ❌ **Filament (ไส้หลอดไฟ)** — เคยทำจุดสว่างตรงกลาง node จำลอง "หลอดไฟเปิด/ปิด" แยกจากสี glass หลัก แล้วตัดออกตามคำขอผู้ใช้ ("ไม่ต้องใช้ concept หลอดไฟแล้ว")
- **สรุป: ตอนนี้สีเนื้อแก้วของ node เอง (rim) เป็นสัญญาณเดียวที่สื่อสถานะ ด้วย scale มิติเดียว (เทา→แดง ตามความถี่)** ไม่มี layer พิเศษ ไม่มี hue แยกตาม category ใดๆ อีกแล้ว

### Physics & Interaction
- Force simulation: `link(distance, strength:.5)`, `charge(...)`, `collide(r+3)`, cluster แต่ละ folder ด้วย `forceX/forceY` (strength .06) ไปยังจุดศูนย์กลางของกลุ่มตัวเอง

  > **อัปเดต 2026-08-12 (dogfood):** เดิม `distance:78`/`charge(-260)` เป็นค่าคงที่ตายตัว แต่ vault หนาแน่นจริง (23 ไฟล์ 97 links, avg degree 8.4) ทำให้คู่ node ที่ link กันเองชิดกันเหลือ ~6px แม้ physics settle สมบูรณ์แล้ว (ทดสอบยืนยันว่าเพิ่ม charge อย่างเดียวไม่ช่วย เพราะ link force เองที่ดึงคู่ node เข้าใกล้กันที่ระยะ 78px คงที่ ไม่ใช่แค่เพื่อนบ้านมาเบียด) ผู้ใช้อนุมัติให้เปลี่ยนเป็น **density-adaptive**: `charge = -260 * (1 + 0.15*(avgDegree-1))`, `distance = 78 * (1 + 0.06*(avgDegree-1))` — calibrate ที่ avgDegree=1 ให้เท่าค่าเดิมเป๊ะ vault เบาบางจึงแทบไม่เปลี่ยน (demo vault avg degree 2.34: charge -260→-312, distance 78→84) ส่วน vault หนาแน่นได้ระยะเพิ่มอัตโนมัติ (คู่ที่ชิดสุด 6px→17px) — โค้ดอยู่ที่ `platform/src/graph.js` ต้น `initGraph()`
- `alphaDecay: 0.02`, `velocityDecay: 0.45` — physics นุ่ม ไม่กระตุก
- **Warm-start:** รัน simulation แบบ manual tick ~180 รอบแบบเงียบๆ ก่อน render จริง (ป้องกัน layout "ระเบิด" ตอนโหลดหน้าแรก) หลังจากนั้น simulation จะหยุดนิ่ง ขยับอีกทีก็ต่อเมื่อผู้ใช้ลาก node เท่านั้น (ไม่มี idle jitter ตลอดเวลา)
- Entrance animation: เส้นวาดตัวเอง (`stroke-dasharray`/`dashoffset` ไล่ทีละเส้น) — **ต้องเคลียร์ dasharray ทิ้งหลัง animation จบ** ไม่งั้นจะเกิดบั๊ก "เส้นขาด" เวลาความยาวเส้นเปลี่ยนจากการลาก node (เจอบั๊กนี้มาแล้ว แก้แล้วด้วยการ clear attribute หลัง transition end + clear ซ้ำตอนเริ่ม drag กันกรณี animation ยังไม่จบ)
- Zoom/pan อิสระ (`d3.zoom`, scale 0.2–5), drag node ได้อิสระ, double-click node = pan+zoom focus พร้อม highlight เฉพาะ neighborhood (เหมือน local graph ของ Obsidian), hover = dim node ที่ไม่เกี่ยวข้อง
- Search box มุมซ้ายบน: พิมพ์ชื่อไฟล์ → node ที่ไม่ตรงจาง

### สถานะหลัง Phase 4 (mock ถูกแทนที่แล้ว)
- `nodes`/`links`/`turns` มาจาก parser จริง (`parser/src/`) ผ่าน File System Access API (เลือก vault folder + log folder ใน browser)
- mock data เดิมย้ายไป `platform/fixtures/mock-data.js` — เปิดด้วย `?demo=1` ใช้เป็น fixture สำหรับ manual QA
- ไฟล์ `obsidian-style-graph-view-v3.html` ที่ root คือ prototype ต้นฉบับ ถูกแทนที่ด้วย `platform/` แล้ว (เก็บไว้อ้างอิงจนกว่าจะ init git แล้วค่อยลบ — ตอนนี้ยังไม่มี git history ให้พึ่ง)

## 6. Task breakdown (ทำตามลำดับนี้)

| Phase | งาน | สถานะ |
|---|---|---|
| 1 | เขียน hook script (Cursor `beforeReadFile` + Claude Code `PreToolUse`/`Read` + prompt/response hooks) เขียน JSONL log | ✅ เสร็จ (`hooks/`, `schema/` — shellcheck ผ่าน, ทดสอบ manual 34 เคส) |
| 2 | เขียน vault parser (.md → node+edge จาก wikilink/frontmatter) + mapper (log → read-state ต่อ turn) | ✅ เสร็จ (`parser/` — Vitest 24 tests, pure core bundle เข้า browser ได้) |
| 3 | Platform UI (กราฟ, 2 โหมด, สี, physics, interaction) | ✅ เสร็จ (ย้ายจาก prototype เข้า `platform/` แล้ว) |
| 4 | เอา UI จริงมาเสียบกับผลลัพธ์จาก Phase 1+2 แทน mock data + ทำ folder picker + session panel | ✅ เสร็จ (`platform/src/` — mock ย้ายไป `platform/fixtures/` เปิดด้วย `?demo=1`) |
| 5 | Packaging (`npx filetraceviz`), README, error handling | ✅ เสร็จ (เหลือ open item: UX ของ node ผี + วัด SVG rendering กับ vault ใหญ่จริง — ดู README "ข้อจำกัดที่รู้") |

**สิ่งที่ต้องยืนยันกับ session จริง (dogfood):** hook ติดตั้งใน `.claude/settings.json` ของโปรเจคนี้แล้ว — เปิด session ใหม่ 2-3 turns แล้วเช็ค `~/.filetraceviz/logs/` ว่าได้ครบ 3 event type; ฝั่ง Cursor ต้องตรวจชื่อ hook event กับเอกสารเวอร์ชันปัจจุบันก่อนใช้จริง

## 7. ชื่อโปรเจค

**FileTraceViz** — ชื่อบอกตรงตัวว่าเครื่องมือนี้ทำอะไร: track/trace การอ่านไฟล์ (File Trace) แล้วแสดงผลเป็นภาพ (Viz)
