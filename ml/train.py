"""하루 기록으로 내일 날씨 예측 모델을 학습하고, 통계 방식과 비교한다.

입력은 관측 기록 화면(/records)에서 내려받은 CSV 또는 generate_sample.py 가 만든 CSV.
마지막 2주를 검증용으로 떼어 두고 세 가지를 비교한다.
  - 통계 방식 : predict_day SQL 함수와 같은 계산 (학년 평균 + 일정·요일 영향, 관측일 적으면 기본값 쪽으로)
  - Ridge 회귀 : 앱에 올릴 모델. 계수만 있으면 SQL 에서 바로 계산할 수 있다
  - GradientBoosting : 비교용. 계수로 옮길 수 없어서 앱에는 올리지 않는다

    ml/.venv/bin/python ml/train.py                      # 샘플 데이터
    ml/.venv/bin/python ml/train.py --csv 내려받은파일.csv  # 실제 기록

결과 계수는 ml/out/forecast_model.sql 로 저장된다. Supabase SQL Editor 에서 실행하면 반영된다.
(앱은 실제 관측일이 30일 이상일 때만 이 계수를 쓴다)
"""

import argparse
import csv
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error

ROOT = Path(__file__).resolve().parent
GRADES = ["1학년", "2학년", "3학년", "4학년", "초과학기"]
KINDS = ["exam", "deadline", "presentation", "room", "event", "etc"]
KIND_WEIGHT = {"exam": 20, "deadline": 10, "presentation": 10, "room": 0, "event": -10, "etc": 0}  # lib/weather.ts 와 같다
KIND_LABEL = {"exam": "시험", "deadline": "과제", "presentation": "발표", "room": "강의실", "event": "학과 행사", "etc": "기타"}
SHRINK = 5        # 관측일이 이만큼 있으면 실측과 기본값을 반반 섞는다 (SQL 과 같은 값)
TEST_DAYS = 14


