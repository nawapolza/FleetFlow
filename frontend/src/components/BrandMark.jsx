export default function BrandMark({ compact = false, className = '', label = 'TEST SYSTEM' }) {
  const base = compact
    ? 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/85 text-[12px] font-black tracking-[0.24em] text-violet-700 shadow-sm'
    : 'inline-flex h-14 w-14 items-center justify-center rounded-[1.4rem] border border-white/60 bg-white/85 text-sm font-black tracking-[0.26em] text-violet-700 shadow-md';
  return (
    <span className={`${base} ${className}`.trim()} aria-label={label}>
      <span>TS</span>
    </span>
  );
}
