// 화면들이 쓰는 데이터 저장소.
// Supabase 연결 정보가 있으면 DB에서 읽고 쓰며, 다른 사람의 변경도 실시간으로 받아온다.
// 연결 정보가 없으면 지금 브라우저에만 저장한다 (같은 브라우저의 다른 탭에는 반영됨).
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import {
  initialAlertComments, initialEvents, initialPosts,
  type AlertComment, type CalEvent, type Post, type PostCategory,
} from "./mock";
import { supabase } from "./supabase";
import { addDays, dateKey, type EventKind, type Grade, type WeatherKey } from "./weather";

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
}): Store<T> & { refresh: () => Promise<void> } {
  let cache: T | undefined;
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

  return { get, set, subscribe, refresh };
}

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

// ---- DB 행 ↔ 화면 데이터 변환

type EventRow = {
  id: string; title: string; date: string; kind: EventKind; grades: Grade[];
  time: string | null; place: string | null; deleted: boolean;
};

function toEvent(r: EventRow): StoredEvent {
  return {
    id: r.id, title: r.title, date: r.date, kind: r.kind, grades: r.grades,
    time: r.time ?? undefined, place: r.place ?? undefined, deleted: r.deleted,
  };
}

function toEventRow(e: StoredEvent): EventRow {
  return {
    id: e.id, title: e.title, date: e.date, kind: e.kind, grades: e.grades,
    time: e.time ?? null, place: e.place ?? null, deleted: e.deleted,
  };
}

type CommentRow = { id: string; nickname: string; body: string; weather: WeatherKey | null; created_at: string };
type PostRow = {
  id: string; category: PostCategory; grade: Grade | null; weather: WeatherKey | null; nickname: string;
  title: string; body: string; likes: number; created_at: string; post_comments: CommentRow[];
};
type AlertCommentRow = CommentRow & { alert_id: string; reports: number };

const ts = (iso: string) => new Date(iso).getTime();

// ---- 저장소

export const eventsStore = createStore<StoredEvent[]>({
  key: "mw-events-v2",
  local: () => initialEvents(startOfToday()).map((e) => ({ ...e, deleted: false })),
  empty: [],
  tables: ["events"],
  load: async () => {
    const { data, error } = await supabase!.from("events").select("*");
    if (error) throw error;
    return (data as EventRow[]).map(toEvent);
  },
});

export const revisionsStore = createStore<Revision[]>({
  key: "mw-revisions-v2",
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
      id: r.id, eventId: r.event_id, snapshot: toEvent(r.snapshot), action: r.action, at: ts(r.created_at),
    }));
  },
});

export const postsStore = createStore<Post[]>({
  key: "mw-posts-v2",
  local: () => initialPosts(Date.now()),
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
      title: p.title, body: p.body, likes: p.likes, createdAt: ts(p.created_at),
      comments: p.post_comments
        .map((c) => ({ id: c.id, nickname: c.nickname, body: c.body, weather: c.weather ?? undefined, createdAt: ts(c.created_at) }))
        .sort((a, b) => a.createdAt - b.createdAt),
    }));
  },
});

export const alertCommentsStore = createStore<AlertComment[]>({
  key: "mw-alert-comments-v1",
  local: () => initialAlertComments(Date.now()),
  empty: [],
  tables: ["alert_comments"],
  load: async () => {
    const { data, error } = await supabase!.from("alert_comments").select("*").order("created_at");
    if (error) throw error;
    return (data as AlertCommentRow[]).map((c) => ({
      id: c.id, alertId: c.alert_id, nickname: c.nickname, body: c.body,
      weather: c.weather ?? undefined, reports: c.reports, createdAt: ts(c.created_at),
    }));
  },
});

// ---- 쓰기. 화면에는 먼저 반영하고, DB 모드면 DB에도 저장한다

function report(error: unknown) {
  if (error) console.error("DB 저장 실패", error);
}

async function recordRevision(snapshot: StoredEvent, action: Revision["action"]) {
  revisionsStore.set((prev) =>
    [{ id: crypto.randomUUID(), eventId: snapshot.id, snapshot, action, at: Date.now() }, ...prev].slice(0, 300),
  );
  if (supabase) {
    const { error } = await supabase.from("event_revisions").insert({ event_id: snapshot.id, snapshot: toEventRow(snapshot), action });
    report(error);
  }
}

