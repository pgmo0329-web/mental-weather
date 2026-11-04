// 화면들이 쓰는 데이터 저장소.
// Supabase 연결 정보가 있으면 DB에서 읽고 쓰며, 다른 사람의 변경도 실시간으로 받아온다.
// 연결 정보가 없으면 지금 브라우저에만 저장한다 (같은 브라우저의 다른 탭에는 반영됨).
// DB 쓰기는 모두 DB 함수(RPC)로 한다. 함수가 값 검사와 기기당 하루 횟수 제한을 맡는다.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import {
  initialAlertComments, initialEvents, initialPosts, mockDaily,
  type AlertComment, type CalEvent, type DailyRow, type Post, type PostCategory,
} from "./mock";
import { supabase } from "./supabase";
import { kindInfo, type EventKind, type Grade, type WeatherKey } from "./weather";

export const isOnline = supabase !== null;

export type StoredEvent = CalEvent & { deleted: boolean };

export type Revision = {
  id: string;
  eventId: string;
  snapshot: StoredEvent;
  action: "추가" | "수정" | "삭제" | "되돌림";
  at: number;
};

type Store<T> = {
  get: () => T;
  set: (updater: (prev: T) => T) => void;
  subscribe: (listener: () => void) => () => void;
};

function createStore<T>(opts: {
  key: string;
  local: () => T; // 로컬 모드 첫 데이터
  empty: T; // DB 모드에서 불러오기 전 값
  load?: () => Promise<T>;
  tables?: string[];
  pollMs?: number; // 실시간 알림을 못 쓰는 데이터는 주기적으로 다시 불러온다
}): Store<T> & { refresh: () => Promise<void>; loaded: () => boolean } {
  let cache: T | undefined;
  let loaded = !supabase;
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function get(): T {
    if (cache === undefined) {
      if (supabase) {
        cache = opts.empty;
      } else {
        try {
          const raw = localStorage.getItem(opts.key);
          cache = raw ? (JSON.parse(raw) as T) : opts.local();
        } catch {
          cache = opts.local();
        }
      }
    }
    return cache;
  }

  function set(updater: (prev: T) => T) {
    cache = updater(get());
    if (!supabase) {
      try {
        localStorage.setItem(opts.key, JSON.stringify(cache));
      } catch {}
    }
    emit();
  }

  async function refresh() {
    if (!opts.load) return;
    try {
      cache = await opts.load();
      loaded = true;
      emit();
    } catch (e) {
      console.error(`[${opts.key}] 불러오기 실패`, e);
    }
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);

    if (supabase && listeners.size === 1) {
      refresh();
      channel = supabase.channel(`live-${opts.key}`);
      for (const table of opts.tables ?? []) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, () => refresh());
      }
      channel.subscribe();
      if (opts.pollMs) timer = setInterval(refresh, opts.pollMs);
    }

    const onStorage = (e: StorageEvent) => {
      if (supabase || e.key !== opts.key) return;
      cache = undefined;
      listener();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
      if (supabase && channel && listeners.size === 0) {
        supabase.removeChannel(channel);
        channel = null;
        if (timer) clearInterval(timer);
        timer = null;
      }
    };
  }

  return { get, set, subscribe, refresh, loaded: () => loaded };
}

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

// ---- 알림 (저장 실패 등)

export type Toast = { id: number; text: string } | null;
export const toastStore = createStore<Toast>({ key: "mw-toast", local: () => null, empty: null });
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(text: string) {
  toastStore.set(() => ({ id: Date.now(), text }));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastStore.set(() => null), 3500);
}

