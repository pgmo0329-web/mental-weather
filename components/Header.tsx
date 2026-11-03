"use client";

import ClientOnly from "./ClientOnly";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function TodayLabel() {
  const now = new Date();
  return (
    <>
      {now.getMonth() + 1}월 {now.getDate()}일 {DAYS[now.getDay()]}요일
    </>
  );
}

export default function Header({ title }: { title: string }) {
  return (
    <header className="mb-5">
      <p className="text-sm text-muted">
        <span className="md:hidden">CBNU SW 멘탈 기상청 · </span>
        <ClientOnly>
          <TodayLabel />
        </ClientOnly>
      </p>
      <h1 className="mt-0.5 font-display text-3xl">{title}</h1>
    </header>
  );
}
