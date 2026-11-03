-- 예시 데이터. schema.sql 을 먼저 실행한 뒤 한 번만 실행한다.

insert into events (id, title, date, kind, grades, time, place) values
  ('e1', '자료구조 과제 3 마감', current_date + -2, 'deadline', '{2학년}', '23:59', null),
  ('e2', '학과 취업 특강', current_date + -1, 'event', '{}', '16:00', '공학관 대강당'),
  ('e3', '알고리즘 강의실 변경', current_date + 0, 'room', '{3학년}', '13:00', '공학관 214호 → 312호'),
  ('e4', '운영체제 과제 2 마감', current_date + 1, 'deadline', '{3학년}', '23:59', null),
  ('e5', 'C프로그래밍 실습 마감', current_date + 1, 'deadline', '{1학년}', '18:00', null),
  ('e6', '자료구조 중간고사', current_date + 2, 'exam', '{2학년}', '10:00', '공학관 101호'),
  ('e7', '캡스톤 중간 발표', current_date + 2, 'presentation', '{4학년}', '14:00', '세미나실'),
  ('e8', '컴퓨터구조 퀴즈', current_date + 3, 'exam', '{3학년}', '09:00', null),
  ('e9', '학부 해커톤', current_date + 5, 'event', '{}', '10:00', '공학관 로비'),
  ('e10', '이산수학 보강', current_date + 7, 'room', '{1학년}', '15:00', '공학관 205호'),
  ('e11', '데이터베이스 팀플 중간 보고서', current_date + 9, 'deadline', '{3학년}', '23:59', null),
  ('e12', '객체지향 프로젝트 제안서', current_date + 11, 'deadline', '{2학년}', '18:00', null),
  ('e13', '학과 체육대회', current_date + 14, 'event', '{}', null, '대운동장'),
  ('e14', '웹프로그래밍 시험', current_date + 16, 'exam', '{4학년}', '13:00', null),
  ('e15', '졸업작품 최종 제출', current_date + 20, 'deadline', '{4학년,초과학기}', '17:00', null)
on conflict (id) do nothing;

insert into event_revisions (event_id, snapshot, action, created_at)
select id, to_jsonb(events) - 'updated_at', '추가', now() - interval '1 day' from events
where id like 'e%' and not exists (select 1 from event_revisions r where r.event_id = events.id);
insert into posts (id, category, grade, nickname, title, body, likes, created_at) values
  ('p1', '정보', '3학년', '3학년 관측자 76', '운영체제 과제 2 질문 모음 정리했어요',
   E'조교님 답변이랑 단톡에서 나온 질문들 정리했어요.\n\n1. fork 후 wait 안 하면 좀비 프로세스 생김 → 꼭 wait 호출\n2. 스케줄러 타임퀀텀은 과제 명세의 10ms 기준\n3. 보고서는 PDF로만 제출\n\n틀린 거 있으면 댓글로 알려주세요!',
   24, now() - interval '35 minutes'),
  ('p2', '질문', '1학년', '1학년 관측자 97', '이중 포인터가 도저히 이해가 안 돼요 ㅠ',
   'int **p 이런 거 나오면 머리가 하얘집니다... 좋은 설명 자료 있을까요?', 3, now() - interval '80 minutes'),
  ('p3', '잡담', null, '익명 관측자 21', '중문 새로 생긴 국밥집 가본 사람',
   '시험 끝나고 가보려는데 맛있나요? 혼밥 가능한지도 궁금', 11, now() - interval '140 minutes'),
  ('p4', '분실물', null, '익명 관측자 28', '공학관 3층 실습실에서 에어팟 케이스 주웠어요',
   '흰색 케이스, 스티커 붙어 있어요. 학과 사무실에 맡겨뒀습니다!', 2, now() - interval '200 minutes'),
  ('p5', '정보', '4학년', '4학년 관측자 35', '여름 인턴 지원 후기 + 포트폴리오 팁',
   '작년에 지원했던 경험 공유해요. 깃허브 README 정리가 생각보다 중요했고, 프로젝트는 많이보다 하나를 깊게 설명하는 게 좋았어요.',
   31, now() - interval '26 hours'),
  ('p6', '질문', '2학년', '2학년 관측자 49', '자료구조 중간고사 범위 어디까지인가요?',
   '트리까지인지 그래프까지인지 헷갈려요', 6, now() - interval '5 hours')
on conflict (id) do nothing;

insert into post_comments (id, post_id, nickname, body, created_at) values
  ('pc1', 'p1', '3학년 관측자 83', '천사세요? 2번 몰랐는데 감사합니다', now() - interval '30 minutes'),
  ('pc2', 'p1', '3학년 관측자 90', '보고서 분량 제한도 있나요?', now() - interval '12 minutes'),
  ('pc3', 'p2', '2학년 관측자 14', '그림으로 박스 그려가면서 보면 훨씬 나아요! 주소를 담은 상자를 또 담은 상자', now() - interval '60 minutes'),
  ('pc4', 'p5', '3학년 관측자 42', '선배 감사합니다 🙏', now() - interval '20 hours'),
  ('pc5', 'p6', '2학년 관측자 56', '수업 때 트리까지라고 하셨어요!', now() - interval '4 hours')
on conflict (id) do nothing;

insert into alert_comments (id, alert_id, nickname, body, reports, created_at) values
  ('c1', 'a1', '3학년 관측자 27', '스케줄러 구현하다가 내 일정이 스케줄링 안 됨', 0, now() - interval '42 minutes'),
  ('c2', 'a1', '3학년 관측자 34', '경보 맞음 ㅋㅋㅋㅋ 지금 실습실 만석', 0, now() - interval '37 minutes'),
  ('c3', 'a1', '4학년 관측자 41', '작년에 저도 저기서 살아 나왔습니다. 힘내세요', 0, now() - interval '30 minutes'),
  ('c4', 'a1', '3학년 관측자 48', 'fork 하다가 프로세스도 나도 좀비 됨', 0, now() - interval '12 minutes'),
  ('c5', 'a2', '2학년 관측자 55', '휴강이면 진짜 운동장 한 바퀴 뜀', 0, now() - interval '25 minutes'),
  ('c6', 'a2', '1학년 관측자 62', '출처가 어디예요??', 0, now() - interval '22 minutes'),
  ('c7', 'a2', '익명 관측자 69', '내 꿈에서 봄', 1, now() - interval '20 minutes')
on conflict (id) do nothing;
