import { date, money, number, parseDecimal, roundDecimal } from './format.js';

function safeText(value, fallback = '-') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function litersValue(row = {}) {
  return roundDecimal(
    row.actual_filled_liters
      || row.quantity_liters
      || row.station_liters
      || row.liters
      || row.nozzle_liters
      || row.station_meter_delta_liters
      || 0,
    2,
  );
}

function standardLitersValue(row = {}) {
  return roundDecimal(row.standard_fuel_liters || row.recommended_fuel_liters || row.quantity_liters || 0, 2);
}

function varianceLitersValue(row = {}) {
  if (row.fuel_variance_liters !== undefined && row.fuel_variance_liters !== null && row.fuel_variance_liters !== '') {
    return roundDecimal(row.fuel_variance_liters, 2);
  }
  return roundDecimal(litersValue(row) - standardLitersValue(row), 2);
}

function priceValue(row = {}) {
  return parseDecimal(row.price_baht_per_liter || row.price_per_liter, 0);
}

function amountValue(row = {}) {
  const liters = litersValue(row);
  const price = priceValue(row);
  if (liters > 0 && price > 0) return roundDecimal(liters * price, 2);
  return parseDecimal(row.amount_baht, 0);
}

function fuelRateValue(row = {}) {
  const saved = parseDecimal(row.fuel_efficiency_km_per_liter, 0);
  if (saved > 0) return saved;
  const distance = parseDecimal(row.distance_km, 0);
  const liters = litersValue(row);
  return distance > 0 && liters > 0 ? roundDecimal(distance / liters, 2) : 0;
}

function incomeValue(row = {}, key) {
  return Math.max(0, roundDecimal(parseDecimal(row[key], 0), 2));
}

function totalIncomeValue(row = {}) {
  const jobsTotal = jobsFor(row).reduce((sum, job) => sum + jobIncomeValue(job), 0);
  if (jobsTotal > 0) return roundDecimal(jobsTotal, 2);
  const calculated = incomeValue(row, 'trip_fee_baht')
    + incomeValue(row, 'allowance_baht')
    + incomeValue(row, 'other_income_baht');
  return calculated > 0 ? roundDecimal(calculated, 2) : incomeValue(row, 'total_income_baht');
}

function kgText(value) {
  const kg = parseDecimal(value, 0);
  return kg > 0 ? `${number(kg, Number.isInteger(kg) ? 0 : 2)} กก.` : '-';
}

function fillDateText(row = {}) {
  return `${date(row.fill_date || row.work_date)}${row.fill_time ? ` ${row.fill_time}` : ''}`;
}

function eventDateText(row = {}) {
  const value = row.unload_date || row.load_date || row.work_date || row.fill_date;
  return `${date(value)}${row.fill_time ? ` ${row.fill_time}` : ''}`;
}

