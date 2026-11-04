"use client";

import Link from "next/link";
import { useState } from "react";
import ClientOnly from "@/components/ClientOnly";
import { showToast, submitVote } from "@/lib/data";
import Header from "@/components/Header";
import { clearTodayVote, getTodayVote, saveVote, stormStreak, type MyVote } from "@/lib/local";
import { dateKey, GRADES, TAGS, WEATHERS, type Grade, type WeatherKey } from "@/lib/weather";

export default function VotePage() {
  return (
    <div className="md:mx-auto md:max-w-xl">
      <ClientOnly fallback={<Header title="오늘의 날씨 제보" />}>
        <VoteView />
      </ClientOnly>
    </div>
  );
}

function VoteView() {
  const [myVote, setMyVote] = useState<MyVote | null>(getTodayVote);
  const [weather, setWeather] = useState<WeatherKey | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [streak, setStreak] = useState(stormStreak);
  const [sending, setSending] = useState(false);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function submit() {
    if (!weather || !grade || sending) return;
    setSending(true);
    const result = await submitVote({ weather, grade, tags });
    setSending(false);
    if (result === "error") return; // 알림은 submitVote 가 띄운다
    if (result === "duplicate") showToast("오늘은 이 기기에서 이미 제보했어요. 내일 다시 알려주세요!");
    const vote = { date: dateKey(new Date()), weather, grade, tags };
    saveVote(vote);
    setMyVote(vote);
    setStreak(stormStreak());
  }

  function reset() {
    clearTodayVote();
    setMyVote(null);
    setWeather(null);
    setTags([]);
  }

  if (myVote) {
    const w = WEATHERS.find((x) => x.key === myVote.weather)!;
    return (
      <>
        <Header title="오늘의 날씨 제보" />
        <section className="rounded-2xl border border-transparent bg-panel p-6 text-center">
          <p className="text-sm text-muted">오늘의 내 날씨</p>
          <p className="my-3 text-7xl">{w.emoji}</p>
          <p className="text-2xl font-bold">{w.label}</p>
          <p className="mt-1 text-sm text-muted">{myVote.grade} 관측소</p>
          {myVote.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {myVote.tags.map((t) => (
                <span key={t} className="rounded-full bg-panel-2 px-2.5 py-1 text-xs">#{t}</span>
              ))}
            </div>
          )}
          <p className="mt-5 text-sm text-muted">제보 완료! 내일 또 관측해 주세요 🛰️</p>
        </section>

        {streak >= 3 && (
          <section className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 p-5">
            <p className="font-semibold">요 며칠 계속 폭풍이었네요</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              혼자 버티기 힘들 땐 이야기할 곳이 있어요. 학교 학생상담센터에서 무료로 상담을 받을 수 있어요.
              이 안내는 내 기기에서만 보이고 어디에도 기록되지 않아요.
            </p>
          </section>
        )}

        <div className="mt-4 flex gap-2">
          <Link href="/" className="flex-1 rounded-xl bg-accent py-3 text-center font-semibold text-white">
            오늘 예보 보러가기
          </Link>
          {process.env.NODE_ENV !== "production" && (
            <button onClick={reset} className="rounded-xl border border-line px-4 text-xs text-muted">
              다시 제보 (테스트)
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="오늘의 날씨 제보" />
      <p className="mb-4 text-sm text-muted">완전 익명이에요. 학년만 집계에 쓰이고 하루에 한 번만 제보할 수 있어요.</p>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">지금 내 멘탈 날씨는?</h2>
        <div className="grid grid-cols-5 gap-2">
          {WEATHERS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWeather(w.key)}
              className={`flex flex-col items-center rounded-xl border py-3 transition ${
                weather === w.key ? "border-accent bg-accent/15" : "border-transparent bg-panel"
              }`}
            >
              <span className="text-3xl">{w.emoji}</span>
              <span className="mt-1 text-xs">{w.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">학년</h2>
        <div className="flex flex-wrap gap-2">
          {GRADES.map((g) => (
            <button
              key={g}
              onClick={() => setGrade(g)}
              className={`rounded-full border px-4 py-2 text-sm ${
                grade === g ? "border-accent bg-accent/15 text-accent" : "border-transparent bg-panel"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">
          원인은? <span className="text-xs font-normal text-muted">(여러 개 선택 가능, 선택 안 해도 돼요)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                tags.includes(t) ? "border-warn bg-warn/15 text-warn" : "border-transparent bg-panel text-muted"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={submit}
        disabled={!weather || !grade || sending}
        className="w-full rounded-xl bg-accent py-3.5 font-semibold text-white disabled:opacity-30"
      >
        {sending ? "전송 중…" : "제보하기"}
      </button>
    </>
  );
}
