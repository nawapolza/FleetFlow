import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import DeliveryForm from '../components/DeliveryForm.jsx';
import DeliveryReceiptCard from '../components/DeliveryReceiptCard.jsx';
import Loading from '../components/Loading.jsx';
import BranchScopeBar from '../components/BranchScopeBar.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, confirmDanger, toastSuccess } from '../utils/alerts.js';

const PAGE_SIZE = 10;

export default function DeliveriesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', from: '', to: '', limit: '200' });
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async (params = filters, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.deliveries({ ...params, limit: params.limit || 200 });
      setRows(res.data || []);
    } catch (err) {
      alertError(err, 'โหลดรายการไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters]);

  useRealtime((payload) => { if (payload?.kind === 'deliveries') load(filters, true); }, true);
  useEffect(() => { load(filters); }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function remove(row) {
    const ok = await confirmDanger(`ลบรายการ ${row.plate_no || ''}?`, 'รายการที่ลบจะถูกคืนสต๊อกให้อัตโนมัติถ้ามีการหักสต๊อกไว้');
    if (!ok) return;
    try {
      await api.deleteDelivery(row.id);
      toastSuccess('ลบรายการแล้ว');
      load(filters, true);
    } catch (err) {
      alertError(err, 'ลบรายการไม่ได้');
    }
  }
  function submitFilter(e) {
    e.preventDefault();
    setPage(1);
    load(filters);
  }

  function clearFilter() {
    const reset = { q: '', from: '', to: '', limit: '200' };
    setFilters(reset);
    setPage(1);
    load(reset);
  }

  return (
    <div className="page-shell">
      <BranchScopeBar label="รายการของสาขา" detail="การค้นหา แก้ไข และลบ จะแสดงเฉพาะรายการของสาขาที่เลือก" />
      <div className="history-console">
        <div className="history-console-head">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">รายการงานน้ำมัน</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-blue-100">ค้นหาใบสรุปย้อนหลังของสาขาที่เลือกแบบอ่านง่าย</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black backdrop-blur">
              ทั้งหมด {rows.length} รายการ · หน้า {page}/{totalPages}
            </div>
          </div>
        </div>

        <form onSubmit={submitFilter} className="delivery-filter-grid history-filter-grid p-4 md:p-5">
          <div className="history-search-row">
          <label className="block history-search-field">
            <span className="label flex items-center gap-2"><Search size={15} /> ค้นหา</span>
            <input className="input mt-1" placeholder="ทะเบียน คนขับ ผู้กรอก ต้นทาง ปลายทาง" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </label>
          <button type="submit" className="btn-primary history-search-button"><Search size={18} /> ค้นหา</button>
          <button type="button" className={`btn-soft history-filter-toggle ${filterOpen ? 'is-open' : ''}`} onClick={() => setFilterOpen((open) => !open)}>
            <Filter size={17} /> ตัวกรอง {(filters.from || filters.to) && <span className="history-filter-dot" />} <ChevronDown size={16} />
          </button>
          </div>

          <div className={`history-advanced-filters ${filterOpen ? 'is-open' : ''}`}>
            <div className="history-filter-title"><CalendarRange size={16} /><span>เลือกช่วงวันที่</span></div>
            <label className="block">
              <span className="label">จากวันที่</span>
              <input className="input mt-1" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">ถึงวันที่</span>
              <input className="input mt-1" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            </label>
            <button type="submit" className="btn-primary"><Search size={18} /> ใช้ตัวกรอง</button>
            <button type="button" className="btn-soft" onClick={clearFilter}><X size={18} /> ล้างทั้งหมด</button>
          </div>
        </form>
      </div>

      {loading ? <Loading /> : (
        <>
          <div className="grid gap-4">
            {pageRows.map((row) => <DeliveryReceiptCard key={row.id} row={row} onEdit={() => setEditing(row)} onDelete={() => remove(row)} />)}
            {!rows.length && <div className="card-clean p-10 text-center text-sm font-bold text-slate-400">ไม่พบรายการ</div>}
          </div>

          {rows.length > PAGE_SIZE && (
            <div className="sticky bottom-20 z-20 rounded-3xl bg-white/95 p-3 shadow-2xl shadow-slate-900/10 backdrop-blur md:static md:shadow-none">
              <div className="flex items-center justify-between gap-3">
                <button type="button" className="btn-soft" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={18} /> ก่อนหน้า</button>
                <div className="text-center text-sm font-black text-slate-600">แสดง {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, rows.length)} จาก {rows.length}</div>
                <button type="button" className="btn-soft" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>ถัดไป <ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-950/70 p-3 backdrop-blur md:p-8">
          <div className="mx-auto max-w-5xl">
            <div className="sticky top-3 z-10 mb-3 flex justify-end"><button className="btn-soft bg-white" onClick={() => setEditing(null)}><X size={18} /> ปิด</button></div>
            <DeliveryForm initialData={editing} onSaved={() => { setEditing(null); load(filters, true); }} />
          </div>
        </div>
      )}
    </div>
  );
}
