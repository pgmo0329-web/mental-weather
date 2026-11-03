import { notFound } from "next/navigation";
import { Suspense } from "react";
import AlertView from "@/components/AlertView";
import { TODAY_ALERTS } from "@/lib/mock";

export function generateStaticParams() {
  return TODAY_ALERTS.map((a) => ({ id: a.id }));
}

async function AlertContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = TODAY_ALERTS.find((a) => a.id === id);
  if (!alert) notFound();
  return <AlertView alert={alert} />;
}

export default function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="md:mx-auto md:max-w-2xl">
      <Suspense fallback={<p className="py-10 text-center text-sm text-muted">특보 수신 중…</p>}>
      <AlertContent params={params} />
      </Suspense>
    </div>
  );
}
