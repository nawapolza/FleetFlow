import { Banknote, Camera, ChevronDown, Edit, ExternalLink, FileText, Gauge, MapPin, PackageCheck, Route, Send, Trash2 } from 'lucide-react';
import { uploadUrl } from '../api.js';
import { date, money, number, parseDecimal, roundDecimal } from '../utils/format.js';

function asArray(...values) {
  const out = [];
  values.forEach((value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach((item) => item && out.push(item));
    else out.push(value);
  });
  return [...new Set(out.filter(Boolean))];
}

function photosFor(row, pluralKey, singleKey, aliasKey = '') {
  return asArray(row?.[pluralKey], row?.[singleKey], aliasKey ? row?.[aliasKey] : null);
}

function isPdf(path = '') {
  return String(path).toLowerCase().split('?')[0].endsWith('.pdf');
}


function round2(value) {
  return roundDecimal(value, 2);
}

function decimalPart(value) {
  const n = Math.abs(parseDecimal(value, 0));
  return Math.abs(n - Math.trunc(n));
}

function bestLitersValue(...values) {
  const candidates = values
    .map((value) => round2(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!candidates.length) return 0;
  const decimalCandidate = candidates.find((value) => decimalPart(value) > 0);
  return decimalCandidate || candidates[0];
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function distanceValue(row) {
  return parseDecimal(row?.distance_km, 0);
}

function litersValue(row) {
  return round2(row?.actual_filled_liters || row?.quantity_liters || row?.station_liters || row?.liters || row?.nozzle_liters || row?.station_meter_delta_liters || 0);
}

function standardLitersValue(row) {
  return round2(row?.standard_fuel_liters || row?.recommended_fuel_liters || row?.quantity_liters || 0);
}

function varianceLitersValue(row) {
  if (hasValue(row?.fuel_variance_liters)) return round2(row.fuel_variance_liters);
  return round2(litersValue(row) - standardLitersValue(row));
}

function meterText(value) {
  if (value === undefined || value === null || value === '') return '-';
  const n = parseDecimal(value, NaN);
  if (!Number.isFinite(n)) return String(value);
  return number(n, 0);
}

function priceText(row) {
  const price = parseDecimal(row?.price_baht_per_liter || row?.price_per_liter, 0);
  return price > 0 ? `${number(price, 2)} บาท` : '-';
}

function displayAmountValue(row) {
  const stored = parseDecimal(row?.amount_baht, 0);
  const price = parseDecimal(row?.price_baht_per_liter || row?.price_per_liter, 0);
  const liters = litersValue(row);
  const expected = price > 0 && liters > 0 ? roundDecimal(price * liters, 2) : 0;
  // v39: ถ้ามีจำนวนลิตรและราคาลิตรละ ให้ยึดสูตรจริงเสมอ กันยอดเงินเพี้ยนจากคอมม่า/มือถือ
  if (expected > 0) return expected;
  return stored;
}

function incomeValue(row, key) {
  return Math.max(0, roundDecimal(parseDecimal(row?.[key], 0), 2));
}

function totalIncomeValue(row) {
  const jobs = jobsFor(row);
  const jobsTotal = jobs.reduce((sum, job) => sum + jobIncomeValue(job), 0);
  if (jobsTotal > 0) return roundDecimal(jobsTotal, 2);
  const calculated = incomeValue(row, 'trip_fee_baht') + incomeValue(row, 'allowance_baht') + incomeValue(row, 'other_income_baht');
  return calculated > 0 ? roundDecimal(calculated, 2) : incomeValue(row, 'total_income_baht');
}

function kgText(value) {
  const kg = parseDecimal(value, 0);
  return kg > 0 ? `${number(kg / 1000, 3)} ตัน` : '-';
}

function routePlace(value, fallback) {
  return hasValue(value) ? value : fallback;
}

function jobsFor(row = {}) {
  if (Array.isArray(row.jobs) && row.jobs.length) return row.jobs;
  return [{
    id: 'legacy_job_1',
    job_no: 1,
    cargo_name: row.cargo_name || '',
    origin_place: row.origin_place || '',
    destination_place: row.destination_place || '',
    load_date: row.load_date || '',
    unload_date: row.unload_date || '',
    distance_km: row.distance_km || 0,
    loading_weight_kg: row.loading_weight_kg || 0,
    unloading_weight_kg: row.unloading_weight_kg || 0,
    cargo_stone_weight: row.cargo_stone_weight || 0,
    cargo_sand_weight: row.cargo_sand_weight || 0,
    trip_fee_baht: row.trip_fee_baht || 0,
    allowance_baht: row.allowance_baht || 0,
    other_income_baht: row.other_income_baht || 0,
    total_income_baht: row.total_income_baht || 0,
    wage_payer: row.wage_payer || '',
    payment_status: row.payment_status || 'pending',
    note: '',
  }];
}

function jobIncomeValue(job = {}) {
  return roundDecimal(
    Math.max(0, parseDecimal(job.trip_fee_baht, 0)) +
    Math.max(0, parseDecimal(job.allowance_baht, 0)) +
    Math.max(0, parseDecimal(job.other_income_baht, 0)),
    2,
  );
}

function routeSummaryText(row) {
  const jobs = jobsFor(row);
  const first = jobs[0] || {};
  const firstRoute = `${routePlace(first.origin_place, 'ไม่ระบุจุดขึ้นงาน')} → ${routePlace(first.destination_place, 'ไม่ระบุจุดลงงาน')}`;
  return jobs.length > 1 ? `${jobs.length} งาน · ${firstRoute} และอีก ${jobs.length - 1} งาน` : firstRoute;
}

function expectedEfficiency(row) {
  const saved = parseDecimal(row?.expected_fuel_efficiency_km_per_liter, 0);
  if (saved > 0) return saved;
  const vehicleRate = parseDecimal(row?.vehicle_fuel_efficiency_km_per_liter, 0);
  if (vehicleRate > 0) return vehicleRate;
  return efficiency(row);
}

function estimatedDistanceValue(row) {
  const saved = parseDecimal(row?.estimated_distance_km, 0);
  if (saved > 0) return saved;
  const liters = litersValue(row);
  const rate = expectedEfficiency(row);
  return liters > 0 && rate > 0 ? round2(liters * rate) : 0;
}

function efficiency(row) {
  const saved = parseDecimal(row?.fuel_efficiency_km_per_liter, 0);
  if (saved > 0) return saved;
  const distance = distanceValue(row);
  const liters = litersValue(row);
  return distance > 0 && liters > 0 ? round2(distance / liters) : 0;
}



export default function DeliveryReceiptCard({ row, onEdit, onDelete }) {
  const jobs = jobsFor(row);
  const distance = distanceValue(row);
  const liters = litersValue(row);
  const rate = expectedEfficiency(row);
  const standardLiters = standardLitersValue(row);
  const tripFee = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'trip_fee_baht'), 0), 2) || incomeValue(row, 'trip_fee_baht');
  const allowance = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'allowance_baht'), 0), 2) || incomeValue(row, 'allowance_baht');
  const otherIncome = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'other_income_baht'), 0), 2) || incomeValue(row, 'other_income_baht');
  const totalIncome = totalIncomeValue(row);
  const groups = [
    { label: 'บิล', paths: photosFor(row, 'bill_photos', 'bill_photo', 'receipt_photo') },
    { label: 'เอกสาร', paths: photosFor(row, 'document_photos', 'document_photo') },
    { label: 'น้ำมัน', paths: photosFor(row, 'oil_photos', 'oil_photo') },
    { label: 'บรรทุก', paths: photosFor(row, 'cargo_photos', 'cargo_photo') },
    { label: 'แอดบลู', paths: photosFor(row, 'adblue_photos', 'adblue_photo') },
  ];
  const allPhotos = groups.flatMap(group => group.paths);
  return <article className="rf-invoice receipt-card">
    <header className="rf-invoice-head">
      <div className="rf-invoice-headline"><img src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง" className="kw-logo-receipt"/><div><small>ขวัญใจดาวทองขนส่ง / ระบบบริหารงานขนส่ง</small><h2>ใบสรุปงานขนส่ง</h2><p>รายละเอียดเที่ยวงานและการใช้น้ำมัน • ระยะทางจากการกรอกข้อมูลจริง</p></div></div>
      <div className="rf-invoice-id"><span>ทะเบียนรถ</span><strong>{row.plate_no || 'ไม่ระบุ'}</strong><small>{row.item_type || 'น้ำมัน'} · {row.operation_type || 'บันทึกงาน'}</small></div>
    </header>
    <div className="rf-invoice-meta">
      <div><span>วันที่ / เวลา</span><strong>{date(row.fill_date || row.work_date)} {row.fill_time || ''}</strong></div>
      <div><span>ผู้ขับรถ</span><strong>{row.driver_name || row.driver_name_input || '-'}</strong></div>
      <div><span>จำนวนงาน</span><strong>{jobs.length} งาน</strong></div>
      <div><span>เลขรถ</span><strong>{row.vehicle_no || '-'}</strong></div>
    </div>
    <div className="rf-invoice-body">
      <section className="rf-invoice-section"><div className="rf-invoice-section-head"><span>01</span><div><h3>รายการขนส่ง</h3><p>รายละเอียดวัสดุ น้ำหนัก และเส้นทางในแต่ละงาน</p></div></div>
        <div className="rf-invoice-jobs">
          {jobs.map((job, index) => <div className="rf-invoice-job" key={job.id || index}>
            <div className="rf-invoice-job-top"><span>งาน {index + 1}</span><strong>{job.cargo_name || 'ไม่ระบุวัสดุ'}</strong><b>{number(job.distance_km, 2)} กม.</b></div>
            <div className="rf-invoice-route"><div><small>ต้นทาง</small><strong>{job.origin_place || '-'}</strong></div><div><small>ปลายทาง</small><strong>{job.destination_place || '-'}</strong></div></div>
            <div className="rf-invoice-job-bottom"><span>น้ำหนักขึ้น: {kgText(job.loading_weight_kg)}</span><span>น้ำหนักลง: {kgText(job.unloading_weight_kg)}</span><span>รายได้: {money(jobIncomeValue(job))}</span></div>
            <div className="kw-invoice-job-finance"><span>ต้นทุน {money(['sand_cost_baht','stone_cost_baht','fuel_cost_baht','tire_cost_baht','parts_cost_baht','mechanic_cost_baht','driver_cost_baht','other_cost_baht'].reduce((sum,key)=>sum+Number(job[key]||0),0))}</span><strong>กำไร/ขาดทุน {money(jobIncomeValue(job)-['sand_cost_baht','stone_cost_baht','fuel_cost_baht','tire_cost_baht','parts_cost_baht','mechanic_cost_baht','driver_cost_baht','other_cost_baht'].reduce((sum,key)=>sum+Number(job[key]||0),0))}</strong></div>
          </div>)}
        </div>
      </section>
      <section className="rf-invoice-section"><div className="rf-invoice-section-head"><span>02</span><div><h3>ระยะทางและน้ำมัน</h3><p>คำนวณจากระยะทางที่กรอก ไม่ใช้ GPS</p></div></div>
        <div className="rf-invoice-numbers"><div><span>ระยะทางรวม</span><strong>{number(distance, 2)} <small>กม.</small></strong></div><div><span>อัตราประจำรถ</span><strong>{rate ? number(rate, 2) : '-'} <small>กม./ลิตร</small></strong></div><div><span>น้ำมันมาตรฐาน</span><strong>{number(standardLiters, 2)} <small>ลิตร</small></strong></div><div><span>เติมจริง</span><strong>{number(liters, 2)} <small>ลิตร</small></strong></div></div>
        <div className="rf-invoice-footline"><span>ราคาน้ำมัน / ลิตร</span><strong>{priceText(row)}</strong></div>
        <div className="rf-invoice-footline"><span>ค่าใช้จ่ายน้ำมันจริง</span><strong>{money(displayAmountValue(row))}</strong></div>
      </section>
      <section className="rf-invoice-section rf-invoice-money"><div className="rf-invoice-section-head"><span>03</span><div><h3>สรุปรายได้งานขนส่ง</h3><p>รวมรายได้ของงานในรายการนี้</p></div></div>
        <div className="rf-invoice-footline"><span>ค่าบรรทุก</span><strong>{money(tripFee)}</strong></div><div className="rf-invoice-footline"><span>ค่าหิน</span><strong>{money(allowance)}</strong></div><div className="rf-invoice-footline"><span>ค่าทราย</span><strong>{money(otherIncome)}</strong></div>
        <div className="rf-invoice-grand"><span>รวมรายได้</span><strong>{money(totalIncome)}</strong></div>
        <small className="rf-invoice-disclaimer">จำนวนเงินนี้เป็นรายได้งานขนส่ง ไม่ใช่กำไรสุทธิของรถ โปรดดูต้นทุนทั้งหมดในเมนูบัญชีขนส่ง</small>
      </section>
      <details className="rf-invoice-details"><summary>ข้อมูลเพิ่มเติม <ChevronDown size={18}/></summary><div className="rf-invoice-details-content">
        <div className="rf-invoice-extra"><Info label="ผู้บันทึก" value={row.recorder_name || row.employee_name || '-'} /><Info label="ผู้เติม" value={row.filler_name || '-'} /><Info label="หัวจ่ายก่อน" value={meterText(row.station_meter_before || row.odometer_before)} /><Info label="หัวจ่ายหลัง" value={meterText(row.station_meter_after || row.odometer_after)} /></div>
        {row.note && <p className="rf-invoice-note">หมายเหตุ: {row.note}</p>}
      </div></details>
    </div>
    <footer className="rf-invoice-footer"><span>ขวัญใจดาวทองขนส่ง · ใบสรุปงานขนส่ง</span><div className="rf-invoice-actions print:hidden">{onEdit && <button type="button" onClick={onEdit}><Edit size={16}/> แก้ไข</button>}{onDelete && <button type="button" onClick={onDelete}><Trash2 size={16}/> ลบรายการ</button>}</div></footer>
  </article>;
}