def load(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["grade"] not in GRADES:
                continue
            rows.append({
                "day": dt.date.fromisoformat(r["day"]),
                "grade": r["grade"],
                "score": float(r["score"]) if r["score"] else None,
                "events": [k for k in r["events"].split(";") if k],
            })
    return sorted(rows, key=lambda r: (r["day"], r["grade"]))


def mean(xs, default=None):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else default


def features(row, history, by_grade_day):
    """predict_day 의 머신러닝 분기와 같은 특징을 만든다."""
    g, d = row["grade"], row["day"]
    prior = [h["score"] for h in history[g] if h["day"] < d and h["score"] is not None]
    recent = [h["score"] for h in history[g] if d - dt.timedelta(days=28) <= h["day"] < d and h["score"] is not None]
    base = mean(recent, mean(prior, 70))
    exam_gap = 8
    for k in range(0, 8):
        if "exam" in by_grade_day.get((g, d + dt.timedelta(days=k)), []):
            exam_gap = k
            break
    f = {"base": base, f"grade={g}": 1, f"dow={(d.weekday() + 1) % 7}": 1, "exam_gap": exam_gap}
    for k in KINDS:
        n = row["events"].count(k)
        if n:
            f[f"kind={k}"] = n
    return f


def stats_predict(row, train, history):
    """SQL predict_day 의 통계 분기를 그대로 옮긴 것."""
    g, d = row["grade"], row["day"]
    hist = [h for h in train if h["grade"] == g and h["score"] is not None and h["day"] < d]
    hist_base = mean(h["score"] for h in hist)
    recent = mean(h["score"] for h in hist if h["day"] >= d - dt.timedelta(days=28))
    base = recent if recent is not None else (hist_base if hist_base is not None else 70)
    total = 0.0
    for k in set(row["events"]):
        with_k = [h["score"] for h in hist if k in h["events"]]
        n = len(with_k)
        observed = (mean(with_k) - hist_base) if n else 0
        total += round((n * observed + SHRINK * -KIND_WEIGHT[k]) / (n + SHRINK))
    dow = [h["score"] for h in hist if h["day"].weekday() == d.weekday()]
    dow_effect = len(dow) * (mean(dow) - hist_base) / (len(dow) + SHRINK) if dow and hist_base is not None else 0
    return max(0, min(100, base + total + dow_effect))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(ROOT / "data" / "sample_daily.csv"))
    ap.add_argument("--alpha", type=float, default=1.0)
    args = ap.parse_args()

    rows = load(args.csv)
    scored = [r for r in rows if r["score"] is not None]
    last_day = max(r["day"] for r in rows)
    cut = last_day - dt.timedelta(days=TEST_DAYS - 1)
    train = [r for r in scored if r["day"] < cut]
    test = [r for r in scored if r["day"] >= cut]
    print(f"데이터: {args.csv}")
    print(f"학습 {len(train)}행 ({min(r['day'] for r in train)} ~ {cut - dt.timedelta(days=1)}), "
          f"검증 {len(test)}행 ({cut} ~ {last_day})")

    by_grade_day = defaultdict(list)
    for r in rows:
        by_grade_day[(r["grade"], r["day"])] = r["events"]

    # 학습용 특징: 각 날까지의 실제 기록을 본다
    history = defaultdict(list)
    for r in train:
        history[r["grade"]].append(r)
    feats_train = [features(r, history, by_grade_day) for r in train]
    # 검증용 특징: 검증 기간 시작 전 기록만 본다 (앞으로 2주를 미리 예측하는 상황)
    feats_test = [features(r, history, by_grade_day) for r in test]

    names = sorted({k for f in feats_train + feats_test for k in f})
    to_x = lambda fs: np.array([[f.get(n, 0) for n in names] for f in fs])
    x_train, x_test = to_x(feats_train), to_x(feats_test)
    y_train = np.array([r["score"] for r in train])
    y_test = np.array([r["score"] for r in test])

    ridge = Ridge(alpha=args.alpha).fit(x_train, y_train)
    gbr = GradientBoostingRegressor(random_state=0, n_estimators=200, max_depth=3, learning_rate=0.05).fit(x_train, y_train)
    clip = lambda p: np.clip(p, 0, 100)
    pred = {
        "통계 방식": np.array([stats_predict(r, train, history) for r in test]),
        "Ridge 회귀": clip(ridge.predict(x_test)),
        "GradientBoosting": clip(gbr.predict(x_test)),
        "학년 평균만": np.array([f["base"] for f in feats_test]),
    }

    print("\n검증 오차 (MAE, 낮을수록 좋음)")
    metrics = {}
    for name, p in pred.items():
        mae = mean_absolute_error(y_test, p)
        metrics[name] = round(float(mae), 2)
        print(f"  {name:<18} {mae:5.2f}점")

    weights = {n: round(float(c), 4) for n, c in zip(names, ridge.coef_)}
    print("\nRidge 가 배운 일정 영향 (같은 날 1건 기준)")
    for k in KINDS:
        if f"kind={k}" in weights:
            print(f"  {KIND_LABEL[k]:<6} {weights[f'kind={k}']:+6.1f}점")
    if "exam_gap" in weights:
        print(f"  시험까지 하루 멀어질 때마다 {weights['exam_gap']:+.1f}점")

    out = ROOT / "out"
    out.mkdir(exist_ok=True)
    model = {"intercept": round(float(ridge.intercept_), 4), "weights": weights}
    meta = {"mae": metrics, "train_rows": len(train), "test_rows": len(test), "source": Path(args.csv).name}
    sql = (
        "-- ml/train.py 가 만든 예측 모델 계수. 앱은 실제 관측일이 30일 이상일 때만 이 모델을 쓴다.\n"
        "insert into forecast_model (id, use_ml, coefs, metrics, trained_at)\n"
        f"values (1, true, '{json.dumps(model, ensure_ascii=False)}', '{json.dumps(meta, ensure_ascii=False)}', now())\n"
        "on conflict (id) do update set use_ml = excluded.use_ml, coefs = excluded.coefs,\n"
        "  metrics = excluded.metrics, trained_at = excluded.trained_at;\n"
    )
    (out / "forecast_model.sql").write_text(sql, encoding="utf-8")
    (out / "report.json").write_text(json.dumps({**meta, "model": model}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n→ {out / 'forecast_model.sql'}")


if __name__ == "__main__":
    main()
