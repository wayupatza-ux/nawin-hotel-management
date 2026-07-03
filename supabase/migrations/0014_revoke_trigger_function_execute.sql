-- 0014 — trigger function ไม่ควรถูกเรียกตรงผ่าน REST API เลย (เรียกได้เฉพาะจาก trigger)
-- security advisor พบว่า notify_booking_confirmed() ยังเปิดให้ anon/authenticated
-- เรียกผ่าน /rest/v1/rpc/notify_booking_confirmed ได้ — ปิดสิทธิ์นี้

revoke all on function notify_booking_confirmed() from public, anon, authenticated;
