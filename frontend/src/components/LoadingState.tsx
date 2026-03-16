export function LoadingState({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 text-sm text-ink shadow-panel backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-tide" />
        <span>{label}</span>
      </div>
    </div>
  );
}
