-- 실제 사용자를 받기 전에 한 번만 실행한다.
-- 지금까지의 테스트 투표·글·댓글·일정 중 샘플이 아닌 것을 모두 지운다. 되돌릴 수 없다.
-- sample_data.sql 로 넣은 샘플(is_sample = true)은 남긴다.

delete from comment_reports;
delete from sunshines;
delete from post_comments where not is_sample;
delete from posts where not is_sample;
delete from alert_comments where not is_sample;
delete from event_revisions where event_id in (select id from events where not is_sample);
delete from events where not is_sample;
delete from votes;
delete from daily_weather where not is_sample;
delete from rate_limits;
