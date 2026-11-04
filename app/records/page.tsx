"use client";

import { useMemo, useState } from "react";
import Card from "@/components/Card";
import ClientOnly from "@/components/ClientOnly";
import Header from "@/components/Header";
import { dailyStore, useStore } from "@/lib/data";
import { getSavedGrade } from "@/lib/local";
import type { DailyRow } from "@/lib/mock";
import { useTodayKey, keyToDate } from "@/lib/useToday";
import { addDays, dateKey, EVENT_KINDS, formatDay, GRADES, kindInfo, MIN_SAMPLE, scoreToWeather } from "@/lib/weather";

type Line = DailyRow["grade"];
const LINES: Line[] = ["전체", ...GRADES];
// 범주형 색은 순서를 고정한다 (학년이 빠져도 남은 선의 색이 바뀌지 않게)
const COLOR: Record<Line, string> = {
  전체: "#2a78d6",
  "1학년": "#eb6834",
  "2학년": "#1baf7a",
  "3학년": "#eda100",
  "4학년": "#e87ba4",
  초과학기: "#008300",
};
const SHRINK = 5; // predict_day 와 같은 값: 관측일이 적으면 기본 가중치 쪽으로 당긴다

export default function RecordsPage() {
  return (
    <ClientOnly fallback={<Header title="관측 기록" />}>
      <RecordsView />
    </ClientOnly>
  );
}

