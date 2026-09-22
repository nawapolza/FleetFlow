import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gauge,
  History,
  Building2,
  PackagePlus,
  Plus,
  Save,
  Settings2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, uploadUrl } from '../api.js';
import Loading from '../components/Loading.jsx';
import { useBranch } from '../contexts/BranchContext.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';
import { date, datetime, ITEM_TYPES, money, number, today } from '../utils/format.js';

const blankAdd = { item_type: 'ดีเซล', transaction_date: today(), quantity_liters: '', amount_baht: '', bill_no: '', supplier_name: '', note: '' };
const blankAdjust = { item_type: 'ดีเซล', transaction_date: today(), change_liters: '', note: '' };
const blankAudit = { item_type: 'ดีเซล', audit_date: today(), actual_balance_liters: '', note: '' };

export default function StockPage() {
  const { activeBranch } = useBranch();
  const [stocks, setStocks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankAdd);
  const [adjust, setAdjust] = useState(blankAdjust);
  const [audit, setAudit] = useState(blankAudit);
  const [settings, setSettings] = useState({});
  const [file, setFile] = useState(null);

  const averagePrice = useMemo(() => {
    const liters = Number(String(form.quantity_liters || '').replace(',', '.'));
    const amount = Number(String(form.amount_baht || '').replace(',', '.'));
    return liters > 0 && amount > 0 ? amount / liters : 0;
  }, [form.quantity_liters, form.amount_baht]);

  const auditPreview = useMemo(() => {
    const stock = stocks.find((item) => item.item_type === audit.item_type);
    const system = Number(stock?.balance_liters || 0);
    const actualText = String(audit.actual_balance_liters || '').replace(',', '.');
    const actual = actualText === '' ? null : Number(actualText);
    return { system, actual, variance: Number.isFinite(actual) ? actual - system : null };
  }, [stocks, audit.item_type, audit.actual_balance_liters]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [stockRes, txRes, auditRes] = await Promise.all([api.stocks(), api.stockTransactions(), api.stockAudits()]);
      const stockRows = stockRes.data || [];
      setStocks(stockRows);
      setTransactions(txRes.data || []);
      setAudits(auditRes.data || []);
      setSettings(Object.fromEntries(stockRows.map((stock) => [stock.item_type, {
        tank_name: stock.tank_name || '',
        capacity_liters: stock.capacity_liters || '',
        reorder_level_liters: stock.reorder_level_liters || '',
        critical_level_liters: stock.critical_level_liters || '',
      }])));
    } catch (err) {
      alertError(err, 'โหลดสต๊อกไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtime((payload) => {
    if (['stocks', 'dashboard', 'reports'].includes(payload?.kind)) load(true);
  }, true);

  useEffect(() => { load(); }, [load]);

  async function submitAdd(e) {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('stock_photo', file);
      await api.addStock(fd);
      toastSuccess('เติมสต๊อกสำเร็จ');
      setForm(blankAdd);
      setFile(null);
      load(true);
    } catch (err) {
      alertError(err, 'เติมสต๊อกไม่ได้');
    }
  }

  async function submitAdjust(e) {
    e.preventDefault();
    const ok = await confirmAction('ยืนยันปรับสต๊อก?', 'ใช้เฉพาะกรณีต้องเพิ่มหรือลดยอดโดยตรง การตรวจนับจริงควรใช้แบบฟอร์มตรวจนับ');
    if (!ok) return;
    try {
      await api.adjustStock(adjust);
      toastSuccess('ปรับสต๊อกสำเร็จ');
      setAdjust(blankAdjust);
      load(true);
    } catch (err) {
      alertError(err, 'ปรับสต๊อกไม่ได้');
    }
  }

  async function submitAudit(e) {
    e.preventDefault();
    const ok = await confirmAction('ยืนยันยอดตรวจนับจริง?', `ระบบจะปรับยอด ${audit.item_type} จาก ${number(auditPreview.system, 2)} เป็น ${number(auditPreview.actual, 2)} ลิตร และบันทึกส่วนต่างไว้ในรายงานบัญชี`);
    if (!ok) return;
    try {
      await api.auditStock(audit);
      toastSuccess('บันทึกตรวจนับจริงแล้ว');
      setAudit(blankAudit);
      load(true);
    } catch (err) {
      alertError(err, 'บันทึกตรวจนับไม่ได้');
    }
  }

  async function saveSettings(itemType) {
    try {
      await api.updateStockSettings(itemType, settings[itemType]);
      toastSuccess(`บันทึกค่าถัง ${itemType} แล้ว`);
      load(true);
    } catch (err) {
      alertError(err, 'บันทึกค่าถังไม่ได้');
    }
  }

  function setSetting(itemType, key, value) {
    setSettings((old) => ({ ...old, [itemType]: { ...(old[itemType] || {}), [key]: value } }));
  }

  if (loading) return <Loading />;

  return (
    <div className="page-shell owner-stock-page">
      <div className="page-orbit">
        <span className="page-orbit-code">06 / STOCK CONTROL</span>
        <div>
          <h1 className="page-title">คลังน้ำมันและสต๊อกเรียลไทม์</h1>
          <p className="page-subtitle">เติมคลัง ตั้งค่าความจุและระดับแจ้งเตือน ตรวจนับจริง และตรวจสอบการเคลื่อนไหวจากหน้าเดียว</p>
        </div>
        <span className="page-orbit-signal">OWNER CONTROL</span>
      </div>

      <section className="stock-branch-banner card-clean" aria-label="สาขาที่กำลังจัดการ">
        <div className="stock-branch-main">
          <span className="stock-branch-icon"><Building2 size={22} /></span>
          <div><small>คลังที่กำลังจัดการ</small><strong>{activeBranch?.name || 'กำลังเลือกสาขา'}</strong><p>รหัส {activeBranch?.code || '-'} · ข้อมูลสต๊อกและประวัติด้านล่างแยกจากสาขาอื่นทั้งหมด</p></div>
        </div>
        <div className="stock-branch-rule"><CheckCircle2 size={17} /><span>การเติม ตรวจนับ ตั้งค่า และปรับยอด จะบันทึกเข้าสาขานี้เท่านั้น</span></div>
      </section>

      <nav className="stock-section-nav" aria-label="ทางลัดการจัดการคลัง">
        <a href="#stock-overview">ภาพรวมถัง</a><a href="#stock-intake">เติมเข้าคลัง</a><a href="#stock-audit">ตรวจนับจริง</a><a href="#stock-settings">ตั้งค่าถัง</a><a href="#stock-history">ประวัติ</a>
      </nav>

      <section id="stock-overview" className="stock-control-grid">
        {stocks.map((stock) => {
          const status = stock.level_status || 'ready';
          const Icon = status === 'ready' ? CheckCircle2 : AlertTriangle;
          return (
            <article key={stock.item_type} className={`stock-control-card is-${status}`}>
              <header><span><Icon size={22} /></span><div><p>{stock.tank_name || stock.item_type}</p><small>{stock.item_type}</small></div></header>
              <strong>{number(stock.balance_liters, 2)} <small>ลิตร</small></strong>
              <div className="stock-control-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(stock.available_percent || 0)))}%` }} /></div>
              <div className="stock-control-scale"><span>{stock.level_label}</span><small>{number(stock.available_percent, 1)}% ของ {number(stock.capacity_liters, 0)} ลิตร</small></div>
              <footer><span>สั่งเติม ≤ {number(stock.reorder_level_liters, 2)}</span><span>วิกฤต ≤ {number(stock.critical_level_liters, 2)}</span></footer>
            </article>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <form id="stock-intake" onSubmit={submitAdd} className="card overflow-hidden">
          <div className="module-banner">
            <h2 className="flex items-center gap-2 text-xl font-black"><PackagePlus size={22} /> เติมน้ำมันเข้าคลัง</h2>
            <p className="mt-1 text-sm font-bold text-blue-50">บันทึกเข้าคลังของสาขา {activeBranch?.name || 'ที่เลือก'} พร้อมลิตร ยอดเงิน บิล และหลักฐาน ระบบอัปเดตทุกหน้าทันที</p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
            <Select label="ประเภทน้ำมัน" value={form.item_type} onChange={(v) => setForm({ ...form, item_type: v })} />
            <Field type="date" label="วันที่เติม" value={form.transaction_date} onChange={(v) => setForm({ ...form, transaction_date: v })} />
            <Field required type="number" label="จำนวนลิตรที่เติมเข้าสต๊อก" value={form.quantity_liters} onChange={(v) => setForm({ ...form, quantity_liters: v })} suffix="ลิตร" />
            <Field type="number" label="จำนวนเงิน" value={form.amount_baht} onChange={(v) => setForm({ ...form, amount_baht: v })} suffix="บาท" />
            <div className="stock-linked-summary md:col-span-2"><span>ราคาเฉลี่ยจากลิตรและยอดเงิน</span><strong>{averagePrice > 0 ? `${number(averagePrice, 2)} บาท/ลิตร` : 'กรอกลิตรและยอดเงินเพื่อคำนวณ'}</strong></div>
            <Field label="เลขบิล" value={form.bill_no} onChange={(v) => setForm({ ...form, bill_no: v })} />
            <Field label="ผู้จำหน่าย / ร้าน" value={form.supplier_name} onChange={(v) => setForm({ ...form, supplier_name: v })} />
            <StockFilePicker file={file} setFile={setFile} />
            <label className="block md:col-span-2"><span className="label">หมายเหตุ</span><textarea className="input mt-1 min-h-[90px]" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <button className="btn-primary md:col-span-2"><Plus size={18} /> บันทึกเติมสต๊อก</button>
          </div>
        </form>

        <form id="stock-audit" onSubmit={submitAudit} className="card stock-audit-form">
          <div className="stock-audit-head"><span><ClipboardCheck size={22} /></span><div><h2>ตรวจนับสต๊อกจริง</h2><p>กรอกยอดจากการวัดจริง ระบบคำนวณขาด/เกินและส่งเข้าใบสรุปรายเดือน</p></div></div>
          <div className="grid gap-3 p-5">
            <Select label="ประเภทน้ำมัน" value={audit.item_type} onChange={(v) => setAudit({ ...audit, item_type: v })} />
            <Field type="date" label="วันที่ตรวจนับ" value={audit.audit_date} onChange={(v) => setAudit({ ...audit, audit_date: v })} />
            <div className="stock-audit-system"><span>ยอดในระบบ</span><strong>{number(auditPreview.system, 2)} ลิตร</strong></div>
            <Field required type="number" label="ยอดตรวจนับจริง" value={audit.actual_balance_liters} onChange={(v) => setAudit({ ...audit, actual_balance_liters: v })} suffix="ลิตร" />
            <div className={`stock-audit-variance ${Number(auditPreview.variance || 0) < 0 ? 'is-short' : 'is-surplus'}`}><span>ส่วนต่าง</span><strong>{auditPreview.variance === null ? '-' : `${auditPreview.variance > 0 ? '+' : ''}${number(auditPreview.variance, 2)} ลิตร`}</strong></div>
            <label className="block"><span className="label">หมายเหตุ / สาเหตุ</span><textarea required className="input mt-1 min-h-[90px]" value={audit.note} onChange={(e) => setAudit({ ...audit, note: e.target.value })} placeholder="เช่น ตรวจวัดสิ้นเดือน หรือพบการรั่วซึม" /></label>
            <button className="btn-dark"><ClipboardCheck size={18} /> บันทึกยอดตรวจจริง</button>
          </div>
        </form>
      </div>

      <section id="stock-settings" className="card-clean stock-settings-section">
        <div className="stock-settings-head"><div><Settings2 size={21} /><span><strong>ตั้งค่าถังและระดับแจ้งเตือน</strong><small>ระบบจะแจ้งเจ้าของแบบเรียลไทม์เมื่อยอดถึงจุดสั่งเติมหรือจุดวิกฤต</small></span></div></div>
        <div className="stock-settings-grid">
          {stocks.map((stock) => {
            const value = settings[stock.item_type] || {};
            return (
              <div key={stock.item_type} className="stock-setting-card">
                <div className="stock-setting-title"><Gauge size={18} /><div><strong>{stock.item_type}</strong><small>{stock.level_label}</small></div></div>
                <Field label="ชื่อถัง / จุดจ่าย" value={value.tank_name} onChange={(v) => setSetting(stock.item_type, 'tank_name', v)} />
                <div className="grid grid-cols-3 gap-2">
                  <Field type="number" label="ความจุ" value={value.capacity_liters} onChange={(v) => setSetting(stock.item_type, 'capacity_liters', v)} suffix="ลิตร" />
                  <Field type="number" label="จุดสั่งเติม" value={value.reorder_level_liters} onChange={(v) => setSetting(stock.item_type, 'reorder_level_liters', v)} suffix="ลิตร" />
                  <Field type="number" label="จุดวิกฤต" value={value.critical_level_liters} onChange={(v) => setSetting(stock.item_type, 'critical_level_liters', v)} suffix="ลิตร" />
                </div>
                <button type="button" className="btn-soft w-full" onClick={() => saveSettings(stock.item_type)}><Save size={17} /> บันทึกค่าถัง</button>
              </div>
            );
          })}
        </div>
      </section>

      <form onSubmit={submitAdjust} className="card stock-adjust-inline">
        <div><SlidersHorizontal size={21} /><span><strong>ปรับยอดโดยตรง</strong><small>สำหรับแก้ไขเฉพาะกิจ กรอกบวกเพื่อเพิ่มหรือลบเพื่อลด</small></span></div>
        <Select label="ประเภท" value={adjust.item_type} onChange={(v) => setAdjust({ ...adjust, item_type: v })} />
        <Field type="date" label="วันที่" value={adjust.transaction_date} onChange={(v) => setAdjust({ ...adjust, transaction_date: v })} />
        <Field required type="number" label="จำนวนปรับ" value={adjust.change_liters} onChange={(v) => setAdjust({ ...adjust, change_liters: v })} suffix="ลิตร" />
        <Field required label="เหตุผล" value={adjust.note} onChange={(v) => setAdjust({ ...adjust, note: v })} />
        <button className="btn-dark">ยืนยันปรับ</button>
      </form>

      <div id="stock-history"><HistoryTable transactions={transactions} /></div>
      <AuditTable audits={audits} />
    </div>
  );
}

function HistoryTable({ transactions }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 text-lg font-black"><History size={20} /> ประวัติการเคลื่อนไหวสต๊อก</h2></div>
      <div className="divide-y divide-slate-100">
        {transactions.map((row) => (
          <div key={row.id || `${row.created_at}-${row.item_type}`} className="stock-history-row grid gap-2 p-4 text-sm md:grid-cols-7 md:items-center">
            <div data-label="วันที่" className="font-black">{date(row.transaction_date || row.received_date || row.created_at)}</div>
            <div data-label="ประเภท"><span className="badge-blue">{row.item_type || row.fuel_type}</span></div>
            <div data-label="จำนวน" className={Number(row.change_liters || row.quantity_liters) >= 0 ? 'font-black text-blue-700' : 'font-black text-red-700'}>{Number(row.change_liters ?? row.quantity_liters) > 0 ? '+' : ''}{number(row.change_liters ?? row.quantity_liters, 2)} ลิตร</div>
            <div data-label="ยอดเงิน">{money(row.amount_baht)}</div>
            <div data-label="เลขบิล" className="truncate">{row.bill_no || '-'}</div>
            <div data-label="ร้าน / รายการ" className="truncate text-slate-500">{row.supplier_name || row.supplier || row.transaction_type || '-'}</div>
            <div data-label="หลักฐาน">{row.photo ? <a className="badge-blue" href={uploadUrl(row.photo)} target="_blank" rel="noreferrer">ดูรูป</a> : <span className="text-slate-300">ไม่มีรูป</span>}</div>
          </div>
        ))}
        {!transactions.length && <div className="p-8 text-center text-sm font-bold text-slate-400">ยังไม่มีประวัติสต๊อก</div>}
      </div>
    </div>
  );
}

function AuditTable({ audits }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 text-lg font-black"><ClipboardCheck size={20} /> ประวัติตรวจนับจริง</h2></div>
      <div className="stock-audit-table-wrap">
        <table className="stock-audit-table">
          <thead><tr><th>วันที่</th><th>ประเภท</th><th>ยอดระบบ</th><th>ยอดจริง</th><th>ส่วนต่าง</th><th>หมายเหตุ</th><th>เวลาบันทึก</th></tr></thead>
          <tbody>
            {audits.map((row) => <tr key={row.id}><td>{date(row.audit_date)}</td><td>{row.item_type}</td><td>{number(row.system_balance_liters, 2)}</td><td>{number(row.actual_balance_liters, 2)}</td><td className={Number(row.variance_liters || 0) < 0 ? 'is-short' : 'is-surplus'}>{Number(row.variance_liters || 0) > 0 ? '+' : ''}{number(row.variance_liters, 2)}</td><td>{row.note || '-'}</td><td>{datetime(row.created_at)}</td></tr>)}
            {!audits.length && <tr><td colSpan="7" className="p-8 text-center text-slate-400">ยังไม่มีประวัติตรวจนับ</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', suffix = '', required = false }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative mt-1">
        <input required={required} type={type} step={type === 'number' ? '0.01' : undefined} className={`input ${suffix ? 'pr-20' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Select({ label, value, onChange }) {
  return <label className="block"><span className="label">{label}</span><select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>{ITEM_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>;
}

function formatFileSize(bytes = 0) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function StockFilePicker({ file, setFile }) {
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file || !String(file.type || '').startsWith('image/')) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file); setPreviewUrl(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  const isPdf = file && (String(file.type || '').includes('pdf') || /\.pdf$/i.test(String(file.name || '')));
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
      <div className="flex items-start justify-between gap-3"><div><span className="label">รูปบิล / หลักฐานน้ำมันเข้าสต๊อก</span><p className="hint mt-1">รองรับรูปภาพและ PDF</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${file ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{file ? 'เลือกแล้ว' : 'ยังไม่เลือก'}</span></div>
      <div className="mt-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4 text-center"><input className="block w-full cursor-pointer text-sm font-bold text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-black file:text-white" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
      {file && <div className="mt-3 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-blue-100">{previewUrl ? <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" /> : isPdf ? <FileText className="text-blue-700" size={28} /> : <Camera className="text-blue-700" size={28} />}</div><div className="min-w-0 flex-1"><p className="text-xs font-black text-blue-800">ไฟล์ที่เลือก</p><p className="mt-1 break-all text-sm font-black text-slate-900">{file.name}</p><p className="mt-1 text-xs font-bold text-slate-500">{formatFileSize(file.size)}</p></div><button type="button" onClick={() => setFile(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200"><X size={16} /></button></div>}
    </div>
  );
}
