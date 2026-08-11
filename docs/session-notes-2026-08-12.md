# Session notes — 2026-08-12

สรุปสิ่งที่ทำเสร็จในเซสชันนี้ (คุยกับ Claude Code) ครอบคลุม 2 โปรเจกต์หลัก + งานเดี่ยวๆ อีกหลายอย่าง เก็บไว้กันลืม/กันต้องมานั่งไล่แชทซ้ำ

## 1. Nawin Resort เขาค้อ (`nawin-resort-khaokho` repo, Supabase `espxwmnaoauhsdgckwpr`)

- **LINE Rich Menu** — ปุ่ม "แผนที่" ชี้ไปพิกัดจริง (`16.628785, 101.002473`) แล้ว, ตั้งเป็นเมนูหลักแล้ว, **บอสตองทดสอบกดทุกปุ่มจากแอป LINE จริงแล้วผ่านหมด**
- **PromptPay การชำระเงิน** — ตั้งค่าเสร็จครบ (PromptPay ID แบบ e-Wallet 15 หลัก, ชื่อบัญชี, note) รอบอสตองสแกนทดสอบด้วยแอปธนาคารจริงอีกรอบก่อนใช้จริง
- **Google Maps** — ส่ง "Add a missing place" ชื่อ "Nawin Resort Khaokho" ไปแล้ว **ยังรอ Google อนุมัติ** (จะมีอีเมลแจ้ง) — เมื่ออนุมัติแล้วต้องส่ง "แนะนำการแก้ไข" เปลี่ยนชื่อเป็น **"Nawin Resort เขาค้อ"** อีกที (ตอนนี้ยังทำไม่ได้เพราะสถานที่ยังไม่ค้นหาเจอ)
- **Google Business Profile** — สร้างเสร็จแล้วผ่านอีเมล `nawinresort.khaokho@gmail.com` ชื่อ "nawin resort เขาค้อ" ข้อมูลครบ (ที่อยู่, พิกัด, เบอร์, เว็บไซต์) **สถานะ "Verification required"** — Google ให้ยืนยันตัวตนทางเดียวคือ **อัดวิดีโอธุรกิจที่รีสอร์ทจริง** ต้องบอสตองทำเอง (ยังไม่จำเป็นถ้าแค่ต้องการให้ลูกค้ารีวิวได้ — รีวิวได้จากแค่หมุด Maps อย่างเดียวพอ)
- **Agoda listing** — สมัคร Agoda Partner ผ่าน `nawinresort.khaokho@gmail.com` แล้ว กรอกครบ **publish สำเร็จแล้ว (Ref ID: 92425385)** สถานะ "Publishing in progress" รอ Agoda รีวิว 1-3 วัน
  - ห้อง: "Deluxe Bungalow" (แทนบ้านพัก 3 หลัง) + "Standard Room" (แทนเต็นท์ T1) — Agoda ไม่มีหมวด Tent/Glamping ให้เลือก
  - **ค้างที่บอสตองต้องทำเอง:** ตั้งจำนวนห้องจริง (3+1) ใน Availability Center, กรอกเลขบัญชีธนาคารรับเงินจริง (ผมกรอกแทนไม่ได้), ตรวจสอบขนาดห้อง (20/12 ตร.ม. เป็นตัวเลขประมาณการ), กรอก "ชื่อห้องใน Agoda" ในหน้า Dashboard ของเราให้ตรงกับ Agoda เพื่อให้ `agoda-intake` จับคู่ห้องถูก
- **Agoda outreach email** (ขอต่อ API ตรงแบบไม่ผ่าน channel manager) — ดราฟท์ไว้ใน Gmail แล้ว (`agoda.chain.support@agoda.com`) รอกรอก Hotel ID (ต้องมี Agoda partner account ก่อน) แล้วส่งเอง

## 2. Nawin Hotel ดอนเมือง (`nawin-hotel-management` repo = repo นี้, CNAME `nawingroup.com`)

### ระบบใบกำกับภาษี (ใหม่ — งานหลักของวันนี้)
- Live แล้วที่ **`https://nawingroup.com/tax-invoice/?k=<per-staff-token>`**
- ออกเลขที่เอกสารอัตโนมัติแบบ **atomic, เรียงไม่ซ้ำ, ไม่ชนกันแม้พนักงาน 2 คนกดพร้อมกัน** — รูปแบบ `NV-{ปี}-{ลำดับ 3 หลัก}` รีเซ็ตทุกปี
- Backend อยู่ที่โปรเจกต์ **`bosstong-finance`** (Supabase `hkglavlxhdtoawjfptah`) — ตาราง `hotel_tax_invoices` + `tax_invoice_sequences`, edge function `public-hotel-tax-invoice`, auth ใช้ per-staff token เดิม (`hotel_staff.access_token`) แบบเดียวกับ check-in/cash-report
- **เลขเริ่มที่ `NV-2026-002`** เพราะ `NV-2026-001` ออกด้วยมือให้บางจาก โซลาร์เอ็นเนอร์ยี่ ไปก่อนหน้านี้แล้ว (นอกระบบ)
- ลิงก์ทดสอบส่วนตัวของบอสตอง (แยกจากพนักงานจริง): `https://nawingroup.com/tax-invoice/?k=5db6c8e1da8ae5f19152dcd5`
- ไฟล์เก่า `dashboard/tax-invoice.html` (เวอร์ชันพิมพ์เลขเองมือ ไม่ผ่านระบบ) **ยังค้างอยู่ ยังไม่ได้ตัดสินใจว่าจะลบไหม** — ควรลบเพื่อไม่ให้พนักงานสับสนว่าจะใช้อันไหน

