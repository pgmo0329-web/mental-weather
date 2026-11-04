# Supabase 연결 방법

연결 전에는 브라우저에만 저장되는 모드로 동작한다. 아래를 마치면 캘린더, 현장 제보, 특보 댓글, 투표가 DB에 저장되고 다른 사람 화면에도 실시간으로 반영된다.

## 1. 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project** 를 누른다.
2. 이름은 자유 (예: `mental-weather`), 지역은 **Northeast Asia (Seoul)** 을 고른다.
3. 데이터베이스 비밀번호는 따로 잘 보관한다 (앱에는 필요 없음).

## 2. 테이블 만들기
1. 왼쪽 메뉴 **SQL Editor** 를 연다.
2. `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**.
3. 이어서 `supabase/002_live_stats.sql` 도 **Run**. (실시간 관측 집계 함수)
4. 이어서 `supabase/003_daily_and_safety.sql` 도 **Run**. (자정 기록, 예측, 쓰기 함수, 악용 방지. `pg_cron` 을 켜고 매일 00:05 에 전날을 마감하도록 예약한다)
5. 샘플이 필요하면 `supabase/sample_data.sql` 도 **Run**. (`python3 ml/generate_sample.py` 로 다시 만들 수 있다. 다시 실행하면 이전 샘플을 지우고 새로 넣는다)

> 이미 쓰던 DB 의 예시·테스트 데이터를 모두 지우려면 `supabase/reset_sample.sql` 을 한 번 실행한다. 되돌릴 수 없다.

## 3. 앱에 연결 정보 넣기
1. **Project Settings > API** (또는 **Connect** 버튼) 에서 두 값을 확인한다.
   - Project URL
   - Publishable key (예전 화면에서는 `anon` `public` key)
2. 프로젝트 폴더의 `.env.example` 을 복사해 `.env.local` 을 만들고 두 값을 채운다.
3. 개발 서버를 껐다 다시 켠다. (.env.local 은 서버를 켤 때만 읽힌다)

> Publishable key 는 브라우저에 공개되도록 만들어진 키라 앱에 넣어도 된다.
> **service_role / secret key 는 절대 넣지 않는다.** 이 키는 모든 보안 규칙을 무시한다.

## 4. 확인
- 브라우저 두 개(또는 일반 창 + 시크릿 창)로 앱을 연다.
- 한쪽에서 캘린더 일정을 추가하거나 현장 제보에 글을 쓰면, 다른 쪽에도 몇 초 안에 나타나면 성공.
- 안 되면 브라우저 개발자 도구 콘솔에 `DB 저장 실패` / `불러오기 실패` 메시지가 있는지 본다.

## 보안 규칙 요약
| 테이블 | 읽기 | 쓰기 |
|---|---|---|
| votes | 불가 (개별 투표는 아무도 못 봄) | 추가만, 기기당 하루 1회. 날짜는 서버가 한국 시간으로 정함 |
| events, event_revisions | 가능 | `save_event` 함수로만 (일정 저장과 수정 기록을 한 번에), 기기당 하루 20회 |
| posts | 가능 | `create_post` 함수로만, 기기당 하루 10개 |
| post_comments, alert_comments | 가능 | `add_post_comment`, `add_alert_comment` 함수로만, 기기당 하루 50개 |
| 공감·신고 | - | `add_sunshine`, `report_alert_comment` 함수로만, 같은 기기는 한 번씩 |
| daily_weather | 가능 | 자정 마감 함수(`close_day`)만. 5명 미만은 점수·원인·인원을 가림 |
| rate_limits, sunshines, comment_reports | 불가 | 함수 안에서만 |

- 학년, 원인 태그, 날씨, 닉네임 길이, 일정 날짜 범위는 DB 가 검사한다.
- 기기 ID 는 브라우저가 만든 무작위 값이라, 브라우저 데이터를 지우면 새 기기로 취급된다. 로그인 없는 서비스라 이 정도가 현실적인 한계다.
- 횟수 제한은 `rate_limits` 표에만 기록하고, 글·댓글 행에는 기기 정보를 남기지 않는다.
