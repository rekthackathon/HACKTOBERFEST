-- Curated, real opportunities for the hackathon demo.
-- Sources fetched 2026-10-31 ~04:58 UTC by the DevOps lead. Quotes are copied verbatim from the
-- official pages; source_text is the page's eligibility text with whitespace between sentences
-- normalised. Every evidence quote is an exact substring of its row's source_text.
--
-- Apply once in the Supabase SQL editor (runs as postgres, so it bypasses the no-write RLS on
-- opportunities). Idempotent: re-running does nothing. Remove the fictional demo row if one exists.
-- Deadlines are NULL because none of these pages states a current closing date; the Google 2026
-- intake is already closed, which the description says explicitly.

begin;

insert into public.opportunities (id, title, description, kind, countries, deadline, application_url, source_text, evidence, is_mock)
values
(
  'a5e40000-0000-4000-8000-000000000001',
  'Google for Startups Accelerator: Southeast Asia',
  'Three-month, equity-free accelerator for AI startups headquartered in Southeast Asia, with mentorship and technical support from Google teams. The 2026 application window opened in May 2026 and the cohort runs August to November 2026; check the official page for the next intake.',
  'accelerator',
  array['BN','KH','ID','LA','MY','MM','PH','SG','TH','TL','VN'],
  null,
  'https://startup.google.com/programs/accelerator/southeast-asia/',
  $src$This cohort of Google for Startups Accelerator: Southeast Asia will accept applications from Seed to Series B startups with an AI product headquartered in Southeast Asia. These companies should have AI products solving meaningful problems, launched to market with user traction. Their team should have full time cofounders, stacked tech team with dedicated AI engineers.
The Google for Startups Accelerator: Southeast Asia program is equity-free for all participating startups. Please note that we do require all founders (CEO and CTO) and appropriate team members to be available to join all elements of the program.
The Accelerator's application window opens in May 2026, and selected startups will be notified in early August. The program kicks off in mid-August and aims to graduate the cohort in early November.$src$,
  jsonb_build_array(
    jsonb_build_object(
      'sourceUrl', 'https://startup.google.com/programs/accelerator/southeast-asia/',
      'quote', $q$This cohort of Google for Startups Accelerator: Southeast Asia will accept applications from Seed to Series B startups with an AI product headquartered in Southeast Asia.$q$,
      'locator', 'Frequently asked questions: eligibility',
      'retrievedAt', '2026-10-31T04:58:00Z'),
    jsonb_build_object(
      'sourceUrl', 'https://startup.google.com/programs/accelerator/southeast-asia/',
      'quote', $q$Their team should have full time cofounders, stacked tech team with dedicated AI engineers.$q$,
      'locator', 'Frequently asked questions: eligibility',
      'retrievedAt', '2026-10-31T04:58:00Z'),
    jsonb_build_object(
      'sourceUrl', 'https://startup.google.com/programs/accelerator/southeast-asia/',
      'quote', $q$The Accelerator's application window opens in May 2026, and selected startups will be notified in early August.$q$,
      'locator', 'Frequently asked questions: timeline',
      'retrievedAt', '2026-10-31T04:58:00Z')
  ),
  false
),
(
  'a5e40000-0000-4000-8000-000000000002',
  'Cradle CIP Spark',
  'Ideation-stage conditional grant from Cradle Fund (Malaysia, under MOSTI) for technology-based startups building a functional prototype or MVP. Applications are made through Cradle''s Grant Management System.',
  'grant',
  array['MY'],
  null,
  'https://cradle.com.my/cip-spark/',
  $src$For individuals, the application is open to Malaysians and to non-Malaysians residing in Malaysia. Need to have at least 2 individuals in the application.
For companies (PLT, Enterprise, and Sdn Bhd):
• The company shall not be more than 5 years old, and;
• Accumulated revenue must not exceed RM3 mil;
• For companies with less than 51% of Malaysian ownership, majority of its employees must be Malaysians;
• There shall be no other company/entity holds more than 25% of your company’s share.
• Your company should also own the IP rights, including university and research institute spin-offs.
At least a functional prototype or minimum viable product (MVP) by the end of funding.$src$,
  jsonb_build_array(
    jsonb_build_object(
      'sourceUrl', 'https://cradle.com.my/cip-spark/',
      'quote', $q$The company shall not be more than 5 years old$q$,
      'locator', 'Who can apply: companies',
      'retrievedAt', '2026-10-31T04:58:00Z'),
    jsonb_build_object(
      'sourceUrl', 'https://cradle.com.my/cip-spark/',
      'quote', $q$Accumulated revenue must not exceed RM3 mil$q$,
      'locator', 'Who can apply: companies',
      'retrievedAt', '2026-10-31T04:58:00Z'),
    jsonb_build_object(
      'sourceUrl', 'https://cradle.com.my/cip-spark/',
      'quote', $q$For companies with less than 51% of Malaysian ownership, majority of its employees must be Malaysians$q$,
      'locator', 'Who can apply: companies',
      'retrievedAt', '2026-10-31T04:58:00Z')
  ),
  false
),
(
  'a5e40000-0000-4000-8000-000000000003',
  'Cradle CIP Sprint',
  'Commercialisation conditional grant of up to RM600,000 over a maximum of 18 months from Cradle Fund (Malaysia, under MOSTI) for Sdn Bhd technology companies. Applications are made through Cradle''s Grant Management System.',
  'grant',
  array['MY'],
  null,
  'https://cradle.com.my/cip-sprint/',
  $src$CIP SPRINT is a grant of up to RM600,000 for a maximum duration of eighteen (18) months, covers the commercialization of tech and covers SMEs. CIP SPRINT is open to companies.
The company must be a Sdn Bhd.
The company must be less than seven (7) years old at the point of application.
The accumulated revenue of the company must not be more than RM5 million.
The company must be at least fifty-one percent (51%) Malaysian-owned (or a majority of the employees must be Malaysians if less than 51%).
The company must have the necessary intellectual property rights to its products.
No other company holds 25% or more shareholding in the company.
At least 2 directors (at least one must be Malaysian).
The company must have a minimum paid-up capital of RM10,000.$src$,
  jsonb_build_array(
    jsonb_build_object(
      'sourceUrl', 'https://cradle.com.my/cip-sprint/',
      'quote', $q$The company must be a Sdn Bhd.$q$,
      'locator', 'Criteria: companies',
      'retrievedAt', '2026-10-31T04:58:00Z'),
    jsonb_build_object(
      'sourceUrl', 'https://cradle.com.my/cip-sprint/',
      'quote', $q$The company must be less than seven (7) years old at the point of application.$q$,
      'locator', 'Criteria: companies',
      'retrievedAt', '2026-10-31T04:58:00Z'),
    jsonb_build_object(
      'sourceUrl', 'https://cradle.com.my/cip-sprint/',
      'quote', $q$The accumulated revenue of the company must not be more than RM5 million.$q$,
      'locator', 'Criteria: companies',
      'retrievedAt', '2026-10-31T04:58:00Z'),
    jsonb_build_object(
      'sourceUrl', 'https://cradle.com.my/cip-sprint/',
      'quote', $q$The company must be at least fifty-one percent (51%) Malaysian-owned (or a majority of the employees must be Malaysians if less than 51%).$q$,
      'locator', 'Criteria: companies',
      'retrievedAt', '2026-10-31T04:58:00Z')
  ),
  false
)
on conflict (id) do nothing;

commit;
