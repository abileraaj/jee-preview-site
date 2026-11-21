-- Sample data for phase 1. Safe to run more than once.
-- Sample students and the sample full mock arrive with phases 2 and 3,
-- when the tools that create them exist.

insert into public.subjects (name, sort_order) values
  ('Physics', 1), ('Chemistry', 2), ('Mathematics', 3)
on conflict (name) do nothing;

-- Prices below are placeholders. Change them before the paid launch.
insert into public.plans (id, name, description, price_paise, gst_percent, validity_type, valid_days, sort_order)
values
  ('11111111-1111-4111-8111-111111111111', 'Full Test Series',
   'All full-length mock tests with complete analysis', 99900, 18, 'days', 180, 1),
  ('22222222-2222-4222-8222-222222222222', 'Chapter Tests',
   'All chapter-wise tests with complete analysis', 49900, 18, 'days', 180, 2)
on conflict (id) do nothing;

insert into public.plan_access (id, plan_id, test_type) values
  ('aaaaaaa1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'full'),
  ('aaaaaaa1-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'pyq'),
  ('aaaaaaa1-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'chapter')
on conflict (id) do nothing;

insert into public.coupons (code, kind, value, max_uses)
values ('PILOT50', 'percent', 50, 100)
on conflict (code) do nothing;
