# HANDOFF — คู่มือส่งต่องานให้ AI Engineer

เอกสารนี้ให้ AI engineer / นักพัฒนาคนถัดไป "อ่านแล้วทำงานต่อได้ทันที" อ่านคู่กับ:
- `README.md` — ภาพรวม + setup
- `docs/data-model.md` — schema เต็ม
- `LINE_BOT_RULES.md` — กฎการทำงานกับ LINE
- แผนหลัก (ฉบับเต็ม): `~/.claude/plans/hotel-web-app-plan-md-breezy-sunrise.md`

## กติกาการทำงาน (สำคัญ)
1. **ห้าม commit** `.env`, `Claude.md`, `CLAUDE.md`, `.claude/` (มีใน `.gitignore` แล้ว) — ตรวจ `git status` ก่อน push ทุกครั้ง
2. ทำงานทีละเฟส เฟสหลังพึ่งเฟสหน้า (ดูตารางด้านล่าง) — อัปเดตสถานะเฟสในไฟล์นี้เมื่อทำเสร็จ
3. ทุก migration เขียนเป็นไฟล์ใน `supabase/migrations/` (ตั้งชื่อ `NNNN_description.sql`) เพื่อ reproduce ได้
4. RLS ต้อง **default deny** + เปิด policy เท่าที่จำเป็น
5. `SUPABASE_SERVICE_ROLE_KEY` อยู่ได้เฉพาะใน Edge Function — frontend ใช้ได้แค่ `ANON_KEY`
6. LINE: verify `x-line-signature` ทุก webhook (ตาม `LINE_BOT_RULES.md`)

## สภาพแวดล้อมปัจจุบัน (ณ เริ่มโปรเจกต์)
- **Supabase project:** `loxhiqsutuboxyllmysw` (region ap-southeast-2 / Singapore, Postgres 17) — DB เริ่มจากว่างเปล่า
- **LINE OA:** Bosstong bot `@022rapxh` — Messaging token/secret ทดสอบแล้วใช้งานได้ (โควตาข้อความ 300/เดือน)
- **Extension ที่มีพร้อม:** `pgcrypto`, `uuid-ossp`, `pg_net`, `btree_gist` (ยังไม่ enable — enable ใน migration)
- Git repo: local init แล้ว (ยังไม่ push ขึ้น GitHub)

## สถานะเฟส

| Phase | งาน | สถานะ | ขึ้นกับ |
|---|---|---|---|
| 0 | Project setup & scaffolding | ✅ เสร็จ | - |
| 1 | Database schema & security | ✅ เสร็จ (apply แล้ว migrations 0001–0010) | 0 |
| 2 | LINE integration (Edge Functions) | ✅ เสร็จ (deploy แล้ว, ทดสอบผ่าน) | 1 |
| 3 | Guest booking web app (LIFF) | 🟡 โค้ดเสร็จ, รอทดสอบจริง (ต้องมี LIFF/LINE Login) | 1, 2 |
| 4 | Staff dashboard | 🟡 โค้ด MVP เสร็จ, migration 0015 apply แล้ว, รอทดสอบด้วย Supabase Auth user จริง | 1 |
| 5 | CEO reports & analytics | 🟡 โค้ด MVP เสร็จ, migration 0016 apply แล้ว, รอทดสอบด้วย CEO/staff Auth user จริง | 1, 4 |
| 6 | Multi-branch, PDPA hardening, launch | ⬜ | ทั้งหมด |

> อัปเดตช่อง "สถานะ" เป็น ✅ เมื่อ acceptance criteria ของเฟสนั้นผ่านครบ

### บันทึกความคืบหน้า Phase 1 (verified)
- Migrations 0001–0010 apply ขึ้น Supabase แล้ว (ไฟล์อยู่ใน `supabase/migrations/`)
- Seed: 1 สาขา (นาวิน ดอนเมือง) + 4 ประเภทห้อง + 20 ห้อง
- ทดสอบผ่าน: `check_availability` (5→4 เมื่อมี 1 booking), exclusion constraint บล็อกจองห้องเดียวกันซ้อน ✅
- Security advisor: แก้ครบ ยกเว้น 4 WARN ที่ตั้งใจ (btree_gist in public + auth_role/auth_branch/log_audit เรียกโดย authenticated ตามที่ RLS ต้องใช้)
- TypeScript types: `supabase/database.types.ts`
- **ต้องมี Supabase Auth user + ตั้ง `profiles.role`/`branch_id`** ก่อนทดสอบ dashboard (Phase 4)

