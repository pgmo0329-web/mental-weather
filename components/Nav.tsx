"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/", label: "오늘 예보", icon: "📺" },
  { href: "/calendar", label: "예보 달력", icon: "📅" },
  { href: "/board", label: "현장 제보", icon: "📡" },
];
const MOBILE = [...MAIN.slice(0, 2), { href: "/vote", label: "내 날씨", icon: "✋" }, MAIN[2]];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/alerts");
  return pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-20 hidden border-b border-line bg-bg/95 backdrop-blur md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-8 px-8 py-3">
          <Link href="/" className="font-display text-xl">
            <span className="text-accent">CBNU SW</span> 멘탈 기상청
          </Link>
          <nav className="flex gap-1">
            {MAIN.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-4 py-2 text-sm ${
                  isActive(pathname, item.href) ? "bg-panel font-semibold text-accent" : "text-muted hover:text-text"
                }`}
              >
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/vote" className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg">
            ✋ 내 오늘 날씨 알려주기
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {MOBILE.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs ${
                isActive(pathname, item.href) ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
