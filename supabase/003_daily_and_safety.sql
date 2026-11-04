-- 2차 수정: 자정 기록, 일정 기반 예측, 익명 보호 강화, 악용 방지.
-- schema.sql, 002_live_stats.sql 을 실행한 프로젝트에서 이 파일을 통째로 Run 한다. 여러 번 실행해도 된다.

-- ───────── 공통 도우미 ─────────
create or replace function kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function is_grade(g text) returns boolean
language sql immutable as $$ select g in ('1학년', '2학년', '3학년', '4학년', '초과학기') $$;

create or replace function is_weather(w text) returns boolean
language sql immutable as $$ select w in ('sunny', 'clear', 'cloudy', 'rain', 'storm') $$;

create or replace function valid_tags(t text[]) returns boolean
language sql immutable as $$
  select cardinality(t) <= 6 and t <@ array[
    '과제', '시험', '팀플', '수면부족', '술병', '코딩에러', '연애', '알바',
    '취업·인턴', '통학', '돈', '건강', '날씨', '그냥', '기타'
  ]
$$;

create or replace function valid_grades(t text[]) returns boolean
language sql immutable as $$ select t <@ array['1학년', '2학년', '3학년', '4학년', '초과학기'] $$;

-- 일정 종류별 기본 가중치 (lib/weather.ts 의 EVENT_KINDS.weight 와 같다. 양수일수록 멘탈에 부담)
create or replace function kind_weight(k text) returns integer
language sql immutable as $$
  select case k when 'exam' then 20 when 'deadline' then 10 when 'presentation' then 10 when 'event' then -10 else 0 end
$$;

-- ───────── 샘플 표시 ─────────
alter table events add column if not exists is_sample boolean not null default false;
alter table posts add column if not exists is_sample boolean not null default false;
alter table post_comments add column if not exists is_sample boolean not null default false;
alter table alert_comments add column if not exists is_sample boolean not null default false;

