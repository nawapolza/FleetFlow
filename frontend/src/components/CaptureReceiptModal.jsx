import { Camera, CheckCircle2, Download, FileText, Gauge, PackageCheck, Route, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { uploadUrl } from '../api.js';
import { date, money, number, parseDecimal, roundDecimal } from '../utils/format.js';
import { createReceiptImageFile, saveReceiptImageToDevice } from '../utils/receiptImage.js';
import BrandMark from './BrandMark.jsx';
import { alertSuccess, toastInfo } from '../utils/alerts.js';

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

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function isPdf(path = '') {
  return String(path).toLowerCase().split('?')[0].endsWith('.pdf');
}

function litersValue(row) {
  return roundDecimal(
    row?.actual_filled_liters
      || row?.quantity_liters
      || row?.station_liters
      || row?.liters
      || row?.nozzle_liters
      || row?.station_meter_delta_liters
      || 0,
    2,
  );
}

function standardLitersValue(row) {
  return roundDecimal(row?.standard_fuel_liters || row?.recommended_fuel_liters || row?.quantity_liters || 0, 2);
}

function varianceLitersValue(row) {
  if (hasValue(row?.fuel_variance_liters)) return roundDecimal(row.fuel_variance_liters, 2);
  return roundDecimal(litersValue(row) - standardLitersValue(row), 2);
}

function efficiencyValue(row) {
  const saved = parseDecimal(row?.fuel_efficiency_km_per_liter, 0);
  if (saved > 0) return saved;
  const distance = parseDecimal(row?.distance_km, 0);
  const liters = litersValue(row);
  return distance > 0 && liters > 0 ? roundDecimal(distance / liters, 2) : 0;
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
  return expected > 0 ? expected : stored;
}

function incomeValue(row, key) {
  return Math.max(0, roundDecimal(parseDecimal(row?.[key], 0), 2));
}

function totalIncomeValue(row) {
  const jobsTotal = jobsFor(row).reduce((sum, job) => sum + jobIncomeValue(job), 0);
  if (jobsTotal > 0) return roundDecimal(jobsTotal, 2);
  const calculated = incomeValue(row, 'trip_fee_baht')
    + incomeValue(row, 'allowance_baht')
    + incomeValue(row, 'other_income_baht');
  return calculated > 0 ? roundDecimal(calculated, 2) : incomeValue(row, 'total_income_baht');
}

function kgText(value) {
  const kg = parseDecimal(value, 0);
  return kg > 0 ? `${number(kg, Number.isInteger(kg) ? 0 : 2)} กิโลกรัม` : '-';
}

function meterText(value) {
  if (!hasValue(value)) return '-';
  const n = parseDecimal(value, Number.NaN);
  if (!Number.isFinite(n)) return String(value);
  return number(n, 0);
}

function routePlace(value, fallback) {
  return hasValue(value) ? String(value) : fallback;
}

function jobsFor(row = {}) {
  if (Array.isArray(row.jobs) && row.jobs.length) return row.jobs;
  return [{
    id: 'legacy_job_1',
    cargo_name: row.cargo_name || '',
    origin_place: row.origin_place || '',
    destination_place: row.destination_place || '',
    load_date: row.load_date || '',
    unload_date: row.unload_date || '',
    distance_km: row.distance_km || 0,
    loading_weight_kg: row.loading_weight_kg || 0,
    unloading_weight_kg: row.unloading_weight_kg || 0,
    trip_fee_baht: row.trip_fee_baht || 0,
    allowance_baht: row.allowance_baht || 0,
    other_income_baht: row.other_income_baht || 0,
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

function buildEventDateText(dateValue, timeValue = '') {
  if (!dateValue && !timeValue) return '-';
  const dateText = date(dateValue);
  return timeValue ? `${dateText} ${timeValue}` : dateText;
}

function buildReadyMeta(row) {
  const distance = parseDecimal(row?.distance_km, 0);
  if (distance > 0) return `[ระยะทาง ${number(distance, 0)} กม.]`;
  const weight = parseDecimal(row?.loading_weight_kg, 0);
  if (weight > 0) return `[ต้นทาง ${number(weight, 0)} กิโลกรัม]`;
  return '';
}

function buildUnloadMeta(row) {
  const weight = parseDecimal(row?.unloading_weight_kg, 0);
  return weight > 0 ? `[ปลายทาง ${number(weight, 0)} กิโลกรัม]` : '';
}

export default function CaptureReceiptModal({ row, onClose }) {
  const [savingImage, setSavingImage] = useState(false);
  const [preparedFile, setPreparedFile] = useState(null);
  const [preparedUrl, setPreparedUrl] = useState('');
  const [preparingImage, setPreparingImage] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    if (!row) {
      setPreparedFile(null);
      setPreparedUrl('');
      setPreparingImage(false);
      setShowImagePreview(false);
      return undefined;
    }

    setPreparingImage(true);
    setPreparedFile(null);
    setPreparedUrl('');

    createReceiptImageFile(row)
      .then((file) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        setPreparedFile(file);
        setPreparedUrl(objectUrl);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPreparingImage(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [row]);

  if (!row) return null;

  const fillDateText = `${date(row.fill_date || row.work_date)}${row.fill_time ? ` เวลา ${row.fill_time}` : ''}`;
  const liters = litersValue(row);
  const standardLiters = standardLitersValue(row);
  const varianceLiters = varianceLitersValue(row);
  const distance = parseDecimal(row.distance_km, 0);
  const fuelRate = efficiencyValue(row);
  const before = hasValue(row?.station_meter_before) ? row.station_meter_before : row?.odometer_before;
  const after = hasValue(row?.station_meter_after) ? row.station_meter_after : row?.odometer_after;
  const jobs = jobsFor(row);
  const tripFee = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'trip_fee_baht'), 0), 2) || incomeValue(row, 'trip_fee_baht');
  const allowance = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'allowance_baht'), 0), 2) || incomeValue(row, 'allowance_baht');
  const otherIncome = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'other_income_baht'), 0), 2) || incomeValue(row, 'other_income_baht');
  const totalIncome = totalIncomeValue(row);
  const primaryJob = jobs[0] || {};
  const origin = routePlace(primaryJob.origin_place || row.origin_place, 'ไม่ระบุจุดขึ้นงาน');
  const destination = routePlace(primaryJob.destination_place || row.destination_place, 'ไม่ระบุจุดลงงาน');
  const readyDateText = buildEventDateText(
    row.unload_date || row.load_date || row.work_date || row.fill_date,
    row.fill_time,
  );
  const unloadDateText = buildEventDateText(row.unload_date || row.work_date || row.fill_date, row.fill_time);
  const readyMetaText = buildReadyMeta(row);
  const unloadMetaText = buildUnloadMeta(row);
  const photos = asArray(
    photosFor(row, 'bill_photos', 'bill_photo', 'receipt_photo'),
    photosFor(row, 'document_photos', 'document_photo'),
    photosFor(row, 'oil_photos', 'oil_photo'),
    photosFor(row, 'cargo_photos', 'cargo_photo'),
    photosFor(row, 'adblue_photos', 'adblue_photo'),
  );

  async function ensurePreparedImage() {
    if (preparedFile) return preparedFile;
    const file = await createReceiptImageFile(row);
    const objectUrl = URL.createObjectURL(file);
    setPreparedFile(file);
    setPreparedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return objectUrl;
    });
    return file;
  }

  async function saveReceiptImage() {
    try {
      setSavingImage(true);
      const file = await ensurePreparedImage();
      const result = await saveReceiptImageToDevice(row, {
        preparedFile: file,
        preferShare: true,
        allowFilePicker: true,
        previewObjectUrl: preparedUrl,
      });

      if (result.method === 'share') {
        await alertSuccess('เปิดเมนูแชร์แล้ว', 'เลือก “บันทึกรูปภาพ” หรือ “บันทึกไปยังไฟล์” บนมือถือได้ทันที');
        return;
      }

      if (result.method === 'preview') {
        if (result.objectUrl && result.objectUrl !== preparedUrl) setPreparedUrl(result.objectUrl);
        setShowImagePreview(true);
        toastInfo('แตะค้างที่รูป แล้วเลือก “บันทึกรูปภาพ” ได้เลย');
        return;
      }

      await alertSuccess('บันทึกรูปภาพเรียบร้อย', 'ไฟล์ PNG ถูกส่งไปยังโฟลเดอร์ดาวน์โหลดของเครื่องแล้ว');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setShowImagePreview(true);
      toastInfo('เปิดรูปสรุปให้แล้ว แตะค้างบนรูปเพื่อบันทึกลงมือถือ');
    } finally {
      setSavingImage(false);
    }
  }

  async function openCapturePreview() {
    try {
      setPreparingImage(true);
      await ensurePreparedImage();
      setShowImagePreview(true);
    } catch (_) {
      toastInfo('สร้างรูปสรุปไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setPreparingImage(false);
    }
  }

  function openImageInNewTab() {
    if (!preparedUrl) return;
    const opened = window.open(preparedUrl, '_blank');
    if (opened) opened.opener = null;
    else toastInfo('เบราว์เซอร์บล็อกหน้าต่างใหม่ ให้แตะค้างบนรูปแทน');
  }

  return (
    <div className="capture-modal fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="capture-modal-panel flex max-h-[96vh] max-h-[96dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-[2rem] bg-slate-100 p-2 shadow-2xl sm:p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1 print:hidden">
          <div className="flex min-w-0 items-center gap-2 text-slate-700">
            <CheckCircle2 className="shrink-0 text-emerald-400" size={22} />
            <div className="min-w-0">
              <p className="truncate text-sm font-black">บันทึกสำเร็จ — เปิดสรุปปิดงานแล้ว</p>
              <p className="truncate text-[11px] font-bold text-slate-500">หน้าแรกย่อให้แคปเห็นข้อมูลหลักครบ</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={openCapturePreview} disabled={preparingImage} className="hidden items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-black text-red-700 shadow-lg ring-1 ring-blue-100 sm:inline-flex">
              <Camera size={16} /> {preparingImage ? 'กำลังสร้าง...' : 'แคปหน้าเดียว'}
            </button>
            <button type="button" onClick={saveReceiptImage} disabled={savingImage || preparingImage} className="hidden items-center gap-1.5 rounded-2xl bg-red-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-red-600/20 sm:inline-flex">
              <Download size={16} /> {savingImage ? 'กำลังบันทึก...' : 'แชร์/บันทึกรูป'}
            </button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-lg" aria-label="ปิดใบสรุป">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[1.6rem]">
          <article className="capture-receipt overflow-hidden rounded-[1.6rem] border border-blue-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,.16)]">
            <header className="bg-gradient-to-br from-white via-red-50 to-rose-100 p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white p-1 shadow-lg ring-1 ring-violet-100 sm:h-14 sm:w-14">
                  <BrandMark compact className="h-full w-full rounded-[1rem] text-[11px] tracking-[0.28em]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-700">TEST SYSTEM</p>
                  <h2 className="mt-0.5 text-xl font-black leading-tight text-slate-950 sm:text-2xl">ใบสรุปรายการ</h2>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-500">ขึ้นงาน ลงงาน น้ำหนัก รายได้ และข้อมูลน้ำมันในรูปแบบใหม่</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">บันทึกแล้ว</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h3 className="mr-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{row.plate_no || '-'}</h3>
                <span className="badge-blue">{row.item_type || '-'}</span>
                {row.operation_type && <span className="badge-blue">{row.operation_type}</span>}
                <span className="badge-blue">{jobs.length} งาน</span>
              </div>
              <p className="mt-1.5 text-xs font-black text-slate-600 sm:text-sm">คนขับ: <span className="text-slate-950">{row.driver_name || row.driver_name_input || '-'}</span></p>
            </header>

            <div className="space-y-2.5 p-2.5 sm:p-4">
              <section className="rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  <p className="text-xs font-black text-slate-900 sm:text-sm">รายละเอียดงาน</p>
                </div>
                <div className="px-3 py-2.5">
                  <div className="relative">
                    <div className="absolute bottom-3 left-[15px] top-3 w-px bg-slate-200 sm:left-[17px]" />
                    <TimelineRow title={`พร้อมลงสินค้า (${destination})`} subtitle={readyDateText} meta={readyMetaText} />
                    <TimelineRow title={`ลงสินค้าเรียบร้อย (${destination})`} subtitle={unloadDateText} meta={unloadMetaText} />
                    <TimelineRow active title="สรุปปิดงาน" />
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[1.25rem] border border-sky-100 bg-sky-50/80 shadow-sm">
                <div className="flex items-center gap-2 border-b border-sky-100 bg-white/80 px-3 py-2.5">
                  <PackageCheck size={17} className="text-sky-700" />
                  <div>
                    <p className="text-xs font-black text-slate-900 sm:text-sm">สรุปงานทั้งหมดของรถคันนี้</p>
                    <p className="text-[10px] font-bold text-slate-500">{jobs.length} งาน · ระยะทางรวม {number(distance, 2)} กม.</p>
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="rounded-[1.1rem] bg-[#eaf4ff] p-2.5 ring-1 ring-sky-100">
                    <p className="text-[11px] font-black text-slate-900">งานทั้งหมด</p>
                    <div className="mt-1.5 space-y-2">
                      {jobs.map((job, index) => <CaptureJobBlock key={job.id || index} job={job} index={index} />)}
                    </div>

                    <p className="mt-3 text-[11px] font-black text-slate-900">รายได้รวมทุกงาน</p>
                    <div className="mt-1.5 space-y-1.5">
                      <SummaryBlueRow label="ค่าเที่ยวรวม" value={`${number(tripFee, 2)} บาท`} />
                      <SummaryBlueRow label="เบี้ยเลี้ยงรวม" value={`${number(allowance, 2)} บาท`} />
                      {otherIncome > 0 && <SummaryBlueRow label="รายได้อื่นรวม" value={`${number(otherIncome, 2)} บาท`} />}
                      <SummaryTotalRow label="รวมรายได้ทั้งหมด" value={`${number(totalIncome, 2)} บาท`} />
                    </div>

                    <p className="mt-3 text-[11px] font-black text-slate-900">น้ำมัน</p>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                      <CompactMetric label="จำนวนงาน" value={`${jobs.length} งาน`} />
                      <CompactMetric label="ระยะทาง" value={distance ? `${number(distance, 0)} กม.` : '-'} />
                      <CompactMetric label="ลิตรเติมจริง" value={liters ? `${number(liters, 2)} ลิตร` : '-'} />
                      <CompactMetric label="ยอดเงิน" value={money(displayAmountValue(row))} />
                    </div>
                  </div>
                </div>
              </section>

              <details className="group overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-black text-slate-800 sm:text-sm">
                  <span>ดูรายละเอียดน้ำมันและรูปแนบ</span>
                  <span className="text-[11px] text-blue-600 group-open:hidden">กดเปิด</span>
                  <span className="hidden text-[11px] text-blue-600 group-open:inline">กดปิด</span>
                </summary>
                <div className="space-y-2.5 border-t border-slate-100 p-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-white"><Route size={16} /></div>
                    <div>
                      <p className="text-xs font-black text-slate-900 sm:text-sm">รายละเอียดน้ำมัน</p>
                      <p className="text-[10px] font-bold text-slate-400">ข้อมูลการใช้น้ำมันและเอกสารแนบ</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <CaptureBox label="วันที่/เวลาเติม" value={fillDateText} />
                    <CaptureBox label="จำนวนงาน" value={`${jobs.length} งาน`} />
                    <CaptureBox label="ลิตรเติมจริง" value={liters ? `${number(liters, 2)} ลิตร` : '-'} tone="blue" />
                    <CaptureBox label="ลิตรมาตรฐาน" value={`${number(standardLiters, 2)} ลิตร`} tone="blue" />
                    <CaptureBox label="ส่วนต่าง" value={`${varianceLiters > 0 ? '+' : ''}${number(varianceLiters, 2)} ลิตร`} tone={varianceLiters > 0 ? 'red' : 'green'} />
                    <CaptureBox label="ค่าใช้จ่ายเติมจริง" value={money(displayAmountValue(row))} tone="blue" />
                    <CaptureBox label="ราคาน้ำมันลิตรละ" value={priceText(row)} tone="blue" />
                    <CaptureBox label="ระยะทางที่กรอก" value={distance ? `${number(distance, 2)} กม.` : '-'} />
                    <CaptureBox label="อัตราประจำรถ" value={fuelRate ? `${number(fuelRate, 2)} กม./ลิตร` : '-'} tone="blue" />
                  </div>

                  <div className="rounded-[1.1rem] border border-slate-100 bg-slate-50 p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <MiniCheck icon={Gauge} label="หัวจ่ายก่อน" value={meterText(before)} />
                      <MiniCheck icon={Gauge} label="หัวจ่ายหลัง" value={meterText(after)} />
                      <MiniCheck icon={Route} label="จริง / มาตรฐาน" value={liters ? `${number(liters, 2)} / ${number(standardLiters, 2)} ลิตร` : '-'} />
                      <MiniCheck icon={Camera} label="รูปแนบ" value={`${photos.length} ไฟล์`} />
                    </div>
                  </div>

                  <div className="rounded-[1.1rem] border border-slate-100 bg-white p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-800">รูปภาพแนบ</p>
                      <p className="text-[10px] font-bold text-slate-400">แสดง 4 รูปแรก</p>
                    </div>
                    {photos.length ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {photos.slice(0, 4).map((path, index) => <CaptureThumb key={`${path}-${index}`} path={path} index={index} />)}
                      </div>
                    ) : (
                      <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-300">ไม่มีรูปแนบ</div>
                    )}
                  </div>
                </div>
              </details>

              <div className="grid grid-cols-2 gap-2 print:hidden">
                <button type="button" onClick={openCapturePreview} disabled={preparingImage} className="btn-soft w-full text-xs sm:text-sm">
                  <Camera size={17} /> {preparingImage ? 'กำลังสร้าง...' : 'ดูรูปทั้งหน้า'}
                </button>
                <button type="button" onClick={saveReceiptImage} disabled={savingImage || preparingImage} className="btn-primary w-full text-xs sm:text-sm">
                  <Download size={17} /> {savingImage ? 'กำลังบันทึก...' : 'บันทึกลงมือถือ'}
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      {showImagePreview && preparedUrl && (
        <div className="fixed inset-0 z-[10050] flex h-screen h-[100dvh] flex-col bg-slate-950/95 p-2 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="รูปสรุปสำหรับบันทึก">
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-xl">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">รูปสรุปทั้งหน้า</p>
              <p className="truncate text-[11px] font-bold text-slate-500">iPhone: แตะค้างบนรูป → บันทึกรูปภาพ</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={openImageInNewTab} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-red-700">เต็มจอ</button>
              <button type="button" onClick={() => setShowImagePreview(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><X size={18} /></button>
            </div>
          </div>
          <div className="mx-auto mt-2 flex min-h-0 w-full max-w-[760px] flex-1 items-center justify-center overflow-auto rounded-2xl bg-slate-900/40 p-1">
            <img src={preparedUrl} alt="สรุปปิดงานทั้งหน้า" className="max-h-full max-w-full select-none object-contain shadow-2xl" />
          </div>
          <div className="mx-auto mt-2 grid w-full max-w-[760px] grid-cols-2 gap-2 pb-[max(.25rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={openImageInNewTab} className="btn-soft w-full text-xs sm:text-sm">เปิดรูปเต็มจอ</button>
            <button type="button" onClick={saveReceiptImage} disabled={savingImage} className="btn-primary w-full text-xs sm:text-sm"><Download size={17} /> แชร์/บันทึกรูป</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ title, subtitle = '', meta = '', active = false }) {
  return (
    <div className="relative flex items-start gap-3 pb-4 last:pb-0 sm:gap-4 sm:pb-5">
      <div className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-sm sm:h-9 sm:w-9 ${active ? 'bg-red-600' : 'bg-slate-500'}`}>
        {active ? <CheckCircle2 size={13} className="text-white" /> : <span className="block h-3 w-3 rounded-full bg-white" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="break-words text-xs font-black leading-5 text-slate-900 sm:text-[15px]">{title}</p>
        {subtitle && <p className="mt-0.5 break-words pl-0.5 text-[10px] font-bold leading-4 text-slate-500 sm:text-[13px]">{subtitle}{meta ? ` ${meta}` : ''}</p>}
      </div>
    </div>
  );
}

function CaptureJobBlock({ job, index }) {
  return (
    <div className="rounded-xl bg-white/85 p-2 ring-1 ring-sky-100">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black text-blue-800">งาน {index + 1}: {job.cargo_name || 'ไม่ระบุชื่องาน'}</p>
        <span className="shrink-0 text-[10px] font-black text-slate-500">{number(job.distance_km, 2)} กม.</span>
      </div>
      <div className="mt-1 space-y-1">
        <SummaryBlueRow label={`ขึ้น ${job.origin_place || '-'}`} value={kgText(job.loading_weight_kg)} />
        <SummaryBlueRow label={`ลง ${job.destination_place || '-'}`} value={kgText(job.unloading_weight_kg)} />
        <SummaryBlueRow label="รายได้งานนี้" value={`${number(jobIncomeValue(job), 2)} บาท`} />
      </div>
    </div>
  );
}

function SummaryBlueRow({ label, value }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-slate-900">
      <p className="break-words text-[11px] font-black leading-4 sm:text-[13px] sm:leading-5">{label}</p>
      <p className="shrink-0 text-right text-[11px] font-black leading-4 sm:text-[13px] sm:leading-5">{value}</p>
    </div>
  );
}

function SummaryTotalRow({ label, value }) {
  return (
    <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl bg-emerald-200/75 px-2.5 py-1.5 text-emerald-950">
      <p className="text-[11px] font-black sm:text-[13px]">{label}</p>
      <p className="text-xs font-black sm:text-[15px]">{value}</p>
    </div>
  );
}

function CompactMetric({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/80 px-1.5 py-1.5 text-center ring-1 ring-sky-100 sm:px-2 sm:py-2">
      <p className="truncate text-[9px] font-black text-slate-500 sm:text-[10px]">{label}</p>
      <p className="mt-0.5 break-words text-[9px] font-black leading-3 text-slate-900 sm:mt-1 sm:text-[11px] sm:leading-4">{value}</p>
    </div>
  );
}

function CaptureBox({ label, value, tone = 'slate' }) {
  const classes = {
    blue: 'border-blue-100 bg-blue-50 text-blue-950',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-950',
    red: 'border-rose-200 bg-rose-50 text-rose-950',
    slate: 'border-slate-100 bg-slate-50 text-slate-950',
  }[tone] || 'border-slate-100 bg-slate-50 text-slate-950';
  return (
    <div className={`rounded-xl border p-2 sm:rounded-2xl sm:p-3 ${classes}`}>
      <p className="text-[9px] font-black text-slate-400 sm:text-[11px]">{label}</p>
      <p className="mt-0.5 break-words text-[11px] font-black leading-4 sm:mt-1 sm:text-[15px] sm:leading-5">{value || '-'}</p>
    </div>
  );
}

function MiniCheck({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-100 sm:gap-2 sm:px-3 sm:py-2">
      <Icon size={15} className="shrink-0 text-blue-600" />
      <div className="min-w-0">
        <p className="truncate text-[9px] font-black text-slate-400 sm:text-[11px]">{label}</p>
        <p className="truncate text-[11px] font-black text-slate-900 sm:text-sm">{value || '-'}</p>
      </div>
    </div>
  );
}

function CaptureThumb({ path, index }) {
  const href = uploadUrl(path);
  if (isPdf(path)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center rounded-xl bg-blue-50 text-red-700 ring-1 ring-blue-100">
        <FileText size={20} />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
      <img src={href} alt={`รูปแนบ ${index + 1}`} className="h-full w-full object-cover" />
      <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-black text-white">{index + 1}</span>
    </a>
  );
}