// DB 함수가 보내는 오류를 사람이 읽을 문장으로 바꾼다. 실패하면 false
function report(error: { message?: string } | null | undefined) {
  if (!error) return true;
  console.error("DB 저장 실패", error);
  const msg = error.message ?? "";
  if (msg.includes("rate_limit")) showToast("오늘 이 기기에서 쓸 수 있는 횟수를 다 썼어요. 내일 다시 써 주세요.");
  else if (msg.includes("check constraint") || msg.includes("invalid")) showToast("입력한 값이 올바르지 않아 저장하지 못했어요.");
  else showToast("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return false;
}

// ---- 익명 기기 ID. 서버에는 해시만 보낸다

function deviceId() {
  try {
    let id = localStorage.getItem("mw-device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("mw-device", id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const deviceHash = () => sha256(deviceId());

// 글마다 고정되는 익명 번호. 같은 글 안에서는 같은 번호, 다른 글에서는 다른 번호가 나온다.
// 기기 ID는 이 계산에만 쓰고 서버에는 '관측자 123' 문자열만 저장된다
export async function threadNickname(threadId: string) {
  const h = await sha256(`${deviceId()}:${threadId}`);
  return `관측자 ${(parseInt(h.slice(0, 8), 16) % 900) + 100}`;
}

// ---- DB 행 ↔ 화면 데이터 변환

type EventRow = {
  id: string; title: string; date: string; kind: EventKind; grades: Grade[] | null;
  time: string | null; place: string | null; deleted: boolean; is_sample?: boolean;
};

function toEvent(r: EventRow): StoredEvent {
  return {
    id: r.id, title: r.title, date: r.date, kind: kindInfo(r.kind).key, grades: r.grades ?? [],
    time: r.time ?? undefined, place: r.place ?? undefined, deleted: r.deleted, isSample: r.is_sample ?? false,
  };
}

function toEventRow(e: StoredEvent) {
  return {
    id: e.id, title: e.title, date: e.date, kind: e.kind, grades: e.grades,
    time: e.time ?? null, place: e.place ?? null, deleted: e.deleted,
  };
}

type CommentRow = {
  id: string; nickname: string; body: string; weather: WeatherKey | null; created_at: string; is_sample: boolean;
};
type PostRow = {
  id: string; category: PostCategory; grade: Grade | null; weather: WeatherKey | null; nickname: string;
  title: string; body: string; likes: number; created_at: string; is_sample: boolean; post_comments: CommentRow[];
};
type AlertCommentRow = CommentRow & { alert_id: string; reports: number };

const ts = (iso: string) => new Date(iso).getTime();

const markSample = <T extends object>(items: T[]) => items.map((x) => ({ ...x, isSample: true }));

// ---- 저장소

export const eventsStore = createStore<StoredEvent[]>({
  key: "mw-events-v3",
  local: () => markSample(initialEvents(startOfToday())).map((e) => ({ ...e, deleted: false })),
  empty: [],
  tables: ["events"],
  load: async () => {
    const { data, error } = await supabase!.from("events").select("*");
    if (error) throw error;
    predictionStore.set(() => ({})); // 일정이 바뀌면 예측도 다시 계산한다
    return (data as EventRow[]).map(toEvent);
  },
});

export const revisionsStore = createStore<Revision[]>({
  key: "mw-revisions-v3",
  local: () =>
    eventsStore.get().map((e) => ({
      id: `r-${e.id}`, eventId: e.id, snapshot: e, action: "추가", at: Date.now() - 24 * 60 * 60000,
    })),
  empty: [],
  tables: ["event_revisions"],
  load: async () => {
    const { data, error } = await supabase!
      .from("event_revisions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    return data.map((r) => ({
      id: r.id, eventId: r.event_id, snapshot: toEvent({ ...r.snapshot, id: r.event_id }), action: r.action, at: ts(r.created_at),
    }));
  },
});

export const postsStore = createStore<Post[]>({
  key: "mw-posts-v3",
  local: () =>
    markSample(initialPosts(Date.now())).map((p) => ({ ...p, comments: markSample(p.comments) })),
  empty: [],
  tables: ["posts", "post_comments"],
  load: async () => {
    const { data, error } = await supabase!
      .from("posts")
      .select("*, post_comments(*)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data as PostRow[]).map((p) => ({
      id: p.id, category: p.category, grade: p.grade, weather: p.weather ?? undefined, nickname: p.nickname,
      title: p.title, body: p.body, likes: p.likes, createdAt: ts(p.created_at), isSample: p.is_sample,
      comments: p.post_comments
        .map((c) => ({
          id: c.id, nickname: c.nickname, body: c.body, weather: c.weather ?? undefined,
          createdAt: ts(c.created_at), isSample: c.is_sample,
        }))
        .sort((a, b) => a.createdAt - b.createdAt),
    }));
  },
});

