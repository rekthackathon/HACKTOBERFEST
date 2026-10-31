-- Foundation draft: review and verify on a disposable Supabase database before applying.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.startups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null check (char_length(description) between 1 and 4000),
  industry text not null check (char_length(industry) between 1 and 120),
  country text not null check (country in ('BN','KH','ID','LA','MY','MM','PH','SG','TH','TL','VN')),
  stage text not null check (stage in ('idea','prototype','mvp','growth','scale')),
  incorporation_date date,
  company_size integer check (company_size between 1 and 1000000),
  funding_stage text check (funding_stage in ('bootstrapped','pre_seed','seed','series_a','series_b_plus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 8000),
  kind text not null check (kind in ('grant','accelerator','incubator','hackathon','funding','partnership')),
  countries text[] not null check (
    cardinality(countries) > 0 and countries <@ array['BN','KH','ID','LA','MY','MM','PH','SG','TH','TL','VN']::text[]
  ),
  deadline timestamptz,
  application_url text not null check (application_url ~ '^https://'),
  source_text text not null check (char_length(source_text) between 1 and 100000),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.compiled_requirements (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  model text not null check (char_length(model) > 0),
  compiled_at timestamptz not null default now(),
  completeness text not null check (completeness in ('complete','partial')),
  requirements jsonb not null check (jsonb_typeof(requirements) = 'array' and jsonb_array_length(requirements) <= 100),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array' and jsonb_array_length(warnings) <= 100)
);

-- Never grant TRUNCATE, REFERENCES or TRIGGER to browser-facing roles.
revoke all on public.profiles, public.startups, public.opportunities, public.compiled_requirements from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.startups to authenticated;
grant select on public.opportunities, public.compiled_requirements to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.startups enable row level security;
alter table public.opportunities enable row level security;
alter table public.compiled_requirements enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy startups_select_own on public.startups for select to authenticated using ((select auth.uid()) = owner_id);
create policy startups_insert_own on public.startups for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy startups_update_own on public.startups for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy startups_delete_own on public.startups for delete to authenticated using ((select auth.uid()) = owner_id);

-- Only trusted ingestion/admin processes may write programme facts and model compilations.
create policy opportunities_public_read on public.opportunities for select to anon, authenticated using (true);
create policy compiled_requirements_public_read on public.compiled_requirements for select to anon, authenticated using (true);

create function public.set_startup_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_startup_updated_at() from public, anon, authenticated;
create trigger startups_updated_at before update on public.startups
for each row execute function public.set_startup_updated_at();

commit;
