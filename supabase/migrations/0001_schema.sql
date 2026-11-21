-- =====================================================================
-- JEE Main Test Series platform: full schema (phase 1)
-- Run once in Supabase: SQL Editor -> paste -> Run.
-- Money is stored in paise (integer). Times are timestamptz (UTC).
-- =====================================================================

-- ---------- helpers ---------------------------------------------------

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text,
  email               text,
  mobile              text,
  class_year          text check (class_year in ('11', '12', 'dropper')),
  state               text,
  role                text not null default 'student' check (role in ('student', 'faculty', 'admin')),
  is_minor            boolean,
  guardian_name       text,
  guardian_mobile     text,
  guardian_consent_at timestamptz,
  onboarded_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- Role of the logged-in user. SECURITY DEFINER so policies on profiles
-- can call it without recursing into themselves.
create function public.my_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.my_role() in ('faculty', 'admin'), false) $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- Create a profile row automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A logged-in user may edit their own profile but may never change their
-- own role. Only an admin (or the SQL editor / service key) can.
create function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin can change a role';
  end if;
  return new;
end $$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------- people and access ----------------------------------------

create table public.active_sessions (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  device_id    text not null,
  last_seen_at timestamptz not null default now()
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);

-- ---------- plans and payments ---------------------------------------

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price_paise   integer not null check (price_paise >= 0),
  gst_percent   numeric(5, 2) not null default 0,
  validity_type text not null check (validity_type in ('fixed_date', 'days')),
  valid_until   date,
  valid_days    integer,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  check (
    (validity_type = 'fixed_date' and valid_until is not null)
    or (validity_type = 'days' and valid_days is not null and valid_days > 0)
  )
);

create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  kind        text not null check (kind in ('percent', 'flat')),
  value       integer not null check (value > 0),   -- percent, or paise when flat
  max_uses    integer,
  used_count  integer not null default 0,
  valid_from  timestamptz,
  valid_to    timestamptz,
  plan_id     uuid references public.plans (id) on delete cascade,  -- null = any plan
  referrer_id uuid references public.profiles (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete restrict,
  plan_id             uuid not null references public.plans (id) on delete restrict,
  coupon_id           uuid references public.coupons (id) on delete set null,
  amount_paise        integer not null check (amount_paise >= 0),
  gst_paise           integer not null default 0,
  status              text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  invoice_no          text unique,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id);

-- Raw gateway webhooks. The unique event id stops double processing.
create table public.payment_events (
  id                bigint generated always as identity primary key,
  razorpay_event_id text not null unique,
  event_type        text,
  payload           jsonb not null,
  signature_ok      boolean not null,
  processed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create table public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  plan_id    uuid not null references public.plans (id) on delete restrict,
  order_id   uuid references public.orders (id) on delete set null,
  starts_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  status     text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, expires_at);

-- ---------- content ---------------------------------------------------

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0
);

create table public.chapters (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  unique (subject_id, name)
);

create table public.topics (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  unique (chapter_id, name)
);

create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete restrict,
  chapter_id  uuid references public.chapters (id) on delete set null,
  topic_id    uuid references public.topics (id) on delete set null,
  type        text not null check (type in ('mcq', 'numerical')),
  difficulty  text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  body        text not null,                       -- markdown + LaTeX
  image_paths text[] not null default '{}',
  source      text,                                -- e.g. 'original', 'JEE Main 2024 S1'
  status      text not null default 'draft' check (status in ('draft', 'reviewed', 'published')),
  created_by  uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index questions_subject_idx on public.questions (subject_id, chapter_id);

create table public.question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label       text not null check (label in ('A', 'B', 'C', 'D')),
  body        text not null,
  image_path  text,
  unique (question_id, label)
);

