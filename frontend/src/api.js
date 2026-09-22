const TOKEN_KEY = 'oilops_token';
const USER_KEY = 'oilops_user';
const BRANCH_KEY = 'oilops_active_branch_v62';

function normalizeBaseUrl(url) {
  const raw = url || import.meta.env.VITE_API_URL || '/api';
  return String(raw).replace(/\/$/, '');
}

export const API_BASE_URL = normalizeBaseUrl();

export function getApiOrigin() {
  if (API_BASE_URL.startsWith('/')) return window.location.origin;
  return API_BASE_URL
    .replace(/\/api\/?$/i, '')
    .replace(/\/index\.php\/?$/i, '')
    .replace(/\/$/, '');
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

export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(BRANCH_KEY);
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
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { success: false, message: text || 'ไม่สามารถอ่านคำตอบจากเซิร์ฟเวอร์' };
  }
  if (!response.ok || data.success === false) {
    const err = new Error(data.message || `HTTP ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const branchId = getActiveBranchId();
  if (branchId) headers.set('X-Branch-Id', branchId);
  if (!(options.body instanceof FormData) && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return parseResponse(response);
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
  searchPlaces: (text) => apiRequest(`/maps/search${query({ q: text })}`),
  mapStatus: () => apiRequest('/maps/status'),
  importGoogleMapsLink: (url) => apiRequest('/maps/import-google-link', { method: 'POST', body: { url } }),
  reversePlace: (lat, lon) => apiRequest(`/maps/reverse${query({ lat, lon })}`),
  calculateRoute: (originLat, originLon, destinationLat, destinationLon) => apiRequest(`/maps/route${query({ origin_lat: originLat, origin_lon: originLon, destination_lat: destinationLat, destination_lon: destinationLon })}`),
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
