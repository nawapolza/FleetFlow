import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  Droplets,
  Gauge,
  RefreshCw,
  Route,
  Truck,
  Users,
  WalletCards,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import MobileHome from '../components/MobileHome.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, toastInfo } from '../utils/alerts.js';
import { date, datetime, money, number, today } from '../utils/format.js';

function startOfMonth() {
  return `${today().slice(0, 7)}-01`;
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DashboardPage({ setPage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastLoaded, setLastLoaded] = useState(null);
  const [filters, setFilters] = useState({ preset: 'month', from: startOfMonth(), to: today() });
  const refreshTimer = useRef(null);

  const queryParams = useMemo(() => (filters.preset === 'all' ? {} : { from: filters.from, to: filters.to }), [filters]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.dashboard(queryParams);
      setData(res.data);
      setLastLoaded(new Date().toISOString());
    } catch (err) {
      if (!silent) alertError(err, 'โหลด Dashboard ไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [queryParams]);

  const { connected, lastEventAt } = useRealtime((payload) => {
    if (['dashboard', 'deliveries', 'vehicles', 'users'].includes(payload?.kind)) {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => { refreshTimer.current = null; load(true); }, 450);
    }
  }, true);

  useEffect(() => () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); }, []);

  useEffect(() => {
    load();
    // ไม่ polling ทุก 15 วินาที: โหลดเมื่อเปิดหน้า/เปลี่ยน filter หรือเมื่อมีเหตุการณ์ข้อมูลเปลี่ยน
  }, [load]);

  function applyPreset(preset) {
    if (preset === 'today') setFilters({ preset, from: today(), to: today() });
    else if (preset === '7days') setFilters({ preset, from: sevenDaysAgo(), to: today() });
    else if (preset === 'month') setFilters({ preset, from: startOfMonth(), to: today() });
    else setFilters({ preset: 'all', from: '', to: '' });
  }

  async function refresh() {
    await load(true);
    toastInfo('รีเฟรช Dashboard แล้ว');
  }

  if (loading && !data) return <Loading />;

  const periodText = filters.preset === 'all' ? 'ข้อมูลทั้งหมด' : `${date(filters.from)} - ${date(filters.to)}`;

  return (
    <div className="page-shell dashboard-page">
      <MobileHome data={data} periodText={periodText} setPage={setPage} onRefresh={refresh} loading={loading} />
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <img src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง" className="kw-dashboard-logo"/>
          <div className="dashboard-title-line">
            <div>
              <p className="dashboard-eyebrow">ภาพรวมประจำวัน</p>
              <h1>ภาพรวม {data?.branch?.name || 'ขวัญใจดาวทองขนส่ง'}</h1>
            </div>
            <span className={`dashboard-sync ${connected ? 'is-online' : 'is-offline'}`}>
              {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
              {connected ? 'ข้อมูลล่าสุด' : 'กดรีเฟรชเพื่ออัปเดต'}
            </span>
          </div>
          <p>ติดตามงานขนส่ง ปริมาณน้ำมัน ค่าใช้จ่าย ระยะทาง และประสิทธิภาพของรถในหน้าจอเดียว</p>
          <div className="dashboard-meta-row">
            <span><CalendarDays size={14} /> ช่วงข้อมูล {periodText}</span>
            <span><Truck size={14} /> สาขา {data?.branch?.name || '-'} ({data?.branch?.code || '-'})</span>
            <span>อัปเดตล่าสุด {datetime(lastEventAt || lastLoaded)}</span>
          </div>
        </div>

        <div className="dashboard-filter-panel">
          <div className="dashboard-filter-presets">
            <PresetButton active={filters.preset === 'today'} onClick={() => applyPreset('today')}>วันนี้</PresetButton>
            <PresetButton active={filters.preset === '7days'} onClick={() => applyPreset('7days')}>7 วัน</PresetButton>
            <PresetButton active={filters.preset === 'month'} onClick={() => applyPreset('month')}>เดือนนี้</PresetButton>
            <PresetButton active={filters.preset === 'all'} onClick={() => applyPreset('all')}>ทั้งหมด</PresetButton>
          </div>
          <div className="dashboard-date-grid">
            <label><span>จากวันที่</span><input type="date" className="input" value={filters.from} disabled={filters.preset === 'all'} onChange={(e) => setFilters((old) => ({ ...old, preset: 'custom', from: e.target.value }))} /></label>
            <label><span>ถึงวันที่</span><input type="date" className="input" value={filters.to} disabled={filters.preset === 'all'} onChange={(e) => setFilters((old) => ({ ...old, preset: 'custom', to: e.target.value }))} /></label>
          </div>
          <div className="dashboard-filter-actions">
            <button className="btn-soft" onClick={refresh}><RefreshCw size={17} /> รีเฟรช</button>
            <button className="btn-primary" onClick={() => setPage('ledger')}>บัญชีงานขนส่ง</button>
          </div>
        </div>
      </section>

      <section className="dashboard-metrics">
        <Metric icon={ClipboardList} label="งานทั้งหมด" value={number(data?.total_trips)} unit="งาน" helper={`รวมจาก ${number(data?.total_records)} รายการรถ`} />
        <Metric icon={Droplets} label="น้ำมันเติมจริง" value={number(data?.total_liters, 2)} unit="ลิตร" helper={`มาตรฐาน ${number(data?.total_standard_liters, 2)} ลิตร`} />
        <Metric icon={WalletCards} label="ค่าใช้จ่ายรวม" value={money(data?.total_amount)} helper={`เฉลี่ย ${number(data?.avg_price_per_liter, 2)} บาท/ลิตร`} />
        <Metric icon={Route} label="ระยะทางรวม" value={number(data?.total_distance_km, 2)} unit="กม." helper="รวมระยะทางที่บันทึก" />
        <Metric icon={Gauge} label="อัตราเฉลี่ย" value={number(data?.avg_fuel_efficiency_km_per_liter, 2)} unit="กม./ลิตร" helper={`ต้นทุน ${number(data?.cost_per_km, 2)} บาท/กม.`} />
        <Metric icon={AlertTriangle} label="ใช้เกินมาตรฐาน" value={number(data?.over_standard_liters, 2)} unit="ลิตร" helper={`มูลค่า ${money(data?.over_standard_cost_baht)}`} tone={Number(data?.over_standard_liters || 0) > 0 ? 'danger' : 'blue'} />
      </section>

      <section className="dashboard-grid-main">
        <div className="card-clean dashboard-chart-card">
          <SectionHead icon={BarChart3} title="กราฟการใช้น้ำมัน" subtitle="ปริมาณลิตรแยกตามวันในช่วงที่เลือก" />
          <DailyLineChart rows={data?.by_day || []} />
        </div>
        <div className="card-clean dashboard-chart-card">
          <SectionHead icon={Activity} title="สัดส่วนประเภทน้ำมัน" subtitle="เปรียบเทียบปริมาณตามประเภท" />
          <FuelDonut rows={data?.by_item_type || []} total={data?.total_liters || 0} />
        </div>
      </section>



      <section className="dashboard-rank-grid">
        <div className="card-clean dashboard-list-card"><SectionHead icon={Truck} title="รถใช้น้ำมันสูงสุด" subtitle="เรียงตามทะเบียนรถ" /><RankList rows={data?.by_plate || []} suffix="ลิตร" /></div>
        <div className="card-clean dashboard-list-card"><SectionHead icon={Users} title="สรุปตามคนขับ" subtitle="ปริมาณรวมของคนขับแต่ละคน" /><RankList rows={data?.by_driver || []} suffix="ลิตร" /></div>
        <div className="card-clean dashboard-list-card"><SectionHead icon={Activity} title="ปลายทางยอดนิยม" subtitle="จุดหมายที่มีรายการมากที่สุด" /><RankList rows={data?.by_destination || []} suffix="ลิตร" /></div>
      </section>

      <section className="card-clean dashboard-table-card">
        <div className="dashboard-table-head">
          <div><h2>รายการล่าสุด</h2><p>ข้อมูลล่าสุดจากระบบบันทึกงานน้ำมัน</p></div>
          <button className="btn-soft" onClick={() => setPage('deliveries')}>ดูทั้งหมด</button>
        </div>
        <div className="dashboard-table-scroll">
          <div className="dashboard-table dashboard-table-header">
            <span>วันที่</span><span>ทะเบียน</span><span>ประเภท</span><span>ลิตร</span><span>จำนวนเงิน</span><span>กม./ลิตร</span><span>คนขับ</span><span>ปลายทาง</span>
          </div>
          {(data?.latest || []).map((row) => (
            <div key={row.id} className="dashboard-table dashboard-table-row">
              <span data-label="วันที่">{date(row.work_date || row.fill_date)}</span>
              <span data-label="ทะเบียน"><strong>{row.plate_no || '-'}</strong></span>
              <span data-label="ประเภท"><i className="badge-blue">{row.item_type}</i></span>
              <span data-label="ลิตร">{number(row.quantity_liters, 2)}</span>
              <span data-label="จำนวนเงิน">{money(row.amount_baht)}</span>
              <span data-label="กม./ลิตร" className="table-accent">{number(row.fuel_efficiency_km_per_liter, 2)}</span>
              <span data-label="คนขับ">{row.driver_name || '-'}</span>
              <span data-label="ปลายทาง">{Number(row.job_count || 1) > 1 ? `${row.destination_place || '-'} (+${Number(row.job_count) - 1} งาน)` : (row.destination_place || '-')}</span>
            </div>
          ))}
          {!data?.latest?.length && <Empty text="ยังไม่มีรายการล่าสุด" />}
        </div>
      </section>

      <section className="dashboard-secondary-metrics">
        <Metric icon={Truck} label="น้ำหนักหิน / ทราย" value={`${number(data?.total_stone_weight, 2)} / ${number(data?.total_sand_weight, 2)}`} unit="ตัน" helper="แยกน้ำหนักตามประเภท" />
        <Metric icon={AlertTriangle} label="แจ้งเตือนค้างอ่าน" value={number(data?.unread_notifications)} unit="รายการ" helper="ควรเปิดตรวจสอบ" tone="danger" />
      </section>
    </div>
  );
}

function PresetButton({ active, onClick, children }) {
  return <button type="button" onClick={onClick} className={active ? 'is-active' : ''}>{children}</button>;
}

function Metric({ icon: Icon, label, value, unit = '', helper, tone = 'blue' }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span className="metric-icon"><Icon size={20} /></span>
      <div className="metric-copy">
        <p>{label}</p>
        <strong>{value}{unit && <small>{unit}</small>}</strong>
        <span>{helper}</span>
      </div>
    </article>
  );
}

