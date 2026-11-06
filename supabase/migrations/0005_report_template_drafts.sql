-- Editable v2 drafts are separate from immutable, published report template versions.
create table public.report_template_drafts (
  draft_key  text primary key default 'active' check (draft_key = 'active'),
  config     jsonb not null
    check (jsonb_typeof(config) = 'object' and config ->> 'schemaVersion' = '2'),
  updated_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.report_template_drafts to authenticated;

alter table public.report_template_drafts enable row level security;

create policy report_template_drafts_select on public.report_template_drafts for select to authenticated
  using ((select private.is_gm()));
create policy report_template_drafts_insert on public.report_template_drafts for insert to authenticated
  with check ((select private.is_gm()) and updated_by = (select auth.uid()));
create policy report_template_drafts_update on public.report_template_drafts for update to authenticated
  using ((select private.is_gm()))
  with check ((select private.is_gm()) and updated_by = (select auth.uid()));
create policy report_template_drafts_delete on public.report_template_drafts for delete to authenticated
  using ((select private.is_gm()));

-- Publishing a v2 document and clearing its saved draft are one transaction.
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
  select coalesce(max(t.version), 0) + 1 into v_version
  from public.report_templates t
  where t.name = p_name;

  update public.report_templates set is_active = false where is_active;
  insert into public.report_templates (name, version, config, is_active)
  values (p_name, v_version, p_config, true)
  returning id into v_id;

  if p_config ->> 'schemaVersion' = '2' then
    delete from public.report_template_drafts where draft_key = 'active';
  end if;

  return v_id;
end;
$$;
