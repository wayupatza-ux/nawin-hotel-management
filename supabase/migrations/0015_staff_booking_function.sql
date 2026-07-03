-- 0015 — Atomic booking flow for staff dashboard
-- Staff/manager/CEO create walk-in or phone bookings through Supabase Auth.

create or replace function create_staff_booking(
  p_branch_id    uuid,
  p_room_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_num_guests   int,
  p_first_name   text,
  p_last_name    text,
  p_phone        text default null,
  p_email        text default null,
  p_nationality  text default null,
  p_status       booking_status default 'confirmed',
  p_notes        text default null
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
  v_guest_id uuid;
  v_booking bookings;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not can_access_branch(p_branch_id) then
    raise exception 'forbidden_branch' using errcode = 'P0001';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;

  if p_status not in ('pending', 'confirmed') then
    raise exception 'invalid_initial_status' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_branch_id::text || p_room_type_id::text, 0));

  select check_availability(p_branch_id, p_room_type_id, p_check_in, p_check_out) into v_available;
  if v_available is null or v_available <= 0 then
    raise exception 'no_availability' using errcode = 'P0001';
  end if;

  select base_price into v_base_price
    from room_types
   where id = p_room_type_id
     and branch_id = p_branch_id
     and is_active = true;

  if v_base_price is null then
    raise exception 'invalid_room_type' using errcode = 'P0001';
  end if;

  insert into guests (first_name, last_name, phone, email, nationality)
  values (
    nullif(trim(p_first_name), ''),
    nullif(trim(p_last_name), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_nationality, '')), '')
  )
  returning id into v_guest_id;

  v_nights := p_check_out - p_check_in;

  insert into bookings (
    branch_id, guest_id, room_type_id, check_in, check_out,
    num_guests, status, total_amount, source, notes, created_by
  )
  values (
    p_branch_id, v_guest_id, p_room_type_id, p_check_in, p_check_out,
    p_num_guests, p_status, v_base_price * v_nights, 'staff', p_notes, auth.uid()
  )
  returning * into v_booking;

  perform log_audit(
    'create',
    'bookings',
    v_booking.id,
    jsonb_build_object('source', 'dashboard', 'guest_id', v_guest_id)
  );

  return v_booking;
end;
$$;

revoke all on function create_staff_booking(uuid, uuid, date, date, int, text, text, text, text, text, booking_status, text)
  from public, anon;
grant execute on function create_staff_booking(uuid, uuid, date, date, int, text, text, text, text, text, booking_status, text)
  to authenticated;

comment on function create_staff_booking is
  'Staff dashboard booking creation: checks branch access, availability, price, guest creation, and audit log atomically.';
