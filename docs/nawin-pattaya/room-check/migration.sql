-- The Nawin Pattaya room readiness checklist (bosstong-finance)
create table if not exists public.nawin_pattaya_room_checks (
  room_no     text not null,
  item_key    text not null,
  status      text not null check (status in ('ok','issue','na')),
  note        text,
  checked_by  text,
  checked_at  timestamptz not null default now(),
  primary key (room_no, item_key)
);
create table if not exists public.nawin_pattaya_room_check_log (
  id          bigserial primary key,
  room_no     text not null,
  item_key    text not null,
  status      text not null,
  note        text,
  checked_by  text,
  checked_at  timestamptz not null default now()
);
create index if not exists nawin_pattaya_room_check_log_room on public.nawin_pattaya_room_check_log (room_no, checked_at desc);
alter table public.nawin_pattaya_room_checks enable row level security;
alter table public.nawin_pattaya_room_check_log enable row level security;
-- no policies: only the edge function (service role) reads/writes
