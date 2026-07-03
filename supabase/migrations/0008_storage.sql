-- 0008 — Storage bucket สำหรับรูปสแกนเอกสาร ID (private)
-- path convention: id-documents/guests/{guest_id}/{filename}
-- guest อัปโหลดผ่าน Edge Function (service role); staff เปิดดูผ่าน signed URL

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'id-documents', 'id-documents', false,
  10485760,   -- 10 MB
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- staff/manager/ceo อ่านไฟล์ในบักเก็ตนี้ได้ (เพื่อ verify ตอนเช็คอิน)
create policy id_docs_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'id-documents'
    and auth_role() in ('staff','manager','ceo')
  );

-- staff เพิ่ม/แก้ไฟล์ได้ (guest อัปโหลดผ่าน service role อยู่แล้ว)
create policy id_docs_staff_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'id-documents'
    and auth_role() in ('staff','manager','ceo')
  );

create policy id_docs_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'id-documents' and auth_role() in ('manager','ceo'));

create policy id_docs_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'id-documents' and auth_role() in ('manager','ceo'));

-- ไม่มี policy สำหรับ anon → anon เข้าถึงบักเก็ตนี้ไม่ได้เลย (private)
