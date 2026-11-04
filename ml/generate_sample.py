"""가짜 학기 데이터를 만든다.

실제 사용자가 적을 때 예측·기록 화면과 머신러닝 학습을 시험하기 위한 샘플이다.
모든 행은 is_sample = true 로 들어가서 화면에 '샘플'로 표시된다.

출력
- supabase/sample_data.sql : Supabase SQL Editor 에서 실행 (날짜는 실행한 날 기준으로 맞춰진다)
- ml/data/sample_daily.csv  : train.py 가 읽는 하루 기록 (관측 기록 화면의 CSV 와 같은 형식)

    python ml/generate_sample.py
"""

import csv
import datetime as dt
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = 20261104
PAST_DAYS = 70       # 오늘 이전 기록 일수
FUTURE_DAYS = 14     # 앞으로 등록해 둘 일정 일수

GRADES = ["1학년", "2학년", "3학년", "4학년", "초과학기"]

# 샘플 세계의 '정답' 규칙. 예측 모델이 이 값을 얼마나 되찾는지 볼 수 있다
GRADE_BASE = {"1학년": 72, "2학년": 62, "3학년": 50, "4학년": 56, "초과학기": 58}
DOW_EFFECT = {0: 3, 1: -6, 2: -2, 3: 0, 4: -1, 5: 6, 6: 8}  # 0 = 일요일 (Postgres extract(dow) 와 같다)
KIND_EFFECT = {"exam": -22, "deadline": -9, "presentation": -12, "room": -1, "event": 9, "etc": 0}
EXAM_EVE = -8        # 시험 전날
NOISE = 7

COURSES = {
    "1학년": ["C프로그래밍", "이산수학", "컴퓨터개론"],
    "2학년": ["자료구조", "객체지향프로그래밍", "논리회로"],
    "3학년": ["운영체제", "알고리즘", "데이터베이스", "컴퓨터구조"],
    "4학년": ["캡스톤디자인", "웹프로그래밍", "소프트웨어공학"],
    "초과학기": ["졸업작품"],
}
DEPT_EVENTS = ["학과 취업 특강", "학부 해커톤", "학과 체육대회", "선배 멘토링 데이", "학생회 간식 행사"]
PLACES = ["공학관 101호", "공학관 214호", "공학관 312호", "세미나실", "대강당"]

KIND_TAGS = {"exam": "시험", "deadline": "과제", "presentation": "팀플"}
COMMON_TAGS = ["수면부족", "통학", "코딩에러", "그냥", "알바", "돈", "날씨"]

rng = random.Random(SEED)


def dow_of(offset: int, today_dow: int) -> int:
    return (today_dow + offset) % 7


def make_events(today_dow: int):
    """오프셋(오늘=0) 기준 일정 목록. 중간고사 주간, 주마다 과제, 가끔 발표·행사·강의실 변경."""
    events = []
    midterm = range(-38, -31)          # 약 5주 전이 중간고사 주간
    finals_soon = range(FUTURE_DAYS - 4, FUTURE_DAYS)

    def add(offset, title, kind, grades, time=None, place=None):
        events.append({"offset": offset, "title": title, "kind": kind, "grades": grades, "time": time, "place": place})

    for grade, courses in COURSES.items():
        for course in courses:
            # 중간고사
            if grade != "초과학기":
                add(rng.choice(list(midterm)), f"{course} 중간고사", "exam", [grade], f"{rng.choice([9, 10, 13, 15])}:00", rng.choice(PLACES))
            # 2주마다 과제 마감
            start = -PAST_DAYS + rng.randint(0, 6)
            for off in range(start, FUTURE_DAYS, 14):
                n = rng.randint(1, 4)
                add(off, f"{course} 과제 {n} 마감", "deadline", [grade], "23:59")
        # 퀴즈 한두 번
        for _ in range(rng.randint(1, 2)):
            add(rng.randint(-PAST_DAYS + 7, -3), f"{rng.choice(courses)} 퀴즈", "exam", [grade], "09:00")
        # 발표
        add(rng.randint(-25, -5), f"{rng.choice(courses)} 팀 발표", "presentation", [grade], "14:00", "세미나실")
        add(rng.randint(3, FUTURE_DAYS - 1), f"{rng.choice(courses)} 중간 발표", "presentation", [grade], "14:00", "세미나실")
        # 강의실 변경
        add(rng.randint(-PAST_DAYS, FUTURE_DAYS - 1), f"{rng.choice(courses)} 강의실 변경", "room", [grade], "13:00",
            f"{rng.choice(PLACES)} → {rng.choice(PLACES)}")
        # 기말 대비 시험이 다가옴
        if grade != "초과학기":
            add(rng.choice(list(finals_soon)), f"{courses[0]} 쪽지시험", "exam", [grade], "10:00")

    for title in DEPT_EVENTS:
        add(rng.randint(-PAST_DAYS + 3, FUTURE_DAYS - 1), title, "event", [], "16:00", "대강당")
    add(rng.randint(-60, -50), "졸업작품 중간 점검", "deadline", ["4학년", "초과학기"], "17:00")

    # 주말에 걸린 시험·과제는 평일로 옮긴다
    for ev in events:
        while ev["kind"] in ("exam", "presentation") and dow_of(ev["offset"], today_dow) in (0, 6):
            ev["offset"] += 1
    return sorted(events, key=lambda e: e["offset"])


