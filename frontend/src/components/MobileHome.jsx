import { ArrowDownRight, ArrowRight, CalendarDays, ClipboardList, FileBarChart3, History, ReceiptText, Route, Truck, WalletCards } from 'lucide-react';
import { date, money, number } from '../utils/format.js';

const actions = [
  { key: 'quick', label: 'บันทึกงาน', detail: 'เริ่มเที่ยวใหม่', icon: ClipboardList, primary: true },
  { key: 'trips', label: 'บัญชีรายเที่ยว', detail: 'ต้นทุนและกำไร', icon: ReceiptText },
  { key: 'deliveries', label: 'งานย้อนหลัง', detail: 'รายการทั้งหมด', icon: History },
  { key: 'reports', label: 'รายงาน', detail: 'สรุปรายเดือน', icon: FileBarChart3 },
  { key: 'vehicles', label: 'รถและคนขับ', detail: 'จัดการข้อมูลรถ', icon: Truck },
  { key: 'ledger', label: 'บัญชีขนส่ง', detail: 'รับ–จ่าย', icon: WalletCards },
];

export default function MobileHome({ data, periodText, setPage, onRefresh, loading = false }) {
  const latest = (data?.latest || []).slice(0, 3);
  return (
    <section className="kd-mobile-home" aria-label="หน้าโฮมขวัญใจดาวทองขนส่งสำหรับมือถือ">
      <header className="kd-home-hero">
        <div className="kd-home-hero-glow" aria-hidden="true" />
        <div className="kd-home-brand-row"><span className="kd-home-label">KWANJAI DAOTHONG · FLEET OPERATIONS</span><span className="kd-home-live"><i /> พร้อมใช้งาน</span></div>
        <div className="kd-home-logo-frame"><img src="/kwanjai-logo.png" alt="โลโก้ขวัญใจดาวทองขนส่ง" /></div>
        <h1>ขวัญใจดาวทองขนส่ง</h1>
        <p>ทุกเที่ยวงาน ทุกต้นทุน จัดการได้ในมือคุณ</p>
        <div className="kd-home-branch"><Truck size={16} /><span>{data?.branch?.name || 'ภาพรวมธุรกิจขนส่ง'}</span></div>
      </header>

      <div className="kd-home-section-head"><div><span className="kd-home-kicker">QUICK ACCESS</span><h2>เริ่มต้นใช้งาน</h2></div><span className="kd-home-section-sub">เลือกเมนูที่ต้องการ</span></div>
      <div className="kd-home-actions">
        {actions.map(({ key, label, detail, icon: Icon, primary }) => <button key={key} type="button" onClick={() => setPage(key)} className={`kd-home-action ${primary ? 'is-primary' : ''}`}>
          <span className="kd-home-action-icon"><Icon size={23} strokeWidth={1.8}/></span><span className="kd-home-action-copy"><strong>{label}</strong><small>{detail}</small></span><ArrowRight size={16} className="kd-home-action-arrow" />
        </button>)}
      </div>

      <div className="kd-home-section-head"><div><span className="kd-home-kicker">OVERVIEW</span><h2>ภาพรวมการดำเนินงาน</h2></div><button type="button" className="kd-home-refresh" onClick={onRefresh} disabled={loading}>อัปเดต <ArrowRight size={14}/></button></div>
      <div className="kd-home-period"><CalendarDays size={15}/><span>{periodText}</span></div>
      <div className="kd-home-stats">
        <div className="kd-home-stat is-red"><span><ClipboardList size={18}/> งานทั้งหมด</span><strong>{number(data?.total_trips)} <small>เที่ยว</small></strong><p>เที่ยวงานในช่วงที่เลือก</p></div>
        <div className="kd-home-stat"><span><Route size={18}/> ระยะทางรวม</span><strong>{number(data?.total_distance_km, 0)} <small>กม.</small></strong><p>จากข้อมูลที่บันทึก</p></div>
        <div className="kd-home-stat"><span><WalletCards size={18}/> ค่าใช้จ่ายน้ำมัน</span><strong>{money(data?.total_amount)}</strong><p>ยอดน้ำมันตามรายการ</p></div>
        <div className="kd-home-stat"><span><Truck size={18}/> จำนวนรายการรถ</span><strong>{number(data?.total_records)} <small>รายการ</small></strong><p>บันทึกการทำงานของรถ</p></div>
      </div>
      <div className="kd-home-note"><ArrowDownRight size={17}/><span>กำไร/ขาดทุนรายเที่ยวและรายคัน ดูได้ที่เมนูบัญชีรายเที่ยว</span><button type="button" onClick={() => setPage('trips')}>ดูบัญชี</button></div>

      <div className="kd-home-section-head"><div><span className="kd-home-kicker">RECENT ACTIVITY</span><h2>งานที่บันทึกล่าสุด</h2></div><button type="button" className="kd-home-refresh" onClick={() => setPage('deliveries')}>ดูทั้งหมด <ArrowRight size={14}/></button></div>
      <div className="kd-home-recent">
        {latest.length ? latest.map((row) => <div key={row.id} className="kd-home-recent-item"><span className="kd-home-recent-symbol"><Truck size={19}/></span><div><strong>{row.plate_no || 'ไม่ระบุทะเบียน'}</strong><small>{date(row.work_date || row.fill_date)} · {row.destination_place || row.item_type || 'งานขนส่ง'}</small></div><span className="kd-home-recent-value">{number(row.distance_km, 0)} กม.</span></div>) : <p className="kd-home-empty">ยังไม่มีรายการในช่วงที่เลือก เริ่มบันทึกงานแรกได้จากเมนูด้านบน</p>}
      </div>
    </section>
  );
}
