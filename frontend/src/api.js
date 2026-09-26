const TOKEN_KEY = 'oilops_token';
const USER_KEY = 'oilops_user';
const BRANCH_KEY = 'oilops_active_branch_v62';
const BRANCHES_CACHE_KEY = 'oilops_branches_cache_v1';

function normalizeBaseUrl(url) {
  const raw = String(url || import.meta.env.VITE_API_URL || '/api').trim();
  // The local Vite proxy is not available on a deployed Render Static Site.
  if (import.meta.env.PROD && (!raw || raw === '/api' || raw.startsWith('/api/'))) {
    return '/api'; // Requests below explain precisely how to configure Render.
  }
  return raw.replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBaseUrl();

export function getApiOrigin() {
  if (API_BASE_URL.startsWith('/')) return window.location.origin;
  return API_BASE_URL.replace(/\/api\/?$/i, '').replace(/\/index\.php\/?$/i, '').replace(/\/$/, '');
}

function configurationError() {
  const err = new Error('เว็บไซต์ยังไม่ได้ตั้งค่า Backend: เปิด Render Static Site > Environment แล้วตั้ง VITE_API_URL เป็น URL ของ Backend Web Service (ไม่ใช่ URL หน้าเว็บ) จากนั้น Deploy เว็บไซต์ใหม่');
  err.code = 'API_CONFIG';
  return err;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getActiveBranchId() {
  return localStorage.getItem(BRANCH_KEY) || '';
}

export function setActiveBranchId(branchId) {
  if (branchId) localStorage.setItem(BRANCH_KEY, String(branchId));
  else localStorage.removeItem(BRANCH_KEY);
}

export function getStoredBranches() {
  try {
    const rows = JSON.parse(localStorage.getItem(BRANCHES_CACHE_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch (_) { return []; }
}

export function setStoredBranches(rows) {
  try { localStorage.setItem(BRANCHES_CACHE_KEY, JSON.stringify(Array.isArray(rows) ? rows : [])); } catch (_) {}
}

export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(BRANCH_KEY);
  localStorage.removeItem(BRANCHES_CACHE_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function buildUrl(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${suffix}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch (_) {
    const err = new Error('เซิร์ฟเวอร์ส่งข้อมูลที่ไม่ใช่ API กลับมา กรุณาตรวจสอบค่า VITE_API_URL ว่าชี้ไปยัง Backend Web Service ของ Render');
    err.code = 'INVALID_API_RESPONSE';
    err.status = response.status;
    throw err;
  }
  if (!contentType.includes('json') && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    const err = new Error('ไม่พบ API สำหรับเข้าสู่ระบบ กรุณาตรวจสอบการเชื่อมต่อ Backend');
    err.code = 'INVALID_API_RESPONSE';
    err.status = response.status;
    throw err;
  }
  if (!response.ok || data.success === false) {
    const err = new Error(data.message || `เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status}`);
    err.status = response.status;
    err.code = data.code || 'API_ERROR';
    err.data = data;
    throw err;
  }
  return data;
}

async function fetchApi(url, options) {
  try { return await fetch(url, options); }
  catch (_) {
    const err = new Error('เชื่อมต่อ Backend ไม่ได้ กรุณาตรวจสอบว่า Render Backend เปิดอยู่ ตั้ง VITE_API_URL ถูกต้อง และเพิ่มโดเมนเว็บไซต์ใน CORS_ALLOWED_ORIGINS');
    err.code = 'NETWORK_ERROR';
    throw err;
  }
}

// A simultaneous identical GET shares one network request. Mutating methods are never deduplicated.
const pendingReads = new Map();
export function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const branchId = getActiveBranchId();
  if (branchId) headers.set('X-Branch-Id', branchId);
  if (!(options.body instanceof FormData) && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const method = String(options.method || 'GET').toUpperCase();
  if (import.meta.env.PROD && API_BASE_URL.startsWith('/') && path.startsWith('/auth/')) {
    return Promise.reject(configurationError());
  }
  const requestUrl = buildUrl(path);
  const shareable = method === 'GET' && !options.signal && options.body === undefined;
  const requestKey = shareable ? `${requestUrl}|${token}|${branchId}` : null;
  if (requestKey && pendingReads.has(requestKey)) return pendingReads.get(requestKey);
  const promise = fetchApi(requestUrl, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }).then(parseResponse);
  if (!requestKey) return promise;
  pendingReads.set(requestKey, promise);
  promise.finally(() => { if (pendingReads.get(requestKey) === promise) pendingReads.delete(requestKey); }).catch(() => {});
  return promise;
}

function query(params = {}) {
  const clean = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') clean[key] = value;
  });
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  adminRecovery: (body) => apiRequest('/auth/admin-recovery', { method: 'POST', body }),
  changePassword: (body) => apiRequest('/auth/change-password', { method: 'POST', body }),
  login: (username, password) => apiRequest('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => apiRequest('/auth/me'),
  branches: () => apiRequest('/branches'),
  createBranch: (body) => apiRequest('/branches', { method: 'POST', body }),
  updateBranch: (id, body) => apiRequest(`/branches/${id}`, { method: 'PUT', body }),
  deleteBranch: (id) => apiRequest(`/branches/${id}`, { method: 'DELETE' }),
  dashboard: (params = {}) => apiRequest(`/dashboard/stats${query(params)}`),
  itemTypes: () => apiRequest('/item-types'),
  metaFields: () => apiRequest('/meta/fields'),
  deliveries: (params = {}) => apiRequest(`/deliveries${query(params)}`),
  deliveryJobFinance: (period) => apiRequest(`/delivery-job-finance?period=${encodeURIComponent(period)}`),
  driverFinance: (period) => apiRequest(`/driver-finance${query({period})}`),
  billingSummary: (params = {}) => apiRequest(`/billing/summary${query(params)}`),
  createDriverTrip: (body) => apiRequest('/driver-finance/trips',{method:'POST',body}),
  updateDriverTrip: (id,body) => apiRequest(`/driver-finance/trips/${id}`,{method:'PUT',body}),
  deleteDriverTrip: (id) => apiRequest(`/driver-finance/trips/${id}`,{method:'DELETE'}),
  createDriverAdvance: (body) => apiRequest('/driver-finance/advances',{method:'POST',body}),
  updateDriverAdvance: (id,body) => apiRequest(`/driver-finance/advances/${id}`,{method:'PUT',body}),
  deleteDriverAdvance: (id) => apiRequest(`/driver-finance/advances/${id}`,{method:'DELETE'}),
  transportMaterials: () => apiRequest('/transport-materials'),
  createTransportMaterial: (body) => apiRequest('/driver-finance/materials',{method:'POST',body}),
  updateTransportMaterial: (id,body) => apiRequest(`/driver-finance/materials/${id}`,{method:'PUT',body}),
  deleteTransportMaterial: (id) => apiRequest(`/driver-finance/materials/${id}`,{method:'DELETE'}),
  tripFinance: (period) => apiRequest(`/trip-finance${query({ period })}`),
  createTripFinance: (body) => apiRequest('/trip-finance', { method: 'POST', body }),
  updateTripFinance: (id, body) => apiRequest(`/trip-finance/${id}`, { method: 'PUT', body }),
  deleteTripFinance: (id) => apiRequest(`/trip-finance/${id}`, { method: 'DELETE' }),
  transportLedger: (month) => apiRequest(`/transport-ledger${query({ month })}`),
  createTransportLedger: (body) => apiRequest('/transport-ledger', { method: 'POST', body }),
  updateTransportLedger: (id, body) => apiRequest(`/transport-ledger/${id}`, { method: 'PUT', body }),
  deleteTransportLedger: (id) => apiRequest(`/transport-ledger/${id}`, { method: 'DELETE' }),
  createDelivery: (formData) => apiRequest('/deliveries', { method: 'POST', body: formData }),
  updateDelivery: (id, formData) => apiRequest(`/deliveries/${id}`, { method: 'PUT', body: formData }),
  deleteDelivery: (id) => apiRequest(`/deliveries/${id}`, { method: 'DELETE' }),
  stockStatus: () => apiRequest('/stocks/status'),
  stocks: () => apiRequest('/stocks'),
  stockTransactions: () => apiRequest('/stocks/transactions'),
  stockAudits: () => apiRequest('/stocks/audits'),
  auditStock: (body) => apiRequest('/stocks/audit', { method: 'POST', body }),
  updateStockSettings: (itemType, body) => apiRequest(`/stocks/${encodeURIComponent(itemType)}/settings`, { method: 'PUT', body }),
  addStock: (formData) => apiRequest('/stocks/add', { method: 'POST', body: formData }),
  adjustStock: (body) => apiRequest('/stocks/adjust', { method: 'POST', body }),
  users: () => apiRequest('/users'),
  createUser: (body) => apiRequest('/users', { method: 'POST', body }),
  updateUser: (id, body) => apiRequest(`/users/${id}`, { method: 'PUT', body }),
  deleteUser: (id) => apiRequest(`/users/${id}`, { method: 'DELETE' }),
  vehicles: () => apiRequest('/vehicles'),
  vehicleOptions: () => apiRequest('/vehicles/options'),
  createVehicle: (body) => apiRequest('/vehicles', { method: 'POST', body }),
  updateVehicle: (id, body) => apiRequest(`/vehicles/${id}`, { method: 'PUT', body }),
  deleteVehicle: (id) => apiRequest(`/vehicles/${id}`, { method: 'DELETE' }),
  monthlyReport: (month) => apiRequest(`/reports/monthly${query({ month })}`),
  notifications: () => apiRequest('/notifications'),
  markNotificationRead: (id) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
};

export function uploadUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)\/\//i.test(path) || String(path).startsWith('data:') || String(path).startsWith('blob:')) return path;
  const base = getApiOrigin();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
