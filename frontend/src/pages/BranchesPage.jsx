import { Building2, CheckCircle2, Edit3, MapPin, Phone, Plus, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError, confirmDanger, toastSuccess } from '../utils/alerts.js';

const blank = { name: '', code: '', address: '', phone: '', note: '', is_active: 1 };

export default function BranchesPage() {
  const { branches, activeBranchId, selectBranch, refreshBranches } = useBranch();
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);

  const activeCount = useMemo(() => branches.filter((row) => Number(row.is_active ?? 1) !== 0).length, [branches]);

  function startCreate() {
    setEditingId('');
    setForm(blank);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      code: row.code || '',
      address: row.address || '',
      phone: row.phone || '',
      note: row.note || '',
      is_active: Number(row.is_active ?? 1),
    });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editingId ? await api.updateBranch(editingId, form) : await api.createBranch(form);
      toastSuccess(editingId ? 'แก้ไขข้อมูลสาขาแล้ว' : 'เพิ่มสาขาและสร้างสต๊อกเริ่มต้นแล้ว');
      await refreshBranches();
      if (!editingId && res.data?.id) selectBranch(res.data.id);
      startCreate();
    } catch (err) {
      alertError(err, editingId ? 'แก้ไขสาขาไม่ได้' : 'เพิ่มสาขาไม่ได้');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    const ok = await confirmDanger(`ลบสาขา ${row.name}?`, 'ระบบจะปิดใช้งานสาขา แต่เก็บรายการย้อนหลังและประวัติสต๊อกไว้ครบถ้วน');
    if (!ok) return;
    try {
      await api.deleteBranch(row.id);
      toastSuccess('ปิดใช้งานสาขาแล้ว');
      await refreshBranches();
    } catch (err) {
      alertError(err, 'ลบสาขาไม่ได้');
    }
  }

  async function restore(row) {
    try {
      await api.updateBranch(row.id, { ...row, is_active: 1 });
      toastSuccess('เปิดใช้งานสาขาอีกครั้งแล้ว');
      await refreshBranches();
    } catch (err) {
      alertError(err, 'เปิดใช้งานสาขาไม่ได้');
    }
  }

  return (
    <div className="page-shell branch-management-page">
      <div className="page-orbit">
        <span className="page-orbit-code">02 / BRANCH MANAGEMENT</span>
        <div>
          <h1 className="page-title">จัดการสาขา</h1>
          <p className="page-subtitle">เพิ่ม แก้ไข ปิดใช้งาน และสลับสาขา โดยข้อมูลสต๊อก รายงาน รถ พนักงาน และรายการน้ำมันจะแยกจากกันชัดเจน</p>
        </div>
        <span className="page-orbit-signal">{activeCount} ACTIVE</span>
      </div>

      <section className="branch-overview-strip card-clean">
        <div><Building2 size={22} /><span><small>สาขาที่ใช้งาน</small><strong>{activeCount} สาขา</strong></span></div>
        <div><CheckCircle2 size={22} /><span><small>สาขาที่กำลังดู</small><strong>{branches.find((row) => row.id === activeBranchId)?.name || '-'}</strong></span></div>
      </section>

      <div className="branch-layout-grid">
        <form onSubmit={submit} className="card branch-editor-card">
          <div className="branch-editor-head">
            <div><span><Building2 size={21} /></span><div><h2>{editingId ? 'แก้ไขข้อมูลสาขา' : 'เพิ่มสาขาใหม่'}</h2><p>เมื่อเพิ่มสาขา ระบบจะสร้างสต๊อกดีเซล น้ำมันเครื่อง และแอดบลูให้อัตโนมัติ</p></div></div>
            {editingId && <button type="button" onClick={startCreate} className="icon-button" aria-label="ยกเลิกแก้ไข"><X size={18} /></button>}
          </div>
          <div className="branch-form-grid">
            <Field required label="ชื่อสาขา" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="เช่น สาขาบ้านดุง" />
            <Field required label="รหัสสาขา" value={form.code} onChange={(value) => setForm({ ...form, code: value.toUpperCase() })} placeholder="เช่น BD01" />
            <Field label="เบอร์โทร" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="เบอร์ติดต่อสาขา" />
            <label className="branch-field branch-field-wide"><span>ที่อยู่</span><textarea className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="ที่อยู่สำหรับเอกสารและการติดต่อ" /></label>
            <label className="branch-field branch-field-wide"><span>หมายเหตุ</span><textarea className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="รายละเอียดเพิ่มเติมของสาขา" /></label>
          </div>
          <button disabled={saving} className="btn-primary w-full">{editingId ? <Save size={18} /> : <Plus size={18} />} {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มสาขาและสร้างสต๊อก'}</button>
        </form>

        <section className="branch-card-list">
          {branches.map((row) => {
            const active = Number(row.is_active ?? 1) !== 0;
            const selected = row.id === activeBranchId;
            return (
              <article key={row.id} className={`card-clean branch-card ${selected ? 'is-selected' : ''} ${active ? '' : 'is-disabled'}`}>
                <div className="branch-card-top">
                  <span className="branch-card-icon"><Building2 size={22} /></span>
                  <div className="branch-card-title"><div><h3>{row.name}</h3><span>{row.code}</span></div><p>{row.is_default ? 'สาขาหลักของระบบ' : active ? 'พร้อมใช้งาน' : 'ปิดใช้งาน'}</p></div>
                </div>
                <div className="branch-card-info">
                  <p><MapPin size={15} /> {row.address || 'ยังไม่ได้ระบุที่อยู่'}</p>
                  <p><Phone size={15} /> {row.phone || 'ยังไม่ได้ระบุเบอร์โทร'}</p>
                </div>
                <div className="branch-card-actions">
                  {active && <button type="button" className={selected ? 'btn-dark' : 'btn-soft'} onClick={() => selectBranch(row.id)}>{selected ? <CheckCircle2 size={16} /> : <Building2 size={16} />} {selected ? 'กำลังใช้งาน' : 'เปิดสาขานี้'}</button>}
                  <button type="button" className="btn-soft" onClick={() => startEdit(row)}><Edit3 size={16} /> แก้ไข</button>
                  {active && <button type="button" className="btn-danger-soft" onClick={() => remove(row)}><Trash2 size={16} /> ลบ</button>}
                  {!active && <button type="button" className="btn-soft" onClick={() => restore(row)}><CheckCircle2 size={16} /> เปิดใช้งานอีกครั้ง</button>}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required = false }) {
  return <label className="branch-field"><span>{label}</span><input required={required} className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}
