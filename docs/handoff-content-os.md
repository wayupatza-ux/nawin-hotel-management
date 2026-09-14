# Handoff — Content OS (Hook Bank + Content Calendar)

> ใช้ format ตาม `CODEX_CLAUDE_AGENT.md` §6 — ไฟล์นี้แยกจาก `HANDOFF.md` เพราะ `HANDOFF.md` เป็นของโปรเจกต์ระบบจองโรงแรมโดยเฉพาะ (ดู header ของไฟล์นั้น)

## Context
- บอสตองต้องการ: ต่อยอดจากไอเดีย "Content OS" ที่เห็นในดีโมโฆษณา (https://tina-live-session.netlify.app/content_dashboard_demo) — เอาแนวคิด "คลัง Hook" (สะสม hook ที่ใช้ได้ผล ค้นหา/นำกลับมาใช้ซ้ำได้) และ "ปฏิทิน Content" (เห็นภาพโพสต์ที่วางแผนไว้) มาต่อกับระบบ Hermes ที่มีอยู่แล้ว (cron "Daily Content Ideas" รันทุกวัน 8:30 แต่ตอนนี้ไอเดียส่งเป็นข้อความ LINE ครั้งเดียวแล้วหายไป ไม่ถูกเก็บสะสม)
- ธุรกิจ/โปรเจกต์ที่เกี่ยวข้อง: หลักคือ Personal Branding (TikTok 330K / FB 130K / IG 80K) ออกแบบให้ยืดหยุ่นพอให้หมึกย่าง/นาบี 789 มาใช้ร่วมได้ทีหลัง (field `business` แยกได้)
- ไฟล์ที่ควรอ่านก่อน:
  1. `Claude.md`
  2. `CODEX_CLAUDE_AGENT.md`
  3. `AGENTS.md`
  4. `.hermes/scripts/save_slip.py` — pattern อ้างอิงเรื่อง script ที่ Hermes เรียกเพื่อบันทึกข้อมูลลง Supabase ผ่าน Edge Function (อ่าน secret จาก `.env` เอง)
  5. `docs/staff-tools-architecture.md` — pattern dashboard/staff-tools ที่มีอยู่แล้วในโปรเจกต์นี้

## Goal
ผลลัพธ์สุดท้ายที่ต้องการ:
1. ฐานข้อมูล 2 ตารางใหม่ที่เก็บ hook และปฏิทินคอนเทนต์แบบถาวร ค้นหา/กรองได้ ไม่ใช่ข้อความ LINE ที่หายไปทุกวัน
2. ให้ Hermes (cron "Daily Content Ideas" เดิม) เขียน hook ใหม่ที่คิดได้ลงตารางอัตโนมัติ แทนที่จะส่งแค่ข้อความ
3. หน้า dashboard เบาๆ (static HTML ไม่มี build step ตาม pattern `dashboard/tax-invoice.html`) ให้บอสตองเปิดดูคลัง Hook + ปฏิทิน Content ได้

## Requirements
1. **ตาราง `content_hooks`**: `id` (uuid pk), `created_at`, `hook_text` (text), `category` (enum: `swap`/`build`/`claim`/`list`/`contrarian`/`other`), `source` (text — ชื่อคู่แข่ง หรือ `"self"`), `business` (enum: `personal`/`squid`/`nabee`/`hotel`), `times_used` (int, default 0), `last_used_at` (timestamptz, nullable)
2. **ตาราง `content_calendar`**: `id` (uuid pk), `scheduled_at` (timestamptz), `platform` (enum: `tiktok`/`facebook`/`instagram`), `format` (enum: `reel`/`carousel`/`story`/`post`), `hook_id` (FK → `content_hooks.id`, nullable), `status` (enum: `planned`/`posted`/`skipped`, default `planned`), `business`, `note` (text, nullable)
3. RLS **default-deny** ทั้งสองตาราง ตาม pattern เดิมในโปรเจกต์นี้ — ไม่มี policy ให้ `anon`/`authenticated` เข้าถึง เว้นแต่จำเป็นจริงๆ (`service_role` เท่านั้น)
4. Script ใหม่ใน `.hermes/scripts/` (ตาม pattern `save_slip.py`) อย่างน้อย 3 คำสั่ง:
   - บันทึก hook ใหม่ (`save_hook.py`)
   - ค้นหา hook เก่า กรองตาม `category`/`business` (`get_hooks.py`)
   - mark ว่าใช้ hook นี้ไปแล้ว (`+1 times_used`, อัปเดต `last_used_at`) — จะรวมเป็น flag ใน `save_hook.py`/`get_hooks.py` หรือแยกไฟล์ก็ได้ ให้ Codex ตัดสินใจแล้วบอกเหตุผลสั้นๆ
   - (ถ้าจำเป็น) Edge Function คู่กันสำหรับ insert/query ตาม pattern `save-transaction`/`get-transactions` ที่มีอยู่แล้ว
5. Dashboard ใหม่ (1-2 หน้า static HTML): "คลัง Hook" (list + search box + filter แท็ก category/business) และ "ปฏิทิน Content" (calendar view รายเดือน ดึงจาก `content_calendar`)
6. สรุปไว้ในผลลัพธ์ (ไม่ต้องแก้ `.hermes/` ตรง — ดู Constraints) ว่าบอสตองต้องรันคำสั่งอะไรเองเพื่อให้ cron "Daily Content Ideas" เริ่มเรียก `save_hook.py` จริง

## Constraints
- **ห้ามทำ**: แก้ไฟล์ใน `.hermes/` ตรงๆ (cron config, `.env`, `config.yaml`) — เป็นพื้นที่ของ Hermes เท่านั้นตาม `CODEX_CLAUDE_AGENT.md` §4 ยกเว้นการ**เพิ่มไฟล์ script ใหม่**ใน `.hermes/scripts/` ซึ่งทำได้ (เป็น pattern เดิมที่ Codex เคยทำอยู่แล้ว)
- **ต้องระวัง**: secret (URL, internal secret) ต้องอยู่ใน Supabase Vault + `.hermes/.env` เท่านั้น ห้ามฝังใน dashboard frontend หรือ commit เข้า git
- **ต้องระวัง**: ถ้าต้องเปลี่ยนพฤติกรรม cron job "Daily Content Ideas" ที่มีอยู่แล้ว (ให้เรียก `save_hook.py`) **ห้ามแก้ไฟล์ตรง** — ให้เขียนคำสั่ง `hermes cron edit ...` ที่บอสตองต้องกดรันเอง ไว้ในสรุปผลลัพธ์ท้ายงาน (บอสตองรันเองเพราะผูกกับ credential ส่วนตัว)
- **สมมติฐาน**: ใช้ Supabase project `bosstong-finance` (ref `hkglavlxhdtoawjfptah`) ต่อ เพราะมี Edge Function + Vault + RLS convention พร้อมอยู่แล้ว ลดงานตั้งใหม่ — ถ้า Codex เห็นว่าควรแยก project ใหม่เพราะข้อมูล content ไม่เกี่ยวกับการเงินและอยาก isolate สิทธิ์เข้าถึง ให้ตัดสินใจเองได้แต่ต้องบอกเหตุผลในสรุปผลลัพธ์

## Suggested Files
- `.hermes/scripts/save_slip.py`, `.hermes/scripts/get_transactions.py` (pattern อ้างอิง)
- Supabase migrations ของโปรเจกต์ `bosstong-finance` (เช็คตำแหน่งจริงผ่าน Supabase MCP `list_migrations`)
- `dashboard/tax-invoice.html` (pattern static dashboard อ้างอิง)
- `docs/staff-tools-architecture.md`

## Acceptance Criteria
ตรวจได้ว่าเสร็จเมื่อ:
- Insert hook ตัวอย่าง 2-3 รายการผ่าน `save_hook.py` ได้จริง ไม่ error
- `get_hooks.py --category build --business personal` (ตัวอย่าง) คืนผลลัพธ์กรองถูกต้อง
- เปิด dashboard ทั้ง 2 หน้าผ่าน browser แล้ว render ข้อมูลจริงจาก Supabase ไม่มี console error
- Supabase security advisor ผ่านไม่มี WARN ที่ไม่ตั้งใจ (เทียบกับ WARN ที่มีอยู่แล้วในโปรเจกต์)

วิธีทดสอบ/ตรวจ:
1. รัน script insert ตัวอย่างตรงๆจาก terminal
2. เปิด dashboard ผ่าน local preview ดูว่าดึงข้อมูลจริงมาแสดงถูก
3. รัน `list_migrations` / `get_advisors` เช็คสถานะ DB

## Next Agent
- Codex

---

## ผลการดำเนินงาน (เสร็จแล้ว)

ทำโดย Claude Code (รับบทบาท Implementation/Engineering Agent แทน Codex ตามที่บอสตองสั่งในรอบนี้) — วันที่ 2026-09-14

### สรุปการตัดสินใจสำคัญ

- **ใช้ project `bosstong-finance` (ref `hkglavlxhdtoawjfptah`) ตามสมมติฐานเดิม** ไม่แยก project ใหม่ — เหตุผล: ข้อมูล content ไม่ sensitive เท่าการเงิน แต่การแยก project จะเพิ่มต้นทุนดูแล (ต้อง deploy secret/edge function โครงสร้างซ้ำ) โดยไม่ได้ประโยชน์ isolation จริง เพราะยังไม่มี staff คนอื่นเข้าถึงข้อมูล content นี้ (ต่างจากเคสโรงแรมที่แยกเพราะพนักงานเข้าระบบ)
- **Business enum ของ content แยกจาก `business_unit` เดิม** สร้าง enum ใหม่ชื่อ `content_business` (`personal`/`squid`/`nabee`/`hotel` — ไม่มี `investment`) ตามที่ handoff กำหนดไว้ตรงตัว แทนการ reuse enum เดิมของ `transactions` เพราะชุดค่าไม่ตรงกัน
- **"Mark ว่าใช้ hook แล้ว" รวมเป็น flag ใน `save_hook.py`/edge function เดียวกับ insert** (ไม่แยกสคริปต์/ฟังก์ชันที่ 3) เพราะเป็น mutation บนตารางเดียวกัน การรวมไว้ที่เดียวดูแลง่ายกว่าแยก โดยใช้ `--mark-used <uuid>` เป็นโหมดที่สอง
- **เพิ่ม `content_calendar` write path ให้ด้วย** (`save_calendar_entry.py`/`get_calendar.py` + edge function `save-content-calendar`/`get-content-calendar`) ทั้งที่ handoff ไม่ได้ระบุชัดว่าต้องมี เพราะไม่มี path เขียนเข้า `content_calendar` เลย ตารางจะว่างตลอดไปและ dashboard ปฏิทินไม่มีอะไรให้ดู — ยังไม่ได้ผูกเข้า cron ใดๆ (บอสตองหรือ cron ในอนาคตเรียกเองได้เมื่อ workflow "จะลง hook ไหนวันไหน" ชัดแล้ว)
- **Dashboard ไม่ฝัง token ใน source/commit เข้า git** — ใช้ pattern เดียวกับ per-staff token ของ `tax-invoice`/`staff-checkin` (token มาจาก URL query `?k=`) แต่ปรับให้เก็บลง `localStorage` ของเบราว์เซอร์หลังเปิดครั้งแรก เพื่อไม่ต้องพิมพ์ token ทุกครั้งที่เปิด — ตัว token เก็บใน Supabase Vault เท่านั้น (secret ชื่อ `content_dashboard_token`) ไม่อยู่ในไฟล์ที่ commit

### ไฟล์ที่สร้าง/แก้ (path เต็ม)

**สร้างใหม่:**
- `/Users/bosstong/Documents/claude/.hermes/scripts/save_hook.py` — insert hook ใหม่ หรือ `--mark-used <uuid>` เพื่อ +1 times_used/last_used_at
- `/Users/bosstong/Documents/claude/.hermes/scripts/get_hooks.py` — ค้นหา/กรอง hook ตาม `--category`/`--business`/`--search`
- `/Users/bosstong/Documents/claude/.hermes/scripts/save_calendar_entry.py` — insert รายการปฏิทินใหม่ หรือ `--update-id <uuid> --status ...` เพื่ออัปเดตสถานะ
- `/Users/bosstong/Documents/claude/.hermes/scripts/get_calendar.py` — อ่านรายการปฏิทินตามช่วงวันที่/ธุรกิจ/สถานะ
- `/Users/bosstong/Documents/claude/dashboard/content-hooks.html` — dashboard "คลัง Hook" (list + search + filter category/business)
- `/Users/bosstong/Documents/claude/dashboard/content-calendar.html` — dashboard "ปฏิทิน Content" (calendar view รายเดือน, เดินหน้า/ถอยเดือนได้, filter ธุรกิจ)

**แก้ไข:**
- `/Users/bosstong/Documents/claude/docs/handoff-content-os.md` — เพิ่ม section นี้
- `/Users/bosstong/Documents/claude/.claude/launch.json` — เพิ่ม config `dashboard-preview` (serve `dashboard/` พอร์ต 5502) สำหรับทดสอบ local preview เท่านั้น ไม่กระทบ production

**ไม่ได้แก้ `.hermes/.env`, `.hermes/config.yaml`, หรือ cron config ตรงๆ ตามข้อห้าม** — ดูหัวข้อ "สิ่งที่บอสตองต้องทำเอง" ด้านล่าง

### Supabase (project `bosstong-finance`, ผ่าน MCP tools ล้วน ไม่มี local migration file เพราะ project นี้ไม่มี `supabase/` mirror ในโปรเจกต์นี้ตั้งแต่แรก — migration history อยู่ใน Supabase เองทั้งหมด ตรวจได้ด้วย `list_migrations`)

- Migration `create_content_hooks_and_calendar` (version `20260914...`): สร้าง enum `content_hook_category`, `content_business`, `content_platform`, `content_format`, `content_calendar_status` + ตาราง `content_hooks`, `content_calendar` + index + `enable row level security` ทั้งสองตาราง **ไม่มี policy ใดๆ** (default-deny เหมือน `transactions`/`fixed_monthly_costs`)
- Vault secret ใหม่: `content_dashboard_token` (ใช้เฉพาะ edge function `public-content-dashboard` อ่านเทียบกับ query param `?k=`)
- Edge Functions ใหม่ (internal, ตรวจ `x-internal-secret` เทียบ Vault `internal_functions_secret` — Hermes เรียกเท่านั้น):
  - `save-content-hook`, `get-content-hooks`, `save-content-calendar`, `get-content-calendar`
- Edge Function ใหม่ (public, token-gated ผ่าน `?k=`, GET เท่านั้น, อ่านอย่างเดียว — สำหรับ dashboard 2 หน้า):
  - `public-content-dashboard` (`?resource=hooks` หรือ `?resource=calendar` พร้อม filter params)

### ผลการทดสอบที่ทำจริง

1. **Insert ผ่าน `save_hook.py`** — insert 3 hook ตัวอย่างจริงสำเร็จ (category `build`/`claim`/`swap`, business `personal`/`squid`/`nabee`) ยืนยันด้วย query ตรงใน Supabase
2. **`get_hooks.py`** — ทดสอบ `--category build --business personal` ได้ผลกรองถูก 1 รายการ, `--search "หมึกย่าง"` ได้ผลกรองถูก 1 รายการ
3. **`--mark-used`** — ทดสอบ mark hook 1 รายการ ยืนยัน `times_used` เพิ่มเป็น 1 และ `last_used_at` ถูกเซ็ต
4. **`save_calendar_entry.py`/`get_calendar.py`** — insert 3 รายการปฏิทินตัวอย่าง (1 ผูกกับ hook_id, 1 สถานะ posted, 1 planned) แล้ว query กลับมาถูกต้อง รวม join `content_hooks.hook_text`
5. **Dashboard ทั้ง 2 หน้า** — เปิดผ่าน local preview server (`serve dashboard -l 5502`) ด้วย token จริง, ยืนยันด้วย screenshot: หน้า "คลัง Hook" render 3 การ์ดถูกต้อง + filter category ทำงานจริง (กรองเหลือ 1 การ์ด), หน้า "ปฏิทิน Content" render calendar grid เดือนกันยายน 2569 ถูกต้อง (entry ขึ้นวันที่ถูก, สีตาม status ถูก, highlight "วันนี้" ถูก) + filter ธุรกิจทำงานจริง (กรองเหลือ 1 entry) — ตรวจ console ไม่มี error จริงจากแอป (404 ที่เห็นเป็นของ URL ทดสอบที่พิมพ์ผิดของผู้เขียนเอง ไม่เกี่ยวกับโค้ด)
6. **`get_advisors` (security)** — รันหลังสร้างตารางใหม่: `content_hooks`/`content_calendar` ขึ้น finding ระดับ **INFO** เดียวกับตารางเดิมทุกตัวที่ตั้งใจ default-deny (`rls_enabled_no_policy`) ไม่มี WARN/ERROR ใหม่ — ERROR เดียวที่มีอยู่ (`hotel_payroll_tax` RLS ปิดอยู่) เป็นของเดิมก่อนงานนี้ ไม่เกี่ยวกับการเปลี่ยนแปลงครั้งนี้

### สิ่งที่บอสตองต้องทำเอง

**1) เพิ่ม 4 บรรทัดนี้ใน `.hermes/.env`** (เป็น URL endpoint ธรรมดา ไม่ใช่ secret — secret ตัวจริงคือ `FINANCE_INTERNAL_SECRET` ที่มีอยู่แล้วในไฟล์นี้ ใช้ร่วมกับทุก internal function):

