import { useState } from 'react';
import { api } from '../api.js';
import { checkServiceStatus } from '../utils/serviceStatus.js';

export default function AdminRecoveryPage() {
  const [form, setForm] = useState({ current_username: '', username: '', password: '', confirm: '', recovery_key: '' });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [serviceMessage, setServiceMessage] = useState('');
  async function checkConnection() { setChecking(true); try { const status = await checkServiceStatus(); setServiceMessage(status.message); } finally { setChecking(false); } }
  const update = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (form.password !== form.confirm) { setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'); return; }
    setPending(true);
    try {
      const { message: ok } = await api.adminRecovery({
        current_username: form.current_username, username: form.username,
        password: form.password, recovery_key: form.recovery_key,
      });
      setMessage(ok || 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      setForm((old) => ({ ...old, password: '', confirm: '', recovery_key: '' }));
    } catch (err) { setError(err.message || 'ดำเนินการไม่สำเร็จ'); }
    finally { setPending(false); }
  }
  return <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-red-50 px-4 py-10 text-slate-900">
    <section className="mx-auto max-w-lg rounded-[2rem] border border-red-100 bg-white/95 p-6 shadow-[0_24px_90px_rgba(185,28,28,.12)] sm:p-10">
      <div className="mb-7 flex items-center gap-3"><img src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง" className="h-12 w-12 rounded-xl object-contain"/><div><p className="text-xs font-black tracking-[.2em] text-red-700">ขวัญใจดาวทองขนส่ง</p><h1 className="text-2xl font-black">ตั้งค่าบัญชีแอดมิน</h1></div></div>
      <p className="mb-6 text-sm leading-6 text-slate-600">สำหรับเจ้าของระบบเท่านั้น ใช้รหัสกู้คืนที่ตั้งค่าใน Backend เพื่อสร้างหรือกู้คืนบัญชี หากมีแอดมินเดิมเพียงบัญชีเดียวสามารถเว้น Username เดิมได้</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-bold">Username แอดมินเดิม <span className="font-normal text-slate-500">(กรอกเมื่อกู้บัญชีเก่า)</span><input autoComplete="off" className="input mt-1" value={form.current_username} onChange={update('current_username')} placeholder="ชื่อผู้ใช้เดิม หากมี" /></label>
        <label className="block text-sm font-bold">Username ใหม่<input autoComplete="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9_.-]{3,40}" className="input mt-1" value={form.username} onChange={update('username')} placeholder="ตั้งชื่อผู้ใช้งานใหม่" /></label>
        <label className="block text-sm font-bold">Password ใหม่<input autoComplete="new-password" required type="password" className="input mt-1" value={form.password} onChange={update('password')} placeholder="ตั้งรหัสผ่านใหม่ที่คุณต้องการ" /></label>
        <label className="block text-sm font-bold">ยืนยัน Password ใหม่<input autoComplete="new-password" required type="password" className="input mt-1" value={form.confirm} onChange={update('confirm')} placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" /></label>
        <label className="block text-sm font-bold">รหัสกู้คืนของเจ้าของระบบ<input autoComplete="off" required type="password" className="input mt-1" value={form.recovery_key} onChange={update('recovery_key')} placeholder="รหัส ADMIN_RECOVERY_KEY จากเซิร์ฟเวอร์" /></label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>}
        {serviceMessage && <p role="status" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-800">{serviceMessage}</p>}
        <button type="button" onClick={checkConnection} disabled={checking || pending} className="btn-soft w-full">{checking ? 'กำลังตรวจสอบ...' : 'ตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์'}</button>
        <button disabled={pending} className="btn-primary w-full">{pending ? 'กำลังบันทึก...' : 'สร้าง / กู้คืนบัญชีแอดมิน'}</button>
      </form>
      <a className="mt-5 inline-block text-sm font-bold text-red-700 underline" href="/">กลับหน้าเข้าสู่ระบบ</a>
    </section>
  </main>;
}
