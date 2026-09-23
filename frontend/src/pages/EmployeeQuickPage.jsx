import DeliveryForm from '../components/DeliveryForm.jsx';

export default function EmployeeQuickPage() {
  return (
    <div className="page-shell app-page-mobile">
      <header className="kd-employee-intro">
        <img src="/kwanjai-logo.png" alt="โลโก้ขวัญใจดาวทองขนส่ง" />
        <div><span>KWANJAI DAOTHONG TRANSPORT</span><h1>บันทึกงานขนส่ง</h1><p>จัดการงานของคุณได้ง่าย ๆ จากมือถือ</p></div>
      </header>
      <div className="mx-auto max-w-5xl">
        <DeliveryForm />
      </div>
    </div>
  );
}
