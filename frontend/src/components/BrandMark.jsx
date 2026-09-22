export default function BrandMark({ compact = false, className = '', label = 'TEST SYSTEM' }) {
  const base = compact
    ? 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-white text-[12px] font-black tracking-[0.24em] text-red-700 shadow-sm'
    : 'inline-flex h-14 w-14 items-center justify-center rounded-[1.4rem] border border-red-100 bg-white text-sm font-black tracking-[0.26em] text-red-700 shadow-md';
  return (
    <span className={`${base} ${className}`.trim()} aria-label={label}>
      <span>TS</span>
    </span>
  );
}