function RecordsView() {
  const all = useStore(dailyStore);
  const todayKey = useTodayKey();
  const hasReal = all.some((r) => !r.isSample);
  const [withSample, setWithSample] = useState(true);
  const [range, setRange] = useState<28 | 0>(28);
  const [shown, setShown] = useState<Line[]>(() => {
    const g = getSavedGrade();
    return g ? ["전체", g] : ["전체"];
  });
  const [effectGrade, setEffectGrade] = useState<Line>(() => getSavedGrade() ?? "전체");

  const rows = useMemo(() => {
    const from = range ? dateKey(addDays(keyToDate(todayKey), -range)) : "";
    return all.filter((r) => (withSample || !r.isSample) && r.day >= from && r.day < todayKey);
  }, [all, withSample, range, todayKey]);

  const days = useMemo(() => [...new Set(rows.map((r) => r.day))].sort(), [rows]);
  const total = rows.filter((r) => r.grade === "전체" && r.score !== null);
  const avg = total.length ? Math.round(total.reduce((s, r) => s + r.score!, 0) / total.length) : null;
  const best = total.length ? total.reduce((a, b) => (b.score! > a.score! ? b : a)) : null;
  const worst = total.length ? total.reduce((a, b) => (b.score! < a.score! ? b : a)) : null;

  const effects = useMemo(() => eventEffects(rows, effectGrade), [rows, effectGrade]);
  const tags = useMemo(() => {
    const sum = new Map<string, number>();
    for (const r of rows) if (r.grade === "전체") for (const t of r.topTags) sum.set(t.tag, (sum.get(t.tag) ?? 0) + t.count);
    return [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  function toggle(line: Line) {
    setShown((prev) => (prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]));
  }

  function downloadCsv() {
    // 일정은 종류마다 칸을 나눠 그날 건수를 적는다 (시험, 과제, … 칸)
    const head = ["day", "grade", "score", "participants", ...EVENT_KINDS.map((k) => k.label), "top_tags", "is_sample"].join(",");
    const body = rows.map((r) =>
      [r.day, r.grade, r.score ?? "", r.participants ?? "",
        ...EVENT_KINDS.map((k) => r.events.filter((e) => e === k.key).length),
        r.topTags.map((t) => `${t.tag}:${t.count}`).join(";"), r.isSample].join(","),
    );
    const blob = new Blob(["﻿" + [head, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mental-weather-${todayKey}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Header title="관측 기록" />
      <p className="-mt-3 mb-4 text-sm text-muted">
        매일 자정에 전날 결과가 저장돼요. 개인 투표가 아니라 하루 집계만 남고, {MIN_SAMPLE}명 미만인 날은 가려져요.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-panel p-1 text-sm">
          {([[28, "최근 4주"], [0, "전체 기간"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setRange(v)}
              className={`rounded-full px-3 py-1.5 ${range === v ? "bg-accent font-semibold text-white" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 rounded-full bg-panel px-3 py-2 text-sm text-muted">
          <input type="checkbox" checked={withSample} onChange={(e) => setWithSample(e.target.checked)} />
          샘플 포함
        </label>
        <button onClick={downloadCsv} disabled={rows.length === 0} className="ml-auto rounded-full bg-panel px-3 py-2 text-sm font-semibold text-accent disabled:opacity-30">
          ⬇ CSV 내려받기
        </button>
      </div>

      {!hasReal && (
        <p className="mb-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          아직 실제 기록이 없어 <b>샘플 데이터</b>로 보여주고 있어요. 실제 관측이 쌓이면 샘플을 끄고 볼 수 있어요.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-3xl bg-panel py-12 text-center text-sm text-muted">이 기간에 저장된 기록이 없어요</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:items-start">
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="기간 평균" value={avg === null ? "-" : `${scoreToWeather(avg).emoji} ${avg}`} />
              <Stat label="가장 맑은 날" value={best ? `${formatDay(best.day).md} · ${best.score}` : "-"} />
              <Stat label="가장 흐린 날" value={worst ? `${formatDay(worst.day).md} · ${worst.score}` : "-"} />
            </div>

            <Card title="멘탈 지수 추이">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {LINES.map((l) => (
                  <button
                    key={l}
                    onClick={() => toggle(l)}
                    aria-pressed={shown.includes(l)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                      shown.includes(l) ? "bg-panel-2 font-semibold text-text" : "text-muted"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: shown.includes(l) ? COLOR[l] : "#c7ccd1" }} />
                    {l}
                  </button>
                ))}
              </div>
              <TrendChart rows={rows} days={days} lines={LINES.filter((l) => shown.includes(l))} />
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <Card title="일정이 날씨에 주는 영향">
              <select
                value={effectGrade}
                onChange={(e) => setEffectGrade(e.target.value as Line)}
                aria-label="학년 선택"
                className="mb-3 rounded-xl bg-panel-2 px-3 py-2 text-sm"
              >
                {LINES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <ul className="divide-y divide-line">
                {effects.map((e) => (
                  <li key={e.kind} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-6 text-center text-lg">{kindInfo(e.kind).icon}</span>
                    <span className="w-16 shrink-0">{kindInfo(e.kind).label}</span>
                    <EffectBar value={e.effect} />
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                      {e.effect > 0 ? "+" : ""}{e.effect}
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs text-muted">{e.days ? `${e.days}일` : "기본값"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                그 일정이 있던 날의 평균과 평소 평균의 차이예요. 관측일이 적으면 기본값 쪽으로 보정해서, 내일 예측에 그대로 쓰여요.
              </p>
            </Card>

            <Card title="많이 나온 원인">
              {tags.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">공개된 원인이 없어요</p>
              ) : (
                <ol className="space-y-1.5 text-sm">
                  {tags.map(([tag, count], i) => (
                    <li key={tag} className="flex items-center gap-2">
                      <span className="w-5 text-muted">{i + 1}</span>
                      <span className="flex-1">#{tag}</span>
                      <span className="text-muted tabular-nums">{count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-panel p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

// 일정 종류별 영향: predict_day 의 통계 계산과 같다
function eventEffects(rows: DailyRow[], grade: Line) {
  const hist = rows.filter((r) => r.grade === grade && r.score !== null);
  const base = hist.length ? hist.reduce((s, r) => s + r.score!, 0) / hist.length : 0;
  return EVENT_KINDS.map((k) => {
    const withK = hist.filter((r) => r.events.includes(k.key));
    const n = withK.length;
    const observed = n ? withK.reduce((s, r) => s + r.score!, 0) / n - base : 0;
    return { kind: k.key, days: n, effect: Math.round((n * observed + SHRINK * -k.weight) / (n + SHRINK)) };
  });
}

function EffectBar({ value }: { value: number }) {
  const width = Math.min(50, Math.abs(value) * 1.5);
  return (
    <span className="relative h-2 flex-1 rounded-full bg-panel-2">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <span
        className={`absolute inset-y-0 rounded-full ${value < 0 ? "bg-violet-400" : "bg-amber-400"}`}
        style={value < 0 ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }}
      />
    </span>
  );
}

// 좌표 폭이 작을수록 휴대폰에서 글자가 덜 작아진다
const W = 400;
const H = 200;
const PAD = { l: 28, r: 10, t: 10, b: 22 };

function TrendChart({ rows, days, lines }: { rows: DailyRow[]; days: string[]; lines: Line[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (i: number) => PAD.l + (days.length <= 1 ? 0 : (i / (days.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const index = new Map(days.map((d, i) => [d, i]));
  const byLine = new Map<Line, (number | null)[]>();
  for (const l of lines) byLine.set(l, days.map(() => null));
  for (const r of rows) if (byLine.has(r.grade)) byLine.get(r.grade)![index.get(r.day)!] = r.score;

  // 값이 없는 날은 선을 끊는다
  function path(values: (number | null)[]) {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days.length - 1));
    setHover(i >= 0 && i < days.length ? i : null);
  }

  const ticks = [0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="학년별 멘탈 지수 추이"
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e5e8eb" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#8b95a1">{v}</text>
          </g>
        ))}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#8b95a1">
            {formatDay(days[i]).md}
          </text>
        ))}
        {lines.map((l) => (
          <path key={l} d={path(byLine.get(l)!)} fill="none" stroke={COLOR[l]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#8b95a1" strokeWidth={1} strokeDasharray="3 3" />
            {lines.map((l) => {
              const v = byLine.get(l)![hover];
              return v === null ? null : (
                <circle key={l} cx={x(hover)} cy={y(v)} r={4} fill={COLOR[l]} stroke="#fff" strokeWidth={2} />
              );
            })}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded-xl bg-text px-3 py-2 text-xs text-white shadow"
          style={x(hover) > W / 2 ? { right: `${100 - (x(hover) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }}
        >
          <p className="mb-1 font-semibold">{formatDay(days[hover]).md} ({formatDay(days[hover]).dow})</p>
          {lines.map((l) => {
            const v = byLine.get(l)![hover];
            return (
              <p key={l} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: COLOR[l] }} />
                {l} <b className="ml-auto pl-3">{v === null ? "관측 부족" : v}</b>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
