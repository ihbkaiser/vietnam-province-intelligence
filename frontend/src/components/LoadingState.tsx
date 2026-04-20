export function LoadingState({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 p-5 text-sm text-ink shadow-panel backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-tide" />
        <span>{label}</span>
      </div>
    </div>
  );
}
