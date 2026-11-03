// 프로토타입에서는 투표를 브라우저에만 저장한다
import { dateKey, type Grade, type WeatherKey } from "./weather";

export type MyVote = { date: string; weather: WeatherKey; grade: Grade; tags: string[] };

const VOTE_KEY = "mw-vote";
const HISTORY_KEY = "mw-history";
const GRADE_KEY = "mw-grade";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getTodayVote(): MyVote | null {
  const vote = read<MyVote | null>(VOTE_KEY, null);
  return vote && vote.date === dateKey(new Date()) ? vote : null;
}

export function saveVote(vote: MyVote) {
  write(VOTE_KEY, vote);
  write(GRADE_KEY, vote.grade);
  const history = read<{ date: string; weather: WeatherKey }[]>(HISTORY_KEY, []);
  const next = [...history.filter((h) => h.date !== vote.date), { date: vote.date, weather: vote.weather }];
  write(HISTORY_KEY, next.slice(-14));
}

export function clearTodayVote() {
  try {
    localStorage.removeItem(VOTE_KEY);
  } catch {}
}

export function getSavedGrade(): Grade | null {
  return read<Grade | null>(GRADE_KEY, null);
}

// 최근 연속 폭풍 일수. 기기 안에서만 계산하고 서버로 보내지 않는다
export function stormStreak(): number {
  const history = read<{ date: string; weather: WeatherKey }[]>(HISTORY_KEY, []);
  const byDate = new Map(history.map((h) => [h.date, h.weather]));
  let streak = 0;
  const d = new Date();
  while (byDate.get(dateKey(d)) === "storm") {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
