import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/** Client-side paging: does not issue any API requests when changing pages/searching. */
export function useCompactList(items, fields, pageSize = 10) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter(item => fields(item).some(value => String(value ?? '').toLocaleLowerCase().includes(term)));
  }, [items, fields, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(current => Math.min(current, pages)), [pages]);
  const updateQuery = value => { setQuery(value); setPage(1); };
  return { query, setQuery: updateQuery, page, setPage, pages, filtered, visible: filtered.slice((page - 1) * pageSize, page * pageSize) };
}
export default function CompactPager({ state, label = 'ค้นหารายการ', className = '' }) {
  return <div className={`kw-list-toolbar ${className}`}>
    <label className="kw-list-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label={label} placeholder={label} value={state.query} onChange={event => state.setQuery(event.target.value)}/></label>
    <div className="kw-list-pages"><span>{state.filtered.length} รายการ · หน้า {state.page}/{state.pages}</span>
      <button type="button" aria-label="หน้าก่อนหน้า" disabled={state.page <= 1} onClick={() => state.setPage(p => Math.max(1, p - 1))}><ChevronLeft size={19}/></button>
      <button type="button" aria-label="หน้าถัดไป" disabled={state.page >= state.pages} onClick={() => state.setPage(p => Math.min(state.pages, p + 1))}><ChevronRight size={19}/></button>
    </div>
  </div>;
}
