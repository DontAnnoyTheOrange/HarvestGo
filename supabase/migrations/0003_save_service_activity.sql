-- =====================================================================
-- HarvestGo - Migration 0003: save a service activity AND its head-counts together
-- Run in Supabase: SQL Editor > New query > paste > Run.
-- It only ADDS one function. It does not touch any table or data.
--
-- Why a function? Saving an activity takes two steps (the activity, then its
-- male/female counts). If the computer crashed between the steps you would
-- be left with half the numbers. A database function is ALL-OR-NOTHING:
-- if any part fails, nothing at all is saved.
--
-- "security invoker" = it runs AS the logged-in person, so the security
-- rules (RLS) still apply: Staff can only change their own activities.
-- Counts are never deleted here; to correct a mistake you save 0 (upsert).
-- =====================================================================
create or replace function public.save_service_activity(
  p_id            uuid,                 -- null = create a new activity
  p_service_type  public.service_type,
  p_title         text,
  p_activity_date date,
  p_description   text,
  p_scope         text,
  p_attendance    jsonb                 -- [{"participantTypeId": 1, "male": 3, "female": 5}, ...]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.service_activities (service_type, title, activity_date, description, scope)
    values (p_service_type, p_title, p_activity_date, p_description, p_scope)
    returning id into v_id;                -- created_by is stamped automatically with the caller's id
  else
    update public.service_activities
       set service_type = p_service_type, title = p_title, activity_date = p_activity_date,
           description = p_description, scope = p_scope
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'ACTIVITY_NOT_FOUND_OR_FORBIDDEN';   -- missing, or the security rules said no
    end if;
  end if;

  insert into public.activity_attendance (activity_id, participant_type_id, male_count, female_count)
  select v_id,
         (e ->> 'participantTypeId')::smallint,
         (e ->> 'male')::integer,
         (e ->> 'female')::integer
    from jsonb_array_elements(coalesce(p_attendance, '[]'::jsonb)) as e
  on conflict (activity_id, participant_type_id)
  do update set male_count = excluded.male_count, female_count = excluded.female_count;

  return v_id;
end;
$$;

revoke all on function public.save_service_activity(uuid, public.service_type, text, date, text, text, jsonb) from public;
revoke all on function public.save_service_activity(uuid, public.service_type, text, date, text, text, jsonb) from anon;
grant execute on function public.save_service_activity(uuid, public.service_type, text, date, text, text, jsonb) to authenticated;