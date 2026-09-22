import { Bell, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import BranchScopeBar from '../components/BranchScopeBar.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, toastSuccess } from '../utils/alerts.js';
import { datetime } from '../utils/format.js';

export default function NotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { const res = await api.notifications(); setRows(res.data || []); }
    catch (err) { alertError(err, 'โหลดแจ้งเตือนไม่ได้'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useRealtime((payload) => { if (['notifications', 'deliveries'].includes(payload?.kind)) load(true); }, true);
  useEffect(() => { load(); }, [load]);

  async function markRead(row) {
    try { await api.markNotificationRead(row.id); toastSuccess('อ่านแจ้งเตือนแล้ว'); load(true); }
    catch (err) { alertError(err, 'อัปเดตแจ้งเตือนไม่ได้'); }
  }

  if (loading) return <Loading />;
  const unread = rows.filter((r) => !Number(r.is_read)).length;

  return (
    <div className="page-shell">
      <div className="page-orbit">
        <span className="page-orbit-code">10 / NOTIFICATION CENTER</span>
        <div>
          <h1 className="page-title">แจ้งเตือนระบบ</h1>
          <p className="page-subtitle">รวมสัญญาณที่ควรตรวจสอบและเหตุการณ์สำคัญไว้ในลำดับเดียว</p>
        </div>
        <span className="page-orbit-signal">REALTIME</span>
      </div>
      <BranchScopeBar label="ศูนย์แจ้งเตือนของสาขา" detail="แจ้งเตือนสต๊อกต่ำและรายการผิดปกติถูกแยกตามสาขา" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-5"><p className="text-sm font-black text-slate-500">แจ้งเตือนทั้งหมด</p><p className="mt-2 text-4xl font-black text-slate-950">{rows.length}</p></div>
        <div className="card p-5"><p className="text-sm font-black text-slate-500">ยังไม่อ่าน</p><p className="mt-2 text-4xl font-black text-red-600">{unread}</p></div>
        <div className="card p-5"><p className="text-sm font-black text-slate-500">Realtime</p><p className="mt-2 text-lg font-black text-blue-700">เปิดใช้งาน</p></div>
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.id} className={`card p-4 md:p-5 ${Number(row.is_read) ? 'opacity-70' : ''}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <div className={badgeColor(row.type)}><Bell size={20} /></div>
                <div>
                  <h3 className="text-lg font-black text-slate-950">{row.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{row.message}</p>
                  <p className="mt-2 text-xs font-bold text-slate-400">{datetime(row.created_at)}</p>
                </div>
              </div>
              {!Number(row.is_read) && <button className="btn-soft" onClick={() => markRead(row)}><CheckCircle2 size={18} /> อ่านแล้ว</button>}
            </div>
          </div>
        ))}
        {!rows.length && <div className="card p-10 text-center text-sm font-bold text-slate-400">ยังไม่มีแจ้งเตือน</div>}
      </div>
    </div>
  );
}

function badgeColor(type) {
  if (type === 'danger') return 'rounded-3xl bg-red-50 p-3 text-red-600';
  if (type === 'warning') return 'rounded-3xl bg-sky-50 p-3 text-sky-600';
  return 'rounded-3xl bg-blue-50 p-3 text-blue-600';
}
