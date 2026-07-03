-- 0011 — โครงสร้างรองรับ LINE Edge Functions
-- หมายเหตุ: ไฟล์นี้ "ไม่มี" ค่า secret จริงอยู่เลย (ปลอดภัยต่อการ commit)
-- ค่า secret จริง (line_channel_secret, line_channel_access_token,
-- internal_functions_secret) ถูกเก็บใน Supabase Vault ผ่านคำสั่ง SQL แยกต่างหาก
-- ที่ไม่ commit เข้า repo — ดูวิธีตั้งค่าใน HANDOFF.md

create extension if not exists pg_net;

-- กันประมวลผล LINE webhook event ซ้ำ (LINE อาจส่ง event เดิมซ้ำได้)
create table line_webhook_events (
  event_id     text primary key,
  received_at  timestamptz not null default now()
);
alter table line_webhook_events enable row level security;
-- ไม่เปิด policy ใดๆ ให้ anon/authenticated — เข้าถึงได้เฉพาะผ่าน service_role (Edge Function) เท่านั้น

-- ให้ Edge Function (ซึ่งเรียกผ่าน service_role) ดึง secret จาก Vault ได้แบบปลอดภัย
create or replace function get_secret(p_name text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

revoke all on function get_secret(text) from public, anon, authenticated;
grant execute on function get_secret(text) to service_role;

-- Trigger: เมื่อ booking เปลี่ยนสถานะเป็น 'confirmed' → เรียก Edge Function line-notify
-- (อ่าน internal_functions_secret จาก Vault ตรงๆ เพราะรันในบริบท security definer อยู่แล้ว)
create or replace function notify_booking_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_internal_secret text;
  v_url text := 'https://loxhiqsutuboxyllmysw.supabase.co/functions/v1/line-notify';
begin
  if (tg_op = 'INSERT' and new.status = 'confirmed')
     or (tg_op = 'UPDATE' and new.status = 'confirmed' and old.status is distinct from 'confirmed') then

    select decrypted_secret into v_internal_secret
      from vault.decrypted_secrets where name = 'internal_functions_secret';

    if v_internal_secret is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_internal_secret
        ),
        body := jsonb_build_object('booking_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_notify_booking_confirmed
  after insert or update on bookings
  for each row execute function notify_booking_confirmed();
