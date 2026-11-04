"use client";

import Link from "next/link";
import { useState } from "react";
import Card from "@/components/Card";
import ClientOnly from "@/components/ClientOnly";
import Header from "@/components/Header";
import { liveCasterComment } from "@/lib/caster";
import {
  alertCommentsStore, eventsStore, isOnline, postsStore, statsStore, useStore, type LiveStats,
} from "@/lib/data";
import { getSavedGrade, getTodayVote } from "@/lib/local";
import { CATEGORY_LABEL, TODAY_ALERTS, TODAY_FORECAST } from "@/lib/mock";
import { keyToDate, useTodayKey } from "@/lib/useToday";
import {
  addDays, dateKey, GRADES, kindInfo, MIN_SAMPLE, scoreToWeather, timeAgo, weatherEmoji,
} from "@/lib/weather";
import SampleBadge from "@/components/SampleBadge";

const SKY: Record<string, string> = {
  sunny: "from-sky-400 to-amber-300",
  clear: "from-sky-500 to-cyan-300",
  cloudy: "from-slate-500 to-sky-300",
  rain: "from-slate-600 to-sky-600",
  storm: "from-indigo-950 to-violet-600",
  pending: "from-slate-500 to-sky-400",
};

// 아직 5명이 안 모여 날씨를 공개하지 않을 때
const PENDING = { key: "pending", emoji: "🛰️", label: "관측 중" };

// 화면에 그릴 예보. DB에 연결돼 있으면 실시간 관측, 아니면 예시 예보를 쓴다
type View = {
  label: string;
  badge: string;
  score: number | null;
  participants: number;
  byGrade: { grade: string; score: number | null }[];
  topTags: { tag: string; count: number }[];
  caster: string;
};

function mockView(): View {
  const f = TODAY_FORECAST;
  return {
    label: "예시 예보",
    badge: "예시 데이터",
    score: f.overallScore,
    participants: f.participants,
    byGrade: f.byGrade.map((g) => ({ grade: g.grade, score: g.count < MIN_SAMPLE ? null : g.score })),
    topTags: f.topTags,
    caster: f.casterComment,
  };
}

function liveView(stats: LiveStats | null): View {
  return {
    label: "실시간 관측",
    badge: stats ? "1분마다 갱신" : "수신 중",
    score: stats?.overallScore ?? null,
    participants: stats?.participants ?? 0,
    byGrade: GRADES.map((g) => ({ grade: g, score: stats?.byGrade.find((x) => x.grade === g)?.score ?? null })),
    topTags: stats?.topTags ?? [],
    caster: stats ? liveCasterComment(stats) : "관측 자료를 수신하고 있습니다. 잠시만 기다려 주세요.",
  };
}

function dDay(date: string, today: Date) {
  const [y, m, d] = date.split("-").map(Number);
  const diff = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  return `D-${diff}`;
}

export default function TodayPage() {
  return (
    <ClientOnly fallback={<Header title="오늘의 학부 날씨" />}>
      <TodayView />
    </ClientOnly>
  );
}

