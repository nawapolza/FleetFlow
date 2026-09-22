import { Edit, ShieldCheck, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import BranchScopeBar from '../components/BranchScopeBar.jsx';
import { useBranch } from '../contexts/BranchContext.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, confirmDanger, toastSuccess } from '../utils/alerts.js';

const blankForm = (branchId = '') => ({ name: '', username: '', password: '', phone: '', role: 'employee', is_active: 1, branch_id: branchId });

export default function UsersPage() {
  const { activeBranch, activeBranchId, activeBranches } = useBranch();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(() => blankForm(activeBranchId));
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.users();
      setUsers(res.data || []);
    } catch (err) {
      alertError(err, 'โหลดผู้ใช้งานไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtime((payload) => { if (payload?.kind === 'users') load(true); }, true);
  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    try {
      if (editing) await api.updateUser(editing.id, form);
      else await api.createUser(form);
      toastSuccess(editing ? 'แก้ไขผู้ใช้แล้ว' : 'สร้างผู้ใช้แล้ว');
      setForm(blankForm(activeBranchId)); setEditing(null); load(true);
    } catch (err) { alertError(err, 'บันทึกผู้ใช้ไม่ได้'); }
  }

  function startEdit(user) {
    setEditing(user);
    setForm({ name: user.name || '', username: user.username || '', password: '', phone: user.phone || '', role: user.role || 'employee', is_active: Number(user.is_active ?? 1), branch_id: user.branch_id || activeBranchId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(user) {
    const ok = await confirmDanger(`ปิดใช้งาน ${user.name || user.username}?`, 'ผู้ใช้นี้จะเข้าสู่ระบบไม่ได้');
    if (!ok) return;
    try { await api.deleteUser(user.id); toastSuccess('ปิดใช้งานผู้ใช้แล้ว'); load(true); } catch (err) { alertError(err, 'ลบผู้ใช้ไม่ได้'); }
  }

  async function restore(user) {
    try {
      await api.updateUser(user.id, { ...user, password: '', is_active: 1, branch_id: user.branch_id || activeBranchId });
      toastSuccess('เปิดใช้งานผู้ใช้แล้ว');
      load(true);
    } catch (err) { alertError(err, 'เปิดใช้งานผู้ใช้ไม่ได้'); }
  }

  if (loading) return <Loading />;

  return (
    <div className="page-shell">
      <div className="page-orbit">
        <span className="page-orbit-code">09 / USER ACCESS</span>
        <div>
          <h1 className="page-title">จัดการพนักงาน</h1>
          <p className="page-subtitle">สร้างบัญชี กำหนดบทบาท และควบคุมสิทธิ์ของทีมอย่างเป็นระบบ</p>
        </div>
        <span className="page-orbit-signal">2 ROLES</span>
      </div>
      <BranchScopeBar label="ทีมงานของสาขา" detail="บัญชีใหม่จะผูกกับสาขาที่เลือก และสามารถย้ายพนักงานไปสาขาอื่นได้โดยไม่ลบประวัติ" />
      <section className="role-permission-grid" aria-label="สรุปสิทธิ์ผู้ใช้งาน">
        <div className="role-permission-card is-owner">
          <div><ShieldCheck size={20} /><strong>เจ้าของกิจการ</strong></div>
          <p>ดู Dashboard ทั้งหมด จัดการสต๊อกและตรวจนับ ดูรายงานบัญชีรายเดือน จัดการรถ ผู้ใช้ และการแจ้งเตือน</p>
        </div>
        <div className="role-permission-card is-employee">
          <div><ShieldCheck size={20} /><strong>พนักงาน</strong></div>
          <p>คำนวณน้ำมัน บันทึกการเติม ดูประวัติของตนเอง และดูสถานะสต๊อกแบบอ่านอย่างเดียว โดยแก้ไขสต๊อกหรือรายงานบัญชีไม่ได้</p>
        </div>
      </section>

      <form onSubmit={submit} className="card p-4 md:p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><UserPlus size={20} /> {editing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="ชื่อ-สกุล" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field required label="ชื่อผู้ใช้สำหรับเข้าสู่ระบบ" autoComplete="username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
          <Field required={!editing} type="password" autoComplete="new-password" label={editing ? 'รหัสผ่านใหม่ (ไม่เปลี่ยนให้เว้นว่าง)' : 'รหัสผ่าน'} value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <Field label="เบอร์โทร" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <label className="block"><span className="label">ระดับสิทธิ์การใช้งาน</span><select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="employee">พนักงาน</option><option value="owner">เจ้าของกิจการ</option></select></label>
          {editing ? <label className="block"><span className="label">สาขาสังกัด</span><select className="input mt-1" value={form.branch_id || activeBranchId} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select><p className="hint mt-1">ย้ายสาขาได้โดยไม่ลบประวัติรายการเดิม รถที่เคยผูกจะเปลี่ยนเป็นรถใช้ทั่วไปของสาขาเดิม</p></label> : <label className="block"><span className="label">สาขาสังกัด</span><input className="input mt-1" value={`${activeBranch?.name || '-'} (${activeBranch?.code || '-'})`} readOnly /></label>}
          {editing && <label className="block"><span className="label">สถานะบัญชี</span><select className="input mt-1" value={form.is_active} onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })}><option value={1}>ใช้งาน</option><option value={0}>ปิดใช้งาน</option></select></label>}
          <div className="flex gap-2 md:items-end">
            <button className="btn-primary flex-1">{editing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน'}</button>
            {editing && <button type="button" className="btn-soft" onClick={() => { setEditing(null); setForm(blankForm(activeBranchId)); }}>ยกเลิก</button>}
          </div>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => (
          <div key={user.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-slate-950">{user.name || user.username}</h3>
                <p className="truncate text-sm font-bold text-slate-400">@{user.username}</p>
              </div>
              <span className={user.role === 'owner' ? 'badge-blue' : 'badge-green'}><ShieldCheck size={13} /> {user.role === 'owner' ? 'เจ้าของกิจการ' : 'พนักงาน'}</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm font-bold text-slate-500">
              <p>โทร: {user.phone || '-'}</p>
              <p>สถานะ: {String(user.is_active) === '0' ? 'ปิดใช้งาน' : 'ใช้งาน'}</p>
            </div>
            <div className="mt-4 flex gap-2"><button className="btn-soft flex-1" onClick={() => startEdit(user)}><Edit size={16} /> แก้ไข</button>{String(user.is_active) === '0' ? <button className="btn-primary flex-1" onClick={() => restore(user)}><UserCheck size={16} /> เปิดใช้งาน</button> : <button className="btn-danger flex-1" onClick={() => remove(user)}><Trash2 size={16} /> ปิด</button>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, autoComplete = undefined }) {
  return <label className="block"><span className="label">{label}</span><input required={required} type={type} autoComplete={autoComplete} className="input mt-1" value={value || ''} onChange={(e) => onChange(e.target.value)} /></label>;
}
