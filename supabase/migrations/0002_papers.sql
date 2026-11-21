-- =====================================================================
-- Phase 2: question papers, review workflow, image storage.
-- Run once in the Supabase SQL Editor, after 0001_schema.sql.
-- =====================================================================

-- A short code (PT-1, GT-01) and the date each paper is scheduled for.
alter table public.tests add column code text unique;
alter table public.tests add column scheduled_date date;

-- Chapters a paper covers (chosen by the admin from the chapter list).
create table public.test_chapters (
  test_id    uuid not null references public.tests (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  primary key (test_id, chapter_id)
);
alter table public.test_chapters enable row level security;
create policy test_chapters_select on public.test_chapters for select to authenticated using (true);
create policy test_chapters_staff on public.test_chapters for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Question review: draft -> reviewed (admin confirmed) or rejected -> published.
alter table public.questions drop constraint questions_status_check;
alter table public.questions add constraint questions_status_check
  check (status in ('draft', 'reviewed', 'rejected', 'published'));
alter table public.questions add column review_note text;

-- Every question gets its own ID, e.g. PT-1-Q07 (paper code + question number).
alter table public.questions add column code text unique;

-- Question numbers run 1..75 across the whole paper.
alter table public.test_questions add constraint test_questions_test_position_key unique (test_id, position);

-- Only an admin may confirm, reject or publish a question.
create function public.protect_question_review() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and new.status <> 'draft'
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin can confirm, reject or publish a question';
  end if;
  return new;
end $$;
create trigger questions_protect_review
  before update on public.questions
  for each row execute function public.protect_question_review();

-- Only an admin may publish or unpublish a paper.
create function public.protect_test_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin can publish or unpublish a paper';
  end if;
  return new;
end $$;
create trigger tests_protect_status
  before update on public.tests
  for each row execute function public.protect_test_status();

-- Progress of every paper, for the paper dashboard.
create view public.paper_progress with (security_invoker = true) as
select
  t.id as test_id,
  count(tq.id)::int as filled,
  (count(*) filter (where q.status in ('reviewed', 'published')))::int as confirmed,
  (count(*) filter (where q.status = 'rejected'))::int as rejected,
  (select coalesce(sum(s.question_count), 0)::int from public.test_sections s where s.test_id = t.id) as total
from public.tests t
left join public.test_questions tq on tq.test_id = t.id
left join public.questions q on q.id = tq.question_id
group by t.id;

-- Save one question into one numbered slot of a paper, in a single step.
-- p holds: body, image_path, options {A: {body, image_path}, B: ..}, correct_option,
-- numeric_value, numeric_tolerance, chapter_id, topic_id, solution_body.
create function public.save_paper_question(p_test uuid, p_position integer, p jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_test_status text;
  v_section_id  uuid;
  v_subject_id  uuid;
  v_type        text;
  v_question    uuid;
  v_body        text := btrim(coalesce(p ->> 'body', ''));
  v_image       text := nullif(btrim(coalesce(p ->> 'image_path', '')), '');
  v_correct     text := nullif(btrim(coalesce(p ->> 'correct_option', '')), '');
  v_value       numeric := nullif(btrim(coalesce(p ->> 'numeric_value', '')), '')::numeric;
  v_tolerance   numeric := coalesce(nullif(btrim(coalesce(p ->> 'numeric_tolerance', '')), '')::numeric, 0);
  v_label       text;
  v_option      text;
  v_option_img  text;
  v_code        text;
begin
  if not public.is_staff() then
    raise exception 'Only faculty and admins can edit papers';
  end if;

  select status, code into v_test_status, v_code from public.tests where id = p_test;
  if v_test_status is null then
    raise exception 'Paper not found';
  end if;
  if v_test_status <> 'draft' and not public.is_admin() then
    raise exception 'This paper is published. Only an admin can change it.';
  end if;

  -- Which section does this question number fall in?
  select s.id, s.subject_id, s.question_type into v_section_id, v_subject_id, v_type
  from (
    select ts.id, ts.subject_id, ts.question_type, ts.sort_order,
           sum(ts.question_count) over (order by ts.sort_order) as upto
    from public.test_sections ts where ts.test_id = p_test
  ) s
  where p_position >= 1 and p_position <= s.upto
  order by s.sort_order
  limit 1;
  if v_section_id is null then
    raise exception 'Question number % is outside this paper', p_position;
  end if;

  if v_body = '' and v_image is null then
    raise exception 'Type the question or attach a picture of it';
  end if;
  if v_type = 'mcq' then
    if v_correct is null or v_correct not in ('A', 'B', 'C', 'D') then
      raise exception 'Choose the correct option';
    end if;
    if v_image is null then
      foreach v_label in array array['A', 'B', 'C', 'D'] loop
        if btrim(coalesce(p -> 'options' -> v_label ->> 'body', '')) = ''
           and btrim(coalesce(p -> 'options' -> v_label ->> 'image_path', '')) = '' then
          raise exception 'Fill in all four options (text or a picture for each)';
        end if;
      end loop;
    end if;
  else
    if v_value is null then
      raise exception 'Enter the correct numerical answer';
    end if;
  end if;

  select question_id into v_question
  from public.test_questions where test_id = p_test and position = p_position;

  if v_question is null then
    insert into public.questions (code, subject_id, chapter_id, topic_id, type, body, image_paths, created_by)
    values (
      coalesce(v_code, left(p_test::text, 8)) || '-Q' || lpad(p_position::text, 2, '0'),
      v_subject_id,
      nullif(p ->> 'chapter_id', '')::uuid,
      nullif(p ->> 'topic_id', '')::uuid,
      v_type, v_body,
      case when v_image is null then '{}'::text[] else array[v_image] end,
      auth.uid()
    )
    returning id into v_question;
    insert into public.test_questions (test_id, section_id, question_id, position)
    values (p_test, v_section_id, v_question, p_position);
  else
    update public.questions set
      chapter_id  = nullif(p ->> 'chapter_id', '')::uuid,
      topic_id    = nullif(p ->> 'topic_id', '')::uuid,
      body        = v_body,
      image_paths = case when v_image is null then '{}'::text[] else array[v_image] end,
      -- An edit to a draft paper needs the admin's confirmation again.
      status      = case when v_test_status = 'draft' then 'draft' else status end,
      review_note = case when v_test_status = 'draft' then null else review_note end,
      updated_at  = now()
    where id = v_question;
  end if;

  delete from public.question_options where question_id = v_question;
  if v_type = 'mcq' then
    foreach v_label in array array['A', 'B', 'C', 'D'] loop
      v_option     := btrim(coalesce(p -> 'options' -> v_label ->> 'body', ''));
      v_option_img := nullif(btrim(coalesce(p -> 'options' -> v_label ->> 'image_path', '')), '');
      if v_option <> '' or v_option_img is not null then
        insert into public.question_options (question_id, label, body, image_path)
        values (v_question, v_label, v_option, v_option_img);
      end if;
    end loop;
  end if;

  insert into public.question_answers (question_id, correct_option, numeric_value, numeric_tolerance, solution_body)
  values (
    v_question,
    case when v_type = 'mcq' then v_correct end,
    case when v_type = 'numerical' then v_value end,
    v_tolerance,
    nullif(btrim(coalesce(p ->> 'solution_body', '')), '')
  )
  on conflict (question_id) do update set
    correct_option    = excluded.correct_option,
    numeric_value     = excluded.numeric_value,
    numeric_tolerance = excluded.numeric_tolerance,
    solution_body     = excluded.solution_body;

  return v_question;
end $$;

-- Publish a paper: every slot filled and every question confirmed by the admin.
create function public.publish_paper(p_test uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_total integer; v_filled integer; v_confirmed integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can publish a paper';
  end if;
  select total, filled, confirmed into v_total, v_filled, v_confirmed
  from public.paper_progress where test_id = p_test;
  if v_total is null then raise exception 'Paper not found'; end if;
  if v_filled < v_total then
    raise exception 'Only % of % questions are entered', v_filled, v_total;
  end if;
  if v_confirmed < v_total then
    raise exception 'Only % of % questions are confirmed', v_confirmed, v_total;
  end if;
  update public.questions set status = 'published'
  where id in (select question_id from public.test_questions where test_id = p_test);
  update public.tests set status = 'published' where id = p_test;
end $$;

-- Private storage for question pictures. Staff only; students receive
-- pictures through the server during a test.
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', false)
on conflict (id) do nothing;

create policy question_images_staff on storage.objects for all to authenticated
  using (bucket_id = 'question-images' and public.is_staff())
  with check (bucket_id = 'question-images' and public.is_staff());