### บันทึกความคืบหน้า Phase 2 (verified)
- Edge Functions deploy แล้ว (ACTIVE, `verify_jwt=false` ทั้งคู่ — ยืนยันสิทธิ์เองในโค้ดแทน):
  - `line-webhook` — verify `x-line-signature` (HMAC-SHA256), จัดการ `follow`/`message`, กันประมวลผลซ้ำด้วยตาราง `line_webhook_events`
  - `line-notify` — ส่ง push message เมื่อจองยืนยัน, ยืนยันตัวด้วย header `x-internal-secret`
- Secret ทั้งหมด (`line_channel_secret`, `line_channel_access_token`, `internal_functions_secret`) เก็บใน **Supabase Vault** — ไม่มีอยู่ในไฟล์ repo ใดๆ เลย ดึงผ่าน RPC `get_secret(name)` (จำกัดสิทธิ์เฉพาะ `service_role`)
- DB trigger `notify_booking_confirmed` (migration 0011) ยิง pg_net ไปหา `line-notify` อัตโนมัติเมื่อ `bookings.status` → `confirmed`
- **ทดสอบผ่านจริง:** signature ผิด/ไม่มี → 401 ✅ · signature ถูกต้อง → 200 ✅ · internal secret ผิด → 401 ✅ · booking confirmed จริงทำให้ trigger ยิงไป edge function และบันทึก `notifications_log` ถูกต้อง ✅
- **ยังไม่ได้ทดสอบ:** ส่ง push ถึงแขกจริงบน LINE (ต้องมี guest ที่มี `line_user_id` จริงก่อน — เกิดขึ้นได้เมื่อมีคน follow OA ผ่าน webhook หรือทำ Phase 3 LIFF login) — แนะนำให้บอสตองลองแอด/ทักบอท `@022rapxh` เพื่อดูข้อความต้อนรับจริงและตรวจ `notifications_log`
- ต้องลงทะเบียน **LIFF app + LINE Login channel** ในคอนโซลก่อนเริ่ม Phase 3 (ยังไม่ได้ทำ)

### บันทึกความคืบหน้า Phase 3 (โค้ดเสร็จ — รอ LIFF/LINE Login เพื่อทดสอบจริง)
- **DB:** `create_guest_booking(...)` (migration 0012) — atomic booking + คำนวณราคา (base_price × จำนวนคืน) + advisory lock กันจองพร้อมกันเกินโควตา ทดสอบผ่าน: คำนวณราคาถูกต้อง (890×2=1780 ✅), จองจนเต็ม 5 ห้องแล้วห้องที่ 6 ถูกบล็อกถูกต้อง ✅
- **Edge Function `guest-api`** (deploy แล้ว, ACTIVE, `verify_jwt=false`) — verify LIFF ID token กับ LINE ทุก request (stateless ไม่เก็บ session เอง) แล้วทำงานผ่าน service role:
  - `POST /guest-api/book` — จอง + อัปโหลดรูปเอกสาร ID เข้า Storage (ถ้าแนบมา)
  - `POST /guest-api/my-bookings` — ดูรายการจองของตัวเอง
  - `POST /guest-api/cancel` — ยกเลิก (เฉพาะ pending/confirmed)
  - ทดสอบผ่าน: ไม่มี idToken → 400 ✅, route ไม่รู้จัก → 404 ✅, error message ชัดเจนเมื่อยังไม่มี `line_login_channel_id` ใน Vault ✅
