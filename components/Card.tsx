import Link from "next/link";
import type { ReactNode } from "react";

export default function Card({
  title, more, children, className = "",
}: { title?: string; more?: { href: string; label: string }; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-panel p-5 ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">{title}</h2>
          {more && <Link href={more.href} className="text-sm text-muted">{more.label} ›</Link>}
        </div>
      )}
      {children}
    </section>
  );
}
