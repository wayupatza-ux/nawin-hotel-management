-- 0010 — ปิด SECURITY DEFINER helper ไม่ให้ anon เรียกได้ (ตัด PUBLIC grant)
-- Postgres ให้ EXECUTE แก่ PUBLIC โดยอัตโนมัติ → ต้อง revoke จาก public แล้ว grant
-- เฉพาะ authenticated (จำเป็นเพราะถูกเรียกใน RLS policy)

revoke execute on function auth_role()   from public;
revoke execute on function auth_branch() from public;
grant  execute on function auth_role()   to authenticated;
grant  execute on function auth_branch() to authenticated;

-- log_audit: ให้เฉพาะ authenticated (แอปเขียน audit ตอนดู PII); ตัด anon/public
revoke execute on function log_audit(text, text, uuid, jsonb) from public;
grant  execute on function log_audit(text, text, uuid, jsonb) to authenticated;

-- หมายเหตุ: warning ระดับ 0029 (authenticated เรียก auth_role/auth_branch/log_audit ได้)
-- เป็นสิ่งที่ตั้งใจ — RLS ต้องใช้ helper เหล่านี้ และ auth_role/auth_branch คืนเฉพาะ
-- ข้อมูลของผู้เรียกเอง (role/branch ตัวเอง) จึงไม่รั่วข้อมูลผู้อื่น