- **🐛 บั๊กที่พบและแก้แล้ว:** `check_availability` เดิมเป็น `SECURITY INVOKER` ทำให้ anon เรียกแล้วได้ 0 เสมอ (ถูก RLS บล็อก subquery บน `rooms`/`bookings` ภายในฟังก์ชัน) แก้เป็น `SECURITY DEFINER` แล้วใน migration 0013 — ทดสอบผ่านจริงจากฝั่ง browser ด้วย anon key แล้ว (คืนค่าถูกต้อง 5/5/5/5 ทุกประเภทห้อง)
- **🔒 hardening เพิ่ม:** ปิดไม่ให้เรียก `notify_booking_confirmed()` ตรงผ่าน REST API (migration 0014) — เป็น trigger function ไม่ควรถูกเรียกนอกบริบท trigger
- **guest-app/** (HTML/CSS/JS, ทดสอบผ่าน preview จริง):
  - `index.html` — LIFF login + welcome
  - `booking.html` — เลือกสาขา/วันที่/ประเภทห้อง (เช็คห้องว่างจริงแบบ real-time), กรอกข้อมูลแขก + อัปโหลดรูปเอกสาร ID, ยืนยันจอง
  - `my-bookings.html` — ดูรายการจอง + ยกเลิก
  - `assets/config.js` — **ต้องแก้ `LIFF_ID`** เป็นค่าจริงหลังสร้าง LIFF app (ค่าอื่นในไฟล์นี้ปลอดภัยที่จะ public อยู่แล้ว: anon key + Supabase URL)
  - ทดสอบแล้ว: หน้าเว็บ render ถูกต้อง, LIFF SDK ปฏิเสธ placeholder LIFF_ID ตามคาด (error handling ทำงานถูกต้อง แสดงข้อความไทยแทนที่จะพัง), query ข้อมูลจริงจาก Supabase (branches/room_types/availability) ผ่าน anon key ได้ถูกต้อง

### บันทึกความคืบหน้า Phase 4 (MVP dashboard — รอทดสอบ auth จริง)
- เพิ่ม `dashboard/` เป็น static staff dashboard:
  - Login ผ่าน Supabase Auth
  - หน้า "การจอง" พร้อม filter สาขา/วันที่/สถานะ, KPI ย่อ, เปิด detail booking
  - เปิด detail แล้วเรียก `log_audit('view','guests',...)` เพื่อบันทึกการดู PII
  - เปลี่ยนสถานะ booking และ assign ห้องจริงได้ (RLS + exclusion constraint ยังบังคับอยู่)
  - หน้า "เพิ่มการจอง" สำหรับ walk-in/phone booking
  - หน้า "ห้องพัก" ดู inventory ตามสาขา/สถานะ
- เพิ่ม migration `0015_staff_booking_function.sql` และ apply ขึ้น Supabase แล้ว:
  - `create_staff_booking(...)` สำหรับ staff/manager/CEO
  - เช็ค `auth.uid()`, `can_access_branch`, วันที่, availability
  - ใช้ advisory lock กันจองพร้อมกันเกินโควตา
  - คำนวณราคา `base_price × จำนวนคืน`, สร้าง guest + booking + audit log ใน transaction เดียว
- ทดสอบแล้ว:
  - `node --check dashboard/assets/app.js` ผ่าน ✅
  - `node --check guest-app/assets/app.js` ผ่าน ✅
- ยังต้องทำก่อนปิด Phase 4:
  1. สร้าง/เลือก Supabase Auth user สำหรับพนักงาน แล้วตั้ง `profiles.role` และ `profiles.branch_id`
  2. ทดสอบ login dashboard จริง, สร้าง booking, เปลี่ยนสถานะ, assign ห้อง
  3. ทดสอบ staff สาขา A ไม่เห็น booking สาขา B และ audit log ถูกเขียนเมื่อเปิด detail

### บันทึกความคืบหน้า Phase 5 (MVP reports — รอทดสอบ auth จริง)
- เพิ่ม migration `0016_hotel_report_function.sql` และ apply ขึ้น Supabase แล้ว
- เพิ่ม RPC `get_hotel_report(p_date_from, p_date_to, p_branch_id)`:
  - Enforce `auth.uid()`
  - CEO ดูทุกสาขาได้เมื่อไม่ส่ง `p_branch_id`
  - staff/manager ถูกจำกัดที่ `profiles.branch_id`
  - คืน KPI: revenue, occupancy, ADR, RevPAR, total bookings, active/pending/cancelled, room-nights, unique guests, repeat guests
  - คืน breakdown: booking source, room type, daily trend
- เพิ่มแท็บ `รายงาน` ใน `dashboard/index.html`:
  - filter สาขา/วันที่
  - KPI 6 ช่อง
  - daily occupancy chart แบบไม่พึ่ง chart library
  - source breakdown และ room type breakdown
- ทดสอบแล้ว:
  - `node --check dashboard/assets/app.js` ผ่าน ✅
  - Supabase migrations list มี `0015_staff_booking_function` และ `0016_hotel_report_function` แล้ว ✅
  - ตรวจ `pg_proc` พบ `create_staff_booking` และ `get_hotel_report` แล้ว ✅
  - dashboard preview render หน้า login และมีแท็บรายงานใน DOM โดยไม่มี console error ✅
- ยังต้องทำก่อนปิด Phase 5:
  1. สร้าง Supabase Auth user บทบาท `ceo` (`profiles.role='ceo'`, `branch_id=null`) หรือ staff/manager เพื่อทดสอบจริง
  2. Login dashboard แล้วเปิดแท็บรายงาน
  3. เทียบ KPI กับ query DB สำหรับช่วงวันที่เดียวกัน
  4. ทดสอบ staff/manager เห็นเฉพาะสาขาตน และ CEO เห็นทุกสาขา

### สิ่งที่บอสตองต้องทำก่อน Phase 3 ทำงานได้เต็มรูปแบบ
1. ✅ สร้าง **LINE Login channel** ชื่อ `Nawin Hotel` ใน provider `Bosstong` แล้ว
2. ⏳ เข้า LINE Developers Console ต่อ แล้ว acknowledge LINE User Data Policy (ต้องให้เจ้าของบัญชีกดเอง) จากนั้นเปิด channel `Nawin Hotel` → LIFF tab → Add LIFF app
3. ตั้งค่า LIFF app:
   - Size: `Full`
   - Endpoint URL: URL ที่ deploy `guest-app/` แบบ HTTPS (เช่น GitHub Pages)
   - Scopes: `openid`, `profile`
   - Add friend option: เปิดถ้ามีตัวเลือก เพื่อให้แขก add OA ง่ายขึ้น
4. เอา `LIFF_ID` ไปใส่ใน `guest-app/assets/config.js`
5. เอา **LINE Login Channel ID** (ไม่ใช่ secret แต่ต้องเก็บไว้ให้ Edge Function ใช้ verify token) ไปรันคำสั่งนี้ผ่าน Supabase SQL editor / Supabase plugin (ครั้งเดียว ไม่ commit ค่าเข้า repo):
   ```sql
   select vault.create_secret('<LINE_LOGIN_CHANNEL_ID>', 'line_login_channel_id', 'LINE Login channel id สำหรับ verify LIFF ID token');
   ```
6. ทดสอบจองจริงผ่าน LINE app บนมือถือ

## Acceptance criteria ย่อ (ดูฉบับเต็มในแผนหลัก)
- **P1:** จองทับช่วงวันเกินจำนวนห้อง → ถูกบล็อก; แขก A อ่านข้อมูลแขก B ไม่ได้; รูป ID เปิดตรงด้วย anon key ไม่ได้
- **P2:** webhook signature ผิด → 401; จองสำเร็จแล้วได้ push LINE; event ซ้ำไม่ประมวลผลซ้ำ
- **P3:** จองครบ flow จากในแอป LINE; ห้องเต็มเลือกไม่ได้; อัปโหลด ID เข้า Storage สำเร็จ
- **P4:** staff สาขา A ไม่เห็นข้อมูลสาขา B; เปิดดู PII แล้วมี `audit_log`
- **P5:** CEO เห็น report รวมทุกสาขา; ตัวเลข KPI ตรงกับ query บน DB
- **P6:** เพิ่มสาขาใหม่ไม่ต้องแก้ core; security review ผ่าน; deploy production ได้

## Data model โดยย่อ
ดูรายละเอียด + ER ใน `docs/data-model.md`
ตารางหลัก: `branches`, `room_types`, `rooms`, `guests`, `guest_documents`, `bookings`,
`booking_status_history`, `payments`, `notifications_log`, `profiles`, `audit_log`
