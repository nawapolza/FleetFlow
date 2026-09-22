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
  return kg > 0 ? `${number(kg, Number.isInteger(kg) ? 0 : 2)} กิโลกรัม` : '-';
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
  const fillDateText = `${date(row.fill_date || row.work_date)}${row.fill_time ? ` เวลา ${row.fill_time}` : ''}`;
  const distance = distanceValue(row);
  const fuelRate = efficiency(row);
  const expectedRate = expectedEfficiency(row);
  const estimatedDistance = estimatedDistanceValue(row);
  const liters = litersValue(row);
  const standardLiters = standardLitersValue(row);
  const varianceLiters = varianceLitersValue(row);
  const varianceBaht = hasValue(row?.fuel_variance_baht)
    ? round2(row.fuel_variance_baht)
    : round2(varianceLiters * parseDecimal(row?.price_baht_per_liter || row?.price_per_liter, 0));
  const jobs = jobsFor(row);
  const tripFee = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'trip_fee_baht'), 0), 2) || incomeValue(row, 'trip_fee_baht');
  const allowance = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'allowance_baht'), 0), 2) || incomeValue(row, 'allowance_baht');
  const otherIncome = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'other_income_baht'), 0), 2) || incomeValue(row, 'other_income_baht');
  const totalIncome = totalIncomeValue(row);
  const routeSummary = routeSummaryText(row);
  const groups = [
    { label: 'รูปบิล', paths: photosFor(row, 'bill_photos', 'bill_photo', 'receipt_photo') },
    { label: 'รูปเอกสาร', paths: photosFor(row, 'document_photos', 'document_photo') },
    { label: 'รูปเกี่ยวกับน้ำมัน', paths: photosFor(row, 'oil_photos', 'oil_photo') },
    { label: 'รูปบรรทุก', paths: photosFor(row, 'cargo_photos', 'cargo_photo') },
    { label: 'รูปแอดบลู', paths: photosFor(row, 'adblue_photos', 'adblue_photo') },
  ];
  const allPhotos = groups.flatMap((group) => group.paths);

  return (
    <article className="receipt-card overflow-hidden rounded-[2rem] border border-violet-100 bg-[linear-gradient(180deg,#fff_0%,#fdf9ff_55%,#f8fbff_100%)] shadow-[0_24px_80px_rgba(124,58,237,.10)]">
      <div className="border-b border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,.95),rgba(236,254,255,.9))] p-4 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.5rem] border border-white/80 bg-white/90 text-lg font-black tracking-[0.28em] text-violet-700 shadow-sm">TS</div>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black uppercase tracking-[.24em] text-violet-700">TEST SYSTEM</span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Receipt View</span>
                </div>
                <h3 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">ใบสรุปรายการ</h3>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">ดีไซน์ใหม่โทนพาสเทลสำหรับดูรายละเอียดงาน น้ำมัน รายได้ และเอกสารแนบในหน้าเดียว</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.3fr_.7fr]">
              <div className="rounded-[1.5rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="max-w-full truncate text-3xl font-black tracking-tight text-slate-950">{row.plate_no || 'ไม่ระบุทะเบียน'}</h4>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{row.item_type || '-'}</span>
                  {row.operation_type && <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">{row.operation_type}</span>}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[.14em] text-slate-400">คนขับ</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{row.driver_name || row.driver_name_input || '-'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[.14em] text-slate-400">วันที่ / เวลาเติม</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{fillDateText}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-[11px] font-black uppercase tracking-[.14em] text-slate-400">เส้นทางหลัก</p>
                    <p className="mt-1 text-sm font-black leading-6 text-slate-900">{routeSummary}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-violet-100 bg-white/80 p-4 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[.16em] text-violet-600">ภาพรวม</p>
                <div className="mt-3 grid gap-2">
                  <SummaryInfo label="จำนวนงาน" value={`${jobs.length} งาน`} tone="dark" />
                  <SummaryInfo label="ระยะทางรวม" value={distance ? `${number(distance, 2)} กม.` : '-'} tone="blue" />
                  <SummaryInfo label="ลิตรเติมจริง" value={liters ? `${number(liters, 2)} ลิตร` : '-'} tone="green" />
                </div>
              </div>
            </div>
          </div>

          {(onEdit || onDelete) && (
            <div className="flex gap-2 print:hidden xl:flex-col xl:pt-1">
              {onEdit && <button type="button" className="btn-soft flex-1" onClick={onEdit}><Edit size={16} /> แก้ไข</button>}
              {onDelete && <button type="button" className="btn-danger flex-1" onClick={onDelete}><Trash2 size={16} /> ลบ</button>}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryInfo label="ค่าใช้จ่ายเติมจริง" value={money(displayAmountValue(row))} tone="blue" />
          <SummaryInfo label="ราคาน้ำมัน / ลิตร" value={priceText(row)} tone="blue" />
          <SummaryInfo label="ลิตรมาตรฐาน" value={`${number(standardLiters, 2)} ลิตร`} tone="green" />
          <SummaryInfo label="ส่วนต่างจากมาตรฐาน" value={`${varianceLiters > 0 ? '+' : ''}${number(varianceLiters, 2)} ลิตร · ${money(varianceBaht)}`} tone={varianceLiters > 0 ? 'danger' : 'green'} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-[1.6rem] border border-cyan-100 bg-cyan-50/55 p-4">
            <div className="mb-3 flex items-center gap-2">
              <PackageCheck size={18} className="text-cyan-700" />
              <div>
                <p className="text-sm font-black text-slate-900">รายการงานทั้งหมด</p>
                <p className="text-xs font-bold text-slate-500">แยกตามงาน พร้อมต้นทาง ปลายทาง น้ำหนัก และรายได้</p>
              </div>
            </div>
            <div className="space-y-3">
              {jobs.map((job, index) => <JobSummaryBlock key={job.id || index} job={job} index={index} />)}
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Banknote size={18} className="text-emerald-700" />
              <div>
                <p className="text-sm font-black text-slate-900">สรุปรายได้</p>
                <p className="text-xs font-bold text-slate-500">รวมค่าเที่ยว เบี้ยเลี้ยง และรายได้อื่น</p>
              </div>
            </div>
            <div className="space-y-2">
              <ReceiptIncomeLine label="ค่าเที่ยว" value={tripFee} />
              <ReceiptIncomeLine label="เบี้ยเลี้ยง" value={allowance} />
              {otherIncome > 0 && <ReceiptIncomeLine label="รายได้อื่น" value={otherIncome} />}
              <ReceiptIncomeLine label="รวมรายได้" value={totalIncome} total />
            </div>

            <div className="mt-4 rounded-[1.35rem] border border-white/80 bg-white/85 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <MiniLine icon={Route} label="ระยะทางที่กรอก" value={distance ? `${number(distance, 2)} กม.` : '-'} />
                <MiniLine icon={Gauge} label="อัตราประจำรถ" value={expectedRate ? `${number(expectedRate, 2)} กม./ลิตร` : '-'} />
                <MiniLine icon={Gauge} label="อัตราที่ใช้จริง" value={fuelRate ? `${number(fuelRate, 2)} กม./ลิตร` : '-'} />
                <MiniLine icon={Camera} label="รูปแนบ" value={`${allPhotos.length} ไฟล์`} />
              </div>
            </div>
          </section>
        </div>

        <details className="group overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-black text-slate-700">
            <span>รายละเอียดเพิ่มเติม / เอกสารแนบ</span>
            <ChevronDown size={18} className="transition group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Info label="เลขมิเตอร์หัวจ่ายก่อนเติม" value={meterText(row.station_meter_before || row.odometer_before)} />
              <Info label="เลขมิเตอร์หัวจ่ายหลังเติม" value={meterText(row.station_meter_after || row.odometer_after)} />
              <Info label="ระยะทางย้อนตรวจสอบ" value={estimatedDistance ? `${number(estimatedDistance, 2)} กม.` : '-'} />
              <Info label="ชื่อผู้กรอก" value={row.recorder_name || row.employee_name || '-'} />
              <Info label="ชื่อผู้เติม" value={row.filler_name || '-'} />
              <Info label="เบอร์รถ" value={row.vehicle_no || '-'} />
              <Info label="สูตรคำนวณจำนวนลิตร" value={distance && expectedRate ? `${number(distance, 2)} ÷ ${number(expectedRate, 2)} = ${number(standardLiters, 2)} ลิตร` : '-'} />
              <Info label="สถานะการบันทึก" value="Test System" />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-black text-slate-900">รายละเอียดงานทั้งหมด ({jobs.length} งาน)</h4>
              {jobs.map((job, index) => <JobDetailCard key={job.id || index} job={job} index={index} />)}
            </div>

            {row.note && (
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
                <p className="text-[11px] font-black text-violet-700">หมายเหตุ</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-violet-950">{row.note}</p>
              </div>
            )}

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-3 md:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-black text-slate-800"><Camera size={17} className="text-violet-600" /> ไฟล์แนบแยกตามหมวด</h4>
                <span className="text-xs font-bold text-slate-400">กดรูปเพื่อเปิดดู</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {groups.map((group) => <PhotoGroup key={group.label} label={group.label} paths={group.paths} />)}
              </div>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
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
        <Info label="ค่าเที่ยว" value={money(job.trip_fee_baht)} />
        <Info label="เบี้ยเลี้ยง" value={money(job.allowance_baht)} />
        <Info label="รายได้อื่น" value={money(job.other_income_baht)} />
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
