-- 0007 — Row Level Security (default deny; เปิดเท่าที่จำเป็น)
-- โมเดล: staff/manager/ceo เข้าผ่าน Supabase Auth (RLS นี้บังคับ)
--        guest เข้าผ่าน Edge Function (service_role → bypass RLS)
--        anon เห็นได้เฉพาะ catalog (branches/room_types) + เรียก check_availability

-- ให้ trigger เขียน history โดยไม่ติด RLS ของผู้เรียก
create or replace function log_booking_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into booking_status_history (booking_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

alter table branches                enable row level security;
alter table room_types              enable row level security;
alter table rooms                   enable row level security;
alter table guests                  enable row level security;
alter table guest_documents         enable row level security;
alter table bookings                enable row level security;
alter table booking_status_history  enable row level security;
alter table payments                enable row level security;
alter table notifications_log       enable row level security;
alter table profiles                enable row level security;
alter table audit_log               enable row level security;

-- ===== branches =====
create policy branches_anon_select on branches
  for select to anon using (is_active);
create policy branches_auth_select on branches
  for select to authenticated using (can_access_branch(id));
create policy branches_ceo_manage on branches
  for all to authenticated using (is_ceo()) with check (is_ceo());

-- ===== room_types (catalog) =====
create policy room_types_anon_select on room_types
  for select to anon using (is_active);
create policy room_types_auth_select on room_types
  for select to authenticated using (can_access_branch(branch_id));
create policy room_types_manage on room_types
  for all to authenticated
  using (can_access_branch(branch_id) and auth_role() in ('manager','ceo'))
  with check (can_access_branch(branch_id) and auth_role() in ('manager','ceo'));

-- ===== rooms (inventory — staff เท่านั้น) =====
create policy rooms_auth_select on rooms
  for select to authenticated using (can_access_branch(branch_id));
create policy rooms_manage on rooms
  for all to authenticated
  using (can_access_branch(branch_id) and auth_role() in ('manager','ceo'))
  with check (can_access_branch(branch_id) and auth_role() in ('manager','ceo'));

-- ===== guests (เห็นเฉพาะลูกค้าที่มี booking ในสาขาที่เข้าถึงได้) =====
create policy guests_select on guests
  for select to authenticated using (
    is_ceo() or exists (
      select 1 from bookings b
      where b.guest_id = guests.id and can_access_branch(b.branch_id)
    )
  );
create policy guests_insert on guests
  for insert to authenticated with check (true);   -- สร้างลูกค้าใหม่ (walk-in) ได้
create policy guests_update on guests
  for update to authenticated using (
    is_ceo() or exists (
      select 1 from bookings b
      where b.guest_id = guests.id and can_access_branch(b.branch_id)
    )
  );

-- ===== guest_documents (PII เข้ม — ผูกกับ booking ในสาขาที่เข้าถึงได้) =====
create policy guest_docs_select on guest_documents
  for select to authenticated using (
    is_ceo() or exists (
      select 1 from bookings b
      where b.guest_id = guest_documents.guest_id and can_access_branch(b.branch_id)
    )
  );
create policy guest_docs_write on guest_documents
  for all to authenticated
  using (
    is_ceo() or exists (
      select 1 from bookings b
      where b.guest_id = guest_documents.guest_id and can_access_branch(b.branch_id)
    )
  )
  with check (true);

-- ===== bookings =====
create policy bookings_select on bookings
  for select to authenticated using (can_access_branch(branch_id));
create policy bookings_insert on bookings
  for insert to authenticated with check (can_access_branch(branch_id));
create policy bookings_update on bookings
  for update to authenticated using (can_access_branch(branch_id))
  with check (can_access_branch(branch_id));
create policy bookings_delete on bookings
  for delete to authenticated
  using (can_access_branch(branch_id) and auth_role() in ('manager','ceo'));

-- ===== booking_status_history (อ่านอย่างเดียว; เขียนผ่าน trigger security definer) =====
create policy bsh_select on booking_status_history
  for select to authenticated using (
    exists (select 1 from bookings b
            where b.id = booking_status_history.booking_id
              and can_access_branch(b.branch_id))
  );

-- ===== payments =====
create policy payments_select on payments
  for select to authenticated using (
    exists (select 1 from bookings b
            where b.id = payments.booking_id and can_access_branch(b.branch_id))
  );
create policy payments_insert on payments
  for insert to authenticated with check (
    exists (select 1 from bookings b
            where b.id = payments.booking_id and can_access_branch(b.branch_id))
  );
create policy payments_manage on payments
  for all to authenticated
  using (
    exists (select 1 from bookings b
            where b.id = payments.booking_id and can_access_branch(b.branch_id))
    and auth_role() in ('manager','ceo')
  )
  with check (true);

-- ===== notifications_log (อ่าน; เขียนผ่าน Edge/service role) =====
create policy notif_select on notifications_log
  for select to authenticated using (
    is_ceo() or (booking_id is not null and exists (
      select 1 from bookings b
      where b.id = notifications_log.booking_id and can_access_branch(b.branch_id)
    ))
  );

-- ===== profiles (อ่านของตน / manager+ceo อ่านได้; แก้ไขเฉพาะ ceo กันยกระดับสิทธิ์) =====
create policy profiles_select on profiles
  for select to authenticated using (
    id = auth.uid() or auth_role() in ('manager','ceo')
  );
create policy profiles_ceo_manage on profiles
  for all to authenticated using (is_ceo()) with check (is_ceo());

-- ===== audit_log (manager+ceo อ่าน; เขียนผ่าน log_audit security definer) =====
create policy audit_select on audit_log
  for select to authenticated using (auth_role() in ('manager','ceo'));