-- Answer key and solutions. Kept apart from questions so that no policy
-- ever exposes it to students before they submit.
create table public.question_answers (
  question_id        uuid primary key references public.questions (id) on delete cascade,
  correct_option     text check (correct_option in ('A', 'B', 'C', 'D')),
  numeric_value      numeric,
  numeric_tolerance  numeric not null default 0,
  solution_body      text,
  solution_video_url text,
  check (correct_option is not null or numeric_value is not null)
);

-- ---------- tests -----------------------------------------------------

create table public.tests (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  type                 text not null check (type in ('full', 'chapter', 'part', 'pyq', 'custom')),
  duration_min         integer not null check (duration_min > 0),
  mode                 text not null default 'anytime' check (mode in ('live', 'anytime')),
  starts_at            timestamptz,
  ends_at              timestamptz,
  is_free              boolean not null default false,
  shuffle_questions    boolean not null default true,
  status               text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  results_published_at timestamptz,
  instructions         text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  check (mode = 'anytime' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);

-- Which test types or single tests a plan unlocks.
create table public.plan_access (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references public.plans (id) on delete cascade,
  test_type text check (test_type in ('full', 'chapter', 'part', 'pyq', 'custom')),
  test_id   uuid references public.tests (id) on delete cascade,
  check (test_type is not null or test_id is not null)
);
create index plan_access_plan_idx on public.plan_access (plan_id);

-- Marking is set per section, so any exam pattern can be configured.
create table public.test_sections (
  id             uuid primary key default gen_random_uuid(),
  test_id        uuid not null references public.tests (id) on delete cascade,
  subject_id     uuid not null references public.subjects (id) on delete restrict,
  name           text not null,                    -- e.g. 'Section A'
  question_type  text not null check (question_type in ('mcq', 'numerical')),
  question_count integer not null check (question_count > 0),
  marks_correct  numeric not null default 4,
  marks_wrong    numeric not null default -1,
  sort_order     integer not null default 0
);
create index test_sections_test_idx on public.test_sections (test_id);

create table public.test_questions (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references public.tests (id) on delete cascade,
  section_id  uuid not null references public.test_sections (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  position    integer not null,
  unique (test_id, question_id),
  unique (section_id, position)
);

-- ---------- attempts and results --------------------------------------

create table public.attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  test_id             uuid not null references public.tests (id) on delete restrict,
  started_at          timestamptz not null default now(),
  deadline_at         timestamptz not null,        -- set by the server, never by the browser
  submitted_at        timestamptz,
  status              text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'auto_submitted')),
  shuffle_seed        integer not null default 0,
  score               numeric,
  correct             integer,
  wrong               integer,
  unattempted         integer,
  negative_marks      numeric,
  subject_scores      jsonb,
  rank                integer,
  percentile          numeric(7, 4),
  subject_percentiles jsonb,
  unique (user_id, test_id)
);
create index attempts_test_score_idx on public.attempts (test_id, score);

