# ระบบบริหารจัดการโรงแรม (Hotel Management Web App)

ระบบจองห้องพัก + บริหารจัดการโรงแรม สำหรับ **นาวิน โฮเทล ดอนเมือง** ออกแบบเผื่อขยายเป็นเชนหลายสาขา

- **แขก** จอง/จัดการการจองเองผ่าน LINE (LIFF) + รับแจ้งเตือนผ่าน LINE
- **พนักงาน** บริหารการจอง/ลูกค้า/ห้อง จาก dashboard เดียว
- **CEO** ดู report (occupancy, รายได้, ลูกค้าซ้ำ) เพื่อตัดสินใจธุรกิจ

## Tech Stack
| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Vanilla HTML/CSS/JS + Supabase JS SDK (CDN) |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions + RLS) |
| Messaging | LINE OA `@022rapxh` (Messaging API + LIFF + LINE Login) |
| Hosting | GitHub Pages (static) |

## โครงสร้างโปรเจกต์
```
docs/            เอกสารออกแบบ (data-model ฯลฯ)
supabase/
  migrations/    SQL migrations (schema + RLS + functions)
  functions/     Edge Functions (line-webhook, line-notify)
  seed.sql       ข้อมูลตั้งต้น
guest-app/       LIFF web app (แขกจอง)
dashboard/       Staff dashboard (พนักงาน/manager/CEO)
```

## เริ่มต้น (Setup)
1. `cp .env.example .env` แล้วเติมค่าจริง (ดูคำอธิบายในไฟล์)
2. ติดตั้ง Supabase CLI: `brew install supabase/tap/supabase`
3. `supabase link --project-ref loxhiqsutuboxyllmysw`
4. `supabase db push` เพื่อ apply migrations (หรือใช้ Supabase MCP `apply_migration`)
5. เปิด `guest-app/` และ `dashboard/` ด้วย static server (เช่น `npx serve`)

## Dashboard (Phase 4)
- `dashboard/index.html` ใช้ Supabase Auth สำหรับพนักงาน/manager/CEO
- ต้องมี Supabase Auth user และ `profiles.role`/`profiles.branch_id` ถูกตั้งค่าก่อนใช้งานจริง
- พนักงานเห็นเฉพาะสาขาที่ผูกไว้ตาม RLS; CEO เห็นทุกสาขา
- เพิ่ม migration `0015_staff_booking_function.sql` สำหรับสร้าง booking แบบ atomic จาก dashboard

## Online URLs (GitHub Pages)
- Root: `https://wayupatza-ux.github.io/nawin-hotel-management/`
- Staff/CEO dashboard: `https://wayupatza-ux.github.io/nawin-hotel-management/dashboard/`
- Guest LIFF app: `https://wayupatza-ux.github.io/nawin-hotel-management/guest-app/`

## Reports (Phase 5)
- เพิ่ม migration `0016_hotel_report_function.sql`
- Dashboard มีแท็บ `รายงาน` สำหรับ KPI โรงแรม: occupancy, revenue, ADR, RevPAR, booking source, room type, daily trend
- รายงานเรียกผ่าน RPC `get_hotel_report(...)` และบังคับสิทธิ์สาขาฝั่งฐานข้อมูล

## ความปลอดภัย (อ่านก่อนเริ่ม)
- **ห้าม commit** `.env`, `Claude.md`, `.claude/` (อยู่ใน `.gitignore` แล้ว)
- `SUPABASE_SERVICE_ROLE_KEY` ใช้เฉพาะฝั่ง Edge Function — ห้ามอยู่ใน frontend
- ระบบเก็บ PII (พาสปอต/บัตร ปชช. + รูปสแกน) → ดู `docs/data-model.md` และกฎ PDPA ใน `HANDOFF.md`
- การทำงานกับ LINE ต้องตามกฎใน [`LINE_BOT_RULES.md`](LINE_BOT_RULES.md)

## แผนพัฒนา & การส่งต่องาน
ดู [`HANDOFF.md`](HANDOFF.md) — แบ่งเป็น 7 เฟส (Phase 0–6) พร้อม acceptance criteria สำหรับ AI engineer ที่มารับช่วงต่อ