-- ───────── 값 검사 (기존 행은 건드리지 않고 새 행부터 적용) ─────────
do $$
declare c record;
begin
  for c in select * from (values
    ('votes', 'votes_grade_valid', 'is_grade(grade)'),
    ('votes', 'votes_tags_valid', 'valid_tags(tags)'),
    ('posts', 'posts_grade_valid', 'grade is null or is_grade(grade)'),
    ('posts', 'posts_weather_valid', 'weather is null or is_weather(weather)'),
    ('posts', 'posts_nickname_len', 'char_length(nickname) between 1 and 20'),
    ('post_comments', 'post_comments_weather_valid', 'weather is null or is_weather(weather)'),
    ('post_comments', 'post_comments_nickname_len', 'char_length(nickname) between 1 and 20'),
    ('alert_comments', 'alert_comments_weather_valid', 'weather is null or is_weather(weather)'),
    ('alert_comments', 'alert_comments_nickname_len', 'char_length(nickname) between 1 and 20'),
    ('events', 'events_grades_valid', 'valid_grades(grades)'),
    ('events', 'events_time_len', 'time is null or char_length(time) <= 10')
  ) as x(tbl, name, expr) loop
    execute format('alter table %I drop constraint if exists %I', c.tbl, c.name);
    execute format('alter table %I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
  end loop;
end $$;

-- 투표 날짜는 서버(한국 시간)가 정한다. 보낸 값은 무시한다
alter table votes alter column date set default kst_today();

create or replace function votes_force_date() returns trigger
language plpgsql as $$
begin
  new.date := kst_today();
  new.created_at := now();
  return new;
end $$;

drop trigger if exists votes_force_date on votes;
create trigger votes_force_date before insert on votes for each row execute function votes_force_date();

-- ───────── 쓰기는 함수로만 ─────────
-- 테이블에 직접 넣거나 고치던 권한을 닫는다. 읽기 규칙은 그대로 둔다.
drop policy if exists "events insert" on events;
drop policy if exists "events update" on events;
drop policy if exists "revisions insert" on event_revisions;
drop policy if exists "posts insert" on posts;
drop policy if exists "post comments insert" on post_comments;
drop policy if exists "alert comments insert" on alert_comments;

-- 기기당 하루 횟수 제한. 글이나 댓글 행에는 기기 정보를 남기지 않고 이 표에만 센다
create table if not exists rate_limits (
  device_hash text not null,
  day date not null,
  action text not null,
  count integer not null default 0,
  primary key (device_hash, day, action)
);
alter table rate_limits enable row level security;

create or replace function bump_limit(dev text, act text, max_count integer) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if dev is null or char_length(dev) <> 64 then
    raise exception 'invalid_device' using errcode = 'P0001';
  end if;
  insert into rate_limits (device_hash, day, action, count) values (dev, kst_today(), act, 1)
  on conflict (device_hash, day, action) do update set count = rate_limits.count + 1
  returning count into n;
  if n > max_count then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
end $$;

create or replace function save_event(dev text, ev jsonb, act text) returns void
language plpgsql security definer set search_path = public as $$
declare
  row events;
  eid text := coalesce(nullif(ev->>'id', ''), gen_random_uuid()::text);
begin
  if act not in ('추가', '수정', '삭제', '되돌림') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if (ev->>'date')::date not between kst_today() - 366 and kst_today() + 366 then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  perform bump_limit(dev, 'event', 20);

  insert into events (id, title, date, kind, grades, time, place, deleted, updated_at)
  values (
    eid, ev->>'title', (ev->>'date')::date, ev->>'kind',
    coalesce(array(select jsonb_array_elements_text(ev->'grades')), '{}'),
    nullif(ev->>'time', ''), nullif(ev->>'place', ''),
    coalesce((ev->>'deleted')::boolean, false), now()
  )
  on conflict (id) do update set
    title = excluded.title, date = excluded.date, kind = excluded.kind, grades = excluded.grades,
    time = excluded.time, place = excluded.place, deleted = excluded.deleted, updated_at = now()
  returning * into row;

  -- 수정 기록은 저장된 행 그대로 남겨서 화면과 어긋나지 않게 한다
  insert into event_revisions (event_id, snapshot, action)
  values (eid, to_jsonb(row) - 'updated_at', act);
end $$;

create or replace function create_post(dev text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare pid text := coalesce(nullif(p->>'id', ''), gen_random_uuid()::text);
begin
  perform bump_limit(dev, 'post', 10);
  insert into posts (id, category, grade, weather, nickname, title, body)
  values (pid, p->>'category', p->>'grade', p->>'weather', p->>'nickname', p->>'title', p->>'body');
  return pid;
end $$;

create or replace function add_post_comment(dev text, c jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform bump_limit(dev, 'comment', 50);
  insert into post_comments (id, post_id, nickname, body, weather)
  values (coalesce(nullif(c->>'id', ''), gen_random_uuid()::text), c->>'post_id', c->>'nickname', c->>'body', c->>'weather');
end $$;

create or replace function add_alert_comment(dev text, c jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform bump_limit(dev, 'comment', 50);
  insert into alert_comments (id, alert_id, nickname, body, weather)
  values (coalesce(nullif(c->>'id', ''), gen_random_uuid()::text), c->>'alert_id', c->>'nickname', c->>'body', c->>'weather');
end $$;

-- 공감·신고는 같은 기기에서 한 번씩만
create table if not exists sunshines (
  post_id text not null references posts (id) on delete cascade,
  device_hash text not null,
  primary key (post_id, device_hash)
);
create table if not exists comment_reports (
  comment_id text not null references alert_comments (id) on delete cascade,
  device_hash text not null,
  primary key (comment_id, device_hash)
);
alter table sunshines enable row level security;
alter table comment_reports enable row level security;

drop function if exists add_sunshine(text);
drop function if exists report_alert_comment(text);

create or replace function add_sunshine(dev text, target text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if dev is null or char_length(dev) <> 64 then
    raise exception 'invalid_device' using errcode = 'P0001';
  end if;
  insert into sunshines (post_id, device_hash) values (target, dev) on conflict do nothing;
  if not found then return false; end if;
  update posts set likes = likes + 1 where id = target;
  return true;
end $$;

create or replace function report_alert_comment(dev text, target text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if dev is null or char_length(dev) <> 64 then
    raise exception 'invalid_device' using errcode = 'P0001';
  end if;
  insert into comment_reports (comment_id, device_hash) values (target, dev) on conflict do nothing;
  if not found then return false; end if;
  update alert_comments set reports = reports + 1 where id = target;
  return true;
end $$;

-- ───────── 실시간 집계 (5명 규칙 강화) ─────────
-- 5명 미만이면 점수, 원인 태그, 학년별 인원을 모두 가린다. 점수는 5점 단위로 반올림해 투표 하나하나를 역산하기 어렵게 한다.
drop function if exists today_stats(date) cascade;
create or replace function today_stats(target date default null) returns json
language sql stable security definer set search_path = public as $$
  with v as (
    select grade, weather_score(weather) as score, tags from votes where date = coalesce(target, kst_today())
  ),
  g as (
    select grade, count(*) as cnt, (round(avg(score) / 5) * 5)::int as score from v group by grade
  ),
  t as (
    select tag, count(*) as cnt from v, unnest(tags) as tag group by tag order by count(*) desc, tag limit 5
  )
  select json_build_object(
    'participants', (select count(*) from v),
    'overall_score', (select case when count(*) >= 5 then (round(avg(score) / 5) * 5)::int end from v),
    'by_grade', coalesce(
      (select json_agg(json_build_object(
        'grade', grade,
        'count', case when cnt >= 5 then cnt end,
        'score', case when cnt >= 5 then score end
      )) from g),
      '[]'::json
    ),
    'top_tags', case when (select count(*) from v) >= 5 then coalesce(
      (select json_agg(json_build_object('tag', tag, 'count', cnt) order by cnt desc, tag) from t),
      '[]'::json
    ) else '[]'::json end
  );
$$;

drop function if exists daily_scores(date, date);

-- ───────── 자정 기록 ─────────
create table if not exists daily_weather (
  day date not null,
  grade text not null check (grade = '전체' or is_grade(grade)),
  score integer,                         -- 5명 미만이면 null
  participants integer,                  -- 학년별은 5명 미만이면 null
  top_tags jsonb not null default '[]',
  events text[] not null default '{}',   -- 그날 그 학년에 해당하는 일정 종류 (중복 포함)
  is_sample boolean not null default false,
  primary key (day, grade)
);
alter table daily_weather enable row level security;
drop policy if exists "daily read" on daily_weather;
create policy "daily read" on daily_weather for select to anon using (true);

-- 그 학년에 해당하는 그날 일정 종류
create or replace function day_kinds(g text, d date) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(kind order by kind), '{}') from events
  where date = d and not deleted and (g = '전체' or cardinality(grades) = 0 or g = any(grades))
$$;

create or replace function close_day(d date) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from daily_weather where day = d and not is_sample;
  insert into daily_weather (day, grade, score, participants, top_tags, events)
  select d, gr.grade,
         case when s.cnt >= 5 then (round(s.avg_score / 5) * 5)::int end,
         case when gr.grade = '전체' or s.cnt >= 5 then coalesce(s.cnt, 0) end,
         case when s.cnt >= 5 then coalesce((
           select jsonb_agg(jsonb_build_object('tag', tag, 'count', n) order by n desc, tag)
           from (
             select tag, count(*) as n from votes v2, unnest(v2.tags) as tag
             where v2.date = d and (gr.grade = '전체' or v2.grade = gr.grade)
             group by tag order by count(*) desc, tag limit 5
           ) tt
         ), '[]') else '[]' end,
         day_kinds(gr.grade, d)
  from unnest(array['전체', '1학년', '2학년', '3학년', '4학년', '초과학기']) as gr(grade)
  left join lateral (
    select count(*)::int as cnt, avg(weather_score(weather)) as avg_score from votes v
    where v.date = d and (gr.grade = '전체' or v.grade = gr.grade)
  ) s on true
  on conflict (day, grade) do nothing;
end $$;

-- 매일 00:05 (한국 시간)에 어제를 마감한다. pg_cron 이 없는 환경에서는 건너뛴다.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 을 켤 수 없어 자동 마감을 건너뜁니다: %', sqlerrm;
    return;
  end;
  perform cron.schedule('close-day', '5 15 * * *', 'select close_day(kst_today() - 1)');
end $$;

-- ───────── 예측 ─────────
-- 머신러닝 계수 (ml/train.py 가 만든 SQL 로 채운다). 실제 관측일이 충분할 때만 쓴다
create table if not exists forecast_model (
  id integer primary key default 1 check (id = 1),
  use_ml boolean not null default false,
  coefs jsonb not null default '{}',
  metrics jsonb not null default '{}',
  trained_at timestamptz not null default now()
);
alter table forecast_model enable row level security;
drop policy if exists "model read" on forecast_model;
create policy "model read" on forecast_model for select to anon using (true);

-- 일정 종류별 영향: 그 종류가 있던 날의 평균 - 그 학년 평균. 관측일이 적으면 기본 가중치 쪽으로 당긴다
create or replace function event_effects(include_sample boolean default true, until date default null)
returns table (grade text, kind text, days integer, observed integer, effect integer)
language sql stable security definer set search_path = public as $$
  with h as (
    select dw.grade, dw.score, dw.events from daily_weather dw
    where dw.score is not null and (include_sample or not dw.is_sample)
      and dw.day < coalesce(until, kst_today() + 1)
  ),
  base as (select h.grade, avg(h.score) as avg_score from h group by h.grade),
  k as (
    select h.grade, kk.kind, count(*)::int as n, avg(h.score) as avg_score
    from h, lateral (select distinct unnest(h.events) as kind) kk
    group by h.grade, kk.kind
  )
  select g.grade, kinds.kind, coalesce(k.n, 0),
         round(k.avg_score - b.avg_score)::int,
         round((coalesce(k.n, 0) * coalesce(k.avg_score - b.avg_score, 0) + 5 * -kind_weight(kinds.kind))
               / (coalesce(k.n, 0) + 5))::int
  from unnest(array['전체', '1학년', '2학년', '3학년', '4학년', '초과학기']) as g(grade)
  cross join unnest(array['exam', 'deadline', 'presentation', 'room', 'event', 'etc']) as kinds(kind)
  left join base b on b.grade = g.grade
  left join k on k.grade = g.grade and k.kind = kinds.kind
$$;

create or replace function predict_day(target_grade text, d date) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  hist_base numeric;
  recent_base numeric;
  base numeric;
  kinds text[] := day_kinds(target_grade, d);
  eff record;
  total numeric := 0;
  best_kind text;
  best_effect integer := 0;
  best_days integer := 0;
  dow_n integer;
  dow_avg numeric;
  dow_effect numeric := 0;
  model forecast_model;
  real_days integer;
  feats jsonb;
  result numeric;
  method text := 'stats';
  exam_gap integer;
begin
  select avg(score) into hist_base from daily_weather
  where grade = target_grade and score is not null and day < d;
  select avg(score) into recent_base from daily_weather
  where grade = target_grade and score is not null and day < d and day >= d - 28;
  base := coalesce(recent_base, hist_base, 70);

  -- 일정 영향
  for eff in
    select e.kind, e.days, e.effect from event_effects(true, d) e
    where e.grade = target_grade and e.kind = any(kinds)
  loop
    total := total + eff.effect;
    if abs(eff.effect) > abs(best_effect) then
      best_kind := eff.kind; best_effect := eff.effect; best_days := eff.days;
    end if;
  end loop;

  -- 요일 영향
  select count(*), avg(score) into dow_n, dow_avg from daily_weather
  where grade = target_grade and score is not null and day < d and extract(dow from day) = extract(dow from d);
  if dow_n > 0 and hist_base is not null then
    dow_effect := dow_n * (dow_avg - hist_base) / (dow_n + 5);
  end if;

  result := base + total + dow_effect;

  -- 실제(샘플 아님) 관측일이 30일 이상 쌓이고 모델이 켜져 있으면 머신러닝 계수를 쓴다
  select * into model from forecast_model where id = 1;
  select count(distinct day) into real_days from daily_weather
  where not is_sample and score is not null and day < d;
  if model.use_ml and real_days >= 30 then
    select min(date - d) into exam_gap from events
    where kind = 'exam' and not deleted and date >= d and date <= d + 7
      and (target_grade = '전체' or cardinality(grades) = 0 or target_grade = any(grades));
    feats := jsonb_build_object(
      'base', base,
      'grade=' || target_grade, 1,
      'dow=' || extract(dow from d)::int, 1,
      'exam_gap', coalesce(exam_gap, 8)
    );
    feats := feats || coalesce((
      select jsonb_object_agg('kind=' || k, n) from (select k, count(*) as n from unnest(kinds) k group by k) x
    ), '{}');
    result := coalesce((model.coefs->>'intercept')::numeric, 0) + coalesce((
      select sum((model.coefs->'weights'->>f.key)::numeric * f.value::numeric)
      from jsonb_each_text(feats) f where model.coefs->'weights' ? f.key
    ), 0);
    method := 'ml';
  end if;

  return json_build_object(
    'score', greatest(0, least(100, round(result)))::int,
    'method', method,
    'base', round(base)::int,
    'kind', best_kind,
    'effect', best_effect,
    'days', best_days
  );
end $$;

-- 화면에서 부르는 함수만 anon 에게 연다 (close_day, bump_limit 은 열지 않는다)
revoke execute on function close_day(date) from public, anon;
revoke execute on function bump_limit(text, text, integer) from public, anon;
grant execute on function today_stats(date) to anon;
grant execute on function save_event(text, jsonb, text) to anon;
grant execute on function create_post(text, jsonb) to anon;
grant execute on function add_post_comment(text, jsonb) to anon;
grant execute on function add_alert_comment(text, jsonb) to anon;
grant execute on function add_sunshine(text, text) to anon;
grant execute on function report_alert_comment(text, text) to anon;
grant execute on function event_effects(boolean, date) to anon;
grant execute on function predict_day(text, date) to anon;

-- 실시간 반영에 기록 테이블 추가
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'daily_weather') then
    alter publication supabase_realtime add table daily_weather;
  end if;
end $$;
