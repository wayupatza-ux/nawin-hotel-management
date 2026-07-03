-- seed.sql — ข้อมูลตั้งต้น: 1 สาขา + 4 ประเภทห้อง + ห้องตัวอย่าง (5 ห้อง/ประเภท)
-- รันครั้งเดียวตอนตั้งระบบ (idempotent: ข้ามถ้ามีสาขาแล้ว)

do $$
declare
  v_branch uuid;
begin
  if exists (select 1 from branches) then
    raise notice 'seed skipped: branches already exist';
    return;
  end if;

  insert into branches (name, address, phone)
  values ('นาวิน โฮเทล ดอนเมือง', 'ดอนเมือง กรุงเทพมหานคร', '')
  returning id into v_branch;

  with rt as (
    insert into room_types (branch_id, code, name, base_price, capacity, has_window)
    values
      (v_branch, 'standard_no_window',  'Standard (No Window)',  590, 2, false),
      (v_branch, 'standard',            'Standard',              690, 2, true),
      (v_branch, 'superior_no_window',  'Superior (No Window)',  790, 2, false),
      (v_branch, 'superior',            'Superior',              890, 3, true)
    returning id, code
  )
  insert into rooms (branch_id, room_type_id, room_number, floor, status)
  select
    v_branch,
    rt.id,
    (case rt.code
       when 'standard_no_window' then '1'
       when 'standard'           then '2'
       when 'superior_no_window' then '3'
       when 'superior'           then '4'
     end) || lpad(g::text, 2, '0'),
    (case rt.code
       when 'standard_no_window' then 1
       when 'standard'           then 2
       when 'superior_no_window' then 3
       when 'superior'           then 4
     end),
    'available'
  from rt, generate_series(1, 5) as g;

  raise notice 'seed done: branch %', v_branch;
end $$;