create table public.responses (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references public.attempts (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete restrict,
  selected_option text check (selected_option in ('A', 'B', 'C', 'D')),
  numeric_answer  numeric,
  palette_state   text not null default 'not_visited' check (
    palette_state in ('not_visited', 'not_answered', 'answered', 'marked', 'answered_marked')
  ),
  time_spent_ms   integer not null default 0,      -- adds up across revisits
  visit_count     integer not null default 0,
  first_seen_at   timestamptz,
  saved_at        timestamptz,
  is_correct      boolean,
  marks           numeric,
  unique (attempt_id, question_id)
);

-- Navigation and integrity log: question enter/leave, tab switch, etc.
create table public.attempt_events (
  id          bigint generated always as identity primary key,
  attempt_id  uuid not null references public.attempts (id) on delete cascade,
  kind        text not null,
  question_id uuid references public.questions (id) on delete set null,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index attempt_events_attempt_idx on public.attempt_events (attempt_id, created_at);

create table public.question_stats (
  test_id         uuid not null references public.tests (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete cascade,
  attempted       integer not null default 0,
  correct_percent numeric(5, 2),
  avg_time_ms     integer,
  topper_time_ms  integer,
  primary key (test_id, question_id)
);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  audience     text not null default 'all' check (audience in ('all', 'paid', 'free')),
  published_at timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.notification_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete cascade,
  channel    text not null check (channel in ('email', 'sms', 'whatsapp')),
  template   text not null,
  status     text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error      text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Does the logged-in user hold an unexpired plan? Used from phase 5.
create function public.has_active_plan() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid() and status = 'active' and expires_at > now()
  )
$$;

-- =====================================================================
-- Row-level security. Everything is locked by default; each policy
-- below opens exactly one door. Tables with no policy (payment_events,
-- notification_log writes, etc.) are reachable only with the service key
-- on the server.
-- =====================================================================

alter table public.profiles         enable row level security;
alter table public.active_sessions  enable row level security;
alter table public.audit_log        enable row level security;
alter table public.plans            enable row level security;
alter table public.plan_access      enable row level security;
alter table public.coupons          enable row level security;
alter table public.orders           enable row level security;
alter table public.payment_events   enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.subjects         enable row level security;
alter table public.chapters         enable row level security;
alter table public.topics           enable row level security;
alter table public.questions        enable row level security;
alter table public.question_options enable row level security;
alter table public.question_answers enable row level security;
alter table public.tests            enable row level security;
alter table public.test_sections    enable row level security;
alter table public.test_questions   enable row level security;
alter table public.attempts         enable row level security;
alter table public.responses        enable row level security;
alter table public.attempt_events   enable row level security;
alter table public.question_stats   enable row level security;
alter table public.announcements    enable row level security;
alter table public.notification_log enable row level security;

-- profiles: see and edit your own; staff see all; admin edits all
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy sessions_own on public.active_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy audit_select_admin on public.audit_log for select to authenticated
  using (public.is_admin());
create policy audit_insert_staff on public.audit_log for insert to authenticated
  with check (public.is_staff() and actor_id = (select auth.uid()));

-- plans: public price list; admin manages
create policy plans_select on public.plans for select to anon, authenticated
  using (is_active or public.is_staff());
create policy plans_admin on public.plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy plan_access_select on public.plan_access for select to anon, authenticated
  using (true);
create policy plan_access_admin on public.plan_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- coupons: admin only (codes are checked on the server at checkout)
create policy coupons_admin on public.coupons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- orders and subscriptions: read your own; written only by the server
create policy orders_select on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- syllabus tree: everyone reads; staff manage
create policy subjects_select on public.subjects for select to anon, authenticated using (true);
create policy subjects_staff on public.subjects for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy chapters_select on public.chapters for select to anon, authenticated using (true);
create policy chapters_staff on public.chapters for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy topics_select on public.topics for select to anon, authenticated using (true);
create policy topics_staff on public.topics for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- question bank and answer key: staff only. Students receive questions
-- through the server during an attempt (phase 3), never directly.
create policy questions_staff on public.questions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy question_options_staff on public.question_options for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy question_answers_staff on public.question_answers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- tests: students see published tests; staff manage
create policy tests_select on public.tests for select to authenticated
  using (status = 'published' or public.is_staff());
create policy tests_staff on public.tests for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy test_sections_select on public.test_sections for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.tests t where t.id = test_id and t.status = 'published')
  );
create policy test_sections_staff on public.test_sections for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy test_questions_staff on public.test_questions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- attempts: read your own; staff read all; written only by the server
create policy attempts_select on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());
create policy responses_select on public.responses for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = (select auth.uid()))
  );
create policy attempt_events_select on public.attempt_events for select to authenticated
  using (public.is_staff());
create policy question_stats_select on public.question_stats for select to authenticated
  using (true);

create policy announcements_select on public.announcements for select to authenticated
  using (published_at is not null or public.is_admin());
create policy announcements_admin on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy notification_log_admin on public.notification_log for select to authenticated
  using (public.is_admin());
