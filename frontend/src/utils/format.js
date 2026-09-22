export const ITEM_TYPES = ['ดีเซล', 'น้ำมันเครื่อง', 'แอดบลู'];

export const FIELD_LABELS = {
  work_date: 'ลงวันที่กำกับ',
  fill_date: 'วันที่เติม',
  fill_time: 'เวลาเติม',
  operation_type: 'ประเภทงาน',
  item_type: 'ประเภทน้ำมัน',
  plate_no: 'ทะเบียนรถ',
  vehicle_no: 'เบอร์รถ',
  driver_name: 'คนขับ',
  filler_name: 'ชื่อผู้เติม',
  recorder_name: 'ชื่อผู้กรอก',
  cargo_name: 'ประเภทสินค้า / ชื่องาน',
  origin_place: 'จุดรับสินค้า / บ่อต้นทาง',
  loading_weight_kg: 'น้ำหนักต้นทาง (กิโลกรัม)',
  destination_place: 'จุดลงงาน / ปลายทาง',
  unloading_weight_kg: 'น้ำหนักปลายทาง (กิโลกรัม)',
  load_date: 'วันที่บรรทุก',
  unload_date: 'วันที่ลงของ',
  cargo_stone_weight: 'น้ำหนักหิน',
  cargo_sand_weight: 'น้ำหนักไม้สับ',
  trip_fee_baht: 'ค่าเที่ยว',
  allowance_baht: 'เบี้ยเลี้ยง',
  other_income_baht: 'รายได้อื่น',
  total_income_baht: 'รวมรายได้',
  wage_payer: 'ผู้จ่ายค่าแรง',
  payment_status: 'สถานะรายได้',
  quantity_liters: 'จำนวนลิตรเติมจริง',
  actual_filled_liters: 'จำนวนลิตรเติมจริง',
  standard_fuel_liters: 'จำนวนลิตรมาตรฐาน',
  recommended_fuel_liters: 'จำนวนลิตรที่คำนวณจากระยะทาง',
  fuel_variance_liters: 'ส่วนต่างลิตรจริงเทียบมาตรฐาน',
  fuel_variance_baht: 'มูลค่าส่วนต่างน้ำมัน',
  cost_per_km: 'ต้นทุนต่อกิโลเมตร',
  amount_baht: 'ค่าใช้จ่ายเติมจริง',
  distance_km: 'ระยะทางที่กรอก',
  odometer_before: 'เลขหัวจ่ายก่อนเติม (อ้างอิง)',
  odometer_after: 'เลขหัวจ่ายหลังเติม (อ้างอิง)',
  fuel_efficiency_km_per_liter: 'อัตราสิ้นเปลือง กม./ลิตร',
  price_baht_per_liter: 'ราคาน้ำมันลิตรละ (บาท)',
  bill_photo: 'รูปบิล',
  bill_photos: 'รูปบิลหลายรูป',
  document_photo: 'รูปเอกสาร',
  document_photos: 'รูปเอกสารหลายรูป',
  oil_photo: 'รูปเกี่ยวกับน้ำมัน',
  oil_photos: 'รูปเกี่ยวกับน้ำมันหลายรูป',
  cargo_photo: 'รูปบรรทุก',
  cargo_photos: 'รูปบรรทุกหลายรูป',
};

export function normalizeDecimalText(value) {
  if (value === undefined || value === null || value === '') return '';
  let text = String(value)
    .replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d))
    .replace(/[−–—]/g, '-')
    .replace(/[٫．]/g, '.')
    .replace(/\s+/g, '')
    .trim();

  // มือถือบางรุ่นผู้ใช้กดคั่นทศนิยมเป็น : เช่น 100:20 ให้ตีความเป็น 100.20
  if (text.includes(':') && !text.includes('.') && !text.includes(',')) {
    const parts = text.split(':');
    if (parts.length === 2 && /^-?\d+$/.test(parts[0]) && /^\d{1,6}$/.test(parts[1])) {
      text = `${parts[0]}.${parts[1]}`;
    }
  }

  // รองรับทั้ง 1,234.56 / 1234,56 / 1.234,56 โดยไม่ทำให้ทศนิยมหล่น
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = text.split(',');
    if (parts.length === 2) {
      const [whole, frac] = parts;
      // รองรับทั้งคอมม่าเป็นทศนิยมจากคีย์บอร์ดมือถือ เช่น 100,20
      // และคอมม่าเป็นหลักพัน เช่น 8,325 / 10,800 ไม่ให้กลายเป็น 8.32
      const isThousands = /^-?\d{1,3}$/.test(whole) && /^\d{3}$/.test(frac);
      const isDecimalComma = /^-?\d+$/.test(whole) && /^\d{1,2}$/.test(frac);
      text = isThousands ? `${whole}${frac}` : isDecimalComma ? `${whole}.${frac}` : text.replace(/,/g, '');
    } else {
      text = text.replace(/,/g, '');
    }
  }

  text = text.replace(/[^0-9.\-]/g, '');
  const minus = text.startsWith('-') ? '-' : '';
  text = minus + text.replace(/-/g, '');
  const firstDot = text.indexOf('.');
  if (firstDot !== -1) {
    text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '');
  }
  return text;
}

export function parseDecimal(value, defaultValue = 0) {
  const text = normalizeDecimalText(value);
  if (!text || text === '-' || text === '.') return defaultValue;
  const n = Number(text);
  return Number.isFinite(n) ? n : defaultValue;
}

function decimalPlaces(value) {
  const text = normalizeDecimalText(value);
  const dot = text.indexOf('.');
  return dot >= 0 ? Math.min(6, text.length - dot - 1) : 0;
}

function toScaledInteger(value, scale) {
  const text = normalizeDecimalText(value);
  if (!text || text === '-' || text === '.') return 0;
  const negative = text.startsWith('-');
  const clean = negative ? text.slice(1) : text;
  const [wholeRaw = '0', fracRaw = ''] = clean.split('.');
  const whole = wholeRaw || '0';
  const frac = (fracRaw + '0'.repeat(scale)).slice(0, scale);
  const result = Number(BigInt(whole || '0') * BigInt(10 ** scale) + BigInt(frac || '0'));
  return negative ? -result : result;
}

export function preciseSubtract(afterValue, beforeValue, digits = 2) {
  const scale = Math.max(digits, decimalPlaces(afterValue), decimalPlaces(beforeValue));
  const afterInt = toScaledInteger(afterValue, scale);
  const beforeInt = toScaledInteger(beforeValue, scale);
  return roundDecimal((afterInt - beforeInt) / (10 ** scale), digits);
}

export function roundDecimal(value, digits = 2) {
  const n = parseDecimal(value, 0);
  const factor = 10 ** digits;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function number(value, digits = 0) {
  const n = parseDecimal(value, 0);
  return n.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function money(value) {
  return parseDecimal(value, 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function date(value) {
  if (!value) return '-';
  const d = new Date(String(value).slice(0, 10));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function datetime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return date(value);
  return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function today() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
