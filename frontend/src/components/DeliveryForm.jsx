import { ArrowDownRight, Banknote, Building2, CalendarDays, Camera, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy, ClipboardList, Clock3, Droplets, FileText, Gauge, Link2, PackageCheck, Plus, RotateCcw, Route, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadUrl } from '../api.js';
import CaptureReceiptModal from './CaptureReceiptModal.jsx';
import RouteDistancePlanner from './RouteDistancePlanner.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useBranch } from '../contexts/BranchContext.jsx';
import BrandMark from './BrandMark.jsx';
import { alertError, confirmAction, toastInfo, toastSuccess } from '../utils/alerts.js';
import { ITEM_TYPES, currentTime, money, number, parseDecimal, roundDecimal, today } from '../utils/format.js';

const DRAFT_VERSION = 'oilops_delivery_draft_v60_fuel_control';
const DEVICE_KEY = 'oilops_device_id_v13';
const DEVICE_RECORDER_KEY = 'oilops_device_recorder_name_v22';
const IMAGE_UPLOAD_MAX_WIDTH = 1800;
const IMAGE_UPLOAD_MAX_HEIGHT = 1800;
const IMAGE_UPLOAD_QUALITY = 0.82;
const IMAGE_COMPRESS_MIN_BYTES = 900 * 1024;

function createJobId() {
  return `job_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function blankJob(overrides = {}) {
  return {
    id: createJobId(),
    cargo_name: '',
    origin_place: '',
    destination_place: '',
    load_date: '',
    unload_date: '',
    distance_km: '',
    loading_weight_kg: '',
    unloading_weight_kg: '',
    cargo_stone_weight: '',
    cargo_sand_weight: '',
    trip_fee_baht: '',
    allowance_baht: '',
    other_income_baht: '',
    total_income_baht: '',
    wage_payer: '',
    payment_status: 'pending',
    note: '',
    ...overrides,
  };
}

const blank = {
  work_date: today(),
  fill_date: today(),
  fill_time: currentTime(),
  operation_type: 'ทำน้ำมันบรรทุก',
  item_type: 'ดีเซล',
  plate_no: '',
  vehicle_no: '',
  driver_name: '',
  filler_name: '',
  recorder_name: '',
  odometer_before: '',
  odometer_after: '',
  distance_km: '',
  expected_fuel_efficiency_km_per_liter: '',
  estimated_distance_km: '',
  recommended_fuel_liters: '',
  calculation_mode: 'distance_to_liters',
  actual_filled_liters: '',
  quantity_liters: '',
  price_baht_per_liter: '',
  amount_baht: '',
  origin_place: '',
  destination_place: '',
  load_date: '',
  unload_date: '',
  cargo_name: '',
  loading_weight_kg: '',
  unloading_weight_kg: '',
  cargo_stone_weight: '',
  cargo_sand_weight: '',
  trip_fee_baht: '',
  allowance_baht: '',
  other_income_baht: '',
  total_income_baht: '',
  wage_payer: '',
  payment_status: 'pending',
  jobs: [blankJob()],
  note: '',
  gps_origin_lat: '',
  gps_origin_lon: '',
  gps_destination_lat: '',
  gps_destination_lon: '',
  gps_route_provider: '',
  gps_calculated_at: '',
};

const emptyBillFields = {
  bill_no: '',
  oil_bill_no: '',
  work_bill_no: '',
  document_no: '',
  stone_bill_no: '',
  sand_bill_no: '',
  diesel_bill_no: '',
  engine_oil_bill_no: '',
  adblue_bill_no: '',
};

function jobHasData(job = {}) {
  return Boolean(
    job.cargo_name || job.origin_place || job.destination_place || job.wage_payer || job.note ||
    job.load_date || job.unload_date ||
    decimalNumber(job.distance_km, 0) > 0 ||
    decimalNumber(job.loading_weight_kg, 0) > 0 ||
    decimalNumber(job.unloading_weight_kg, 0) > 0 ||
    decimalNumber(job.cargo_stone_weight, 0) > 0 ||
    decimalNumber(job.cargo_sand_weight, 0) > 0 ||
    decimalNumber(job.trip_fee_baht, 0) > 0 ||
    decimalNumber(job.allowance_baht, 0) > 0 ||
    decimalNumber(job.other_income_baht, 0) > 0
  );
}

function normalizeJobForForm(job = {}, index = 0) {
  return blankJob({
    ...job,
    id: job.id || job.client_id || `job_saved_${index + 1}_${Date.now()}`,
    payment_status: job.payment_status || 'pending',
    note: job.note || job.job_note || '',
  });
}

function jobsFromData(data = {}) {
  if (Array.isArray(data.jobs) && data.jobs.length) {
    return data.jobs.map((job, index) => normalizeJobForForm(job, index));
  }
  const legacy = normalizeJobForForm({
    cargo_name: data.cargo_name || '',
    origin_place: data.origin_place || '',
    destination_place: data.destination_place || '',
    load_date: data.load_date || '',
    unload_date: data.unload_date || '',
    distance_km: data.distance_km || '',
    loading_weight_kg: data.loading_weight_kg || '',
    unloading_weight_kg: data.unloading_weight_kg || '',
    cargo_stone_weight: data.cargo_stone_weight || '',
    cargo_sand_weight: data.cargo_sand_weight || '',
    trip_fee_baht: data.trip_fee_baht || '',
    allowance_baht: data.allowance_baht || '',
    other_income_baht: data.other_income_baht || '',
    total_income_baht: data.total_income_baht || '',
    wage_payer: data.wage_payer || '',
    payment_status: data.payment_status || 'pending',
  }, 0);
  return [legacy];
}

function summarizeJobs(jobs = []) {
  const activeJobs = (Array.isArray(jobs) ? jobs : []).filter(jobHasData);
  const summary = activeJobs.reduce((acc, job) => {
    acc.distance += Math.max(0, decimalNumber(job.distance_km, 0));
    acc.tripFee += Math.max(0, decimalNumber(job.trip_fee_baht, 0));
    acc.allowance += Math.max(0, decimalNumber(job.allowance_baht, 0));
    acc.otherIncome += Math.max(0, decimalNumber(job.other_income_baht, 0));
    return acc;
  }, { distance: 0, tripFee: 0, allowance: 0, otherIncome: 0 });
  summary.distance = roundMoneyLike(summary.distance, 2);
  summary.tripFee = roundMoneyLike(summary.tripFee, 2);
  summary.allowance = roundMoneyLike(summary.allowance, 2);
  summary.otherIncome = roundMoneyLike(summary.otherIncome, 2);
  summary.totalIncome = roundMoneyLike(summary.tripFee + summary.allowance + summary.otherIncome, 2);
  summary.count = activeJobs.length;
  return summary;
}

function normalizedJobsForSubmit(jobs = []) {
  return (Array.isArray(jobs) ? jobs : [])
    .filter(jobHasData)
    .map((job, index) => {
      const tripFee = roundMoneyLike(Math.max(0, decimalNumber(job.trip_fee_baht, 0)), 2);
      const allowance = roundMoneyLike(Math.max(0, decimalNumber(job.allowance_baht, 0)), 2);
      const otherIncome = roundMoneyLike(Math.max(0, decimalNumber(job.other_income_baht, 0)), 2);
      return {
        ...job,
        id: job.id || `job_${index + 1}`,
        job_no: index + 1,
        distance_km: roundMoneyLike(Math.max(0, decimalNumber(job.distance_km, 0)), 2),
        loading_weight_kg: roundMoneyLike(Math.max(0, decimalNumber(job.loading_weight_kg, 0)), 2),
        unloading_weight_kg: roundMoneyLike(Math.max(0, decimalNumber(job.unloading_weight_kg, 0)), 2),
        cargo_stone_weight: roundMoneyLike(Math.max(0, decimalNumber(job.cargo_stone_weight, 0)), 2),
        cargo_sand_weight: roundMoneyLike(Math.max(0, decimalNumber(job.cargo_sand_weight, 0)), 2),
        trip_fee_baht: tripFee,
        allowance_baht: allowance,
        other_income_baht: otherIncome,
        total_income_baht: roundMoneyLike(tripFee + allowance + otherIncome, 2),
        payment_status: job.payment_status || 'pending',
      };
    });
}

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `device_${crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) {
    return 'device_local';
  }
}

function getDeviceRecorderName(user) {
  try {
    const saved = localStorage.getItem(DEVICE_RECORDER_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch (_) {}
  return user?.name || user?.username || '';
}

function saveDeviceRecorderName(value) {
  try {
    const clean = String(value || '').trim();
    if (clean) localStorage.setItem(DEVICE_RECORDER_KEY, clean);
  } catch (_) {}
}

function hasDraftData(data = {}) {
  return Boolean(
    data.plate_no ||
    data.driver_name ||
    data.actual_filled_liters ||
    data.quantity_liters ||
    data.amount_baht ||
    data.distance_km ||
    data.expected_fuel_efficiency_km_per_liter ||
    data.odometer_before ||
    data.odometer_after ||
    data.origin_place ||
    data.destination_place ||
    data.loading_weight_kg ||
    data.unloading_weight_kg ||
    data.trip_fee_baht ||
    data.allowance_baht ||
    data.other_income_baht ||
    (Array.isArray(data.jobs) && data.jobs.some(jobHasData)) ||
    data.note,
  );
}

function formatSavedTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return '';
  }
}

