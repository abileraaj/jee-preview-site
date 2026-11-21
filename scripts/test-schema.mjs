// Runs the migration and seed against an in-memory Postgres (PGlite) with a
// minimal stand-in for Supabase's auth schema, then checks the security rules.
// Usage: npm run test:schema
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id bigint generated always as identity primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
await db.exec(readFileSync("supabase/migrations/0001_schema.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/0002_papers.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/0003_attempts.sql", "utf8"));
for (const f of ["0001_seed.sql", "0002_schedule.sql", "0001_seed.sql", "0002_schedule.sql"]) {
  await db.exec(readFileSync("supabase/seed/" + f, "utf8")); // run twice: must be repeatable
}

const S = "00000000-0000-4000-8000-000000000001"; // student
const T = "00000000-0000-4000-8000-000000000002"; // other student
const A = "00000000-0000-4000-8000-000000000003"; // admin
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${S}', 's@example.com', '{"full_name":"Student One"}'),
    ('${T}', 't@example.com', '{}'),
    ('${A}', 'a@example.com', '{}');
  update public.profiles set role = 'admin' where id = '${A}';
  insert into public.questions (id, subject_id, type, body)
    select '99999999-0000-4000-8000-000000000001', id, 'mcq', 'Q?' from public.subjects where name = 'Physics';
  insert into public.question_answers (question_id, correct_option)
    values ('99999999-0000-4000-8000-000000000001', 'B');
`);

const as = async (uid, sql) => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`);
  try { return await db.query(sql); }
  finally { await db.exec(`reset role; reset request.jwt.claim.sub;`); }
};
const fails = async (uid, sql, why) => {
  let threw = false;
  try { await as(uid, sql); } catch { threw = true; }
  assert.ok(threw, why);
};

let r = await db.query(`select count(*)::int n from public.profiles`);
assert.equal(r.rows[0].n, 3, "signup trigger creates a profile per user");
r = await db.query(`select full_name from public.profiles where id = '${S}'`);
assert.equal(r.rows[0].full_name, "Student One", "name copied from signup metadata");

r = await as(S, `select id from public.profiles`);
assert.equal(r.rows.length, 1, "student sees only their own profile");
r = await as(A, `select id from public.profiles`);
assert.equal(r.rows.length, 3, "admin sees every profile");

r = await as(S, `update public.profiles set full_name = 'New Name' where id = '${S}' returning id`);
assert.equal(r.rows.length, 1, "student can edit own profile");
r = await as(S, `update public.profiles set full_name = 'Hacked' where id = '${T}' returning id`);
assert.equal(r.rows.length, 0, "student cannot edit another profile");
await fails(S, `update public.profiles set role = 'admin' where id = '${S}'`, "student cannot promote themselves");
r = await as(A, `update public.profiles set role = 'faculty' where id = '${T}' returning role`);
assert.equal(r.rows[0].role, "faculty", "admin can change a role");

r = await as(S, `select * from public.question_answers`);
assert.equal(r.rows.length, 0, "student cannot read the answer key");
r = await as(S, `select * from public.questions`);
assert.equal(r.rows.length, 0, "student cannot read the question bank directly");
r = await as(T, `select * from public.question_answers`);
assert.equal(r.rows.length, 1, "faculty can read the answer key");
r = await as(S, `select * from public.coupons`);
assert.equal(r.rows.length, 0, "student cannot list coupons");
r = await as(S, `select * from public.plans`);
assert.equal(r.rows.length, 2, "student sees the two active plans");
await fails(S, `insert into public.subscriptions (user_id, plan_id, expires_at)
  values ('${S}', '11111111-1111-4111-8111-111111111111', now() + interval '1 year')`,
  "student cannot grant themselves a plan");
await fails(S, `insert into public.orders (user_id, plan_id, amount_paise, status)
  values ('${S}', '11111111-1111-4111-8111-111111111111', 0, 'paid')`,
  "student cannot create a paid order");

r = await db.query(`select count(*)::int n from pg_tables where schemaname = 'public'`);
assert.equal(r.rows[0].n, 25, "25 tables");
r = await db.query(`select count(*)::int n from pg_tables where schemaname = 'public' and not rowsecurity`);
assert.equal(r.rows[0].n, 0, "every table has row-level security on");