function JobSummaryBlock({ job, index }) {
  const income = jobIncomeValue(job);
  return (
    <div className="rounded-[1.15rem] border border-sky-100 bg-white/80 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.12em] text-sky-700">งานที่ {index + 1}</p>
          <p className="text-sm font-black text-slate-900">{job.cargo_name || 'ไม่ระบุชื่องาน'}</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">{number(job.distance_km, 2)} กม.</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">{money(income)}</span>
        </div>
      </div>
      <div className="divide-y divide-sky-100">
        <CloseJobLine icon={MapPin} prefix="ขึ้นงาน" label={job.origin_place || 'จุดรับสินค้า / บ่อต้นทาง'} value={kgText(job.loading_weight_kg)} />
        <CloseJobLine icon={MapPin} prefix="ลงงาน" label={job.destination_place || 'จุดลงงาน / ปลายทาง'} value={kgText(job.unloading_weight_kg)} />
      </div>
    </div>
  );
}

function JobDetailCard({ job, index }) {
  return (
    <div className="rounded-[1.25rem] border border-blue-100 bg-blue-50/50 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div><p className="text-[11px] font-black text-blue-700">งานที่ {index + 1}</p><p className="text-sm font-black text-slate-950">{job.cargo_name || 'ไม่ระบุชื่องาน'}</p></div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100">{number(job.distance_km, 2)} กม.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="จุดขึ้นงาน" value={job.origin_place || '-'} />
        <Info label="จุดลงงาน" value={job.destination_place || '-'} />
        <Info label="วันที่บรรทุก / ลงของ" value={`${date(job.load_date)} / ${date(job.unload_date)}`} />
        <Info label="น้ำหนักต้นทาง" value={kgText(job.loading_weight_kg)} />
        <Info label="น้ำหนักปลายทาง" value={kgText(job.unloading_weight_kg)} />
        <Info label="ค่าบรรทุก" value={money(job.trip_fee_baht)} />
        <Info label="ค่าหิน" value={money(job.allowance_baht)} />
        <Info label="ค่าทราย" value={money(job.other_income_baht)} />
        <Info label="รวมรายได้งานนี้" value={money(jobIncomeValue(job))} />
        <Info label="ผู้จ่ายค่าแรง" value={job.wage_payer || '-'} />
        <Info label="สถานะรายได้" value={job.payment_status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย / ไม่ระบุ'} />
      </div>
      {job.note && <p className="mt-2 rounded-xl bg-white p-2 text-xs font-bold leading-5 text-slate-600 ring-1 ring-blue-100">หมายเหตุ: {job.note}</p>}
    </div>
  );
}

function CloseJobLine({ icon: Icon, prefix = '', label, value }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm ring-1 ring-sky-100"><Icon size={16} /></div>
      <div className="min-w-0 flex-1">
        {prefix && <p className="text-[11px] font-black uppercase tracking-[.14em] text-sky-700">{prefix}</p>}
        <p className="break-words text-sm font-black text-slate-800">{label}</p>
      </div>
      <p className="shrink-0 text-right text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function ReceiptIncomeLine({ label, value, total = false }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 ${total ? 'bg-emerald-200/75 text-emerald-950' : 'bg-white/80 text-slate-800'}`}>
      <p className={`${total ? 'text-sm' : 'text-[13px]'} font-black`}>{label}</p>
      <p className={`${total ? 'text-base' : 'text-sm'} font-black`}>{number(value, 2)} บาท</p>
    </div>
  );
}