function routePlace(value, fallback) {
  return value === undefined || value === null || value === '' ? fallback : String(value);
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

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fontString(size, weight = 800) {
  return `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function splitLongToken(ctx, token, maxWidth) {
  if (ctx.measureText(token).width <= maxWidth) return [token];
  const parts = [];
  let current = '';
  for (const char of token) {
    const test = current + char;
    if (ctx.measureText(test).width <= maxWidth || !current) current = test;
    else {
      parts.push(current);
      current = char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapLines(ctx, text, maxWidth) {
  const raw = String(text || '-').replace(/\s+/g, ' ').trim();
  if (!raw) return ['-'];
  const tokens = raw.split(' ').flatMap((token) => splitLongToken(ctx, token, maxWidth));
  const lines = [];
  let current = '';
  tokens.forEach((token) => {
    const test = current ? `${current} ${token}` : token;
    if (!current || ctx.measureText(test).width <= maxWidth) current = test;
    else {
      lines.push(current);
      current = token;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawText(ctx, text, x, y, maxWidth, options = {}) {
  const {
    size = 32,
    weight = 800,
    color = '#0f172a',
    align = 'left',
    lineHeight = 1.2,
    maxLines = 2,
  } = options;
  ctx.font = fontString(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const lines = wrapLines(ctx, text, maxWidth).slice(0, maxLines);
  const linePx = size * lineHeight;
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * linePx, maxWidth));
  return y + lines.length * linePx;
}

function drawSingleLineFit(ctx, text, x, y, maxWidth, options = {}) {
  const { maxSize = 42, minSize = 18, weight = 900, color = '#0f172a', align = 'left' } = options;
  let size = maxSize;
  while (size > minSize) {
    ctx.font = fontString(size, weight);
    if (ctx.measureText(String(text || '-')).width <= maxWidth) break;
    size -= 1;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(String(text || '-'), x, y, maxWidth);
}

function drawPill(ctx, x, y, width, text, background, color) {
  ctx.fillStyle = background;
  roundedRect(ctx, x, y, width, 46, 23);
  ctx.fill();
  drawSingleLineFit(ctx, text, x + width / 2, y + 11, width - 24, {
    maxSize: 20,
    minSize: 14,
    weight: 900,
    color,
    align: 'center',
  });
}

function drawSection(ctx, x, y, width, height, background, border = '#dbeafe') {
  ctx.fillStyle = background;
  roundedRect(ctx, x, y, width, height, 30);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTimelineRow(ctx, x, y, width, no, title, subtitle, active = false) {
  ctx.fillStyle = active ? '#2563eb' : '#334155';
  ctx.beginPath();
  ctx.arc(x, y + 28, 28, 0, Math.PI * 2);
  ctx.fill();
  drawSingleLineFit(ctx, String(no), x, y + 12, 44, {
    maxSize: 25,
    minSize: 18,
    weight: 950,
    color: '#ffffff',
    align: 'center',
  });
  drawText(ctx, title, x + 54, y + 2, width - 60, {
    size: 25,
    weight: 950,
    color: '#0f172a',
    maxLines: 1,
  });
  if (subtitle) {
    drawText(ctx, subtitle, x + 54, y + 36, width - 60, {
      size: 18,
      weight: 750,
      color: '#64748b',
      maxLines: 1,
    });
  }
}

function drawSummaryRow(ctx, x, y, width, label, value, options = {}) {
  const { green = false, strong = false } = options;
  if (green) {
    ctx.fillStyle = '#bbf7d0';
    roundedRect(ctx, x, y, width, 54, 16);
    ctx.fill();
  }
  drawText(ctx, label, x + 18, y + 12, width * 0.58, {
    size: strong ? 24 : 21,
    weight: 950,
    color: green ? '#064e3b' : '#1e293b',
    maxLines: 1,
  });
  drawSingleLineFit(ctx, value, x + width - 18, y + 12, width * 0.4, {
    maxSize: strong ? 25 : 22,
    minSize: 15,
    weight: 950,
    color: green ? '#064e3b' : '#0f172a',
    align: 'right',
  });
}

function drawInfoCard(ctx, x, y, width, height, label, value, tone = 'blue') {
  const tones = {
    blue: ['#eff6ff', '#bfdbfe', '#1e3a8a', '#3b82f6'],
    slate: ['#f8fafc', '#e2e8f0', '#0f172a', '#64748b'],
    green: ['#ecfdf5', '#a7f3d0', '#064e3b', '#10b981'],
    danger: ['#fff1f2', '#fecdd3', '#881337', '#e11d48'],
  };
  const [background, border, valueColor, labelColor] = tones[tone] || tones.blue;
  ctx.fillStyle = background;
  roundedRect(ctx, x, y, width, height, 22);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, label, x + 18, y + 14, width - 36, {
    size: 17,
    weight: 900,
    color: labelColor,
    maxLines: 1,
  });
  drawText(ctx, value, x + 18, y + 43, width - 36, {
    size: 23,
    weight: 950,
    color: valueColor,
    maxLines: 2,
    lineHeight: 1.08,
  });
}

function photoCount(row = {}) {
  return [
    row.bill_photos, row.bill_photo, row.receipt_photo,
    row.document_photos, row.document_photo,
    row.oil_photos, row.oil_photo,
    row.cargo_photos, row.cargo_photo,
    row.adblue_photos, row.adblue_photo,
  ].flatMap((value) => (Array.isArray(value) ? value : value ? [value] : [])).length;
}

export async function createReceiptImageBlob(row = {}) {
  const jobs = jobsFor(row);
  const tripFee = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'trip_fee_baht'), 0), 2) || incomeValue(row, 'trip_fee_baht');
  const allowance = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'allowance_baht'), 0), 2) || incomeValue(row, 'allowance_baht');
  const otherIncome = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'other_income_baht'), 0), 2) || incomeValue(row, 'other_income_baht');
  const income = totalIncomeValue(row);
  const distance = parseDecimal(row.distance_km, 0);
  const rate = parseDecimal(row.expected_fuel_efficiency_km_per_liter || row.vehicle_fuel_efficiency_km_per_liter, 0);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1210 + jobs.length * 224;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('อุปกรณ์ไม่รองรับการสร้างไฟล์รูปใบสรุปงาน');
  const ink = '#292329', red = '#b91c1c', muted = '#807377', border = '#f0dada';
  ctx.fillStyle = '#f8f8f9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff'; roundedRect(ctx, 26, 26, 1028, canvas.height - 52, 30); ctx.fill();
  ctx.fillStyle = red; roundedRect(ctx, 26, 26, 1028, 14, 7); ctx.fill();
  try { const brandImage=await loadImage('/kwanjai-logo.png'); ctx.drawImage(brandImage, 875, 56, 140, 140); } catch (_) {}
  drawText(ctx, 'ขวัญใจดาวทองขนส่ง', 75, 85, 740, { size: 22, weight: 900, color: red, maxLines: 1 });
  drawText(ctx, 'ใบสรุปงานขนส่ง', 75, 126, 780, { size: 53, weight: 950, color: ink, maxLines: 1 });
  drawText(ctx, 'ระยะทางจากข้อมูลที่กรอกเอง • ไม่ใช้ GPS', 75, 198, 800, { size: 22, weight: 750, color: muted, maxLines: 1 });
  ctx.fillStyle = '#fff1f2'; roundedRect(ctx, 76, 258, 930, 133, 22); ctx.fill();
  drawText(ctx, 'ทะเบียนรถ', 101, 280, 230, { size: 19, color: '#a25861' });
  drawText(ctx, safeText(row.plate_no), 101, 307, 400, { size: 37, weight: 950, color: red, maxLines: 1 });
  drawText(ctx, `วันที่ ${fillDateText(row)}`, 540, 280, 440, { size: 21, color: ink, maxLines: 1 });
  drawText(ctx, `คนขับ ${safeText(row.driver_name || row.driver_name_input)}`, 540, 321, 440, { size: 21, color: ink, maxLines: 1 });
  let y = 430;
  drawText(ctx, '01   รายการขนส่ง', 78, y, 600, { size: 31, weight: 950, color: red, maxLines: 1 });
  y += 56;
  jobs.forEach((job, index) => {
    ctx.fillStyle = '#fff'; roundedRect(ctx, 76, y, 930, 198, 18); ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff1f2'; roundedRect(ctx, 90, y + 15, 902, 44, 11); ctx.fill();
    drawText(ctx, `งาน ${index + 1} · ${safeText(job.cargo_name, 'ไม่ระบุวัสดุ')}`, 108, y + 22, 615, { size: 22, weight: 950, color: ink, maxLines: 1 });
    drawText(ctx, `${number(job.distance_km, 2)} กม.`, 973, y + 22, 240, { size: 21, weight: 950, color: red, maxLines: 1, align: 'right' });
    drawText(ctx, `ต้นทาง  ${safeText(job.origin_place)}`, 106, y + 72, 837, { size: 20, color: ink, maxLines: 1 });
    drawText(ctx, `ปลายทาง ${safeText(job.destination_place)}`, 106, y + 105, 837, { size: 20, color: ink, maxLines: 1 });
    drawText(ctx, `น้ำหนักขึ้น ${kgText(job.loading_weight_kg)}     น้ำหนักลง ${kgText(job.unloading_weight_kg)}`, 106, y + 145, 620, { size: 18, color: muted, maxLines: 1 });
    drawText(ctx, money(jobIncomeValue(job)), 973, y + 144, 230, { size: 21, weight: 950, color: red, align: 'right', maxLines: 1 });
    y += 224;
  });
  drawText(ctx, '02   น้ำมันและระยะทาง', 78, y + 8, 700, { size: 31, weight: 950, color: red });
  y += 68;
  ctx.fillStyle = '#fff7f7'; roundedRect(ctx, 76, y, 930, 150, 18); ctx.fill();
  const cols = [
    ['ระยะทางจริง', `${number(distance, 2)} กม.`],
    ['อัตราประจำรถ', rate > 0 ? `${number(rate, 2)} กม./ลิตร` : '-'],
    ['ลิตรเติมจริง', `${number(litersValue(row), 2)} ลิตร`],
  ];
  cols.forEach(([label, value], index) => {
    const x = 98 + index * 306;
    drawText(ctx, label, x, y + 27, 280, { size: 18, color: muted, maxLines: 1 });
    drawText(ctx, value, x, y + 67, 285, { size: 25, weight: 950, color: red, maxLines: 1 });
  });
  y += 170;
  drawText(ctx, '03   สรุปรายได้และค่าใช้จ่าย', 78, y, 800, { size: 31, weight: 950, color: red, maxLines: 1 });
  y += 53;
  const rows = [
    ['ค่าเที่ยว', money(tripFee)], ['เบี้ยเลี้ยง', money(allowance)],
    ['รายได้อื่น', money(otherIncome)], ['ค่าน้ำมันเติมจริง', money(amountValue(row))],
  ];
  rows.forEach(([label, value]) => {
    drawText(ctx, label, 94, y, 410, { size: 21, color: muted, maxLines: 1 });
    drawText(ctx, value, 970, y, 360, { size: 23, weight: 950, color: ink, align: 'right', maxLines: 1 });
    y += 43;
  });
  ctx.fillStyle = red; roundedRect(ctx, 76, y + 8, 930, 76, 17); ctx.fill();
  drawText(ctx, 'รวมรายได้งานขนส่ง', 98, y + 25, 400, { size: 23, weight: 900, color: '#fff', maxLines: 1 });
  drawText(ctx, money(income), 970, y + 21, 440, { size: 29, weight: 950, color: '#fff', align: 'right', maxLines: 1 });
  y += 96;
  drawText(ctx, 'หมายเหตุ: รายได้ไม่ใช่กำไรสุทธิ ดูรายจ่ายทั้งหมดได้ในเมนูบัญชีขนส่ง', 78, y, 920, { size: 17, color: muted, maxLines: 1 });
  drawText(ctx, `ผู้บันทึก ${safeText(row.recorder_name || row.employee_name)}   •   เอกสารแนบ ${photoCount(row)} ไฟล์`, 78, y + 42, 920, { size: 17, color: muted, maxLines: 1 });
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('ไม่สามารถสร้างไฟล์ใบสรุปงานได้')), 'image/png'));
}

function receiptFileName(row = {}) {
  return `สรุปปิดงาน_${safeText(row.plate_no, 'receipt')}_${Date.now()}.png`
    .replace(/[\\/:*?"<>|\s]+/g, '-');
}

function isIOSLike() {
  const userAgent = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isMobileLike() {
  const userAgent = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (navigator.maxTouchPoints || 0) > 1;
}

function triggerDownload(file, fileName) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.position = 'fixed';
  anchor.style.left = '-9999px';
  anchor.style.top = '0';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 8000);
}

export async function createReceiptImageFile(row = {}) {
  const blob = await createReceiptImageBlob(row);
  const fileName = receiptFileName(row);
  try {
    return new File([blob], fileName, { type: 'image/png', lastModified: Date.now() });
  } catch (_) {
    blob.name = fileName;
    return blob;
  }
}

export async function saveReceiptImageToDevice(row = {}, options = {}) {
  const {
    preparedFile = null,
    preferShare = true,
    allowFilePicker = false,
    previewObjectUrl = '',
  } = options;

  const file = preparedFile || await createReceiptImageFile(row);
  const fileName = file.name || receiptFileName(row);

  if (preferShare && navigator?.share && navigator?.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: 'ใบสรุปรายการ ขวัญใจดาวทองขนส่ง',
        text: 'สรุปปิดงาน ขึ้นงาน ลงงาน น้ำหนัก รายได้ และรายละเอียดน้ำมัน',
        files: [file],
      });
      return { file, fileName, method: 'share' };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Continue to a mobile-safe fallback when the browser blocks Web Share.
    }
  }

  if (allowFilePicker && window?.showSaveFilePicker && !isIOSLike()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return { file, fileName, method: 'file-picker' };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Fall through to download or preview.
    }
  }

  if (isIOSLike() || isMobileLike()) {
    return {
      file,
      fileName,
      method: 'preview',
      objectUrl: previewObjectUrl || URL.createObjectURL(file),
    };
  }

  triggerDownload(file, fileName);
  return { file, fileName, method: 'download' };
}

export async function downloadReceiptImage(row = {}) {
  return saveReceiptImageToDevice(row, {
    preferShare: false,
    allowFilePicker: false,
  });
}
