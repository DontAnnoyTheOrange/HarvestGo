-- =====================================================================
-- HarvestGo - Migration 0001: core schema, RLS policies, storage
-- Target: Supabase (PostgreSQL). Do NOT run yet - we run it together
-- during the implementation phase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. A private schema for helper functions (not exposed by Supabase's API)
-- ---------------------------------------------------------------------
create schema if not exists private;

-- ---------------------------------------------------------------------
-- 1. Fixed-choice lists ("enums")
-- ---------------------------------------------------------------------
create type public.user_role      as enum ('general_manager', 'administrative_staff');
create type public.quantity_unit  as enum ('kg', 'g', 'pcs');
create type public.sale_type      as enum ('raw', 'value_added');
create type public.service_type   as enum ('training', 'technical_assistance', 'iec_distribution', 'others');
create type public.record_status  as enum ('active', 'archived');
create type public.document_kind  as enum ('photo', 'supporting_document');

-- Keeps updated_at honest on every edit
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. USERS: profiles (FR-AUTH-002, FR-ADMIN-001)
--    Passwords live in Supabase Auth (auth.users), NOT here.
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) between 2 and 100),
  role        public.user_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Helper "badge checkers" used by the security rules (RLS)
create function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create function private.is_gm() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'general_manager'
  );
$$;

revoke all on function private.is_active_user() from public;
revoke all on function private.is_gm() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_user(), private.is_gm() to authenticated;

-- ---------------------------------------------------------------------
-- 3. REFERENCE LISTS
-- ---------------------------------------------------------------------
-- The six product groups printed on the ATI form (sections A-D)
create table public.crop_categories (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0
);

