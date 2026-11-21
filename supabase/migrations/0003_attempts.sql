-- =====================================================================
-- Phase 3: taking a test. Start, autosave, submit, scoring, rank and
-- percentile, report and progress. Run once in the Supabase SQL Editor,
-- after 0001 and 0002.
--
-- Students never read the answer key directly: every function below
-- checks who is asking and only reveals answers after submission.
-- =====================================================================

-- Staff can take any paper early to try it. Such trial attempts are kept
-- out of the students' ranks and percentiles.
alter table public.attempts add column is_trial boolean not null default false;

-- Can the logged-in user take this test? Free tests: everyone. Paid
-- tests: an active plan that covers the test or its type.
create function public.can_take(p_test uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tests t
    where t.id = p_test
      and (t.is_free or exists (
        select 1 from public.subscriptions s
        join public.plan_access pa on pa.plan_id = s.plan_id
        where s.user_id = auth.uid() and s.status = 'active' and s.expires_at > now()
          and (pa.test_id = t.id or pa.test_type = t.type)
      ))
  )
$$;

create function public.start_attempt(p_test uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tests%rowtype;
  v_staff boolean := public.is_staff();
  v_attempt uuid;
begin
  if v_uid is null then raise exception 'Please log in again'; end if;
  select * into v_t from public.tests where id = p_test;
  if not found then raise exception 'This test does not exist'; end if;

  select id into v_attempt from public.attempts where user_id = v_uid and test_id = p_test;
  if v_attempt is not null then return v_attempt; end if; -- resume, or the finished one

  if not v_staff then
    if v_t.status <> 'published' then raise exception 'This test is not available yet'; end if;
    if v_t.starts_at is not null and now() < v_t.starts_at then
      raise exception 'This test opens on %', to_char(v_t.starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY');
    end if;
    if v_t.ends_at is not null and now() > v_t.ends_at then raise exception 'This test has closed'; end if;
    if not public.can_take(p_test) then raise exception 'This test needs a plan'; end if;
  end if;
  if not exists (select 1 from public.test_questions where test_id = p_test) then
    raise exception 'This paper has no questions yet';
  end if;

  insert into public.attempts (user_id, test_id, deadline_at, is_trial)
  values (v_uid, p_test, now() + make_interval(mins => v_t.duration_min), v_staff)
  returning id into v_attempt;
  insert into public.responses (attempt_id, question_id)
  select v_attempt, question_id from public.test_questions where test_id = p_test;
  insert into public.attempt_events (attempt_id, kind) values (v_attempt, 'start');
  return v_attempt;
end $$;

-- Everything the exam screen needs, without the answer key.
create function public.get_attempt_paper(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_a public.attempts%rowtype;
begin
  select * into v_a from public.attempts where id = p_attempt;
  if not found or v_a.user_id <> auth.uid() then raise exception 'Attempt not found'; end if;
  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_a.id, 'status', v_a.status, 'started_at', v_a.started_at,
      'deadline_at', v_a.deadline_at, 'now', now(), 'is_trial', v_a.is_trial),
    'test', (select jsonb_build_object('id', t.id, 'code', t.code, 'title', t.title, 'duration_min', t.duration_min)
             from public.tests t where t.id = v_a.test_id),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', tq.position, 'question_id', q.id, 'subject', sj.name, 'section', ts.name,
        'type', ts.question_type, 'marks_correct', ts.marks_correct, 'marks_wrong', ts.marks_wrong,
        'body', q.body, 'image_path', q.image_paths[1],
        'options', coalesce((select jsonb_agg(jsonb_build_object('label', o.label, 'body', o.body, 'image_path', o.image_path) order by o.label)
                             from public.question_options o where o.question_id = q.id), '[]'::jsonb)
      ) order by tq.position)
      from public.test_questions tq
      join public.test_sections ts on ts.id = tq.section_id
      join public.subjects sj on sj.id = ts.subject_id
      join public.questions q on q.id = tq.question_id
      where tq.test_id = v_a.test_id), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', r.question_id, 'selected_option', r.selected_option, 'numeric_answer', r.numeric_answer,
        'palette_state', r.palette_state, 'time_spent_ms', r.time_spent_ms, 'visit_count', r.visit_count))
      from public.responses r where r.attempt_id = p_attempt), '[]'::jsonb)
  );
end $$;