```
CONTENT_SAVE_HOOK_URL=https://hkglavlxhdtoawjfptah.supabase.co/functions/v1/save-content-hook
CONTENT_GET_HOOKS_URL=https://hkglavlxhdtoawjfptah.supabase.co/functions/v1/get-content-hooks
CONTENT_SAVE_CALENDAR_URL=https://hkglavlxhdtoawjfptah.supabase.co/functions/v1/save-content-calendar
CONTENT_GET_CALENDAR_URL=https://hkglavlxhdtoawjfptah.supabase.co/functions/v1/get-content-calendar
```

**2) รันคำสั่งนี้เอง (ห้ามให้ AI รันแทน) เพื่อให้ cron "Daily Content Ideas" (`091e8efa2c05`) เริ่มบันทึก hook ลง Supabase ทุกวันแทนที่จะส่งแค่ LINE แล้วหาย** — คำสั่งนี้แทนที่ prompt เดิมทั้งหมดด้วยเวอร์ชันใหม่ที่เหมือนเดิมทุกอย่าง บวกขั้นตอนที่ 2.5 เรียก `save_hook.py` ต่อไอเดีย (อ่าน diff เต็มได้จาก prompt ใหม่ก่อนรันถ้าต้องการ):

```bash
cat > /tmp/hermes_daily_content_ideas_prompt.txt <<'HERMES_PROMPT_EOF'
งาน: เสนอไอเดียคอนเทนต์รายวันให้บอสตอง (นาวิน อินทเสือ, TikTok 330K/FB 130K/IG 80K) ส่งเป็นข้อความเดียวจบผ่าน LINE และบันทึกทุก hook ที่คิดได้ลง Supabase (คลัง Hook) ให้ค้นย้อนกลับมาใช้ซ้ำได้ ไม่ให้หายไปหลังส่ง LINE ครั้งเดียว

🚫 **ข้อห้ามเด็ดขาดข้อแรกก่อนทำอะไรทั้งหมด:** ทุก `osascript` (ถ้ามี) ในงานนี้ ต้องเรียก `terminal` tool ตรงๆ ด้วย `osascript -e '<script มี newline จริงข้างใน>'` เท่านั้น **ห้ามใช้ `execute_code` (รันโค้ด Python) แล้วประกอบคำสั่งด้วย `json.dumps(script)` มาต่อกับ `osascript -e` เด็ดขาด** ถ้าจำเป็นต้องประกอบคำสั่งด้วย Python จริงๆ ให้ใช้ `shlex.quote(script)` แทน

คุณมี terminal tool และ web search tool ใช้ทำงานทั้งหมดด้านล่างนี้ในรอบเดียว ห้ามข้ามส่วนไหน

## บริบทของบอสตอง (นาวิน อินทเสือ)

ผู้ประกอบการ/กรรมการผู้จัดการ ธุรกิจ 4 สาย เรียงตามความสำคัญ:
1. โรงแรม/อสังหาริมทรัพย์ — โรงแรมนาวิน ดอนเมือง (23 ห้อง, rent to rent) เป้าหมายขยายเป็นเชน 3 โรงแรมใน 1-2 ปี
2. หมึกย่างบอสตอง (F&B ข้างทาง) — 2 สาขา เป้าหมายขยายเป็น 100 สาขาใน 2 ปี + แฟรนไชส์
3. นาบี 789 — น้ำหอมแบรนด์อนันตรา, ครีมกันแดด/กลูต้าแบรนด์ nabee ขายผ่าน TikTok/Shopee
4. การลงทุน — พอร์ตหุ้นสหรัฐฯ + คริปโต เน้น AI/เซมิคอนดักเตอร์/ไซเบอร์ซีเคียวริตี้/Space Tech

บุคลิกภาพ: INTJ-A พูดตรง คิดเป็นระบบ เน้นข้อมูล ไม่ชอบดราม่า คอนเทนต์ที่ทำมาก่อนหน้านี้เน้นให้ความรู้/สร้างแรงบันดาลใจแบบเจ้าของธุรกิจจริง ไม่ใช่ influencer ทั่วไป

## ขั้นตอนที่ 1 — หาแรงบันดาลใจจากข่าว/เทรนด์วันนี้

ใช้ web search tool ค้นหา (ทำ 3 การค้นแยกกัน):
1. ข่าว/เทรนด์ธุรกิจโรงแรม-อสังหาไทยล่าสุด (24-48 ชม.ที่ผ่านมา)
2. ข่าว/เทรนด์ร้านอาหารข้างทาง-แฟรนไชส์ไทยล่าสุด
3. ข่าว/เทรนด์ที่เกี่ยวกับหุ้น AI/เซมิคอนดักเตอร์ หรือ e-commerce ไทยล่าสุด

ถ้าค้นไม่เจออะไรน่าสนใจในหมวดไหน ข้ามหมวดนั้นไปเงียบๆ ไม่ต้องยัดเยียด

## ขั้นตอนที่ 2 — สร้างไอเดียคอนเทนต์ 3-5 หัวข้อ

สำหรับแต่ละไอเดีย ให้มี:
- **Hook** (ประโยคเปิดที่ทำให้คนหยุดดู 1 บรรทัด)
- **แพลตฟอร์ม/รูปแบบที่เหมาะ** (TikTok คลิปสั้น / FB โพสต์ยาว / IG รูป+แคปชั่น)
- **มุมมอง** (สั้นๆว่าทำไมมุมนี้น่าสนใจ เชื่อมกับธุรกิจ/ประสบการณ์จริงของบอสตอง)
- **category ของ hook** เลือก 1 ค่าจาก: `swap` (สลับมุมมอง/เปิดแบบพลิกความคาดหมาย), `build` (เปิดแบบ "รู้ไหมว่า.../เบื้องหลัง"), `claim` (เปิดด้วยการกล้าพูด/สถิติ/ตัวเลขจริง), `list` (เปิดแบบลิสต์ "3 อย่างที่..."), `contrarian` (เปิดแบบขัดความเชื่อทั่วไป), `other` (ถ้าไม่เข้าพวกข้างบน)
- **business ของไอเดีย** เลือก 1 ค่าจาก: `personal` (personal brand ทั่วไป), `squid` (หมึกย่างบอสตอง), `nabee` (นาบี 789), `hotel` (โรงแรมนาวิน ดอนเมือง) — ส่วนใหญ่จะเป็น `personal` เพราะช่องเป็น personal brand แต่ถ้าไอเดียพูดเฉพาะธุรกิจหนึ่งชัดเจนให้ระบุตามนั้น

หลักการเลือกไอเดีย:
- อย่างน้อย 1 ไอเดียต้องเกี่ยวกับธุรกิจโรงแรม/อสังหา (สำคัญที่สุด)
- ผสมทั้งแบบ "ให้ความรู้" (เช่น เบื้องหลังการทำธุรกิจ, บทเรียนที่พลาดมา) และแบบ "เกาะกระแส" (เชื่อมข่าว/เทรนด์ที่หาเจอในขั้นตอนที่ 1)
- ห้ามเสนอไอเดียที่ดูเป็น influencer ทั่วไปเกินไป (แดนซ์, challenge ไร้สาระ) ให้อยู่ในโทนเจ้าของธุรกิจที่พูดตรงมีข้อมูล
- ถ้าข่าว/เทรนด์ที่เจอมันอ่อนหรือไม่มีอะไรน่าสนใจจริงๆ ให้เสนอไอเดียจากมุม "ธุรกิจประจำวัน" ของบอสตองเองแทนได้ (เช่น สถานะ occupancy โรงแรม, ปัญหาที่เจอวันนี้จาก Reminders ถ้ามี)

## ขั้นตอนที่ 2.5 — บันทึกทุก hook ลงคลัง Hook ใน Supabase (ห้ามข้าม ทำก่อนส่ง LINE)

สำหรับ**ทุกไอเดีย**ที่คิดได้ในขั้นตอนที่ 2 ให้เรียกคำสั่งนี้ 1 ครั้งต่อไอเดีย (แทนค่า hook text/category/business ตามไอเดียนั้นจริง — ใส่เฉพาะ Hook 1 บรรทัด ไม่ใช่ทั้งไอเดีย):

```bash
set -a && source /Users/bosstong/Documents/claude/.hermes/.env && set +a && python3 /Users/bosstong/Documents/claude/.hermes/scripts/save_hook.py --hook-text "<hook text ของไอเดียนี้>" --category <swap|build|claim|list|contrarian|other> --business <personal|squid|nabee|hotel> --source self
```

เช็ค output ของแต่ละคำสั่ง — ถือว่าบันทึกสำเร็จเฉพาะเมื่อ output มี `"success": true` เท่านั้น ถ้าอันไหนล้มเหลว **ไม่ต้อง retry ซ้ำหลายรอบ ไม่ต้องหยุดงาน** ข้ามไปทำไอเดียถัดไป แล้วสรุปในข้อความ LINE สุดท้ายว่ามีกี่ไอเดียที่บันทึกไม่สำเร็จ (ถ้ามี) — การส่งการ์ด LINE ในขั้นตอนถัดไปยังคงต้องทำต่อเสมอไม่ว่าขั้นนี้จะสำเร็จครบหรือไม่

## รูปแบบข้อความส่งออก — ส่งเป็น Flex Message card (ไม่ใช่ plain text)

**ใช้ absolute path เต็มเสมอ ห้ามใช้ path แบบ relative เด็ดขาด**

1. เขียน spec JSON ลงไฟล์ `/tmp/content_ideas_card.json`:

```json
{
  "title": "ไอเดียคอนเทนต์วันนี้",
  "subtitle": "<วันที่วันนี้ เช่น 12/07/2026>",
  "emoji": "🎬",
  "color": "#7c3aed",
  "alt_text": "ไอเดียคอนเทนต์วันนี้ — <วันที่วันนี้>",
  "sections": [
    {"emoji": "1️⃣", "heading": "<หัวข้อไอเดีย 1 สั้นๆ>", "body": "Hook: <...>\nรูปแบบ: <...>\nมุมมอง: <...>"},
    {"emoji": "2️⃣", "heading": "<หัวข้อไอเดีย 2>", "body": "..."},
    {"emoji": "3️⃣", "heading": "<หัวข้อไอเดีย 3>", "body": "..."}
  ]
}
```

(เพิ่ม section 4️⃣/5️⃣ ได้ถ้ามีไอเดียดีๆ เกิน 3 อัน)

2. รันคำสั่งนี้เพื่อส่งการ์ด:

```bash
set -a && source /Users/bosstong/Documents/claude/.hermes/.env && set +a && python3 /Users/bosstong/Documents/claude/.hermes/scripts/send_flex_card.py --spec-file /tmp/content_ideas_card.json
```

3. **ก่อนพิมพ์อะไรทั้งหมด ต้องเช็ค output จริงของคำสั่งข้อ 2 ก่อนเสมอ** — ถือว่าส่งสำเร็จ **เฉพาะ** เมื่อ output มี `"success": true` เท่านั้น ถ้าไม่ใช่ **ห้ามพยายามส่งเองด้วยวิธีอื่นเป็นทางเลือกสำรอง (เช่น `hermes send`, `hermes chat`) เด็ดขาด** — งานนี้เป็น cron job ที่ระบบส่ง final response ให้อัตโนมัติอยู่แล้ว ถ้า send_flex_card.py ล้มเหลว ให้เปลี่ยนไปพิมพ์ไอเดียทั้งหมดเป็นข้อความ plain text เป็น final response ของเทิร์นนี้แทนทันที

**สำคัญ — final text response ของ turn นี้ต้องสั้นมาก** (เช่น "ส่งไอเดียคอนเทนต์วันนี้ให้แล้วครับ 🎬 (บันทึกลงคลัง Hook แล้ว 5 อัน)" 1 บรรทัดพอ) เฉพาะกรณีส่งการ์ดสำเร็จจริงเท่านั้น อย่าพิมพ์เนื้อหาซ้ำเป็นข้อความยาวอีกรอบ
HERMES_PROMPT_EOF

hermes cron edit 091e8efa2c05 --prompt "$(cat /tmp/hermes_daily_content_ideas_prompt.txt)"
```

