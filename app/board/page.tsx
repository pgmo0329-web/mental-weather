"use client";

import Link from "next/link";
import { useState } from "react";
import ClientOnly from "@/components/ClientOnly";
import Header from "@/components/Header";
import Sheet from "@/components/Sheet";
import { addPostComment, createPost, postsStore, sendSunshine, useStore } from "@/lib/data";
import { getSavedGrade, getTodayVote } from "@/lib/local";
import { POST_CATEGORIES, type Post, type PostCategory } from "@/lib/mock";
import {
  GRADES, pseudoWeather, randomNickname, scoreToWeather, timeAgo, weatherEmoji, weatherOf, type Grade,
} from "@/lib/weather";
import SampleBadge from "@/components/SampleBadge";

const TITLE_MAX = 60;
const BODY_MAX = 1000;
const COMMENT_MAX = 200;
const HOT_LIKES = 20;

// 저장되는 값은 그대로 두고 화면에서만 날씨 말투로 보여준다
const CATEGORY_LABEL: Record<PostCategory, { icon: string; label: string }> = {
  정보: { icon: "📡", label: "관측 정보" },
  질문: { icon: "🆘", label: "구조 요청" },
  잡담: { icon: "☁️", label: "수다 구름" },
  분실물: { icon: "🧳", label: "분실물 수배" },
};

function postWeather(p: Post) {
  return weatherOf(p.weather ?? pseudoWeather(p.id));
}

export default function BoardPage() {
  return (
    <div className="md:mx-auto md:max-w-3xl">
      <ClientOnly fallback={<Header title="현장 제보" />}>
        <BoardView />
      </ClientOnly>
    </div>
  );
}