function formatFileSize(bytes = 0) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}


function isLikelyImageFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(name);
}

function isLikelyPdfFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return type.includes('pdf') || /\.pdf$/i.test(name);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านไฟล์รูปภาพนี้ไม่ได้ กรุณาเลือกเป็น JPG/PNG หรือถ่ายรูปใหม่'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function compressImageFile(file) {
  if (!file || !isLikelyImageFile(file)) return file;
  if (file.type === 'image/gif') return file;

  let image;
  try {
    image = await loadImageElement(file);
  } catch (error) {
    // ถ้าเป็น HEIC/ไฟล์แปลกที่ browser อ่านไม่ได้ ให้ส่งไฟล์เดิมไปก่อน
    // Backend เพิ่ม limit ไว้สูงขึ้นแล้ว แต่ถ้า platform รับไม่ได้จะแจ้ง error ที่เข้าใจง่าย
    return file;
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return file;

  const scale = Math.min(1, IMAGE_UPLOAD_MAX_WIDTH / width, IMAGE_UPLOAD_MAX_HEIGHT / height);
  if (scale >= 1 && file.size <= IMAGE_COMPRESS_MIN_BYTES) return file;

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_UPLOAD_QUALITY);
  if (!blob) return file;
  if (blob.size >= file.size && file.size <= 20 * 1024 * 1024) return file;

  const baseName = String(file.name || 'photo').replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function prepareUploadFile(file) {
  if (!file) return file;
  if (isLikelyImageFile(file)) return compressImageFile(file);
  return file;
}


function decimalNumber(value, defaultValue = 0) {
  return parseDecimal(value, defaultValue);
}

function roundMoneyLike(value, digits = 2) {
  return roundDecimal(value, digits);
}

