-- Structured product/team facts for deterministic accelerator matching.
begin;

alter table public.startups
  add column if not exists has_ai_product text not null default 'unknown'
    check (has_ai_product in ('yes', 'no', 'unknown')),
  add column if not exists has_full_time_cofounders text not null default 'unknown'
    check (has_full_time_cofounders in ('yes', 'no', 'unknown')),
  add column if not exists has_dedicated_ai_engineers text not null default 'unknown'
    check (has_dedicated_ai_engineers in ('yes', 'no', 'unknown'));

alter table public.startups drop constraint if exists startups_funding_stage_check;
alter table public.startups add constraint startups_funding_stage_check
  check (funding_stage in ('bootstrapped','pre_seed','seed','series_a','series_b','series_b_plus'));

comment on column public.startups.has_ai_product is 'yes, no, or unknown; never infer from industry or description.';
comment on column public.startups.has_full_time_cofounders is 'yes, no, or unknown; never infer from total team size.';
comment on column public.startups.has_dedicated_ai_engineers is 'yes, no, or unknown; never infer from total team size or description.';

commit;