-- Autosave. Items: [{question_id, selected_option, numeric_answer,
-- palette_state, add_ms, add_visits}]. Events: [{kind, question_id, details}].
-- Answers arriving after the deadline (plus 90 s for slow networks) are refused.
create function public.save_responses(p_attempt uuid, p_items jsonb, p_events jsonb default '[]'::jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.attempts%rowtype;
  v_item jsonb;
  v_sel text;
  v_num text;
  v_state text;
  v_ms integer;
begin
  select * into v_a from public.attempts where id = p_attempt for update;
  if not found or v_a.user_id <> auth.uid() then raise exception 'Attempt not found'; end if;
  if v_a.status <> 'in_progress' then return v_a.status; end if;
  if now() > v_a.deadline_at + interval '90 seconds' then return 'expired'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_sel := nullif(v_item ->> 'selected_option', '');
    if v_sel is not null and v_sel not in ('A', 'B', 'C', 'D') then v_sel := null; end if;
    v_num := nullif(btrim(coalesce(v_item ->> 'numeric_answer', '')), '');
    if v_num is not null and v_num !~ '^-?[0-9]+(\.[0-9]+)?$' then v_num := null; end if;
    v_state := coalesce(v_item ->> 'palette_state', 'not_answered');
    if v_state not in ('not_visited', 'not_answered', 'answered', 'marked', 'answered_marked') then
      v_state := 'not_answered';
    end if;
    v_ms := least(greatest(coalesce((v_item ->> 'add_ms')::integer, 0), 0), 4 * 3600 * 1000);
    update public.responses set
      selected_option = v_sel,
      numeric_answer  = v_num::numeric,
      palette_state   = v_state,
      time_spent_ms   = time_spent_ms + v_ms,
      visit_count     = visit_count + least(greatest(coalesce((v_item ->> 'add_visits')::integer, 0), 0), 1000),
      first_seen_at   = coalesce(first_seen_at, now()),
      saved_at        = now()
    where attempt_id = p_attempt and question_id = (v_item ->> 'question_id')::uuid;
  end loop;

  insert into public.attempt_events (attempt_id, kind, question_id, details)
  select p_attempt, left(e ->> 'kind', 40), nullif(e ->> 'question_id', '')::uuid, e -> 'details'
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e
  limit 200;
  return 'ok';
end $$;

-- Rank and NTA percentile for every finished attempt of a test:
-- percentile = 100 x (attempts scoring the same or lower) / (all attempts).
-- Students are compared with students only; a staff trial attempt is
-- compared with the students as if it were one more of them.
create function public.refresh_ranks(p_test uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.attempts a set
    rank = (select count(*) from public.attempts p
            where p.test_id = p_test and p.submitted_at is not null and not p.is_trial and p.score > a.score) + 1,
    percentile = round(100.0 *
      ((select count(*) from public.attempts p
        where p.test_id = p_test and p.submitted_at is not null and not p.is_trial and p.score <= a.score)
       + case when a.is_trial then 1 else 0 end)
      / greatest(1, (select count(*) from public.attempts p
        where p.test_id = p_test and p.submitted_at is not null and not p.is_trial)
       + case when a.is_trial then 1 else 0 end), 4),
    subject_percentiles = (
      select jsonb_object_agg(k.key, round(100.0 *
        ((select count(*) from public.attempts p
          where p.test_id = p_test and p.submitted_at is not null and not p.is_trial
            and (p.subject_scores -> k.key ->> 'score')::numeric <= (k.value ->> 'score')::numeric)
         + case when a.is_trial then 1 else 0 end)
        / greatest(1, (select count(*) from public.attempts p
          where p.test_id = p_test and p.submitted_at is not null and not p.is_trial)
         + case when a.is_trial then 1 else 0 end), 4))
      from jsonb_each(a.subject_scores) k)
  where a.test_id = p_test and a.submitted_at is not null;

  -- Per-question figures for "you vs average vs topper".
  delete from public.question_stats where test_id = p_test;
  insert into public.question_stats (test_id, question_id, attempted, correct_percent, avg_time_ms, topper_time_ms)
  select p_test, r.question_id,
         count(*) filter (where r.is_correct is not null),
         round(100.0 * count(*) filter (where r.is_correct) / greatest(1, count(*)), 2),
         round(avg(r.time_spent_ms))::integer,
         (select r2.time_spent_ms from public.responses r2
          join public.attempts a2 on a2.id = r2.attempt_id
          where a2.test_id = p_test and a2.submitted_at is not null and not a2.is_trial and r2.question_id = r.question_id
          order by a2.score desc, a2.submitted_at limit 1)
  from public.responses r
  join public.attempts a on a.id = r.attempt_id
  where a.test_id = p_test and a.submitted_at is not null and not a.is_trial
  group by r.question_id;
end $$;

-- Scores a finished attempt. Not callable directly (see grants below).
create function public.finish_attempt(p_attempt uuid, p_auto boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.attempts%rowtype;
begin
  select * into v_a from public.attempts where id = p_attempt for update;
  if not found or v_a.status <> 'in_progress' then return; end if;

  update public.responses r set
    is_correct = case
      when ts.question_type = 'mcq' then
        case when r.selected_option is null then null else r.selected_option = qa.correct_option end
      else
        case when r.numeric_answer is null then null
             else abs(r.numeric_answer - qa.numeric_value) <= coalesce(qa.numeric_tolerance, 0) end
    end
  from public.test_questions tq
  join public.test_sections ts on ts.id = tq.section_id
  join public.question_answers qa on qa.question_id = tq.question_id
  where r.attempt_id = p_attempt and tq.test_id = v_a.test_id and tq.question_id = r.question_id;

  update public.responses r set marks = case
      when r.is_correct is null then 0
      when r.is_correct then ts.marks_correct
      else ts.marks_wrong end
  from public.test_questions tq
  join public.test_sections ts on ts.id = tq.section_id
  where r.attempt_id = p_attempt and tq.test_id = v_a.test_id and tq.question_id = r.question_id;

  update public.attempts a set
    status = case when p_auto then 'auto_submitted' else 'submitted' end,
    submitted_at = least(now(), a.deadline_at + interval '90 seconds'),
    score = s.score, correct = s.correct, wrong = s.wrong, unattempted = s.unattempted,
    negative_marks = s.negative, subject_scores = s.subjects
  from (
    select coalesce(sum(r.marks), 0) as score,
           count(*) filter (where r.is_correct) as correct,
           count(*) filter (where r.is_correct = false) as wrong,
           count(*) filter (where r.is_correct is null) as unattempted,
           coalesce(-sum(r.marks) filter (where r.is_correct = false), 0) as negative,
           (select jsonb_object_agg(x.subject, jsonb_build_object(
              'score', x.score, 'max', x.max, 'correct', x.correct, 'wrong', x.wrong,
              'unattempted', x.unattempted, 'time_ms', x.time_ms, 'sort', x.sort))
            from (
              select sj.name as subject, min(ts.sort_order) as sort,
                     coalesce(sum(r2.marks), 0) as score, sum(ts.marks_correct) as max,
                     count(*) filter (where r2.is_correct) as correct,
                     count(*) filter (where r2.is_correct = false) as wrong,
                     count(*) filter (where r2.is_correct is null) as unattempted,
                     coalesce(sum(r2.time_spent_ms), 0) as time_ms
              from public.responses r2
              join public.test_questions tq on tq.test_id = v_a.test_id and tq.question_id = r2.question_id
              join public.test_sections ts on ts.id = tq.section_id
              join public.subjects sj on sj.id = ts.subject_id
              where r2.attempt_id = p_attempt
              group by sj.name) x) as subjects
    from public.responses r where r.attempt_id = p_attempt
  ) s
  where a.id = p_attempt;

  insert into public.attempt_events (attempt_id, kind) values (p_attempt, case when p_auto then 'auto_submit' else 'submit' end);
  perform public.refresh_ranks(v_a.test_id);
end $$;

create function public.submit_attempt(p_attempt uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.attempts%rowtype;
begin
  select * into v_a from public.attempts where id = p_attempt;
  if not found or v_a.user_id <> auth.uid() then raise exception 'Attempt not found'; end if;
  if v_a.status = 'in_progress' then
    perform public.finish_attempt(p_attempt, now() >= v_a.deadline_at);
  end if;
  return (select status from public.attempts where id = p_attempt);
end $$;

-- Finishes the logged-in user's attempts whose time has run out.
create function public.finish_my_expired() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select id from public.attempts
    where user_id = auth.uid() and status = 'in_progress' and now() > deadline_at
  loop
    perform public.finish_attempt(v_id, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Staff can delete their own trial attempt to take the paper again.
create function public.discard_trial_attempt(p_attempt uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_test uuid;
begin
  select test_id into v_test from public.attempts
  where id = p_attempt and user_id = auth.uid() and is_trial;
  if v_test is null then raise exception 'Only your own trial attempt can be deleted'; end if;
  delete from public.attempts where id = p_attempt;
  perform public.refresh_ranks(v_test);
end $$;

-- The full report of a finished attempt, with answers and solutions.
-- The student who took it, or staff.
create function public.get_attempt_report(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_a public.attempts%rowtype;
begin
  select * into v_a from public.attempts where id = p_attempt;
  if not found or (v_a.user_id <> auth.uid() and not public.is_staff()) then raise exception 'Report not found'; end if;
  if v_a.submitted_at is null then raise exception 'This test is not finished yet'; end if;
  return jsonb_build_object(
    'attempt', to_jsonb(v_a),
    'student', (select jsonb_build_object('name', p.full_name, 'mobile', p.mobile) from public.profiles p where p.id = v_a.user_id),
    'test', (select jsonb_build_object('id', t.id, 'code', t.code, 'title', t.title, 'duration_min', t.duration_min, 'scheduled_date', t.scheduled_date)
             from public.tests t where t.id = v_a.test_id),
    'takers', (select count(*) from public.attempts p where p.test_id = v_a.test_id and p.submitted_at is not null and not p.is_trial)
              + case when v_a.is_trial then 1 else 0 end,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', tq.position, 'question_id', q.id, 'code', q.code, 'subject', sj.name, 'section', ts.name,
        'type', ts.question_type, 'marks_correct', ts.marks_correct, 'marks_wrong', ts.marks_wrong,
        'chapter', ch.name, 'topic', tp.name, 'body', q.body, 'image_path', q.image_paths[1],
        'options', coalesce((select jsonb_agg(jsonb_build_object('label', o.label, 'body', o.body, 'image_path', o.image_path) order by o.label)
                             from public.question_options o where o.question_id = q.id), '[]'::jsonb),
        'correct_option', qa.correct_option, 'numeric_value', qa.numeric_value, 'solution', qa.solution_body,
        'selected_option', r.selected_option, 'numeric_answer', r.numeric_answer, 'palette_state', r.palette_state,
        'is_correct', r.is_correct, 'marks', r.marks, 'time_spent_ms', r.time_spent_ms, 'visit_count', r.visit_count,
        'avg_time_ms', st.avg_time_ms, 'topper_time_ms', st.topper_time_ms, 'correct_percent', st.correct_percent
      ) order by tq.position)
      from public.test_questions tq
      join public.test_sections ts on ts.id = tq.section_id
      join public.subjects sj on sj.id = ts.subject_id
      join public.questions q on q.id = tq.question_id
      left join public.chapters ch on ch.id = q.chapter_id
      left join public.topics tp on tp.id = q.topic_id
      left join public.question_answers qa on qa.question_id = q.id
      left join public.responses r on r.attempt_id = p_attempt and r.question_id = q.id
      left join public.question_stats st on st.test_id = v_a.test_id and st.question_id = q.id
      where tq.test_id = v_a.test_id), '[]'::jsonb)
  );
end $$;

-- Every finished test of the logged-in user, with subject and chapter
-- results, oldest first: the data behind the progress page.
create function public.get_my_progress() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.scheduled_date, x.submitted_at), '[]'::jsonb) from (
    select a.id as attempt_id, t.code, t.title, t.scheduled_date, a.submitted_at, a.score, a.rank, a.percentile,
           a.correct, a.wrong, a.unattempted, a.subject_scores, a.subject_percentiles, a.is_trial,
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'subject', c.subject, 'chapter', c.chapter, 'total', c.total, 'correct', c.correct,
                     'wrong', c.wrong, 'marks', c.marks, 'max', c.max)), '[]'::jsonb)
            from (
              select sj.name as subject, coalesce(ch.name, 'No chapter set') as chapter,
                     count(*) as total, count(*) filter (where r.is_correct) as correct,
                     count(*) filter (where r.is_correct = false) as wrong,
                     coalesce(sum(r.marks), 0) as marks, sum(ts.marks_correct) as max
              from public.responses r
              join public.test_questions tq on tq.test_id = a.test_id and tq.question_id = r.question_id
              join public.test_sections ts on ts.id = tq.section_id
              join public.subjects sj on sj.id = ts.subject_id
              join public.questions q on q.id = r.question_id
              left join public.chapters ch on ch.id = q.chapter_id
              where r.attempt_id = a.id
              group by sj.name, ch.name) c) as chapters
    from public.attempts a
    join public.tests t on t.id = a.test_id
    where a.user_id = auth.uid() and a.submitted_at is not null
  ) x
$$;

-- Internal helpers are not callable from the browser.
revoke execute on function public.finish_attempt(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.refresh_ranks(uuid) from public, anon, authenticated;
