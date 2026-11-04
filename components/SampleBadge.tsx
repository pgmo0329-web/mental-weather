// 샘플 데이터(is_sample)는 실제 제보와 구분해서 표시한다
export default function SampleBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-1 inline-block shrink-0 rounded bg-slate-200 px-1 py-px align-middle text-[10px] font-semibold text-slate-600">
      샘플
    </span>
  );
}
