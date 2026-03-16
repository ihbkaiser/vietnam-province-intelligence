export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-coral/30 bg-white/80 p-6 text-sm text-ink shadow-panel backdrop-blur">
      <p className="font-medium text-coral">Có lỗi xảy ra</p>
      <p className="mt-2 text-ink/70">{message}</p>
    </div>
  );
}
