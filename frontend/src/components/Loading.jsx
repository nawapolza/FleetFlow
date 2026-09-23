export default function Loading({ text = 'กำลังเตรียมข้อมูลสำหรับคุณ...' }) {
  return (
    <main className="kd-splash" role="status" aria-live="polite" aria-label="กรุณารอ ระบบกำลังโหลด">
      <div className="kd-splash-ambient kd-splash-ambient-one" aria-hidden="true" />
      <div className="kd-splash-ambient kd-splash-ambient-two" aria-hidden="true" />
      <div className="kd-splash-inner">
        <span className="kd-splash-overline">TRANSPORT MANAGEMENT PLATFORM</span>
        <div className="kd-splash-logo-wrap">
          <span className="kd-splash-orbit" aria-hidden="true" />
          <img src="/kwanjai-logo.png" alt="โลโก้ ขวัญใจดาวทองขนส่ง" className="kd-splash-logo" fetchPriority="high" />
        </div>
        <h1>ขวัญใจดาวทองขนส่ง</h1>
        <p className="kd-splash-tagline">ทุกเที่ยวงาน จัดการง่าย ในระบบเดียว</p>
        <div className="kd-splash-status"><span className="kd-splash-dot" />กรุณารอ</div>
        <p className="kd-splash-message">{text}</p>
        <div className="kd-splash-progress" aria-hidden="true"><span /></div>
        <small>ระบบกำลังเตรียมความพร้อม · โปรดรอสักครู่</small>
      </div>
    </main>
  );
}