-- The specific crops/products (Mushroom, Okra, Avocado ...). Managed by the GM.
create table public.crops (
  id           uuid primary key default gen_random_uuid(),
  category_id  smallint not null references public.crop_categories (id),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index crops_category_name_uq on public.crops (category_id, lower(btrim(name)));

-- Types of participants printed in the form footnote (11 types)
create table public.participant_types (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true
);

-- ---------------------------------------------------------------------
-- 4. HARVEST, EXPENSES, SALES (ATI form sections A, B, C, D)
-- ---------------------------------------------------------------------
create table public.harvest_records (
  id            uuid primary key default gen_random_uuid(),
  crop_id       uuid not null references public.crops (id),
  harvest_date  date not null,
  quantity      numeric(12,3) not null check (quantity > 0),
  unit          public.quantity_unit not null default 'kg',
  notes         text check (char_length(notes) <= 1000),
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  crop_id       uuid not null references public.crops (id),
  expense_date  date not null,
  description   text not null check (char_length(btrim(description)) between 1 and 200),
  amount        numeric(12,2) not null check (amount > 0),
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.sales_records (
  id            uuid primary key default gen_random_uuid(),
  crop_id       uuid not null references public.crops (id),
  sale_date     date not null,
  sale_type     public.sale_type not null,
  product_name  text check (char_length(btrim(product_name)) between 1 and 100),
  quantity      numeric(12,3) check (quantity > 0),
  unit          public.quantity_unit,
  amount        numeric(12,2) not null check (amount >= 0),
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- a value-added sale (e.g. Mushroom Chips) must say what the product is
  constraint value_added_needs_product check (sale_type = 'raw' or product_name is not null),
  -- quantity and unit travel together
  constraint quantity_and_unit_together check ((quantity is null) = (unit is null))
);

-- ---------------------------------------------------------------------
-- 5. SERVICES RENDERED / TRAININGS (ATI form "Services Rendered" table)
-- ---------------------------------------------------------------------
create table public.service_activities (
  id             uuid primary key default gen_random_uuid(),
  service_type   public.service_type not null,
  title          text not null check (char_length(btrim(title)) between 3 and 150),
  activity_date  date not null,
  description    text check (char_length(description) <= 2000),
  scope          text check (char_length(scope) <= 300),
  status         public.record_status not null default 'active',
  created_by     uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Head-counts only (no names): how many males/females of each participant type
create table public.activity_attendance (
  id                   uuid primary key default gen_random_uuid(),
  activity_id          uuid not null references public.service_activities (id) on delete cascade,
  participant_type_id  smallint not null references public.participant_types (id),
  male_count           integer not null default 0 check (male_count >= 0),
  female_count         integer not null default 0 check (female_count >= 0),
  unique (activity_id, participant_type_id)
);

-- ---------------------------------------------------------------------
-- 6. PROBLEMS / ACTIONS / RECOMMENDATIONS (ATI form section E)
-- ---------------------------------------------------------------------
create table public.operational_issues (
  id              uuid primary key default gen_random_uuid(),
  issue_date      date not null,
  problem         text not null check (char_length(btrim(problem)) between 3 and 1000),
  action_taken    text check (char_length(action_taken) <= 1000),
  recommendation  text check (char_length(recommendation) <= 1000),
  crop_id         uuid references public.crops (id),
  activity_id     uuid references public.service_activities (id) on delete set null,
  created_by      uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. SUPPORTING DOCUMENTS AND PHOTOS (ATI form section G)
--    The file itself lives in Supabase Storage; this row describes it.
-- ---------------------------------------------------------------------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  kind           public.document_kind not null,
  storage_path   text not null unique,
  original_name  text not null check (char_length(original_name) between 1 and 200),
  mime_type      text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes     integer not null check (size_bytes between 1 and 5242880),
  caption        text check (char_length(caption) <= 300),
  document_date  date not null default current_date,
  activity_id    uuid references public.service_activities (id) on delete set null,
  uploaded_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  constraint photos_are_images check (kind <> 'photo' or mime_type in ('image/jpeg', 'image/png'))
);

-- ---------------------------------------------------------------------
-- 8. REPORT TEMPLATES, REPORTS, REPORT PHOTOS (FR-REPORT-001..004)
-- ---------------------------------------------------------------------
create table public.report_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  version     integer not null check (version > 0),
  config      jsonb not null check (jsonb_typeof(config) = 'object'),
  is_active   boolean not null default false,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (name, version)
);
-- Only ONE template can be active at a time
create unique index report_templates_one_active on public.report_templates (is_active) where is_active;

-- A template's content never changes after it is saved; edits create a new version
create function private.forbid_template_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.config is distinct from old.config
     or new.version is distinct from old.version
     or new.name is distinct from old.name then
    raise exception 'Template content cannot be edited. Create a new version instead.';
  end if;
  return new;
end $$;
create trigger forbid_template_change before update on public.report_templates
  for each row execute function private.forbid_template_change();

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  period_year      smallint not null check (period_year between 2020 and 2100),
  period_quarter   smallint not null check (period_quarter between 1 and 4),
  template_id      uuid not null references public.report_templates (id),
  file_name        text not null,
  storage_path     text not null unique,
  size_bytes       integer check (size_bytes > 0),
  generated_by     uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  generated_at     timestamptz not null default now()
);

create table public.report_documents (
  report_id    uuid not null references public.reports (id) on delete cascade,
  document_id  uuid not null references public.documents (id) on delete cascade,
  sort_order   smallint not null default 0,
  primary key (report_id, document_id)
);

-- ---------------------------------------------------------------------
-- 9. INDEXES (speed up the searches the app actually does)
-- ---------------------------------------------------------------------
create index crops_category_idx          on public.crops (category_id);
create index harvest_crop_date_idx       on public.harvest_records (crop_id, harvest_date);
create index harvest_date_idx            on public.harvest_records (harvest_date);
create index expenses_crop_date_idx      on public.expenses (crop_id, expense_date);
create index expenses_date_idx           on public.expenses (expense_date);
create index sales_crop_date_idx         on public.sales_records (crop_id, sale_date);
create index sales_date_idx              on public.sales_records (sale_date);
create index activities_date_idx         on public.service_activities (activity_date);
create index activities_type_idx         on public.service_activities (service_type);
create index attendance_activity_idx     on public.activity_attendance (activity_id);
create index issues_date_idx             on public.operational_issues (issue_date);
create index documents_activity_idx      on public.documents (activity_id);
create index documents_date_idx          on public.documents (document_date);
create index reports_period_idx          on public.reports (period_year, period_quarter);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','crops','harvest_records','expenses','sales_records',
                           'service_activities','operational_issues'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. STARTER DATA (only what the official form defines)
-- ---------------------------------------------------------------------
insert into public.crop_categories (name, sort_order) values
  ('Rice', 1), ('Vegetables', 2), ('Fruits', 3), ('Poultry', 4), ('Livestock', 5), ('Others', 6);

insert into public.participant_types (name, sort_order) values
  ('Farmers', 1), ('Farm Youth (13-30 years old and single)', 2), ('LGU AEWs', 3),
  ('LGU Officials', 4), ('Agency personnel', 5), ('NGOs', 6), ('Private Groups', 7),
  ('SUC Personnel', 8), ('Students', 9), ('Tourists', 10), ('Others', 11);

-- ---------------------------------------------------------------------
-- 11. ROW-LEVEL SECURITY (RLS) - the locks on every drawer
-- ---------------------------------------------------------------------
-- Make sure EVERY table in public has RLS switched on
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Table permissions (RLS then decides which ROWS are allowed)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- profiles: any active user can read names/roles; only the GM edits.
-- No insert/delete policy: accounts are created by the server's admin module only.
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.is_active_user()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select private.is_gm()))
  with check (
    (select private.is_gm())
    -- a GM cannot demote or deactivate their own account (prevents lock-out)
    and (id <> (select auth.uid()) or (role = 'general_manager' and is_active))
  );

-- Reference lists: everyone active reads; GM manages crops and participant types.
-- crop_categories are fixed by the official form (changed only by a migration).
create policy crop_categories_select on public.crop_categories for select to authenticated
  using ((select private.is_active_user()));

create policy crops_select on public.crops for select to authenticated
  using ((select private.is_active_user()));
create policy crops_insert on public.crops for insert to authenticated
  with check ((select private.is_gm()));
create policy crops_update on public.crops for update to authenticated
  using ((select private.is_gm())) with check ((select private.is_gm()));

create policy participant_types_select on public.participant_types for select to authenticated
  using ((select private.is_active_user()));
