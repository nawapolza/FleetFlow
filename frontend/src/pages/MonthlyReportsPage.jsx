import {
  BarChart3,
  CalendarDays,
  Download,
  Droplets,
  FileSpreadsheet,
  Fuel,
  Gauge,
  Printer,
  RefreshCw,
  Route,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import BranchScopeBar from '../components/BranchScopeBar.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, toastSuccess } from '../utils/alerts.js';
import { date, datetime, money, number, today } from '../utils/format.js';

function currentMonth() {
  return today().slice(0, 7);
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function MonthlyReportsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.monthlyReport(month);
      setData(res.data);
    } catch (err) {
      if (!silent) alertError(err, 'โหลดรายงานประจำเดือนไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [month]);

  useRealtime((payload) => {
    if (['deliveries', 'stocks', 'reports'].includes(payload?.kind)) load(true);
  }, true);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const maxDayLiters = useMemo(() => Math.max(1, ...(data?.by_day || []).map((row) => Number(row.actual_liters || 0))), [data?.by_day]);

  function downloadCsv() {
    if (!data) return;
    const rows = [
      ['รายงานน้ำมันประจำเดือน', data.month],
      ['สาขา', data.branch?.name || '-'],
      ['รหัสสาขา', data.branch?.code || '-'],
      ['สร้างเมื่อ', datetime(data.generated_at)],
      [],
      ['สรุป', 'ค่า'],
      ['จำนวนรายการ', summary.records || 0],
      ['จำนวนงาน', summary.trips || 0],
      ['ลิตรเติมจริง', number(summary.actual_liters, 2)],
      ['ลิตรมาตรฐาน', number(summary.standard_liters, 2)],
      ['ส่วนต่างลิตร', number(summary.variance_liters, 2)],
      ['ค่าใช้จ่ายจริง', number(summary.fuel_cost_baht, 2)],
      ['ค่าใช้จ่ายมาตรฐาน', number(summary.standard_cost_baht, 2)],
      ['ส่วนต่างค่าใช้จ่าย', number(summary.variance_cost_baht, 2)],
      ['ระยะทางรวม', number(summary.distance_km, 2)],
      ['กม./ลิตรเฉลี่ย', number(summary.avg_efficiency_km_per_liter, 2)],
      ['ต้นทุนต่อกม.', number(summary.cost_per_km, 2)],
      [],
      ['ทะเบียนรถ', 'รายการ', 'งาน', 'ลิตรจริง', 'ลิตรมาตรฐาน', 'ส่วนต่างลิตร', 'ค่าใช้จ่าย', 'ระยะทาง', 'กม./ลิตร', 'บาท/กม.'],
      ...(data.by_vehicle || []).map((row) => [row.name, row.records, row.trips, number(row.actual_liters, 2), number(row.standard_liters, 2), number(row.variance_liters, 2), number(row.fuel_cost_baht, 2), number(row.distance_km, 2), number(row.efficiency_km_per_liter, 2), number(row.cost_per_km, 2)]),
    ];
    const csv = `\ufeff${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fuel-monthly-${data.branch?.code || 'branch'}-${data.month}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toastSuccess('ดาวน์โหลดรายงาน CSV แล้ว');
  }

  if (loading && !data) return <Loading />;

  return (
    <div className="page-shell monthly-report-page">
      <div className="page-orbit print-hidden">
        <span className="page-orbit-code">07 / MONTHLY ACCOUNTING</span>
        <div>
          <h1 className="page-title">สรุปน้ำมันส่งบัญชีรายเดือน</h1>
          <p className="page-subtitle">รวมลิตร ค่าใช้จ่าย ประสิทธิภาพ และส่วนต่างจากมาตรฐาน เพื่อปิดยอดให้เจ้าของกิจการและฝ่ายบัญชี</p>
        </div>
        <span className="page-orbit-signal">OWNER ONLY</span>
      </div>

      <BranchScopeBar label="รายงานบัญชีของสาขา" detail="ยอดลิตร ค่าใช้จ่าย รถ พนักงาน และตรวจนับรวมเฉพาะสาขาที่เลือก" className="print-hidden" />

      <section className="monthly-report-toolbar card-clean print-hidden">
        <label><span><CalendarDays size={16} /> เดือนรายงาน</span><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <div>
          <button className="btn-soft" onClick={() => load(true)}><RefreshCw size={17} /> รีเฟรช</button>
          <button className="btn-soft" onClick={() => window.print()}><Printer size={17} /> พิมพ์ / PDF</button>
          <button className="btn-primary" onClick={downloadCsv}><Download size={17} /> ดาวน์โหลด CSV</button>
        </div>
      </section>

      <header className="monthly-print-header">
        <div><img className="monthly-print-mark" src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง"/><div><p>ขวัญใจดาวทองขนส่ง · {data?.branch?.name || '-'}</p><h1>รายงานสรุปน้ำมันประจำเดือน {data?.month || month}</h1><small>รหัสสาขา {data?.branch?.code || '-'}</small></div></div>
        <span>สร้างเมื่อ {datetime(data?.generated_at)}</span>
      </header>

      <section className="monthly-summary-grid">
        <SummaryCard icon={Droplets} label="ลิตรเติมจริง" value={`${number(summary.actual_liters, 2)} ลิตร`} helper={`มาตรฐาน ${number(summary.standard_liters, 2)} ลิตร`} />
        <SummaryCard icon={WalletCards} label="ค่าใช้จ่ายจริง" value={money(summary.fuel_cost_baht)} helper={`มาตรฐาน ${money(summary.standard_cost_baht)}`} />
        <SummaryCard icon={Route} label="ระยะทางรวม" value={`${number(summary.distance_km, 2)} กม.`} helper={`${number(summary.records)} รายการ · ${number(summary.trips)} งาน`} />
        <SummaryCard icon={Gauge} label="ประสิทธิภาพเฉลี่ย" value={`${number(summary.avg_efficiency_km_per_liter, 2)} กม./ลิตร`} helper={`${number(summary.cost_per_km, 2)} บาท/กม.`} />
      </section>

      <section className={`monthly-variance-banner ${Number(summary.variance_liters || 0) > 0 ? 'is-over' : 'is-saving'}`}>
        <span>{Number(summary.variance_liters || 0) > 0 ? <TrendingUp size={28} /> : <TrendingDown size={28} />}</span>
        <div>
          <p>{Number(summary.variance_liters || 0) > 0 ? 'น้ำมันใช้เกินมาตรฐานสุทธิ' : 'น้ำมันต่ำกว่ามาตรฐานสุทธิ'}</p>
          <strong>{Number(summary.variance_liters || 0) > 0 ? '+' : ''}{number(summary.variance_liters, 2)} ลิตร</strong>
          <small>ส่วนต่างค่าใช้จ่าย {Number(summary.variance_cost_baht || 0) > 0 ? '+' : ''}{money(summary.variance_cost_baht)} · เกินมาตรฐานรวม {number(summary.over_standard_liters, 2)} ลิตร</small>
        </div>
        <div className="monthly-audit-mini">
          <span>ตรวจนับขาด <strong>{number(summary.audit_shortage_liters, 2)} ลิตร</strong></span>
          <span>ตรวจนับเกิน <strong>{number(summary.audit_surplus_liters, 2)} ลิตร</strong></span>
        </div>
      </section>

      <section className="monthly-report-main-grid">
        <div className="card-clean monthly-chart-card">
          <div className="monthly-section-head"><div><BarChart3 size={20} /><span><strong>การใช้น้ำมันรายวัน</strong><small>ลิตรเติมจริงและส่วนต่างในแต่ละวัน</small></span></div></div>
          <div className="monthly-day-chart">
            {(data?.by_day || []).map((row) => (
              <div key={row.date} className="monthly-day-row">
                <span>{date(row.date)}</span>
                <div><i style={{ width: `${Math.max(2, (Number(row.actual_liters || 0) / maxDayLiters) * 100)}%` }} /></div>
                <strong>{number(row.actual_liters, 2)} ลิตร</strong>
                <small className={Number(row.variance_liters || 0) > 0 ? 'is-over' : 'is-saving'}>{Number(row.variance_liters || 0) > 0 ? '+' : ''}{number(row.variance_liters, 2)}</small>
              </div>
            ))}
            {!(data?.by_day || []).length && <p className="monthly-empty">ไม่มีข้อมูลในเดือนนี้</p>}
          </div>
        </div>

        <div className="card-clean monthly-account-card">
          <div className="monthly-section-head"><div><FileSpreadsheet size={20} /><span><strong>ยอดสำหรับบัญชี</strong><small>สรุปยอดเข้าออกของคลังในเดือนนี้</small></span></div></div>
          <div className="monthly-account-lines">
            <AccountLine icon={Fuel} label="รับเข้าสต๊อก" value={`${number(summary.stock_in_liters, 2)} ลิตร`} />
            <AccountLine icon={Droplets} label="จ่ายออกจากสต๊อก" value={`${number(summary.stock_out_liters, 2)} ลิตร`} />
            <AccountLine icon={WalletCards} label="ค่าใช้จ่ายน้ำมัน" value={money(summary.fuel_cost_baht)} />
            <AccountLine icon={TrendingUp} label="มูลค่าใช้เกินมาตรฐาน" value={money(Math.max(0, Number(summary.variance_cost_baht || 0)))} danger />
          </div>
        </div>
      </section>

      <ReportTable title="สรุปตามรถ" icon={Route} rows={data?.by_vehicle || []} firstLabel="ทะเบียนรถ" />
      <ReportTable title="สรุปตามพนักงาน / ผู้กรอก" icon={Gauge} rows={data?.by_employee || []} firstLabel="พนักงาน" />
      <ReportTable title="สรุปตามประเภทน้ำมัน" icon={Fuel} rows={data?.by_item_type || []} firstLabel="ประเภทน้ำมัน" />

      <section className="card-clean monthly-audit-table">
        <div className="monthly-section-head"><div><FileSpreadsheet size={20} /><span><strong>ประวัติตรวจนับสต๊อกจริง</strong><small>ส่วนต่างระหว่างยอดระบบกับยอดตรวจจริง</small></span></div></div>
        <div className="monthly-table-scroll">
          <table>
            <thead><tr><th>วันที่</th><th>ประเภท</th><th>ยอดระบบ</th><th>ตรวจจริง</th><th>ส่วนต่าง</th><th>หมายเหตุ</th></tr></thead>
            <tbody>
              {(data?.stock_audits || []).map((row) => (
                <tr key={row.id}><td>{date(row.audit_date)}</td><td>{row.item_type}</td><td>{number(row.system_balance_liters, 2)}</td><td>{number(row.actual_balance_liters, 2)}</td><td className={Number(row.variance_liters || 0) < 0 ? 'is-danger' : 'is-success'}>{Number(row.variance_liters || 0) > 0 ? '+' : ''}{number(row.variance_liters, 2)}</td><td>{row.note || '-'}</td></tr>
              ))}
              {!(data?.stock_audits || []).length && <tr><td colSpan="6" className="monthly-empty">ไม่มีรายการตรวจนับในเดือนนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, helper }) {
  return <div className="monthly-summary-card"><span><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong><small>{helper}</small></div></div>;
}

function AccountLine({ icon: Icon, label, value, danger = false }) {
  return <div className={danger ? 'is-danger' : ''}><span><Icon size={18} /> {label}</span><strong>{value}</strong></div>;
}

function ReportTable({ title, icon: Icon, rows, firstLabel }) {
  return (
    <section className="card-clean monthly-report-table">
      <div className="monthly-section-head"><div><Icon size={20} /><span><strong>{title}</strong><small>เปรียบเทียบลิตรจริง มาตรฐาน ค่าใช้จ่าย และประสิทธิภาพ</small></span></div></div>
      <div className="monthly-table-scroll">
        <table>
          <thead><tr><th>{firstLabel}</th><th>รายการ/งาน</th><th>ลิตรจริง</th><th>ลิตรมาตรฐาน</th><th>ส่วนต่าง</th><th>ค่าใช้จ่าย</th><th>ระยะทาง</th><th>กม./ลิตร</th><th>บาท/กม.</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td><strong>{row.name}</strong></td><td>{row.records}/{row.trips}</td><td>{number(row.actual_liters, 2)}</td><td>{number(row.standard_liters, 2)}</td><td className={Number(row.variance_liters || 0) > 0 ? 'is-danger' : 'is-success'}>{Number(row.variance_liters || 0) > 0 ? '+' : ''}{number(row.variance_liters, 2)}</td><td>{money(row.fuel_cost_baht)}</td><td>{number(row.distance_km, 2)}</td><td>{number(row.efficiency_km_per_liter, 2)}</td><td>{number(row.cost_per_km, 2)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="9" className="monthly-empty">ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
