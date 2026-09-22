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
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');

  const jobs = jobsFor(row);
  const primaryJob = jobs[0] || {};
  const origin = routePlace(primaryJob.origin_place || row.origin_place, 'ไม่ระบุจุดขึ้นงาน');
  const destination = routePlace(primaryJob.destination_place || row.destination_place, 'ไม่ระบุจุดลงงาน');
  const tripFee = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'trip_fee_baht'), 0), 2) || incomeValue(row, 'trip_fee_baht');
  const allowance = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'allowance_baht'), 0), 2) || incomeValue(row, 'allowance_baht');
  const otherIncome = roundDecimal(jobs.reduce((sum, job) => sum + incomeValue(job, 'other_income_baht'), 0), 2) || incomeValue(row, 'other_income_baht');
  const totalIncome = totalIncomeValue(row);
  const liters = litersValue(row);
  const standardLiters = standardLitersValue(row);
  const varianceLiters = varianceLitersValue(row);
  const price = priceValue(row);
  const amount = amountValue(row);
  const distance = parseDecimal(row.distance_km, 0);
  const fuelRate = fuelRateValue(row);
  const before = safeText(row.station_meter_before || row.odometer_before, '-');
  const after = safeText(row.station_meter_after || row.odometer_after, '-');
  const recorder = safeText(row.recorder_name || row.employee_name, '-');
  const photos = photoCount(row);

  const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#dbeafe');
  background.addColorStop(0.5, '#f8fafc');
  background.addColorStop(1, '#dcfce7');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 34, 34, 1012, 1852, 48);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.stroke();

  const headerGradient = ctx.createLinearGradient(34, 34, 1046, 330);
  headerGradient.addColorStop(0, '#ffffff');
  headerGradient.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = headerGradient;
  roundedRect(ctx, 34, 34, 1012, 292, 48);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 76, 76, 126, 126, 28);
  ctx.fill();
  ctx.strokeStyle = '#ddd6fe';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, 'TS', 103, 115, 80, { size: 34, weight: 950, color: '#7c3aed', maxLines: 1 });
  drawText(ctx, 'TEST SYSTEM', 230, 76, 430, { size: 24, weight: 950, color: '#7c3aed', maxLines: 1 });
  drawText(ctx, 'ใบสรุปรายการ', 230, 112, 470, { size: 54, weight: 950, color: '#020617', maxLines: 1 });
  drawText(ctx, `รวม ${jobs.length} งาน ระยะทาง รายได้ และข้อมูลน้ำมัน`, 230, 181, 620, { size: 22, weight: 800, color: '#64748b', maxLines: 1 });
  drawPill(ctx, 828, 76, 160, 'บันทึกแล้ว', '#d1fae5', '#047857');

  drawSingleLineFit(ctx, safeText(row.plate_no, '-'), 76, 232, 400, {
    maxSize: 58,
    minSize: 34,
    weight: 950,
    color: '#020617',
  });
  drawPill(ctx, 460, 238, 128, safeText(row.item_type, '-'), '#eff6ff', '#1d4ed8');
  drawPill(ctx, 602, 238, 242, safeText(row.operation_type, 'ทำน้ำมันบรรทุก'), '#ecfdf5', '#047857');
  drawText(ctx, `คนขับ: ${safeText(row.driver_name || row.driver_name_input, '-')}`, 76, 292, 860, {
    size: 22,
    weight: 900,
    color: '#475569',
    maxLines: 1,
  });

  drawSection(ctx, 64, 350, 952, 302, '#ffffff', '#e2e8f0');
  drawText(ctx, 'รายละเอียดงาน', 92, 374, 400, { size: 26, weight: 950, color: '#0f172a', maxLines: 1 });
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(122, 445);
  ctx.lineTo(122, 614);
  ctx.stroke();
  const eventText = eventDateText(row);
  const distanceMeta = distance > 0 ? `[ระยะทาง ${number(distance, 0)} กม.]` : '';
  const unloadMeta = parseDecimal(row.unloading_weight_kg, 0) > 0 ? `[ปลายทาง ${kgText(row.unloading_weight_kg)}]` : '';
  drawTimelineRow(ctx, 122, 420, 830, 3, `พร้อมลงสินค้า (${destination})`, `${eventText} ${distanceMeta}`.trim());
  drawTimelineRow(ctx, 122, 500, 830, 4, `ลงสินค้าเรียบร้อย (${destination})`, `${eventText} ${unloadMeta}`.trim());
  drawTimelineRow(ctx, 122, 580, 830, 5, 'สรุปปิดงาน', '', true);

  drawSection(ctx, 64, 676, 952, 470, '#eaf4ff', '#bfdbfe');
  drawText(ctx, `สรุปงานทั้งหมด (${jobs.length} งาน)`, 92, 700, 520, { size: 27, weight: 950, color: '#0f172a', maxLines: 1 });
  drawText(ctx, `ระยะทางรวม ${number(distance, 2)} กม. · ค่าเที่ยวรวม ${number(tripFee, 2)} บาท · เบี้ยเลี้ยงรวม ${number(allowance, 2)} บาท`, 92, 738, 850, {
    size: 18,
    weight: 800,
    color: '#64748b',
    maxLines: 1,
  });

  const visibleJobs = jobs.slice(0, 4);
  let jobY = 782;
  visibleJobs.forEach((job, index) => {
    const jobLabel = `งาน ${index + 1} ${safeText(job.cargo_name, '')}: ${routePlace(job.origin_place, 'ขึ้นงาน')} → ${routePlace(job.destination_place, 'ลงงาน')}`;
    const jobValue = `${number(job.distance_km, 2)} กม. / ${number(jobIncomeValue(job), 2)} บาท`;
    drawSummaryRow(ctx, 86, jobY, 908, jobLabel, jobValue);
    jobY += 58;
  });
  if (jobs.length > visibleJobs.length) {
    drawText(ctx, `และอีก ${jobs.length - visibleJobs.length} งาน ดูรายละเอียดครบในระบบ`, 104, 1014, 820, {
      size: 18,
      weight: 900,
      color: '#475569',
      maxLines: 1,
    });
  }
  drawSummaryRow(ctx, 86, 1080, 908, 'รวมรายได้ทุกงาน', `${number(totalIncome, 2)} บาท`, { green: true, strong: true });

  drawSection(ctx, 64, 1170, 952, 492, '#ffffff', '#dbeafe');
  drawText(ctx, 'รายละเอียดน้ำมัน', 92, 1194, 420, { size: 27, weight: 950, color: '#0f172a', maxLines: 1 });
  drawText(ctx, 'ข้อมูลสำคัญสำหรับตรวจสอบเที่ยวงาน', 92, 1232, 520, { size: 18, weight: 800, color: '#64748b', maxLines: 1 });

  const cardWidth = 432;
  const cardHeight = 108;
  const left = 86;
  const right = 562;
  drawInfoCard(ctx, left, 1272, cardWidth, cardHeight, 'วันที่/เวลาเติม', fillDateText(row), 'slate');
  drawInfoCard(ctx, right, 1272, cardWidth, cardHeight, 'ระยะทาง', distance ? `${number(distance, 2)} กม.` : '-', 'blue');
  drawInfoCard(ctx, left, 1394, cardWidth, cardHeight, 'ลิตรเติมจริง', liters ? `${number(liters, 2)} ลิตร` : '-', 'blue');
  drawInfoCard(ctx, right, 1394, cardWidth, cardHeight, 'ลิตรมาตรฐาน', `${number(standardLiters, 2)} ลิตร`, 'blue');
  drawInfoCard(ctx, left, 1516, cardWidth, cardHeight, 'ส่วนต่างการใช้', `${varianceLiters > 0 ? '+' : ''}${number(varianceLiters, 2)} ลิตร`, varianceLiters > 0 ? 'danger' : 'green');
  drawInfoCard(ctx, right, 1516, cardWidth, cardHeight, 'ค่าใช้จ่ายเติมจริง', money(amount), 'green');

  drawSection(ctx, 64, 1686, 952, 146, '#f8fafc', '#e2e8f0');
  drawText(ctx, `หัวจ่ายก่อน ${before}   •   หัวจ่ายหลัง ${after}`, 92, 1712, 820, {
    size: 20,
    weight: 900,
    color: '#334155',
    maxLines: 1,
  });
  drawText(ctx, `ผู้กรอก ${recorder}   •   รูปแนบ ${photos} ไฟล์`, 92, 1750, 820, {
    size: 20,
    weight: 900,
    color: '#334155',
    maxLines: 1,
  });
  drawText(ctx, 'สร้างจากระบบ Test System', 92, 1792, 650, {
    size: 17,
    weight: 800,
    color: '#94a3b8',
    maxLines: 1,
  });
  drawText(ctx, new Date().toLocaleString('th-TH'), 988, 1792, 300, {
    size: 17,
    weight: 700,
    color: '#94a3b8',
    align: 'right',
    maxLines: 1,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('สร้างรูปสรุปปิดงานไม่สำเร็จ'));
    }, 'image/png', 0.96);
  });
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
        title: 'ใบสรุปรายการ Test System',
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
