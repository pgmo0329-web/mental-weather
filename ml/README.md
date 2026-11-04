# 내일 날씨 예측 (ml/)

앱은 지금 **통계 방식**으로 내일 날씨를 예측해요 (`supabase/003_daily_and_safety.sql` 의 `predict_day`).
실제 관측일이 30일 이상 쌓이면, 여기서 학습한 **Ridge 회귀 모델**의 계수로 바꿔서 예측해요.

## 준비
```bash
python3 -m venv ml/.venv
ml/.venv/bin/pip install -r ml/requirements.txt
```

## 1. 샘플 데이터 만들기
```bash
python3 ml/generate_sample.py
```
- `supabase/sample_data.sql` : Supabase SQL Editor 에서 실행하면 샘플 학기(약 10주)가 들어가요. 모든 행은 `is_sample = true` 라 화면에 '샘플'로 표시돼요.
- `ml/data/sample_daily.csv` : 학습용 하루 기록

샘플 세계에는 정답 규칙이 있어요 (학년별 기본 점수, 요일 효과, 시험 −22점, 과제 −9점, 학과 행사 +9점, 시험 전날 −8점 + 잡음).
모델이 이 규칙을 얼마나 되찾는지로 학습이 제대로 되는지 확인할 수 있어요.

## 2. 학습하고 비교하기
```bash
ml/.venv/bin/python ml/train.py                       # 샘플
ml/.venv/bin/python ml/train.py --csv 내려받은파일.csv   # 관측 기록 화면에서 받은 실제 기록
```
마지막 2주를 검증용으로 떼어 두고 오차(MAE)를 비교해요.

| 방법 | 설명 |
|---|---|
| 학년 평균만 | 비교 기준선 |
| 통계 방식 | 지금 앱이 쓰는 방식. 일정·요일 영향을 관측일 수만큼 믿고 나머지는 기본값으로 보정 |
| Ridge 회귀 | 앱에 올릴 모델. 계수만 있으면 SQL 에서 바로 계산돼서 별도 서버가 필요 없음 |
| GradientBoosting | 비교용. 계수로 옮길 수 없어 앱에는 올리지 않음 |

특징: 최근 4주 평균, 학년, 요일, 그날 일정 종류별 개수, 시험까지 남은 일수(최대 8).

## 3. 앱에 반영하기
`ml/out/forecast_model.sql` 을 Supabase SQL Editor 에서 실행하면 `forecast_model` 테이블에 계수가 저장돼요.
`predict_day` 는 **샘플이 아닌 실제 관측일이 30일 이상일 때만** 이 계수를 쓰고, 그 전에는 통계 방식을 써요.
화면의 예측 근거 줄에 "머신러닝 모델로 예측"이라고 표시돼요.
