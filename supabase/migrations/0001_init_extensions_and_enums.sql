-- 0001 — Extensions & enum types
-- ระบบบริหารจัดการโรงแรม (multi-branch ready)

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists btree_gist;   -- ใช้ทำ exclusion constraint กันจองห้องซ้อน

-- Enum types
create type room_type_code as enum
  ('standard_no_window', 'standard', 'superior_no_window', 'superior');

create type room_status as enum
  ('available', 'maintenance', 'closed');

create type booking_status as enum
  ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');

create type booking_source as enum
  ('line', 'walk_in', 'ota', 'staff');

create type doc_type as enum
  ('passport', 'national_id');

create type user_role as enum
  ('staff', 'manager', 'ceo');

create type payment_method as enum
  ('cash', 'card', 'transfer', 'other');

-- Generic updated_at trigger
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
