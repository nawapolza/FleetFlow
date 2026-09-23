export default function Loading({ text = 'กำลังโหลดข้อมูล...' }) {
  return (
    <main className="kd-splash kd-splash-simple" role="status" aria-live="polite" aria-label="กรุณารอ">
      <div className="kd-splash-inner">
        <img src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง" className="kd-splash-logo" width="228" height="228" fetchPriority="high" decoding="async" />
        <h1>ขวัญใจดาวทองขนส่ง</h1>
        <div className="kd-splash-status"><span className="kd-splash-dot" />กรุณารอ</div>
        <p className="kd-splash-message">{text}</p>
        <div className="kd-splash-progress" aria-hidden="true"><span /></div>
      </div>
    </main>
  );
}
