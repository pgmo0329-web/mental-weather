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
4. 예시 데이터가 필요하면 `supabase/seed.sql` 도 같은 방법으로 **Run**. (여러 번 실행해도 중복되지 않는다)

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

## 보안 규칙 요약 (schema.sql)
| 테이블 | 읽기 | 쓰기 |
|---|---|---|
| votes | 불가 (개별 투표는 아무도 못 봄) | 추가만, 기기당 하루 1회 |
| events | 가능 | 추가·수정 (삭제는 표시만) |
| event_revisions | 가능 | 추가만 |
| posts / post_comments / alert_comments | 가능 | 추가만 |
| 공감·신고 수 | - | `add_sunshine`, `report_alert_comment` 함수로만 +1 |
