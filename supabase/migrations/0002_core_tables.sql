-- 0002 — Core catalog tables: branches, room_types, rooms

create table branches (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  address     text,
  phone       text,
  timezone    text not null default 'Asia/Bangkok',
  is_active    boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table room_types (
  id           uuid primary key default uuid_generate_v4(),
  branch_id    uuid not null references branches(id) on delete cascade,
  code         room_type_code not null,
  name         text not null,
  base_price   numeric(10,2) not null check (base_price >= 0),
  capacity     int not null default 2 check (capacity > 0),
  has_window   boolean not null default true,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (branch_id, code)
);

create table rooms (
  id            uuid primary key default uuid_generate_v4(),
  branch_id     uuid not null references branches(id) on delete cascade,
  room_type_id  uuid not null references room_types(id) on delete restrict,
  room_number   text not null,
  floor         int,
  status        room_status not null default 'available',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (branch_id, room_number)
);

create index idx_room_types_branch on room_types(branch_id);
create index idx_rooms_branch on rooms(branch_id);
create index idx_rooms_type on rooms(room_type_id);

create trigger trg_branches_updated   before update on branches   for each row execute function set_updated_at();
create trigger trg_room_types_updated before update on room_types for each row execute function set_updated_at();
create trigger trg_rooms_updated      before update on rooms      for each row execute function set_updated_at();