export const alertCommentsStore = createStore<AlertComment[]>({
  key: "mw-alert-comments-v2",
  local: () => markSample(initialAlertComments(Date.now())),
  empty: [],
  tables: ["alert_comments"],
  load: async () => {
    const { data, error } = await supabase!.from("alert_comments").select("*").order("created_at").limit(500);
    if (error) throw error;
    return (data as AlertCommentRow[]).map((c) => ({
      id: c.id, alertId: c.alert_id, nickname: c.nickname, body: c.body, weather: c.weather ?? undefined,
      reports: c.reports, createdAt: ts(c.created_at), isSample: c.is_sample,
    }));
  },
});

// 자정마다 저장되는 하루 기록 (최근 약 4달)
type DailyDbRow = {
  day: string; grade: DailyRow["grade"]; score: number | null; participants: number | null;
  top_tags: { tag: string; count: number }[]; events: EventKind[]; is_sample: boolean;
};

export const dailyStore = createStore<DailyRow[]>({
  key: "mw-daily-v1",
  local: () => mockDaily(startOfToday()),
  empty: [],
  tables: ["daily_weather"],
  load: async () => {
    const { data, error } = await supabase!
      .from("daily_weather")
      .select("*")
      .order("day", { ascending: true })
      .limit(1000);
    if (error) throw error;
    return (data as DailyDbRow[]).map((r) => ({
      day: r.day, grade: r.grade, score: r.score, participants: r.participants,
      topTags: r.top_tags ?? [], events: r.events ?? [], isSample: r.is_sample,
    }));
  },
});

// ---- 쓰기. 화면에는 먼저 반영하고, DB 모드면 DB에도 저장한다. 실패하면 DB 값으로 되돌린다

export async function saveEvent(ev: StoredEvent, action: Revision["action"]) {
  predictionStore.set(() => ({}));
  eventsStore.set((prev) => (prev.some((e) => e.id === ev.id) ? prev.map((e) => (e.id === ev.id ? ev : e)) : [...prev, ev]));
  revisionsStore.set((prev) =>
    [{ id: crypto.randomUUID(), eventId: ev.id, snapshot: ev, action, at: Date.now() }, ...prev].slice(0, 300),
  );
  if (!supabase) return;
  const { error } = await supabase.rpc("save_event", { dev: await deviceHash(), ev: toEventRow(ev), act: action });
  if (!report(error)) {
    eventsStore.refresh();
    revisionsStore.refresh();
  }
}

export async function createPost(post: Post) {
  postsStore.set((prev) => [post, ...prev]);
  if (!supabase) return;
  const { error } = await supabase.rpc("create_post", {
    dev: await deviceHash(),
    p: {
      id: post.id, category: post.category, grade: post.grade, weather: post.weather ?? null,
      nickname: post.nickname, title: post.title, body: post.body,
    },
  });
  if (!report(error)) postsStore.refresh();
}

// 같은 글에 두 번 보내면 false (화면에서도 막지만, 다른 탭이나 새로고침 후를 대비해 DB가 한 번 더 막는다)
export async function sendSunshine(postId: string) {
  postsStore.set((prev) => prev.map((p) => (p.id === postId ? { ...p, likes: p.likes + 1 } : p)));
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("add_sunshine", { dev: await deviceHash(), target: postId });
  if (!report(error) || data === false) {
    postsStore.refresh();
    return false;
  }
  return true;
}

export async function addPostComment(postId: string, comment: Post["comments"][number]) {
  postsStore.set((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, comment] } : p)));
  if (!supabase) return;
  const { error } = await supabase.rpc("add_post_comment", {
    dev: await deviceHash(),
    c: { id: comment.id, post_id: postId, nickname: comment.nickname, body: comment.body, weather: comment.weather ?? null },
  });
  if (!report(error)) postsStore.refresh();
}

export async function addAlertComment(comment: AlertComment) {
  alertCommentsStore.set((prev) => [...prev, comment]);
  if (!supabase) return;
  const { error } = await supabase.rpc("add_alert_comment", {
    dev: await deviceHash(),
    c: { id: comment.id, alert_id: comment.alertId, nickname: comment.nickname, body: comment.body, weather: comment.weather ?? null },
  });
  if (!report(error)) alertCommentsStore.refresh();
}

export async function reportAlertComment(id: string) {
  alertCommentsStore.set((prev) => prev.map((c) => (c.id === id ? { ...c, reports: c.reports + 1 } : c)));
  if (!supabase) return;
  const { data, error } = await supabase.rpc("report_alert_comment", { dev: await deviceHash(), target: id });
  if (!report(error) || data === false) alertCommentsStore.refresh();
}

