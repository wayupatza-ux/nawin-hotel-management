-- 0004 — Bookings + status history + payments + notifications log

create sequence if not exists booking_ref_seq;

create table bookings (
  id            uuid primary key default uuid_generate_v4(),
  booking_ref   text not null unique default ('BK-' || lpad(nextval('booking_ref_seq')::text, 6, '0')),
  branch_id     uuid not null references branches(id) on delete restrict,
  guest_id      uuid not null references guests(id) on delete restrict,
  room_type_id  uuid not null references room_types(id) on delete restrict,
  room_id       uuid references rooms(id) on delete set null,   -- assign ห้องจริงทีหลัง
  check_in      date not null,
  check_out     date not null,
  num_guests    int not null default 1 check (num_guests > 0),
  status        booking_status not null default 'pending',
  total_amount  numeric(10,2) not null default 0 check (total_amount >= 0),
  source        booking_source not null default 'line',
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,  -- staff ที่สร้าง (ถ้ามาจาก dashboard)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (check_out > check_in)
);

-- กันห้องเดียวกันถูกจองทับช่วงเวลา (เฉพาะที่ assign ห้องแล้ว + สถานะ active)
alter table bookings
  add constraint bookings_no_room_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (room_id is not null and status in ('confirmed', 'checked_in'));

create index idx_bookings_branch on bookings(branch_id);
create index idx_bookings_guest  on bookings(guest_id);
create index idx_bookings_type   on bookings(room_type_id);
create index idx_bookings_dates  on bookings(check_in, check_out);
create index idx_bookings_status on bookings(status);

create trigger trg_bookings_updated before update on bookings for each row execute function set_updated_at();

-- ประวัติการเปลี่ยนสถานะ
create table booking_status_history (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  status      booking_status not null,
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index idx_bsh_booking on booking_status_history(booking_id);

-- บันทึกอัตโนมัติทุกครั้งที่สถานะเปลี่ยน (รวมตอน insert)
create or replace function log_booking_status()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into booking_status_history (booking_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_bookings_status_ins after insert on bookings for each row execute function log_booking_status();
create trigger trg_bookings_status_upd after update on bookings for each row execute function log_booking_status();

-- บันทึกการชำระเงิน (MVP: จ่ายที่โรงแรม; เผื่อต่อ payment gateway ภายหลัง)
create table payments (
  id           uuid primary key default uuid_generate_v4(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  amount       numeric(10,2) not null check (amount >= 0),
  method       payment_method not null default 'cash',
  paid_at      timestamptz not null default now(),
  recorded_by  uuid references auth.users(id) on delete set null,
  note         text
);
create index idx_payments_booking on payments(booking_id);

-- log การแจ้งเตือน LINE (กันส่งซ้ำ / ตรวจย้อนหลัง)
create table notifications_log (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid references bookings(id) on delete set null,
  channel     text not null default 'line',
  event_type  text not null,             -- e.g. 'booking_confirmed'
  payload     jsonb,
  status      text not null default 'sent',   -- 'sent' / 'failed'
  error       text,
  sent_at     timestamptz not null default now()
);
create index idx_notif_booking on notifications_log(booking_id);
