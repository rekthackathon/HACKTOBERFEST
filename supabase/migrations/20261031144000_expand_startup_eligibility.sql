-- Add nullable eligibility facts without changing existing ownership or RLS policies.
begin;

alter table public.startups
  add column if not exists accumulated_revenue_myr numeric(20,2)
    check (accumulated_revenue_myr >= 0),
  add column if not exists malaysian_ownership_percent numeric(5,2)
    check (malaysian_ownership_percent between 0 and 100),
  add column if not exists malaysian_employee_percent numeric(5,2)
    check (malaysian_employee_percent between 0 and 100),
  add column if not exists largest_external_entity_shareholding_percent numeric(5,2)
    check (largest_external_entity_shareholding_percent between 0 and 100),
  add column if not exists owns_required_ip_rights text not null default 'unknown'
    check (owns_required_ip_rights in ('yes', 'no', 'unknown')),
  add column if not exists application_participant_count integer
    check (application_participant_count between 1 and 1000000);

comment on column public.startups.accumulated_revenue_myr is 'Accumulated company revenue in MYR; null means unknown.';
comment on column public.startups.malaysian_ownership_percent is 'Malaysian ownership percentage; null means unknown.';
comment on column public.startups.malaysian_employee_percent is 'Percentage of employees who are Malaysian; null means unknown.';
comment on column public.startups.largest_external_entity_shareholding_percent is 'Largest external company/entity shareholding percentage; null means unknown.';
comment on column public.startups.owns_required_ip_rights is 'yes, no, or unknown; never infer unknown as false.';
comment on column public.startups.application_participant_count is 'Individuals participating in this application; null means unknown.';

commit;
