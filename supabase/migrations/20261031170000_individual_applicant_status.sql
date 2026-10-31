begin;

alter table public.startups
  add column if not exists individual_applicant_status text not null default 'unknown'
    check (individual_applicant_status in ('eligible', 'ineligible', 'not_applicable', 'unknown'));

comment on column public.startups.individual_applicant_status is
  'Explicit answer for programmes with individual applicant residency rules; not_applicable means applying as a company.';

commit;
