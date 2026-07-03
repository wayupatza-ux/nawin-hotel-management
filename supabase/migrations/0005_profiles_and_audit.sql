-- 0005 — Staff/CEO profiles (ต่อกับ Supabase Auth) + audit log (PDPA)

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        user_role not null default 'staff',
  branch_id   uuid references branches(id) on delete set null,  -- null = เห็นทุกสาขา (ceo)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();

-- สร้าง profile อัตโนมัติเมื่อมี auth user ใหม่ (role เริ่มต้น = staff, ปรับทีหลังโดย admin)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Audit log: บันทึกการเข้าถึง/แก้ไขข้อมูลอ่อนไหว (PII)
create table audit_log (
  id            uuid primary key default uuid_generate_v4(),
  actor         uuid references auth.users(id) on delete set null,
  action        text not null,             -- 'view' / 'create' / 'update' / 'delete'
  target_table  text not null,
  target_id     uuid,
  meta          jsonb,
  at            timestamptz not null default now()
);
create index idx_audit_actor  on audit_log(actor);
create index idx_audit_target on audit_log(target_table, target_id);

-- helper: เขียน audit จาก client/edge ได้ (security definer)
create or replace function log_audit(p_action text, p_table text, p_id uuid, p_meta jsonb default null)
returns void
language sql
security definer set search_path = public
as $$
  insert into audit_log (actor, action, target_table, target_id, meta)
  values (auth.uid(), p_action, p_table, p_id, p_meta);
$$;
