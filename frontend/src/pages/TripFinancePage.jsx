import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, CheckCircle2,
  ChevronRight, Clock3, PackagePlus, Pencil, Plus, Printer,
  ReceiptText, RefreshCcw, Save, Search, Trash2, Truck,
  UserRound, Wallet, X,
} from 'lucide-react';
import { api } from '../api.js';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';
import './driverIncome.css';

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
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

function SummaryCard({ label, value, sub, emphasis = false, icon = null }) {
  return <div className={emphasis ? 'dw-summary-card is-primary' : 'dw-summary-card'}>
    <div className="dw-summary-card-head">{icon}<span>{label}</span></div>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
  </div>;
}

function Empty({ children }) {
  return <div className="dw-empty"><ReceiptText size={24} /><p>{children}</p></div>;
}

function aggregateByPerson(trips = [], advances = []) {
  const map = new Map();
  const ensure = (name) => {
    const key = String(name || '-').trim().toLocaleLowerCase('th') || '-';
    if (!map.has(key)) map.set(key, {
      key,
      driver_name: name || '-',
      plates: new Set(),
      trips: 0,
      income_satang: 0,
      advance_satang: 0,
      balance_satang: 0,
    });
    return map.get(key);
  };
  trips.forEach(row => {
    const item = ensure(row.driver_name || '-');
    if (row.plate_no) item.plates.add(row.plate_no);
    item.trips += 1;
    item.income_satang += Number(row.income_satang || 0);
  });
  advances.forEach(row => {
    const item = ensure(row.driver_name || '-');
    if (row.plate_no) item.plates.add(row.plate_no);
    item.advance_satang += Number(row.amount_satang || 0);
  });
  return [...map.values()].map(row => ({
    ...row,
    plate_no: [...row.plates].sort((a, b) => a.localeCompare(b, 'th')).join(', ') || '-',
    plates_count: row.plates.size,
    balance_satang: row.income_satang - row.advance_satang,
  })).sort((a, b) => a.driver_name.localeCompare(b.driver_name, 'th'));
}

function aggregateByVehicle(trips = [], advances = []) {
  const map = new Map();
  const ensure = (vehicle_id, plate_no) => {
    const key = String(vehicle_id || plate_no || '-');
    if (!map.has(key)) map.set(key, {
      key,
      vehicle_id: String(vehicle_id || ''),
      plate_no: plate_no || '-',
      drivers: new Set(),
      trips: 0,
      income_satang: 0,
      advance_satang: 0,
      balance_satang: 0,
    });
    return map.get(key);
  };
  trips.forEach(row => {
    const item = ensure(row.vehicle_id, row.plate_no);
    if (row.driver_name) item.drivers.add(row.driver_name);
    item.trips += 1;
    item.income_satang += Number(row.income_satang || 0);
  });
  advances.forEach(row => {
    const item = ensure(row.vehicle_id, row.plate_no);
    if (row.driver_name) item.drivers.add(row.driver_name);
    item.advance_satang += Number(row.amount_satang || 0);
  });
  return [...map.values()].map(row => ({
    ...row,
    driver_name: [...row.drivers].sort((a, b) => a.localeCompare(b, 'th')).join(', ') || '-',
    drivers_count: row.drivers.size,
    balance_satang: row.income_satang - row.advance_satang,
  })).sort((a, b) => a.plate_no.localeCompare(b.plate_no, 'th'));
}

function aggregateByPair(trips = [], advances = []) {
  const map = new Map();
  const find = row => {
    const plate = String(row.plate_no || '').trim().toLocaleUpperCase();
    const driver = String(row.driver_name || '-').trim();
    const key = `${String(row.vehicle_id || plate || '-')}:${driver.toLocaleLowerCase('th')}`;
    if (!map.has(key)) map.set(key, { key, vehicle_id: row.vehicle_id || '', plate_no: plate || '-', driver_name: driver, trips: 0, income_satang: 0, advance_satang: 0 });
    return map.get(key);
  };
  trips.forEach(row => { const target = find(row); target.trips += 1; target.income_satang += Number(row.income_satang || 0); });
  advances.forEach(row => { const target = find(row); target.advance_satang += Number(row.amount_satang || 0); });
  return [...map.values()].map(row => ({ ...row, balance_satang: row.income_satang - row.advance_satang })).sort((a, b) => a.driver_name.localeCompare(b.driver_name, 'th') || a.plate_no.localeCompare(b.plate_no, 'th'));
}

function monthLabel(period) {
  if (!period) return '-';
  if (/^\d{4}$/.test(period)) return `ปี ${period}`;
  const [y, m] = String(period).split('-');
  const date = new Date(`${y}-${m}-01T00:00:00`);
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
}