// ---- phase 2: schedule, paper workflow --------------------------------
r = await db.query(`select count(*)::int n from public.tests`);
assert.equal(r.rows[0].n, 33, "33 scheduled papers");
r = await db.query(`select code, scheduled_date::text d from public.tests where code in ('PT-1','PT-18','GT-01','GT-06','GT-07','GT-15') order by scheduled_date`);
assert.deepEqual(r.rows.map((x) => x.code + " " + x.d), [
  "PT-1 2026-11-24", "PT-18 2026-12-28", "GT-01 2026-12-31", "GT-06 2027-01-10", "GT-07 2027-01-12", "GT-15 2027-01-20",
], "schedule dates match the plan");
r = await db.query(`select total from public.paper_progress limit 1`);
assert.equal(r.rows[0].total, 75, "each paper has 75 slots");

const P = (await db.query(`select id from public.tests where code = 'PT-1'`)).rows[0].id;
const save = (uid, pos, p) => as(uid, `select public.save_paper_question('${P}', ${pos}, '${JSON.stringify(p)}'::jsonb) id`);
const mcq = { body: "What is g?", options: { A: { body: "9.8" }, B: { body: "8.9" }, C: { image_path: "x/c.png" }, D: { body: "0" } }, correct_option: "A" };
// T is faculty (promoted above), S is a student, A is admin
await fails(S, `select public.save_paper_question('${P}', 1, '${JSON.stringify(mcq)}'::jsonb)`, "student cannot add questions");
r = await save(T, 1, mcq);
const Q1 = r.rows[0].id;
r = await db.query(`select q.type, s.name from public.questions q join public.subjects s on s.id = q.subject_id where q.id = '${Q1}'`);
assert.deepEqual(r.rows[0], { type: "mcq", name: "Physics" }, "Q1 is a Physics MCQ");
r = await db.query(`select code from public.questions where id = '${Q1}'`);
assert.equal(r.rows[0].code, "PT-1-Q01", "question gets its own ID");
r = await db.query(`select image_path from public.question_options where question_id = '${Q1}' and label = 'C'`);
assert.equal(r.rows[0].image_path, "x/c.png", "an option can be a picture");
r = await save(T, 21, { body: "Find x", numeric_value: "4.5" });
r = await db.query(`select q.type from public.questions q where q.id = '${r.rows[0].id}'`);
assert.equal(r.rows[0].type, "numerical", "Q21 is numerical (Physics Section B)");
r = await save(T, 75, { image_path: "x/75.png", numeric_value: "2" });
r = await db.query(`select s.name from public.questions q join public.subjects s on s.id = q.subject_id where q.id = '${r.rows[0].id}'`);
assert.equal(r.rows[0].name, "Mathematics", "Q75 is Mathematics");
await fails(T, `select public.save_paper_question('${P}', 76, '${JSON.stringify(mcq)}'::jsonb)`, "Q76 does not exist");
await fails(T, `select public.save_paper_question('${P}', 2, '${JSON.stringify({ body: "x", options: { A: { body: "1" } }, correct_option: "A" })}'::jsonb)`, "needs four options");
await fails(T, `select public.save_paper_question('${P}', 2, '${JSON.stringify({ ...mcq, correct_option: "" })}'::jsonb)`, "needs a correct option");
await save(T, 1, { ...mcq, body: "Edited" }); // editing reuses the slot
r = await db.query(`select count(*)::int n from public.test_questions where test_id = '${P}'`);
assert.equal(r.rows[0].n, 3, "editing a slot does not create a second question");
r = await db.query(`select count(*)::int n from public.question_options where question_id = '${Q1}'`);
assert.equal(r.rows[0].n, 4, "options replaced, not duplicated");

await fails(T, `update public.questions set status = 'reviewed' where id = '${Q1}'`, "faculty cannot confirm a question");
await fails(T, `select public.publish_paper('${P}')`, "faculty cannot publish");
await fails(T, `update public.tests set status = 'published' where id = '${P}'`, "faculty cannot publish by direct update");
await as(A, `update public.questions set status = 'reviewed' where id = '${Q1}'`);
await save(T, 1, { ...mcq, body: "Edited again" });
r = await db.query(`select status from public.questions where id = '${Q1}'`);
assert.equal(r.rows[0].status, "draft", "editing a confirmed question sends it back for confirmation");
await fails(A, `select public.publish_paper('${P}')`, "cannot publish an incomplete paper");