export default function DeliveryForm({ initialData = null, onSaved = null }) {
  const { user } = useAuth();
  const { activeBranch } = useBranch();
  const [form, setForm] = useState(blank);
  const [files, setFiles] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState(null);
  const [draftInfo, setDraftInfo] = useState({ restored: false, savedAt: '', deviceId: '' });
  const [expandedJobIds, setExpandedJobIds] = useState([]);
  const formReadyRef = useRef(false);

  const draftKey = useMemo(() => {
    const deviceId = getDeviceId();
    const userKey = user?.id || user?.username || 'shared-user';
    return `${DRAFT_VERSION}:${activeBranch?.id || 'branch'}:${deviceId}:${userKey}`;
  }, [activeBranch?.id, user?.id, user?.username]);

  const jobsSummary = useMemo(() => summarizeJobs(form.jobs), [form.jobs]);

  const effectiveDistance = useMemo(() => {
    // v58: ถ้าแยกระยะทางรายงาน ให้รวมทุกงานอัตโนมัติ ถ้ายังไม่แยกให้ใช้ระยะทางรวมเดิม
    if (jobsSummary.distance > 0) return jobsSummary.distance;
    return Math.max(0, roundMoneyLike(decimalNumber(form.distance_km, 0), 2));
  }, [form.distance_km, jobsSummary.distance]);

  const expectedFuelEfficiency = useMemo(() => {
    return Math.max(0, roundMoneyLike(decimalNumber(form.expected_fuel_efficiency_km_per_liter, 0), 2));
  }, [form.expected_fuel_efficiency_km_per_liter]);

  const selectedVehicle = useMemo(() => {
    const plate = String(form.plate_no || '').trim().toLowerCase();
    return vehicles.find((vehicle) => (
      (form.vehicle_id && String(vehicle.id) === String(form.vehicle_id)) ||
      (plate && String(vehicle.plate_no || '').trim().toLowerCase() === plate)
    )) || null;
  }, [vehicles, form.vehicle_id, form.plate_no]);

  const recommendedFuelLiters = useMemo(() => {
    if (form.item_type !== 'ดีเซล') return 0;
    return effectiveDistance > 0 && expectedFuelEfficiency > 0
      ? Math.max(0, roundMoneyLike(effectiveDistance / expectedFuelEfficiency, 2))
      : 0;
  }, [effectiveDistance, expectedFuelEfficiency, form.item_type]);

  const effectiveLiters = useMemo(() => {
    // v60: ดีเซลใช้ลิตรเติมจริงเมื่อกรอก หากเว้นว่างจะใช้ลิตรตามมาตรฐานให้อัตโนมัติ
    const actual = Math.max(0, roundMoneyLike(decimalNumber(form.actual_filled_liters || form.quantity_liters, 0), 2));
    if (form.item_type === 'ดีเซล') return actual > 0 ? actual : recommendedFuelLiters;
    return Math.max(0, roundMoneyLike(decimalNumber(form.quantity_liters, 0), 2));
  }, [form.item_type, form.actual_filled_liters, form.quantity_liters, recommendedFuelLiters]);

  const estimatedDistance = useMemo(() => {
    if (form.item_type !== 'ดีเซล') return 0;
    return effectiveLiters > 0 && expectedFuelEfficiency > 0
      ? Math.max(0, roundMoneyLike(effectiveLiters * expectedFuelEfficiency, 2))
      : 0;
  }, [effectiveLiters, expectedFuelEfficiency, form.item_type]);

  const billTotal = useMemo(() => {
    const price = decimalNumber(form.price_baht_per_liter, 0);
    return effectiveLiters > 0 && price > 0 ? roundMoneyLike(effectiveLiters * price, 2) : 0;
  }, [effectiveLiters, form.price_baht_per_liter]);

  const standardBillTotal = useMemo(() => {
    const price = decimalNumber(form.price_baht_per_liter, 0);
    const standardLiters = form.item_type === 'ดีเซล' ? recommendedFuelLiters : effectiveLiters;
    return standardLiters > 0 && price > 0 ? roundMoneyLike(standardLiters * price, 2) : 0;
  }, [effectiveLiters, form.item_type, form.price_baht_per_liter, recommendedFuelLiters]);

  const fuelVarianceLiters = useMemo(() => {
    if (form.item_type !== 'ดีเซล' || recommendedFuelLiters <= 0) return 0;
    return roundMoneyLike(effectiveLiters - recommendedFuelLiters, 2);
  }, [effectiveLiters, form.item_type, recommendedFuelLiters]);

  const fuelVarianceBaht = useMemo(() => roundMoneyLike(billTotal - standardBillTotal, 2), [billTotal, standardBillTotal]);

  const avgPrice = useMemo(() => {
    const amount = decimalNumber(form.amount_baht, 0);
    return effectiveLiters > 0 && amount > 0 ? roundMoneyLike(amount / effectiveLiters, 2) : 0;
  }, [effectiveLiters, form.amount_baht]);

  const fuelEfficiency = useMemo(() => {
    return effectiveDistance > 0 && effectiveLiters > 0 ? roundMoneyLike(effectiveDistance / effectiveLiters, 2) : 0;
  }, [effectiveDistance, effectiveLiters]);

  const totalIncome = useMemo(() => {
    if (jobsSummary.count > 0) return jobsSummary.totalIncome;
    return roundMoneyLike(
      decimalNumber(form.trip_fee_baht, 0) +
      decimalNumber(form.allowance_baht, 0) +
      decimalNumber(form.other_income_baht, 0),
      2,
    );
  }, [form.trip_fee_baht, form.allowance_baht, form.other_income_baht, jobsSummary]);

  useEffect(() => {
    formReadyRef.current = false;
    const fallbackPrice = initialData?.price_baht_per_liter || initialData?.price_per_liter || '';
    const base = initialData
      ? {
          ...blank,
          ...initialData,
          ...emptyBillFields,
          plate_no: initialData.plate_no || '',
          vehicle_no: initialData.vehicle_no || '',
          driver_name: initialData.driver_name || initialData.driver_name_input || '',
          price_baht_per_liter: fallbackPrice,
          odometer_before: initialData.station_meter_before || initialData.odometer_before || '',
          odometer_after: initialData.station_meter_after || initialData.odometer_after || '',
          distance_km: initialData.distance_km || '',
          expected_fuel_efficiency_km_per_liter:
            initialData.expected_fuel_efficiency_km_per_liter ||
            initialData.vehicle_fuel_efficiency_km_per_liter ||
            initialData.fuel_efficiency_km_per_liter ||
            '',
          estimated_distance_km: initialData.estimated_distance_km || '',
          recommended_fuel_liters: initialData.recommended_fuel_liters || initialData.standard_fuel_liters || '',
          actual_filled_liters: initialData.actual_filled_liters || initialData.quantity_liters || '',
          quantity_liters: initialData.quantity_liters || '',
          calculation_mode: initialData.calculation_mode || 'distance_to_liters',
          jobs: jobsFromData(initialData),
        }
      : { ...blank, jobs: [blankJob()], recorder_name: getDeviceRecorderName(user) };

    if (!initialData?.id) {
      try {
        const raw = localStorage.getItem(draftKey);
        const draft = raw ? JSON.parse(raw) : null;
        if (draft?.form && hasDraftData(draft.form)) {
          const restoredJobs = jobsFromData(draft.form);
          setForm({ ...base, ...draft.form, jobs: restoredJobs, recorder_name: draft.form.recorder_name || base.recorder_name });
          setExpandedJobIds(restoredJobs.slice(0, 1).map((job) => job.id));
          setDraftInfo({ restored: true, savedAt: draft.savedAt || '', deviceId: getDeviceId().slice(-8) });
          setFiles({});
          setTimeout(() => toastSuccess('กู้ข้อมูลร่างของเครื่องนี้ให้แล้ว'), 250);
          formReadyRef.current = true;
          return;
        }
      } catch (_) {
        // ถ้าข้อมูลร่างเสีย ให้เริ่มฟอร์มใหม่โดยไม่ทำให้ระบบพัง
      }
    }

    setForm(base);
    setExpandedJobIds((base.jobs || []).slice(0, 1).map((job) => job.id));
    setFiles({});
    setDraftInfo({ restored: false, savedAt: '', deviceId: getDeviceId().slice(-8) });
    setTimeout(() => { formReadyRef.current = true; }, 0);
  }, [initialData, draftKey, user?.name, user?.username]);

  useEffect(() => {
    api.vehicleOptions?.().then((res) => setVehicles(res.data || [])).catch(() => setVehicles([]));
  }, []);

  useEffect(() => {
    if (initialData?.id || !vehicles.length || !form.plate_no) return;
    const plate = String(form.plate_no || '').trim().toLowerCase();
    const found = vehicles.find((vehicle) => String(vehicle.plate_no || '').trim().toLowerCase() === plate);
    if (!found) return;
    const vehicleRate = found.fuel_efficiency_km_per_liter || '';
    setForm((old) => {
      const nextRate = vehicleRate ? String(vehicleRate) : '';
      if (
        String(old.vehicle_id || '') === String(found.id || '') &&
        String(old.expected_fuel_efficiency_km_per_liter || '') === nextRate
      ) return old;
      return {
        ...old,
        vehicle_id: found.id || '',
        vehicle_no: found.vehicle_no || old.vehicle_no || '',
        driver_name: found.driver_name || old.driver_name || '',
        expected_fuel_efficiency_km_per_liter: nextRate,
      };
    });
  }, [vehicles, form.plate_no, initialData?.id]);

  useEffect(() => {
    if (initialData?.id || !formReadyRef.current) return;
    if (!hasDraftData(form)) return;
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        localStorage.setItem(draftKey, JSON.stringify({ form, savedAt }));
        setDraftInfo((old) => ({ ...old, savedAt, deviceId: getDeviceId().slice(-8) }));
      } catch (_) {
        // localStorage เต็มหรือปิดไว้ ไม่ต้องหยุดการใช้งานหลัก
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form, draftKey, initialData?.id]);

  useEffect(() => {
    const hasData = hasDraftData(form);
    function beforeUnload(event) {
      if (!hasData || initialData?.id) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [form, initialData?.id]);

  function setField(key, value) {
    if (key === 'recorder_name') saveDeviceRecorderName(value);
    setForm((old) => ({ ...old, [key]: value }));
  }

  function setJobField(index, key, value) {
    setForm((old) => ({
      ...old,
      jobs: old.jobs.map((job, jobIndex) => (jobIndex === index ? { ...job, [key]: value } : job)),
    }));
  }

  function applyGpsRoute(routeData) {
    const distance = roundMoneyLike(decimalNumber(routeData?.distance_km, 0), 2);
    if (!distance) return;
    const rate = decimalNumber(form.expected_fuel_efficiency_km_per_liter, 0);
    const autoLiters = rate > 0 ? roundMoneyLike(distance / rate, 2) : 0;
    const autoCost = autoLiters > 0 ? roundMoneyLike(autoLiters * decimalNumber(form.price_baht_per_liter, 0), 2) : 0;
    setForm((old) => {
      const currentJobs = old.jobs?.length ? old.jobs : [blankJob()];
      const jobs = currentJobs.map((job, index) => index === 0 ? {
        ...job,
        origin_place: routeData.origin?.name || job.origin_place,
        destination_place: routeData.destination?.name || job.destination_place,
        distance_km: String(distance),
      } : job);
      return {
        ...old,
        distance_km: String(distance),
        jobs,
        gps_origin_lat: String(routeData.origin?.lat ?? ''),
        gps_origin_lon: String(routeData.origin?.lon ?? ''),
        gps_destination_lat: String(routeData.destination?.lat ?? ''),
        gps_destination_lon: String(routeData.destination?.lon ?? ''),
        gps_route_provider: routeData.provider || '',
        gps_calculated_at: routeData.calculated_at || '',
      };
    });
    setExpandedJobIds((ids) => [...new Set([...ids, form.jobs?.[0]?.id].filter(Boolean))]);
    toastSuccess(autoLiters > 0
      ? `GPS ${number(distance, 2)} กม. · น้ำมัน ${number(autoLiters, 2)} ลิตร${autoCost > 0 ? ` · ${money(autoCost)}` : ''}`
      : `GPS ยืนยัน ${number(distance, 2)} กม. — เลือกรถเพื่อคำนวณลิตรอัตโนมัติ`);
  }

  function addJob() {
    const jobs = form.jobs || [];
    const previous = jobs[jobs.length - 1] || {};
    const nextJob = blankJob({
      origin_place: previous.destination_place || '',
      load_date: previous.unload_date || form.work_date || '',
      unload_date: form.work_date || '',
      wage_payer: previous.wage_payer || '',
    });
    setForm((old) => ({ ...old, jobs: [...(old.jobs || []), nextJob] }));
    setExpandedJobIds((ids) => [...new Set([...ids, nextJob.id])]);
  }

  function duplicateJob(index) {
    const source = form.jobs[index] || {};
    const copy = blankJob({ ...source, id: createJobId() });
    setForm((old) => {
      const jobs = [...old.jobs];
      jobs.splice(index + 1, 0, copy);
      return { ...old, jobs };
    });
    setExpandedJobIds((ids) => [...new Set([...ids, copy.id])]);
  }

  function removeJob(index) {
    const targetId = form.jobs?.[index]?.id;
    if ((form.jobs || []).length <= 1) {
      const replacement = blankJob();
      setForm((old) => ({ ...old, jobs: [replacement] }));
      setExpandedJobIds([replacement.id]);
      return;
    }
    setForm((old) => ({ ...old, jobs: old.jobs.filter((_, jobIndex) => jobIndex !== index) }));
    if (targetId) setExpandedJobIds((ids) => ids.filter((id) => id !== targetId));
  }

  function toggleJob(jobId) {
    setExpandedJobIds((ids) => (ids.includes(jobId) ? ids.filter((id) => id !== jobId) : [...ids, jobId]));
  }

  function linkJobFromPrevious(index) {
    if (index <= 0) return;
    setForm((old) => {
      const previous = old.jobs[index - 1] || {};
      const jobs = old.jobs.map((job, jobIndex) => {
        if (jobIndex !== index) return job;
        return {
          ...job,
          origin_place: previous.destination_place || job.origin_place,
          load_date: previous.unload_date || job.load_date || old.work_date,
          wage_payer: job.wage_payer || previous.wage_payer || '',
        };
      });
      return { ...old, jobs };
    });
    toastSuccess(`เชื่อมงานที่ ${index} ไปงานที่ ${index + 1} แล้ว`);
  }

  function useWorkDateForJob(index) {
    setForm((old) => ({
      ...old,
      jobs: old.jobs.map((job, jobIndex) => (jobIndex === index
        ? { ...job, load_date: old.work_date || today(), unload_date: old.work_date || today() }
        : job)),
    }));
  }

  function scrollToSection(target) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function revealJob(jobId) {
    if (!jobId) return;
    setExpandedJobIds((ids) => [...new Set([...ids, jobId])]);
    window.setTimeout(() => document.getElementById(`delivery-${jobId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }

  function pickVehicle(plate) {
    const normalizedPlate = String(plate || '').trim().toLowerCase();
    const found = vehicles.find((vehicle) => String(vehicle.plate_no || '').trim().toLowerCase() === normalizedPlate);
    setForm((old) => ({
      ...old,
      plate_no: plate,
      vehicle_id: found?.id || '',
      vehicle_no: found?.vehicle_no || old.vehicle_no || '',
      driver_name: found?.driver_name || old.driver_name || '',
      // อัตราวิ่งถูกตั้งแยกตามรถแต่ละคัน เจ้าหน้าที่ไม่ต้องกรอกซ้ำในทุกเที่ยว
      expected_fuel_efficiency_km_per_liter: found?.fuel_efficiency_km_per_liter || '',
    }));
  }


  async function clearDraft() {
    const ok = await confirmAction('ล้างข้อมูลร่างของเครื่องนี้?', 'ล้างเฉพาะข้อมูลที่ยังไม่กดบันทึกบนเครื่องนี้เท่านั้น รายการที่บันทึกแล้วจะไม่หาย');
    if (!ok) return;
    try { localStorage.removeItem(draftKey); } catch (_) {}
    const replacementJob = blankJob();
    setForm({ ...blank, jobs: [replacementJob], work_date: today(), fill_date: today(), fill_time: currentTime(), recorder_name: getDeviceRecorderName(user) });
    setExpandedJobIds([replacementJob.id]);
    setFiles({});
    setDraftInfo((old) => ({ ...old, restored: false, savedAt: '' }));
    toastSuccess('ล้างข้อมูลร่างแล้ว');
  }

  async function buildFormData() {
    const fd = new FormData();
    Object.entries({ ...form, ...emptyBillFields }).forEach(([key, value]) => {
      if (key === 'jobs' || (value && typeof value === 'object')) return;
      fd.append(key, value ?? '');
    });

    const jobs = normalizedJobsForSubmit(form.jobs);
    const summary = summarizeJobs(jobs);
    const firstJob = jobs[0] || {};
    fd.set('jobs', JSON.stringify(jobs));
    fd.set('job_count', String(jobs.length));
    fd.set('origin_place', firstJob.origin_place || '');
    fd.set('destination_place', firstJob.destination_place || '');
    fd.set('cargo_name', firstJob.cargo_name || '');
    fd.set('load_date', firstJob.load_date || '');
    fd.set('unload_date', firstJob.unload_date || '');
    fd.set('loading_weight_kg', firstJob.loading_weight_kg || '');
    fd.set('unloading_weight_kg', firstJob.unloading_weight_kg || '');
    fd.set('cargo_stone_weight', firstJob.cargo_stone_weight || '');
    fd.set('cargo_sand_weight', firstJob.cargo_sand_weight || '');
    fd.set('trip_fee_baht', summary.tripFee ? String(summary.tripFee) : '0');
    fd.set('allowance_baht', summary.allowance ? String(summary.allowance) : '0');
    fd.set('other_income_baht', summary.otherIncome ? String(summary.otherIncome) : '0');
    fd.set('total_income_baht', summary.totalIncome ? String(summary.totalIncome) : '0');
    fd.set('wage_payer', firstJob.wage_payer || '');
    fd.set('payment_status', jobs.length && jobs.every((job) => job.payment_status === 'paid') ? 'paid' : 'pending');

    fd.set('distance_km', effectiveDistance ? String(effectiveDistance) : '');
    fd.set('expected_fuel_efficiency_km_per_liter', expectedFuelEfficiency ? String(expectedFuelEfficiency) : '');
    fd.set('estimated_distance_km', estimatedDistance ? String(estimatedDistance) : '');
    fd.set('recommended_fuel_liters', recommendedFuelLiters ? String(recommendedFuelLiters) : '');
    fd.set('standard_fuel_liters', form.item_type === 'ดีเซล' ? String(recommendedFuelLiters || effectiveLiters || '') : String(effectiveLiters || ''));
    fd.set('actual_filled_liters', effectiveLiters ? String(effectiveLiters) : '');
    fd.set('fuel_variance_liters', String(fuelVarianceLiters || 0));
    fd.set('fuel_variance_baht', String(fuelVarianceBaht || 0));
    fd.set('calculation_mode', form.item_type === 'ดีเซล' ? 'distance_to_actual_variance' : 'manual_liters');
    fd.set('nozzle_liters', '');
    fd.set('station_meter_delta_liters', '');
    fd.set('station_liters', effectiveLiters ? String(effectiveLiters) : '');
    fd.set('liters', effectiveLiters ? String(effectiveLiters) : '');
    fd.set('quantity_liters', effectiveLiters ? String(effectiveLiters) : '');
    fd.set('price_baht_per_liter', form.price_baht_per_liter || '');
    fd.set('amount_baht', billTotal ? String(billTotal) : '');

    for (const [key, selected] of Object.entries(files)) {
      const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
      for (const file of list) {
        const uploadFile = await prepareUploadFile(file);
        fd.append(key, uploadFile);
      }
    }
    return fd;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.work_date) { scrollToSection('delivery-step-3'); return alertError('กรุณาเลือกวันที่ลงรายการ'); }
    if (!form.plate_no) { scrollToSection('delivery-step-1'); return alertError('กรุณากรอกทะเบียนรถ'); }
    const activeJobs = (form.jobs || []).filter(jobHasData);
    if (form.operation_type === 'ทำน้ำมันบรรทุก' && !activeJobs.length) {
      scrollToSection('delivery-step-4');
      revealJob(form.jobs?.[0]?.id);
      return alertError('กรุณากรอกอย่างน้อย 1 งาน');
    }
    if (form.item_type === 'ดีเซล' && activeJobs.length > 1) {
      const missingDistanceIndex = activeJobs.findIndex((job) => decimalNumber(job.distance_km, 0) <= 0);
      if (missingDistanceIndex >= 0) {
        const missingJob = activeJobs[missingDistanceIndex];
        revealJob(missingJob?.id);
        return alertError(`กรุณากรอกระยะทางของงานที่ ${missingDistanceIndex + 1} เพื่อให้ระบบรวมระยะทางถูกต้อง`);
      }
    }
    if (form.item_type === 'ดีเซล' && (!effectiveDistance || effectiveDistance <= 0)) { scrollToSection('delivery-step-2'); return alertError('กรุณากรอกระยะทางรวม หรือกรอกระยะทางแยกในแต่ละงาน'); }
    if (form.item_type !== 'ดีเซล' && (!effectiveLiters || effectiveLiters <= 0)) { scrollToSection('delivery-step-2'); return alertError('กรุณากรอกจำนวนลิตร'); }
    if (!decimalNumber(form.price_baht_per_liter, 0)) { scrollToSection('delivery-step-2'); return alertError('กรุณากรอกราคาน้ำมันลิตรละ'); }
    if (form.item_type === 'ดีเซล' && (!expectedFuelEfficiency || expectedFuelEfficiency <= 0)) {
      scrollToSection('delivery-step-1');
      return alertError('รถคันนี้ยังไม่ได้ตั้งอัตราประจำรถ กรุณาให้เจ้าของระบบตั้งครั้งเดียวที่เมนู “รถและคนขับ” แล้วกลับมาเลือกทะเบียนรถอีกครั้ง');
    }

    if (effectiveLiters >= 280) {
      const ok = await confirmAction('ปริมาณลิตรสูงกว่าปกติ', `รายการนี้ ${number(effectiveLiters, 2)} ลิตร ต้องการบันทึกต่อใช่ไหม`);
      if (!ok) return;
    }
    if (expectedFuelEfficiency > 0 && (expectedFuelEfficiency < 0.5 || expectedFuelEfficiency > 8)) {
      const ok = await confirmAction('ตรวจสอบอัตราประจำรถ กม./ลิตร', `ตั้งค่าไว้ ${number(expectedFuelEfficiency, 2)} กม./ลิตร เมื่อกรอกระยะทาง ${number(effectiveDistance, 2)} กม. ระบบคำนวณน้ำมันได้ ${number(effectiveLiters, 2)} ลิตร ต้องการบันทึกต่อใช่ไหม`);
      if (!ok) return;
    }
    if (fuelEfficiency > 0 && (fuelEfficiency < 0.5 || fuelEfficiency > 8)) {
      const ok = await confirmAction('ตรวจสอบอัตราสิ้นเปลืองจริง กม./ลิตร', `จากระยะทางจริง ระบบคำนวณได้ ${number(fuelEfficiency, 2)} กม./ลิตร ต้องการบันทึกต่อใช่ไหม`);
      if (!ok) return;
    }

    if (form.item_type === 'ดีเซล' && recommendedFuelLiters > 0 && Math.abs(fuelVarianceLiters) > Math.max(5, recommendedFuelLiters * 0.1)) {
      const direction = fuelVarianceLiters > 0 ? 'เกิน' : 'ต่ำกว่า';
      const ok = await confirmAction('ตรวจสอบลิตรเติมจริง', `ลิตรเติมจริง ${number(effectiveLiters, 2)} ลิตร ${direction}มาตรฐาน ${number(Math.abs(fuelVarianceLiters), 2)} ลิตร (${money(Math.abs(fuelVarianceBaht))}) ต้องการบันทึกต่อใช่ไหม`);
      if (!ok) return;
    }

    const selectedFileCount = Object.values(files || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    setLoading(true);
    try {
      if (selectedFileCount > 0) toastInfo('กำลังปรับขนาดรูปภาพก่อนอัปโหลด...');
      saveDeviceRecorderName(form.recorder_name);
      const fd = await buildFormData();
      const savedRes = initialData?.id ? await api.updateDelivery(initialData.id, fd) : await api.createDelivery(fd);
      const savedDelivery = savedRes?.data || null;
      try { localStorage.removeItem(draftKey); } catch (_) {}
      if (!initialData?.id) {
        const replacementJob = blankJob();
        setForm({ ...blank, jobs: [replacementJob], work_date: today(), fill_date: today(), fill_time: currentTime(), recorder_name: getDeviceRecorderName(user) });
        setExpandedJobIds([replacementJob.id]);
      }
      setFiles({});
      setDraftInfo((old) => ({ ...old, restored: false, savedAt: '' }));
      if (savedDelivery) {
        setSavedReceipt(savedDelivery);
      }
    } catch (err) {
      alertError(err, 'บันทึกรายการไม่ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mobile-form-card app-form-card">
        <header className="app-form-hero">
          <div className="form-hero-copy">
            <div className="form-hero-brand">
              <div className="capture-header-logo">
                <BrandMark compact className="h-full w-full rounded-[1.2rem] text-[11px] tracking-[0.28em]" />
              </div>
              <div className="min-w-0">
                <div className="form-hero-eyebrow"><ShieldCheck size={14} /> บันทึกร่างอัตโนมัติ</div>
                <h2>{initialData?.id ? 'แก้ไขรายการ Test System' : 'บันทึกรายการ Test System'}</h2>
                <p>ฟอร์มงานขนส่งโฉมใหม่ โทนพาสเทล เรียบหรู ทันสมัย และอ่านง่ายทั้งบนมือถือและเดสก์ท็อป</p>
              </div>
            </div>
          </div>

          <div className="form-branch-badge"><Building2 size={18} /><span><small>รายการนี้จะบันทึกเข้าสาขา</small><strong>{activeBranch?.name || 'กำลังเลือกสาขา'}</strong></span><em>{activeBranch?.code || '-'}</em></div>

          <div className="form-hero-summary" aria-label="สรุปข้อมูลที่กรอก">
            <Metric label="ระยะทางรวมทุกงาน" value={effectiveDistance ? `${number(effectiveDistance, 2)} กม.` : '-'} />
            <Metric label="จำนวนงาน" value={`${jobsSummary.count || 0} งาน`} />
            <Metric label="ลิตรเติมจริง" value={effectiveLiters ? `${number(effectiveLiters, 2)} ลิตร` : '-'} />
            <Metric label="ราคาต่อลิตร" value={decimalNumber(form.price_baht_per_liter, 0) ? `${number(form.price_baht_per_liter, 2)} บาท` : '-'} />
            <Metric label="อัตราประจำรถ" value={expectedFuelEfficiency ? `${number(expectedFuelEfficiency, 2)} กม./ลิตร` : 'ยังไม่ตั้งค่า'} strong />
          </div>
        </header>

        <div className="form-progress-strip" aria-label="ทางลัดไปยังขั้นตอนการกรอกข้อมูล">
          <ProgressItem no="01" icon={ClipboardList} label="รถและคนขับ" onClick={() => scrollToSection('delivery-step-1')} />
          <ProgressItem no="02" icon={Droplets} label="น้ำมันและราคา" onClick={() => scrollToSection('delivery-step-2')} />
          <ProgressItem no="03" icon={Clock3} label="วันและเวลา" onClick={() => scrollToSection('delivery-step-3')} />
          <ProgressItem no="04" icon={PackageCheck} label="งานและรายได้" onClick={() => scrollToSection('delivery-step-4')} />
          <ProgressItem no="05" icon={Camera} label="รูปภาพแนบ" onClick={() => scrollToSection('delivery-step-5')} />
        </div>

        <div className="app-form-body">
          <DraftNotice draftInfo={draftInfo} files={files} onClear={clearDraft} editing={Boolean(initialData?.id)} />

          <div className="form-content-stack">
            <Section no="1" id="delivery-step-1" icon={ClipboardList} title="รถและผู้ปฏิบัติงาน" subtitle="เลือกทะเบียนครั้งเดียว ระบบจะเชื่อมคนขับ เบอร์รถ และอัตราน้ำมันให้อัตโนมัติ">
              <Field className="field-featured" required label="ทะเบียนรถ" hint="ตัวอย่าง 70-0024" value={form.plate_no} onChange={pickVehicle} placeholder="กรอกหรือเลือกทะเบียนรถ" listId="vehicle-list" />
              <datalist id="vehicle-list">{vehicles.map((v) => <option key={v.id} value={v.plate_no}>{v.driver_name || v.vehicle_no || ''}</option>)}</datalist>
              <Field className="field-featured" label="คนขับ" hint="ชื่อที่จะแสดงในใบสรุป" value={form.driver_name} onChange={(v) => setField('driver_name', v)} placeholder="กรอกชื่อคนขับ" />
              <Field label="เบอร์รถ" hint="ไม่บังคับ" value={form.vehicle_no} onChange={(v) => setField('vehicle_no', v)} placeholder="เช่น 12" />
              <Select label="ประเภทน้ำมัน" hint="เลือกชนิดน้ำมัน" value={form.item_type} onChange={(v) => setField('item_type', v)} options={ITEM_TYPES} />
              <Select label="ประเภทงาน" hint="เลือกประเภทงาน" value={form.operation_type} onChange={(v) => setField('operation_type', v)} options={['ทำน้ำมันบรรทุก', 'เช็คเติมสต๊อก']} />
              <Field label="ชื่อผู้เติม" hint="ไม่บังคับ" value={form.filler_name} onChange={(v) => setField('filler_name', v)} placeholder="กรอกชื่อผู้เติม" />
              <Field className="field-wide" label="ชื่อผู้กรอก / เครื่องนี้" hint="ระบบจะจำชื่อแยกตามอุปกรณ์" value={form.recorder_name} onChange={(v) => setField('recorder_name', v)} placeholder="กรอกชื่อผู้บันทึก" />
              <VehicleLinkedStatus vehicle={selectedVehicle} plate={form.plate_no} driver={form.driver_name} rate={expectedFuelEfficiency} />
            </Section>

            <Section no="2" id="delivery-step-2" icon={Droplets} title="ระยะทาง ลิตรเติมจริง และราคา" subtitle="ระบบคำนวณลิตรมาตรฐานจากระยะทาง แล้วเปรียบเทียบกับลิตรเติมจริงเพื่อวิเคราะห์ค่าใช้จ่าย">
              <div className="field-wide col-span-full rounded-[1.35rem] border border-violet-100 bg-violet-50/65 p-4 text-sm font-semibold text-violet-950">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={18} className="mt-0.5 text-violet-700" />
                  <div>
                    <p className="font-black">โหมดกรอกระยะทางแบบ Manual</p>
                    <p className="mt-1 text-xs font-semibold leading-6 text-violet-800/80">ระบบนี้ปิดส่วนคำนวณ GPS อัตโนมัติแล้ว กรุณากรอกระยะทางรวม หรือกรอกระยะทางแยกในแต่ละงานแทน</p>
                  </div>
                </div>
              </div>
              {form.item_type === 'ดีเซล' ? (
                jobsSummary.distance > 0 ? (
                  <ReadOnlyField className="field-featured distance-result-auto" label="ระยะทางรวมจากทุกงาน" hint={`รวมอัตโนมัติจาก ${jobsSummary.count} งาน`} value={`${number(jobsSummary.distance, 2)} กม.`} />
                ) : (
                  <Field className="field-featured" required type="number" step="0.01" label="ระยะทางรวม" hint="กรณีไม่แยกระยะรายงาน กรอกยอดรวมตรงนี้ได้" value={form.distance_km} onChange={(v) => setField('distance_km', v)} suffix="กม." />
                )
              ) : (
                <Field required type="number" step="0.01" label="จำนวนลิตร" hint="กรอกจำนวนลิตรตามจริง" value={form.quantity_liters} onChange={(v) => setField('quantity_liters', v)} suffix="ลิตร" />
              )}
              <ReadOnlyField
                className={`vehicle-rate-auto ${expectedFuelEfficiency > 0 ? 'is-ready' : 'is-missing'}`}
                label="อัตราประจำรถ (ระบบเลือกให้อัตโนมัติ)"
                hint={expectedFuelEfficiency > 0
                  ? `ดึงจากทะเบียน ${selectedVehicle?.plate_no || form.plate_no || '-'} — ใช้สูตร ระยะทาง ÷ ${number(expectedFuelEfficiency, 2)}`
                  : 'ยังไม่ได้ตั้งค่า เจ้าของระบบตั้งครั้งเดียวที่เมนู รถและคนขับ เช่น รถหนัก 2.90 หรือรถคันอื่น 3.20 กม./ลิตร'}
                value={expectedFuelEfficiency > 0 ? `${number(expectedFuelEfficiency, 2)} กม./ลิตร` : 'ยังไม่ตั้งอัตราประจำรถ'}
              />
              <ReadOnlyField
                className="field-featured distance-result-auto"
                label={form.item_type === 'ดีเซล' ? 'จำนวนลิตรมาตรฐาน' : 'จำนวนลิตร'}
                hint={form.item_type === 'ดีเซล' ? 'ระยะทาง ÷ อัตราประจำรถ' : 'ใช้จำนวนลิตรที่กรอก'}
                value={form.item_type === 'ดีเซล'
                  ? (recommendedFuelLiters ? `${number(recommendedFuelLiters, 2)} ลิตร` : 'เลือกทะเบียนรถและกรอกระยะทาง')
                  : (effectiveLiters ? `${number(effectiveLiters, 2)} ลิตร` : 'กรอกจำนวนลิตร')}
              />
              {form.item_type === 'ดีเซล' && (
                <Field
                  className="field-featured actual-fuel-field"
                  type="number"
                  step="0.01"
                  label="จำนวนลิตรเติมจริง"
                  hint="เว้นว่างได้ ระบบจะใช้ลิตรมาตรฐานให้อัตโนมัติ หรือกรอกค่าจากหัวจ่าย/บิลเพื่อวิเคราะห์ส่วนต่าง"
                  value={form.actual_filled_liters}
                  onChange={(v) => setField('actual_filled_liters', v)}
                  placeholder={recommendedFuelLiters ? number(recommendedFuelLiters, 2) : 'รอคำนวณมาตรฐาน'}
                  suffix="ลิตร"
                />
              )}
              <Field required type="number" step="0.01" label="ราคาน้ำมันต่อลิตร" hint="หน่วยบาท" value={form.price_baht_per_liter} onChange={(v) => setField('price_baht_per_liter', v)} suffix="บาท" />
              <ReadOnlyField label="ยอดค่าใช้จ่ายจริง" hint="ลิตรเติมจริง × ราคาต่อลิตร" value={billTotal ? money(billTotal) : 'รอกรอกข้อมูล'} />
              {form.item_type === 'ดีเซล' && <ReadOnlyField className={fuelVarianceLiters > 0 ? 'fuel-variance-field is-over' : fuelVarianceLiters < 0 ? 'fuel-variance-field is-saving' : 'fuel-variance-field'} label="ส่วนต่างจากมาตรฐาน" hint={`ค่าใช้จ่ายมาตรฐาน ${money(standardBillTotal)}`} value={`${fuelVarianceLiters > 0 ? '+' : ''}${number(fuelVarianceLiters, 2)} ลิตร · ${fuelVarianceBaht > 0 ? '+' : ''}${money(fuelVarianceBaht)}`} />}
              <Field type="number" step="1" label="หัวจ่ายก่อนเติม" hint="เลขอ้างอิง" value={form.odometer_before} onChange={(v) => setField('odometer_before', v)} />
              <Field type="number" step="1" label="หัวจ่ายหลังเติม" hint="เลขอ้างอิง" value={form.odometer_after} onChange={(v) => setField('odometer_after', v)} />
              <CalcCard billTotal={billTotal} standardBillTotal={standardBillTotal} fuelVarianceLiters={fuelVarianceLiters} fuelVarianceBaht={fuelVarianceBaht} fuelEfficiency={fuelEfficiency} expectedFuelEfficiency={expectedFuelEfficiency} effectiveLiters={effectiveLiters} recommendedFuelLiters={recommendedFuelLiters} effectiveDistance={effectiveDistance} estimatedDistance={estimatedDistance} />
            </Section>

            <Section no="3" id="delivery-step-3" icon={Clock3} title="วัน เวลา และรายละเอียดงาน" subtitle="กำหนดวันที่หลักครั้งเดียว แล้วนำไปใช้กับงานย่อยได้ทันที">
              <SmartDateField required label="ลงวันที่" hint="วันที่ของรายการ" value={form.work_date} onChange={(v) => { setField('work_date', v); if (!form.fill_date) setField('fill_date', v); }} />
              <SmartDateField label="วันที่เติม" hint="ตามบิลหรือวันที่เติมจริง" value={form.fill_date} onChange={(v) => setField('fill_date', v)} />
              <SmartTimeField label="เวลาเติม" hint="ตามบิลหรือหน้างาน" value={form.fill_time} onChange={(v) => setField('fill_time', v)} />
              <ReadOnlyField label="จำนวนงานในรายการนี้" hint="เพิ่มงานและวันที่ของแต่ละงานในขั้นตอนถัดไป" value={`${jobsSummary.count || 0} งาน`} />
            </Section>

            <Section no="4" id="delivery-step-4" icon={PackageCheck} title="งานทั้งหมดของรถคันนี้" subtitle="แต่ละงานยุบ–ขยายได้ งานใหม่จะต่อจุดขึ้นงานจากปลายทางงานก่อนหน้าอัตโนมัติ">
              <div className="field-wide space-y-3">
                <div className="flex flex-col gap-3 rounded-[1.4rem] border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-black text-blue-950"><Route size={18} /> รายการงานของรถคันนี้</p>
                    <p className="mt-1 text-[11px] font-bold text-blue-700">เพิ่มได้หลายงาน ระยะทางรายงานจะถูกรวมไปคำนวณน้ำมัน</p>
                  </div>
                  <button type="button" className="btn-primary shrink-0" onClick={addJob}><Plus size={18} /> เพิ่มงานต่อจากล่าสุด</button>
                </div>

                {(form.jobs || []).map((job, index) => {
                  const jobIncome = summarizeJobs([job]).totalIncome;
                  return (
                    <article id={`delivery-${job.id}`} key={job.id || index} className={`job-workspace ${expandedJobIds.includes(job.id) ? 'is-open' : ''}`}>
                      <div className="job-workspace-head">
                        <button type="button" className="job-workspace-toggle" onClick={() => toggleJob(job.id)} aria-expanded={expandedJobIds.includes(job.id)}>
                          <span className="job-workspace-number">{index + 1}</span>
                          <span className="job-workspace-copy">
                            <strong>{job.cargo_name || `งานที่ ${index + 1}`}</strong>
                            <small>{job.origin_place || 'จุดขึ้นงาน'} <ArrowDownRight size={12} /> {job.destination_place || 'จุดลงงาน'}</small>
                          </span>
                          <span className="job-workspace-metrics">
                            <i>{number(job.distance_km, 2)} กม.</i>
                            <i>{money(jobIncome)}</i>
                          </span>
                          <span className="job-workspace-chevron">{expandedJobIds.includes(job.id) ? <ChevronUp size={19} /> : <ChevronDown size={19} />}</span>
                        </button>
                        <div className="job-workspace-actions">
                          {index > 0 && <button type="button" className="job-action is-link" onClick={() => linkJobFromPrevious(index)} title="เชื่อมจากงานก่อนหน้า"><Link2 size={16} /><span>เชื่อมงานก่อน</span></button>}
                          <button type="button" className="job-action" onClick={() => duplicateJob(index)} title="คัดลอกงาน"><ClipboardCopy size={16} /><span>คัดลอก</span></button>
                          <button type="button" className="job-action is-danger" onClick={() => removeJob(index)} title="ลบงาน"><Trash2 size={16} /><span>ลบ</span></button>
                        </div>
                      </div>

                      {expandedJobIds.includes(job.id) && <div className="job-workspace-body grid gap-3 p-3 md:grid-cols-2 md:p-4">
                        <div className="job-connection-bar field-wide">
                          <span><Link2 size={16} /> งานนี้เชื่อมกับทะเบียนและเรทน้ำมันด้านบนแล้ว</span>
                          <button type="button" onClick={() => useWorkDateForJob(index)}><CalendarDays size={15} /> ใช้วันที่รายการ</button>
                        </div>
                        <Field className="field-featured" label="ประเภทสินค้า / ชื่องาน" hint="เช่น ทราย หิน หรือไม้สับ" value={job.cargo_name} onChange={(v) => setJobField(index, 'cargo_name', v)} placeholder="กรอกชื่องาน" />
                        <Field className="field-featured" type="number" step="0.01" label="ระยะทางงานนี้" hint="ระบบจะรวมทุกงานอัตโนมัติ" value={job.distance_km} onChange={(v) => setJobField(index, 'distance_km', v)} suffix="กม." />
                        <SmartDateField label="วันที่บรรทุก" hint="ไม่บังคับ" value={job.load_date} onChange={(v) => setJobField(index, 'load_date', v)} optional />
                        <SmartDateField label="วันที่ลงของ" hint="ไม่บังคับ" value={job.unload_date} onChange={(v) => setJobField(index, 'unload_date', v)} optional />
                        <Field className="field-wide" label="จุดรับสินค้า / บ่อต้นทาง" hint="จุดขึ้นงาน" value={job.origin_place} onChange={(v) => setJobField(index, 'origin_place', v)} placeholder="เช่น บ่อทราย SMC" />
                        <Field type="number" step="0.01" label="น้ำหนักต้นทาง" hint="น้ำหนักจากจุดรับสินค้า" value={job.loading_weight_kg} onChange={(v) => setJobField(index, 'loading_weight_kg', v)} suffix="กิโลกรัม" />
                        <Field className="field-wide" label="จุดลงงาน / ปลายทาง" hint="สถานที่ส่งสินค้า" value={job.destination_place} onChange={(v) => setJobField(index, 'destination_place', v)} placeholder="เช่น โออาร์ซี บางเสาธง" />
                        <Field type="number" step="0.01" label="น้ำหนักปลายทาง" hint="น้ำหนักจากจุดลงงาน" value={job.unloading_weight_kg} onChange={(v) => setJobField(index, 'unloading_weight_kg', v)} suffix="กิโลกรัม" />
                        <Field type="number" step="0.01" label="น้ำหนักหิน (ข้อมูลเดิม)" hint="เว้นว่างได้" value={job.cargo_stone_weight} onChange={(v) => setJobField(index, 'cargo_stone_weight', v)} suffix="ตัน" />
                        <Field type="number" step="0.01" label="น้ำหนักไม้สับ (ข้อมูลเดิม)" hint="เว้นว่างได้" value={job.cargo_sand_weight} onChange={(v) => setJobField(index, 'cargo_sand_weight', v)} suffix="ตัน" />

                        <div className="field-wide rounded-[1.4rem] border border-emerald-100 bg-emerald-50/70 p-3">
                          <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Banknote size={17} /></div>
                            <div><p className="text-sm font-black text-emerald-950">รายได้งานที่ {index + 1}</p><p className="text-[11px] font-bold text-emerald-700">รวมอัตโนมัติ {money(jobIncome)}</p></div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field type="number" step="0.01" label="ค่าเที่ยว" value={job.trip_fee_baht} onChange={(v) => setJobField(index, 'trip_fee_baht', v)} suffix="บาท" />
                            <Field type="number" step="0.01" label="เบี้ยเลี้ยง" value={job.allowance_baht} onChange={(v) => setJobField(index, 'allowance_baht', v)} suffix="บาท" />
                            <Field type="number" step="0.01" label="รายได้อื่น" value={job.other_income_baht} onChange={(v) => setJobField(index, 'other_income_baht', v)} suffix="บาท" />
                            <ReadOnlyField className="distance-result-auto" label="รวมรายได้งานนี้" value={money(jobIncome)} />
                            <Field label="ผู้จ่ายค่าแรง" value={job.wage_payer} onChange={(v) => setJobField(index, 'wage_payer', v)} />
                            <Select label="สถานะรายได้" value={job.payment_status} onChange={(v) => setJobField(index, 'payment_status', v)} options={[["pending", 'รอจ่าย / ไม่ระบุ'], ["paid", 'จ่ายแล้ว']]} />
                          </div>
                        </div>

                        <label className="form-field field-wide">
                          <span className="form-field-label label">หมายเหตุงานนี้</span>
                          <textarea className="input min-h-[80px] resize-y" value={job.note || ''} onChange={(e) => setJobField(index, 'note', e.target.value)} placeholder="รายละเอียดเพิ่มเติมเฉพาะงานนี้" />
                        </label>
                      </div>}
                    </article>
                  );
                })}

                <div className="grid gap-2 rounded-[1.4rem] bg-slate-950 p-3 text-white sm:grid-cols-3">
                  <Metric label="จำนวนงานทั้งหมด" value={`${jobsSummary.count || 0} งาน`} />
                  <Metric label="ระยะทางรวม" value={`${number(effectiveDistance, 2)} กม.`} />
                  <Metric label="รายได้รวมทุกงาน" value={money(totalIncome)} strong />
                </div>
              </div>
            </Section>

            <Section no="5" id="delivery-step-5" icon={Camera} title="เอกสารและรูปภาพแนบ" subtitle="เลือกรูปจากคลังหรือเปิดกล้องได้ทันที พร้อมเห็นตัวอย่างก่อนบันทึก">
              <FileField label="รูปบิล" name="bill_photo" files={files} setFiles={setFiles} existing={initialData?.bill_photos || initialData?.bill_photo || initialData?.receipt_photo} />
              <FileField label="รูปเอกสาร" name="document_photo" files={files} setFiles={setFiles} existing={initialData?.document_photos || initialData?.document_photo} />
              <FileField label="รูปน้ำมัน / แอดบลู" name="oil_photo" files={files} setFiles={setFiles} existing={[...toExistingArray(initialData?.oil_photos || initialData?.oil_photo), ...toExistingArray(initialData?.adblue_photos || initialData?.adblue_photo)]} />
              <FileField label="รูปบรรทุก" name="cargo_photo" files={files} setFiles={setFiles} existing={initialData?.cargo_photos || initialData?.cargo_photo} />
            </Section>

            <details className="group section-card supplemental-section overflow-hidden">
              <summary className="section-head cursor-pointer select-none">
                <div className="section-icon"><CheckCircle2 size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="section-kicker">ข้อมูลเพิ่มเติม</p>
                  <h3>หมายเหตุเพิ่มเติม</h3>
                  <p className="section-subtitle">เปิดกรอกเมื่อมีรายละเอียดนอกเหนือจากสรุปปิดงาน</p>
                </div>
                <ChevronDown size={20} className="section-chevron shrink-0 transition group-open:rotate-180" />
              </summary>
              <div className="field-grid smart-form-grid supplemental-grid">
                <label className="form-field field-wide">
                  <span className="form-field-label label">หมายเหตุ</span>
                  <textarea className="input min-h-[110px] resize-y" value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="รายละเอียดเพิ่มเติม เช่น เหตุผลที่ยอดลิตรสูงผิดปกติ" />
                  <p className="form-field-hint hint">เว้นว่างได้เมื่อไม่มีรายละเอียดเพิ่มเติม</p>
                </label>
              </div>
            </details>

            <div className="heng-form-submitbar">
              <div className="submitbar-copy">
                <p>ตรวจสอบข้อมูลก่อนบันทึก</p>
                <span>หลังบันทึก ระบบจะเด้งใบสรุปทุกงานของรถคันนี้ พร้อมระยะทางรวม รายได้รวม และรายละเอียดน้ำมัน</span>
              </div>
              <div className="submitbar-mobile-summary">
                <span><small>งาน</small><strong>{jobsSummary.count || 0}</strong></span>
                <span><small>ระยะทาง</small><strong>{number(effectiveDistance, 2)} กม.</strong></span>
                <span><small>น้ำมัน</small><strong>{number(effectiveLiters, 2)} ลิตร</strong></span>
              </div>
              <button disabled={loading} className="btn-primary submit-primary">
                <Save size={18} /> {loading ? 'กำลังบันทึก...' : initialData?.id ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}
              </button>
            </div>
          </div>
        </div>
      </form>
      <CaptureReceiptModal row={savedReceipt} onClose={() => { const completed = savedReceipt; setSavedReceipt(null); onSaved?.(completed); }} />
    </>
  );
}

function ProgressItem({ no, label, icon: Icon, onClick }) {
  return (
    <button type="button" className="form-progress-item" onClick={onClick}>
      <span className="form-progress-number">{no}</span>
      <span className="form-progress-icon"><Icon size={16} /></span>
      <span className="form-progress-label">{label}</span>
    </button>
  );
}

function DraftNotice({ draftInfo, files, onClear, editing }) {
  if (editing) return null;
  const fileCount = Object.values(files || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  if (!draftInfo.savedAt && fileCount <= 0) return null;
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-xs font-bold leading-5 text-blue-950">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={16} className="shrink-0 text-blue-700" />
          <p className="min-w-0 truncate">บันทึกร่างอัตโนมัติ{draftInfo.savedAt ? ` · ${formatSavedTime(draftInfo.savedAt)}` : ''}{fileCount > 0 ? ` · รูปที่เลือก ${fileCount} ไฟล์` : ''}</p>
        </div>
        {draftInfo.savedAt && <button type="button" onClick={onClear} className="shrink-0 rounded-xl bg-white px-3 py-2 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">ล้าง</button>}
      </div>
    </div>
  );
}

function Section({ no, id, title, subtitle, icon: Icon, children }) {
  return (
    <section id={id} className="section-card form-section-card">
      <div className="section-head">
        <div className="section-icon">{Icon ? <Icon size={19} /> : no}</div>
        <div className="min-w-0 flex-1">
          <p className="section-kicker">ขั้นตอน {no}</p>
          <h3>{title}</h3>
          {subtitle && <p className="section-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="field-grid smart-form-grid section-fields">{children}</div>
    </section>
  );
}

function VehicleLinkedStatus({ vehicle, plate, driver, rate }) {
  const ready = Boolean(vehicle && rate > 0);
  return (
    <div className={`vehicle-link-status field-wide ${ready ? 'is-ready' : 'is-waiting'}`}>
      <span className="vehicle-link-icon">{ready ? <CheckCircle2 size={19} /> : <Link2 size={19} />}</span>
      <div>
        <strong>{ready ? 'เชื่อมข้อมูลรถสำเร็จ' : plate ? 'พบทะเบียน แต่ยังเชื่อมข้อมูลไม่ครบ' : 'เริ่มจากเลือกทะเบียนรถ'}</strong>
        <p>{ready
          ? `${vehicle.plate_no} · ${driver || 'ไม่ระบุคนขับ'} · อัตรา ${number(rate, 2)} กม./ลิตร`
          : 'เมื่อเลือกทะเบียน ระบบจะเติมคนขับ เบอร์รถ และอัตราน้ำมันประจำรถให้อัตโนมัติ'}</p>
      </div>
    </div>
  );
}


function dateOffset(days = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function SmartDateField({ label, value, onChange, required = false, hint = '', optional = false, className = '' }) {
  const chips = [
    { label: 'วันนี้', value: dateOffset(0) },
    { label: 'เมื่อวาน', value: dateOffset(-1) },
  ];
  return (
    <label className={`form-field smart-date-field ${className}`.trim()}>
      <span className="form-field-label label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="smart-date-box">
        <span className="smart-date-icon"><CalendarDays size={18} /></span>
        <input
          required={required}
          type="date"
          className="smart-date-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </div>
      <div className="smart-date-actions">
        {chips.map((chip) => (
          <button key={chip.label} type="button" className={`smart-date-chip ${value === chip.value ? 'is-active' : ''}`} onClick={() => onChange(chip.value)}>
            {chip.label}
          </button>
        ))}
        {optional && value && <button type="button" className="smart-date-chip is-clear" onClick={() => onChange('')}>ล้าง</button>}
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function SmartTimeField({ label, value, onChange, required = false, hint = '', className = '' }) {
  return (
    <label className={`form-field smart-date-field ${className}`.trim()}>
      <span className="form-field-label label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="smart-date-box smart-time-box">
        <span className="smart-date-icon"><Clock3 size={18} /></span>
        <input
          required={required}
          type="time"
          className="smart-date-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </div>
      <div className="smart-date-actions">
        <button type="button" className="smart-date-chip" onClick={() => onChange(currentTime())}>เวลาตอนนี้</button>
        {value && <button type="button" className="smart-date-chip is-clear" onClick={() => onChange('')}>ล้าง</button>}
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '', suffix = '', required = false, hint = '', listId = '', step = '', className = '' }) {
  const isNumber = type === 'number';
  return (
    <label className={`form-field ${className}`.trim()}>
      <span className="form-field-label label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="form-field-input-wrap relative">
        <input
          required={required}
          type={isNumber ? 'text' : type}
          inputMode={isNumber ? 'decimal' : undefined}
          pattern={isNumber ? '[0-9๐-๙.,:\-]*' : undefined}
          step={isNumber ? (step || '0.01') : undefined}
          autoComplete="off"
          className={`input ${suffix ? 'pr-20' : ''}`}
          value={value || ''}
          placeholder={placeholder}
          list={listId || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="field-suffix pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">{suffix}</span>}
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function ReadOnlyField({ label, value, hint = '', className = '' }) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <span className="form-field-label label">{label}</span>
      <div className="readonly-value">
        {value || '-'}
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options, hint = '', className = '' }) {
  const normalized = options.map((item) => Array.isArray(item) ? { value: item[0], label: item[1] } : { value: item, label: item });
  return (
    <label className={`form-field ${className}`.trim()}>
      <span className="form-field-label label">{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {normalized.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function CalcCard({ billTotal, standardBillTotal, fuelVarianceLiters, fuelVarianceBaht, fuelEfficiency, expectedFuelEfficiency, effectiveLiters, recommendedFuelLiters, effectiveDistance, estimatedDistance }) {
  const varianceTone = fuelVarianceLiters > 0 ? 'text-red-700' : fuelVarianceLiters < 0 ? 'text-emerald-700' : 'text-blue-950';
  return (
    <div className="col-span-2 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 p-4 text-sm font-bold text-blue-950 md:col-span-2 xl:col-span-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm"><Gauge size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="font-black">วิเคราะห์น้ำมันจริงเทียบมาตรฐาน</p>
          <p className="mt-1 text-xs leading-5 text-blue-800/70">มาตรฐาน = ระยะทาง ÷ อัตราประจำรถ · ค่าใช้จ่ายจริง = ลิตรเติมจริง × ราคาต่อลิตร</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-6">
            <MiniCalc label="ระยะทาง" value={effectiveDistance ? `${number(effectiveDistance, 2)} กม.` : '-'} />
            <MiniCalc label="อัตราประจำรถ" value={expectedFuelEfficiency ? `${number(expectedFuelEfficiency, 2)} กม./ลิตร` : 'ยังไม่ตั้งค่า'} strong />
            <MiniCalc label="ลิตรมาตรฐาน" value={recommendedFuelLiters ? `${number(recommendedFuelLiters, 2)} ลิตร` : '-'} />
            <MiniCalc label="ลิตรเติมจริง" value={effectiveLiters ? `${number(effectiveLiters, 2)} ลิตร` : '-'} strong highlight />
            <div className="rounded-2xl bg-white/85 p-3"><p className="text-[11px] font-black text-blue-500/80">ส่วนต่าง</p><p className={`mt-1 text-sm font-black ${varianceTone}`}>{fuelVarianceLiters > 0 ? '+' : ''}{number(fuelVarianceLiters, 2)} ลิตร</p><p className={`mt-1 text-[10px] font-black ${varianceTone}`}>{fuelVarianceBaht > 0 ? '+' : ''}{money(fuelVarianceBaht)}</p></div>
            <MiniCalc label="ประสิทธิภาพจริง" value={fuelEfficiency ? `${number(fuelEfficiency, 2)} กม./ลิตร` : estimatedDistance ? `${number(estimatedDistance, 2)} กม.` : '-'} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-white px-3 py-1.5">ค่าใช้จ่ายมาตรฐาน {money(standardBillTotal)}</span><span className="rounded-full bg-white px-3 py-1.5">ค่าใช้จ่ายจริง {money(billTotal)}</span></div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, strong = false }) {
  return <div className="rounded-2xl bg-white/85 p-3 shadow-sm ring-1 ring-white/70"><p className="text-[11px] font-black text-slate-400">{label}</p><p className={`${strong ? 'text-blue-700' : 'text-slate-950'} mt-1 truncate text-sm font-black md:text-base`}>{value}</p></div>;
}

function MiniCalc({ label, value, strong = false, highlight = false }) {
  return (
    <div className={`rounded-2xl p-3 ${highlight ? 'border border-blue-100 bg-blue-50' : 'bg-white/85'}`}>
      <p className={`text-[11px] font-black ${highlight ? 'text-blue-700' : 'text-blue-500/80'}`}>{label}</p>
      <p className={`mt-1 ${strong ? 'text-lg' : 'text-sm'} font-black ${highlight ? 'text-blue-950' : 'text-blue-950'}`}>{value}</p>
    </div>
  );
}

function toExistingArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function FileField({ label, hint = '', name, files, setFiles, existing }) {
  const [pickerKey, setPickerKey] = useState(0);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const selected = files[name] || [];
  const existingList = toExistingArray(existing);

  function mergePickedFiles(pickedFiles = []) {
    const picked = Array.from(pickedFiles || []).filter(Boolean);
    if (!picked.length) return;
    setFiles((old) => {
      const current = Array.isArray(old[name]) ? old[name] : [];
      const merged = [...current];
      picked.forEach((file) => {
        const key = `${file.name}_${file.size}_${file.lastModified}`;
        const exists = merged.some((item) => `${item.name}_${item.size}_${item.lastModified}` === key);
        if (!exists) merged.push(file);
      });
      return { ...old, [name]: merged };
    });
  }

  function onSelect(e) {
    const picked = Array.from(e.target.files || []);
    mergePickedFiles(picked);
    // reset หลังอ่านค่าแล้วเท่านั้น เพื่อให้ Samsung/Android บางรุ่นไม่ทำไฟล์หายตอนกลับจากคลังรูป
    window.setTimeout(() => {
      if (e.target) e.target.value = '';
      setPickerKey((key) => key + 1);
    }, 80);
  }

  function openPicker(ref) {
    try {
      ref.current?.click?.();
    } catch (_) {
      toastInfo('แตะปุ่มอีกครั้งเพื่อเลือกรูป');
    }
  }

  function clearSelected() {
    setFiles((old) => ({ ...old, [name]: [] }));
    if (galleryRef.current) galleryRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
    setPickerKey((key) => key + 1);
  }

  function removeSelected(index) {
    setFiles((old) => {
      const current = Array.isArray(old[name]) ? old[name] : [];
      return { ...old, [name]: current.filter((_, i) => i !== index) };
    });
    if (galleryRef.current) galleryRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
    setPickerKey((key) => key + 1);
  }

  return (
    <div className="file-picker-card">
      <input
        key={`${name}_gallery_${pickerKey}`}
        ref={galleryRef}
        className="sr-only"
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,.pdf"
        multiple
        onChange={onSelect}
      />
      <input
        key={`${name}_camera_${pickerKey}`}
        ref={cameraRef}
        className="sr-only"
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
        capture="environment"
        onChange={onSelect}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="label text-[12px] md:text-[13px]">{label}</span>
          {hint && <p className="hint mt-1">{hint}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${selected.length > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
          {selected.length > 0 ? `${selected.length} ไฟล์` : 'ว่าง'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openPicker(galleryRef)} className="min-h-[72px] rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/45 p-3 text-center shadow-sm transition active:scale-[.98]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Camera size={18} /></div>
          <p className="mt-2 text-xs font-black text-slate-900">เลือกรูป</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">จากคลัง</p>
        </button>
        <button type="button" onClick={() => openPicker(cameraRef)} className="min-h-[72px] rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/45 p-3 text-center shadow-sm transition active:scale-[.98]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Camera size={18} /></div>
          <p className="mt-2 text-xs font-black text-slate-900">ถ่ายรูป</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">กล้องมือถือ</p>
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={clearSelected} className="btn-soft col-span-2 w-full text-xs">
            <RotateCcw size={14} /> เลือกใหม่
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {selected.length > 0 && (
          <div className="rounded-[1.35rem] border border-blue-100 bg-blue-50/80 p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 text-xs font-black text-blue-900">
                <CheckCircle2 size={16} className="shrink-0" /> เลือกแล้ว {selected.length} ไฟล์ รอกดบันทึก
              </p>
              <button type="button" onClick={clearSelected} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500 ring-1 ring-slate-200">
                ล้างทั้งหมด
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {selected.map((file, index) => (
                <SelectedFilePreview
                  key={`${file.name}_${file.size}_${file.lastModified}_${index}`}
                  file={file}
                  index={index}
                  onRemove={() => removeSelected(index)}
                />
              ))}
            </div>
          </div>
        )}
        {existingList.length > 0 && (
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
            <p className="mb-2 text-[11px] font-black text-slate-400">ไฟล์เดิม {existingList.length} ไฟล์</p>
            <div className="flex flex-wrap gap-2">
              {existingList.slice(0, 10).map((path, index) => (
                <a key={`${path}-${index}`} href={uploadUrl(path)} target="_blank" rel="noreferrer" className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                  <img src={uploadUrl(path)} alt={`${label} ${index + 1}`} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function isImageFile(file) {
  return isLikelyImageFile(file);
}

function isPdfFile(file) {
  return isLikelyPdfFile(file);
}

function SelectedFilePreview({ file, index, onRemove }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file || !isImageFile(file)) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const title = String(file?.name || `ไฟล์ที่ ${index + 1}`);
  const typeText = isImageFile(file) ? 'รูปภาพ' : isPdfFile(file) ? 'PDF' : 'ไฟล์';

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-blue-100">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition group-hover:bg-red-600"
        aria-label={`ลบ ${title}`}
      >
        <X size={14} />
      </button>
      <div className="aspect-square w-full overflow-hidden bg-slate-100">
        {previewUrl ? (
          <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-blue-50 text-blue-700">
            {isPdfFile(file) ? <FileText size={26} /> : <Camera size={26} />}
            <span className="text-[10px] font-black uppercase tracking-wide">{typeText}</span>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 min-h-[2rem] break-all text-[11px] font-black leading-4 text-slate-800">{title}</p>
        <p className="mt-1 text-[10px] font-bold text-slate-400">{formatFileSize(file?.size || 0)}</p>
      </div>
    </div>
  );
}
