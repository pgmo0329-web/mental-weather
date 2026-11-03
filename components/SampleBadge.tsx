// supabase/seed.sql로 넣은 예시 데이터(e1, p1, pc1, c1 …)는 실제 제보와 구분해서 표시한다
export function isSample(id: string) {
  return /^(e|p|pc|c)\d{1,2}$/.test(id);
}

export default function SampleBadge({ id }: { id: string }) {
  if (!isSample(id)) return null;
  return (
    <span className="ml-1 inline-block shrink-0 rounded bg-slate-200 px-1 py-px align-middle text-[10px] font-semibold text-slate-600">
      샘플
    </span>
  );
}