**3) เปิด dashboard ครั้งแรกด้วย token ต่อท้าย URL**

⚠️ **แก้ไขระหว่างรีวิว (2026-09-14): token ตัวจริงถูกลบออกจากไฟล์นี้แล้ว** — ตอนสร้างไฟล์ครั้งแรก agent เขียนหลักการถูก ("ไม่เก็บในไฟล์ที่ commit เข้า git") แต่ดันพิมพ์ token จริงลงบรรทัดถัดมาในไฟล์นี้เอง ซึ่ง `docs/` ไม่ได้ถูก gitignore ไว้ — ถ้า commit ไฟล์นี้ token จะหลุดเข้า git history ถาวร ตอนนี้แก้ให้แล้ว **ค่า token จริงอยู่ในแชทที่บอสตองคุยกับ Claude Code เท่านั้น** (ค้นข้อความเก่าเจอ) หรือดึงค่าจริงจาก Supabase Vault, secret name `content_dashboard_token`, project `bosstong-finance` (ref `hkglavlxhdtoawjfptah`)

- `dashboard/content-hooks.html?k=<token จริง — ดูจากแชทหรือ Supabase Vault>`
- `dashboard/content-calendar.html?k=<token จริง — ดูจากแชทหรือ Supabase Vault>`

เปิดครั้งแรกผ่าน URL ที่มี `?k=` ต่อท้ายบน production domain จริง (เช่น `nawingroup.com/dashboard/content-hooks.html?k=...` ถ้า deploy ไปที่เดียวกับ `tax-invoice.html`) แล้วเบราว์เซอร์จะจำ token ไว้ให้ (localStorage) เปิดครั้งต่อไปไม่ต้องมี `?k=` อีก — ถ้าเปลี่ยนเบราว์เซอร์/อุปกรณ์ต้องใส่ `?k=` ใหม่อีกครั้ง