function SummaryInfo({ label, value, tone = 'slate' }) {
  const cls = {
    slate: 'border-slate-100 bg-slate-50 text-slate-900',
    blue: 'border-blue-100 bg-blue-50 text-blue-950',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-950',
    danger: 'border-rose-200 bg-rose-50 text-rose-950',
    dark: 'border-slate-200 bg-slate-950 text-white',
  }[tone] || 'border-slate-100 bg-slate-50 text-slate-900';
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <p className={`text-[11px] font-black ${tone === 'dark' ? 'text-slate-300' : 'text-slate-400'}`}>{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-5 md:text-base">{value || '-'}</p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-slate-900">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-5 md:text-base">{value || '-'}</p>
    </div>
  );
}

function MiniLine({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2"><Icon size={16} className="shrink-0 text-blue-600" /><div className="min-w-0"><p className="truncate text-[11px] font-black text-slate-400">{label}</p><p className="truncate text-sm font-black text-slate-800">{value}</p></div></div>;
}

function PhotoGroup({ label, paths }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-600">{label}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">{paths.length} ไฟล์</span>
      </div>
      {paths.length ? (
        <div className="grid grid-cols-3 gap-2">
          {paths.map((path, index) => <PhotoThumb key={`${path}-${index}`} path={path} index={index} />)}
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-300">
          ยังไม่มีรูป
        </div>
      )}
    </div>
  );
}

