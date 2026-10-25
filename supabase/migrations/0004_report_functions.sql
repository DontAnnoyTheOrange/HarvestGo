-- =====================================================================
-- HarvestGo - Migration 0004: report functions
-- Run in Supabase: SQL Editor > New query > paste > Run.
-- It only ADDS two functions. It does not touch any table or data.
--
-- Both run "security invoker" = AS the logged-in person, so the security
-- rules (RLS) still apply to every row they read or write.
-- =====================================================================

-- 1) report_quarter_data: adds up one quarter for the ATI Quarterly Accomplishment Report.
--    Archived activities still count (the SRS keeps them available to reports).
create or replace function public.report_quarter_data(p_year integer, p_quarter integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_from date;
  v_to   date;
begin
  if p_quarter is null or p_quarter not between 1 and 4 or p_year is null or p_year not between 2020 and 2100 then
    raise exception 'INVALID_PERIOD';
  end if;
  v_from := make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
  v_to   := (v_from + interval '3 months' - interval '1 day')::date;

  return jsonb_build_object(
    'from', v_from,
    'to',   v_to,

    -- the six product groups printed across the top of sections A to D
    'categories', (
      select coalesce(jsonb_agg(c.name order by c.sort_order), '[]'::jsonb) from public.crop_categories c
    ),

    -- Services Rendered: one entry per kind of service that happened this quarter
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'serviceType', s.service_type, 'activities', s.activities, 'titles', s.titles,
               'male', s.male, 'female', s.female) order by s.ord), '[]'::jsonb)
      from (
        select a.service_type::text as service_type,
               case a.service_type when 'training' then 1 when 'technical_assistance' then 2
                                   when 'iec_distribution' then 3 else 4 end as ord,
               count(*)::int as activities,
               jsonb_agg(a.title order by a.activity_date, a.created_at) as titles,
               coalesce(sum(att.male), 0)::int as male,
               coalesce(sum(att.female), 0)::int as female
          from public.service_activities a
          left join lateral (
                 select sum(t.male_count) as male, sum(t.female_count) as female
                   from public.activity_attendance t where t.activity_id = a.id) att on true
         where a.activity_date between v_from and v_to
         group by a.service_type
      ) s
    ),

    -- which participant types actually attended something this quarter
    'participantTypes', (
      select coalesce(jsonb_agg(pt.name order by pt.sort_order), '[]'::jsonb)
        from public.participant_types pt
       where exists (
         select 1 from public.activity_attendance t
           join public.service_activities a on a.id = t.activity_id
          where t.participant_type_id = pt.id
            and a.activity_date between v_from and v_to
            and (t.male_count + t.female_count) > 0)
    ),

    -- A. Production data (yield): grams are turned into kilograms; pieces stay pieces
    'yield', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'category', y.category, 'crop', y.crop, 'kg', y.kg, 'pcs', y.pcs)
               order by y.cat_order, y.crop), '[]'::jsonb)
      from (
        select cc.name as category, cc.sort_order as cat_order, c.name as crop,
               coalesce(sum(case h.unit when 'kg' then h.quantity when 'g' then h.quantity / 1000 end), 0) as kg,
               coalesce(sum(case when h.unit = 'pcs' then h.quantity end), 0) as pcs
          from public.harvest_records h
          join public.crops c on c.id = h.crop_id
          join public.crop_categories cc on cc.id = c.category_id
         where h.harvest_date between v_from and v_to
         group by cc.name, cc.sort_order, c.name
      ) y
    ),

    -- B. Cost of production: expenses added up per crop
    'cost', (
      select coalesce(jsonb_agg(jsonb_build_object('category', k.category, 'label', k.crop, 'amount', k.amount)
               order by k.cat_order, k.crop), '[]'::jsonb)
      from (
        select cc.name as category, cc.sort_order as cat_order, c.name as crop, sum(e.amount) as amount
          from public.expenses e
          join public.crops c on c.id = e.crop_id
          join public.crop_categories cc on cc.id = c.category_id
         where e.expense_date between v_from and v_to
         group by cc.name, cc.sort_order, c.name
      ) k
    ),

    -- C. Production sales: RAW produce sales per crop
    'sales', (
      select coalesce(jsonb_agg(jsonb_build_object('category', k.category, 'label', k.crop, 'amount', k.amount)
               order by k.cat_order, k.crop), '[]'::jsonb)
      from (
        select cc.name as category, cc.sort_order as cat_order, c.name as crop, sum(s.amount) as amount
          from public.sales_records s
          join public.crops c on c.id = s.crop_id
          join public.crop_categories cc on cc.id = c.category_id
         where s.sale_date between v_from and v_to and s.sale_type = 'raw'
         group by cc.name, cc.sort_order, c.name
      ) k
    ),

    -- D. Production income: ALL sales per product line (raw under the crop name, value-added under its product name)
    'income', (
      select coalesce(jsonb_agg(jsonb_build_object('category', k.category, 'label', k.label, 'amount', k.amount)
               order by k.cat_order, k.label), '[]'::jsonb)
      from (
        select cc.name as category, cc.sort_order as cat_order,
               case when s.sale_type = 'value_added' then s.product_name else c.name end as label,
               sum(s.amount) as amount
          from public.sales_records s
          join public.crops c on c.id = s.crop_id
          join public.crop_categories cc on cc.id = c.category_id
         where s.sale_date between v_from and v_to
         group by cc.name, cc.sort_order, case when s.sale_type = 'value_added' then s.product_name else c.name end
      ) k
    ),

    -- E. Problems, actions taken, recommendations
    'issues', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', i.issue_date, 'problem', i.problem,
               'actionTaken', i.action_taken, 'recommendation', i.recommendation)
               order by i.issue_date, i.created_at), '[]'::jsonb)
        from public.operational_issues i
       where i.issue_date between v_from and v_to
    )
  );
end;
$$;

revoke all on function public.report_quarter_data(integer, integer) from public;
revoke all on function public.report_quarter_data(integer, integer) from anon;
grant execute on function public.report_quarter_data(integer, integer) to authenticated;

-- 2) install_report_template: saves a NEW version of a template and makes it the only active one.
--    All-or-nothing. Only the General Manager can do it (the template rules refuse everyone else,
--    and then nothing at all is changed). Used for "set up the official template" and, later, the template editor.
create or replace function public.install_report_template(p_name text, p_config jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version integer;
  v_id uuid;
begin
  select coalesce(max(t.version), 0) + 1 into v_version from public.report_templates t where t.name = p_name;
  update public.report_templates set is_active = false where is_active;
  insert into public.report_templates (name, version, config, is_active)
  values (p_name, v_version, p_config, true)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.install_report_template(text, jsonb) from public;
revoke all on function public.install_report_template(text, jsonb) from anon;
grant execute on function public.install_report_template(text, jsonb) to authenticated;