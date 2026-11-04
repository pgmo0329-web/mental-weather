-- ml/train.py 가 만든 예측 모델 계수. 앱은 실제 관측일이 30일 이상일 때만 이 모델을 쓴다.
insert into forecast_model (id, use_ml, coefs, metrics, trained_at)
values (1, true, '{"intercept": 46.5459, "weights": {"base": 0.1276, "dow=0": 1.0534, "dow=1": -5.5367, "dow=2": -3.8508, "dow=3": -0.6528, "dow=4": -2.977, "dow=5": 5.8282, "dow=6": 6.1357, "exam_gap": 0.7951, "grade=1학년": 12.3024, "grade=2학년": 2.2792, "grade=3학년": -8.4407, "grade=4학년": -5.2657, "grade=초과학기": -0.8752, "kind=deadline": -8.6237, "kind=event": 5.3343, "kind=exam": -14.2761, "kind=presentation": -11.775, "kind=room": 0.5382}}', '{"mae": {"통계 방식": 7.77, "Ridge 회귀": 5.97, "GradientBoosting": 6.14, "학년 평균만": 9.02}, "train_rows": 244, "test_rows": 61, "source": "sample_daily.csv"}', now())
on conflict (id) do update set use_ml = excluded.use_ml, coefs = excluded.coefs,
  metrics = excluded.metrics, trained_at = excluded.trained_at;