create policy participant_types_insert on public.participant_types for insert to authenticated
  with check ((select private.is_gm()));
create policy participant_types_update on public.participant_types for update to authenticated
  using ((select private.is_gm())) with check ((select private.is_gm()));

-- Operational records (same four rules for each of the five tables):
--   read   : any active user
--   add    : any active user, and the record must be stamped with THEIR id
--   edit   : the GM (any record) or the person who created it
--   delete : GM only
do $$
declare t text;
begin
  foreach t in array array['harvest_records','expenses','sales_records',
                           'service_activities','operational_issues'] loop
    execute format($p$create policy %1$s_select on public.%1$s for select to authenticated
      using ((select private.is_active_user()))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$s for insert to authenticated
      with check ((select private.is_active_user()) and created_by = (select auth.uid()))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$s for update to authenticated
      using ((select private.is_gm()) or ((select private.is_active_user()) and created_by = (select auth.uid())))
      with check ((select private.is_gm()) or ((select private.is_active_user()) and created_by = (select auth.uid())))$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$s for delete to authenticated
      using ((select private.is_gm()))$p$, t);
  end loop;
end $$;

-- Attendance counts follow the activity they belong to.
-- Staff correct a mistake by changing the number (e.g. to 0); removing a row is GM-only.
create policy attendance_select on public.activity_attendance for select to authenticated
  using ((select private.is_active_user()));
create policy attendance_insert on public.activity_attendance for insert to authenticated
  with check (exists (select 1 from public.service_activities a
    where a.id = activity_id and ((select private.is_gm()) or a.created_by = (select auth.uid()))));
create policy attendance_update on public.activity_attendance for update to authenticated
  using (exists (select 1 from public.service_activities a
    where a.id = activity_id and ((select private.is_gm()) or a.created_by = (select auth.uid()))))
  with check (exists (select 1 from public.service_activities a
    where a.id = activity_id and ((select private.is_gm()) or a.created_by = (select auth.uid()))));
create policy attendance_delete on public.activity_attendance for delete to authenticated
  using ((select private.is_gm()));

-- Documents: any active user uploads/reads; uploader or GM edits the caption; GM deletes.
create policy documents_select on public.documents for select to authenticated
  using ((select private.is_active_user()));
create policy documents_insert on public.documents for insert to authenticated
  with check ((select private.is_active_user()) and uploaded_by = (select auth.uid()));
create policy documents_update on public.documents for update to authenticated
  using ((select private.is_gm()) or ((select private.is_active_user()) and uploaded_by = (select auth.uid())))
  with check ((select private.is_gm()) or ((select private.is_active_user()) and uploaded_by = (select auth.uid())));
create policy documents_delete on public.documents for delete to authenticated
  using ((select private.is_gm()));

-- Templates: everyone active can READ (the report generator needs it); only the GM changes them.
-- Deleting templates is not allowed (old reports point to them).
create policy templates_select on public.report_templates for select to authenticated
  using ((select private.is_active_user()));
create policy templates_insert on public.report_templates for insert to authenticated
  with check ((select private.is_gm()));
create policy templates_update on public.report_templates for update to authenticated
  using ((select private.is_gm())) with check ((select private.is_gm()));

-- Reports: any active user generates/reads; GM deletes. Nobody edits a finished report.
create policy reports_select on public.reports for select to authenticated
  using ((select private.is_active_user()));
create policy reports_insert on public.reports for insert to authenticated
  with check ((select private.is_active_user()) and generated_by = (select auth.uid()));
create policy reports_delete on public.reports for delete to authenticated
  using ((select private.is_gm()));

create policy report_documents_select on public.report_documents for select to authenticated
  using ((select private.is_active_user()));
create policy report_documents_insert on public.report_documents for insert to authenticated
  with check (exists (select 1 from public.reports r
    where r.id = report_id and r.generated_by = (select auth.uid())));

-- ---------------------------------------------------------------------
-- 12. STORAGE: three PRIVATE buckets + rules
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('harvestgo-documents',       'harvestgo-documents',       false, 5242880,  array['application/pdf','image/jpeg','image/png']),
  ('harvestgo-reports',         'harvestgo-reports',         false, 20971520, array['application/pdf']),
  ('harvestgo-template-assets', 'harvestgo-template-assets', false, 1048576,  array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy documents_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'harvestgo-documents' and (select private.is_active_user()));
create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'harvestgo-documents' and (select private.is_active_user()));
create policy documents_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'harvestgo-documents' and (select private.is_gm()));

create policy reports_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'harvestgo-reports' and (select private.is_active_user()));
create policy reports_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'harvestgo-reports' and (select private.is_active_user()));
create policy reports_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'harvestgo-reports' and (select private.is_gm()));

create policy template_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'harvestgo-template-assets' and (select private.is_active_user()));
create policy template_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'harvestgo-template-assets' and (select private.is_gm()));
create policy template_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'harvestgo-template-assets' and (select private.is_gm()))
  with check (bucket_id = 'harvestgo-template-assets' and (select private.is_gm()));
create policy template_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'harvestgo-template-assets' and (select private.is_gm()));
