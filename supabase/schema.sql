-- SW학부 멘탈 기상청 DB 구조
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하면 된다.
-- 로그인 없는 익명 서비스라 anon 역할에 필요한 권한만 연다.

-- 컨디션 투표: 넣기만 가능, 개별 행은 아무도 읽을 수 없다 (집계는 3단계에서 함수로 제공)
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  grade text not null,
  weather text not null check (weather in ('sunny', 'clear', 'cloudy', 'rain', 'storm')),
  tags text[] not null default '{}',
  device_hash text not null,
  created_at timestamptz not null default now(),
  unique (date, device_hash)
);

-- 공용 캘린더 (위키 방식: 누구나 추가·수정, 삭제는 deleted 표시)
create table if not exists events (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(title) between 1 and 40),
  date date not null,
  kind text not null check (kind in ('exam', 'deadline', 'presentation', 'room', 'event', 'etc')),
  grades text[] not null default '{}',
  time text,
  place text check (char_length(place) <= 40),
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists event_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events (id),
  snapshot jsonb not null,
  action text not null check (action in ('추가', '수정', '삭제', '되돌림')),
  created_at timestamptz not null default now()
);

-- 현장 제보 게시판
create table if not exists posts (
  id text primary key default gen_random_uuid()::text,
  category text not null check (category in ('정보', '질문', '잡담', '분실물')),
  grade text,
  weather text,
  nickname text not null,
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 1000),
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists post_comments (
  id text primary key default gen_random_uuid()::text,
  post_id text not null references posts (id) on delete cascade,
  nickname text not null,
  body text not null check (char_length(body) between 1 and 200),
  weather text,
  created_at timestamptz not null default now()
);

-- 특보 댓글 (특보 자체는 3·4단계에서 DB로 옮긴다)
create table if not exists alert_comments (
  id text primary key default gen_random_uuid()::text,
  alert_id text not null,
  nickname text not null,
  body text not null check (char_length(body) between 1 and 200),
  weather text,
  reports integer not null default 0,
  created_at timestamptz not null default now()
);

-- 보안 규칙
alter table votes enable row level security;
alter table events enable row level security;
alter table event_revisions enable row level security;
alter table posts enable row level security;
alter table post_comments enable row level security;
alter table alert_comments enable row level security;

drop policy if exists "vote insert" on votes;
create policy "vote insert" on votes for insert to anon with check (true);

drop policy if exists "events read" on events;
drop policy if exists "events insert" on events;
drop policy if exists "events update" on events;
create policy "events read" on events for select to anon using (true);
create policy "events insert" on events for insert to anon with check (true);
create policy "events update" on events for update to anon using (true) with check (true);

drop policy if exists "revisions read" on event_revisions;
drop policy if exists "revisions insert" on event_revisions;
create policy "revisions read" on event_revisions for select to anon using (true);
create policy "revisions insert" on event_revisions for insert to anon with check (true);

drop policy if exists "posts read" on posts;
drop policy if exists "posts insert" on posts;
create policy "posts read" on posts for select to anon using (true);
create policy "posts insert" on posts for insert to anon with check (likes = 0);

drop policy if exists "post comments read" on post_comments;
drop policy if exists "post comments insert" on post_comments;
create policy "post comments read" on post_comments for select to anon using (true);
create policy "post comments insert" on post_comments for insert to anon with check (true);

drop policy if exists "alert comments read" on alert_comments;
drop policy if exists "alert comments insert" on alert_comments;
create policy "alert comments read" on alert_comments for select to anon using (true);
create policy "alert comments insert" on alert_comments for insert to anon with check (reports = 0);

-- 숫자 올리기는 행 전체 수정 대신 함수로만 허용한다
create or replace function add_sunshine(target text) returns void
language sql security definer set search_path = public as $$
  update posts set likes = likes + 1 where id = target;
$$;

create or replace function report_alert_comment(target text) returns void
language sql security definer set search_path = public as $$
  update alert_comments set reports = reports + 1 where id = target;
$$;

grant execute on function add_sunshine(text) to anon;
grant execute on function report_alert_comment(text) to anon;

-- 실시간 반영
do $$
declare t text;
begin
  foreach t in array array['events', 'event_revisions', 'posts', 'post_comments', 'alert_comments'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
