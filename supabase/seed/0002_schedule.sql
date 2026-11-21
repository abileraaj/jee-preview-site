-- The 33 scheduled papers: PT-1..PT-18 and GT-01..GT-15.
-- Every paper follows the JEE Main pattern: per subject, Section A = 20
-- multiple-choice and Section B = 5 numerical; +4 / -1; 180 minutes.
-- Each paper opens at 00:00 IST on its date and stays open until the
-- end of 20 January 2027. Safe to run more than once.
do $$
declare
  v_code text; v_title text; v_type text; v_date date; v_test uuid;
  v_subject record; v_order integer; i integer;
begin
  for i in 1..33 loop
    if i <= 18 then
      v_code := 'PT-' || i;  v_title := 'Part Test ' || i;  v_type := 'part';
      v_date := date '2026-11-24' + (i - 1) * 2;
    else
      v_code := 'GT-' || lpad((i - 18)::text, 2, '0');
      v_title := 'Grand Test ' || (i - 18);  v_type := 'full';
      if i - 18 <= 6 then
        v_date := date '2026-12-31' + (i - 19) * 2;
      else
        v_date := date '2027-01-12' + (i - 25);
      end if;
    end if;

    insert into public.tests (code, title, type, duration_min, mode, scheduled_date,
                              starts_at, ends_at, is_free, shuffle_questions)
    values (v_code, v_title, v_type, 180, 'anytime', v_date,
            (v_date::text || ' 00:00:00+05:30')::timestamptz,
            timestamptz '2027-01-20 23:59:59+05:30', true, false)
    on conflict (code) do nothing
    returning id into v_test;

    if v_test is not null then
      v_order := 0;
      for v_subject in select id from public.subjects order by sort_order loop
        insert into public.test_sections (test_id, subject_id, name, question_type, question_count, marks_correct, marks_wrong, sort_order)
        values (v_test, v_subject.id, 'Section A', 'mcq', 20, 4, -1, v_order + 1),
               (v_test, v_subject.id, 'Section B', 'numerical', 5, 4, -1, v_order + 2);
        v_order := v_order + 2;
      end loop;
    end if;
  end loop;
end $$;