export default function TripFinancePage() {
  const { activeBranchId, activeBranch } = useBranch();
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
  const [summaryView, setSummaryView] = useState('pair');
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

  useEffect(() => {
    load();
    return () => { seq.current += 1; };
  }, [load]);

  useEffect(() => { setPage(1); }, [step, search, period, summaryView]);

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
  const total = data?.total || { trips: 0, income_satang: 0, advance_satang: 0, balance_satang: 0 };
  const q = search.trim().toLocaleLowerCase('th');

  const filteredPending = useMemo(() => pending.filter(row => !q || [
    row.date, row.plate_no, row.driver_name, row.origin_place, row.destination_place, row.suggested_material, row.reference,
  ].join(' ').toLocaleLowerCase('th').includes(q)), [pending, q]);

  const filteredTrips = useMemo(() => trips.filter(row => !q || [
    row.date, row.plate_no, row.driver_name, row.material, row.origin_place, row.destination_place, row.reference,
  ].join(' ').toLocaleLowerCase('th').includes(q)), [trips, q]);

  const personSummary = useMemo(() => {
    if (Array.isArray(data?.by_person) && data.by_person.length) return data.by_person;
    return aggregateByPerson(trips, advances);
  }, [data?.by_person, trips, advances]);

  const vehicleSummary = useMemo(() => {
    if (Array.isArray(data?.by_vehicle) && data.by_vehicle.length) return data.by_vehicle;
    return aggregateByVehicle(trips, advances);
  }, [data?.by_vehicle, trips, advances]);

  const pairSummary = useMemo(() => data?.by_driver?.length ? data.by_driver : aggregateByPair(trips, advances), [data?.by_driver, trips, advances]);
  const knownDrivers = useMemo(() => [...new Set([
    ...vehicles.map(v => v.driver_name), ...trips.map(v => v.driver_name), ...advances.map(v => v.driver_name),
    ...pending.map(v => v.driver_name),
  ].map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [vehicles, trips, advances, pending]);
  const plateFor = id => vehicles.find(v => v.id === id)?.plate_no || '-';

  const filteredSummary = useMemo(() => {
    const rows = summaryView === 'person' ? personSummary : summaryView === 'vehicle' ? vehicleSummary : pairSummary;
    return rows.filter(row => {
      if (!q) return true;
      return [row.driver_name, row.plate_no, row.vehicle_id].join(' ').toLocaleLowerCase('th').includes(q);
    });
  }, [summaryView, personSummary, vehicleSummary, pairSummary, q]);

  const currentRows = step === 1 ? filteredPending : step === 2 ? filteredTrips : filteredSummary;
  const pages = Math.max(1, Math.ceil(currentRows.length / PAGE_SIZE));
  const visible = currentRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const recentAdvances = useMemo(() => [...advances].sort((a, b) => `${b.date}${b.created_at || ''}`.localeCompare(`${a.date}${a.created_at || ''}`)).slice(0, 8), [advances]);
  const activeVehicle = useMemo(() => vehicles.find(v => v.id === (tripForm?.vehicle_id || advanceForm.vehicle_id)) || null, [vehicles, tripForm?.vehicle_id, advanceForm.vehicle_id]);

  function switchMode(next) {
    setPeriodMode(next);
    setPeriod(next === 'year' ? today().slice(0, 4) : today().slice(0, 7));
  }

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
    setStep(2);
    setTimeout(() => document.getElementById('driver-income-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function editTrip(row) {
    setSelectedPending(null);
    setEditingTripId(row.id);
    setTripForm({
      source_delivery_id: row.source_delivery_id || '',
      source_job_id: row.source_job_id || '',
      date: row.date,
      vehicle_id: row.vehicle_id,
      driver_name: row.driver_name || '',
      material: row.material || '',
      quantity: row.quantity || '',
      origin_place: row.origin_place || '',
      destination_place: row.destination_place || '',
      reference: row.reference || '',
      income_baht: toBaht(row.income_satang),
      note: row.note || '',
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
      setTripForm(null);
      setSelectedPending(null);
      setEditingTripId('');
      await load();
    } catch (err) {
      alertError(err, 'บันทึกรายได้คนขับไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function removeTrip(row) {
    if (!await confirmAction('ลบรายการรายได้คนขับ?', `${row.date} · ${row.plate_no} · ${row.driver_name}`)) return;
    try {
      await api.deleteDriverTrip(row.id);
      toastSuccess('ลบรายการแล้ว');
      await load();
    } catch (err) {
      alertError(err, 'ลบรายการไม่สำเร็จ');
    }
  }

  function vehicleChanged(id) {
    const vehicle = vehicles.find(v => v.id === id);
    setAdvanceForm(old => ({ ...old, vehicle_id: id, driver_name: old.driver_name || vehicle?.driver_name || '' }));
  }

  async function saveAdvance(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingAdvanceId) await api.updateDriverAdvance(editingAdvanceId, advanceForm);
      else await api.createDriverAdvance(advanceForm);
      toastSuccess(editingAdvanceId ? 'แก้ไขยอดเบิกแล้ว' : 'บันทึกยอดเบิกแล้ว');
      setAdvanceForm(emptyAdvance());
      setEditingAdvanceId('');
      await load();
    } catch (err) {
      alertError(err, 'บันทึกยอดเบิกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function removeAdvance(row) {
    if (!await confirmAction('ลบรายการเบิกเงิน?', `${row.date} · ${row.driver_name} · ${cash(row.amount_satang)} บาท`)) return;
    try {
      await api.deleteDriverAdvance(row.id);
      toastSuccess('ลบรายการแล้ว');
      await load();
    } catch (err) {
      alertError(err, 'ลบรายการไม่สำเร็จ');
    }
  }

  async function saveMaterial(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingMaterial) await api.updateTransportMaterial(editingMaterial.id, { name: materialName });
      else await api.createTransportMaterial({ name: materialName });
      toastSuccess(editingMaterial ? 'แก้ไขวัสดุแล้ว' : 'เพิ่มวัสดุแล้ว');
      setMaterialName('');
      setEditingMaterial(null);
      await load();
    } catch (err) {
      alertError(err, 'บันทึกวัสดุไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function removeMaterial(row) {
    if (!await confirmAction('ปิดการใช้งานวัสดุ?', row.name)) return;
    try {
      await api.deleteTransportMaterial(row.id);
      toastSuccess('ปิดการใช้งานวัสดุแล้ว');
      await load();
    } catch (err) {
      alertError(err, 'แก้ไขวัสดุไม่สำเร็จ');
    }
  }

  function formatSearchPlaceholder() {
    if (step === 1) return 'ค้นหาวันที่ ทะเบียน คนขับ ต้นทาง ปลายทาง';
    if (step === 2) return 'ค้นหารายได้คนขับตามวันที่ คนขับ ทะเบียน หรือวัสดุ';
    return summaryView === 'person'
      ? 'ค้นหาชื่อคนขับ หรือทะเบียน'
      : summaryView === 'vehicle'
        ? 'ค้นหาทะเบียน หรือชื่อคนขับ'
        : 'ค้นหาคู่คนขับและทะเบียน';
  }

  function openSummaryDetail(row) {
    const match = entry => summaryView === 'person'
      ? String(entry.driver_name || '').trim().toLocaleLowerCase('th') === String(row.driver_name || '').trim().toLocaleLowerCase('th')
      : summaryView === 'vehicle'
        ? String(entry.vehicle_id || entry.plate_no || '') === String(row.vehicle_id || row.plate_no || '')
        : String(entry.vehicle_id || entry.plate_no || '') === String(row.vehicle_id || row.plate_no || '')
          && String(entry.driver_name || '').trim().toLocaleLowerCase('th') === String(row.driver_name || '').trim().toLocaleLowerCase('th');
    setDetail({ type: 'summary', summaryView, row,
      matchingTrips: trips.filter(match), matchingAdvances: advances.filter(match) });
  }

  function renderSummaryTable() {
    if (!visible.length) return <Empty>ยังไม่มีข้อมูลสำหรับสรุปในช่วงเวลานี้</Empty>;

    if (summaryView === 'person') {
      return <div className="dw-summary-table">
        <div className="dw-summary-head dw-cols-person">
          <span>คนขับ</span><span>ทะเบียนที่ดูแล</span><span>เที่ยว</span><span>รายได้</span><span>เบิก</span><span>คงรับ</span><span></span>
        </div>
        {visible.map(row => <div className="dw-summary-row dw-cols-person" key={row.key || row.driver_name}>
          <span><b>{row.driver_name}</b><small>{row.plates_count || (row.plate_no && row.plate_no !== '-' ? row.plate_no.split(',').length : 0)} ทะเบียน</small></span>
          <span>{row.plate_no || '-'}</span>
          <span>{row.trips || 0}</span>
          <span>{cash(row.income_satang)}</span>
          <span>{cash(row.advance_satang)}</span>
          <span className="dw-balance">{cash(row.balance_satang)}</span>
          <span><button type="button" onClick={() => openSummaryDetail(row)}>รายละเอียด</button></span>
        </div>)}
      </div>;
    }

    if (summaryView === 'vehicle') {
      return <div className="dw-summary-table">
        <div className="dw-summary-head dw-cols-vehicle">
          <span>ทะเบียนรถ</span><span>คนขับ</span><span>เที่ยว</span><span>รายได้</span><span>เบิก</span><span>คงรับ</span><span></span>
        </div>
        {visible.map(row => <div className="dw-summary-row dw-cols-vehicle" key={row.key || row.vehicle_id || row.plate_no}>
          <span><b>{row.plate_no}</b><small>{row.drivers_count || (row.driver_name && row.driver_name !== '-' ? row.driver_name.split(',').length : 0)} คน</small></span>
          <span>{row.driver_name || '-'}</span>
          <span>{row.trips || 0}</span>
          <span>{cash(row.income_satang)}</span>
          <span>{cash(row.advance_satang)}</span>
          <span className="dw-balance">{cash(row.balance_satang)}</span>
          <span><button type="button" onClick={() => openSummaryDetail(row)}>รายละเอียด</button></span>
        </div>)}
      </div>;
    }

    return <div className="dw-summary-table">
      <div className="dw-summary-head dw-cols-pair">
        <span>คนขับ</span><span>ทะเบียน</span><span>เที่ยว</span><span>รายได้</span><span>เบิก</span><span>คงรับ</span><span></span>
      </div>
      {visible.map(row => <div className="dw-summary-row dw-cols-pair" key={`${row.vehicle_id}-${row.driver_name}`}>
        <span><b>{row.driver_name}</b><small>จับคู่ตามคนขับ + ทะเบียน</small></span>
        <span>{row.plate_no}</span>
        <span>{row.trips}</span>
        <span>{cash(row.income_satang)}</span>
        <span>{cash(row.advance_satang)}</span>
        <span className="dw-balance">{cash(row.balance_satang)}</span>
        <span><button type="button" onClick={() => openSummaryDetail(row)}>รายละเอียด</button></span>
      </div>)}
    </div>;
  }

  return <div className="dw-page">
    <datalist id="driver-names">{knownDrivers.map(name => <option key={name} value={name} />)}</datalist>
    <section className="dw-hero">
      <div className="dw-hero-copy">
        <span className="dw-kicker">DRIVER FINANCE</span>
        <h1>บัญชีคนขับ</h1>
        <p>แยกข้อมูลเป็นงานรอคิดรายได้, การบันทึกรายได้–ยอดเบิก, และสรุปยอดคนขับอย่างเป็นระเบียบ อ่านง่าย และพร้อมใช้งานจริง</p>
      </div>
      <div className="dw-hero-badges">
        <div><UserRound size={18} /><span>สาขา {activeBranch?.name || '-'}</span></div>
        <div><CalendarDays size={18} /><span>{monthLabel(period)}</span></div>
        <div><Truck size={18} /><span>{vehicles.length} ทะเบียน</span></div>
      </div>
    </section>

    <section className="dw-flow">
      <button type="button" className={step === 1 ? 'is-active' : ''} onClick={() => setStep(1)}>
        <span>1</span><b>งานรอคิดรายได้</b><small>ดึงจากงานขนส่งที่ยังไม่บันทึกรายได้คนขับ</small><ChevronRight size={16} />
      </button>
      <button type="button" className={step === 2 ? 'is-active' : ''} onClick={() => setStep(2)}>
        <span>2</span><b>บันทึก / จัดการรายได้</b><small>บันทึกรายได้ต่อเที่ยวและยอดเบิกได้ในหน้าจอเดียว</small><ChevronRight size={16} />
      </button>
      <button type="button" className={step === 3 ? 'is-active' : ''} onClick={() => setStep(3)}>
        <span>3</span><b>สรุปสิ้นเดือน</b><small>ดูแบบรายบุคคล รายทะเบียน หรือจับคู่คนขับกับทะเบียน</small><CheckCircle2 size={16} />
      </button>
    </section>

    <section className="dw-toolbar">
      <div className="dw-mode-switch">
        <button type="button" className={periodMode === 'month' ? 'is-active' : ''} onClick={() => switchMode('month')}>รายเดือน</button>
        <button type="button" className={periodMode === 'year' ? 'is-active' : ''} onClick={() => switchMode('year')}>รายปี</button>
      </div>
      <label className="dw-toolbar-field">
        <span><CalendarDays size={16} /> ช่วงสรุป</span>
        <input className="input" type={periodMode === 'year' ? 'number' : 'month'} min={periodMode === 'year' ? '2020' : undefined} max={periodMode === 'year' ? '2099' : undefined} value={period} onChange={e => setPeriod(e.target.value)} />
      </label>
      <label className="dw-toolbar-field dw-search">
        <span><Search size={16} /> ค้นหา</span>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder={formatSearchPlaceholder()} />
      </label>
      <div className="dw-toolbar-actions">
        <button type="button" className="dw-outline-btn" onClick={load} disabled={busy}><RefreshCcw size={16} />{busy ? 'กำลังโหลด' : 'รีเฟรช'}</button>
        {step === 3 && <button type="button" className="dw-outline-btn" onClick={() => window.print()}><Printer size={16} /> พิมพ์สรุป</button>}
      </div>
    </section>

    <section className="dw-summary-grid">
      <SummaryCard label="เที่ยวทั้งหมด" value={`${total.trips || 0} เที่ยว`} sub="รวมทุกคนขับในช่วงที่เลือก" icon={<Truck size={16} />} />
      <SummaryCard label="รายได้รวม" value={`${cash(total.income_satang)} ฿`} sub="รวมรายได้คนขับทุกเที่ยว" icon={<ArrowUpRight size={16} />} />
      <SummaryCard label="เบิกล่วงหน้า" value={`${cash(total.advance_satang)} ฿`} sub="ยอดที่หักออกจากคงรับ" icon={<ArrowDownRight size={16} />} />
      <SummaryCard label="ยอดคงรับ" value={`${cash(total.balance_satang)} ฿`} sub="รายได้รวม - ยอดเบิก" emphasis icon={<Banknote size={16} />} />
    </section>

    {step === 1 && <>
      <section className="dw-panel">
        <header>
          <div>
            <span className="dw-step-tag">ขั้นตอน 1</span>
            <h2>งานขนส่งที่รอคิดรายได้คนขับ</h2>
            <p>เลือกรายการจากงานขนส่ง แล้วกด “คิดรายได้” เพื่อส่งข้อมูลเข้าแบบฟอร์มอัตโนมัติ</p>
          </div>
          <div className="dw-pill-info"><Clock3 size={16} /> รอคิด {filteredPending.length} รายการ</div>
        </header>
        {!visible.length ? <Empty>ยังไม่มีงานที่รอคิดรายได้ในช่วงเวลานี้</Empty> : <div className="dw-card-list">{visible.map(row => <article className="dw-job-card" key={`${row.source_delivery_id}-${row.source_job_id}`}>
          <div className="dw-job-main">
            <strong>{row.plate_no || '-'} <em>{row.driver_name || 'ยังไม่ระบุคนขับ'}</em></strong>
            <span>{row.origin_place || '-'} → {row.destination_place || '-'}</span>
            <small>{row.date || '-'} · {row.suggested_material || 'ยังไม่ระบุวัสดุ'} · {row.quantity || '-'}</small>
            {row.reference && <small>เลขที่ใบงาน: {row.reference}</small>}
          </div>
          <button type="button" className="dw-primary" onClick={() => openPending(row)}><Plus size={16} /> คิดรายได้</button>
        </article>)}</div>}
        <Pager page={page} pages={pages} setPage={setPage} />
      </section>
    </>}

    {step === 2 && <>
      <section className="dw-two-col" id="driver-income-editor">
        <section className="dw-panel">
          <header>
            <div>
              <span className="dw-step-tag">ขั้นตอน 2A</span>
              <h2>{editingTripId ? 'แก้ไขรายได้คนขับ' : 'บันทึกรายได้คนขับต่อเที่ยว'}</h2>
              <p>ทะเบียนรถระบุคันที่วิ่ง ส่วนชื่อคนขับระบุผู้รับรายได้จริง ตรวจสอบทั้งสองช่องก่อนบันทึก</p>
            </div>
          </header>
          {!tripForm ? <Empty>เลือกงานจากขั้นตอน 1 หรือกดแก้ไขจากรายการด้านล่างเพื่อเริ่มบันทึกรายได้</Empty> : <>
            {selectedPending && <div className="dw-source-strip">
              <ReceiptText size={20} />
              <div>
                <b>เชื่อมจากงานขนส่ง</b>
                <span>{selectedPending.plate_no || '-'} · {selectedPending.origin_place || '-'} → {selectedPending.destination_place || '-'}</span>
              </div>
            </div>}
            <form className="dw-form" onSubmit={saveTrip}>
              <label><span>วันที่ *</span><input type="date" required value={tripForm.date} onChange={e => setTripForm(v => ({ ...v, date: e.target.value }))} /></label>
              <label><span>ทะเบียนรถ * (รถที่วิ่งจริง)</span><select required disabled={Boolean(tripForm.source_delivery_id)} value={tripForm.vehicle_id} onChange={e => {
                const vehicle = vehicles.find(v => v.id === e.target.value);
                setTripForm(v => ({ ...v, vehicle_id: e.target.value, driver_name: v.driver_name || vehicle?.driver_name || '' }));
              }}><option value="">เลือกทะเบียนรถ</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></label>
              <label><span>ชื่อคนขับ *</span><input required list="driver-names" value={tripForm.driver_name} onChange={e => setTripForm(v => ({ ...v, driver_name: e.target.value }))} placeholder="เลือกหรือกรอกชื่อคนขับ" /></label>
              <label><span>รายได้คนขับเที่ยวนี้ *</span><div className="dw-money"><input type="number" inputMode="decimal" min="0" step="0.01" required value={tripForm.income_baht} onChange={e => setTripForm(v => ({ ...v, income_baht: e.target.value }))} placeholder="0.00" /><b>บาท</b></div></label>
              <label className="dw-wide"><span>วัสดุที่ขน *</span>
                <div className={`dw-material-select ${materialPickerOpen ? 'is-open' : ''}`} ref={materialPickerRef}>
                  <button type="button" className="dw-material-trigger" onClick={() => setMaterialPickerOpen(v => !v)}>
                    <div className="dw-material-trigger-copy">
                      <small>เลือกจากรายการวัสดุในระบบ</small>
                      <strong>{tripForm.material || 'เลือกวัสดุที่ขน'}</strong>
                    </div>
                    <span className="dw-material-trigger-meta">{materials.length} รายการ</span>
                  </button>
                  {materialPickerOpen && <div className="dw-material-dropdown">
                    <div className="dw-material-searchbox"><Search size={16} /><input value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} placeholder="ค้นหาวัสดุ เช่น ทราย หิน ดิน" /></div>
                    <div className="dw-material-options" role="listbox">
                      {(materials.filter(row => !materialSearch || (row.name || '').toLocaleLowerCase('th').includes(materialSearch.toLocaleLowerCase('th')))).length ? materials.filter(row => !materialSearch || (row.name || '').toLocaleLowerCase('th').includes(materialSearch.toLocaleLowerCase('th'))).map(row => <button type="button" key={row.id} className={tripForm.material === row.name ? 'is-selected' : ''} onClick={() => {
                        setTripForm(v => ({ ...v, material: row.name }));
                        setMaterialPickerOpen(false);
                        setMaterialSearch('');
                      }}><span><strong>{row.name}</strong><small>แตะเพื่อเลือกใช้งานทันที</small></span>{tripForm.material === row.name && <CheckCircle2 size={18} />}</button>) : <div className="dw-material-empty">ไม่พบวัสดุที่ค้นหา</div>}
                    </div>
                    <div className="dw-material-dropdown-footer"><button type="button" className="dw-material-manage" onClick={() => { setMaterialPickerOpen(false); setMaterialSearch(''); setMaterialOpen(true); }}><Plus size={15} /> จัดการวัสดุ</button></div>
                  </div>}
                </div>
              </label>
              <label><span>น้ำหนัก / จำนวน</span><input value={tripForm.quantity} onChange={e => setTripForm(v => ({ ...v, quantity: e.target.value }))} placeholder="เช่น 30 ตัน" /></label>
              <label><span>เลขที่ใบงาน</span><input value={tripForm.reference} onChange={e => setTripForm(v => ({ ...v, reference: e.target.value }))} placeholder="ถ้ามี" /></label>
              <label><span>ต้นทาง</span><input value={tripForm.origin_place} onChange={e => setTripForm(v => ({ ...v, origin_place: e.target.value }))} placeholder="ต้นทาง" /></label>
              <label><span>ปลายทาง</span><input value={tripForm.destination_place} onChange={e => setTripForm(v => ({ ...v, destination_place: e.target.value }))} placeholder="ปลายทาง" /></label>
              <label className="dw-wide"><span>หมายเหตุ</span><textarea rows="2" value={tripForm.note} onChange={e => setTripForm(v => ({ ...v, note: e.target.value }))} placeholder="ข้อมูลเพิ่มเติม" /></label>
              <div className="dw-form-actions dw-wide">
                <button className="dw-save" type="submit" disabled={saving}><Save size={18} />{saving ? 'กำลังบันทึก...' : editingTripId ? 'บันทึกการแก้ไข' : 'บันทึกรายได้คนขับ'}</button>
                {(editingTripId || selectedPending) && <button type="button" className="dw-outline-btn" onClick={() => { setTripForm(null); setSelectedPending(null); setEditingTripId(''); setMaterialPickerOpen(false); setMaterialSearch(''); }}>ยกเลิก</button>}
              </div>
            </form>
          </>}
        </section>

        <section className="dw-panel">
          <header>
            <div>
              <span className="dw-step-tag">ขั้นตอน 2B</span>
              <h2>เบิกเงินล่วงหน้า</h2>
              <p>กรอกเฉพาะยอดเบิกของคนขับ เพื่อหักออกจากยอดคงรับตอนสรุปสิ้นเดือน</p>
            </div>
          </header>
          <form className="dw-form" onSubmit={saveAdvance}>
            <label><span>วันที่ *</span><input type="date" required value={advanceForm.date} onChange={e => setAdvanceForm(v => ({ ...v, date: e.target.value }))} /></label>
            <label><span>ทะเบียนรถ * (รถที่เบิก)</span><select required value={advanceForm.vehicle_id} onChange={e => vehicleChanged(e.target.value)}><option value="">เลือกทะเบียน</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></label>
            <label><span>ชื่อคนขับ * (ผู้รับเงิน)</span><input required list="driver-names" value={advanceForm.driver_name} onChange={e => setAdvanceForm(v => ({ ...v, driver_name: e.target.value }))} placeholder="เลือกหรือกรอกชื่อคนขับ" /></label>
            <label><span>ยอดเบิก *</span><div className="dw-money"><input type="number" min="0" step="0.01" required value={advanceForm.amount_baht} onChange={e => setAdvanceForm(v => ({ ...v, amount_baht: e.target.value }))} placeholder="0.00" /><b>บาท</b></div></label>
            <label className="dw-wide"><span>หมายเหตุ</span><input value={advanceForm.note} onChange={e => setAdvanceForm(v => ({ ...v, note: e.target.value }))} placeholder="เช่น เบิกค่าน้ำมัน / ค่าใช้จ่ายส่วนตัว" /></label>
            <div className="dw-form-actions dw-wide">
              <button className="dw-save" disabled={saving}><Wallet size={18} />{editingAdvanceId ? 'บันทึกการแก้ไข' : 'บันทึกยอดเบิก'}</button>
              {editingAdvanceId && <button type="button" className="dw-outline-btn" onClick={() => { setEditingAdvanceId(''); setAdvanceForm(emptyAdvance()); }}>ยกเลิก</button>}
            </div>
          </form>
          <div className="dw-sublist">
            <div className="dw-sublist-head"><strong>รายการเบิกล่าสุด</strong><small>{advances.length} รายการในช่วงนี้</small></div>
            {!recentAdvances.length ? <Empty>ยังไม่มียอดเบิกในช่วงเวลานี้</Empty> : <div className="dw-advance-list">{recentAdvances.map(row => <div key={row.id}><span><b>{row.driver_name}</b><small>{row.date} · {row.plate_no}</small></span><strong>{cash(row.amount_satang)} ฿</strong><button type="button" onClick={() => { setEditingAdvanceId(row.id); setAdvanceForm({ date: row.date, vehicle_id: row.vehicle_id, driver_name: row.driver_name, amount_baht: toBaht(row.amount_satang), note: row.note || '' }); }}><Pencil size={14} /></button><button type="button" onClick={() => removeAdvance(row)}><Trash2 size={14} /></button></div>)}</div>}
          </div>
        </section>
      </section>

      <section className="dw-panel">
        <header>
          <div>
            <h2>รายการรายได้คนขับที่บันทึกแล้ว</h2>
            <p>ตรวจสอบย้อนหลัง แก้ไข หรือเปิดดูรายละเอียดได้ทันที</p>
          </div>
          <div className="dw-pill-info"><Banknote size={16} /> {filteredTrips.length} รายการ</div>
        </header>
        {!visible.length ? <Empty>ยังไม่มีรายการรายได้ในช่วงเวลานี้</Empty> : <div className="dw-card-list">{visible.map(row => <article className="dw-row" key={row.id}>
          <div>
            <small>{row.date} · {row.plate_no}</small>
            <strong>{row.driver_name}</strong>
            <span>{row.material} · {row.quantity || '-'}</span>
            <small>{row.origin_place || '-'} → {row.destination_place || '-'}</small>
          </div>
          <div className="dw-row-money">
            <strong>{cash(row.income_satang)} ฿</strong>
            <div>
              <button type="button" onClick={() => setDetail({ type: 'trip', row })}>ดู</button>
              <button type="button" onClick={() => editTrip(row)}><Pencil size={15} /></button>
              <button type="button" onClick={() => removeTrip(row)}><Trash2 size={15} /></button>
            </div>
          </div>
        </article>)}</div>}
        <Pager page={page} pages={pages} setPage={setPage} />
      </section>

      <section className="dw-material-bar">
        <div><PackagePlus size={20} /><span><strong>วัสดุที่ใช้ในระบบ</strong><small>{materials.length} รายการ พร้อมใช้ในหน้าบันทึกรายได้</small></span></div>
        <button type="button" onClick={() => setMaterialOpen(true)}><Plus size={16} /> จัดการวัสดุ</button>
      </section>
    </>}

    {step === 3 && <section className="dw-panel dw-print-summary">
      <header>
        <div>
          <span className="dw-step-tag">ขั้นตอน 3</span>
          <h2>สรุปยอดบัญชีคนขับ</h2>
          <p>แสดงยอดแยกตามคนขับแต่ละทะเบียนเป็นค่าเริ่มต้น เปลี่ยนมุมมองได้โดยไม่แก้ไขข้อมูลจริง</p>
        </div>
      </header>

      <div className="dw-view-toggle">
        <button type="button" className={summaryView === 'person' ? 'is-active' : ''} onClick={() => setSummaryView('person')}>แยกเป็นบุคคล</button>
        <button type="button" className={summaryView === 'vehicle' ? 'is-active' : ''} onClick={() => setSummaryView('vehicle')}>แยกตามทะเบียน</button>
        <button type="button" className={summaryView === 'pair' ? 'is-active' : ''} onClick={() => setSummaryView('pair')}>แยกคนขับแต่ละทะเบียน</button>
      </div>

      <div className="dw-callout">
        <b>มุมมองปัจจุบัน:</b>
        <span>{summaryView === 'person' ? 'รวมตามชื่อคนขับ พร้อมแสดงทะเบียนที่ดูแล' : summaryView === 'vehicle' ? 'รวมตามทะเบียนรถ พร้อมแสดงรายชื่อคนขับที่เกี่ยวข้อง' : 'คนเดียวกันต่างทะเบียนจะแสดงคนละแถว ไม่สลับยอดระหว่างทะเบียน'}</span>
      </div>

      {renderSummaryTable()}
      <Pager page={page} pages={pages} setPage={setPage} />
    </section>}

    {materialOpen && <div className="dw-modal-bg" onClick={() => setMaterialOpen(false)}>
      <section className="dw-modal" onClick={e => e.stopPropagation()}>
        <header>
          <div><h2>จัดการวัสดุ</h2><p>เพิ่มหรือแก้ไขวัสดุที่ใช้ในหน้าบัญชีคนขับ</p></div>
          <button type="button" onClick={() => setMaterialOpen(false)}><X size={18} /></button>
        </header>
        <form onSubmit={saveMaterial} className="dw-material-form">
          <input required maxLength="120" value={materialName} onChange={e => setMaterialName(e.target.value)} placeholder="ชื่อวัสดุ เช่น ทราย หิน ดิน" />
          <button disabled={saving}><Save size={16} />{editingMaterial ? 'บันทึก' : 'เพิ่มวัสดุ'}</button>
        </form>
        <div className="dw-material-list">{materials.map(row => <div key={row.id}><strong>{row.name}</strong><span><button type="button" onClick={() => { setEditingMaterial(row); setMaterialName(row.name); }}><Pencil size={15} /></button><button type="button" onClick={() => removeMaterial(row)}><Trash2 size={15} /></button></span></div>)}</div>
      </section>
    </div>}

    {detail && <div className="dw-modal-bg" onClick={() => setDetail(null)}>
      <section className="dw-modal" onClick={e => e.stopPropagation()}>
        <header>
          <div><h2>{detail.type === 'summary' ? 'รายละเอียดสรุป' : 'รายละเอียดเที่ยวงาน'}</h2></div>
          <button type="button" onClick={() => setDetail(null)}><X size={18} /></button>
        </header>
        {detail.type === 'summary' ? <div className="dw-detail">
          {detail.summaryView === 'person' && <>
            <p><span>คนขับ</span><b>{detail.row.driver_name}</b></p>
            <p><span>ทะเบียนที่ดูแล</span><b>{detail.row.plate_no || '-'}</b></p>
          </>}
          {detail.summaryView === 'vehicle' && <>
            <p><span>ทะเบียน</span><b>{detail.row.plate_no}</b></p>
            <p><span>คนขับ</span><b>{detail.row.driver_name || '-'}</b></p>
          </>}
          {detail.summaryView === 'pair' && <>
            <p><span>คนขับ</span><b>{detail.row.driver_name}</b></p>
            <p><span>ทะเบียน</span><b>{detail.row.plate_no}</b></p>
          </>}
          <p><span>จำนวนเที่ยว</span><b>{detail.row.trips || 0}</b></p>
          <p><span>รายได้รวม</span><b>{cash(detail.row.income_satang)} บาท</b></p>
          <p><span>เบิกแล้ว</span><b>{cash(detail.row.advance_satang)} บาท</b></p>
          <p className="is-total"><span>ยอดคงรับ</span><b>{cash(detail.row.balance_satang)} บาท</b></p>
          <h3>เที่ยวงาน ({detail.matchingTrips.length})</h3>
          {detail.matchingTrips.map(item => <p key={item.id}><span>{item.date} · {item.plate_no} · {item.material || 'เที่ยวงาน'}</span><b>+{cash(item.income_satang)} บาท</b></p>)}
          <h3>เบิกล่วงหน้า ({detail.matchingAdvances.length})</h3>
          {detail.matchingAdvances.map(item => <p key={item.id}><span>{item.date} · {item.plate_no} · {item.note || 'เบิกเงิน'}</span><b>-{cash(item.amount_satang)} บาท</b></p>)}
        </div> : <div className="dw-detail">
          <p><span>วันที่</span><b>{detail.row.date}</b></p>
          <p><span>ทะเบียน</span><b>{detail.row.plate_no}</b></p>
          <p><span>คนขับ</span><b>{detail.row.driver_name}</b></p>
          <p><span>วัสดุ</span><b>{detail.row.material}</b></p>
          <p><span>เส้นทาง</span><b>{detail.row.origin_place || '-'} → {detail.row.destination_place || '-'}</b></p>
          <p><span>น้ำหนัก</span><b>{detail.row.quantity || '-'}</b></p>
          <p><span>ใบงาน</span><b>{detail.row.reference || '-'}</b></p>
          <p className="is-total"><span>รายได้เที่ยวนี้</span><b>{cash(detail.row.income_satang)} บาท</b></p>
        </div>}
      </section>
    </div>}

    {activeVehicle && step === 2 && <div className="dw-floating-hint">กำลังทำงานกับทะเบียน <b>{activeVehicle.plate_no}</b>{activeVehicle.driver_name ? ` · คนขับ ${activeVehicle.driver_name}` : ''}</div>}
  </div>;
}
