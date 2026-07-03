-- 0012 — ฟังก์ชันสร้างการจองสำหรับแขก (เรียกจาก Edge Function `guest-api` ด้วย service_role เท่านั้น)
-- ทำ availability check + insert ในธุรกรรมเดียว + advisory lock กันสองคนจองพร้อมกันแล้วเกินโควตา

create or replace function create_guest_booking(
  p_guest_id     uuid,
  p_branch_id    uuid,
  p_room_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_num_guests   int
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available int;
  v_base_price numeric(10,2);
  v_nights int;
  v_booking bookings;
begin
  if p_check_out <= p_check_in then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;

  -- ล็อกเฉพาะ (branch, room_type) นี้ กันสองคนจองพร้อมกันแล้วเกินจำนวนห้อง
  perform pg_advisory_xact_lock(hashtextextended(p_branch_id::text || p_room_type_id::text, 0));

  select check_availability(p_branch_id, p_room_type_id, p_check_in, p_check_out) into v_available;
  if v_available is null or v_available <= 0 then
    raise exception 'no_availability' using errcode = 'P0001';
  end if;

  select base_price into v_base_price
    from room_types where id = p_room_type_id and branch_id = p_branch_id;
  if v_base_price is null then
    raise exception 'invalid_room_type' using errcode = 'P0001';
  end if;

  v_nights := p_check_out - p_check_in;

  insert into bookings (
    branch_id, guest_id, room_type_id, check_in, check_out,
    num_guests, status, total_amount, source
  )
  values (
    p_branch_id, p_guest_id, p_room_type_id, p_check_in, p_check_out,
    p_num_guests, 'pending', v_base_price * v_nights, 'line'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function create_guest_booking(uuid, uuid, uuid, date, date, int) from public, anon, authenticated;
grant execute on function create_guest_booking(uuid, uuid, uuid, date, date, int) to service_role;

comment on function create_guest_booking is
  'สร้างการจองของแขกแบบ atomic (เช็คห้องว่าง + คำนวณราคา + insert) — เรียกได้เฉพาะ service_role (จาก Edge Function guest-api)';
