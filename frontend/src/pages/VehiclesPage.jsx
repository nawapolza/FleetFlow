import { Car, Edit, Gauge, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import BranchScopeBar from '../components/BranchScopeBar.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, confirmDanger, toastSuccess } from '../utils/alerts.js';

const blank = { plate_no: '', vehicle_no: '', driver_name: '', fuel_efficiency_km_per_liter: '', user_id: '', description: '' };
const RATE_PRESETS = ['2.90', '3.00', '3.20'];

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [vehicleRes, userRes] = await Promise.all([api.vehicles(), api.users()]);
      setVehicles(vehicleRes.data || []);
      setUsers((userRes.data || []).filter((u) => String(u.is_active) !== '0'));
    } catch (err) {
      alertError(err, 'โหลดข้อมูลรถ/คนขับไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtime((payload) => { if (['vehicles', 'users'].includes(payload?.kind)) load(true); }, true);
  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    const rate = Number(String(form.fuel_efficiency_km_per_liter || '').replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0) {
      return alertError('กรุณาตั้งอัตราประจำรถก่อนบันทึก เช่น รถหนัก 2.90 กม./ลิตร หรือรถคันอื่น 3.20 กม./ลิตร');
    }
    try {
      const payload = { ...form, fuel_efficiency_km_per_liter: rate.toFixed(2) };
      if (editing) await api.updateVehicle(editing.id, payload);
      else await api.createVehicle(payload);
      toastSuccess(editing ? 'แก้ไขรถ/คนขับแล้ว' : 'เพิ่มรถ/คนขับแล้ว');
      setForm(blank);
      setEditing(null);
      load(true);
    } catch (err) {
      alertError(err, 'บันทึกรถ/คนขับไม่ได้');
    }
  }

  function startEdit(vehicle) {
    setEditing(vehicle);
    setForm({
      plate_no: vehicle.plate_no || '',
      vehicle_no: vehicle.vehicle_no || '',
      driver_name: vehicle.driver_name || '',
      fuel_efficiency_km_per_liter: vehicle.fuel_efficiency_km_per_liter || '',
      user_id: vehicle.user_id || '',
      description: vehicle.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(vehicle) {
    const ok = await confirmDanger(`ลบรถ ${vehicle.plate_no}?`, 'ข้อมูลจะถูกปิดใช้งาน ไม่แสดงในตัวเลือก');
    if (!ok) return;
    try {
      await api.deleteVehicle(vehicle.id);
      toastSuccess('ลบรถ/คนขับแล้ว');
      load(true);
    } catch (err) {
      alertError(err, 'ลบรถไม่ได้');
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="page-shell">
      <div className="page-orbit">
        <span className="page-orbit-code">08 / VEHICLE & DRIVER</span>
        <div>
          <h1 className="page-title">รถ / คนขับรถ</h1>
          <p className="page-subtitle">ตั้งอัตราประจำรถเพียงครั้งเดียว ระบบจะนำไปคำนวณจำนวนลิตรจากระยะทางให้อัตโนมัติในทุกเที่ยว</p>
        </div>
        <span className="page-orbit-signal">AUTO RATE</span>
      </div>

      <BranchScopeBar label="ทะเบียนรถของสาขา" detail="รถ คนขับ และอัตราสิ้นเปลืองจะไม่ปะปนกับสาขาอื่น" />

      <form onSubmit={submit} className="card p-4 md:p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Car size={20} /> {editing ? 'แก้ไขรถ / คนขับ' : 'เพิ่มรถ / คนขับ'}</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <Field required label="ทะเบียนรถ" hint="เช่น 86-1234" value={form.plate_no} onChange={(v) => setForm({ ...form, plate_no: v })} />
          <Field label="เบอร์รถ" hint="เลขประจำรถ ถ้ามี" value={form.vehicle_no} onChange={(v) => setForm({ ...form, vehicle_no: v })} />
          <Field label="คนขับหลัก" hint="ชื่อคนขับประจำรถ" value={form.driver_name} onChange={(v) => setForm({ ...form, driver_name: v })} />
          <RateField
            required
            label="อัตราประจำรถ"
            hint="ตั้งครั้งเดียวต่อรถแต่ละคัน ระบบจะคำนวณ ระยะทาง ÷ กม./ลิตร = จำนวนลิตร"
            value={form.fuel_efficiency_km_per_liter}
            onChange={(v) => setForm({ ...form, fuel_efficiency_km_per_liter: v })}
          />
          <label className="block">
            <span className="label">ผูกกับพนักงาน</span>
            <select className="input mt-1" value={form.user_id || ''} onChange={(e) => {
              const userId = e.target.value;
              const linkedUser = users.find((user) => String(user.id) === String(userId));
              setForm((old) => ({ ...old, user_id: userId, driver_name: old.driver_name || linkedUser?.name || '' }));
            }}>
              <option value="">ไม่ระบุ / ใช้ทั่วไป</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.username} ({u.role})</option>)}
            </select>
            <p className="hint mt-1">รถที่ไม่ผูกพนักงานจะเป็นรถใช้ทั่วไป และพนักงานในสาขาเลือกได้ตอนบันทึก</p>
          </label>
          <div className="vehicle-form-link md:col-span-5">
            <LinkStatus active={Boolean(form.plate_no && form.fuel_efficiency_km_per_liter)} />
            <p>ทะเบียนรถ คนขับ พนักงาน และอัตราประจำรถจะถูกส่งไปยังหน้าบันทึกงานเป็นชุดเดียว</p>
          </div>
          <label className="block md:col-span-4">
            <span className="label">รายละเอียด</span>
            <textarea className="input mt-1 min-h-[90px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="รายละเอียดเพิ่มเติม เช่น ประเภทรถ หรือหมายเหตุ" />
          </label>
          <div className="flex gap-2 md:col-span-4">
            <button className="btn-primary flex-1 md:flex-none">{editing ? 'บันทึกการแก้ไข' : 'เพิ่มรถ/คนขับ'}</button>
            {editing && <button type="button" className="btn-soft" onClick={() => { setEditing(null); setForm(blank); }}>ยกเลิก</button>}
          </div>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((vehicle) => (
          <div key={vehicle.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-black text-slate-950">{vehicle.plate_no}</h3>
                <p className="mt-1 text-sm font-bold text-slate-400">เบอร์รถ: {vehicle.vehicle_no || '-'}</p>
              </div>
              <div className="rounded-3xl bg-blue-50 p-3 text-blue-700"><Car size={22} /></div>
            </div>
            <div className="mt-4 grid gap-2 text-sm font-bold text-slate-500">
              <p className="flex items-center gap-2"><UserRound size={15} /> คนขับ: {vehicle.driver_name || '-'}</p>
              <p className="flex items-center gap-2"><Gauge size={15} /> อัตราประจำรถ: {Number(vehicle.fuel_efficiency_km_per_liter || 0) > 0 ? `${Number(vehicle.fuel_efficiency_km_per_liter).toFixed(2)} กม./ลิตร` : 'ยังไม่ตั้งค่า'}</p>
              <p className="flex items-center gap-2"><ShieldCheck size={15} /> พนักงานที่ผูก: {vehicle.employee_name || '-'}</p>
              <p className="line-clamp-2 rounded-2xl bg-slate-50 p-3">รายละเอียด: {vehicle.description || '-'}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn-soft flex-1" onClick={() => startEdit(vehicle)}><Edit size={16} /> แก้ไข</button>
              <button className="btn-danger flex-1" onClick={() => remove(vehicle)}><Trash2 size={16} /> ลบ</button>
            </div>
          </div>
        ))}
        {!vehicles.length && <div className="card p-8 text-center text-sm font-bold text-slate-400">ยังไม่มีรถ / คนขับ</div>}
      </div>
    </div>
  );
}


function RateField({ label, value, onChange, required = false, hint = '' }) {
  return (
    <label className="block vehicle-rate-setting">
      <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="relative mt-1">
        <input
          required={required}
          type="text"
          inputMode="decimal"
          pattern="[0-9๐-๙.,]*"
          className="input pr-24"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="เช่น 2.90"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">กม./ลิตร</span>
      </div>
      <div className="vehicle-rate-presets" aria-label="เลือกอัตราประจำรถแบบด่วน">
        {RATE_PRESETS.map((rate) => (
          <button
            key={rate}
            type="button"
            className={String(value) === rate ? 'is-active' : ''}
            onClick={() => onChange(rate)}
          >
            {rate}
          </button>
        ))}
      </div>
      {hint && <p className="hint mt-1">{hint}</p>}
    </label>
  );
}

function LinkStatus({ active }) {
  return <span className={active ? 'is-ready' : ''}>{active ? 'เชื่อมพร้อมใช้งาน' : 'รอกรอกข้อมูลหลัก'}</span>;
}

function Field({ label, value, onChange, required = false, hint = '', type = 'text', step = undefined }) {
  return (
    <label className="block">
      <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <input required={required} type={type} step={step} min={type === 'number' ? '0' : undefined} className="input mt-1" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="hint mt-1">{hint}</p>}
    </label>
  );
}