// 투표는 집계용으로만 보낸다. 날짜는 서버가 한국 시간 기준으로 정한다
export async function submitVote(vote: { grade: Grade; weather: WeatherKey; tags: string[] }) {
  if (!supabase) return "ok" as const;
  const { error } = await supabase.from("votes").insert({ ...vote, device_hash: await deviceHash() });
  if (error?.code === "23505") return "duplicate" as const;
  if (!report(error)) return "error" as const;
  await statsStore.refresh();
  return "ok" as const;
}

// ---- 실시간 관측 (투표 집계). 개별 투표는 못 읽으므로 DB 함수가 돌려주는 요약만 1분마다 받아온다

export type LiveGradeStat = { grade: Grade; count: number | null; score: number | null };

export type LiveStats = {
  participants: number;
  overallScore: number | null; // 5명 미만이면 null
  byGrade: LiveGradeStat[];
  topTags: { tag: string; count: number }[]; // 5명 미만이면 빈 배열
  fetchedAt: number;
};

type TodayStatsRow = {
  participants: number;
  overall_score: number | null;
  by_grade: LiveGradeStat[];
  top_tags: { tag: string; count: number }[];
};

export const statsStore = createStore<LiveStats | null>({
  key: "mw-stats",
  local: () => null,
  empty: null,
  pollMs: 60_000,
  load: async () => {
    const { data, error } = await supabase!.rpc("today_stats", {});
    if (error) throw error;
    const t = data as TodayStatsRow;
    return {
      participants: t.participants,
      overallScore: t.overall_score,
      byGrade: t.by_grade,
      topTags: t.top_tags,
      fetchedAt: Date.now(),
    };
  },
});

// ---- 예측. DB 함수 predict_day 가 지난 기록으로 계산한다 (예시 모드에선 일정 가중치로 대신 계산)

export type Prediction = {
  score: number;
  method: "stats" | "ml" | "local";
  base: number;
  kind: EventKind | null;
  effect: number;
  days: number;
};

export const predictionStore = createStore<Record<string, Prediction>>({ key: "mw-pred", local: () => ({}), empty: {} });
const pending = new Set<string>();

function localPredict(grade: Grade | "전체", date: string): Prediction {
  let score = 70;
  let top: { kind: EventKind; effect: number } | null = null;
  for (const ev of eventsStore.get()) {
    if (ev.deleted || ev.date !== date) continue;
    if (grade !== "전체" && ev.grades.length > 0 && !ev.grades.includes(grade)) continue;
    const effect = -kindInfo(ev.kind).weight;
    score += effect;
    if (!top || Math.abs(effect) > Math.abs(top.effect)) top = { kind: ev.kind, effect };
  }
  return {
    score: Math.max(0, Math.min(100, score)), method: "local", base: 70,
    kind: top?.kind ?? null, effect: top?.effect ?? 0, days: 0,
  };
}

export function predictionKey(grade: Grade | "전체", date: string) {
  return `${grade}|${date}`;
}

export function requestPredictions(grade: Grade | "전체", dates: string[]) {
  const missing = dates.filter((d) => !(predictionKey(grade, d) in predictionStore.get()) && !pending.has(predictionKey(grade, d)));
  if (missing.length === 0) return;
  if (!supabase) {
    predictionStore.set((prev) => ({ ...prev, ...Object.fromEntries(missing.map((d) => [predictionKey(grade, d), localPredict(grade, d)])) }));
    return;
  }
  missing.forEach((d) => pending.add(predictionKey(grade, d)));
  Promise.all(
    missing.map(async (d) => {
      const { data, error } = await supabase!.rpc("predict_day", { target_grade: grade, d });
      if (error) throw error;
      return [predictionKey(grade, d), data as Prediction] as const;
    }),
  )
    .then((entries) => predictionStore.set((prev) => ({ ...prev, ...Object.fromEntries(entries) })))
    .catch((e) => console.error("예측 불러오기 실패", e))
    .finally(() => missing.forEach((d) => pending.delete(predictionKey(grade, d))));
}

// ---- 일정별 영향 (관측 기록 화면)

export type EventEffect = { grade: Grade | "전체"; kind: EventKind; days: number; observed: number | null; effect: number };

export async function fetchEventEffects(includeSample: boolean): Promise<EventEffect[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("event_effects", { include_sample: includeSample });
  if (error) throw error;
  return data as EventEffect[];
}
