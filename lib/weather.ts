export type WeatherKey = "sunny" | "clear" | "cloudy" | "rain" | "storm";

export const WEATHERS: { key: WeatherKey; tint: string; emoji: string; label: string; score: number }[] = [
  { key: "sunny", tint: "bg-amber-50", emoji: "☀️", label: "쾌청", score: 100 },
  { key: "clear", tint: "bg-sky-50", emoji: "🌤️", label: "맑음", score: 75 },
  { key: "cloudy", tint: "bg-slate-100", emoji: "☁️", label: "흐림", score: 50 },
  { key: "rain", tint: "bg-blue-50", emoji: "🌧️", label: "비", score: 25 },
  { key: "storm", tint: "bg-violet-100", emoji: "⛈️", label: "폭풍", score: 0 },
];

export function scoreToWeather(score: number) {
  if (score >= 87.5) return WEATHERS[0];
  if (score >= 62.5) return WEATHERS[1];
  if (score >= 37.5) return WEATHERS[2];
  if (score >= 12.5) return WEATHERS[3];
  return WEATHERS[4];
}

export const GRADES = ["1학년", "2학년", "3학년", "4학년", "초과학기"] as const;
export type Grade = (typeof GRADES)[number];

export const TAGS = [
  "과제", "시험", "팀플", "수면부족", "술병", "코딩에러", "연애", "알바",
  "취업·인턴", "통학", "돈", "건강", "날씨", "그냥", "기타",
] as const;

export const SLOTS = [
  { key: "morning", label: "아침", time: "08:00" },
  { key: "noon", label: "점심", time: "12:00" },
  { key: "evening", label: "저녁", time: "18:00" },
] as const;
export type SlotKey = (typeof SLOTS)[number]["key"];

// 학년별 집계가 이 숫자보다 적으면 익명 보호를 위해 가린다
export const MIN_SAMPLE = 5;

export const EVENT_KINDS = [
  { key: "exam", icon: "⛈️", label: "시험", weight: 20, dot: "bg-rose-400", chip: "bg-rose-50 text-rose-600" },
  { key: "deadline", icon: "🌧️", label: "과제", weight: 10, dot: "bg-amber-400", chip: "bg-amber-50 text-amber-600" },
  { key: "presentation", icon: "🌩️", label: "발표", weight: 10, dot: "bg-violet-400", chip: "bg-violet-50 text-violet-600" },
  { key: "room", icon: "🧭", label: "강의실", weight: 0, dot: "bg-sky-400", chip: "bg-sky-50 text-sky-600" },
  { key: "event", icon: "☀️", label: "학과 행사", weight: -10, dot: "bg-emerald-400", chip: "bg-emerald-50 text-emerald-600" },
  { key: "etc", icon: "☁️", label: "기타", weight: 0, dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600" },
] as const;
export type EventKind = (typeof EVENT_KINDS)[number]["key"];

export function kindInfo(kind: EventKind) {
  return EVENT_KINDS.find((k) => k.key === kind)!;
}

export function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function formatDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return { md: `${m}/${d}`, dow: DOW[date.getDay()] };
}

export function randomNickname(grade: Grade | null) {
  return `${grade ?? "익명"} 관측자 ${Math.floor(Math.random() * 90) + 10}`;
}

export function weatherOf(key: WeatherKey) {
  return WEATHERS.find((w) => w.key === key)!;
}

export function weatherEmoji(key: WeatherKey | null | undefined) {
  return WEATHERS.find((w) => w.key === key)?.emoji ?? "🛰️";
}

// 예시 데이터처럼 날씨 정보가 없는 글은 id로 고정된 날씨를 붙인다
export function pseudoWeather(id: string): WeatherKey {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return WEATHERS[h % WEATHERS.length].key;
}

export function timeAgo(ts: number) {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 60 / 24)}일 전`;
}
