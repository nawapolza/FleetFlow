import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote, CalendarDays, CheckCircle2, ChevronRight, Clock3, PackagePlus,
  Pencil, Plus, Printer, ReceiptText, Save, Search, Trash2, Truck, UserRound, Wallet, X,
} from 'lucide-react';
import { api } from '../api.js';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';
import './driverIncome.css';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const cash = n => (Number(n || 0) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toBaht = v => (Number(v || 0) / 100).toFixed(2);
const emptyAdvance = () => ({ date: today(), vehicle_id: '', driver_name: '', amount_baht: '', note: '' });
const PAGE_SIZE = 10;

function Pager({ page, pages, setPage }) {
  if (pages <= 1) return null;
  return <div className="dw-pager">
    <button type="button" disabled={page <= 1} onClick={() => setPage(v => Math.max(1, v - 1))}>ก่อนหน้า</button>
    <span>{page} / {pages}</span>
    <button type="button" disabled={page >= pages} onClick={() => setPage(v => Math.min(pages, v + 1))}>ถัดไป</button>
  </div>;
}

function SummaryCard({ label, value, sub, emphasis = false }) {
  return <div className={emphasis ? 'dw-summary-card is-primary' : 'dw-summary-card'}>
    <span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}
  </div>;
}

function Empty({ children }) { return <div className="dw-empty"><ReceiptText size={24}/><p>{children}</p></div>; }

