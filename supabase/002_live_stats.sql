-- 실시간 관측 집계 함수. schema.sql 을 이미 실행한 프로젝트라면 이 파일만 SQL Editor 에서 Run 하면 된다.
-- 개별 투표는 여전히 아무도 못 읽고, 이 함수들이 돌려주는 요약 숫자만 공개된다.
-- 5명 미만이면 점수를 null 로 돌려줘서 소수 인원의 투표가 드러나지 않게 한다.

create or replace function weather_score(w text) returns integer
language sql immutable as $$
  select case w when 'sunny' then 100 when 'clear' then 75 when 'cloudy' then 50 when 'rain' then 25 else 0 end;
$$;

create or replace function today_stats(target date) returns json
language sql stable security definer set search_path = public as $$
  with v as (
    select grade, weather_score(weather) as score, tags from votes where date = target
  ),
  g as (
    select grade, count(*) as cnt, round(avg(score))::int as score from v group by grade
  ),
  t as (
    select tag, count(*) as cnt from v, unnest(tags) as tag group by tag order by count(*) desc, tag limit 5
  )
  select json_build_object(
    'participants', (select count(*) from v),
    'overall_score', (select case when count(*) >= 5 then round(avg(score))::int end from v),
    'by_grade', coalesce(
      (select json_agg(json_build_object('grade', grade, 'count', cnt, 'score', case when cnt >= 5 then score end)) from g),
      '[]'::json
    ),
    'top_tags', coalesce(
      (select json_agg(json_build_object('tag', tag, 'count', cnt) order by cnt desc, tag) from t),
      '[]'::json
    )
  );
$$;

create or replace function daily_scores(start_date date, end_date date)
returns table (day date, score integer, participants integer)
language sql stable security definer set search_path = public as $$
  select v.date,
         case when count(*) >= 5 then round(avg(weather_score(v.weather)))::int end,
         count(*)::int
  from votes v
  where v.date between start_date and end_date
  group by v.date;
$$;

grant execute on function today_stats(date) to anon;
grant execute on function daily_scores(date, date) to anon;
