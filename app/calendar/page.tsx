"use client";

import { useMemo, useState } from "react";
import ClientOnly from "@/components/ClientOnly";
import Header from "@/components/Header";
import Sheet from "@/components/Sheet";
import {
  eventsStore, isOnline, revisionsStore, saveEvent, statsStore, useStore, type Revision, type StoredEvent,
} from "@/lib/data";
import { getSavedGrade } from "@/lib/local";
import { pastScores, TODAY_FORECASTS } from "@/lib/mock";
import {
  addDays, dateKey, EVENT_KINDS, formatDay, GRADES, kindInfo, scoreToWeather, timeAgo,
  type EventKind, type Grade,
} from "@/lib/weather";
import SampleBadge from "@/components/SampleBadge";

type GradeView = Grade | "전체";
type FormState = { title: string; date: string; kind: EventKind; grades: Grade[]; time: string; place: string };

const BASE_SCORE = 70;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function appliesTo(ev: StoredEvent, grade: GradeView) {
  return grade === "전체" || ev.grades.length === 0 || ev.grades.includes(grade);
}

// 일정 무게만큼 감점. 전체 보기에선 특정 학년 일정은 절반만 반영한다
function predict(events: StoredEvent[], date: string, grade: GradeView) {
  let score = BASE_SCORE;
  for (const ev of events) {
    if (ev.deleted || ev.date !== date || !appliesTo(ev, grade)) continue;
    const w = kindInfo(ev.kind).weight;
    score -= grade === "전체" && ev.grades.length > 0 ? w / 2 : w;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function eventMeta(ev: StoredEvent) {
  return [kindInfo(ev.kind).label, ev.time, ev.place].filter(Boolean).join(" · ");
}

function gradeLabel(ev: StoredEvent) {
  return ev.grades.length ? ev.grades.join(", ") : "공통";
}

// 달력 칸에 붙이는 짧은 학년 표시. 공통 일정은 붙이지 않는다
function gradePrefix(ev: StoredEvent) {
  return ev.grades.map((g) => (g === "초과학기" ? "초" : g[0])).join("·");
}

export default function CalendarPage() {
  return (
    <ClientOnly fallback={<Header title="예보 달력" />}>
      <CalendarView />
    </ClientOnly>
  );
}

function CalendarView() {
  const [today] = useState(startOfToday);
  const todayKey = dateKey(today);
  const events = useStore(eventsStore);
  const revisions = useStore(revisionsStore);
  const stats = useStore(statsStore);
  const [gradeView, setGradeView] = useState<GradeView>(() => getSavedGrade() ?? "전체");
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(todayKey);
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, StoredEvent[]>();
    for (const ev of events) {
      if (ev.deleted || !appliesTo(ev, gradeView)) continue;
      map.set(ev.date, [...(map.get(ev.date) ?? []), ev]);
    }
    for (const list of map.values()) list.sort((a, b) => kindInfo(b.kind).weight - kindInfo(a.kind).weight);
    return map;
  }, [events, gradeView]);

  // 지난 날과 오늘(전체 보기)은 실제 관측, 앞으로는 일정으로 예측. 관측이 부족하면 null
  const week = useMemo(() => {
    const past: Record<string, number | null> = isOnline ? (stats?.daily ?? {}) : pastScores(today);
    const todayScore = isOnline ? (stats?.overallScore ?? null) : TODAY_FORECASTS[TODAY_FORECASTS.length - 1].overallScore;
    return Array.from({ length: 7 }, (_, i) => {
      const offset = i - 3;
      const key = dateKey(addDays(today, offset));
      const score: number | null =
        offset < 0 ? (past[key] ?? null) : offset === 0 && gradeView === "전체" ? todayScore : predict(events, key, gradeView);
      return { key, offset, score };
    });
  }, [today, events, gradeView, stats]);

  const cells = useMemo(() => {
    const lead = month.getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const total = Math.ceil((lead + daysInMonth) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = addDays(month, i - lead);
      return { key: dateKey(d), day: d.getDate(), inMonth: d.getMonth() === month.getMonth(), dow: d.getDay() };
    });
  }, [month]);

  function selectDay(key: string) {
    setSelected(key);
    const [y, m] = key.split("-").map(Number);
    setMonth(new Date(y, m - 1, 1));
  }

  function shiftMonth(n: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  }

  function openNew() {
    setEditingId(null);
    setForm({ title: "", date: selected, kind: "deadline", grades: gradeView === "전체" ? [] : [gradeView], time: "", place: "" });
  }

  function openEdit(ev: StoredEvent) {
    setEditingId(ev.id);
    setForm({ title: ev.title, date: ev.date, kind: ev.kind, grades: ev.grades, time: ev.time ?? "", place: ev.place ?? "" });
  }

  function saveForm() {
    if (!form || !form.title.trim() || !form.date) return;
    const saved: StoredEvent = {
      id: editingId ?? crypto.randomUUID(),
      title: form.title.trim(),
      date: form.date,
      kind: form.kind,
      grades: form.grades,
      time: form.time || undefined,
      place: form.place.trim() || undefined,
      deleted: false,
    };
    saveEvent(saved, editingId ? "수정" : "추가");
    setForm(null);
    selectDay(saved.date);
  }

  function remove(ev: StoredEvent) {
    const deleted = { ...ev, deleted: true };
    saveEvent(deleted, "삭제");
  }

  function revert(rev: Revision) {
    saveEvent(rev.snapshot, "되돌림");
    setHistoryId(null);
  }

  function toggleFormGrade(g: Grade) {
    setForm((f) => f && { ...f, grades: f.grades.includes(g) ? f.grades.filter((x) => x !== g) : [...f.grades, g] });
  }

  const dayEvents = byDate.get(selected) ?? [];
  const [, selM, selD] = selected.split("-").map(Number);
  const historyEvent = events.find((e) => e.id === historyId);

  return (
    <>
      <Header title="예보 달력" />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-panel p-1">
        {(["전체", ...GRADES] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGradeView(g)}
            className={`shrink-0 flex-1 rounded-full px-3 py-2 text-sm ${
              gradeView === g ? "bg-accent font-semibold text-white" : "text-muted"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <section className="mb-4 rounded-3xl bg-panel p-5">
        <div className="mb-3">
          <h2 className="font-display text-xl">주간 예보</h2>
          <p className="mt-0.5 text-xs text-muted">시험은 폭풍, 과제는 비. 일정이 날씨를 만들어요</p>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {week.map((d) => {
            const w = d.score === null ? { emoji: "🛰️" } : scoreToWeather(d.score);
            const { md, dow } = formatDay(d.key);
            const evs = byDate.get(d.key) ?? [];
            return (
              <button
                key={d.key}
                onClick={() => selectDay(d.key)}
                className={`flex flex-col items-center rounded-2xl py-2 ${selected === d.key ? "bg-accent/10" : ""}`}
              >
                <span className={`text-xs ${d.offset === 0 ? "font-bold text-accent" : "text-muted"}`}>
                  {d.offset === 0 ? "오늘" : dow}
                </span>
                <span className="text-[11px] text-muted">{md}</span>
                <span className="my-1 text-2xl">{w.emoji}</span>
                <span className="text-xs font-medium">{d.score ?? "-"}</span>
                <span className="mt-1 h-4 text-xs leading-4">
                  {evs.slice(0, 2).map((e) => kindInfo(e.kind).icon).join("")}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-start">
        <section className="min-w-0 rounded-3xl bg-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => shiftMonth(-1)} className="px-2 text-xl text-muted">‹</button>
            <h2 className="font-display text-xl">
              {month.getFullYear()}년 {month.getMonth() + 1}월
            </h2>
            <button onClick={() => shiftMonth(1)} className="px-2 text-xl text-muted">›</button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((c) => {
              const evs = byDate.get(c.key) ?? [];
              const isSel = c.key === selected;
              const isToday = c.key === todayKey;
              return (
                <button
                  key={c.key}
                  onClick={() => selectDay(c.key)}
                  className={`relative flex min-h-14 flex-col items-center rounded-xl p-1 md:min-h-20 md:items-stretch ${
                    isSel ? "bg-accent/10" : ""
                  } ${c.inMonth ? "" : "opacity-30"}`}
                >
                  <span
                    className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isToday ? "bg-accent font-bold text-white" : c.dow === 0 ? "text-danger" : ""
                    }`}
                  >
                    {c.day}
                  </span>
                  {evs.length > 0 && (
                    <span className="mt-0.5 text-base leading-none md:absolute md:right-1 md:top-1 md:text-sm">
                      {scoreToWeather(predict(events, c.key, gradeView)).emoji}
                    </span>
                  )}
                  <span className="mt-1 hidden space-y-0.5 md:block">
                    {evs.slice(0, 2).map((e) => (
                      <span key={e.id} className={`block truncate rounded px-1 text-left text-[11px] ${kindInfo(e.kind).chip}`}>
                        {gradeView === "전체" && e.grades.length > 0 && (
                          <b className="mr-1 font-bold">{gradePrefix(e)}</b>
                        )}
                        {e.title}
                      </span>
                    ))}
                    {evs.length > 2 && <span className="block text-left text-[11px] text-muted">+{evs.length - 2}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3">
            <span className="w-full text-xs text-muted">일정이 있는 날엔 그날 예상 날씨가 떠요</span>
            {EVENT_KINDS.map((k) => (
              <span key={k.key} className="flex items-center gap-1 text-xs text-muted">
                <span>{k.icon}</span>
                {k.label}
              </span>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-3xl bg-panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-xl">
              {selM}월 {selD}일 {formatDay(selected).dow}요일
            </h2>
            <button onClick={openNew} className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-white">
              + 일정
            </button>
          </div>
          {dayEvents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              등록된 일정이 없어요.
              <br />
              아는 일정이 있다면 먼저 알려주세요!
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {dayEvents.map((ev) => (
                <li key={ev.id} className="flex gap-3 py-3">
                  <span className="w-6 shrink-0 pt-0.5 text-center text-lg">{kindInfo(ev.kind).icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{ev.title}<SampleBadge id={ev.id} /></p>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                          ev.grades.length ? "bg-accent/10 text-accent" : "bg-panel-2 text-muted"
                        }`}
                      >
                        {gradeLabel(ev)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{eventMeta(ev)}</p>
                    <div className="mt-1.5 flex gap-3 text-xs text-muted">
                      <button onClick={() => openEdit(ev)}>수정</button>
                      <button onClick={() => setHistoryId(ev.id)}>기록</button>
                      <button onClick={() => remove(ev)}>삭제</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-3xl bg-panel p-5">
        <h2 className="font-display text-xl">최근 변경</h2>
        <p className="mb-2 text-xs text-muted">누구나 고칠 수 있고, 모든 변경은 기록돼서 언제든 되돌릴 수 있어요.</p>
        <ul className="divide-y divide-line text-sm">
          {revisions.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="w-10 shrink-0 text-xs text-muted">{r.action}</span>
              <span className={`min-w-0 flex-1 truncate ${r.snapshot.deleted ? "text-muted line-through" : ""}`}>
                {r.snapshot.title}
              </span>
              {r.snapshot.deleted && (
                <button onClick={() => setHistoryId(r.eventId)} className="text-xs font-semibold text-accent">복구</button>
              )}
              <span className="shrink-0 text-xs text-muted">{timeAgo(r.at)}</span>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={form !== null} title={editingId ? "일정 수정" : "일정 추가"} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-4">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value.slice(0, 40) })}
              placeholder="예: 자료구조 중간고사"
              className="w-full rounded-xl bg-panel-2 px-4 py-3 outline-none focus:ring-2 focus:ring-accent"
            />
            <div>
              <p className="mb-2 text-sm text-muted">종류</p>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_KINDS.map((k) => (
                  <button
                    key={k.key}
                    onClick={() => setForm({ ...form, kind: k.key })}
                    className={`rounded-full px-3 py-1.5 text-sm ${form.kind === k.key ? "bg-accent text-white" : "bg-panel-2 text-muted"}`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="rounded-xl bg-panel-2 px-4 py-3"
              />
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="rounded-xl bg-panel-2 px-4 py-3"
              />
            </div>
            <input
              value={form.place}
              onChange={(e) => setForm({ ...form, place: e.target.value.slice(0, 40) })}
              placeholder="장소 (선택, 예: 공학관 101호)"
              className="w-full rounded-xl bg-panel-2 px-4 py-3 outline-none focus:ring-2 focus:ring-accent"
            />
            <div>
              <p className="mb-2 text-sm text-muted">대상 학년 (선택 안 하면 전체)</p>
              <div className="flex flex-wrap gap-1.5">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleFormGrade(g)}
                    className={`rounded-full px-3 py-1.5 text-sm ${form.grades.includes(g) ? "bg-accent text-white" : "bg-panel-2 text-muted"}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={saveForm}
              disabled={!form.title.trim() || !form.date}
              className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-white disabled:opacity-30"
            >
              {editingId ? "수정 저장" : "캘린더에 올리기"}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!historyEvent} title="변경 기록" onClose={() => setHistoryId(null)}>
        <ul className="divide-y divide-line">
          {revisions
            .filter((r) => r.eventId === historyId)
            .map((r, i) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{r.action} · {timeAgo(r.at)}</span>
                  {i === 0 ? (
                    <span>현재 버전</span>
                  ) : (
                    <button onClick={() => revert(r)} className="font-semibold text-accent">이 버전으로 되돌리기</button>
                  )}
                </div>
                <p className={`mt-1 font-medium ${r.snapshot.deleted ? "text-muted line-through" : ""}`}>{r.snapshot.title}</p>
                <p className="text-sm text-muted">
                  {r.snapshot.date} · {eventMeta(r.snapshot)} · {gradeLabel(r.snapshot)}
                </p>
              </li>
            ))}
        </ul>
      </Sheet>
    </>
  );
}