export async function saveEvent(ev: StoredEvent, action: Revision["action"]) {
  eventsStore.set((prev) => (prev.some((e) => e.id === ev.id) ? prev.map((e) => (e.id === ev.id ? ev : e)) : [...prev, ev]));
  if (supabase) {
    const { error } = await supabase.from("events").upsert({ ...toEventRow(ev), updated_at: new Date().toISOString() });
    report(error);
  }
  await recordRevision(ev, action);
}

export async function createPost(post: Post) {
  postsStore.set((prev) => [post, ...prev]);
  if (supabase) {
    const { error } = await supabase.from("posts").insert({
      id: post.id, category: post.category, grade: post.grade, weather: post.weather ?? null,
      nickname: post.nickname, title: post.title, body: post.body,
    });
    report(error);
  }
}

export async function sendSunshine(postId: string) {
  postsStore.set((prev) => prev.map((p) => (p.id === postId ? { ...p, likes: p.likes + 1 } : p)));
  if (supabase) report((await supabase.rpc("add_sunshine", { target: postId })).error);
}

export async function addPostComment(postId: string, comment: Post["comments"][number]) {
  postsStore.set((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, comment] } : p)));
  if (supabase) {
    const { error } = await supabase.from("post_comments").insert({
      id: comment.id, post_id: postId, nickname: comment.nickname, body: comment.body, weather: comment.weather ?? null,
    });
    report(error);
  }
}

export async function addAlertComment(comment: AlertComment) {
  alertCommentsStore.set((prev) => [...prev, comment]);
  if (supabase) {
    const { error } = await supabase.from("alert_comments").insert({
      id: comment.id, alert_id: comment.alertId, nickname: comment.nickname, body: comment.body, weather: comment.weather ?? null,
    });
    report(error);
  }
}

export async function reportAlertComment(id: string) {
  alertCommentsStore.set((prev) => prev.map((c) => (c.id === id ? { ...c, reports: c.reports + 1 } : c)));
  if (supabase) report((await supabase.rpc("report_alert_comment", { target: id })).error);
}

// 투표는 집계용으로만 보낸다. 기기 ID는 해시만 저장해서 실제 사람과 연결되지 않는다
export async function submitVote(vote: { date: string; grade: Grade; weather: WeatherKey; tags: string[] }) {
  if (!supabase) return;
  const { error } = await supabase.from("votes").insert({ ...vote, device_hash: await deviceHash() });
  report(error);
  await statsStore.refresh();
}

async function deviceHash() {
  let id = "";
  try {
    id = localStorage.getItem("mw-device") ?? "";
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("mw-device", id);
    }
  } catch {
    id = crypto.randomUUID();
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- 실시간 관측 (투표 집계). 개별 투표는 못 읽으므로 DB 함수가 돌려주는 요약만 1분마다 받아온다

export type LiveGradeStat = { grade: Grade; count: number; score: number | null };

export type LiveStats = {
  participants: number;
  overallScore: number | null; // 5명 미만이면 null
  byGrade: LiveGradeStat[];
  topTags: { tag: string; count: number }[];
  daily: Record<string, number | null>; // 최근 며칠의 학부 점수
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
    const today = new Date();
    const [todayRes, dailyRes] = await Promise.all([
      supabase!.rpc("today_stats", { target: dateKey(today) }),
      supabase!.rpc("daily_scores", { start_date: dateKey(addDays(today, -7)), end_date: dateKey(today) }),
    ]);
    if (todayRes.error) throw todayRes.error;
    if (dailyRes.error) throw dailyRes.error;
    const t = todayRes.data as TodayStatsRow;
    const daily: Record<string, number | null> = {};
    for (const row of dailyRes.data as { day: string; score: number | null }[]) {
      daily[String(row.day).slice(0, 10)] = row.score;
    }
    return {
      participants: t.participants,
      overallScore: t.overall_score,
      byGrade: t.by_grade,
      topTags: t.top_tags,
      daily,
      fetchedAt: Date.now(),
    };
  },
});