export default function TripFinancePage() {
  const { activeBranchId } = useBranch();
  const [step, setStep] = useState(1);
  const [periodMode, setPeriodMode] = useState('month');
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedPending, setSelectedPending] = useState(null);
  const [tripForm, setTripForm] = useState(null);
  const [editingTripId, setEditingTripId] = useState('');
  const [advanceForm, setAdvanceForm] = useState(emptyAdvance);
  const [editingAdvanceId, setEditingAdvanceId] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const seq = useRef(0);
  const materialPickerRef = useRef(null);

  const load = useCallback(async () => {
    if (!activeBranchId) return;
    const current = ++seq.current;
    setBusy(true);
    try {
      const result = await api.driverFinance(period);
      if (current === seq.current) setData(result);
    } catch (err) {
      if (current === seq.current) alertError(err, 'โหลดบัญชีคนขับไม่สำเร็จ');
    } finally {
      if (current === seq.current) setBusy(false);
    }
  }, [activeBranchId, period]);

  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);
  useEffect(() => { setPage(1); }, [step, search, period]);
  useEffect(() => {
    if (!materialPickerOpen) return undefined;
    const handlePointerDown = event => {
      if (materialPickerRef.current && !materialPickerRef.current.contains(event.target)) {
        setMaterialPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [materialPickerOpen]);

  const vehicles = data?.vehicles || [];
  const trips = data?.trips || [];
  const advances = data?.advances || [];
  const materials = data?.materials || [];
  const pending = data?.pending_jobs || [];
  const q = search.trim().toLocaleLowerCase('th');

  const filteredPending = useMemo(() => pending.filter(row => !q || [row.date, row.plate_no, row.driver_name, row.origin_place, row.destination_place, row.suggested_material].join(' ').toLocaleLowerCase('th').includes(q)), [pending, q]);
  const filteredTrips = useMemo(() => trips.filter(row => !q || [row.date, row.plate_no, row.driver_name, row.material, row.origin_place, row.destination_place, row.reference].join(' ').toLocaleLowerCase('th').includes(q)), [trips, q]);
  const filteredSummary = useMemo(() => (data?.by_driver || []).filter(row => !q || [row.plate_no, row.driver_name].join(' ').toLocaleLowerCase('th').includes(q)), [data?.by_driver, q]);
  const filteredMaterialOptions = useMemo(() => {
    const keyword = materialSearch.trim().toLocaleLowerCase('th');
    if (!keyword) return materials;
    return materials.filter(row => (row.name || '').toLocaleLowerCase('th').includes(keyword));
  }, [materials, materialSearch]);

  const currentRows = step === 1 ? filteredPending : step === 2 ? filteredTrips : filteredSummary;
  const pages = Math.max(1, Math.ceil(currentRows.length / PAGE_SIZE));
  const visible = currentRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openPending(row) {
    setSelectedPending(row);
    setEditingTripId('');
    setTripForm({
      source_delivery_id: row.source_delivery_id,
      source_job_id: row.source_job_id,
      date: row.date || today(),
      vehicle_id: row.vehicle_id,
      driver_name: row.driver_name || '',
      material: row.suggested_material || '',
      quantity: row.quantity || '',
      origin_place: row.origin_place || '',
      destination_place: row.destination_place || '',
      reference: row.reference || '',
      income_baht: '',
      note: '',
    });
    setMaterialPickerOpen(false);
    setMaterialSearch('');
    setMaterialPickerOpen(false);
    setMaterialSearch('');
    setStep(2);
    setTimeout(() => document.getElementById('driver-income-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function editTrip(row) {
    setSelectedPending(null);
    setEditingTripId(row.id);
    setTripForm({
      source_delivery_id: row.source_delivery_id || '', source_job_id: row.source_job_id || '', date: row.date,
      vehicle_id: row.vehicle_id, driver_name: row.driver_name || '', material: row.material || '', quantity: row.quantity || '',
      origin_place: row.origin_place || '', destination_place: row.destination_place || '', reference: row.reference || '',
      income_baht: toBaht(row.income_satang), note: row.note || '',
    });
    setStep(2);
    setTimeout(() => document.getElementById('driver-income-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  async function saveTrip(event) {
    event.preventDefault();
    if (!tripForm) return;
    if (!tripForm.material) {
      alertError(new Error('กรุณาเลือกวัสดุที่ขนก่อนบันทึก'), 'กรอกข้อมูลไม่ครบ');
      setMaterialPickerOpen(true);
      return;
    }
    setSaving(true);
    try {
      if (editingTripId) await api.updateDriverTrip(editingTripId, tripForm);
      else await api.createDriverTrip(tripForm);
      toastSuccess(editingTripId ? 'แก้ไขรายได้คนขับแล้ว' : 'บันทึกรายได้คนขับแล้ว');
      setTripForm(null); setSelectedPending(null); setEditingTripId('');
      await load();
    } catch (err) { alertError(err, 'บันทึกรายได้คนขับไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function removeTrip(row) {
    if (!await confirmAction('ลบรายการรายได้คนขับ?', `${row.date} · ${row.plate_no} · ${row.driver_name}`)) return;
    try { await api.deleteDriverTrip(row.id); toastSuccess('ลบรายการแล้ว'); await load(); }
    catch (err) { alertError(err, 'ลบรายการไม่สำเร็จ'); }
  }

  function vehicleChanged(id) {
    const vehicle = vehicles.find(v => v.id === id);
    setAdvanceForm(old => ({ ...old, vehicle_id: id, driver_name: vehicle?.driver_name || old.driver_name || '' }));
  }

  async function saveAdvance(event) {
    event.preventDefault(); setSaving(true);
    try {
      if (editingAdvanceId) await api.updateDriverAdvance(editingAdvanceId, advanceForm);
      else await api.createDriverAdvance(advanceForm);
      toastSuccess(editingAdvanceId ? 'แก้ไขยอดเบิกแล้ว' : 'บันทึกยอดเบิกแล้ว');
      setAdvanceForm(emptyAdvance()); setEditingAdvanceId(''); await load();
    } catch (err) { alertError(err, 'บันทึกยอดเบิกไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function removeAdvance(row) {
    if (!await confirmAction('ลบรายการเบิกเงิน?', `${row.date} · ${row.driver_name} · ${cash(row.amount_satang)} บาท`)) return;
    try { await api.deleteDriverAdvance(row.id); toastSuccess('ลบรายการแล้ว'); await load(); }
    catch (err) { alertError(err, 'ลบรายการไม่สำเร็จ'); }
  }

  async function saveMaterial(event) {
    event.preventDefault(); setSaving(true);
    try {
      if (editingMaterial) await api.updateTransportMaterial(editingMaterial.id, { name: materialName });
      else await api.createTransportMaterial({ name: materialName });
      toastSuccess(editingMaterial ? 'แก้ไขวัสดุแล้ว' : 'เพิ่มวัสดุแล้ว');
      setMaterialName(''); setEditingMaterial(null); await load();
    } catch (err) { alertError(err, 'บันทึกวัสดุไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function removeMaterial(row) {
    if (!await confirmAction('ปิดการใช้งานวัสดุ?', row.name)) return;
    try { await api.deleteTransportMaterial(row.id); toastSuccess('ปิดการใช้งานวัสดุแล้ว'); await load(); }
    catch (err) { alertError(err, 'แก้ไขวัสดุไม่สำเร็จ'); }
  }

  function switchMode(next) {
    setPeriodMode(next);
    setPeriod(next === 'year' ? today().slice(0, 4) : today().slice(0, 7));
  }

  const total = data?.total || { trips: 0, income_satang: 0, advance_satang: 0, balance_satang: 0 };

  return <div className="dw-page">
    <section className="dw-hero">
      <div><span>บัญชีคนขับ</span><h1>คิดรายได้จากเที่ยวงานจริง</h1><p>บันทึกงานครั้งเดียว แล้ว Admin คิดรายได้และสรุปยอดปลายเดือน</p></div>
      <img src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง" />
    </section>

    <section className="dw-flow" aria-label="ขั้นตอนการทำงาน">
      <button type="button" className={step === 1 ? 'is-active' : ''} onClick={() => setStep(1)}><b>1</b><span><strong>รายการรอคิดเงิน</strong><small>เที่ยวที่พนักงานบันทึกแล้ว</small></span><ChevronRight size={18}/></button>
      <button type="button" className={step === 2 ? 'is-active' : ''} onClick={() => setStep(2)}><b>2</b><span><strong>บัญชีคนขับ</strong><small>รายได้ต่อเที่ยวและเงินเบิก</small></span><ChevronRight size={18}/></button>
      <button type="button" className={step === 3 ? 'is-active' : ''} onClick={() => setStep(3)}><b>3</b><span><strong>สรุปสิ้นเดือน</strong><small>ยอดคงรับแยกคนขับ/ทะเบียน</small></span><CheckCircle2 size={18}/></button>
    </section>

    <section className="dw-toolbar">
      <div className="dw-period-switch"><button className={periodMode === 'month' ? 'is-active' : ''} onClick={() => switchMode('month')}>รายเดือน</button><button className={periodMode === 'year' ? 'is-active' : ''} onClick={() => switchMode('year')}>รายปี</button></div>
      <label className="dw-date"><CalendarDays size={17}/><input type={periodMode === 'month' ? 'month' : 'number'} min={periodMode === 'year' ? '2020' : undefined} max={periodMode === 'year' ? '2100' : undefined} value={period} onChange={e => setPeriod(e.target.value)} /></label>
      <label className="dw-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา ทะเบียน คนขับ วัสดุ..." /></label>
    </section>

    {step === 1 && <section className="dw-panel">
      <header><div><span className="dw-step-tag">ขั้นตอน 1</span><h2>รายการรอคิดเงิน</h2><p>เที่ยวงานจากหน้าบันทึกงานขนส่งที่ยังไม่ได้กำหนดรายได้คนขับ</p></div><strong className="dw-count">{filteredPending.length} รายการ</strong></header>
      {busy ? <Empty>กำลังโหลดข้อมูล...</Empty> : !visible.length ? <Empty>ไม่มีเที่ยวงานรอคิดเงินในช่วงเวลานี้</Empty> : <div className="dw-card-list">{visible.map(row => <article className="dw-job-card" key={`${row.source_delivery_id}-${row.source_job_id}`}>
        <div className="dw-job-main"><small>{row.date || '-'} · {row.plate_no || '-'}</small><strong>{row.driver_name || 'ไม่ระบุคนขับ'}</strong><span>{row.origin_place || '-'} <ChevronRight size={14}/> {row.destination_place || '-'}</span>{row.quantity && <em>{row.quantity}</em>}</div>
        <button type="button" className="dw-primary" onClick={() => openPending(row)}><Banknote size={17}/> คิดรายได้</button>
      </article>)}</div>}
      <Pager page={page} pages={pages} setPage={setPage}/>
    </section>}

    {step === 2 && <>
      {tripForm && <section className="dw-panel dw-editor" id="driver-income-editor">
        <header><div><span className="dw-step-tag">ขั้นตอน 2</span><h2>{editingTripId ? 'แก้ไขรายได้คนขับ' : 'คิดรายได้เที่ยวนี้'}</h2></div><button type="button" className="dw-close" onClick={() => { setTripForm(null); setEditingTripId(''); setSelectedPending(null); setMaterialPickerOpen(false); setMaterialSearch(''); }}><X size={18}/></button></header>
        <div className="dw-source-strip"><Truck size={18}/><div><strong>{tripForm.plate_no || vehicles.find(v => v.id === tripForm.vehicle_id)?.plate_no || '-'}</strong><span>{tripForm.date} · {tripForm.driver_name || '-'}</span></div></div>
        <form className="dw-form" onSubmit={saveTrip}>
          <label>
            <span>วัสดุที่ขน *</span>
            <div className={`dw-material-select ${materialPickerOpen ? 'is-open' : ''}`} ref={materialPickerRef}>
              <button
                type="button"
                className="dw-material-trigger"
                onClick={() => setMaterialPickerOpen(v => !v)}
                aria-expanded={materialPickerOpen}
                aria-haspopup="listbox"
              >
                <span className="dw-material-trigger-copy">
                  <small>เลือกจากรายการวัสดุในระบบ</small>
                  <strong>{tripForm.material || 'เลือกวัสดุ'}</strong>
                </span>
                <span className="dw-material-trigger-meta">{materials.length} รายการ</span>
              </button>
              {materialPickerOpen && (
                <div className="dw-material-dropdown">
                  <div className="dw-material-searchbox">
                    <Search size={16} />
                    <input
                      value={materialSearch}
                      onChange={e => setMaterialSearch(e.target.value)}
                      placeholder="ค้นหาวัสดุ เช่น ทราย หิน ดิน"
                    />
                  </div>
                  <div className="dw-material-options" role="listbox">
                    {filteredMaterialOptions.length ? filteredMaterialOptions.map(row => (
                      <button
                        type="button"
                        key={row.id}
                        className={tripForm.material === row.name ? 'is-selected' : ''}
                        onClick={() => {
                          setTripForm(v => ({ ...v, material: row.name }));
                          setMaterialPickerOpen(false);
                          setMaterialSearch('');
                        }}
                      >
                        <span>
                          <strong>{row.name}</strong>
                          <small>แตะเพื่อเลือกใช้งานทันที</small>
                        </span>
                        {tripForm.material === row.name && <CheckCircle2 size={18} />}
                      </button>
                    )) : <div className="dw-material-empty">ไม่พบวัสดุที่ค้นหา</div>}
                  </div>
                  <div className="dw-material-dropdown-footer">
                    <button
                      type="button"
                      className="dw-material-manage"
                      onClick={() => {
                        setMaterialPickerOpen(false);
                        setMaterialSearch('');
                        setMaterialOpen(true);
                      }}
                    >
                      <Plus size={15} /> จัดการวัสดุ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </label>
          <label><span>รายได้คนขับเที่ยวนี้ *</span><div className="dw-money"><input type="number" inputMode="decimal" min="0" step="0.01" required value={tripForm.income_baht} onChange={e => setTripForm(v => ({ ...v, income_baht: e.target.value }))} placeholder="0.00"/><b>บาท</b></div></label>
          <label><span>น้ำหนัก / จำนวน</span><input value={tripForm.quantity} onChange={e => setTripForm(v => ({ ...v, quantity: e.target.value }))} placeholder="เช่น 30 ตัน"/></label>
          <label><span>เลขที่ใบงาน</span><input value={tripForm.reference} onChange={e => setTripForm(v => ({ ...v, reference: e.target.value }))}/></label>
          <label className="dw-wide"><span>หมายเหตุ</span><textarea rows="2" value={tripForm.note} onChange={e => setTripForm(v => ({ ...v, note: e.target.value }))}/></label>
          <button className="dw-save dw-wide" disabled={saving}><Save size={18}/>{saving ? 'กำลังบันทึก...' : 'บันทึกรายได้คนขับ'}</button>
        </form>
      </section>}

      <section className="dw-split">
        <div className="dw-panel">
          <header><div><h2>รายได้ที่คิดแล้ว</h2><p>แก้ไขหรือดูรายละเอียดแต่ละเที่ยวได้</p></div></header>
          {!visible.length ? <Empty>ยังไม่มีรายการรายได้ในช่วงเวลานี้</Empty> : <div className="dw-card-list">{visible.map(row => <article className="dw-row" key={row.id}>
            <div><small>{row.date} · {row.plate_no}</small><strong>{row.driver_name}</strong><span>{row.material} · {row.quantity || '-'}</span></div>
            <div className="dw-row-money"><strong>{cash(row.income_satang)} ฿</strong><div><button onClick={() => setDetail({ type: 'trip', row })}>ดู</button><button onClick={() => editTrip(row)}><Pencil size={15}/></button><button onClick={() => removeTrip(row)}><Trash2 size={15}/></button></div></div>
          </article>)}</div>}
          <Pager page={page} pages={pages} setPage={setPage}/>
        </div>

        <div className="dw-panel">
          <header><div><h2>เบิกเงินล่วงหน้า</h2><p>หักออกจากยอดคงรับสิ้นเดือน</p></div></header>
          <form className="dw-form" onSubmit={saveAdvance}>
            <label><span>วันที่ *</span><input type="date" required value={advanceForm.date} onChange={e => setAdvanceForm(v => ({ ...v, date: e.target.value }))}/></label>
            <label><span>ทะเบียนรถ *</span><select required value={advanceForm.vehicle_id} onChange={e => vehicleChanged(e.target.value)}><option value="">เลือกทะเบียน</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></label>
            <label><span>ชื่อคนขับ *</span><input required value={advanceForm.driver_name} onChange={e => setAdvanceForm(v => ({ ...v, driver_name: e.target.value }))}/></label>
            <label><span>ยอดเบิก *</span><div className="dw-money"><input type="number" min="0" step="0.01" required value={advanceForm.amount_baht} onChange={e => setAdvanceForm(v => ({ ...v, amount_baht: e.target.value }))}/><b>บาท</b></div></label>
            <label className="dw-wide"><span>หมายเหตุ</span><input value={advanceForm.note} onChange={e => setAdvanceForm(v => ({ ...v, note: e.target.value }))}/></label>
            <button className="dw-save dw-wide" disabled={saving}><Wallet size={18}/>{editingAdvanceId ? 'บันทึกการแก้ไข' : 'บันทึกยอดเบิก'}</button>
          </form>
          <div className="dw-advance-list">{advances.slice(0, 5).map(row => <div key={row.id}><span>{row.date} · {row.driver_name}</span><strong>{cash(row.amount_satang)} ฿</strong><button onClick={() => { setEditingAdvanceId(row.id); setAdvanceForm({ date: row.date, vehicle_id: row.vehicle_id, driver_name: row.driver_name, amount_baht: toBaht(row.amount_satang), note: row.note || '' }); }}><Pencil size={14}/></button><button onClick={() => removeAdvance(row)}><Trash2 size={14}/></button></div>)}</div>
        </div>
      </section>

      <section className="dw-material-bar"><div><PackagePlus size={20}/><span><strong>วัสดุที่ใช้ในระบบ</strong><small>{materials.length} รายการ</small></span></div><button type="button" onClick={() => setMaterialOpen(true)}><Plus size={16}/> จัดการวัสดุ</button></section>
    </>}

    {step === 3 && <section className="dw-panel dw-print-summary">
      <header><div><span className="dw-step-tag">ขั้นตอน 3</span><h2>สรุปยอดคนขับ</h2><p>รายได้ทั้งหมด − เงินเบิกล่วงหน้า = ยอดคงรับ</p></div><button className="dw-print" type="button" onClick={() => window.print()}><Printer size={17}/> พิมพ์สรุป</button></header>
      <div className="dw-summary-grid">
        <SummaryCard label="จำนวนเที่ยว" value={`${total.trips || 0} เที่ยว`} />
        <SummaryCard label="รายได้รวม" value={`${cash(total.income_satang)} ฿`} />
        <SummaryCard label="เบิกแล้ว" value={`${cash(total.advance_satang)} ฿`} />
        <SummaryCard label="ยอดคงรับ" value={`${cash(total.balance_satang)} ฿`} emphasis />
      </div>
      {!visible.length ? <Empty>ยังไม่มีข้อมูลสำหรับสรุปในช่วงเวลานี้</Empty> : <div className="dw-summary-table"><div className="dw-summary-head"><span>คนขับ / ทะเบียน</span><span>เที่ยว</span><span>รายได้</span><span>เบิก</span><span>คงรับ</span><span></span></div>{visible.map(row => <div className="dw-summary-row" key={`${row.vehicle_id}-${row.driver_name}`}><span><b>{row.driver_name}</b><small>{row.plate_no}</small></span><span>{row.trips}</span><span>{cash(row.income_satang)}</span><span>{cash(row.advance_satang)}</span><span className="dw-balance">{cash(row.balance_satang)}</span><span><button onClick={() => setDetail({ type: 'summary', row })}>รายละเอียด</button></span></div>)}</div>}
      <Pager page={page} pages={pages} setPage={setPage}/>
    </section>}

    {materialOpen && <div className="dw-modal-bg" onClick={() => setMaterialOpen(false)}><section className="dw-modal" onClick={e => e.stopPropagation()}><header><div><h2>จัดการวัสดุ</h2><p>Admin เพิ่มหรือแก้ไขรายการที่ใช้ตอนคิดรายได้</p></div><button onClick={() => setMaterialOpen(false)}><X size={18}/></button></header><form onSubmit={saveMaterial} className="dw-material-form"><input required maxLength="120" value={materialName} onChange={e => setMaterialName(e.target.value)} placeholder="ชื่อวัสดุ เช่น ทราย หิน ดิน"/><button disabled={saving}><Save size={16}/>{editingMaterial ? 'บันทึก' : 'เพิ่มวัสดุ'}</button></form><div className="dw-material-list">{materials.map(row => <div key={row.id}><strong>{row.name}</strong><span><button onClick={() => { setEditingMaterial(row); setMaterialName(row.name); }}><Pencil size={15}/></button><button onClick={() => removeMaterial(row)}><Trash2 size={15}/></button></span></div>)}</div></section></div>}

    {detail && <div className="dw-modal-bg" onClick={() => setDetail(null)}><section className="dw-modal" onClick={e => e.stopPropagation()}><header><div><h2>{detail.type === 'summary' ? 'สรุปคนขับ' : 'รายละเอียดเที่ยวงาน'}</h2></div><button onClick={() => setDetail(null)}><X size={18}/></button></header>{detail.type === 'summary' ? <div className="dw-detail"><p><span>คนขับ</span><b>{detail.row.driver_name}</b></p><p><span>ทะเบียน</span><b>{detail.row.plate_no}</b></p><p><span>จำนวนเที่ยว</span><b>{detail.row.trips}</b></p><p><span>รายได้รวม</span><b>{cash(detail.row.income_satang)} บาท</b></p><p><span>เบิกแล้ว</span><b>{cash(detail.row.advance_satang)} บาท</b></p><p className="is-total"><span>ยอดคงรับ</span><b>{cash(detail.row.balance_satang)} บาท</b></p></div> : <div className="dw-detail"><p><span>วันที่</span><b>{detail.row.date}</b></p><p><span>ทะเบียน</span><b>{detail.row.plate_no}</b></p><p><span>คนขับ</span><b>{detail.row.driver_name}</b></p><p><span>วัสดุ</span><b>{detail.row.material}</b></p><p><span>เส้นทาง</span><b>{detail.row.origin_place || '-'} → {detail.row.destination_place || '-'}</b></p><p><span>น้ำหนัก</span><b>{detail.row.quantity || '-'}</b></p><p className="is-total"><span>รายได้เที่ยวนี้</span><b>{cash(detail.row.income_satang)} บาท</b></p></div>}</section></div>}
  </div>;
}