function RouteStepBadge({ mode = 'origin', value }) {
  const isDestination = mode === 'destination';
  const label = isDestination ? 'ลงงาน' : 'ขึ้นงาน';
  const fallback = isDestination ? 'ไม่ระบุจุดลงงาน' : 'ไม่ระบุจุดขึ้นงาน';
  const tone = isDestination ? 'bg-emerald-50 text-emerald-800 ring-emerald-100' : 'bg-blue-50 text-blue-800 ring-blue-100';
  const valueText = hasValue(value) ? value : fallback;
  return (
    <div className={`rounded-2xl px-3 py-2.5 ring-1 ${tone}`}>
      <p className="text-[11px] font-black uppercase tracking-[.14em]">{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-5">{valueText}</p>
    </div>
  );
}

function PhotoThumb({ path, index, small = false }) {
  const href = uploadUrl(path);
  const sizeClass = small ? 'h-14 w-14 shrink-0' : 'aspect-square';
  if (isPdf(path)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`group relative flex ${sizeClass} items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100`}>
        <FileText size={small ? 18 : 22} />
        <ExternalLink size={12} className="absolute opacity-0 transition group-hover:opacity-100" />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`group relative block ${sizeClass} overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200`}>
      <img src={href} alt={`รูปแนบ ${index + 1}`} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
      <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-black text-white">{index + 1}</span>
    </a>
  );
}
