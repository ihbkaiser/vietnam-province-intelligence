interface ProvinceTooltipProps {
  provinceName: string;
  provinceCode: string;
}

export function ProvinceTooltip({ provinceName, provinceCode }: ProvinceTooltipProps) {
  return (
    <div className="pointer-events-none rounded-2xl border border-white/70 bg-ink px-4 py-3 text-xs text-white shadow-panel">
      <p className="font-display text-sm font-semibold">{provinceName}</p>
      <p className="mt-1 text-white/70">Mã: {provinceCode}</p>
    </div>
  );
}