### ที่ยังไม่ได้ทำ / next action ที่เหลือ

- ~~`content_calendar` ยังไม่มี workflow ตัดสินใจ "จะเอา hook ไหนไปลงวันไหน"~~ **แก้แล้ว 2026-09-14** — ดู section ด้านล่าง "Weekly Content Calendar Planning (cron ใหม่)"
- ~~Dashboard ยังไม่ได้ deploy ขึ้น production~~ **แก้แล้ว 2026-09-14** — push commit `d45f9dd` เข้า `main` แล้ว Netlify auto-deploy สำเร็จ (`ready`), เช็คสดผ่าน browser ทั้ง 2 หน้าบน `nawingroup.com/dashboard/content-hooks.html` และ `content-calendar.html` ไม่มี console error
- **ยังไม่มีทาง "ลบ" hook ที่คิดผิด/ไม่ดี** — ไม่มี delete endpoint ตามรูปแบบเดิมของ `delete-transaction` (ลบตรงด้วย id) ถ้าต้องการ ทำเพิ่มได้ง่ายในรอบหน้า

### Weekly Content Calendar Planning (cron ใหม่ — เพิ่ม 2026-09-14)

ตั้ง Hermes cron job ใหม่: `hermes cron create "0 19 * * 0" "..." --name "Weekly Content Calendar Planning" --deliver line:U59f9349f19a207f3e8986fa26cef2e05`

