export default function BrandMark({ compact = false, className = '', label = 'ขวัญใจดาวทองขนส่ง' }) {
  return <img src="/kwanjai-logo.png" alt={label} className={`${compact ? 'h-11 w-11' : 'h-14 w-14'} inline-block rounded-xl bg-white object-contain ${className}`} />;
}
