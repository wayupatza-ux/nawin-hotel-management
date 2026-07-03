-- 0013 — แก้บั๊ก: check_availability คืนค่า 0 เสมอเมื่อเรียกโดย anon
--
-- สาเหตุ: ฟังก์ชันถูกสร้างแบบ SECURITY INVOKER (ค่า default) ทำให้ subquery บน
-- `rooms` และ `bookings` ภายในฟังก์ชันถูก RLS ของผู้เรียกบังคับใช้ด้วย — และ anon
-- ไม่มี policy ให้อ่าน `rooms`/`bookings` เลย ผลคือทั้งสอง subquery ได้ 0 แถวเสมอ
-- (0 - 0 = 0) แม้ห้องจะว่างจริงก็ตาม พบระหว่างทดสอบหน้าจองห้องจริงใน Phase 3
--
-- แก้ไข: เปลี่ยนเป็น SECURITY DEFINER เพื่อให้นับห้องว่างข้าม RLS ได้ถูกต้อง
-- ปลอดภัย เพราะฟังก์ชันคืนแค่ "จำนวนเต็ม" ไม่รั่วข้อมูลรายแถวใดๆ และตั้งใจเปิดให้
-- anon เรียกอยู่แล้ว (grant execute ... to anon ใน migration 0006)

alter function check_availability(uuid, uuid, date, date) security definer;
alter function check_availability(uuid, uuid, date, date) set search_path = public;
