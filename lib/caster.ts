// AI 캐스터를 붙이기 전까지 쓰는 규칙 기반 멘트
import type { LiveStats } from "./data";
import { MIN_SAMPLE, scoreToWeather } from "./weather";

const LINES: Record<string, string> = {
  sunny: "학부 상공이 쾌청합니다. 오늘 같은 날은 커밋도 술술 풀리겠습니다.",
  clear: "대체로 맑은 하늘입니다. 가벼운 산책과 함께 코딩하기 좋은 날씨입니다.",
  cloudy: "학부 전역에 구름이 끼어 있습니다. 커피 한 잔으로 시야를 확보하세요.",
  rain: "곳곳에 과제 비가 내리고 있습니다. 서로에게 우산이 되어 주세요.",
  storm: "학부 전역에 폭풍이 몰아치고 있습니다. 무리하지 말고 잠깐 쉬어 가세요.",
};

export function liveCasterComment(stats: LiveStats) {
  if (stats.participants === 0) {
    return "아직 오늘 관측 자료가 들어오지 않았습니다. 첫 번째 관측자가 되어 주시겠어요?";
  }
  if (stats.overallScore === null) {
    return `현재 ${stats.participants}명의 관측자가 자료를 보내왔습니다. 익명 보호를 위해 ${MIN_SAMPLE}명 이상 모이면 날씨를 공개합니다.`;
  }
  const parts = [LINES[scoreToWeather(stats.overallScore).key]];
  const top = stats.topTags[0];
  if (top) parts.push(`특히 '#${top.tag}' 기압골이 가장 강하게 발달해 있습니다.`);
  const known = stats.byGrade.filter((g) => g.score !== null);
  if (known.length >= 2) {
    const worst = known.reduce((a, b) => (b.score! < a.score! ? b : a));
    parts.push(`${worst.grade} 지역이 가장 흐리니 주변을 한 번 챙겨 주세요.`);
  }
  return parts.join(" ");
}
