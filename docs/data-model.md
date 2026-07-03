# Data Model — ระบบบริหารจัดการโรงแรม

Postgres (Supabase) — ทุกตารางหลักมี `branch_id` เพื่อรองรับ multi-branch, เปิด RLS ทุกตาราง (default deny)

## ER Diagram (ย่อ)
```
branches 1───∞ room_types 1───∞ rooms
    │              │              │
    │              └──────┐       │
    │                     ▼       ▼
    └──────────────∞ bookings ∞───┘
                      │  │  │
        guest_id ─────┘  │  └───── room_id (assign ทีหลัง)
             │           │
          guests         ├──∞ booking_status_history
             │           ├──∞ payments
             └──∞ guest_documents   └──∞ notifications_log

auth.users 1───1 profiles ∞───1 branches
audit_log (บันทึกการเข้าถึง PII ทุกตาราง)
```

## ตาราง

### `branches` — สาขาโรงแรม
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| name | text | เช่น "นาวิน ดอนเมือง" |
| address | text | |
| phone | text | |
| timezone | text | default `Asia/Bangkok` |
| is_active | bool | default true |
| created_at | timestamptz | |

### `room_types` — ประเภทห้อง (4 แบบ)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK→branches | |
| code | text | `standard_no_window` / `standard` / `superior_no_window` / `superior` |
| name | text | ชื่อแสดงผล |
| base_price | numeric(10,2) | ราคา/คืน |
| capacity | int | จำนวนแขกสูงสุด |
| has_window | bool | |
| UNIQUE(branch_id, code) | | กันซ้ำต่อสาขา |

### `rooms` — ห้องจริง (inventory)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK | |
| room_type_id | uuid FK→room_types | |
| room_number | text | |
| floor | int | |
| status | text | `available` / `maintenance` / `closed` |
| UNIQUE(branch_id, room_number) | | |

### `guests` — ลูกค้า (ผูกกับ LINE)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| line_user_id | text UNIQUE | จาก LINE Login |
| display_name | text | จากโปรไฟล์ LINE |
| first_name / last_name | text | |
| phone / email | text | |
| nationality | text | |
| created_at | timestamptz | |

### `guest_documents` — เอกสารยืนยันตัวตน (PII — คุมเข้ม)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| guest_id | uuid FK→guests | |
| doc_type | text | `passport` / `national_id` |
| doc_number | text | เลขเอกสาร |
| file_path | text | path ใน Storage bucket `id-documents` (private) |
| verified | bool | พนักงานยืนยันแล้ว |
| created_at | timestamptz | |

### `bookings` — การจอง
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| booking_ref | text UNIQUE | รหัสจองอ่านง่าย (เช่น NVDM-000123) |
| branch_id | uuid FK | |
| guest_id | uuid FK→guests | |
| room_type_id | uuid FK→room_types | ประเภทที่จอง |
| room_id | uuid FK→rooms NULL | assign ห้องจริงทีหลัง |
| check_in | date | |
| check_out | date | ต้อง > check_in |
| num_guests | int | |
| status | text | `pending`/`confirmed`/`checked_in`/`checked_out`/`cancelled`/`no_show` |
| total_amount | numeric(10,2) | |
| source | text | `line` / `walk_in` / `ota` / `staff` |
| notes | text | |
| created_by | uuid NULL | staff ที่สร้าง (ถ้ามาจาก dashboard) |
| created_at | timestamptz | |

### `booking_status_history` — ประวัติเปลี่ยนสถานะ
`id, booking_id FK, status, changed_by, changed_at`

### `payments` — บันทึกจ่ายที่โรงแรม (เผื่ออนาคตต่อ gateway)
`id, booking_id FK, amount, method (cash/card/transfer), paid_at, recorded_by`

### `notifications_log` — log แจ้งเตือน LINE
`id, booking_id FK, channel (line), event_type, payload jsonb, status (sent/failed), sent_at`

### `profiles` — บัญชีพนักงาน/CEO (ต่อกับ Supabase Auth)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid PK FK→auth.users | |
| full_name | text | |
| role | text | `staff` / `manager` / `ceo` |
| branch_id | uuid FK NULL | null = เห็นทุกสาขา (สำหรับ ceo) |
| is_active | bool | |

### `audit_log` — บันทึกการเข้าถึง PII (PDPA)
`id, actor (uuid), action (view/create/update/delete), target_table, target_id, at, meta jsonb`

## Availability / กันจองซ้อน
ฟังก์ชัน `check_availability(p_branch_id, p_room_type_id, p_check_in, p_check_out)` คืนจำนวนห้องว่าง:
```
(จำนวน rooms ของ room_type ที่ status='available')
  − (จำนวน bookings ที่ room_type เดียวกัน + สถานะ active (pending/confirmed/checked_in)
       และช่วงวัน [check_in, check_out) ทับซ้อนกับที่ขอ)
```
ตอนสร้าง booking: ทำใน transaction + `pg_advisory_xact_lock` ต่อ (branch_id, room_type_id) เพื่อกัน race
เมื่อ assign `room_id` แล้ว: บังคับด้วย exclusion constraint (`btree_gist`) กันห้องเดียวถูกจองทับช่วงเวลา

## RLS สรุป (นโยบายต่อ role)
| ตาราง | guest (ผ่าน Edge Fn) | staff | manager | ceo |
|---|---|---|---|---|
| bookings | เฉพาะ guest_id ตน | เฉพาะ branch ตน (CRUD) | branch ตน | ทุก branch (read) |
| guests / guest_documents | เฉพาะตน | branch ตน (+audit) | branch ตน | ทุก branch |
| rooms / room_types | read (จองได้) | branch ตน | branch ตน | ทุก branch |
| reports views | ✗ | branch ตน | branch ตน | ทุก branch |

> guest ไม่มี Supabase Auth account — เข้าถึงข้อมูลผ่าน Edge Function ที่ verify LINE id token แล้วใช้ service role (ดู Phase 2/3)
