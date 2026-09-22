import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function AccountPage() {
  const { user, logout } = useAuth();
  const [data, setData] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (!data.new_password || data.new_password !== data.confirm_password) {
      setError('กรุณากรอกรหัสผ่านใหม่ให้ตรงกัน'); return;
    }
    setBusy(true);
    try {
      const res = await api.changePassword({ current_password: data.current_password, new_password: data.new_password });
      setData({ current_password: '', new_password: '', confirm_password: '' });
      setMessage(res.message || 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง');
      logout();
    } catch (err) { setError(err.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'); }
    finally { setBusy(false); }
  }
  return <div className="page-shell"><section className="card-clean mx-auto w-full max-w-2xl overflow-hidden p-4 sm:p-7">
    <div className="mb-6 flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700"><KeyRound size={22}/></span><div className="min-w-0"><h1 className="break-words text-xl font-black text-slate-900 sm:text-2xl">บัญชีและรหัสผ่าน</h1><p className="break-words text-sm text-slate-500">@{user?.username} · {user?.role === 'owner' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</p></div></div>
    <div className="mb-5 flex items-start gap-2 rounded-2xl bg-violet-50 p-3 text-sm font-medium leading-6 text-violet-900"><ShieldCheck className="mt-1 shrink-0" size={17}/><span>คุณสามารถเปลี่ยนรหัสผ่านของบัญชีตนเองได้ โดยต้องยืนยันรหัสผ่านเดิม การเปลี่ยนแปลงจะออกจากระบบอัตโนมัติ แนะนำให้ใช้รหัสผ่านที่เดายาก</span></div>
    <form onSubmit={save} className="grid min-w-0 gap-4">
      <label className="block min-w-0 text-sm font-bold">รหัสผ่านปัจจุบัน<input type="password" autoComplete="current-password" required className="input mt-1" value={data.current_password} onChange={e=>setData({...data,current_password:e.target.value})}/></label>
      <label className="block min-w-0 text-sm font-bold">รหัสผ่านใหม่<input type="password" autoComplete="new-password" required className="input mt-1" value={data.new_password} onChange={e=>setData({...data,new_password:e.target.value})}/></label>
      <label className="block min-w-0 text-sm font-bold">ยืนยันรหัสผ่านใหม่<input type="password" autoComplete="new-password" required className="input mt-1" value={data.confirm_password} onChange={e=>setData({...data,confirm_password:e.target.value})}/></label>
      {error&&<p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message&&<p role="status" className="break-words rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">{busy?'กำลังบันทึก...':'เปลี่ยนรหัสผ่าน'}</button>
    </form>
  </section></div>;
}
