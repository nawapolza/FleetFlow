import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CheckCircle2, FileText, Printer, RefreshCw, Search,
  Truck, UserRound, WalletCards,
} from 'lucide-react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError } from '../utils/alerts.js';
import { date, money, today } from '../utils/format.js';
import './billing.css';

function monthBounds(base = today()) {
  const [y, m] = base.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { year: y, month: mm, last };
}

function presetRange(type, base = today()) {
  const { year, month, last } = monthBounds(base);
  const yy = String(year);
  if (type === '1-7') return { from: `${yy}-${month}-01`, to: `${yy}-${month}-07` };
  if (type === '1-15') return { from: `${yy}-${month}-01`, to: `${yy}-${month}-15` };
  if (type === '16-end') return { from: `${yy}-${month}-16`, to: `${yy}-${month}-${String(last).padStart(2, '0')}` };
  return { from: `${yy}-${month}-01`, to: `${yy}-${month}-${String(last).padStart(2, '0')}` };
}

function Summary({ icon: Icon, label, value, helper, primary = false }) {
  return <article className={primary ? 'bill-metric is-primary' : 'bill-metric'}>
    <span><Icon size={18} /></span>
    <div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div>
  </article>;
}

export default function BillingPage() {
  const { activeBranch } = useBranch();
  const initial = presetRange('1-15');
  const [rangeType, setRangeType] = useState('1-15');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [selectedPayer, setSelectedPayer] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.billingSummary({ from, to });
      setData(res.data);
      if (selectedPayer && !(res.data?.payers || []).some((row) => row.payer === selectedPayer)) setSelectedPayer('');
    } catch (error) {
      alertError(error, 'โหลดข้อมูลใบวางบิลไม่สำเร็จ');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [from, to, selectedPayer]);

  useEffect(() => { load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(type) {
    setRangeType(type);
    const next = presetRange(type, from || today());
    setFrom(next.from);
    setTo(next.to);
  }

  const q = search.trim().toLocaleLowerCase('th');
  const payers = useMemo(() => (data?.payers || []).filter((row) => !q || [row.payer, ...(row.plate_nos || []), ...(row.driver_names || [])].join(' ').toLocaleLowerCase('th').includes(q)), [data?.payers, q]);
  const activePayer = selectedPayer || payers[0]?.payer || '';
  const payerSummary = (data?.payers || []).find((row) => row.payer === activePayer) || null;
  const payerItems = useMemo(() => (data?.items || []).filter((row) => row.payer === activePayer), [data?.items, activePayer]);
  const total = data?.total || {};

  if (loading && !data) return <Loading />;

  return <div className="billing-page">
    <section className="billing-hero print-hide">
      <div>
        <span className="billing-kicker">BILLING CENTER</span>
        <h1>ใบวางบิลตามผู้จ่ายค่าแรง</h1>
        <p>รวมยอดเที่ยวงานของแต่ละเจ้าอัตโนมัติจากช่อง “ผู้จ่ายค่าแรง” เลือกช่วง 1–7 วัน, 1–15 วัน, 16–สิ้นเดือน หรือกำหนดเองได้</p>
      </div>
      <div className="billing-branch"><Truck size={18} /><span><small>สาขา</small><b>{activeBranch?.name || '-'}</b></span></div>
    </section>

    <section className="billing-filter print-hide">
      <div className="billing-presets">
        <button className={rangeType === '1-7' ? 'is-active' : ''} onClick={() => applyPreset('1-7')}>1–7 วัน</button>
        <button className={rangeType === '1-15' ? 'is-active' : ''} onClick={() => applyPreset('1-15')}>1–15 วัน</button>
        <button className={rangeType === '16-end' ? 'is-active' : ''} onClick={() => applyPreset('16-end')}>16–สิ้นเดือน</button>
        <button className={rangeType === 'month' ? 'is-active' : ''} onClick={() => applyPreset('month')}>ทั้งเดือน</button>
      </div>
      <label><span>จากวันที่</span><input type="date" value={from} onChange={(e) => { setRangeType('custom'); setFrom(e.target.value); }} /></label>
      <label><span>ถึงวันที่</span><input type="date" value={to} onChange={(e) => { setRangeType('custom'); setTo(e.target.value); }} /></label>
      <label className="billing-search"><span><Search size={15}/> ค้นหาผู้จ่าย / ทะเบียน / คนขับ</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="เช่น ธนวงค์, 70-3356" /></label>
      <button className="billing-refresh" onClick={() => load()}><RefreshCw size={16}/> รีเฟรช</button>
    </section>

    <section className="billing-metrics print-hide">
      <Summary icon={UserRound} label="ผู้จ่ายค่าแรง" value={`${total.payers || 0} เจ้า`} helper="คู่ค้าที่มีเที่ยวงานในช่วงนี้" />
      <Summary icon={Truck} label="เที่ยวงาน" value={`${total.trips || 0} เที่ยว`} helper="รวมทุกผู้จ่ายค่าแรง" />
      <Summary icon={WalletCards} label="ยอดวางบิลรวม" value={money(total.amount_baht || 0)} helper="รายได้รวมทุกเที่ยว" primary />
      <Summary icon={CheckCircle2} label="รอรับชำระ" value={money(total.pending_amount_baht || 0)} helper="รายการที่ยังไม่จ่าย" />
    </section>

    <section className="billing-layout">
      <aside className="billing-payers print-hide">
        <div className="billing-section-title"><div><span>รายชื่อผู้จ่ายค่าแรง</span><small>{payers.length} เจ้าในช่วงที่เลือก</small></div></div>
        <div className="billing-payer-list">
          {payers.map((row) => <button key={row.payer} className={activePayer === row.payer ? 'is-active' : ''} onClick={() => setSelectedPayer(row.payer)}>
            <span><b>{row.payer}</b><small>{row.trips} เที่ยว · {(row.plate_nos || []).length} ทะเบียน</small></span>
            <strong>{money(row.amount_baht)}</strong>
          </button>)}
          {!payers.length && <div className="billing-empty">ยังไม่พบข้อมูลผู้จ่ายค่าแรงในช่วงวันที่นี้</div>}
        </div>
      </aside>

      <main className="billing-invoice-wrap">
        {!payerSummary ? <div className="billing-empty billing-empty-large">เลือกผู้จ่ายค่าแรงเพื่อเปิดใบวางบิล</div> : <article className="billing-invoice">
          <header className="billing-invoice-head">
            <div>
              <span className="billing-kicker">STATEMENT / BILLING SUMMARY</span>
              <h2>ใบวางบิล</h2>
              <p>ขวัญใจดาวทองขนส่ง · {activeBranch?.name || '-'}</p>
            </div>
            <div className="billing-invoice-no"><small>ช่วงวางบิล</small><b>{date(from)} – {date(to)}</b><span>สร้างจากข้อมูลเที่ยวงานจริง</span></div>
          </header>

          <section className="billing-customer">
            <div><small>วางบิลถึง</small><strong>{payerSummary.payer}</strong><span>อ้างอิงจากช่องผู้จ่ายค่าแรงในบันทึกงาน</span></div>
            <div><small>จำนวนเที่ยว</small><strong>{payerSummary.trips} เที่ยว</strong><span>{(payerSummary.plate_nos || []).join(', ') || '-'}</span></div>
            <div><small>ยอดรวม</small><strong>{money(payerSummary.amount_baht)}</strong><span>รอรับ {money(payerSummary.pending_amount_baht)}</span></div>
          </section>

          <section className="billing-items">
            <div className="billing-items-head"><span>วันที่</span><span>ทะเบียน / คนขับ</span><span>รายละเอียดงาน</span><span>ยอดเงิน</span></div>
            {payerItems.map((item) => <div className="billing-item" key={item.id}>
              <span data-label="วันที่"><b>{date(item.date)}</b></span>
              <span data-label="ทะเบียน / คนขับ"><b>{item.plate_no}</b><small>{item.driver_name}</small></span>
              <span data-label="รายละเอียดงาน"><b>{item.cargo_name}</b><small>{item.origin_place} → {item.destination_place}</small></span>
              <span data-label="ยอดเงิน" className="billing-item-amount"><b>{money(item.amount_baht)}</b><small>{item.payment_status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'}</small></span>
            </div>)}
          </section>

          <footer className="billing-total">
            <div><span>ยอดจ่ายแล้ว</span><b>{money(payerSummary.paid_amount_baht)}</b></div>
            <div><span>ยอดรอรับชำระ</span><b>{money(payerSummary.pending_amount_baht)}</b></div>
            <div className="is-grand"><span>ยอดวางบิลรวม</span><strong>{money(payerSummary.amount_baht)}</strong></div>
          </footer>

          <div className="billing-print-actions print-hide">
            <button onClick={() => window.print()}><Printer size={17}/> พิมพ์ / บันทึก PDF</button>
            <span><FileText size={15}/> ระบบรวมยอดจากแต่ละเที่ยว ไม่แก้ไขข้อมูลต้นฉบับใน MongoDB</span>
          </div>
        </article>}
      </main>
    </section>
  </div>;
}