// fill the whole paper, confirm it, publish it
for (let pos = 1; pos <= 75; pos++) {
  const inB = (pos - 1) % 25 >= 20;
  await save(T, pos, inB ? { body: "N" + pos, numeric_value: "1" } : { ...mcq, body: "M" + pos });
}
await fails(A, `select public.publish_paper('${P}')`, "cannot publish before every question is confirmed");
await as(A, `update public.questions set status = 'reviewed' where id in (select question_id from public.test_questions where test_id = '${P}')`);
await as(A, `select public.publish_paper('${P}')`);
r = await db.query(`select status from public.tests where id = '${P}'`);
assert.equal(r.rows[0].status, "published", "admin publishes a complete, confirmed paper");
await fails(T, `select public.save_paper_question('${P}', 1, '${JSON.stringify(mcq)}'::jsonb)`, "faculty cannot edit a published paper");
r = await as(S, `select code from public.tests`);
assert.deepEqual(r.rows.map((x) => x.code), ["PT-1"], "students see only published papers");
r = await as(S, `select * from public.questions`);
assert.equal(r.rows.length, 0, "students still cannot read questions directly");

// ---- phase 3: taking a test ------------------------------------------
const U2 = "00000000-0000-4000-8000-000000000004"; // second student
const U3 = "00000000-0000-4000-8000-000000000005"; // third student
await db.exec(`insert into auth.users (id, email) values ('${U2}', 'u2@x.com'), ('${U3}', 'u3@x.com');`);
await fails(S, `select public.start_attempt('${P}')`, "students cannot start a paper before its date");
await db.exec(`update public.tests set starts_at = now() - interval '1 day' where id = '${P}'`);
const aS = (await as(S, `select public.start_attempt('${P}') id`)).rows[0].id;
assert.equal((await as(S, `select public.start_attempt('${P}') id`)).rows[0].id, aS, "starting again resumes the same attempt");
const aU2 = (await as(U2, `select public.start_attempt('${P}') id`)).rows[0].id;
r = await db.query(`select count(*)::int n from public.responses where attempt_id = '${aS}'`);
assert.equal(r.rows[0].n, 75, "an attempt gets 75 response rows");

const paper = (await as(S, `select public.get_attempt_paper('${aS}') p`)).rows[0].p;
assert.equal(paper.questions.length, 75, "exam screen receives 75 questions");
assert.ok(!JSON.stringify(paper).includes("correct_option") && !JSON.stringify(paper).includes("numeric_value"), "the exam screen never receives the answer key");
await fails(U2, `select public.get_attempt_paper('${aS}')`, "a student cannot open another student's attempt");
await fails(S, `select public.get_attempt_report('${aS}')`, "no report before submitting");