function BoardView() {
  const posts = useStore(postsStore);
  const [myGrade] = useState(getSavedGrade);
  const [myWeather] = useState(() => getTodayVote()?.weather);
  const [category, setCategory] = useState<PostCategory | "전체">("전체");
  const [openId, setOpenId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [sunned, setSunned] = useState<string[]>([]);
  const [draft, setDraft] = useState({ category: "정보" as PostCategory, title: "", body: "", grade: myGrade });
  const [comment, setComment] = useState("");
  const [now] = useState(() => Date.now());

  const list = posts
    .filter((p) => category === "전체" || p.category === category)
    .sort((a, b) => b.createdAt - a.createdAt);
  const open = posts.find((p) => p.id === openId);

  // 최근 24시간 제보자들의 날씨 평균 = 지금 현장 분위기
  const recent = posts.filter((p) => now - p.createdAt < 24 * 60 * 60000);
  const mood = recent.length
    ? scoreToWeather(recent.reduce((sum, p) => sum + postWeather(p).score, 0) / recent.length)
    : null;

  function submitPost() {
    if (!draft.title.trim() || !draft.body.trim()) return;
    createPost({
        id: crypto.randomUUID(),
        category: draft.category,
        grade: draft.grade,
        weather: myWeather,
        nickname: randomNickname(draft.grade),
        title: draft.title.trim(),
        body: draft.body.trim(),
        createdAt: Date.now(),
        likes: 0,
        comments: [],
    });
    setDraft({ ...draft, title: "", body: "" });
    setWriting(false);
    setCategory("전체");
  }

  function sendSun(id: string) {
    if (sunned.includes(id)) return;
    setSunned((prev) => [...prev, id]);
    sendSunshine(id);
  }

  function addComment() {
    const text = comment.trim();
    if (!text || !openId) return;
    addPostComment(openId, {
      id: crypto.randomUUID(),
      nickname: randomNickname(myGrade),
      body: text,
      createdAt: Date.now(),
      weather: myWeather,
    });
    setComment("");
  }

  return (
    <>
      <Header title="현장 제보" />

      {mood && (
        <section className="mb-4 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-slate-700 to-sky-700 p-5 text-white">
          <span className="text-5xl">{mood.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/70">지금 현장 분위기</p>
            <p className="font-display text-2xl">{mood.label}</p>
            <p className="truncate text-xs text-white/80">
              오늘 제보 {recent.length}건
            </p>
          </div>
          <button onClick={() => setWriting(true)} className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-text">
            📡 제보하기
          </button>
        </section>
      )}

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {(["전체", ...POST_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm ${
              category === c ? "bg-text font-semibold text-white" : "bg-panel text-muted"
            }`}
          >
            {c === "전체" ? "📻 전체 채널" : `${CATEGORY_LABEL[c].icon} ${CATEGORY_LABEL[c].label}`}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <p className="rounded-3xl bg-panel py-12 text-center text-sm text-muted">이 채널은 아직 조용해요. 첫 제보를 남겨주세요!</p>
      )}
      <ul className="space-y-3">
        {list.map((p) => {
          const w = postWeather(p);
          return (
            <li key={p.id}>
              <button onClick={() => setOpenId(p.id)} className="flex w-full gap-4 rounded-3xl bg-panel p-4 text-left">
                <div className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-2xl py-2 ${w.tint}`}>
                  <span className="text-3xl">{w.emoji}</span>
                  <span className="mt-0.5 text-[11px] text-muted">{w.label}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-accent">
                      {CATEGORY_LABEL[p.category].icon} {CATEGORY_LABEL[p.category].label}
                    </span>
                    {p.likes >= HOT_LIKES && (
                      <span className="rounded bg-danger/10 px-1.5 py-0.5 font-semibold text-danger">🌡️ 폭염급 관심</span>
                    )}
                  </p>
                  <p className="mt-1 font-medium">{p.title}<SampleBadge id={p.id} /></p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted">{p.body}</p>
                  <p className="mt-2 flex gap-3 text-xs text-muted">
                    <span className="truncate">{p.nickname} · {timeAgo(p.createdAt)}</span>
                    <span className="ml-auto shrink-0">☀️ {p.likes}</span>
                    <span className="shrink-0">💬 {p.comments.length}</span>
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={!!open}
        title={open ? `${CATEGORY_LABEL[open.category].icon} ${CATEGORY_LABEL[open.category].label}` : ""}
        onClose={() => setOpenId(null)}
      >
        {open && (
          <>
            <div className={`mb-4 flex items-center gap-3 rounded-2xl p-3 ${postWeather(open).tint}`}>
              <span className="text-3xl">{postWeather(open).emoji}</span>
              <p className="text-sm">
                <b>{open.nickname}</b> 님의 오늘 날씨는 <b>{postWeather(open).label}</b>
                <span className="block text-xs text-muted">{timeAgo(open.createdAt)} 제보</span>
              </p>
            </div>
            <h2 className="text-xl font-bold">{open.title}<SampleBadge id={open.id} /></h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed">{open.body}</p>
            <button
              onClick={() => sendSun(open.id)}
              className={`mt-5 rounded-full px-4 py-2 text-sm font-semibold ${
                sunned.includes(open.id) ? "bg-amber-400 text-white" : "bg-amber-50 text-amber-600"
              }`}
            >
              ☀️ {sunned.includes(open.id) ? "햇살 보냈어요" : "햇살 보내기"} {open.likes}
            </button>

            <div className="mt-6 border-t border-line pt-4">
              <p className="mb-3 text-sm font-semibold">💬 현장 반응 {open.comments.length}</p>
              <ul className="space-y-3">
                {open.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <span className="text-lg leading-6">{weatherEmoji(c.weather ?? pseudoWeather(c.id))}</span>
                    <div>
                      <p className="text-xs text-muted">{c.nickname} · {timeAgo(c.createdAt)}<SampleBadge id={c.id} /></p>
                      <p className="mt-0.5 text-sm">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
                  onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && addComment()}
                  placeholder="익명으로 반응 남기기"
                  className="flex-1 rounded-xl bg-panel-2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
                <button onClick={addComment} disabled={!comment.trim()} className="rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-30">
                  등록
                </button>
              </div>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={writing} title="📡 현장 제보하기" onClose={() => setWriting(false)}>
        <div className="space-y-4">
          {myWeather ? (
            <p className={`rounded-2xl p-3 text-sm ${weatherOf(myWeather).tint}`}>
              {weatherOf(myWeather).emoji} 내 오늘 날씨 <b>{weatherOf(myWeather).label}</b>와 함께 올라가요
            </p>
          ) : (
            <Link href="/vote" className="block rounded-2xl bg-panel-2 p-3 text-sm text-muted">
              🛰️ 아직 오늘 날씨를 안 알려줬어요. <span className="font-semibold text-accent">먼저 알려주기 ›</span>
            </Link>
          )}
          <div className="flex flex-wrap gap-1.5">
            {POST_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setDraft({ ...draft, category: c })}
                className={`rounded-full px-3 py-1.5 text-sm ${draft.category === c ? "bg-accent text-white" : "bg-panel-2 text-muted"}`}
              >
                {CATEGORY_LABEL[c].icon} {CATEGORY_LABEL[c].label}
              </button>
            ))}
          </div>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value.slice(0, TITLE_MAX) })}
            placeholder="제목"
            className="w-full rounded-xl bg-panel-2 px-4 py-3 outline-none focus:ring-2 focus:ring-accent"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value.slice(0, BODY_MAX) })}
            placeholder="과제 팁, 시험 정보, 분실물 등 현장 소식을 알려주세요"
            rows={6}
            className="w-full resize-none rounded-xl bg-panel-2 px-4 py-3 outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex items-center justify-between">
            <select
              value={draft.grade ?? ""}
              onChange={(e) => setDraft({ ...draft, grade: (e.target.value || null) as Grade | null })}
              className="rounded-xl bg-panel-2 px-3 py-2 text-sm"
            >
              <option value="">학년 밝히지 않음</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}로 표시</option>
              ))}
            </select>
            <span className="text-xs text-muted">{draft.body.length} / {BODY_MAX}</span>
          </div>
          <button
            onClick={submitPost}
            disabled={!draft.title.trim() || !draft.body.trim()}
            className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-white disabled:opacity-30"
          >
            익명으로 제보하기
          </button>
        </div>
      </Sheet>
    </>
  );
}
