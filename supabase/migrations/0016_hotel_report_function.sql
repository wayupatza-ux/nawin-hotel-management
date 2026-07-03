-- 0016 — CEO / management reporting RPC
-- Returns branch-scoped KPIs for dashboard reports. The function is security definer
-- but enforces branch access manually before aggregating.

create or replace function get_hotel_report(
  p_date_from date default (current_date - 30),
  p_date_to   date default current_date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_date_from, current_date - 30);
  v_end date := coalesce(p_date_to, current_date);
  v_end_exclusive date;
  v_branch_id uuid := p_branch_id;
  v_days int;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if v_end < v_start then
    raise exception 'invalid_date_range' using errcode = 'P0001';
  end if;

  if v_branch_id is not null and not can_access_branch(v_branch_id) then
    raise exception 'forbidden_branch' using errcode = 'P0001';
  end if;

  if v_branch_id is null and not is_ceo() then
    v_branch_id := auth_branch();
    if v_branch_id is null then
      raise exception 'profile_branch_required' using errcode = 'P0001';
    end if;
  end if;

  v_end_exclusive := v_end + 1;
  v_days := greatest(v_end_exclusive - v_start, 1);

  with scoped_branches as (
    select b.id, b.name
      from branches b
     where b.is_active = true
       and (v_branch_id is null or b.id = v_branch_id)
       and can_access_branch(b.id)
  ),
  room_inventory as (
    select
      count(*)::int as total_rooms,
      count(*) filter (where r.status = 'available')::int as sellable_rooms
      from rooms r
      join scoped_branches sb on sb.id = r.branch_id
  ),
  bookings_in_range as (
    select
      b.*,
      greatest(
        least(b.check_out, v_end_exclusive) - greatest(b.check_in, v_start),
        0
      )::int as overlap_nights
      from bookings b
      join scoped_branches sb on sb.id = b.branch_id
     where daterange(b.check_in, b.check_out, '[)')
           && daterange(v_start, v_end_exclusive, '[)')
  ),
  metrics as (
    select
      count(*)::int as total_bookings,
      count(*) filter (where status = 'pending')::int as pending_bookings,
      count(*) filter (where status in ('confirmed','checked_in'))::int as active_bookings,
      count(*) filter (where status = 'cancelled')::int as cancelled_bookings,
      coalesce(sum(total_amount) filter (where status in ('confirmed','checked_in','checked_out')), 0)::numeric(12,2) as booked_revenue,
      coalesce(sum(overlap_nights) filter (where status in ('confirmed','checked_in','checked_out')), 0)::int as occupied_room_nights,
      coalesce(sum(overlap_nights) filter (where status = 'cancelled'), 0)::int as cancelled_room_nights,
      count(distinct guest_id) filter (where status in ('confirmed','checked_in','checked_out'))::int as unique_guests
      from bookings_in_range
  ),
  repeat_guests as (
    select count(*)::int as repeat_guest_count
      from (
        select b.guest_id
          from bookings b
          join scoped_branches sb on sb.id = b.branch_id
         where b.status in ('confirmed','checked_in','checked_out')
           and b.check_in < v_end_exclusive
         group by b.guest_id
        having count(*) > 1
      ) x
  ),
  source_breakdown as (
    select coalesce(jsonb_agg(item order by item->>'source'), '[]'::jsonb) as rows
      from (
        select jsonb_build_object(
          'source', source,
          'bookings', count(*),
          'revenue', coalesce(sum(total_amount) filter (where status in ('confirmed','checked_in','checked_out')), 0)
        ) as item
        from bookings_in_range
        group by source
      ) s
  ),
  room_type_breakdown as (
    select coalesce(jsonb_agg(item order by item->>'room_type'), '[]'::jsonb) as rows
      from (
        select jsonb_build_object(
          'room_type', rt.name,
          'bookings', count(b.*),
          'revenue', coalesce(sum(b.total_amount) filter (where b.status in ('confirmed','checked_in','checked_out')), 0),
          'occupied_room_nights', coalesce(sum(b.overlap_nights) filter (where b.status in ('confirmed','checked_in','checked_out')), 0)
        ) as item
        from bookings_in_range b
        join room_types rt on rt.id = b.room_type_id
        group by rt.name
      ) r
  ),
  daily_series as (
    select d::date as day
      from generate_series(v_start, v_end, interval '1 day') d
  ),
  daily_report as (
    select coalesce(jsonb_agg(item order by item->>'date'), '[]'::jsonb) as rows
      from (
        select jsonb_build_object(
          'date', ds.day,
          'arrivals', (
            select count(*) from bookings b
            join scoped_branches sb on sb.id = b.branch_id
            where b.check_in = ds.day
              and b.status in ('pending','confirmed','checked_in')
          ),
          'occupied_rooms', (
            select count(*) from bookings b
            join scoped_branches sb on sb.id = b.branch_id
            where b.check_in <= ds.day
              and b.check_out > ds.day
              and b.status in ('confirmed','checked_in')
          ),
          'revenue', (
            select coalesce(sum(b.total_amount), 0) from bookings b
            join scoped_branches sb on sb.id = b.branch_id
            where b.check_in = ds.day
              and b.status in ('confirmed','checked_in','checked_out')
          )
        ) as item
        from daily_series ds
      ) d
  )
  select jsonb_build_object(
    'date_from', v_start,
    'date_to', v_end,
    'branch_id', v_branch_id,
    'branch_scope', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from scoped_branches), '[]'::jsonb),
    'metrics', jsonb_build_object(
      'total_rooms', ri.total_rooms,
      'sellable_rooms', ri.sellable_rooms,
      'available_room_nights', ri.sellable_rooms * v_days,
      'total_bookings', m.total_bookings,
      'pending_bookings', m.pending_bookings,
      'active_bookings', m.active_bookings,
      'cancelled_bookings', m.cancelled_bookings,
      'booked_revenue', m.booked_revenue,
      'occupied_room_nights', m.occupied_room_nights,
      'cancelled_room_nights', m.cancelled_room_nights,
      'occupancy_rate',
        case when ri.sellable_rooms * v_days = 0 then 0
             else round((m.occupied_room_nights::numeric / (ri.sellable_rooms * v_days)) * 100, 2)
        end,
      'adr',
        case when m.occupied_room_nights = 0 then 0
             else round(m.booked_revenue / m.occupied_room_nights, 2)
        end,
      'revpar',
        case when ri.sellable_rooms * v_days = 0 then 0
             else round(m.booked_revenue / (ri.sellable_rooms * v_days), 2)
        end,
      'unique_guests', m.unique_guests,
      'repeat_guest_count', rg.repeat_guest_count
    ),
    'source_breakdown', sb.rows,
    'room_type_breakdown', rt.rows,
    'daily', dr.rows
  )
  into v_result
  from room_inventory ri
  cross join metrics m
  cross join repeat_guests rg
  cross join source_breakdown sb
  cross join room_type_breakdown rt
  cross join daily_report dr;

  return v_result;
end;
$$;

revoke all on function get_hotel_report(date, date, uuid) from public, anon;
grant execute on function get_hotel_report(date, date, uuid) to authenticated;

comment on function get_hotel_report(date, date, uuid) is
  'Branch-aware hotel KPI report for dashboard: occupancy, revenue, ADR, RevPAR, source, room type, and daily trend.';
