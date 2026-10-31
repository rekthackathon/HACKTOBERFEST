-- Migration: Create applications table
begin;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  startup_id uuid not null references public.startups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cover_letter text not null check (char_length(cover_letter) between 1 and 10000),
  additional_info text,
  created_at timestamptz not null default now(),

  -- Ensure a startup can only apply to a specific opportunity once
  constraint unique_startup_opportunity unique (startup_id, opportunity_id)
);

-- Security: RLS
alter table public.applications enable row level security;

-- Users can see their own applications
create policy applications_select_own on public.applications
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Users can submit their own applications
create policy applications_insert_own on public.applications
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

commit;
