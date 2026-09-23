import { Eye, EyeOff, Leaf, LockKeyhole, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useState } from 'react';
import BrandMark from '../components/BrandMark.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { alertError, toastSuccess } from '../utils/alerts.js';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      toastSuccess('เข้าสู่ระบบสำเร็จ');
    } catch (err) {
      alertError(err, 'เข้าสู่ระบบไม่ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="heng-login-page">
      <div className="heng-login-orb heng-login-orb-one" />
      <div className="heng-login-orb heng-login-orb-two" />

      <div className="heng-login-shell">
        <section className="heng-login-story">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark className="login-logo-card h-24 w-24 rounded-[2rem] text-base tracking-[0.32em]" />
              <div>
                <p className="text-xs font-black uppercase tracking-[.22em] text-red-100">ขวัญใจดาวทองขนส่ง</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-white">ขวัญใจดาวทองขนส่ง</h1>
              </div>
            </div>

            <h2 className="mt-12 max-w-lg text-4xl font-black leading-tight text-white lg:text-5xl">ระบบจัดการงานขนส่งและน้ำมัน โฉมใหม่สีแดง–ขาว จัดการง่าย และพร้อมใช้งาน</h2>
            <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-red-100/90">จัดการรายการน้ำมัน ใบสรุปงาน รถ คนขับ และรายงานแบบมืออาชีพในหน้าจอเดียว รองรับมือถือ แท็บเล็ต และคอมพิวเตอร์</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StoryPoint icon={Sparkles} label="Modern UI" />
            <StoryPoint icon={Leaf} label="Pastel Theme" />
            <StoryPoint icon={ShieldCheck} label="Secure Access" />
          </div>
        </section>

        <section className="heng-login-form-panel">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <div className="mb-5 flex justify-center md:hidden">
                <BrandMark className="h-20 w-20 rounded-[1.4rem] text-sm tracking-[0.28em]" />
              </div>
              <span className="heng-kicker">ขวัญใจดาวทองขนส่ง สำหรับพนักงานและผู้ดูแล</span>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-stone-950">ยินดีต้อนรับเข้าสู่ระบบ</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">เข้าสู่ระบบเพื่อเริ่มบันทึก ตรวจสอบข้อมูล และออกใบสรุปรายการของ ขวัญใจดาวทองขนส่ง</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="label">ชื่อผู้ใช้</span>
                <div className="input-icon-wrap mt-1.5">
                  <span className="input-icon-left"><UserRound size={19} /></span>
                  <input
                    className="input input-has-left-icon"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="กรอกชื่อผู้ใช้"
                    autoComplete="username"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="label">รหัสผ่าน</span>
                <div className="input-icon-wrap mt-1.5">
                  <span className="input-icon-left"><LockKeyhole size={19} /></span>
                  <input
                    className="input input-has-left-icon input-has-right-icon"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="กรอกรหัสผ่าน"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="input-icon-right-button"
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </label>

              <button disabled={loading} className="btn-primary w-full text-base">
                {loading ? 'กำลังตรวจสอบข้อมูล...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function StoryPoint({ icon: Icon, label }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/7 p-4 backdrop-blur">
      <Icon size={20} className="text-red-100" />
      <p className="mt-3 text-sm font-black text-white">{label}</p>
    </div>
  );
}