function SectionHead({ icon: Icon, title, subtitle }) {
  return <div className="dashboard-section-head"><div><span><Icon size={18} /></span><div><h2>{title}</h2><p>{subtitle}</p></div></div></div>;
}

function DailyLineChart({ rows }) {
  if (!rows.length) return <Empty text="ยังไม่มีข้อมูลรายวัน" />;
  const values = rows.map((row) => Number(row.value || 0));
  const max = Math.max(...values, 1);
  const width = 720;
  const height = 250;
  const padX = 46;
  const padTop = 22;
  const padBottom = 42;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : padX + (index / (rows.length - 1)) * chartW;
    const y = padTop + chartH - (Number(row.value || 0) / max) * chartH;
    return { x, y, row };
  });
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = `M ${points[0].x} ${padTop + chartH} L ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1].x} ${padTop + chartH} Z`;
  const labelStep = Math.max(1, Math.ceil(rows.length / 7));

  return (
    <div className="line-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="กราฟการใช้น้ำมันรายวัน">
        <defs>
          <linearGradient id="fuelArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + chartH * ratio;
          const label = max * (1 - ratio);
          return <g key={ratio}><line x1={padX} x2={width - padX} y1={y} y2={y} className="chart-grid-line" /><text x={padX - 10} y={y + 4} textAnchor="end" className="chart-axis-text">{number(label, 0)}</text></g>;
        })}
        <path d={areaPath} fill="url(#fuelArea)" />
        <polyline points={linePoints} className="chart-line" />
        {points.map((point, index) => (
          <g key={`${point.row.name}-${index}`}>
            <circle cx={point.x} cy={point.y} r="5" className="chart-point-halo" />
            <circle cx={point.x} cy={point.y} r="3" className="chart-point" />
            {(index % labelStep === 0 || index === points.length - 1) && <text x={point.x} y={height - 14} textAnchor="middle" className="chart-axis-text">{String(point.row.name).slice(5)}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

function FuelDonut({ rows, total }) {
  if (!rows.length) return <Empty text="ยังไม่มีข้อมูลประเภทน้ำมัน" />;
  const colors = ['#1557c0', '#2f7bea', '#68a5ff', '#9cc4ff', '#d4e5ff'];
  const computedTotal = Number(total || 0) || rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const safeTotal = Math.max(computedTotal, 1);
  let cumulative = 0;
  const segments = rows.map((row, index) => {
    const start = (cumulative / safeTotal) * 360;
    cumulative += Number(row.value || 0);
    const end = Math.min(360, (cumulative / safeTotal) * 360);
    return `${colors[index % colors.length]} ${start}deg ${end}deg`;
  });

  return (
    <div className="donut-layout">
      <div className="donut-chart" style={{ background: `conic-gradient(${segments.join(', ')})` }}>
        <div><strong>{number(computedTotal, 2)}</strong><span>ลิตร</span></div>
      </div>
      <div className="donut-legend">
        {rows.map((item, index) => {
          const percent = (Number(item.value || 0) / safeTotal) * 100;
          return (
            <div key={item.name}>
              <i style={{ backgroundColor: colors[index % colors.length] }} />
              <span><strong>{item.name}</strong><small>{number(item.value, 2)} ลิตร</small></span>
              <b>{number(percent, 1)}%</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankList({ rows, suffix }) {
  if (!rows.length) return <Empty text="ยังไม่มีข้อมูล" />;
  const max = Math.max(...rows.map((r) => Number(r.value || 0)), 1);
  return (
    <div className="rank-list">
      {rows.map((item, index) => (
        <div key={`${item.name}-${index}`} className="rank-row">
          <span className="rank-number">{index + 1}</span>
          <div className="rank-content">
            <div><strong>{item.name}</strong><span>{number(item.trips)} งาน</span></div>
            <div className="rank-progress"><i style={{ width: `${Math.max(5, (Number(item.value || 0) / max) * 100)}%` }} /></div>
          </div>
          <b>{number(item.value, 2)} <small>{suffix}</small></b>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div className="dashboard-empty">{text}</div>;
}