def kinds_for(events, grade, offset):
    return sorted(e["kind"] for e in events
                  if e["offset"] == offset and (grade == "전체" or not e["grades"] or grade in e["grades"]))


def round5(x):
    return int(round(x / 5) * 5)


def simulate(events, today_dow):
    """학년별 하루 결과. 5명 미만이면 점수를 가리는 규칙도 그대로 따른다."""
    rows = []
    for off in range(-PAST_DAYS, 0):
        dow = dow_of(off, today_dow)
        per_grade = []
        for grade in GRADES:
            kinds = kinds_for(events, grade, off)
            score = GRADE_BASE[grade] + DOW_EFFECT[dow]
            score += sum(KIND_EFFECT[k] for k in set(kinds))
            if any(e["kind"] == "exam" and e["offset"] == off + 1 and (not e["grades"] or grade in e["grades"]) for e in events):
                score += EXAM_EVE
            if grade == "4학년":
                score -= (off + PAST_DAYS) * 0.12   # 취업 시즌으로 갈수록 하락
            score = max(0, min(100, score + rng.gauss(0, NOISE)))
            people = rng.randint(3, 38) if grade != "초과학기" else rng.randint(2, 9)
            tags = {}
            for k in kinds:
                if k in KIND_TAGS:
                    tags[KIND_TAGS[k]] = tags.get(KIND_TAGS[k], 0) + rng.randint(people // 3, people // 2 + 1)
            for t in rng.sample(COMMON_TAGS, 3):
                tags[t] = tags.get(t, 0) + rng.randint(1, max(1, people // 3))
            top = sorted(tags.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
            per_grade.append((grade, score, people, top, kinds))

        total_people = sum(p for _, _, p, _, _ in per_grade)
        total_score = sum(s * p for _, s, p, _, _ in per_grade) / total_people
        total_tags = {}
        for *_, top, _ in per_grade:
            for t, c in top:
                total_tags[t] = total_tags.get(t, 0) + c
        rows.append({
            "offset": off, "grade": "전체", "score": round5(total_score), "participants": total_people,
            "top_tags": sorted(total_tags.items(), key=lambda kv: (-kv[1], kv[0]))[:5],
            "events": kinds_for(events, "전체", off),
        })
        for grade, score, people, top, kinds in per_grade:
            hidden = people < 5
            rows.append({
                "offset": off, "grade": grade,
                "score": None if hidden else round5(score),
                "participants": None if hidden else people,
                "top_tags": [] if hidden else top,
                "events": kinds,
            })
    return rows


POSTS = [
    ("정보", "3학년", "rain", "운영체제 과제 질문 모음 정리했어요",
     "조교님 답변이랑 단톡에서 나온 질문 정리했어요.\n1. fork 후 wait 꼭 호출\n2. 타임퀀텀은 명세의 10ms 기준\n3. 보고서는 PDF로만 제출", 120,
     [("관측자 41", "cloudy", "감사합니다 ㅠㅠ 2번 몰랐어요"), ("관측자 63", "storm", "3번 진짜 중요")]),
    ("질문", "1학년", "storm", "이중 포인터가 도저히 이해가 안 돼요",
     "int **p 같은 게 나오면 머리가 하얘집니다... 설명 자료 있을까요?", 260,
     [("관측자 27", "clear", "상자 안에 상자 주소가 들어있다고 그려보세요")]),
    ("잡담", None, "sunny", "중문 새로 생긴 국밥집 가본 사람",
     "시험 끝나고 가보려는데 맛있나요? 혼밥 가능한지도 궁금", 500, []),
    ("분실물", "2학년", "cloudy", "공학관 3층 실습실에서 에어팟 케이스 주웠어요",
     "흰색 케이스에 스티커 붙어 있어요. 학과 사무실에 맡겨둘게요.", 900, []),
    ("정보", None, "clear", "학부 해커톤 신청 이번 주까지래요",
     "팀 2~4명, 주제 자유. 학과 공지 게시판에 신청 링크 있어요.", 1500,
     [("관측자 15", "sunny", "같이 나갈 2학년 구해요")]),
]


def q(s):
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def arr(items):
    return "'{" + ",".join(items) + "}'"


def to_sql(events, rows):
    out = [
        "-- ml/generate_sample.py 가 만든 샘플 데이터. 모든 행이 is_sample = true 로 들어간다.",
        "-- 003_daily_and_safety.sql 다음에 실행한다. 다시 실행하면 이전 샘플을 지우고 새로 넣는다.",
        "",
        "delete from post_comments where is_sample;",
        "delete from posts where is_sample;",
        "delete from alert_comments where is_sample;",
        "delete from event_revisions where event_id in (select id from events where is_sample);",
        "delete from events where is_sample;",
        "delete from daily_weather where is_sample;",
        "",
        "insert into events (id, title, date, kind, grades, time, place, is_sample) values",
    ]
    vals = []
    for i, e in enumerate(events):
        vals.append(f"  ('s-e{i}', {q(e['title'])}, kst_today() + {e['offset']}, {q(e['kind'])}, "
                    f"{arr(e['grades'])}, {q(e['time'])}, {q(e['place'])}, true)")
    out.append(",\n".join(vals) + ";")
    out += [
        "",
        "insert into event_revisions (event_id, snapshot, action, created_at)",
        "select id, to_jsonb(events) - 'updated_at', '추가', now() - interval '80 days' from events where is_sample;",
        "",
        "insert into daily_weather (day, grade, score, participants, top_tags, events, is_sample) values",
    ]
    vals = []
    for r in rows:
        tags = json.dumps([{"tag": t, "count": c} for t, c in r["top_tags"]], ensure_ascii=False)
        vals.append(f"  (kst_today() + {r['offset']}, {q(r['grade'])}, {r['score'] if r['score'] is not None else 'null'}, "
                    f"{r['participants'] if r['participants'] is not None else 'null'}, {q(tags)}, {arr(r['events'])}, true)")
    out.append(",\n".join(vals))
    out.append("on conflict (day, grade) do nothing;")
    out += ["", "insert into posts (id, category, grade, weather, nickname, title, body, likes, created_at, is_sample) values"]
    vals, cvals = [], []
    for i, (cat, grade, weather, title, body, minutes, comments) in enumerate(POSTS):
        vals.append(f"  ('s-p{i}', {q(cat)}, {q(grade)}, {q(weather)}, '관측자 {rng.randint(10, 99)}', {q(title)}, "
                    f"{q(body)}, {rng.randint(0, 25)}, now() - interval '{minutes} minutes', true)")
        for j, (nick, w, text) in enumerate(comments):
            cvals.append(f"  ('s-pc{i}-{j}', 's-p{i}', {q(nick)}, {q(text)}, {q(w)}, "
                         f"now() - interval '{max(1, minutes - 10 * (j + 1))} minutes', true)")
    out.append(",\n".join(vals) + ";")
    if cvals:
        out += ["", "insert into post_comments (id, post_id, nickname, body, weather, created_at, is_sample) values",
                ",\n".join(cvals) + ";"]
    return "\n".join(out) + "\n"


KIND_LABEL = {"exam": "시험", "deadline": "과제", "presentation": "발표", "room": "강의실", "event": "학과 행사", "etc": "기타"}


def to_csv(rows, path, today):
    # 관측 기록 화면의 CSV 와 같은 모양: 일정은 종류마다 칸을 나눠 그날 건수를 적는다
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["day", "grade", "score", "participants", *KIND_LABEL.values(), "top_tags", "is_sample"])
        for r in rows:
            w.writerow([(today + dt.timedelta(days=r["offset"])).isoformat(), r["grade"], "" if r["score"] is None else r["score"],
                        "" if r["participants"] is None else r["participants"], *(r["events"].count(k) for k in KIND_LABEL),
                        ";".join(f"{t}:{c}" for t, c in r["top_tags"]), "true"])


def main():
    # 날짜는 SQL 쪽에서 kst_today() 기준 오프셋으로 넣으므로, 요일만 맞추면 된다.
    # 실행한 날의 한국 요일을 기준으로 삼는다
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    today_dow = int(today.strftime("%w"))

    events = make_events(today_dow)
    rows = simulate(events, today_dow)
    (ROOT / "supabase" / "sample_data.sql").write_text(to_sql(events, rows), encoding="utf-8")
    to_csv(rows, ROOT / "ml" / "data" / "sample_daily.csv", today)
    print(f"일정 {len(events)}개, 하루 기록 {len(rows)}행, 글 {len(POSTS)}개 생성")
    print("→ supabase/sample_data.sql, ml/data/sample_daily.csv")


if __name__ == "__main__":
    main()
