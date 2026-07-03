-- 0006 — Availability + auth helper functions

-- จำนวนห้องว่างของประเภทห้องหนึ่งในช่วงวันที่ขอ
create or replace function check_availability(
  p_branch_id    uuid,
  p_room_type_id uuid,
  p_check_in     date,
  p_check_out    date
)
returns int
language sql
stable
as $$
  select
    (select count(*)::int
       from rooms r
      where r.branch_id = p_branch_id
        and r.room_type_id = p_room_type_id
        and r.status = 'available')
    -
    (select count(*)::int
       from bookings b
      where b.branch_id = p_branch_id
        and b.room_type_id = p_room_type_id
        and b.status in ('pending', 'confirmed', 'checked_in')
        and daterange(b.check_in, b.check_out, '[)')
             && daterange(p_check_in, p_check_out, '[)'));
$$;

comment on function check_availability is
  'คืนจำนวนห้องว่างของ room_type ในช่วง [check_in, check_out) — ใช้ก่อนสร้าง booking';

-- ให้ guest (anon) เช็คห้องว่างได้ แต่เห็นแค่ตัวเลข ไม่เห็นข้อมูลอื่น
grant execute on function check_availability(uuid, uuid, date, date) to anon, authenticated;

-- ===== auth helper (ใช้ใน RLS policy) =====
create or replace function auth_role()
returns user_role
language sql
stable
security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function auth_branch()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select branch_id from profiles where id = auth.uid();
$$;

create or replace function is_ceo()
returns boolean
language sql
stable
as $$
  select auth_role() = 'ceo';
$$;

-- เห็น branch นี้ได้ไหม (ceo เห็นทุกสาขา, คนอื่นเฉพาะสาขาตน)
create or replace function can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
as $$
  select is_ceo() or (auth_branch() = p_branch_id);
$$;
