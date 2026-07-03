-- 0009 — Security hardening (จาก Supabase security advisor)

-- 1) กำหนด search_path ให้ฟังก์ชันที่ยังไม่ได้ตั้ง (กัน search_path hijack)
alter function set_updated_at() set search_path = public;
alter function check_availability(uuid, uuid, date, date) set search_path = public;
alter function is_ceo() set search_path = public;
alter function can_access_branch(uuid) set search_path = public;

-- 2) ปิดไม่ให้เรียกฟังก์ชันภายใน/นิยาม SECURITY DEFINER ผ่าน REST API
--    (ฟังก์ชัน helper ยังถูกเรียกใน RLS ได้ เพราะ authenticated ยังมีสิทธิ์ที่จำเป็น)
revoke execute on function auth_role()          from anon;
revoke execute on function auth_branch()        from anon;
revoke execute on function is_ceo()             from anon;
revoke execute on function can_access_branch(uuid) from anon;
revoke execute on function log_audit(text, text, uuid, jsonb) from anon;
-- trigger function: ไม่ต้องให้เรียกผ่าน API เลย (trigger ทำงานได้อยู่แล้ว)
revoke execute on function handle_new_user()    from anon, authenticated, public;
revoke execute on function log_booking_status() from anon, authenticated, public;

-- 3) รัดกุม RLS ที่ยังเป็น WITH CHECK (true)
-- 3.1 guests: insert ได้เฉพาะ user ที่มี profile role จริง (พนักงาน)
drop policy guests_insert on guests;
create policy guests_insert on guests
  for insert to authenticated
  with check (auth_role() in ('staff', 'manager', 'ceo'));

-- 3.2 guest_documents: แยก insert/update/delete + ตรวจสาขาให้ครบ
drop policy guest_docs_write on guest_documents;
create policy guest_docs_insert on guest_documents
  for insert to authenticated with check (
    is_ceo() or exists (
      select 1 from bookings b
      where b.guest_id = guest_documents.guest_id and can_access_branch(b.branch_id))
  );
create policy guest_docs_update on guest_documents
  for update to authenticated
  using (
    is_ceo() or exists (
      select 1 from bookings b
      where b.guest_id = guest_documents.guest_id and can_access_branch(b.branch_id))
  )
  with check (
    is_ceo() or exists (
      select 1 from bookings b
      where b.guest_id = guest_documents.guest_id and can_access_branch(b.branch_id))
  );
create policy guest_docs_delete on guest_documents
  for delete to authenticated using (
    auth_role() in ('manager','ceo') and exists (
      select 1 from bookings b
      where b.guest_id = guest_documents.guest_id and can_access_branch(b.branch_id))
  );

-- 3.3 payments: แทน policy ALL (with check true) ด้วย update/delete ที่ตรวจสิทธิ์จริง
drop policy payments_manage on payments;
create policy payments_update on payments
  for update to authenticated
  using (
    auth_role() in ('manager','ceo') and exists (
      select 1 from bookings b where b.id = payments.booking_id and can_access_branch(b.branch_id))
  )
  with check (
    auth_role() in ('manager','ceo') and exists (
      select 1 from bookings b where b.id = payments.booking_id and can_access_branch(b.branch_id))
  );
create policy payments_delete on payments
  for delete to authenticated using (
    auth_role() in ('manager','ceo') and exists (
      select 1 from bookings b where b.id = payments.booking_id and can_access_branch(b.branch_id))
  );

-- หมายเหตุ: WARN 'extension btree_gist in public' ยอมรับความเสี่ยงได้ (ใช้โดย exclusion
-- constraint กันจองซ้อน; การย้าย schema เสี่ยงกว่าประโยชน์) — ทบทวนใน Phase 6