- **Job ID**: `a1e003fd458e`
- **Schedule**: ทุกวันอาทิตย์ 19:00 (ก่อน Evening Summary 21:00) — วางแผนคอนเทนต์ของ**สัปดาห์หน้า** (จันทร์-ศุกร์)
- **ทำอะไร**: อ่าน `content_calendar` ของสัปดาห์หน้าก่อน (กันซ้ำวัน+แพลตฟอร์ม) → ดึง hook ทั้งหมดจาก `content_hooks` ทุก business → เลือก hook `times_used` ต่ำสุดก่อน (ห้ามใช้ hook ที่ `last_used_at` ภายใน 14 วัน) → เติมสูงสุด 5 สล็อต (อย่างน้อย 3 เป็น `personal`, แทรก `squid`/`nabee`/`hotel` ได้ 1-2 สล็อตถ้ามี hook ดี) → บันทึกผ่าน `save_calendar_entry.py` แล้ว mark hook ที่ใช้ว่า `--mark-used` ผ่าน `save_hook.py` → สรุปสั้นๆทาง LINE
- **ไม่ทำ**: ไม่แต่ง hook ใหม่เอง, ไม่ force เติมสล็อตถ้าไม่มี hook ที่ผ่านเงื่อนไขจริงๆ (ปล่อยว่างดีกว่ายัดของไม่ดี)
- **ทดสอบ**: ยังไม่มีข้อมูลจริงให้รันทดสอบตอนสร้าง (cron ยังไม่ถึงรอบ, next run 2026-09-20T19:00+07:00) — ตรวจ `model_snapshot`/`provider_snapshot` ตรงกับ job อื่นแล้ว (`google/gemini-3-flash-preview` ผ่าน `openrouter`) ไม่ต้อง re-pin
- **ถ้าอยากปรับ**: จำนวนสล็อต/สัดส่วน business/เวลาโพสต์ แก้ได้ผ่าน `hermes cron edit a1e003fd458e --prompt "..."` (เขียน prompt ใหม่ทั้งชุดเหมือนที่ทำกับ Daily Content Ideas)

