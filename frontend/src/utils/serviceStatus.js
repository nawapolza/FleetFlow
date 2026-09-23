import { API_BASE_URL, getApiOrigin } from '../api.js';

/** Public readiness probe; never includes credentials or personal data. */
export async function checkServiceStatus() {
  if (import.meta.env.PROD && API_BASE_URL.startsWith('/')) {
    return { ok: false, message: 'ยังไม่ได้ตั้งค่า VITE_API_URL ใน Render Static Site ให้ชี้ไป Backend Web Service แล้ว Deploy Frontend ใหม่' };
  }
  const origin = getApiOrigin();
  try {
    const response = await fetch(`${origin}/health-ready`, { cache: 'no-store' });
    const data = await response.json();
    if (response.ok && data.success === true) return { ok: true, message: 'Backend และ MongoDB พร้อมใช้งาน สามารถลองบันทึกหรือกู้บัญชีอีกครั้ง' };
    const details = data.code === 'DB_NOT_CONFIGURED' ? 'Backend ยังไม่ได้ตั้งค่า MongoDB' :
      data.code === 'DB_INIT_FAILED' ? 'ฐานข้อมูลเชื่อมต่อได้ แต่เตรียมดัชนีหรือข้อมูลเริ่มต้นไม่สำเร็จ ให้ตรวจ Backend Logs' :
      data.code === 'DB_UNAVAILABLE' ? 'Backend ยังติดต่อ MongoDB ไม่ได้ ให้ตรวจ Atlas และ Backend Logs' :
      'Backend ยังไม่พร้อม ให้ตรวจ Render Backend Logs';
    return { ok: false, message: details };
  } catch (_) {
    return { ok: false, message: 'ติดต่อ Backend ไม่ได้ ให้ตรวจ VITE_API_URL, การ Deploy และ CORS บน Render' };
  }
}