function TodayView() {
  const [voted] = useState(() => getTodayVote() !== null);
  const [myGrade] = useState(getSavedGrade);
  const today = keyToDate(useTodayKey());
  const events = useStore(eventsStore);
  const posts = useStore(postsStore);
  const alertComments = useStore(alertCommentsStore);
  const stats = useStore(statsStore);

  const view = isOnline ? liveView(stats) : mockView();
  const w = view.score === null ? PENDING : scoreToWeather(view.score);
  // 특보 자동 발표는 4단계. 그 전까지 DB 모드에서는 예시 특보를 보여주지 않는다
  const alerts = isOnline ? [] : TODAY_ALERTS;

  const from = dateKey(today);
  const to = dateKey(addDays(today, 7));
  const upcoming = events
    .filter((e) => !e.deleted && e.date >= from && e.date <= to)
    .filter((e) => !myGrade || e.grades.length === 0 || e.grades.includes(myGrade))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const latestPosts = [...posts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);

  return (
    <>
      <Header title="오늘의 학부 날씨" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-start">
        <div className="min-w-0 space-y-4">
          <section className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${SKY[w.key]} p-6 text-white`}>
            <span className="pointer-events-none absolute -right-6 -top-8 text-[9rem] opacity-25">{w.emoji}</span>

            <div className="relative flex items-center justify-between">
              <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold">
                {isOnline ? (
                  <span className="rounded bg-danger px-1.5 py-0.5 text-[11px] tracking-wider">● LIVE</span>
                ) : (
                  <span className="rounded bg-white/25 px-1.5 py-0.5 text-[11px]">예시 화면</span>
                )}
                {view.badge}
              </p>
            </div>

            <div className="relative mt-6 flex items-center gap-4">
              <span className="text-7xl drop-shadow-sm">{w.emoji}</span>
              <div>
                <p className="text-sm text-white/80">{view.label} · 소프트웨어학부 상공</p>
                <p className="font-display text-5xl leading-tight">{w.label}</p>
                <p className="mt-1 text-sm text-white/90">
                  {view.score === null ? (
                    <>{view.participants}명 관측 · {MIN_SAMPLE}명부터 공개</>
                  ) : (
                    <>멘탈 지수 <b>{view.score}</b> · {view.participants}명 관측</>
                  )}
                </p>
              </div>
            </div>

            <div className="relative mt-6 flex items-start gap-3">
              <div className="flex shrink-0 flex-col items-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow">☁️</span>
                <span className="mt-1 text-[11px] font-semibold">캐스터 뭉게</span>
              </div>
              <p className="relative rounded-2xl rounded-tl-sm bg-white p-4 text-[15px] leading-relaxed text-text shadow-sm">
                {view.caster}
              </p>
            </div>

            {!voted && (
              <Link href="/vote" className="relative mt-5 block rounded-2xl bg-white/95 py-3.5 text-center font-semibold text-accent">
                내 오늘 날씨도 알려주기 ✋
              </Link>
            )}
          </section>

          <Card title="지역별 날씨">
            <div className="grid grid-cols-5 text-center">
              {view.byGrade.map((g) => (
                <div key={g.grade}>
                  <p className={`text-3xl ${g.score === null ? "opacity-20 grayscale" : ""}`}>
                    {g.score === null ? "☁️" : scoreToWeather(g.score).emoji}
                  </p>
                  <p className="mt-1 text-sm">{g.grade}</p>
                  <p className="text-xs text-muted">{g.score === null ? "관측 부족" : g.score}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm text-muted">오늘의 기압골 (많이 나온 원인)</p>
              {view.topTags.length === 0 && <p className="text-sm text-muted">아직 보고된 원인이 없어요</p>}
              <div className="flex flex-wrap gap-1.5">
                {view.topTags.map((t) => (
                  <span key={t.tag} className="rounded-full bg-panel-2 px-3 py-1 text-sm">
                    #{t.tag} <span className="text-muted">{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="⚠️ 기상 특보">
            {alerts.length === 0 && (
              <p className="py-4 text-center text-sm text-muted">현재 발효 중인 특보가 없어요</p>
            )}
            <ul className="divide-y divide-line">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link href={`/alerts/${a.id}`} className="flex items-center gap-3 py-3">
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold text-white ${
                        a.level === "경보" ? "bg-danger" : "bg-warn"
                      }`}
                    >
                      {a.level}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                    <span className="shrink-0 text-sm text-muted">댓글 {alertComments.filter((c) => c.alertId === a.id).length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={myGrade ? `다가오는 일정 · ${myGrade}` : "다가오는 일정"} more={{ href: "/calendar", label: "예보 달력" }}>
            {upcoming.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">일주일 안에 등록된 일정이 없어요</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <span className="w-6 shrink-0 text-center text-lg">{kindInfo(e.kind).icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.title}<SampleBadge show={e.isSample} /></p>
                      <p className="truncate text-xs text-muted">
                        {[kindInfo(e.kind).label, e.time, e.place].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-accent">{dDay(e.date, today)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="현장 제보" more={{ href: "/board", label: "더보기" }}>
            {latestPosts.length === 0 && (
              <p className="py-4 text-center text-sm text-muted">아직 올라온 제보가 없어요</p>
            )}
            <ul className="divide-y divide-line">
              {latestPosts.map((p) => (
                <li key={p.id}>
                  <Link href={`/board?post=${p.id}`} className="block py-3">
                    <p className="truncate font-medium">
                      <span className="mr-1.5 text-xs font-semibold text-accent">
                        {CATEGORY_LABEL[p.category].icon} {CATEGORY_LABEL[p.category].label}
                      </span>
                      {p.title}
                      <SampleBadge show={p.isSample} />
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {weatherEmoji(p.weather)} {p.nickname} · {timeAgo(p.createdAt)} · 댓글 {p.comments.length}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
