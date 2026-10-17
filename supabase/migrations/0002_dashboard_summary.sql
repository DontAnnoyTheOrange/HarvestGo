-- =====================================================================
-- HarvestGo - Migration 0002: dashboard / quarter totals
-- Run in Supabase: SQL Editor > New query > paste > Run.
-- It only ADDS one function. It does not touch any table or data.
--
-- "security invoker" = the function runs AS the logged-in person, so the
-- database's security rules (RLS) still apply to every row it adds up.
-- =====================================================================
create or replace function public.dashboard_summary(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'harvest_kg',
      coalesce((select sum(case h.unit when 'kg' then h.quantity when 'g' then h.quantity / 1000 end)
                from public.harvest_records h
                where h.harvest_date between p_from and p_to and h.unit in ('kg', 'g')), 0),
    'harvest_pcs',
      coalesce((select sum(h.quantity) from public.harvest_records h
                where h.harvest_date between p_from and p_to and h.unit = 'pcs'), 0),
    'harvest_records',
      (select count(*) from public.harvest_records h where h.harvest_date between p_from and p_to),
    'sales_raw',
      coalesce((select sum(s.amount) from public.sales_records s
                where s.sale_date between p_from and p_to and s.sale_type = 'raw'), 0),
    'sales_value_added',
      coalesce((select sum(s.amount) from public.sales_records s
                where s.sale_date between p_from and p_to and s.sale_type = 'value_added'), 0),
    'expenses_total',
      coalesce((select sum(e.amount) from public.expenses e
                where e.expense_date between p_from and p_to), 0)
  );
$$;

-- Only logged-in people may call it (never anonymous visitors).
revoke all on function public.dashboard_summary(date, date) from public;
revoke all on function public.dashboard_summary(date, date) from anon;
grant execute on function public.dashboard_summary(date, date) to authenticated;