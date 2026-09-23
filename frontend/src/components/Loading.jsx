import { LoaderCircle, Truck } from 'lucide-react';
export default function Loading({text='กรุณารอ กำลังเตรียมข้อมูล...'}) {
  return <div className="rf-loading-screen" role="status" aria-live="polite">
    <div className="rf-loading-card"><div className="rf-loading-symbol"><Truck size={32}/><LoaderCircle size={23} className="rf-spin"/></div>
    <span className="rf-kicker">ขวัญใจดาวทองขนส่ง / TRANSPORT</span><h2>กรุณารอ</h2><p>{text}</p><div className="rf-progress"><span/></div>
    <small>กำลังเชื่อมต่อข้อมูลอย่างปลอดภัย</small></div></div>;
}