### แก้ปัญหา "ส่งไฟล์เข้า LINE ไม่ได้ตอนอยู่นอกบ้าน"
- **ที่ใช้ไม่ได้ (อย่าลองอีก):** `hermes send --to line` (bug จริงในตัว Hermes — ไม่เคยต่อ LINE เข้ากับระบบ home-channel เลย) และลิงก์ private ของ claude.ai artifact (ต้อง login ทำให้เปิดในแอป LINE ไม่ได้)
- **ที่ใช้ได้แล้วและทดสอบผ่านจริง:** `.hermes/scripts/send_line_file.py` — อัปโหลดไฟล์ขึ้น Supabase Storage (bucket `tmp-outbound`) ผ่าน edge function `admin-upload-file` ที่แก้ auth ให้ใช้งานได้แล้ว ได้ลิงก์แบบ **ไม่ต้อง login เปิดได้เลย** (หมดอายุอัตโนมัติ ค่าเริ่มต้น 1 ชม.) แล้วส่งเป็นการ์ด LINE พร้อมปุ่มกด
- วิธีเรียกใช้ (สำหรับ Claude Code เซสชันหน้า):
  ```bash
  set -a; source .hermes/.env; set +a
  python3 .hermes/scripts/send_line_file.py --file <path> --title "..." --subtitle "..." --note "..."
  ```
- บันทึกไว้ถาวรแล้วใน `docs/staff-tools-architecture.md` (หัวข้อ "Delivering a generated file to บอสตอง on LINE")

### โปรเจกต์ Supabase ของโรงแรมดอนเมือง (booking dashboard) ยัง **pause** อยู่
- โปรเจกต์ `loxhiqsutuboxyllmysw` (ตัวจริงของ booking/room dashboard) ถูก Supabase auto-pause เพราะ Free tier จำกัด active project ได้แค่ 2 ต่อองค์กร (ตอนนี้เต็มโควตาจาก `bosstong-finance` + `nawin-resort-khaokho`)
- **ยังไม่ได้ restore** — บอสตองบอกให้ข้ามไปทำระบบใบกำกับภาษีใน `bosstong-finance` แทนก่อน (เพราะเกี่ยวกับ nawingroup/nabee) วิธี restore ทำได้ 3 ทาง: อัปเกรด Supabase Pro / pause โปรเจกต์อื่นแทน / ลบโปรเจกต์ที่ไม่ใช้ — **ยังไม่ตัดสินใจ**

## 3. คำถามเรื่อง Security (ตอบไปแล้ว สรุปสั้นๆ)

ระบบ token-in-link (check-in/cash-report/tax-invoice) ปลอดภัยระดับใช้ได้จริงสำหรับทีมเล็ก แต่จุดอ่อนคือ token ไม่หมดอายุเอง + หลุดง่ายกว่ารหัสผ่าน (แคปหน้าจอ/ส่งผิดกลุ่ม) — **แนะนำให้หมุน token เฉพาะตอนพนักงานลาออกหรือสงสัยว่าหลุด ไม่ต้องตั้งหมุนอัตโนมัติทั้งทีม** เพราะจะวุ่นวายเปล่าๆ กับทีมเล็กที่รู้จักหน้าค่าตากันอยู่แล้ว

## Action items ค้างอยู่ (สรุปรวม)

- [ ] บอสตองสแกน PromptPay QR ของเขาค้อทดสอบด้วยแอปธนาคารจริง
- [ ] รอ Google อนุมัติ place "Nawin Resort Khaokho" แล้วส่งแก้ชื่อเป็น "Nawin Resort เขาค้อ"
- [ ] อัดวิดีโอยืนยัน Google Business Profile ที่รีสอร์ท (ถ้าต้องการ — ไม่จำเป็นสำหรับรีวิว)
- [ ] ตั้งจำนวนห้องจริงใน Agoda Availability Center + กรอกเลขบัญชีธนาคาร + กรอกชื่อห้องใน Agoda ในหน้า Dashboard
- [ ] ตัดสินใจเรื่องไฟล์ `dashboard/tax-invoice.html` เก่า (ลบทิ้งไหม)
- [ ] ตัดสินใจเรื่องโปรเจกต์ Supabase ที่ pause อยู่ (`loxhiqsutuboxyllmysw`)