const qid = (n) => paper.questions[n - 1].question_id;
const items = (list) => JSON.stringify(list).replace(/'/g, "''");
r = await as(S, `select public.save_responses('${aS}', '${items([
  { question_id: qid(1), selected_option: "A", palette_state: "answered", add_ms: 30000, add_visits: 1 },
  { question_id: qid(2), selected_option: "B", palette_state: "answered_marked", add_ms: 90000, add_visits: 2 },
  { question_id: qid(21), numeric_answer: "1", palette_state: "answered", add_ms: 120000, add_visits: 1 },
  { question_id: qid(22), numeric_answer: "5", palette_state: "answered", add_ms: 10000, add_visits: 1 },
  { question_id: qid(3), palette_state: "marked", add_ms: 5000, add_visits: 1 },
])}'::jsonb, '[{"kind":"tab_hidden"}]'::jsonb) s`);
assert.equal(r.rows[0].s, "ok", "autosave accepted");
await as(S, `select public.save_responses('${aS}', '${items([{ question_id: qid(1), selected_option: "A", palette_state: "answered", add_ms: 15000, add_visits: 1 }])}'::jsonb)`);
r = await db.query(`select time_spent_ms, visit_count from public.responses where attempt_id = '${aS}' and question_id = '${qid(1)}'`);
assert.deepEqual(r.rows[0], { time_spent_ms: 45000, visit_count: 2 }, "time and visits add up across revisits");
await fails(U2, `select public.save_responses('${aS}', '[]'::jsonb)`, "a student cannot save into another student's attempt");
await as(U2, `select public.save_responses('${aU2}', '${items([{ question_id: qid(1), selected_option: "A", palette_state: "answered", add_ms: 20000, add_visits: 1 }])}'::jsonb)`);
await fails(S, `select public.finish_attempt('${aS}', false)`, "the scoring function cannot be called directly");

assert.equal((await as(S, `select public.submit_attempt('${aS}') s`)).rows[0].s, "submitted");
await as(U2, `select public.submit_attempt('${aU2}')`);
r = await db.query(`select score::int, correct, wrong, unattempted, negative_marks::int neg, rank, percentile::float pct, subject_scores, subject_percentiles from public.attempts where id = '${aS}'`);
const sa = r.rows[0];
assert.deepEqual([sa.score, sa.correct, sa.wrong, sa.unattempted, sa.neg], [6, 2, 2, 71, 2], "scoring: 2 right (+8), 2 wrong (-2)");
assert.equal(sa.subject_scores.Physics.score, 6, "Physics subject score");
assert.equal(sa.subject_scores.Physics.time_ms, 270000, "Physics time adds up (45+90+120+10+5 s)");
assert.equal(sa.subject_scores.Chemistry.unattempted, 25, "Chemistry untouched");
assert.deepEqual([sa.rank, sa.pct], [1, 100], "top student: rank 1, percentile 100");
r = await db.query(`select score::int, rank, percentile::float pct from public.attempts where id = '${aU2}'`);
assert.deepEqual([r.rows[0].score, r.rows[0].rank, r.rows[0].pct], [4, 2, 50], "second student: rank 2, percentile 50");
assert.equal(sa.subject_percentiles.Physics, 100, "subject percentile");
r = await as(S, `select public.save_responses('${aS}', '[]'::jsonb) s`);
assert.equal(r.rows[0].s, "submitted", "no saving after submission");

const rep = (await as(S, `select public.get_attempt_report('${aS}') r`)).rows[0].r;
assert.equal(rep.questions[0].correct_option, "A", "report shows the answer key after submission");
assert.equal(rep.takers, 2, "two students took the test");
await fails(U2, `select public.get_attempt_report('${aS}')`, "a student cannot read another student's report");
assert.ok((await as(A, `select public.get_attempt_report('${aS}') r`)).rows[0].r, "admin can read any report");

// staff trial attempt: allowed early, kept out of student ranks
await db.exec(`update public.tests set starts_at = now() + interval '5 days' where id = '${P}'`);
const aT = (await as(T, `select public.start_attempt('${P}') id`)).rows[0].id;
await as(T, `select public.submit_attempt('${aT}')`);
r = await db.query(`select is_trial, rank, percentile::float pct from public.attempts where id = '${aT}'`);
assert.equal(r.rows[0].is_trial, true, "staff attempt is a trial");
assert.equal(r.rows[0].rank, 3, "trial ranked against the students");
r = await db.query(`select percentile::float pct from public.attempts where id = '${aU2}'`);
assert.equal(r.rows[0].pct, 50, "trial does not change students' percentiles");
await fails(S, `select public.discard_trial_attempt('${aS}')`, "students cannot delete their attempt");
await as(T, `select public.discard_trial_attempt('${aT}')`);
r = await db.query(`select count(*)::int n from public.attempts where id = '${aT}'`);
assert.equal(r.rows[0].n, 0, "staff can delete their trial attempt");

// time runs out
await db.exec(`update public.tests set starts_at = now() - interval '1 day' where id = '${P}'`);
const aU3 = (await as(U3, `select public.start_attempt('${P}') id`)).rows[0].id;
await db.exec(`update public.attempts set deadline_at = now() - interval '10 minutes' where id = '${aU3}'`);
r = await as(U3, `select public.save_responses('${aU3}', '[]'::jsonb) s`);
assert.equal(r.rows[0].s, "expired", "answers after the deadline are refused");
assert.equal((await as(U3, `select public.finish_my_expired() n`)).rows[0].n, 1);
r = await db.query(`select status from public.attempts where id = '${aU3}'`);
assert.equal(r.rows[0].status, "auto_submitted", "expired attempt is auto-submitted");

const prog = (await as(S, `select public.get_my_progress() p`)).rows[0].p;
assert.equal(prog.length, 1, "progress lists finished tests");
assert.ok(prog[0].chapters.length >= 3, "progress has chapter results");
console.log("Schema OK: 25 tables, all security, workflow and scoring checks passed.");
