-- 3차 수정: 예보 달력의 '규봉이' 개인 달력.
-- 003 을 실행한 프로젝트에서 이 파일을 통째로 Run 한다. 여러 번 실행해도 된다.
-- 개인 일정은 events.grades = '{규봉이}' 로 저장하고, 학과 날씨 집계(daily_weather)와 예측에서는 뺀다.

-- 일정 대상: 학년 목록 안의 값이거나, '규봉이' 하나만
create or replace function valid_grades(t text[]) returns boolean
language sql immutable as $$
  select t <@ array['1학년', '2학년', '3학년', '4학년', '초과학기'] or t = array['규봉이']
$$;

-- 그날 그 학년(또는 전체)에 해당하는 일정 종류. 개인 일정은 넣지 않는다
create or replace function day_kinds(g text, d date) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(kind order by kind), '{}') from events
  where date = d and not deleted and not ('규봉이' = any(grades))
    and (g = '전체' or cardinality(grades) = 0 or g = any(grades))
$$;

-- 머신러닝 분기의 '시험까지 남은 일수'에서도 개인 일정을 뺀다 (나머지는 003 과 같다)
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
      and not ('규봉이' = any(grades))
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
