-- 0003 — Guests & ID documents (PII — access ผ่าน RLS/Edge Function เท่านั้น)

create table guests (
  id            uuid primary key default uuid_generate_v4(),
  line_user_id  text unique,               -- จาก LINE Login (null ได้ถ้าเป็น walk-in)
  display_name  text,
  first_name    text,
  last_name     text,
  phone         text,
  email         text,
  nationality   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table guest_documents (
  id          uuid primary key default uuid_generate_v4(),
  guest_id    uuid not null references guests(id) on delete cascade,
  doc_type    doc_type not null,
  doc_number  text,
  file_path   text,                         -- path ใน Storage bucket 'id-documents' (private)
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_guest_documents_guest on guest_documents(guest_id);

create trigger trg_guests_updated          before update on guests          for each row execute function set_updated_at();
create trigger trg_guest_documents_updated before update on guest_documents for each row execute function set_updated_at();
