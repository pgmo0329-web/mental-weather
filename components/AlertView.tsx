"use client";

import Link from "next/link";
import { useState } from "react";
import ClientOnly from "@/components/ClientOnly";
import { getSavedGrade, getTodayVote } from "@/lib/local";
import {
  addAlertComment, alertCommentsStore, isOnline, reportAlertComment, threadNickname, useStore,
} from "@/lib/data";
import type { Alert } from "@/lib/mock";
import { GRADES, timeAgo, weatherEmoji, type Grade } from "@/lib/weather";
import SampleBadge from "@/components/SampleBadge";

const MAX_LEN = 200;
const HIDE_AT = 3;

export default function AlertView(props: { alert: Alert }) {
  // 자동 특보는 아직 없어서, DB 모드에서는 예시 특보를 보여주지 않는다
  if (isOnline) {
    return (
      <section className="rounded-3xl bg-panel p-8 text-center">
        <p className="text-4xl">🌤️</p>
        <p className="mt-3 font-semibold">현재 발효 중인 특보가 없어요</p>
        <Link href="/" className="mt-4 inline-block text-sm text-accent">오늘 예보로 돌아가기</Link>
      </section>
    );
  }
  return (
    <ClientOnly>
      <AlertBody {...props} />
    </ClientOnly>
  );
}

function AlertBody({ alert }: { alert: Alert }) {
  const comments = useStore(alertCommentsStore).filter((c) => c.alertId === alert.id);
  const [body, setBody] = useState("");
  const [grade, setGrade] = useState<Grade | null>(getSavedGrade);
  const [reported, setReported] = useState<string[]>([]);

  async function post() {
    const text = body.trim();
    if (!text) return;
    setBody("");
    const nick = await threadNickname(alert.id);
    addAlertComment({
      id: crypto.randomUUID(),
      alertId: alert.id,
      nickname: grade ? `${grade} ${nick}` : nick,
      body: text,
      createdAt: Date.now(),
      reports: 0,
      weather: getTodayVote()?.weather,
    });
  }

  function report(id: string) {
    if (reported.includes(id)) return;
    setReported((prev) => [...prev, id]);
    reportAlertComment(id);
  }

  const isWarning = alert.level === "경보";

  return (
    <>
      <Link href="/" className="mb-4 inline-block text-sm text-muted">← 오늘 예보</Link>

      <section className={`rounded-3xl bg-panel p-6`}>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-sm font-bold ${isWarning ? "bg-danger text-white" : "bg-warn text-white"}`}>
            {isWarning ? "🚨" : "⚠️"} {alert.level}
          </span>
          <span className="text-xs text-muted">
            {alert.issuedAt} 발표 · {alert.kind === "chat" ? "댓글 급증 감지" : `${alert.grade} 태그 집중 감지`}
          </span>
        </div>
        <h1 className="mt-3 text-xl font-bold">{alert.title}</h1>
        <p className="mt-3 leading-relaxed">{alert.body}</p>
      </section>

      <section className="mt-5">
        <h2 className="mb-3 font-semibold">💬 현장 제보 {comments.filter((c) => c.reports < HIDE_AT).length}</h2>
        <ul className="space-y-2">
          {comments.map((c) =>
            c.reports >= HIDE_AT ? (
              <li key={c.id} className="rounded-xl bg-panel px-4 py-3 text-sm text-muted">신고가 누적되어 숨겨진 댓글이에요.</li>
            ) : (
              <li key={c.id} className="rounded-2xl bg-panel px-4 py-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{weatherEmoji(c.weather)} {c.nickname} · {timeAgo(c.createdAt)}<SampleBadge show={c.isSample} /></span>
                  <button onClick={() => report(c.id)} className={reported.includes(c.id) ? "text-danger" : ""}>
                    {reported.includes(c.id) ? "신고됨" : "신고"}
                  </button>
                </div>
                <p className="mt-1">{c.body}</p>
              </li>
            ),
          )}
        </ul>
      </section>

      <section className="mt-5 rounded-3xl bg-panel p-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted">
          <span>표시할 학년</span>
          <select
            value={grade ?? ""}
            onChange={(e) => setGrade((e.target.value || null) as Grade | null)}
            className="rounded-md border border-line bg-panel-2 px-2 py-1 text-text"
          >
            <option value="">밝히지 않음</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
          placeholder="현장 상황을 제보해 주세요 (익명)"
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-panel-2 p-3 text-sm outline-none focus:border-accent"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">{body.length} / {MAX_LEN}</span>
          <button onClick={post} disabled={!body.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-30">
            등록
          </button>
        </div>
      </section>
    </>
  );
}
