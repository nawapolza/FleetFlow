import { Edit, ShieldCheck, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import CompactPager, { useCompactList } from '../components/CompactPager.jsx';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import BranchScopeBar from '../components/BranchScopeBar.jsx';
import { useBranch } from '../contexts/BranchContext.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, confirmDanger, toastSuccess } from '../utils/alerts.js';

const blankForm = () => ({ name: '', username: '', password: '', phone: '', role: 'employee', is_active: 1, branch_id: '' });

export default function UsersPage() {
  const { activeBranchId } = useBranch();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(() => blankForm(activeBranchId));
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const pager = useCompactList(users, user => [user.name, user.username, user.phone, user.role]);

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
      else { const { branch_id, ...fields } = form; await api.createUser(fields); }
      toastSuccess(editing ? 'แก้ไขผู้ใช้แล้ว' : 'สร้างผู้ใช้แล้ว');
      setForm(blankForm()); setEditing(null); setEditorOpen(false); load(true);
    } catch (err) { alertError(err, 'บันทึกผู้ใช้ไม่ได้'); }
  }

  function startEdit(user) {
    setEditing(user); setEditorOpen(true);
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
          <p className="page-subtitle">เพิ่ม แก้ไข ปิดใช้งานบัญชี และกำหนดสิทธิ์แอดมินหรือพนักงาน</p>
        </div>
        <span className="page-orbit-signal">2 ROLES</span>
      </div>

      <button type="button" className="btn-primary kw-add-btn" onClick={() => {setEditing(null);setForm(blankForm());setEditorOpen(v=>!v);}}>{editorOpen ? 'ปิดฟอร์ม' : '+ เพิ่มพนักงาน'}</button>
      <CompactPager state={pager} label="ค้นหาชื่อ ชื่อผู้ใช้ หรือเบอร์โทร"/>
      <form onSubmit={submit} className={`card p-4 md:p-5 ${editorOpen ? "" : "kw-editor-hidden"}`}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><UserPlus size={20} /> {editing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="ชื่อ-สกุล" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field required label="ชื่อผู้ใช้สำหรับเข้าสู่ระบบ" autoComplete="username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
          <Field required={!editing} type="password" autoComplete="new-password" label={editing ? 'รหัสผ่านใหม่ (ไม่เปลี่ยนให้เว้นว่าง)' : 'รหัสผ่าน'} value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <Field label="เบอร์โทร" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <label className="block"><span className="label">ระดับสิทธิ์การใช้งาน</span><select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="employee">พนักงาน</option><option value="owner">เจ้าของกิจการ</option></select></label>

          {editing && <label className="block"><span className="label">สถานะบัญชี</span><select className="input mt-1" value={form.is_active} onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })}><option value={1}>ใช้งาน</option><option value={0}>ปิดใช้งาน</option></select></label>}
          <div className="flex gap-2 md:items-end">
            <button className="btn-primary flex-1">{editing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน'}</button>
            {editing && <button type="button" className="btn-soft" onClick={() => { setEditing(null); setForm(blankForm()); }}>ยกเลิก</button>}
          </div>
        </div>
      </form>

      <div className="kw-list-card"><div className="kw-list-scroll"><table className="kw-list-table"><thead><tr><th>ชื่อ / ชื่อผู้ใช้</th><th>เบอร์โทร</th><th>สิทธิ์ / สถานะ</th><th>จัดการ</th></tr></thead><tbody>
        {pager.visible.map(user => <tr key={user.id}><td><strong>{user.name || user.username}</strong><small>@{user.username}</small></td><td>{user.phone || '-'}</td><td>{user.role === 'owner' ? 'แอดมิน' : 'พนักงาน'}<small>{String(user.is_active) === '0' ? 'ปิดใช้งาน' : 'ใช้งาน'}</small></td><td><div className="kw-list-actions"><button type="button" onClick={()=>startEdit(user)}>แก้ไข</button>{String(user.is_active) === '0' ? <button type="button" onClick={()=>restore(user)}>เปิดใช้งาน</button> : <button type="button" onClick={()=>remove(user)}>ปิดบัญชี</button>}</div></td></tr>)}
        {!pager.filtered.length && <tr><td colSpan={4}>ไม่พบรายการ</td></tr>}
      </tbody></table></div></div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, autoComplete = undefined }) {
  return <label className="block"><span className="label">{label}</span><input required={required} type={type} autoComplete={autoComplete} className="input mt-1" value={value || ''} onChange={(e) => onChange(e.target.value)} /></label>;
}
