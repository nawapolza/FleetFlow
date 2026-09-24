try {
  require('dotenv').config();
} catch (error) {
  console.log('dotenv not loaded, using Render environment variables');
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const derivePassword = promisify(crypto.scrypt);
const PASSWORD_MAX_BYTES = 4096; // Bound work/memory; no UI character-count restriction.
function validPassword(value) { return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES; }
async function hashPassword(value) {
  if (!validPassword(value)) throw Object.assign(new Error('กรุณากรอกรหัสผ่าน (ข้อมูลไม่เกิน 4096 ไบต์)'), { status: 422 });
  const salt = crypto.randomBytes(16);
  const hash = await derivePassword(value, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
async function verifyPassword(value, stored) {
  if (!validPassword(value) || typeof stored !== 'string') return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3 || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
    const expected = Buffer.from(parts[2], 'hex');
    const actual = await derivePassword(value, Buffer.from(parts[1], 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  }
  if (stored.startsWith('$2')) return bcrypt.compare(value, stored); // Existing users still work.
  return value === stored; // Read-only legacy compatibility; updated credentials use scrypt.
}

const { MongoClient, ObjectId } = require('mongodb');
const config = require('./config');
const { createCompatibleIndex } = require('./indexCompatibility');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
  pingInterval: 10000,
  pingTimeout: 20000,
});

io.on('connection', (socket) => {
  socket.emit('server:hello', { success: true, build: 'test-system-v1-pastel', at: new Date().toISOString() });
});
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ITEM_TYPES = ['ดีเซล', 'น้ำมันเครื่อง', 'แอดบลู'];
const ITEM_TYPE_MAP = {
  diesel: 'ดีเซล',
  'ดีเซล': 'ดีเซล',
  'น้ำมันดีเซล': 'ดีเซล',
  engine_oil: 'น้ำมันเครื่อง',
  oil_engine: 'น้ำมันเครื่อง',
  motor_oil: 'น้ำมันเครื่อง',
  'น้ำมันเครื่อง': 'น้ำมันเครื่อง',
  adblue: 'แอดบลู',
  'แอดบลู': 'แอดบลู',
  'น้ำแอดบลู': 'แอดบลู',
};

const DEFAULT_STOCK_SETTINGS = {
  'ดีเซล': {
    tank_name: 'ถังดีเซลหลัก',
    capacity_liters: 1000,
    reorder_level_liters: 300,
    critical_level_liters: 100,
  },
  'น้ำมันเครื่อง': {
    tank_name: 'คลังน้ำมันเครื่อง',
    capacity_liters: 200,
    reorder_level_liters: 60,
    critical_level_liters: 20,
  },
  'แอดบลู': {
    tank_name: 'ถังแอดบลู',
    capacity_liters: 500,
    reorder_level_liters: 150,
    critical_level_liters: 50,
  },
};

const DEFAULT_BRANCH = {
  code: 'HQ',
  name: 'สำนักงานใหญ่',
  address: '',
  phone: '',
};

let mongoClient = null;
let mongoDb = null;
let mongoDbPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone || 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function jsonResponse(res, data, status = 200) {
  return res.status(status).json(data);
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function oidOrNull(id) {
  if (id instanceof ObjectId) return id;
  const text = String(id || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(text)) return null;
  try {
    return new ObjectId(text);
  } catch (_) {
    return null;
  }
}

function parseDateOrNull(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeDecimalText(value) {
  if (value === undefined || value === null || value === '') return '';
  let text = String(value)
    .replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d))
    .replace(/[−–—]/g, '-')
    .replace(/[٫．]/g, '.')
    .replace(/\s+/g, '')
    .trim();

  // มือถือบางรุ่นผู้ใช้กด : แทนจุดทศนิยม เช่น 100:20 ให้เป็น 100.20
  if (text.includes(':') && !text.includes('.') && !text.includes(',')) {
    const parts = text.split(':');
    if (parts.length === 2 && /^-?\d+$/.test(parts[0]) && /^\d{1,6}$/.test(parts[1])) {
      text = `${parts[0]}.${parts[1]}`;
    }
  }

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (hasComma && !hasDot) {
    const parts = text.split(',');
    if (parts.length === 2) {
      const [whole, frac] = parts;
      // คอมม่าอาจเป็นทศนิยมจากมือถือ เช่น 100,20 หรือเป็นหลักพัน เช่น 8,325 / 10,800
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
  if (firstDot !== -1) text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '');
  return text;
}

function toNumber(value, defaultValue = 0) {
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

function preciseSubtract(afterValue, beforeValue, digits = 2) {
  const scale = Math.max(digits, decimalPlaces(afterValue), decimalPlaces(beforeValue));
  const afterInt = toScaledInteger(afterValue, scale);
  const beforeInt = toScaledInteger(beforeValue, scale);
  return round2((afterInt - beforeInt) / (10 ** scale));
}

function round2(value) {
  const n = toNumber(value, 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function hasDecimalPart(value) {
  const n = Math.abs(toNumber(value, 0));
  return Math.abs(n - Math.trunc(n)) > 0;
}

function pickBestLiterValue(...values) {
  const candidates = values.map((value) => round2(value)).filter((value) => Number.isFinite(value) && value > 0);
  if (!candidates.length) return 0;
  const decimalCandidate = candidates.find((value) => hasDecimalPart(value));
  return decimalCandidate || candidates[0];
}

function expectedAmountFromPrice(quantityLiters, priceBahtPerLiter) {
  const qty = toNumber(quantityLiters, 0);
  const price = toNumber(priceBahtPerLiter, 0);
  return qty > 0 && price > 0 ? round2(qty * price) : 0;
}

function correctAmountIfCommaBug(amountValue, quantityLiters, priceBahtPerLiter) {
  const amount = round2(amountValue);
  const expected = expectedAmountFromPrice(quantityLiters, priceBahtPerLiter);
  if (expected <= 0) return amount;
  // กันข้อมูลเก่าที่เคยถูกอ่านคอมม่าเป็นทศนิยม เช่น 8,325 -> 8.32
  if (!amount || (expected >= 1000 && amount < expected * 0.2)) return expected;
  return amount;
}

function cleanString(value, defaultValue = '') {
  if (value === undefined || value === null) return defaultValue;
  return String(value).trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeRegex(text) {
  return new RegExp(escapeRegExp(text), 'i');
}

function realtimePayload(kind, action, data = {}) {
  return { kind, action, data, at: nowIso() };
}

function emitDataChanged(kind, action, data = {}) {
  const payload = realtimePayload(kind, action, data);
  try {
    io.emit(`${kind}:changed`, payload);
    io.emit('realtime:update', payload);
  } catch (err) {
    console.warn('Realtime emit skipped:', err.message);
  }
}

function normalizeItemType(value) {
  const key = cleanString(value).toLowerCase();
  return ITEM_TYPE_MAP[key] || ITEM_TYPE_MAP[cleanString(value)] || null;
}

function isStockIntakeOperation(value) {
  return ['เติมสต๊อก', 'เช็คเติมสต๊อก'].includes(cleanString(value));
}

function monthFromDate(value) {
  const date = parseDateOrNull(value) || today();
  return date.slice(0, 7);
}

function mongoToPlain(value) {
  if (!value) return value;
  if (value instanceof ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => mongoToPlain(item));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '_id') out.id = mongoToPlain(item);
      else out[key] = mongoToPlain(item);
    }
    return out;
  }
  return value;
}

function publicUser(user) {
  if (!user) return null;
  const out = mongoToPlain(user);
  delete out.password_hash;
  delete out.password;
  return out;
}

async function ensureDefaultBranch(db) {
  let branch = await db.collection('branches').findOne({ is_active: { $ne: 0 } }, { sort: { is_default: -1, created_at: 1 } });
  if (!branch) {
    const doc = {
      ...DEFAULT_BRANCH,
      is_default: 1,
      is_active: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const result = await db.collection('branches').insertOne(doc);
    branch = { ...doc, _id: result.insertedId };
  }
  if (!branch.is_default) {
    await db.collection('branches').updateOne({ _id: branch._id }, { $set: { is_default: 1, updated_at: nowIso() } });
    branch.is_default = 1;
  }
  return branch;
}

async function findBranch(db, value, { includeInactive = false } = {}) {
  const text = cleanString(value);
  if (!text || text === 'all') return null;
  const filter = includeInactive ? {} : { is_active: { $ne: 0 } };
  const oid = oidOrNull(text);
  if (oid) filter._id = oid;
  else filter.code = text.toUpperCase();
  return db.collection('branches').findOne(filter);
}

async function resolveBranchContext(db, user, reqLike = {}) {
  const headers = reqLike.headers || {};
  const query = reqLike.query || {};
  const body = reqLike.body || {};
  const requested = cleanString(headers['x-branch-id'] || headers['X-Branch-Id'] || query.branch_id || body.branch_id);
  let branch = null;
  if ((user?.role || '') === 'owner' && requested) branch = await findBranch(db, requested);
  if (!branch && user?.branch_id) branch = await findBranch(db, user.branch_id);
  if (!branch) branch = await ensureDefaultBranch(db);
  return mongoToPlain(branch);
}

function branchFields(branch) {
  return {
    branch_id: cleanString(branch?.id || branch?._id),
    branch_code: cleanString(branch?.code),
    branch_name: cleanString(branch?.name) || DEFAULT_BRANCH.name,
  };
}

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  String(cookieHeader).split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  const xAccessToken = req.headers['x-access-token'];
  if (xAccessToken) return String(xAccessToken).trim();
  const cookies = parseCookieHeader(req.headers.cookie);
  if (cookies.token) return cookies.token;
  if (cookies.accessToken) return cookies.accessToken;
  if (req.query && req.query.token) return String(req.query.token).trim();
  return null;
}

function signUserToken(user) {
  const id = String(user.id || user._id || '');
  return jwt.sign(
    {
      sub: id,
      id,
      user_id: id,
      role: user.role || 'employee',
      username: user.username || '',
      auth_version: Number(user.auth_version || 0),
    },
    config.jwtSecret,
    { expiresIn: Number(config.jwtExpireSeconds || 60 * 60 * 24 * 7) },
  );
}

async function ensureIndexes(db) {
  // V62: เปลี่ยนสต๊อกจาก unique เฉพาะประเภท เป็น unique ต่อ “สาขา + ประเภท”
  try { await db.collection('stocks').dropIndex('item_type_1'); } catch (_) {}

  // Legacy deployments sometimes have a non-sparse unique users.email_1 index.
  // Several username-only accounts then all receive email:null and the second
  // insert fails with E11000. Drop ONLY that legacy optional-email index.
  // Authentication here is by the unique username index, not by email.
  const userIndexes = await db.collection('users').indexes();
  const legacyEmailIndex = userIndexes.find((index) => index.name === 'email_1'
    && index.unique === true && index.key?.email === 1
    && Object.keys(index.key).length === 1);
  if (legacyEmailIndex) {
    await db.collection('users').dropIndex('email_1');
    console.log('[users] Removed legacy unique email_1 index; username remains unique');
  }

  // Old database versions stored vehicles.plate, but the current application
  // writes vehicles.plate_no. A unique index on the OLD optional plate field
  // treats every missing/null value as a duplicate and breaks the second car.
  // Only remove the exact obsolete index; do not touch vehicle records or
  // indexes on plate_no, which is the actual application field.
  const vehicleCollection = db.collection('vehicles');
  const vehicleIndexes = await vehicleCollection.indexes();
  const obsoletePlateIndex = vehicleIndexes.find((index) =>
    index.unique === true && index.key?.plate === 1 &&
    Object.keys(index.key).length === 1 && index.name !== '_id_');
  if (obsoletePlateIndex) {
    await vehicleCollection.dropIndex(obsoletePlateIndex.name);
    console.log(`[vehicles] Removed obsolete unique index ${obsoletePlateIndex.name} on optional field plate`);
  }

  // Reuse compatible legacy indexes instead of recreating them with different
  // options (notably the existing users.username_1 unique+sparse index).
  await Promise.all([
    createCompatibleIndex(db.collection('branches'), { code: 1 }, { unique: true }, 'branches'),
    createCompatibleIndex(db.collection('branches'), { is_active: 1, is_default: -1 }, 'branches'),
    createCompatibleIndex(db.collection('users'), { username: 1 }, { unique: true }, 'users'),
    createCompatibleIndex(db.collection('users'), { branch_id: 1, is_active: 1 }, 'users'),
    createCompatibleIndex(db.collection('deliveries'), { branch_id: 1, work_date: -1 }, 'deliveries'),
    createCompatibleIndex(db.collection('deliveries'), { user_id: 1, work_date: -1 }, 'deliveries'),
    createCompatibleIndex(db.collection('deliveries'), { vehicle_id: 1 }, 'deliveries'),
    createCompatibleIndex(db.collection('deliveries'), { item_type: 1, fill_date: -1 }, 'deliveries'),
    createCompatibleIndex(db.collection('deliveries'), { 'jobs.origin_place': 1 }, 'deliveries'),
    createCompatibleIndex(db.collection('deliveries'), { 'jobs.destination_place': 1 }, 'deliveries'),
    createCompatibleIndex(db.collection('vehicles'), { branch_id: 1, plate_no: 1 }, 'vehicles'),
    createCompatibleIndex(db.collection('transport_ledger'), { branch_id: 1, date: -1, vehicle_id: 1 }, 'transport_ledger'),
    createCompatibleIndex(db.collection('trip_finance'), { branch_id: 1, date: -1, vehicle_id: 1 }, 'trip_finance'),
    createCompatibleIndex(db.collection('vehicles'), { user_id: 1, plate_no: 1 }, 'vehicles'),
    createCompatibleIndex(db.collection('notifications'), { branch_id: 1, created_at: -1 }, 'notifications'),
    createCompatibleIndex(db.collection('notifications'), { delivery_id: 1, created_at: -1 }, 'notifications'),
    createCompatibleIndex(db.collection('notifications'), { kind: 1, branch_id: 1, item_type: 1, is_read: 1, created_at: -1 }, 'notifications'),
    createCompatibleIndex(db.collection('stocks'), { branch_id: 1, item_type: 1 }, { unique: true }, 'stocks'),
    createCompatibleIndex(db.collection('stock_movements'), { branch_id: 1, item_type: 1, transaction_date: -1 }, 'stock_movements'),
    createCompatibleIndex(db.collection('stock_transactions'), { branch_id: 1, item_type: 1, transaction_date: -1 }, 'stock_transactions'),
    createCompatibleIndex(db.collection('stock_audits'), { branch_id: 1, item_type: 1, audit_date: -1 }, 'stock_audits'),
    createCompatibleIndex(db.collection('stock_audits'), { created_at: -1 }, 'stock_audits'),
    createCompatibleIndex(db.collection('uploaded_files'), { created_at: -1 }, 'uploaded_files'),
  ]);

  const defaultBranchDoc = await ensureDefaultBranch(db);
  const defaultBranch = branchFields(mongoToPlain(defaultBranchDoc));

  // ย้ายข้อมูล V61 เดิมเข้าสำนักงานใหญ่โดยไม่ลบข้อมูลเก่า
  const migrateCollections = ['deliveries', 'stock_movements', 'stock_transactions', 'stock_audits', 'notifications', 'vehicles'];
  for (const collectionName of migrateCollections) {
    await db.collection(collectionName).updateMany(
      { $or: [{ branch_id: { $exists: false } }, { branch_id: '' }, { branch_id: null }] },
      { $set: { ...defaultBranch, updated_at: nowIso() } },
    );
  }
  await db.collection('users').updateMany(
    { role: { $ne: 'owner' }, $or: [{ branch_id: { $exists: false } }, { branch_id: '' }, { branch_id: null }] },
    { $set: { ...defaultBranch, updated_at: nowIso() } },
  );
  await db.collection('users').updateMany(
    { role: 'owner', $or: [{ branch_id: { $exists: false } }, { branch_id: '' }, { branch_id: null }] },
    { $set: { ...defaultBranch, updated_at: nowIso() } },
  );
  await db.collection('stocks').updateMany(
    { $or: [{ branch_id: { $exists: false } }, { branch_id: '' }, { branch_id: null }] },
    { $set: { ...defaultBranch, updated_at: nowIso() } },
  );

  // Protect new active vehicles against concurrent duplicate registrations.
  // Historical duplicate records are NOT removed or modified automatically.
  // If legacy duplicates prevent the new index from being created, continue
  // serving data and log a warning so an owner can reconcile those records.
  try {
    await vehicleCollection.createIndex(
      { branch_id: 1, plate_no: 1 },
      { name: 'unique_active_branch_plate_no_v2', unique: true,
        partialFilterExpression: {
          branch_id: { $type: 'string' },
          plate_no: { $type: 'string' },
          is_active: 1,
        } },
    );
  } catch (error) {
    if (error.code === 11000 || error.code === 85 || error.code === 86) {
      console.warn('[vehicles] Existing duplicate plates or index conflict; unique active-plate index was not created. Review historical vehicle records.', error.message);
    } else throw error;
  }

  const branches = await db.collection('branches').find({ is_active: { $ne: 0 } }).toArray();
  for (const branchDoc of branches) {
    const branch = branchFields(mongoToPlain(branchDoc));
    for (const itemType of ITEM_TYPES) {
      const defaults = DEFAULT_STOCK_SETTINGS[itemType] || DEFAULT_STOCK_SETTINGS['ดีเซล'];
      await db.collection('stocks').updateOne(
        { branch_id: branch.branch_id, item_type: itemType },
        {
          // Only INSERT-ONLY fields belong here. MongoDB rejects a path
          // present in both $setOnInsert and $set (code 40), even on upsert.
          // branch_id and item_type already come from the equality filter;
          // other branch fields are written by $set below.
          $setOnInsert: {
            balance_liters: 0,
            tank_name: defaults.tank_name,
            capacity_liters: defaults.capacity_liters,
            reorder_level_liters: defaults.reorder_level_liters,
            critical_level_liters: defaults.critical_level_liters,
            last_alert_status: 'ready',
            created_at: nowIso(),
          },
          $set: { ...branch, updated_at: nowIso() },
        },
        { upsert: true },
      );
      const missingFieldUpdates = [
        ['tank_name', defaults.tank_name],
        ['capacity_liters', defaults.capacity_liters],
        ['reorder_level_liters', defaults.reorder_level_liters],
        ['critical_level_liters', defaults.critical_level_liters],
        ['last_alert_status', 'ready'],
      ];
      for (const [field, value] of missingFieldUpdates) {
        await db.collection('stocks').updateOne(
          { branch_id: branch.branch_id, item_type: itemType, [field]: { $exists: false } },
          { $set: { [field]: value, updated_at: nowIso() } },
        );
      }
    }
  }
}

async function getDb() {
  if (mongoDb) return mongoDb;
  if (mongoDbPromise) return mongoDbPromise;
  if (!config.mongodb.uri) throw new Error('MONGODB_URI is not set');
  // The first simultaneous API calls share the same initialization/migration.
  mongoDbPromise = (async () => {
    const client = new MongoClient(config.mongodb.uri, { serverSelectionTimeoutMS: 10000 });
    try {
      await client.connect();
      const db = client.db(config.mongodb.db);
      await ensureIndexes(db);
      mongoClient = client;
      mongoDb = db;
      return db;
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
  })();
  try { return await mongoDbPromise; }
  finally { mongoDbPromise = null; }
}

async function currentUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (_) {
    return null;
  }
  const possibleId = payload.sub || payload.id || payload.user_id || payload.uid;
  const oid = oidOrNull(possibleId);
  let user = null;
  if (oid) {
    user = await req.db.collection('users').findOne(
      { _id: oid, is_active: { $ne: 0 } },
      { projection: { password_hash: 0, password: 0 } },
    );
  }
  if (!user && payload.username) {
    user = await req.db.collection('users').findOne(
      { username: String(payload.username), is_active: { $ne: 0 } },
      { projection: { password_hash: 0, password: 0 } },
    );
  }
  if (user && Number(payload.auth_version || 0) !== Number(user.auth_version || 0)) return null;
  return publicUser(user);
}

async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user) return jsonResponse(res, { success: false, message: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  req.user = user;
  return next();
}

function requireOwner(req, res, next) {
  if ((req.user?.role || '') !== 'owner') return jsonResponse(res, { success: false, message: 'ไม่มีสิทธิ์สำหรับหน้านี้' }, 403);
  return next();
}

async function findUserPublic(db, id) {
  const oid = oidOrNull(id);
  if (!oid) return null;
  const user = await db.collection('users').findOne({ _id: oid }, { projection: { password_hash: 0, password: 0 } });
  return publicUser(user);
}

async function findVehiclePublic(db, id) {
  const oid = oidOrNull(id);
  if (!oid) return null;
  return mongoToPlain(await db.collection('vehicles').findOne({ _id: oid }));
}

async function resolveVehicleId(db, user, data, branch = null) {
  if (data.vehicle_id) {
    const oid = oidOrNull(data.vehicle_id);
    if (!oid) return null;
    const filter = { _id: oid, is_active: { $ne: 0 } };
    if (branch?.id) filter.branch_id = branch.id;
    if ((user.role || '') !== 'owner') filter.$or = [
      { user_id: String(user.id) },
      { user_id: '' },
      { user_id: null },
      { user_id: { $exists: false } },
    ];
    const vehicle = await db.collection('vehicles').findOne(filter, { projection: { _id: 1 } });
    return vehicle ? String(vehicle._id) : null;
  }

  const plate = cleanString(data.plate_no);
  if (!plate) return null;
  const vehicleUserId = (user.role || '') === 'owner' ? cleanString(data.user_id) : String(user.id);
  const vehicleNo = cleanString(data.vehicle_no) || null;
  const driverName = cleanString(data.driver_name) || ((user.role || '') === 'owner' ? null : (user.name || null));

  const existingFilter = { plate_no: plate, branch_id: cleanString(branch?.id), is_active: { $ne: 0 } };
  if ((user.role || '') !== 'owner') existingFilter.$or = [
    { user_id: String(user.id) },
    { user_id: '' },
    { user_id: null },
    { user_id: { $exists: false } },
  ];
  const existing = await db.collection('vehicles').findOne(existingFilter, { sort: { created_at: -1 }, projection: { _id: 1 } });
  if (existing) return String(existing._id);

  const duplicatePlate = await db.collection('vehicles').findOne(
    { plate_no: plate, branch_id: cleanString(branch?.id), is_active: { $ne: 0 } },
    { projection: { _id: 1 } },
  );
  if (duplicatePlate) return null;

  let result;
  try {
    result = await db.collection('vehicles').insertOne({
    ...branchFields(branch || {}),
    user_id: vehicleUserId,
    plate_no: plate,
    vehicle_no: vehicleNo,
    driver_name: driverName,
    description: 'เพิ่มจากหน้าบันทึกงาน',
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Another request may have created the same plate in parallel.
    const concurrent = await db.collection('vehicles').findOne(existingFilter, { projection: { _id: 1 } });
    if (concurrent) return String(concurrent._id);
    throw error;
  }
  return String(result.insertedId);
}


async function fileUrlFromFile(db, file) {
  if (!file) return null;
  try {
    const fullPath = file.path;
    const buffer = fs.readFileSync(fullPath);
    // เก็บรูป/ไฟล์ไว้ใน MongoDB ด้วย เพื่อไม่ให้รูปหายเมื่อ Render restart หรือ redeploy
    // ถ้าไฟล์ใหญ่มากเกินไป จะ fallback เป็นไฟล์ในเครื่องตามปกติ
    const maxDbBytes = Math.max(Number(config.uploadDbMaxMb || 10), 2) * 1024 * 1024;
    if (buffer.length <= maxDbBytes) {
      const result = await db.collection('uploaded_files').insertOne({
        filename: file.originalname || file.filename,
        stored_filename: file.filename,
        content_type: file.mimetype || 'application/octet-stream',
        size_bytes: buffer.length,
        data: buffer,
        created_at: nowIso(),
      });
      return `/uploads/db/${String(result.insertedId)}`;
    }
  } catch (err) {
    console.warn('DB upload store skipped:', err.message);
  }
  return `/uploads/${file.filename}`;
}

function toPhotoArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function uniqueList(items) {
  return [...new Set((items || []).filter(Boolean))];
}

async function appendUploadPhotos(db, files = {}, names = []) {
  const urls = [];
  for (const name of names) {
    const list = Array.isArray(files[name]) ? files[name] : [];
    for (const file of list) {
      const url = await fileUrlFromFile(db, file);
      if (url) urls.push(url);
    }
  }
  return urls;
}

async function extractPhotoFields(db, files = {}, existing = {}) {
  const categories = [
    { single: 'bill_photo', plural: 'bill_photos', aliases: ['bill_photo', 'bill_photos', 'receipt_photo', 'receipt_photos', 'photo'], existingSingles: ['bill_photo', 'receipt_photo'] },
    { single: 'document_photo', plural: 'document_photos', aliases: ['document_photo', 'document_photos'], existingSingles: ['document_photo'] },
    { single: 'oil_photo', plural: 'oil_photos', aliases: ['oil_photo', 'oil_photos'], existingSingles: ['oil_photo'] },
    { single: 'cargo_photo', plural: 'cargo_photos', aliases: ['cargo_photo', 'cargo_photos'], existingSingles: ['cargo_photo'] },
    { single: 'adblue_photo', plural: 'adblue_photos', aliases: ['adblue_photo', 'adblue_photos'], existingSingles: ['adblue_photo'] },
    { single: 'stock_photo', plural: 'stock_photos', aliases: ['stock_photo', 'stock_photos'], existingSingles: ['stock_photo'] },
  ];

  const photoFields = {};
  for (const category of categories) {
    const existingPhotos = [
      ...toPhotoArray(existing[category.plural]),
      ...category.existingSingles.flatMap((field) => toPhotoArray(existing[field])),
    ];
    const uploadedPhotos = await appendUploadPhotos(db, files, category.aliases);
    const allPhotos = uniqueList([...existingPhotos, ...uploadedPhotos]);
    photoFields[category.plural] = allPhotos;
    photoFields[category.single] = allPhotos[0] || '';
  }
  photoFields.receipt_photo = photoFields.bill_photo || '';
  return photoFields;
}


function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return null;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

const DELIVERY_JOB_COSTS = ['sand_cost_baht', 'stone_cost_baht', 'fuel_cost_baht', 'tire_cost_baht', 'parts_cost_baht', 'mechanic_cost_baht', 'driver_cost_baht', 'other_cost_baht'];
function deliveryJobHasContent(job = {}) {
  return Boolean(
    cleanString(job.cargo_name) ||
    cleanString(job.origin_place) ||
    cleanString(job.destination_place) ||
    cleanString(job.wage_payer) ||
    cleanString(job.note) ||
    parseDateOrNull(job.load_date) ||
    parseDateOrNull(job.unload_date) ||
    toNumber(job.distance_km, 0) > 0 ||
    toNumber(job.loading_weight_kg, 0) > 0 ||
    toNumber(job.unloading_weight_kg, 0) > 0 ||
    toNumber(job.cargo_stone_weight, 0) > 0 ||
    toNumber(job.cargo_sand_weight, 0) > 0 ||
    toNumber(job.trip_fee_baht, 0) > 0 ||
    toNumber(job.allowance_baht, 0) > 0 ||
    toNumber(job.other_income_baht, 0) > 0 ||
    DELIVERY_JOB_COSTS.some(key => toNumber(job[key], 0) > 0)
  );
}

function legacyDeliveryJob(source = {}) {
  return {
    id: cleanString(source.job_id) || 'job_1',
    job_no: 1,
    cargo_name: cleanString(source.cargo_name),
    origin_place: cleanString(source.origin_place),
    destination_place: cleanString(source.destination_place),
    load_date: parseDateOrNull(source.load_date),
    unload_date: parseDateOrNull(source.unload_date),
    distance_km: round2(Math.max(0, toNumber(source.distance_km, 0))),
    loading_weight_kg: round2(Math.max(0, toNumber(source.loading_weight_kg, 0))),
    unloading_weight_kg: round2(Math.max(0, toNumber(source.unloading_weight_kg, 0))),
    cargo_stone_weight: round2(Math.max(0, toNumber(source.cargo_stone_weight, 0))),
    cargo_sand_weight: round2(Math.max(0, toNumber(source.cargo_sand_weight, 0))),
    trip_fee_baht: round2(Math.max(0, toNumber(source.trip_fee_baht, 0))),
    allowance_baht: round2(Math.max(0, toNumber(source.allowance_baht, 0))),
    other_income_baht: round2(Math.max(0, toNumber(source.other_income_baht, 0))),
    ...Object.fromEntries(DELIVERY_JOB_COSTS.map(key => [key, round2(Math.max(0, toNumber(source[key], 0)))])),
    total_income_baht: round2(
      Math.max(0, toNumber(source.trip_fee_baht, 0)) +
      Math.max(0, toNumber(source.allowance_baht, 0)) +
      Math.max(0, toNumber(source.other_income_baht, 0)),
    ),
    wage_payer: cleanString(source.wage_payer),
    payment_status: cleanString(source.payment_status) || 'pending',
    note: cleanString(source.job_note),
  };
}

function normalizeDeliveryJobs(body = {}, existing = {}) {
  const submitted = parseJsonArray(body.jobs);
  const existingJobs = parseJsonArray(existing.jobs) || (Array.isArray(existing.jobs) ? existing.jobs : null);
  let rawJobs;

  if (submitted !== null) rawJobs = submitted;
  else if (existingJobs && existingJobs.length) rawJobs = existingJobs;
  else {
    const legacy = legacyDeliveryJob({ ...existing, ...body });
    rawJobs = deliveryJobHasContent(legacy) ? [legacy] : [];
  }

  return rawJobs
    .map((raw, index) => {
      const job = raw && typeof raw === 'object' ? raw : {};
      const tripFee = round2(Math.max(0, toNumber(job.trip_fee_baht, 0)));
      const allowance = round2(Math.max(0, toNumber(job.allowance_baht, 0)));
      const otherIncome = round2(Math.max(0, toNumber(job.other_income_baht, 0)));
      return {
        id: cleanString(job.id) || cleanString(job.client_id) || `job_${index + 1}`,
        job_no: index + 1,
        cargo_name: cleanString(job.cargo_name),
        origin_place: cleanString(job.origin_place),
        destination_place: cleanString(job.destination_place),
        load_date: parseDateOrNull(job.load_date),
        unload_date: parseDateOrNull(job.unload_date),
        distance_km: round2(Math.max(0, toNumber(job.distance_km, 0))),
        loading_weight_kg: round2(Math.max(0, toNumber(job.loading_weight_kg, 0))),
        unloading_weight_kg: round2(Math.max(0, toNumber(job.unloading_weight_kg, 0))),
        cargo_stone_weight: round2(Math.max(0, toNumber(job.cargo_stone_weight, 0))),
        cargo_sand_weight: round2(Math.max(0, toNumber(job.cargo_sand_weight, 0))),
        trip_fee_baht: tripFee,
        allowance_baht: allowance,
        other_income_baht: otherIncome,
        total_income_baht: round2(tripFee + allowance + otherIncome),
        ...Object.fromEntries(DELIVERY_JOB_COSTS.map(key => [key, round2(Math.max(0, toNumber(job[key], 0)))])),
        total_expense_baht: round2(DELIVERY_JOB_COSTS.reduce((sum, key) => sum + Math.max(0, toNumber(job[key], 0)), 0)),
        profit_baht: round2(tripFee + allowance + otherIncome - DELIVERY_JOB_COSTS.reduce((sum, key) => sum + Math.max(0, toNumber(job[key], 0)), 0)),
        wage_payer: cleanString(job.wage_payer),
        payment_status: cleanString(job.payment_status) || 'pending',
        note: cleanString(job.note || job.job_note),
      };
    })
    .filter(deliveryJobHasContent)
    .map((job, index) => ({ ...job, job_no: index + 1 }));
}

function summarizeDeliveryJobs(jobs = []) {
  const summary = jobs.reduce((acc, job) => {
    acc.distance_km += toNumber(job.distance_km, 0);
    acc.loading_weight_kg += toNumber(job.loading_weight_kg, 0);
    acc.unloading_weight_kg += toNumber(job.unloading_weight_kg, 0);
    acc.cargo_stone_weight += toNumber(job.cargo_stone_weight, 0);
    acc.cargo_sand_weight += toNumber(job.cargo_sand_weight, 0);
    acc.trip_fee_baht += toNumber(job.trip_fee_baht, 0);
    acc.allowance_baht += toNumber(job.allowance_baht, 0);
    acc.other_income_baht += toNumber(job.other_income_baht, 0);
    return acc;
  }, {
    distance_km: 0,
    loading_weight_kg: 0,
    unloading_weight_kg: 0,
    cargo_stone_weight: 0,
    cargo_sand_weight: 0,
    trip_fee_baht: 0,
    allowance_baht: 0,
    other_income_baht: 0,
  });
  Object.keys(summary).forEach((key) => { summary[key] = round2(summary[key]); });
  summary.total_income_baht = round2(summary.trip_fee_baht + summary.allowance_baht + summary.other_income_baht);
  summary.job_count = jobs.length;
  return summary;
}

async function normalizeDeliveryBody(db, body, files = {}, user, existing = {}, branch = null) {
  const itemType = normalizeItemType(body.item_type || body.oil_type || existing.item_type || existing.oil_type);
  if (!itemType) {
    const err = new Error('เลือกประเภทให้ถูกต้อง: ดีเซล, น้ำมันเครื่อง, แอดบลู');
    err.status = 422;
    throw err;
  }

  const workDate = parseDateOrNull(body.work_date) || parseDateOrNull(body.created_date) || existing.work_date || today();
  const fillDate = parseDateOrNull(body.fill_date) || parseDateOrNull(body.fuel_date) || existing.fill_date || workDate;
  // v37: เลขหัวจ่ายก่อน/หลังเป็นเลขอ้างอิงเท่านั้น ไม่ใช้คำนวณจำนวนลิตรแล้ว
  const odometerBefore = Math.round(toNumber(body.station_meter_before || body.nozzle_meter_before || body.odometer_before, toNumber(existing.station_meter_before || existing.odometer_before, 0)));
  const odometerAfter = Math.round(toNumber(body.station_meter_after || body.nozzle_meter_after || body.odometer_after, toNumber(existing.station_meter_after || existing.odometer_after, 0)));
  const requestedQuantityLiters = round2(toNumber(
    body.actual_filled_liters || body.station_liters || body.quantity_liters || body.liters || body.adblue_liters,
    toNumber(existing.actual_filled_liters, toNumber(existing.quantity_liters, 0)),
  ));
  const nozzleLiters = 0;
  const jobs = normalizeDeliveryJobs(body, existing);
  const jobsSummary = summarizeDeliveryJobs(jobs);
  const explicitDistance = toNumber(body.distance_km, toNumber(existing.distance_km, 0));
  // v58: หากรถคันเดียวมีหลายงาน ให้รวมระยะทางของทุกงานเป็นระยะทางหลักในการคำนวณน้ำมัน
  const distanceKm = jobsSummary.distance_km > 0
    ? jobsSummary.distance_km
    : (explicitDistance > 0 ? round2(explicitDistance) : 0);
  const firstJob = jobs[0] || {};
  const selectedVehicleId = body.vehicle_id || existing.vehicle_id || null;
  const selectedVehicle = selectedVehicleId ? await findVehiclePublic(db, selectedVehicleId) : null;
  const vehicleExpectedRate = toNumber(selectedVehicle?.fuel_efficiency_km_per_liter, 0);
  // v51: อัตราประจำรถต้องมาจากทะเบียนรถเป็นหลัก ไม่ให้ค่าที่ส่งมากับแต่ละเที่ยวเปลี่ยนมาตรฐานของรถ
  const existingExpectedRate = toNumber(existing.expected_fuel_efficiency_km_per_liter, 0);
  const legacyRequestedRate = toNumber(body.expected_fuel_efficiency_km_per_liter, 0);
  const expectedFuelEfficiency = round2(Math.max(
    0,
    vehicleExpectedRate > 0 ? vehicleExpectedRate : (existingExpectedRate > 0 ? existingExpectedRate : legacyRequestedRate),
  ));
  // v51: ดีเซลคำนวณจำนวนลิตรจากระยะทาง ÷ อัตราประจำรถ โดย backend คำนวณซ้ำเพื่อให้ข้อมูลและสต๊อกตรงกัน
  const recommendedFuelLiters = itemType === 'ดีเซล' && distanceKm > 0 && expectedFuelEfficiency > 0
    ? round2(distanceKm / expectedFuelEfficiency)
    : 0;
  // v60: ดีเซลยังคำนวณลิตรตามมาตรฐานจากระยะทาง แต่เก็บ “ลิตรเติมจริง” แยกเพื่อวิเคราะห์ส่วนต่าง
  // ถ้าพนักงานไม่กรอกลิตรจริง ระบบใช้ลิตรตามมาตรฐานเป็นค่าเริ่มต้น จึงไม่กระทบการทำงานเดิม
  const quantityLiters = requestedQuantityLiters > 0 ? requestedQuantityLiters : recommendedFuelLiters;
  const standardFuelLiters = itemType === 'ดีเซล' && recommendedFuelLiters > 0 ? recommendedFuelLiters : quantityLiters;
  const fuelVarianceLiters = itemType === 'ดีเซล' ? round2(quantityLiters - standardFuelLiters) : 0;
  const estimatedDistanceKm = itemType === 'ดีเซล' && quantityLiters > 0 && expectedFuelEfficiency > 0
    ? round2(quantityLiters * expectedFuelEfficiency)
    : 0;
  const priceBahtPerLiter = toNumber(body.price_baht_per_liter || body.price_per_liter, toNumber(existing.price_baht_per_liter || existing.price_per_liter, 0));
  const explicitAmount = toNumber(body.amount_baht, 0);
  const actualAmount = expectedAmountFromPrice(quantityLiters, priceBahtPerLiter);
  const standardAmount = expectedAmountFromPrice(standardFuelLiters, priceBahtPerLiter);
  const amountBaht = actualAmount > 0 ? actualAmount : correctAmountIfCommaBug(explicitAmount, quantityLiters, priceBahtPerLiter);
  const fuelEfficiency = distanceKm > 0 && quantityLiters > 0 ? round2(distanceKm / quantityLiters) : 0;
  const fuelVarianceBaht = round2(fuelVarianceLiters * priceBahtPerLiter);
  const costPerKm = distanceKm > 0 ? round2(amountBaht / distanceKm) : 0;
  const efficiencyStatus = fuelVarianceLiters > 0.01 ? 'over_standard' : fuelVarianceLiters < -0.01 ? 'under_standard' : 'on_standard';

  const photoFields = await extractPhotoFields(db, files, existing);
  const resolvedBranch = branch || await ensureDefaultBranch(db).then(mongoToPlain);
  const data = {
    ...branchFields(resolvedBranch),
    user_id: (user.role || '') === 'owner' && body.user_id ? String(body.user_id) : String(user.id),
    vehicle_id: body.vehicle_id ? String(body.vehicle_id) : existing.vehicle_id || null,
    work_date: workDate,
    fill_date: fillDate,
    fill_time: cleanString(body.fill_time, existing.fill_time || ''),
    report_month: cleanString(body.report_month) || monthFromDate(fillDate),
    operation_type: cleanString(body.operation_type) || cleanString(body.stock_action) || existing.operation_type || 'ทำน้ำมันบรรทุก',
    item_type: itemType,
    oil_type: itemType,
    bill_no: cleanString(body.bill_no, existing.bill_no || body.oil_bill_no || ''),
    oil_bill_no: cleanString(body.oil_bill_no, existing.oil_bill_no || body.bill_no || ''),
    diesel_bill_no: cleanString(body.diesel_bill_no, existing.diesel_bill_no || ''),
    engine_oil_bill_no: cleanString(body.engine_oil_bill_no, existing.engine_oil_bill_no || ''),
    adblue_bill_no: cleanString(body.adblue_bill_no, existing.adblue_bill_no || ''),
    document_no: cleanString(body.document_no, existing.document_no || ''),
    work_bill_no: cleanString(body.work_bill_no, existing.work_bill_no || body.bill_no || ''),
    stone_bill_no: cleanString(body.stone_bill_no, existing.stone_bill_no || ''),
    sand_bill_no: cleanString(body.sand_bill_no, existing.sand_bill_no || ''),
    origin_place: cleanString(firstJob.origin_place, cleanString(body.origin_place, existing.origin_place || '')),
    destination_place: cleanString(firstJob.destination_place, cleanString(body.destination_place, existing.destination_place || '')),
    load_date: firstJob.load_date || parseDateOrNull(body.load_date) || existing.load_date || null,
    unload_date: firstJob.unload_date || parseDateOrNull(body.unload_date) || existing.unload_date || null,
    cargo_name: cleanString(firstJob.cargo_name, cleanString(body.cargo_name, existing.cargo_name || '')),
    loading_weight_kg: round2(toNumber(firstJob.loading_weight_kg, toNumber(body.loading_weight_kg, toNumber(existing.loading_weight_kg, 0)))),
    unloading_weight_kg: round2(toNumber(firstJob.unloading_weight_kg, toNumber(body.unloading_weight_kg, toNumber(existing.unloading_weight_kg, 0)))),
    cargo_stone_weight: jobs.length ? jobsSummary.cargo_stone_weight : toNumber(body.cargo_stone_weight, toNumber(existing.cargo_stone_weight, 0)),
    cargo_sand_weight: jobs.length ? jobsSummary.cargo_sand_weight : toNumber(body.cargo_sand_weight, toNumber(existing.cargo_sand_weight, 0)),
    quantity_liters: quantityLiters,
    actual_filled_liters: quantityLiters,
    standard_fuel_liters: standardFuelLiters,
    fuel_variance_liters: fuelVarianceLiters,
    fuel_variance_baht: fuelVarianceBaht,
    expected_fuel_cost_baht: standardAmount,
    actual_fuel_cost_baht: amountBaht,
    cost_per_km: costPerKm,
    efficiency_status: efficiencyStatus,
    station_liters: quantityLiters,
    adblue_liters: itemType === 'แอดบลู' ? quantityLiters : toNumber(body.adblue_liters, toNumber(existing.adblue_liters, 0)),
    diesel_liters: itemType === 'ดีเซล' ? quantityLiters : toNumber(body.diesel_liters, toNumber(existing.diesel_liters, 0)),
    engine_oil_liters: itemType === 'น้ำมันเครื่อง' ? quantityLiters : toNumber(body.engine_oil_liters, toNumber(existing.engine_oil_liters, 0)),
    price_baht_per_liter: priceBahtPerLiter,
    amount_baht: amountBaht,
    distance_km: distanceKm,
    gps_origin_lat: toNumber(body.gps_origin_lat, toNumber(existing.gps_origin_lat, 0)),
    gps_origin_lon: toNumber(body.gps_origin_lon, toNumber(existing.gps_origin_lon, 0)),
    gps_destination_lat: toNumber(body.gps_destination_lat, toNumber(existing.gps_destination_lat, 0)),
    gps_destination_lon: toNumber(body.gps_destination_lon, toNumber(existing.gps_destination_lon, 0)),
    gps_route_provider: cleanString(body.gps_route_provider, existing.gps_route_provider || ''),
    gps_calculated_at: cleanString(body.gps_calculated_at, existing.gps_calculated_at || ''),
    expected_fuel_efficiency_km_per_liter: expectedFuelEfficiency,
    estimated_distance_km: estimatedDistanceKm,
    recommended_fuel_liters: recommendedFuelLiters,
    calculation_mode: itemType === 'ดีเซล' ? 'distance_to_liters' : 'manual_liters',
    odometer_before: odometerBefore,
    odometer_after: odometerAfter,
    meter_distance_km: distanceKm,
    station_meter_before: odometerBefore,
    station_meter_after: odometerAfter,
    station_meter_delta_liters: nozzleLiters,
    nozzle_liters: nozzleLiters,
    // v51: จำนวนลิตร = ระยะทางที่กรอก ÷ อัตราประจำรถที่ดึงอัตโนมัติ
    fuel_used_liters: quantityLiters,
    fuel_efficiency_km_per_liter: fuelEfficiency,
    filler_name: cleanString(body.filler_name, existing.filler_name || ''),
    recorder_name: cleanString(body.recorder_name, existing.recorder_name || user.name || user.username || ''),
    driver_name_input: cleanString(body.driver_name, existing.driver_name_input || ''),
    trip_fee_baht: jobs.length ? jobsSummary.trip_fee_baht : round2(toNumber(body.trip_fee_baht, toNumber(existing.trip_fee_baht, 0))),
    allowance_baht: jobs.length ? jobsSummary.allowance_baht : round2(toNumber(body.allowance_baht, toNumber(existing.allowance_baht, 0))),
    other_income_baht: jobs.length ? jobsSummary.other_income_baht : round2(toNumber(body.other_income_baht, toNumber(existing.other_income_baht, 0))),
    total_income_baht: 0,
    wage_payer: cleanString(firstJob.wage_payer, cleanString(body.wage_payer, existing.wage_payer || '')),
    payment_status: jobs.length && jobs.every((job) => job.payment_status === 'paid') ? 'paid' : (cleanString(body.payment_status, existing.payment_status || 'pending') || 'pending'),
    note: cleanString(body.note, existing.note || ''),
    jobs,
    job_count: jobsSummary.job_count,
    total_job_distance_km: jobsSummary.distance_km,
    total_loading_weight_kg: jobsSummary.loading_weight_kg,
    total_unloading_weight_kg: jobsSummary.unloading_weight_kg,
    total_cargo_stone_weight: jobsSummary.cargo_stone_weight,
    total_cargo_sand_weight: jobsSummary.cargo_sand_weight,
    bill_photo: photoFields.bill_photo || '',
    receipt_photo: photoFields.bill_photo || '',
    bill_photos: photoFields.bill_photos || [],
    document_photo: photoFields.document_photo || '',
    document_photos: photoFields.document_photos || [],
    oil_photo: photoFields.oil_photo || '',
    oil_photos: photoFields.oil_photos || [],
    cargo_photo: photoFields.cargo_photo || '',
    cargo_photos: photoFields.cargo_photos || [],
    adblue_photo: photoFields.adblue_photo || '',
    adblue_photos: photoFields.adblue_photos || [],
    diesel_amount_baht: itemType === 'ดีเซล' ? amountBaht : toNumber(body.diesel_amount_baht, toNumber(existing.diesel_amount_baht, 0)),
    engine_oil_amount_baht: itemType === 'น้ำมันเครื่อง' ? amountBaht : toNumber(body.engine_oil_amount_baht, toNumber(existing.engine_oil_amount_baht, 0)),
    adblue_amount_baht: itemType === 'แอดบลู' ? amountBaht : toNumber(body.adblue_amount_baht, toNumber(existing.adblue_amount_baht, 0)),
    updated_at: nowIso(),
  };
  data.total_income_baht = jobs.length
    ? jobsSummary.total_income_baht
    : round2(
      toNumber(data.trip_fee_baht, 0) +
      toNumber(data.allowance_baht, 0) +
      toNumber(data.other_income_baht, 0),
    );
  return data;
}

async function createAutoNotifications(db, deliveryId, data) {
  const alerts = [];
  if (Number(data.quantity_liters || 0) >= 280) alerts.push(['ปริมาณสูงผิดปกติ', 'รายการนี้มีปริมาณตั้งแต่ 280 ลิตรขึ้นไป กรุณาตรวจสอบ', 'danger']);
  const varianceLiters = toNumber(data.fuel_variance_liters, 0);
  const standardLiters = Math.max(0, toNumber(data.standard_fuel_liters || data.recommended_fuel_liters, 0));
  if (varianceLiters > Math.max(5, standardLiters * 0.1)) {
    alerts.push(['เติมน้ำมันเกินมาตรฐาน', `เติมจริงเกินค่าคำนวณ ${round2(varianceLiters).toFixed(2)} ลิตร คิดเป็น ${round2(data.fuel_variance_baht).toFixed(2)} บาท`, 'warning']);
  }
  if ((data.payment_status || 'pending') === 'pending') alerts.push(['รายได้ยังรอจ่าย', 'รายการนี้ยังเป็นสถานะรอจ่าย', 'warning']);
  if (!data.bill_photo && !toPhotoArray(data.bill_photos).length) alerts.push(['ยังไม่แนบรูปบิล', 'รายการนี้ยังไม่มีรูปบิล', 'info']);
  if (!data.document_photo && !toPhotoArray(data.document_photos).length) alerts.push(['ยังไม่แนบรูปเอกสาร', 'รายการนี้ยังไม่มีรูปเอกสารประกอบ', 'info']);
  if (!alerts.length) return;
  await db.collection('notifications').insertMany(alerts.map((alert) => ({
    branch_id: data.branch_id,
    branch_name: data.branch_name,
    branch_code: data.branch_code,
    delivery_id: deliveryId,
    title: alert[0],
    message: alert[1],
    type: alert[2],
    is_read: 0,
    created_at: nowIso(),
  })));
}

function stockLevelInfo(stock = {}) {
  const itemType = normalizeItemType(stock.item_type) || cleanString(stock.item_type) || 'ดีเซล';
  const defaults = DEFAULT_STOCK_SETTINGS[itemType] || DEFAULT_STOCK_SETTINGS['ดีเซล'];
  const balance = round2(toNumber(stock.balance_liters, 0));
  const capacity = round2(Math.max(1, toNumber(stock.capacity_liters, defaults.capacity_liters)));
  const reorder = round2(Math.max(0, toNumber(stock.reorder_level_liters, defaults.reorder_level_liters)));
  const critical = round2(Math.max(0, Math.min(reorder, toNumber(stock.critical_level_liters, defaults.critical_level_liters))));
  let levelStatus = 'ready';
  let levelLabel = 'พร้อมให้บริการ';
  if (balance <= critical) {
    levelStatus = 'critical';
    levelLabel = 'วิกฤต ต้องเติมทันที';
  } else if (balance <= reorder) {
    levelStatus = 'low';
    levelLabel = 'ต่ำ ควรเตรียมเติม';
  }
  return {
    ...mongoToPlain(stock),
    item_type: itemType,
    tank_name: cleanString(stock.tank_name) || defaults.tank_name,
    balance_liters: balance,
    capacity_liters: capacity,
    reorder_level_liters: reorder,
    critical_level_liters: critical,
    available_percent: round2(Math.max(0, Math.min(100, (balance / capacity) * 100))),
    level_status: levelStatus,
    level_label: levelLabel,
    is_service_ready: levelStatus !== 'critical',
  };
}

async function evaluateStockLevel(db, itemType, branchId, { forceNotification = false } = {}) {
  const normalized = normalizeItemType(itemType);
  const resolvedBranchId = cleanString(branchId);
  if (!normalized || !resolvedBranchId) return null;
  const stock = await db.collection('stocks').findOne({ branch_id: resolvedBranchId, item_type: normalized });
  if (!stock) return null;
  const info = stockLevelInfo(stock);
  const previousStatus = cleanString(stock.last_alert_status, 'ready');
  const statusChanged = previousStatus !== info.level_status;

  await db.collection('stocks').updateOne(
    { _id: stock._id },
    {
      $set: {
        level_status: info.level_status,
        level_label: info.level_label,
        available_percent: info.available_percent,
        last_alert_status: info.level_status,
        updated_at: nowIso(),
      },
    },
  );

  if (forceNotification || statusChanged) {
    const branchName = cleanString(info.branch_name) || DEFAULT_BRANCH.name;
    let title = `[${branchName}] สต๊อก ${normalized} พร้อมให้บริการ`;
    let message = `${info.tank_name} คงเหลือ ${info.balance_liters.toFixed(2)} ลิตร (${info.available_percent.toFixed(2)}%)`;
    let type = 'info';
    if (info.level_status === 'critical') {
      title = `[${branchName}] สต๊อก ${normalized} วิกฤต`;
      message = `${info.tank_name} เหลือ ${info.balance_liters.toFixed(2)} ลิตร ต่ำกว่าจุดวิกฤต ${info.critical_level_liters.toFixed(2)} ลิตร กรุณาเติมทันที`;
      type = 'danger';
    } else if (info.level_status === 'low') {
      title = `[${branchName}] สต๊อก ${normalized} ต่ำ`;
      message = `${info.tank_name} เหลือ ${info.balance_liters.toFixed(2)} ลิตร ถึงจุดสั่งเติม ${info.reorder_level_liters.toFixed(2)} ลิตร`;
      type = 'warning';
    } else if (previousStatus === 'low' || previousStatus === 'critical') {
      title = `[${branchName}] สต๊อก ${normalized} กลับมาพร้อมใช้`;
      message = `${info.tank_name} คงเหลือ ${info.balance_liters.toFixed(2)} ลิตร ระบบกลับสู่สถานะพร้อมให้บริการ`;
      type = 'success';
    } else if (!forceNotification) {
      return info;
    }
    await db.collection('notifications').insertOne({
      kind: 'stock_level',
      branch_id: resolvedBranchId,
      branch_code: cleanString(info.branch_code),
      branch_name: branchName,
      item_type: normalized,
      title,
      message,
      type,
      is_read: 0,
      created_at: nowIso(),
    });
    emitDataChanged('notifications', 'create', { kind: 'stock_level', branch_id: resolvedBranchId, item_type: normalized });
  }
  return info;
}

async function applyStockChange(db, { branch_id, branch_name = '', branch_code = '', item_type, change_liters, transaction_type, ref_delivery_id = null, user_id = null, note = '', transaction_date = null, amount_baht = 0, bill_no = '', supplier_name = '', photo = '' }) {
  const itemType = normalizeItemType(item_type);
  const change = toNumber(change_liters, 0);
  const resolvedBranchId = cleanString(branch_id);
  if (!itemType || change === 0 || !resolvedBranchId) return null;
  const defaults = DEFAULT_STOCK_SETTINGS[itemType] || DEFAULT_STOCK_SETTINGS['ดีเซล'];

  await db.collection('stocks').updateOne(
    { branch_id: resolvedBranchId, item_type: itemType },
    {
      $inc: { balance_liters: change },
      $set: {
        branch_name: cleanString(branch_name) || DEFAULT_BRANCH.name,
        branch_code: cleanString(branch_code),
        updated_at: nowIso(),
      },
      $setOnInsert: {
        branch_id: resolvedBranchId,
        item_type: itemType,
        tank_name: defaults.tank_name,
        capacity_liters: defaults.capacity_liters,
        reorder_level_liters: defaults.reorder_level_liters,
        critical_level_liters: defaults.critical_level_liters,
        created_at: nowIso(),
      },
    },
    { upsert: true },
  );

  const inserted = await db.collection('stock_movements').insertOne({
    branch_id: resolvedBranchId,
    branch_name: cleanString(branch_name) || DEFAULT_BRANCH.name,
    branch_code: cleanString(branch_code),
    item_type: itemType,
    transaction_type,
    quantity_liters: Math.abs(change),
    change_liters: change,
    amount_baht: toNumber(amount_baht, 0),
    bill_no: cleanString(bill_no),
    supplier_name: cleanString(supplier_name),
    photo: cleanString(photo),
    ref_delivery_id,
    user_id,
    note,
    transaction_date: parseDateOrNull(transaction_date) || today(),
    created_at: nowIso(),
  });
  const stockStatus = await evaluateStockLevel(db, itemType, resolvedBranchId);
  return { movement_id: inserted.insertedId, stock: stockStatus };
}

async function syncStockForDeliveryCreate(db, deliveryId, data, userId) {
  if (isStockIntakeOperation(data.operation_type)) return;
  const qty = toNumber(data.quantity_liters, 0);
  if (qty > 0) {
    await applyStockChange(db, {
      branch_id: data.branch_id,
      branch_name: data.branch_name,
      branch_code: data.branch_code,
      item_type: data.item_type,
      change_liters: -qty,
      transaction_type: 'ทำน้ำมันบรรทุก',
      ref_delivery_id: String(deliveryId),
      user_id: userId,
      note: `ใช้จากรายการงาน ${data.bill_no || ''}`.trim(),
      transaction_date: data.fill_date || data.work_date,
      amount_baht: data.amount_baht,
      bill_no: data.oil_bill_no || data.bill_no,
      photo: data.oil_photo || data.bill_photo,
    });
  }
}

async function syncStockForDeliveryUpdate(db, deliveryId, oldData, newData, userId) {
  const oldQty = toNumber(oldData.quantity_liters, 0);
  const newQty = toNumber(newData.quantity_liters, 0);
  const oldType = normalizeItemType(oldData.item_type || oldData.oil_type);
  const newType = normalizeItemType(newData.item_type || newData.oil_type);
  if (oldQty > 0 && oldType && !isStockIntakeOperation(oldData.operation_type)) {
    await applyStockChange(db, {
      branch_id: oldData.branch_id || newData.branch_id,
      branch_name: oldData.branch_name || newData.branch_name,
      branch_code: oldData.branch_code || newData.branch_code,
      item_type: oldType,
      change_liters: oldQty,
      transaction_type: 'ยกเลิกยอดเดิมก่อนแก้ไข',
      ref_delivery_id: String(deliveryId),
      user_id: userId,
      note: 'คืนสต๊อกจากรายการเดิมก่อนแก้ไข',
      transaction_date: newData.fill_date || newData.work_date,
    });
  }
  if (newQty > 0 && newType && !isStockIntakeOperation(newData.operation_type)) {
    await applyStockChange(db, {
      branch_id: newData.branch_id,
      branch_name: newData.branch_name,
      branch_code: newData.branch_code,
      item_type: newType,
      change_liters: -newQty,
      transaction_type: 'ทำน้ำมันบรรทุก',
      ref_delivery_id: String(deliveryId),
      user_id: userId,
      note: 'หักสต๊อกหลังแก้ไขรายการ',
      transaction_date: newData.fill_date || newData.work_date,
      amount_baht: newData.amount_baht,
      bill_no: newData.oil_bill_no || newData.bill_no,
      photo: newData.oil_photo || newData.bill_photo,
    });
  }
}

async function syncStockForDeliveryDelete(db, delivery, userId) {
  const qty = toNumber(delivery.quantity_liters, 0);
  const itemType = normalizeItemType(delivery.item_type || delivery.oil_type);
  if (qty > 0 && itemType && !isStockIntakeOperation(delivery.operation_type)) {
    await applyStockChange(db, {
      branch_id: delivery.branch_id,
      branch_name: delivery.branch_name,
      branch_code: delivery.branch_code,
      item_type: itemType,
      change_liters: qty,
      transaction_type: 'คืนสต๊อกจากการลบรายการ',
      ref_delivery_id: String(delivery._id),
      user_id: userId,
      note: 'คืนสต๊อกเพราะลบรายการงาน',
      transaction_date: delivery.fill_date || delivery.work_date,
    });
  }
}

async function buildDeliveryFilter(db, user, query, branch = null) {
  const filter = {};
  const resolvedBranchId = cleanString(branch?.id || branch?._id || branch?.branch_id);
  if (resolvedBranchId) filter.branch_id = resolvedBranchId;
  if ((user.role || '') !== 'owner') filter.user_id = String(user.id);
  if (query.from) {
    filter.work_date = filter.work_date || {};
    filter.work_date.$gte = parseDateOrNull(query.from) || String(query.from);
  }
  if (query.to) {
    filter.work_date = filter.work_date || {};
    filter.work_date.$lte = parseDateOrNull(query.to) || String(query.to);
  }
  if (query.item_type) {
    const itemType = normalizeItemType(query.item_type);
    if (itemType) filter.item_type = itemType;
  }
  if (query.q) {
    const q = cleanString(query.q);
    if (q) {
      const rx = safeRegex(q);
      const or = [
        { bill_no: rx },
        { oil_bill_no: rx },
        { adblue_bill_no: rx },
        { stone_bill_no: rx },
        { sand_bill_no: rx },
        { origin_place: rx },
        { destination_place: rx },
        { cargo_name: rx },
        { wage_payer: rx },
        { 'jobs.origin_place': rx },
        { 'jobs.destination_place': rx },
        { 'jobs.cargo_name': rx },
        { 'jobs.wage_payer': rx },
        { 'jobs.note': rx },
        { item_type: rx },
        { oil_type: rx },
        { plate_no: rx },
        { vehicle_no: rx },
        { driver_name: rx },
        { filler_name: rx },
        { recorder_name: rx },
        { driver_name_input: rx },
      ];
      const vehicleFilter = { is_active: 1, branch_id: resolvedBranchId, $or: [{ plate_no: rx }, { driver_name: rx }, { vehicle_no: rx }, { description: rx }] };
      if ((user.role || '') !== 'owner') vehicleFilter.$and = [{ $or: [{ user_id: String(user.id) }, { user_id: '' }, { user_id: null }, { user_id: { $exists: false } }] }];
      const vehicles = await db.collection('vehicles').find(vehicleFilter, { projection: { _id: 1 } }).toArray();
      const vehicleIds = vehicles.map((v) => String(v._id));
      if (vehicleIds.length) or.push({ vehicle_id: { $in: vehicleIds } });
      filter.$or = or;
    }
  }
  return filter;
}

async function enrichDelivery(db, delivery) {
  const d = mongoToPlain(delivery);
  d.jobs = normalizeDeliveryJobs({}, d);
  const jobsSummary = summarizeDeliveryJobs(d.jobs);
  d.job_count = jobsSummary.job_count;
  d.total_job_distance_km = jobsSummary.distance_km;
  d.total_loading_weight_kg = jobsSummary.loading_weight_kg;
  d.total_unloading_weight_kg = jobsSummary.unloading_weight_kg;
  d.total_cargo_stone_weight = jobsSummary.cargo_stone_weight;
  d.total_cargo_sand_weight = jobsSummary.cargo_sand_weight;
  if (d.jobs.length) {
    const firstJob = d.jobs[0];
    d.origin_place = d.origin_place || firstJob.origin_place || '';
    d.destination_place = d.destination_place || firstJob.destination_place || '';
    d.cargo_name = d.cargo_name || firstJob.cargo_name || '';
    d.load_date = d.load_date || firstJob.load_date || null;
    d.unload_date = d.unload_date || firstJob.unload_date || null;
    d.loading_weight_kg = toNumber(d.loading_weight_kg, firstJob.loading_weight_kg || 0);
    d.unloading_weight_kg = toNumber(d.unloading_weight_kg, firstJob.unloading_weight_kg || 0);
    d.cargo_stone_weight = jobsSummary.cargo_stone_weight;
    d.cargo_sand_weight = jobsSummary.cargo_sand_weight;
    d.trip_fee_baht = jobsSummary.trip_fee_baht;
    d.allowance_baht = jobsSummary.allowance_baht;
    d.other_income_baht = jobsSummary.other_income_baht;
    d.total_income_baht = jobsSummary.total_income_baht;
    if (jobsSummary.distance_km > 0) d.distance_km = jobsSummary.distance_km;
  }
  const [employee, vehicle] = await Promise.all([
    d.user_id ? findUserPublic(db, d.user_id) : null,
    d.vehicle_id ? findVehiclePublic(db, d.vehicle_id) : null,
  ]);
  d.employee_name = employee?.name || null;
  d.employee_username = employee?.username || null;
  d.plate_no = vehicle?.plate_no || null;
  d.vehicle_no = vehicle?.vehicle_no || null;
  d.driver_name = vehicle?.driver_name || d.driver_name_input || null;
  d.vehicle_fuel_efficiency_km_per_liter = round2(Math.max(0, toNumber(vehicle?.fuel_efficiency_km_per_liter, 0)));
  const quantity = toNumber(d.quantity_liters, 0);
  const rawAmount = toNumber(d.amount_baht, 0);
  const price = toNumber(d.price_baht_per_liter || d.price_per_liter, 0);
  const amount = correctAmountIfCommaBug(rawAmount, quantity, price);
  d.amount_baht = amount;
  d.price_baht_per_liter = price > 0 ? round2(price) : (quantity > 0 ? round2(amount / quantity) : 0);
  d.price_per_liter = d.price_baht_per_liter;
  const distance = toNumber(d.distance_km, 0);
  const before = Math.round(toNumber(d.station_meter_before || d.odometer_before, 0));
  const after = Math.round(toNumber(d.station_meter_after || d.odometer_after, 0));
  d.station_meter_before = before;
  d.station_meter_after = after;
  d.station_meter_delta_liters = toNumber(d.station_meter_delta_liters, 0);
  d.nozzle_liters = toNumber(d.nozzle_liters, 0);
  d.quantity_liters = round2(d.actual_filled_liters || d.quantity_liters || d.station_liters || d.liters || 0);
  d.actual_filled_liters = d.quantity_liters;
  d.distance_km = distance;
  const expectedRate = round2(Math.max(0, toNumber(
    d.expected_fuel_efficiency_km_per_liter,
    d.vehicle_fuel_efficiency_km_per_liter || (distance > 0 && d.quantity_liters > 0 ? distance / d.quantity_liters : 0),
  )));
  d.expected_fuel_efficiency_km_per_liter = expectedRate;
  d.recommended_fuel_liters = distance > 0 && expectedRate > 0 ? round2(distance / expectedRate) : 0;
  d.standard_fuel_liters = d.item_type === 'ดีเซล' && d.recommended_fuel_liters > 0
    ? d.recommended_fuel_liters
    : round2(d.standard_fuel_liters || d.quantity_liters || 0);
  d.fuel_variance_liters = d.item_type === 'ดีเซล'
    ? round2(d.quantity_liters - d.standard_fuel_liters)
    : round2(d.fuel_variance_liters || 0);
  d.estimated_distance_km = d.quantity_liters > 0 && expectedRate > 0 ? round2(d.quantity_liters * expectedRate) : 0;
  d.fuel_efficiency_km_per_liter = distance > 0 && d.quantity_liters > 0 ? round2(distance / d.quantity_liters) : 0;
  d.expected_fuel_cost_baht = round2(d.standard_fuel_liters * d.price_baht_per_liter);
  d.actual_fuel_cost_baht = round2(d.amount_baht);
  d.fuel_variance_baht = round2(d.fuel_variance_liters * d.price_baht_per_liter);
  d.cost_per_km = distance > 0 ? round2(d.amount_baht / distance) : 0;
  d.efficiency_status = d.fuel_variance_liters > 0.01 ? 'over_standard' : d.fuel_variance_liters < -0.01 ? 'under_standard' : 'on_standard';
  d.calculation_mode = d.calculation_mode || (d.item_type === 'ดีเซล' && distance > 0 ? 'distance_to_liters' : 'manual_liters');
  d.decimal_fix_version = 'v60_fuel_control';
  return d;
}

function deliveryJobCount(row = {}) {
  const arrayCount = Array.isArray(row.jobs) ? row.jobs.length : 0;
  return Math.max(1, Math.round(toNumber(row.job_count, arrayCount || 1)));
}

function groupSum(rows, key, sumField, limit = 0) {
  const groups = new Map();
  for (const row of rows) {
    const name = cleanString(row[key]) || 'ไม่ระบุ';
    if (!groups.has(name)) groups.set(name, { name, value: 0, trips: 0 });
    const item = groups.get(name);
    item.value += toNumber(row[sumField], 0);
    item.trips += deliveryJobCount(row);
  }
  const out = Array.from(groups.values()).sort((a, b) => b.value - a.value);
  return limit > 0 ? out.slice(0, limit) : out;
}

// v58: กระจายปริมาณน้ำมันตามสัดส่วนระยะทางของแต่ละงาน เพื่อให้สรุปปลายทางหลายงานไม่ซ้ำยอดน้ำมัน
function groupJobSum(rows, key, sumField, limit = 0) {
  const groups = new Map();
  for (const row of rows) {
    const jobs = Array.isArray(row.jobs) && row.jobs.length ? row.jobs : [legacyDeliveryJob(row)];
    const validJobs = jobs.filter(deliveryJobHasContent);
    const totalDistance = validJobs.reduce((sum, job) => sum + Math.max(0, toNumber(job.distance_km, 0)), 0);
    const rowValue = Math.max(0, toNumber(row[sumField], 0));
    validJobs.forEach((job) => {
      const name = cleanString(job[key]) || 'ไม่ระบุ';
      if (!groups.has(name)) groups.set(name, { name, value: 0, trips: 0 });
      const item = groups.get(name);
      const share = totalDistance > 0
        ? Math.max(0, toNumber(job.distance_km, 0)) / totalDistance
        : 1 / Math.max(validJobs.length, 1);
      item.value += rowValue * share;
      item.trips += 1;
    });
  }
  const out = Array.from(groups.values())
    .map((item) => ({ ...item, value: round2(item.value) }))
    .sort((a, b) => b.value - a.value);
  return limit > 0 ? out.slice(0, limit) : out;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extByMime = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
    const ext = extByMime[file.mimetype] || path.extname(file.originalname).replace('.', '') || 'jpg';
    const safe = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}_${safe}.${ext}`);
  },
});

const uploadMaxMb = Math.max(Number(config.uploadMaxMb || 200), 50);
const upload = multer({
  storage,
  limits: {
    // รองรับไฟล์ใหญ่จากมือถือได้มากขึ้น และฝั่ง Frontend จะย่อรูปอัตโนมัติก่อนส่ง
    fileSize: uploadMaxMb * 1024 * 1024,
    files: 80,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
    const allowedMime = mime.startsWith('image/') || ['application/pdf', 'application/octet-stream'].includes(mime);
    const allowedExt = imageExts.includes(ext) || ext === '.pdf';
    if (!allowedMime || !allowedExt) return cb(new Error('รองรับเฉพาะไฟล์รูปภาพจากมือถือและ PDF'));
    return cb(null, true);
  },
});

function uploadFields(req, res, next) {
  return upload.fields([
  { name: 'photo', maxCount: 10 },
  { name: 'receipt_photo', maxCount: 10 },
  { name: 'bill_photo', maxCount: 10 },
  { name: 'bill_photos', maxCount: 10 },
  { name: 'document_photo', maxCount: 10 },
  { name: 'document_photos', maxCount: 10 },
  { name: 'oil_photo', maxCount: 10 },
  { name: 'oil_photos', maxCount: 10 },
  { name: 'cargo_photo', maxCount: 10 },
  { name: 'cargo_photos', maxCount: 10 },
  { name: 'adblue_photo', maxCount: 10 },
  { name: 'adblue_photos', maxCount: 10 },
  { name: 'stock_photo', maxCount: 10 },
  { name: 'stock_photos', maxCount: 10 },
  ])(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      err.status = 413;
      err.message = `ไฟล์ใหญ่เกินขนาดที่ระบบรับได้ต่อไฟล์ (${uploadMaxMb} MB) หากเป็นรูปจากมือถือ ระบบจะพยายามย่อก่อนส่งให้อัตโนมัติ กรุณาลองเลือก/ถ่ายรูปใหม่อีกครั้ง`;
    } else if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
      err.status = 413;
      err.message = 'จำนวนไฟล์แนบมากเกินไป กรุณาลดจำนวนรูปแล้วลองใหม่';
    } else if (!err.status) {
      err.status = 400;
    }
    return next(err);
  });
}


const loginAttempts = new Map();

function getClientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginRateLimit(req, res, next) {
  const key = `login:${getClientKey(req)}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 20;
  const current = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (current.resetAt < now) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }
  current.count += 1;
  loginAttempts.set(key, current);
  if (current.count > maxAttempts) {
    return jsonResponse(res, { success: false, message: 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' }, 429);
  }
  return next();
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (config.corsAllowAll) return cb(null, true);
    if (config.corsAllowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-Access-Token', 'X-Branch-Id'],
  exposedHeaders: ['Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 204,
}));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadDir));
app.use('/public/uploads', express.static(uploadDir));

// รองรับ frontend เก่าที่ยังยิงแบบ /index.php?route=/auth/login หรือ /index.php/auth/login
app.use((req, _res, next) => {
  if (req.query && req.query.route) {
    const route = '/' + String(req.query.route).replace(/^\/+/, '');
    const rest = { ...req.query };
    delete rest.route;
    const qs = new URLSearchParams(rest).toString();
    req.url = route + (qs ? `?${qs}` : '');
  } else if (req.url.startsWith('/index.php/')) {
    req.url = req.url.replace('/index.php', '') || '/';
  } else if (req.url === '/index.php') {
    req.url = '/';
  }
  next();
});

app.get('/ping', (req, res) => jsonResponse(res, { success: true, message: 'pong', build: 'kwanjai-auth-check', time: nowIso() }));
// Public service-readiness probe, registered before MongoDB middleware.
// Does not expose account data or database credentials.
app.get('/health-ready', async (_req, res) => {
  if (!config.mongodb.uri) return jsonResponse(res, { success: false, code: 'DB_NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่า MONGODB_URI ใน Backend' }, 503);
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return jsonResponse(res, { success: true, message: 'Backend และฐานข้อมูลพร้อมใช้งาน' });
  } catch (err) {
    console.error('[health-ready] Database not ready:', err.code || err.name, err.message);
    // Distinguish connection problems from initialization/index migration errors.
    // This is a read-only diagnostic probe; it does not reset indexes or users.
    let connected = false;
    const probeClient = new MongoClient(config.mongodb.uri, { serverSelectionTimeoutMS: 3500 });
    try {
      await probeClient.connect();
      await probeClient.db(config.mongodb.db).command({ ping: 1 });
      connected = true;
    } catch (probeError) {
      console.error('[health-ready] MongoDB connection probe:', probeError.code || probeError.name);
    } finally {
      await probeClient.close().catch(() => {});
    }
    return jsonResponse(res, {
      success: false,
      code: connected ? 'DB_INIT_FAILED' : 'DB_UNAVAILABLE',
      message: connected
        ? 'เชื่อมต่อ MongoDB ได้ แต่ขั้นตอนเตรียมฐานข้อมูลไม่สำเร็จ กรุณาตรวจสอบ Backend Logs และสิทธิ์จัดการดัชนี'
        : 'Backend ยังเชื่อมต่อ MongoDB ไม่ได้ กรุณาตรวจสอบ Atlas, Environment และ Backend Logs',
    }, 503);
  }
});

app.use(asyncHandler(async (req, _res, next) => {
  req.db = await getDb();
  next();
}));

app.get('/uploads/db/:id', asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return res.status(404).send('file not found');
  const file = await req.db.collection('uploaded_files').findOne({ _id: oid });
  if (!file || !file.data) return res.status(404).send('file not found');
  res.setHeader('Content-Type', file.content_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename || 'upload')}"`);
  res.send(Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer || file.data));
}));

const router = express.Router();

router.get('/', (_req, res) => jsonResponse(res, {
  success: true,
  name: 'Test System API',
  build: 'test-system-v1-pastel',
  item_types: ITEM_TYPES,
  endpoints: ['/health', '/auth/login', '/auth/me', '/branches', '/deliveries', '/dashboard/stats', '/stocks/status', '/stocks', '/reports/monthly', '/notifications', '/users', '/vehicles'],
}));

router.get('/health', asyncHandler(async (req, res) => {
  await req.db.command({ ping: 1 });
  jsonResponse(res, { success: true, message: 'Backend connected to MongoDB successfully', database: config.mongodb.db, build: 'test-system-v1-pastel', time: nowIso() });
}));

router.post('/auth/login', loginRateLimit, asyncHandler(async (req, res) => {
  const username = cleanString(req.body.username);
  const password = req.body.password;
  const user = await req.db.collection('users').findOne({ username, is_active: { $ne: 0 } });
  if (!user) return jsonResponse(res, { success: false, message: 'ไม่พบผู้ใช้งาน' }, 401);
  const hash = user.password_hash || user.password || '';
  const ok = await verifyPassword(password, hash);
  if (!ok) return jsonResponse(res, { success: false, message: 'รหัสผ่านผิดพลาด' }, 401);
  const publicData = publicUser(user);
  const token = signUserToken(publicData);
  jsonResponse(res, { success: true, token, user: publicData });
}));


// Admin setup/recovery: the URL alone grants no privileges. A server-side secret is required.
const adminRecoveryAttempts = new Map();
function limitAdminRecovery(req, res, next) {
  const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const attempt = adminRecoveryAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > attempt.resetAt) { attempt.count = 0; attempt.resetAt = now + 15 * 60 * 1000; }
  if (++attempt.count > 8) return jsonResponse(res, { success: false, message: 'ลองใหม่ภายหลัง' }, 429);
  adminRecoveryAttempts.set(key, attempt);
  next();
}
function adminSecretValid(provided) {
  const configured = String(process.env.ADMIN_RECOVERY_KEY || '');
  const supplied = typeof provided === 'string' ? provided : '';
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}
router.post('/auth/admin-recovery', limitAdminRecovery, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!adminSecretValid(req.body.recovery_key)) {
    return jsonResponse(res, { success: false, message: 'รหัสกู้คืนไม่ถูกต้อง หรือยังไม่ได้ตั้งค่าในเซิร์ฟเวอร์' }, 403);
  }
  const username = cleanString(req.body.username);
  const password = req.body.password;
  const currentUsername = cleanString(req.body.current_username);
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username) || !validPassword(password)) {
    return jsonResponse(res, { success: false, message: 'Username ต้องมี 3–40 ตัว (ภาษาอังกฤษ ตัวเลข _ . -) และต้องกรอก Password' }, 422);
  }
  const users = req.db.collection('users');
  const hash = await hashPassword(password);
  const now = nowIso();
  const existingOwnerCount = await users.countDocuments({ role: 'owner', is_active: { $ne: 0 } });
  const duplicate = await users.findOne({ username });
  if (existingOwnerCount === 0) {
    if (duplicate) return jsonResponse(res, { success: false, message: 'Username นี้ถูกใช้แล้ว' }, 409);
    const branch = await ensureDefaultBranch(req.db);
    // Unique MongoDB _id is the atomic one-time bootstrap lock.
    try {
      await req.db.collection('system_settings').insertOne({ _id: 'admin_initial_setup', completed: true, created_at: now });
    } catch (err) {
      if (err.code === 11000) return jsonResponse(res, { success: false, message: 'ตั้งค่าผู้ดูแลครั้งแรกไปแล้ว' }, 409);
      throw err;
    }
    try {
      await users.insertOne({
        ...branchFields(branch), name: username, username, password_hash: hash,
        role: 'owner', auth_version: 1, phone: '', is_active: 1, created_at: now, updated_at: now,
      });
    } catch (error) {
      // Allow the owner to retry after resolving a database/index failure.
      await req.db.collection('system_settings').deleteOne({ _id: 'admin_initial_setup' });
      if (error.code === 11000) return jsonResponse(res, { success: false, message: 'บัญชีซ้ำหรือดัชนี email เดิมยังมีปัญหา กรุณาตรวจสอบ users indexes' }, 409);
      throw error;
    }
    return jsonResponse(res, { success: true, message: 'สร้างผู้ดูแลแล้ว กรุณาเข้าสู่ระบบด้วยบัญชีใหม่' });
  }
  // With exactly one active owner, the server-held recovery key is sufficient
  // even when the owner no longer remembers their old username. With multiple
  // owners, require an explicit original username to avoid resetting the wrong account.
  if (!currentUsername && existingOwnerCount > 1) return jsonResponse(res, {
    success: false, message: 'ระบบมีแอดมินหลายบัญชี กรุณากรอก Username แอดมินเดิมที่ต้องการกู้คืน',
  }, 422);
  const owner = currentUsername
    ? await users.findOne({ username: currentUsername, role: 'owner', is_active: { $ne: 0 } })
    : await users.findOne({ role: 'owner', is_active: { $ne: 0 } });
  if (!owner) return jsonResponse(res, { success: false, message: 'ไม่พบบัญชีแอดมินเดิมที่ระบุ' }, 404);
  if (duplicate && String(duplicate._id) !== String(owner._id)) {
    return jsonResponse(res, { success: false, message: 'Username ใหม่ถูกใช้แล้ว' }, 409);
  }
  await users.updateOne({ _id: owner._id, role: 'owner' }, {
    $set: { username, name: username, password_hash: hash, updated_at: now, is_active: 1 },
    $unset: { password: '' },
    $inc: { auth_version: 1 },
  });
  return jsonResponse(res, { success: true, message: 'เปลี่ยน Username และ Password ของแอดมินแล้ว กรุณาเข้าสู่ระบบใหม่' });
}));

router.get('/auth/me', requireAuth, (req, res) => jsonResponse(res, { success: true, user: req.user }));

router.post('/auth/change-password', requireAuth, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { current_password: currentPassword, new_password: newPassword } = req.body || {};
  if (!validPassword(newPassword)) return jsonResponse(res, { success: false, message: 'กรุณาระบุรหัสผ่านใหม่ (ไม่เกิน 4096 ไบต์)' }, 422);
  const id = oidOrNull(req.user.id);
  if (!id) return jsonResponse(res, { success: false, message: 'ไม่พบบัญชี' }, 404);
  const user = await req.db.collection('users').findOne({ _id: id, is_active: { $ne: 0 } });
  if (!user || !await verifyPassword(currentPassword, user.password_hash || user.password || '')) {
    return jsonResponse(res, { success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 403);
  }
  const passwordHash = await hashPassword(newPassword);
  await req.db.collection('users').updateOne({ _id: id }, { $set: { password_hash: passwordHash, updated_at: nowIso() }, $unset: { password: '' }, $inc: { auth_version: 1 } });
  jsonResponse(res, { success: true, message: 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง' });
}));



router.get('/item-types', (_req, res) => jsonResponse(res, { success: true, data: ITEM_TYPES }));

function mapNumber(value, min, max, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    const err = new Error(`${label} ไม่ถูกต้อง`);
    err.status = 400;
    throw err;
  }
  return parsed;
}

async function mapFetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': config.maps.userAgent, Accept: 'application/json', 'Accept-Language': 'th,en;q=0.8' },
    });
    if (!response.ok) throw new Error(`บริการแผนที่ตอบกลับ HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('บริการแผนที่ใช้เวลานานเกินไป กรุณาลองใหม่');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function googleMapsJson(url, { method = 'GET', body, fieldMask = '' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.maps.googleApiKey };
    if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
    const response = await fetch(url, { method, signal: controller.signal, headers, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Google Maps HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeGooglePolyline(encoded = '') {
  const points = [];
  let index = 0; let lat = 0; let lon = 0;
  while (index < encoded.length) {
    let shift = 0; let result = 0; let byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lon / 1e5, lat / 1e5]);
  }
  return points;
}

function isAllowedGoogleMapsHost(hostname = '') {
  const host = String(hostname).toLowerCase();
  return host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'google.com' || /(^|\.)google\.[a-z.]+$/.test(host);
}

function normalizeGoogleMapsInput(input = '') {
  let value = String(input).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const webLink = value.match(/https?:\/\/[^\s<>"']+/i);
  if (webLink) value = webLink[0];
  if (/^intent:\/\//i.test(value)) {
    const fallback = value.match(/S\.browser_fallback_url=([^;]+)/i)?.[1];
    if (fallback) value = decodeURIComponent(fallback);
    else value = `https://${value.slice('intent://'.length).split('#Intent')[0]}`;
  }
  if (/^google\.navigation:/i.test(value)) {
    const query = value.match(/[?&]q=([^&]+)/i)?.[1] || '';
    value = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  if (/^geo:/i.test(value)) {
    const location = value.slice(4).split('?')[0];
    const query = value.match(/[?&]q=([^&]+)/i)?.[1] || encodeURIComponent(location);
    value = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  value = value.replace(/[),.;]+$/, '');
  if (/^(?:www\.)?(?:maps\.)?google\.[a-z.]+\//i.test(value) || /^(?:maps\.app\.goo\.gl|goo\.gl)\//i.test(value)) value = `https://${value}`;
  if (/^http:\/\//i.test(value)) value = `https://${value.slice('http://'.length)}`;
  let parsed;
  try { parsed = new URL(value); }
  catch (_) {
    const error = new Error('อ่านลิงก์ไม่ได้ กรุณากด “แชร์” ใน Google Maps แล้วคัดลอกลิงก์มาวางใหม่');
    error.status = 400;
    throw error;
  }
  if (!isAllowedGoogleMapsHost(parsed.hostname)) {
    const error = new Error('ลิงก์นี้ไม่ใช่ Google Maps กรุณาใช้ลิงก์จาก maps.app.goo.gl หรือ google.com/maps');
    error.status = 400;
    throw error;
  }
  parsed.protocol = 'https:';
  return parsed;
}

async function expandGoogleMapsUrl(rawUrl) {
  let current = normalizeGoogleMapsInput(rawUrl);
  const shortLink = current.hostname === 'maps.app.goo.gl' || current.hostname === 'goo.gl';
  if (!shortLink) return current;
  for (let hop = 0; hop < 6; hop += 1) {
    if (!isAllowedGoogleMapsHost(current.hostname)) return normalizeGoogleMapsInput(current.toString());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': config.maps.userAgent } });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        const resolved = new URL(location, current).toString();
        current = normalizeGoogleMapsInput(resolved);
        if (current.hostname.startsWith('consent.google.')) {
          const continueUrl = current.searchParams.get('continue');
          if (continueUrl) current = normalizeGoogleMapsInput(continueUrl);
        }
        continue;
      }
      return current;
    } finally { clearTimeout(timeout); }
  }
  throw new Error('ลิงก์ Google Maps เปลี่ยนเส้นทางมากเกินไป กรุณาคัดลอกลิงก์ใหม่');
}

function coordinatesFromText(value = '') {
  const match = String(value).match(/(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]); const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function isDynamicCurrentLocation(value = '') {
  const normalized = decodeURIComponent(String(value || '').replace(/\+/g, ' ')).trim().toLowerCase();
  return !normalized || [
    'my location', 'your location', 'current location',
    'ตำแหน่งของคุณ', 'ตำแหน่งปัจจุบัน', 'สถานที่ของคุณ',
  ].some((token) => normalized === token || normalized.includes(token));
}

function routeCoordinatesFromGoogleData(value = '') {
  const points = [];
  const add = (lat, lon) => {
    const point = { lat: Number(lat), lon: Number(lon) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) return;
    if (!points.some((row) => Math.abs(row.lat - point.lat) < 0.000001 && Math.abs(row.lon - point.lon) < 0.000001)) points.push(point);
  };
  for (const match of String(value).matchAll(/!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g)) add(match[2], match[1]);
  return points;
}

function importedEndpointLabel(value, fallback) {
  const decoded = decodeURIComponent(String(value || '').replace(/\+/g, ' ')).trim();
  return !decoded || isDynamicCurrentLocation(decoded) || coordinatesFromText(decoded) ? fallback : decoded;
}

async function geocodeImportedPlace(value, label) {
  const decoded = decodeURIComponent(String(value || '').replace(/\+/g, ' ')).trim();
  const coordinates = coordinatesFromText(decoded);
  if (coordinates) {
    const genericLabel = !label || /^(ต้นทาง|ปลายทาง|หมุด)จาก Google Maps$/.test(label);
    if (genericLabel && config.maps.googleApiKey) {
      try {
        const payload = await googleMapsJson(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinates.lat},${coordinates.lon}&language=th&key=${encodeURIComponent(config.maps.googleApiKey)}`);
        const row = payload.results?.[0];
        if (row) return { id: row.place_id || `google-link-${coordinates.lat}-${coordinates.lon}`, name: row.formatted_address || decoded, ...coordinates, provider: 'Google Maps link + Google Geocoding' };
      } catch (error) { console.warn('Google imported coordinate reverse fallback:', error.message); }
    }
    if (genericLabel) {
      try {
        const row = await mapFetchJson(`${config.maps.geocodingUrl}/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=th,en&lat=${coordinates.lat}&lon=${coordinates.lon}`);
        if (row?.display_name) return { id: `osm-${row.place_id || `${coordinates.lat}-${coordinates.lon}`}`, name: row.display_name, ...coordinates, provider: 'Google Maps link + OpenStreetMap' };
      } catch (error) { console.warn('OSM imported coordinate reverse fallback:', error.message); }
    }
    return { id: `google-link-${coordinates.lat}-${coordinates.lon}`, name: label || decoded, ...coordinates, provider: 'Google Maps link' };
  }
  if (!decoded) return null;
  if (config.maps.googleApiKey) {
    try {
      const payload = await googleMapsJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(decoded)}&language=th&key=${encodeURIComponent(config.maps.googleApiKey)}`);
      const row = payload.results?.[0];
      if (row) return { id: row.place_id, name: row.formatted_address || decoded, lat: Number(row.geometry?.location?.lat), lon: Number(row.geometry?.location?.lng), provider: 'Google Geocoding' };
    } catch (error) { console.warn('Google link geocoding fallback:', error.message); }
  }
  const rows = await mapFetchJson(`${config.maps.geocodingUrl}/search?format=jsonv2&limit=1&addressdetails=1&accept-language=th,en&q=${encodeURIComponent(decoded)}`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? { id: `osm-${row.place_id}`, name: row.display_name || decoded, lat: Number(row.lat), lon: Number(row.lon), provider: 'OpenStreetMap' } : null;
}

router.post('/maps/import-google-link', requireAuth, asyncHandler(async (req, res) => {
  const rawUrl = cleanString(req.body?.url, '').slice(0, 5000);
  if (!rawUrl) return jsonResponse(res, { success: false, message: 'กรุณาวางลิงก์ Google Maps' }, 400);
  let expanded;
  try { expanded = await expandGoogleMapsUrl(rawUrl); }
  catch (error) { error.status = error.status || 400; throw error; }
  const href = expanded.toString();
  const params = expanded.searchParams;
  let originText = params.get('origin') || '';
  let destinationText = params.get('destination') || '';
  const rawDirMatch = expanded.pathname.match(/\/dir\/([^/]*)\/([^/]*)/i);
  if (rawDirMatch) {
    originText ||= decodeURIComponent(rawDirMatch[1] || '');
    destinationText ||= decodeURIComponent(rawDirMatch[2] || '');
  }
  const pathParts = expanded.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  const dirIndex = pathParts.indexOf('dir');
  if (dirIndex >= 0 && !rawDirMatch) {
    originText ||= pathParts[dirIndex + 1] || '';
    destinationText ||= pathParts[dirIndex + 2] || '';
  }
  let requiresCurrentOrigin = dirIndex >= 0 && isDynamicCurrentLocation(originText);
  if (requiresCurrentOrigin) originText = '';
  const dataCoordinate = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const atCoordinate = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const singleText = params.get('query') || params.get('q') || params.get('ll') || '';
  const singleCoordinates = dataCoordinate ? `${dataCoordinate[1]},${dataCoordinate[2]}` : atCoordinate ? `${atCoordinate[1]},${atCoordinate[2]}` : singleText;
  let [origin, destination] = await Promise.all([
    originText ? geocodeImportedPlace(originText, 'ต้นทางจาก Google Maps') : null,
    destinationText ? geocodeImportedPlace(destinationText, 'ปลายทางจาก Google Maps') : null,
  ]);
  const embeddedEndpoints = routeCoordinatesFromGoogleData(href);
  if (embeddedEndpoints.length >= 2) {
    const first = embeddedEndpoints[0];
    const last = embeddedEndpoints[embeddedEndpoints.length - 1];
    [origin, destination] = await Promise.all([
      geocodeImportedPlace(`${first.lat},${first.lon}`, importedEndpointLabel(originText, 'ต้นทางจาก Google Maps')),
      geocodeImportedPlace(`${last.lat},${last.lon}`, importedEndpointLabel(destinationText, 'ปลายทางจาก Google Maps')),
    ]);
    requiresCurrentOrigin = false;
  } else if (embeddedEndpoints.length === 1 && destinationText && !originText) {
    const only = embeddedEndpoints[0];
    destination = await geocodeImportedPlace(`${only.lat},${only.lon}`, importedEndpointLabel(destinationText, 'ปลายทางจาก Google Maps'));
  }
  const placeIndex = pathParts.indexOf('place');
  const pointLabel = placeIndex >= 0 ? pathParts[placeIndex + 1] : 'หมุดจาก Google Maps';
  const point = (!origin && !destination && singleCoordinates) ? await geocodeImportedPlace(singleCoordinates, pointLabel || 'หมุดจาก Google Maps') : null;
  if (!origin && !destination && !point) return jsonResponse(res, { success: false, message: 'อ่านพิกัดจากลิงก์นี้ไม่ได้ กรุณาใช้ปุ่มแชร์ใน Google Maps หรือวางลิงก์เส้นทาง' }, 422);
  jsonResponse(res, { success: true, data: {
    origin, destination, point,
    requires_current_origin: requiresCurrentOrigin,
    suggested_target: destination ? 'destination' : origin ? 'origin' : null,
    expanded_url: href, provider: 'Google Maps import',
  } });
}));

router.get('/maps/search', requireAuth, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 180);
  if (q.length < 2) return jsonResponse(res, { success: false, message: 'กรุณากรอกชื่อสถานที่อย่างน้อย 2 ตัวอักษร' }, 400);
  const simplified = q.replace(/\b(company|co\.?|ltd\.?|limited|corporation|corp\.?)\b/gi, ' ').replace(/บริษัท|จำกัด|หจก\.?|บจก\.?/g, ' ').replace(/\s+/g, ' ').trim();
  const queries = [...new Set([q, simplified].filter((value) => value.length >= 2))];
  const collected = [];
  const addRows = (rows) => {
    for (const row of rows || []) {
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
      const duplicate = collected.some((item) => Math.abs(item.lat - row.lat) < 0.00008 && Math.abs(item.lon - row.lon) < 0.00008);
      if (!duplicate) collected.push(row);
    }
  };
  if (config.maps.googleApiKey) {
    for (const searchQuery of queries) {
      try {
        const payload = await googleMapsJson('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST', body: { textQuery: searchQuery, languageCode: 'th', maxResultCount: 10 },
          fieldMask: 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType',
        });
        addRows((payload.places || []).map((place) => ({ id: place.id, name: `${place.displayName?.text || searchQuery}${place.formattedAddress ? ` — ${place.formattedAddress}` : ''}`, lat: Number(place.location?.latitude), lon: Number(place.location?.longitude), type: place.primaryType || '', provider: 'Google Places' })));
      } catch (error) { console.warn('Google Places fallback:', error.message); }
      if (collected.length < 5) {
        try {
          const payload = await googleMapsJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&language=th&key=${encodeURIComponent(config.maps.googleApiKey)}`);
          addRows((payload.results || []).slice(0, 8).map((row) => ({ id: row.place_id, name: row.formatted_address || searchQuery, lat: Number(row.geometry?.location?.lat), lon: Number(row.geometry?.location?.lng), type: row.types?.[0] || '', provider: 'Google Geocoding' })));
        } catch (error) { console.warn('Google Geocoding search fallback:', error.message); }
      }
    }
  }
  for (const searchQuery of queries) {
    try {
      const url = `${config.maps.geocodingUrl}/search?format=jsonv2&limit=10&addressdetails=1&accept-language=th,en&q=${encodeURIComponent(searchQuery)}`;
      const rows = await mapFetchJson(url);
      addRows((Array.isArray(rows) ? rows : []).map((row) => ({ id: `osm-${row.place_id}`, name: row.display_name, lat: Number(row.lat), lon: Number(row.lon), type: row.type || '', provider: 'OpenStreetMap' })));
    } catch (error) { console.warn('OpenStreetMap search fallback:', error.message); }
  }
  jsonResponse(res, { success: true, data: collected.slice(0, 18), provider: config.maps.googleApiKey ? 'Multi-source: Google + OpenStreetMap' : 'OpenStreetMap', query_variants: queries.length });
}));

router.get('/maps/status', requireAuth, (_req, res) => jsonResponse(res, { success: true, data: { google_enabled: Boolean(config.maps.googleApiKey), search_provider: config.maps.googleApiKey ? 'Google Places' : 'OpenStreetMap ทั่วโลก', route_provider: config.maps.googleApiKey ? 'Google Routes (Traffic-aware)' : 'OSRM' } }));

router.get('/maps/reverse', requireAuth, asyncHandler(async (req, res) => {
  const lat = mapNumber(req.query.lat, -90, 90, 'ละติจูด');
  const lon = mapNumber(req.query.lon, -180, 180, 'ลองจิจูด');
  if (config.maps.googleApiKey) {
    try {
      const payload = await googleMapsJson(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&language=th&key=${encodeURIComponent(config.maps.googleApiKey)}`);
      const found = payload.results?.[0];
      if (found) return jsonResponse(res, { success: true, data: { id: found.place_id || 'gps', name: found.formatted_address || `${lat}, ${lon}`, lat, lon, type: 'gps', provider: 'Google Geocoding' } });
    } catch (error) { console.warn('Google Geocoding fallback:', error.message); }
  }
  const url = `${config.maps.geocodingUrl}/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lon}`;
  const row = await mapFetchJson(url);
  jsonResponse(res, { success: true, data: { id: String(row.place_id || 'gps'), name: row.display_name || `${lat}, ${lon}`, lat, lon, type: row.type || 'gps' } });
}));

router.get('/maps/route', requireAuth, asyncHandler(async (req, res) => {
  const originLat = mapNumber(req.query.origin_lat, -90, 90, 'ละติจูดต้นทาง');
  const originLon = mapNumber(req.query.origin_lon, -180, 180, 'ลองจิจูดต้นทาง');
  const destinationLat = mapNumber(req.query.destination_lat, -90, 90, 'ละติจูดปลายทาง');
  const destinationLon = mapNumber(req.query.destination_lon, -180, 180, 'ลองจิจูดปลายทาง');
  if (config.maps.googleApiKey) {
    try {
      const payload = await googleMapsJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        body: { origin: { location: { latLng: { latitude: originLat, longitude: originLon } } }, destination: { location: { latLng: { latitude: destinationLat, longitude: destinationLon } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: false, languageCode: 'th-TH', units: 'METRIC' },
        fieldMask: 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      });
      const googleRoute = payload.routes?.[0];
      if (googleRoute) return jsonResponse(res, { success: true, data: { distance_m: Math.round(Number(googleRoute.distanceMeters || 0)), distance_km: round2(Number(googleRoute.distanceMeters || 0) / 1000), duration_minutes: Math.max(1, Math.round(Number(String(googleRoute.duration || '0s').replace('s', '')) / 60)), geometry: decodeGooglePolyline(googleRoute.polyline?.encodedPolyline || ''), route_quality: 'เส้นทางรถยนต์ Google แบบ Traffic-aware', calculated_at: nowIso(), provider: 'Google Routes · Traffic-aware' } });
    } catch (error) { console.warn('Google Routes fallback:', error.message); }
  }
  const coordinates = `${originLon},${originLat};${destinationLon},${destinationLat}`;
  const url = `${config.maps.routingUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const payload = await mapFetchJson(url);
  const route = payload?.routes?.[0];
  if (!route) return jsonResponse(res, { success: false, message: 'ไม่พบเส้นทางรถยนต์ระหว่างสองจุดนี้' }, 404);
  jsonResponse(res, { success: true, data: {
    distance_m: Math.round(Number(route.distance || 0)),
    distance_km: round2(Number(route.distance || 0) / 1000),
    duration_minutes: Math.max(1, Math.round(Number(route.duration || 0) / 60)),
    geometry: Array.isArray(route.geometry?.coordinates)
      ? route.geometry.coordinates.map((point) => [Number(point[0]), Number(point[1])])
        .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
      : [],
    route_quality: 'เส้นทางรถยนต์ตามเครือข่ายถนน OSRM', calculated_at: nowIso(), provider: 'OpenStreetMap / OSRM',
  } });
}));

router.get('/meta/fields', requireAuth, (_req, res) => jsonResponse(res, {
  success: true,
  data: {
    collections: ['branches', 'users', 'vehicles', 'deliveries', 'stocks', 'stock_movements', 'stock_audits', 'notifications'],
    item_types: ITEM_TYPES,
    delivery_labels: {
      work_date: 'ลงวันที่กำกับ', fill_date: 'วันที่เติม', fill_time: 'เวลาเติม', operation_type: 'ประเภทงาน', item_type: 'ประเภทน้ำมัน',
      plate_no: 'ทะเบียนรถ', vehicle_no: 'เบอร์รถ', driver_name: 'คนขับ', filler_name: 'ชื่อผู้เติม', recorder_name: 'ชื่อผู้กรอก',
      origin_place: 'จุดรับสินค้า / บ่อต้นทาง', destination_place: 'จุดลงงาน / ปลายทาง',
      load_date: 'วันที่บรรทุก', unload_date: 'วันที่ลงของ', cargo_name: 'ประเภทสินค้า / ชื่องาน', loading_weight_kg: 'น้ำหนักต้นทาง (กก.)', unloading_weight_kg: 'น้ำหนักปลายทาง (กก.)', cargo_stone_weight: 'น้ำหนักหิน', cargo_sand_weight: 'น้ำหนักไม้สับ',
      trip_fee_baht: 'ค่าบรรทุก', allowance_baht: 'ค่าหิน', other_income_baht: 'ค่าทราย', total_income_baht: 'รวมรายได้', wage_payer: 'ผู้จ่ายค่าแรง', payment_status: 'สถานะรายได้',
      quantity_liters: 'จำนวนลิตรเติมจริง', actual_filled_liters: 'จำนวนลิตรเติมจริง', standard_fuel_liters: 'จำนวนลิตรมาตรฐาน', recommended_fuel_liters: 'จำนวนลิตรที่คำนวณจากระยะทาง', fuel_variance_liters: 'ส่วนต่างลิตรจริงเทียบมาตรฐาน', fuel_variance_baht: 'มูลค่าส่วนต่างน้ำมัน', calculation_mode: 'รูปแบบการคำนวณ', price_baht_per_liter: 'ราคาน้ำมันลิตรละ (บาท)', amount_baht: 'ค่าใช้จ่ายเติมจริง', expected_fuel_efficiency_km_per_liter: 'อัตราประจำรถ กม./ลิตร', estimated_distance_km: 'ระยะทางตรวจสอบจากลิตร', distance_km: 'ระยะทางที่กรอก', odometer_before: 'เลขหัวจ่ายก่อนเติม (อ้างอิง)', odometer_after: 'เลขหัวจ่ายหลังเติม (อ้างอิง)', fuel_efficiency_km_per_liter: 'อัตราที่คำนวณย้อนกลับ กม./ลิตร',
      bill_photos: 'รูปบิลหลายรูป', document_photos: 'รูปเอกสารหลายรูป', oil_photos: 'รูปเกี่ยวกับน้ำมันหลายรูป', cargo_photos: 'รูปบรรทุกหลายรูป'
    }
  }
}));

router.get('/branches', requireAuth, asyncHandler(async (req, res) => {
  const filter = (req.user.role || '') === 'owner'
    ? {}
    : { _id: oidOrNull(req.user.branch_id), is_active: { $ne: 0 } };
  const rows = await req.db.collection('branches').find(filter, { sort: { is_active: -1, is_default: -1, name: 1 } }).toArray();
  let data = rows.map(mongoToPlain);
  if (!data.length) data = [mongoToPlain(await ensureDefaultBranch(req.db))];
  jsonResponse(res, { success: true, data });
}));

router.post('/branches', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name);
  const code = cleanString(req.body.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
  if (!name || !code) return jsonResponse(res, { success: false, message: 'กรอกชื่อสาขาและรหัสสาขา' }, 422);
  if (await req.db.collection('branches').findOne({ code })) return jsonResponse(res, { success: false, message: 'รหัสสาขานี้ถูกใช้งานแล้ว' }, 409);
  const doc = {
    name,
    code,
    address: cleanString(req.body.address),
    phone: cleanString(req.body.phone),
    note: cleanString(req.body.note),
    is_default: 0,
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const result = await req.db.collection('branches').insertOne(doc);
  const branch = mongoToPlain({ ...doc, _id: result.insertedId });
  const fields = branchFields(branch);
  for (const itemType of ITEM_TYPES) {
    const defaults = DEFAULT_STOCK_SETTINGS[itemType] || DEFAULT_STOCK_SETTINGS['ดีเซล'];
    await req.db.collection('stocks').updateOne(
      { branch_id: fields.branch_id, item_type: itemType },
      { $setOnInsert: { ...fields, item_type: itemType, balance_liters: 0, ...defaults, last_alert_status: 'ready', created_at: nowIso() }, $set: { updated_at: nowIso() } },
      { upsert: true },
    );
  }
  emitDataChanged('branches', 'create', { id: branch.id });
  jsonResponse(res, { success: true, data: branch }, 201);
}));

router.put('/branches/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสสาขาไม่ถูกต้อง' }, 400);
  const existing = await req.db.collection('branches').findOne({ _id: oid });
  if (!existing) return jsonResponse(res, { success: false, message: 'ไม่พบสาขา' }, 404);
  const name = cleanString(req.body.name) || existing.name;
  const code = (cleanString(req.body.code) || existing.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
  const duplicate = await req.db.collection('branches').findOne({ code, _id: { $ne: oid } });
  if (duplicate) return jsonResponse(res, { success: false, message: 'รหัสสาขานี้ถูกใช้งานแล้ว' }, 409);
  const update = {
    name,
    code,
    address: cleanString(req.body.address),
    phone: cleanString(req.body.phone),
    note: cleanString(req.body.note),
    is_active: req.body.is_active === 0 || req.body.is_active === '0' ? 0 : 1,
    updated_at: nowIso(),
  };
  const branchUpdate = { $set: update };
  if (update.is_active === 1) branchUpdate.$unset = { deleted_at: '' };
  await req.db.collection('branches').updateOne({ _id: oid }, branchUpdate);
  const fields = branchFields({ id: String(oid), ...update });
  for (const collectionName of ['stocks', 'stock_movements', 'stock_transactions', 'stock_audits', 'deliveries', 'notifications', 'users', 'vehicles']) {
    await req.db.collection(collectionName).updateMany({ branch_id: String(oid) }, { $set: { branch_name: fields.branch_name, branch_code: fields.branch_code, updated_at: nowIso() } });
  }
  const fresh = await req.db.collection('branches').findOne({ _id: oid });
  emitDataChanged('branches', 'update', { id: String(oid) });
  jsonResponse(res, { success: true, data: mongoToPlain(fresh) });
}));

router.delete('/branches/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสสาขาไม่ถูกต้อง' }, 400);
  const branch = await req.db.collection('branches').findOne({ _id: oid, is_active: { $ne: 0 } });
  if (!branch) return jsonResponse(res, { success: false, message: 'ไม่พบสาขา' }, 404);
  const activeCount = await req.db.collection('branches').countDocuments({ is_active: { $ne: 0 } });
  if (activeCount <= 1) return jsonResponse(res, { success: false, message: 'ต้องมีสาขาที่ใช้งานอย่างน้อย 1 สาขา' }, 409);
  const assignedUsers = await req.db.collection('users').countDocuments({ branch_id: String(oid), role: { $ne: 'owner' }, is_active: { $ne: 0 } });
  if (assignedUsers > 0) return jsonResponse(res, { success: false, message: `ยังมีพนักงาน ${assignedUsers} คนอยู่ในสาขานี้ กรุณาย้ายพนักงานก่อนลบสาขา` }, 409);
  await req.db.collection('branches').updateOne({ _id: oid }, { $set: { is_active: 0, is_default: 0, deleted_at: nowIso(), updated_at: nowIso() } });
  if (branch.is_default) {
    const replacement = await req.db.collection('branches').findOne({ _id: { $ne: oid }, is_active: { $ne: 0 } }, { sort: { created_at: 1 } });
    if (replacement) await req.db.collection('branches').updateOne({ _id: replacement._id }, { $set: { is_default: 1, updated_at: nowIso() } });
  }
  emitDataChanged('branches', 'delete', { id: String(oid) });
  jsonResponse(res, { success: true });
}));

router.get('/users', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const users = await req.db.collection('users').find({ branch_id: branch.id }, { projection: { password_hash: 0, password: 0 }, sort: { created_at: -1 } }).toArray();
  jsonResponse(res, { success: true, data: users.map(publicUser), branch });
}));

router.post('/users', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const username = cleanString(req.body.username);
  const password = req.body.password;
  if (!username || !validPassword(password)) return jsonResponse(res, { success: false, message: 'กรอก username และ password' }, 422);
  const duplicate = await req.db.collection('users').findOne({ username });
  if (duplicate) return jsonResponse(res, { success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' }, 409);
  const passwordHash = await hashPassword(password);
  const doc = {
    ...branchFields(branch),
    name: cleanString(req.body.name) || username,
    username,
    password_hash: passwordHash,
    role: ['owner', 'employee'].includes(req.body.role) ? req.body.role : 'employee',
    phone: cleanString(req.body.phone),
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  let result;
  try {
    result = await req.db.collection('users').insertOne(doc);
  } catch (error) {
    if (error.code === 11000) {
      return jsonResponse(res, { success: false, message: error.keyPattern?.username
        ? 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว'
        : 'พบดัชนีซ้ำในฐานข้อมูล โปรดให้ผู้ดูแลตรวจสอบ MongoDB users indexes' }, 409);
    }
    throw error;
  }
  emitDataChanged('users', 'create', { id: String(result.insertedId) });
  jsonResponse(res, { success: true, data: publicUser({ ...doc, _id: result.insertedId }) });
}));

router.put('/users/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const sourceBranch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสผู้ใช้ไม่ถูกต้อง' }, 400);
  const existing = await req.db.collection('users').findOne({ _id: oid, branch_id: sourceBranch.id });
  if (!existing) return jsonResponse(res, { success: false, message: 'ไม่พบบัญชีในสาขาที่เลือก' }, 404);

  let targetBranch = sourceBranch;
  const requestedBranchId = cleanString(req.body.branch_id);
  if (requestedBranchId && requestedBranchId !== sourceBranch.id) {
    const found = await findBranch(req.db, requestedBranchId);
    if (!found) return jsonResponse(res, { success: false, message: 'ไม่พบสาขาปลายทางหรือสาขาถูกปิดใช้งาน' }, 422);
    targetBranch = mongoToPlain(found);
  }

  const username = cleanString(req.body.username) || existing.username;
  const duplicate = await req.db.collection('users').findOne({ username, _id: { $ne: oid } });
  if (duplicate) return jsonResponse(res, { success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' }, 409);
  const requestedActive = req.body.is_active === 0 || req.body.is_active === '0' ? 0 : 1;
  const requestedRole = ['owner', 'employee'].includes(req.body.role) ? req.body.role : (existing.role || 'employee');
  if (String(req.user.id) === String(oid) && requestedActive === 0) {
    return jsonResponse(res, { success: false, message: 'ไม่สามารถปิดบัญชีที่กำลังใช้งานอยู่' }, 422);
  }
  if (String(req.user.id) === String(oid) && existing.role === 'owner' && requestedRole !== 'owner') {
    return jsonResponse(res, { success: false, message: 'ไม่สามารถลดสิทธิ์บัญชีเจ้าของที่กำลังใช้งานอยู่' }, 422);
  }

  const update = {
    ...branchFields(targetBranch),
    name: cleanString(req.body.name) || existing.name || username,
    username,
    role: requestedRole,
    phone: cleanString(req.body.phone),
    is_active: requestedActive,
    updated_at: nowIso(),
  };
  if (req.body.password !== undefined && req.body.password !== '') {
    if (!validPassword(req.body.password)) return jsonResponse(res, { success: false, message: 'รหัสผ่านไม่ถูกต้องหรือยาวเกินขนาดข้อมูลที่รองรับ' }, 422);
    update.password_hash = await hashPassword(req.body.password);
    update.auth_version = Number(existing.auth_version || 0) + 1;
  }
  if (requestedRole !== existing.role || requestedActive !== Number(existing.is_active ?? 1) || username !== existing.username) {
    update.auth_version = Number(existing.auth_version || 0) + 1;
  }
  await req.db.collection('users').updateOne({ _id: oid, branch_id: sourceBranch.id }, { $set: update, ...(update.password_hash ? { $unset: { password: '' } } : {}) });

  if (targetBranch.id !== sourceBranch.id) {
    await req.db.collection('vehicles').updateMany(
      { branch_id: sourceBranch.id, user_id: String(oid) },
      { $set: { user_id: '', updated_at: nowIso() } },
    );
  }

  const user = await findUserPublic(req.db, oid);
  emitDataChanged('users', 'update', { id: String(oid), branch_id: targetBranch.id, previous_branch_id: sourceBranch.id });
  if (targetBranch.id !== sourceBranch.id) emitDataChanged('vehicles', 'refresh', { branch_id: sourceBranch.id, reason: 'user-transfer' });
  jsonResponse(res, { success: true, data: user, branch: targetBranch });
}));

router.delete('/users/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสผู้ใช้ไม่ถูกต้อง' }, 400);
  if (String(req.user.id) === String(oid)) return jsonResponse(res, { success: false, message: 'ไม่สามารถปิดบัญชีที่กำลังใช้งานอยู่' }, 422);
  const result = await req.db.collection('users').updateOne(
    { _id: oid, branch_id: branch.id },
    { $set: { is_active: 0, updated_at: nowIso() } },
  );
  if (!result.matchedCount) return jsonResponse(res, { success: false, message: 'ไม่พบบัญชีในสาขาที่เลือก' }, 404);
  emitDataChanged('users', 'delete', { id: String(oid), branch_id: branch.id });
  jsonResponse(res, { success: true });
}));

router.get('/vehicles/options', requireAuth, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const filter = { is_active: { $ne: 0 }, branch_id: branch.id };
  if ((req.user.role || '') !== 'owner') filter.$or = [
    { user_id: String(req.user.id) },
    { user_id: '' },
    { user_id: null },
    { user_id: { $exists: false } },
  ];
  const vehicles = await req.db.collection('vehicles').find(filter, {
    sort: { created_at: -1 },
    projection: { plate_no: 1, vehicle_no: 1, driver_name: 1, fuel_efficiency_km_per_liter: 1, user_id: 1 },
    limit: 200,
  }).toArray();
  jsonResponse(res, { success: true, data: vehicles.map(mongoToPlain) });
}));

router.get('/vehicles', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const filter = { is_active: { $ne: 0 }, branch_id: branch.id };
  const vehicles = await req.db.collection('vehicles').find(filter, { sort: { created_at: -1 } }).toArray();
  const enriched = await Promise.all(vehicles.map(async (vehicle) => {
    const v = mongoToPlain(vehicle);
    const employee = v.user_id ? await findUserPublic(req.db, v.user_id) : null;
    v.employee_name = employee?.name || null;
    return v;
  }));
  jsonResponse(res, { success: true, data: enriched });
}));

router.post('/vehicles', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const plateNo = cleanString(req.body.plate_no);
  if (!plateNo) return jsonResponse(res, { success: false, message: 'กรอกเลขทะเบียนรถ' }, 422);
  const duplicate = await req.db.collection('vehicles').findOne({ branch_id: branch.id, plate_no: plateNo, is_active: { $ne: 0 } });
  if (duplicate) return jsonResponse(res, { success: false, message: 'ทะเบียนรถนี้มีอยู่แล้วในสาขาที่เลือก' }, 409);
  const userId = (req.user.role || '') === 'owner' ? cleanString(req.body.user_id) : String(req.user.id);
  const doc = {
    ...branchFields(branch),
    user_id: userId,
    plate_no: plateNo,
    vehicle_no: cleanString(req.body.vehicle_no),
    driver_name: cleanString(req.body.driver_name),
    fuel_efficiency_km_per_liter: round2(Math.max(0, toNumber(req.body.fuel_efficiency_km_per_liter, 0))),
    description: cleanString(req.body.description),
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const result = await req.db.collection('vehicles').insertOne(doc);
  emitDataChanged('vehicles', 'create', { id: String(result.insertedId) });
  jsonResponse(res, { success: true, data: mongoToPlain({ ...doc, _id: result.insertedId }) });
}));

router.put('/vehicles/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรถไม่ถูกต้อง' }, 400);
  const filter = { _id: oid, branch_id: branch.id, is_active: { $ne: 0 } };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const plateNo = cleanString(req.body.plate_no);
  if (!plateNo) return jsonResponse(res, { success: false, message: 'กรอกเลขทะเบียนรถ' }, 422);
  const duplicate = await req.db.collection('vehicles').findOne({ _id: { $ne: oid }, branch_id: branch.id, plate_no: plateNo, is_active: { $ne: 0 } });
  if (duplicate) return jsonResponse(res, { success: false, message: 'ทะเบียนรถนี้มีอยู่แล้วในสาขาที่เลือก' }, 409);
  const update = {
    ...branchFields(branch),
    plate_no: plateNo,
    vehicle_no: cleanString(req.body.vehicle_no),
    driver_name: cleanString(req.body.driver_name),
    fuel_efficiency_km_per_liter: round2(Math.max(0, toNumber(req.body.fuel_efficiency_km_per_liter, 0))),
    description: cleanString(req.body.description),
    updated_at: nowIso(),
  };
  if ((req.user.role || '') === 'owner') update.user_id = cleanString(req.body.user_id);
  Object.keys(update).forEach((key) => key !== 'user_id' && update[key] === '' && delete update[key]);
  const result = await req.db.collection('vehicles').updateOne(filter, { $set: update });
  if (!result.matchedCount) return jsonResponse(res, { success: false, message: 'ไม่พบรถในสาขาที่เลือก' }, 404);
  const vehicle = await findVehiclePublic(req.db, oid);
  emitDataChanged('vehicles', 'update', { id: String(oid) });
  jsonResponse(res, { success: true, data: vehicle });
}));

router.delete('/vehicles/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรถไม่ถูกต้อง' }, 400);
  const filter = { _id: oid, branch_id: branch.id };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const result = await req.db.collection('vehicles').updateOne(filter, { $set: { is_active: 0, updated_at: nowIso() } });
  if (!result.matchedCount) return jsonResponse(res, { success: false, message: 'ไม่พบรถในสาขาที่เลือก' }, 404);
  emitDataChanged('vehicles', 'delete', { id: String(oid), branch_id: branch.id });
  jsonResponse(res, { success: true });
}));


// Independent transport ledger. Entries are manual: do not add deliveries or stock
// into these totals automatically, preventing accidental double counting.
const LEDGER_EXPENSES = ['น้ำมัน', 'อะไหล่', 'ค่าแรงช่างซ่อม', 'ค่ายาง', 'ค่าทางด่วน', 'ค่าแรงคนขับ', 'ค่าใช้จ่ายอื่น'];
function ledgerPayload(body, vehicle, branch, user, previous = {}) {
  const date = String(body.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw Object.assign(new Error('วันที่ไม่ถูกต้อง'), {status: 422});
  const type = body.type;
  if (!['income', 'expense'].includes(type)) throw Object.assign(new Error('เลือกประเภทรายรับหรือรายจ่าย'), {status: 422});
  const category = String(body.category || '').trim();
  if (type === 'income' && category !== 'ค่าขนส่ง' || type === 'expense' && !LEDGER_EXPENSES.includes(category)) throw Object.assign(new Error('หมวดรายการไม่ถูกต้อง'), {status: 422});
  const amountText = String(body.amount_baht ?? '').trim();
  if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(amountText) || Number(amountText) <= 0) throw Object.assign(new Error('กรอกจำนวนเงินมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง'), {status: 422});
  const [whole, fraction=''] = amountText.split('.');
  const amount_satang = Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
  const material = cleanString(body.material).slice(0,120);
  if (type === 'income' && !material) throw Object.assign(new Error('ระบุวัสดุที่ขน'), {status: 422});
  const quantity = cleanString(body.quantity).slice(0,60);
  const note = cleanString(body.note).slice(0,500);
  return {
    ...previous,
    ...branchFields(branch),
    vehicle_id: String(vehicle._id),
    plate_no: vehicle.plate_no,
    date, type, category, amount_satang, material: type === 'income' ? material : '',
    quantity: type === 'income' ? quantity : '', note,
    updated_at: nowIso(), updated_by: String(user.id),
  };
}
async function ledgerVehicle(req, branch) {
  const id = oidOrNull(req.body?.vehicle_id);
  if (!id) return null;
  return req.db.collection('vehicles').findOne({ _id: id, branch_id: branch.id, is_active: { $ne: 0 } });
}
function ledgerSummary(rows, vehicles) {
  const totals = new Map(vehicles.map(v => [String(v._id), {
    vehicle_id: String(v._id), plate_no: v.plate_no, income_satang: 0, expense_satang: 0,
    profit_satang: 0, by_category: {}, material_income: {}, entries: 0,
  }]));
  for (const r of rows) {
    const key = String(r.vehicle_id);
    if (!totals.has(key)) totals.set(key, {vehicle_id:key, plate_no:r.plate_no || '-', income_satang:0,expense_satang:0,profit_satang:0,by_category:{},material_income:{},entries:0});
    const a = totals.get(key), val = Number(r.amount_satang || 0);
    a.entries += 1;
    if (r.type === 'income') {
      a.income_satang += val;
      a.material_income[r.material || 'ไม่ระบุวัสดุ'] = (a.material_income[r.material || 'ไม่ระบุวัสดุ'] || 0) + val;
    } else {
      a.expense_satang += val;
      a.by_category[r.category] = (a.by_category[r.category] || 0) + val;
    }
    a.profit_satang = a.income_satang - a.expense_satang;
  }
  const by_vehicle = [...totals.values()].sort((a,b)=>a.plate_no.localeCompare(b.plate_no,'th'));
  const total = by_vehicle.reduce((a,v)=>({income_satang:a.income_satang+v.income_satang,expense_satang:a.expense_satang+v.expense_satang,profit_satang:a.profit_satang+v.profit_satang}), {income_satang:0,expense_satang:0,profit_satang:0});
  return {total, by_vehicle};
}
router.get('/transport-ledger', requireAuth, requireOwner, asyncHandler(async (req,res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const month = String(req.query.month || today().slice(0,7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return jsonResponse(res,{success:false,message:'รูปแบบเดือนต้องเป็น YYYY-MM'},422);
  const vehicles = await req.db.collection('vehicles').find({branch_id:branch.id,is_active:{$ne:0}},{sort:{plate_no:1}}).toArray();
  const rows = await req.db.collection('transport_ledger').find({branch_id:branch.id,date:{$gte:`${month}-01`,$lte:`${month}-31`}},{sort:{date:-1,created_at:-1}}).toArray();
  const report = ledgerSummary(rows, vehicles);
  jsonResponse(res,{success:true,month,branch,vehicles:vehicles.map(mongoToPlain),rows:rows.map(mongoToPlain),...report});
}));
router.post('/transport-ledger', requireAuth, requireOwner, asyncHandler(async (req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const vehicle=await ledgerVehicle(req,branch);
  if (!vehicle) return jsonResponse(res,{success:false,message:'ไม่พบรถในสาขาที่เลือก'},422);
  const entry=ledgerPayload(req.body,vehicle,branch,req.user);
  entry.created_at=nowIso();entry.created_by=String(req.user.id);
  const result=await req.db.collection('transport_ledger').insertOne(entry);
  emitDataChanged('transport-ledger','create',{id:String(result.insertedId),branch_id:branch.id});
  jsonResponse(res,{success:true,data:mongoToPlain(entry)},201);
}));
router.put('/transport-ledger/:id', requireAuth, requireOwner, asyncHandler(async (req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req), id=oidOrNull(req.params.id);
  if (!id) return jsonResponse(res,{success:false,message:'รหัสรายการไม่ถูกต้อง'},400);
  const existing=await req.db.collection('transport_ledger').findOne({_id:id,branch_id:branch.id});
  if (!existing) return jsonResponse(res,{success:false,message:'ไม่พบรายการ'},404);
  const vehicle=await ledgerVehicle(req,branch);
  if (!vehicle) return jsonResponse(res,{success:false,message:'ไม่พบรถในสาขาที่เลือก'},422);
  const next=ledgerPayload(req.body,vehicle,branch,req.user,existing);
  await req.db.collection('transport_ledger').replaceOne({_id:id,branch_id:branch.id},next);
  emitDataChanged('transport-ledger','update',{id:String(id),branch_id:branch.id});
  jsonResponse(res,{success:true,data:mongoToPlain(next)});
}));
router.delete('/transport-ledger/:id', requireAuth, requireOwner, asyncHandler(async (req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req), id=oidOrNull(req.params.id);
  if (!id) return jsonResponse(res,{success:false,message:'รหัสรายการไม่ถูกต้อง'},400);
  const result=await req.db.collection('transport_ledger').deleteOne({_id:id,branch_id:branch.id});
  if (!result.deletedCount) return jsonResponse(res,{success:false,message:'ไม่พบรายการ'},404);
  emitDataChanged('transport-ledger','delete',{id:String(id),branch_id:branch.id});
  jsonResponse(res,{success:true});
}));


// One trip = one income record and its direct costs. This ledger is intentionally
// independent from transport_ledger and deliveries, avoiding double-counting.
const TRIP_COST_FIELDS = ['sand_cost','stone_cost','fuel_cost','tire_cost','parts_cost','mechanic_cost','driver_cost','other_cost'];
function tripMoney(value, label='จำนวนเงิน') {
  const input=String(value === undefined || value === null || value === '' ? '0' : value).trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(input)) throw Object.assign(new Error(`${label} ต้องเป็นจำนวนเงินไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง`),{status:422});
  const [baht,satang='']=input.split('.');
  return Number(baht)*100+Number(satang.padEnd(2,'0'));
}
function tripPayload(body,vehicle,branch,user,previous={}) {
  const date=String(body.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date) throw Object.assign(new Error('วันที่ไม่ถูกต้อง'),{status:422});
  const material=cleanString(body.material).slice(0,120);
  if (!material) throw Object.assign(new Error('กรุณาระบุวัสดุที่ขน'),{status:422});
  const income_satang=tripMoney(body.income_baht,'ค่าขนส่ง');
  const costs={};
  for (const field of TRIP_COST_FIELDS) costs[`${field}_satang`]=tripMoney(body[field],field);
  const expense_satang=TRIP_COST_FIELDS.reduce((sum,field)=>sum+costs[`${field}_satang`],0);
  const distance=Number(body.distance_km || 0);
  if (!Number.isFinite(distance) || distance<0 || distance>1000000) throw Object.assign(new Error('ระยะทางไม่ถูกต้อง'),{status:422});
  return {...previous,...branchFields(branch),date,vehicle_id:String(vehicle._id),plate_no:vehicle.plate_no,
    material,quantity:cleanString(body.quantity).slice(0,80),origin_place:cleanString(body.origin_place).slice(0,200),destination_place:cleanString(body.destination_place).slice(0,200),
    distance_km:Math.round(distance*100)/100,reference:cleanString(body.reference).slice(0,90),note:cleanString(body.note).slice(0,500),
    income_satang,...costs,expense_satang,profit_satang:income_satang-expense_satang,updated_at:nowIso(),updated_by:String(user.id)};
}
function tripSummary(rows,vehicles) {
  const byVehicle=new Map(vehicles.map(v=>[String(v._id),{vehicle_id:String(v._id),plate_no:v.plate_no,trips:0,income_satang:0,expense_satang:0,profit_satang:0}]));
  const monthly={};
  const empty=()=>({trips:0,income_satang:0,expense_satang:0,profit_satang:0});
  const all=empty();
  for(const r of rows){
    const key=String(r.vehicle_id);
    if(!byVehicle.has(key))byVehicle.set(key,{vehicle_id:key,plate_no:r.plate_no || '-',...empty()});
    const m=r.date.slice(0,7);
    if(!monthly[m])monthly[m]=empty();
    for(const target of [all,byVehicle.get(key),monthly[m]]){
      target.trips++;
      target.income_satang+=Number(r.income_satang||0);
      target.expense_satang+=Number(r.expense_satang||0);
      target.profit_satang+=Number(r.profit_satang||0);
    }
  }
  return {total:all,by_vehicle:[...byVehicle.values()].sort((a,b)=>a.plate_no.localeCompare(b.plate_no,'th')),by_month:Object.entries(monthly).sort(([a],[b])=>b.localeCompare(a)).map(([month,values])=>({month,...values}))};
}
// Read-only finance summary from delivery jobs. Kept separate from manually-entered
// trip_finance transactions to avoid silently counting the same trip twice.
router.get('/delivery-job-finance', requireAuth, requireOwner, asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const period=String(req.query.period || today().slice(0,7));
  if(!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(period)) return jsonResponse(res,{success:false,message:'รูปแบบช่วงเวลาต้องเป็น YYYY หรือ YYYY-MM'},422);
  const rows=await req.db.collection('deliveries').find({branch_id:branch.id,work_date:{$gte:period.length===4?`${period}-01-01`:`${period}-01`,$lte:period.length===4?`${period}-12-31`:`${period}-31`}},{projection:{work_date:1,plate_no:1,vehicle_id:1,jobs:1,trip_fee_baht:1,allowance_baht:1,other_income_baht:1}}).toArray();
  const summary=new Map();
  const monthly=new Map();
  const zeros=()=>({trips:0,income_satang:0,expense_satang:0,profit_satang:0});
  const total=zeros();
  for(const row of rows){
    const jobs=Array.isArray(row.jobs)&&row.jobs.length?row.jobs:[];
    for(const job of jobs){
      const income=Math.round((toNumber(job.trip_fee_baht,0)+toNumber(job.allowance_baht,0)+toNumber(job.other_income_baht,0))*100);
      const expense=Math.round(DELIVERY_JOB_COSTS.reduce((sum,key)=>sum+Math.max(0,toNumber(job[key],0)),0)*100);
      const vehicleId=String(row.vehicle_id||row.plate_no||'-');
      if(!summary.has(vehicleId))summary.set(vehicleId,{vehicle_id:vehicleId,plate_no:row.plate_no||'-',...zeros()});
      const month=String(row.work_date||'').slice(0,7);
      if(!monthly.has(month))monthly.set(month,{month,...zeros()});
      for(const target of [total,summary.get(vehicleId),monthly.get(month)]){
        target.trips++;target.income_satang+=income;target.expense_satang+=expense;target.profit_satang+=income-expense;
      }
    }
  }
  jsonResponse(res,{success:true,period,total,by_vehicle:[...summary.values()].sort((a,b)=>a.plate_no.localeCompare(b.plate_no,'th')),by_month:[...monthly.values()].sort((a,b)=>b.month.localeCompare(a.month))});
}));
// Driver earnings and advances are independent of trip_finance (company profit).
// Existing trip and expense records remain untouched to avoid confusing company revenue
// with driver compensation. Amounts are stored as integer satang.
function driverMoney(value, label) {
  const s = String(value ?? '').trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(s)) throw Object.assign(new Error(`กรุณากรอก${label}เป็นจำนวนเงิน 0 บาทขึ้นไป`), { status: 422 });
  const [baht, cents = ''] = s.split('.');
  return Number(baht) * 100 + Number(cents.padEnd(2, '0'));
}
function driverDate(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) {
    throw Object.assign(new Error('กรุณาระบุวันที่ให้ถูกต้อง'), { status: 422 });
  }
  return s;
}
function driverPeriod(value) {
  const period = String(value || today().slice(0,7));
  if (!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(period)) throw Object.assign(new Error('เดือนหรือปีไม่ถูกต้อง'), { status: 422 });
  return { period, from: period.length === 4 ? `${period}-01-01` : `${period}-01`, to: period.length === 4 ? `${period}-12-31` : `${period}-31` };
}
async function driverVehicle(req, branch) {
  const id = oidOrNull(req.body?.vehicle_id);
  if (!id) throw Object.assign(new Error('กรุณาเลือกทะเบียนรถ'), { status: 422 });
  const vehicle = await req.db.collection('vehicles').findOne({ _id: id, branch_id: branch.id, is_active: { $ne: 0 } });
  if (!vehicle) throw Object.assign(new Error('ไม่พบทะเบียนรถในสาขานี้'), { status: 422 });
  return vehicle;
}
function driverWho(body, vehicle) {
  const name = cleanString(body.driver_name || vehicle.driver_name).slice(0,120);
  if (!name) throw Object.assign(new Error('กรุณากรอกชื่อคนขับ'), { status: 422 });
  return name;
}
function driverRecord(body, vehicle, branch, user, old = {}) {
  const date = driverDate(body.date);
  const driver_name = driverWho(body,vehicle);
  const income_satang = driverMoney(body.income_baht, 'รายได้คนขับ');
  const material = cleanString(body.material).slice(0,120);
  if (!material) throw Object.assign(new Error('กรุณาเลือกวัสดุที่ขน'), { status: 422 });
  return {...old,...branchFields(branch),date,driver_name,vehicle_id:String(vehicle._id),plate_no:vehicle.plate_no,
    material,quantity:cleanString(body.quantity).slice(0,80),origin_place:cleanString(body.origin_place).slice(0,200),
    destination_place:cleanString(body.destination_place).slice(0,200),reference:cleanString(body.reference).slice(0,90),
    note:cleanString(body.note).slice(0,500),income_satang,...normalizeDriverSourceFields(body,old),updated_at:nowIso(),updated_by:String(user.id)};
}

function normalizeDriverSourceFields(body = {}, old = {}) {
  const sourceDeliveryId = cleanString(body.source_delivery_id || old.source_delivery_id).slice(0, 64);
  const sourceJobId = cleanString(body.source_job_id || old.source_job_id).slice(0, 100);
  const sourceType = sourceDeliveryId ? 'delivery' : cleanString(old.source_type).slice(0, 30);
  return sourceDeliveryId ? { source_type: sourceType || 'delivery', source_delivery_id: sourceDeliveryId, source_job_id: sourceJobId || 'legacy' } : {};
}
function deliveryQueueRows(deliveries = [], settled = []) {
  const settledKeys = new Set(settled
    .filter(row => row.source_delivery_id)
    .map(row => `${String(row.source_delivery_id)}::${String(row.source_job_id || 'legacy')}`));
  const out = [];
  for (const row of deliveries) {
    const deliveryId = String(row._id);
    const jobs = Array.isArray(row.jobs) && row.jobs.length ? row.jobs : [legacyDeliveryJob(row)];
    jobs.forEach((job, index) => {
      const jobId = String(job.id || job.job_id || `job-${index + 1}`);
      const key = `${deliveryId}::${jobId}`;
      if (settledKeys.has(key)) return;
      const loadingKg = Number(job.loading_weight_kg || 0);
      const unloadingKg = Number(job.unloading_weight_kg || 0);
      const weightKg = unloadingKg > 0 ? unloadingKg : loadingKg;
      out.push({
        source_delivery_id: deliveryId,
        source_job_id: jobId,
        date: cleanString(job.unload_date || job.load_date || row.work_date || row.fill_date),
        vehicle_id: String(row.vehicle_id || ''),
        plate_no: cleanString(row.plate_no),
        driver_name: cleanString(row.driver_name || row.driver_name_input),
        origin_place: cleanString(job.origin_place || row.origin_place),
        destination_place: cleanString(job.destination_place || row.destination_place),
        quantity: weightKg > 0 ? `${round2(weightKg / 1000)} ตัน` : '',
        reference: cleanString(job.reference || job.job_reference || ''),
        suggested_material: cleanString(job.cargo_name || row.cargo_name || ''),
        created_at: row.created_at || '',
      });
    });
  }
  return out.sort((a,b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
}
async function resolveDriverTripSource(req, branch, body = {}) {
  const sourceId = oidOrNull(body.source_delivery_id);
  if (!sourceId) return { body, source: null };
  const delivery = await req.db.collection('deliveries').findOne({ _id: sourceId, branch_id: branch.id });
  if (!delivery) throw Object.assign(new Error('ไม่พบเที่ยวงานต้นทาง หรือเที่ยวงานไม่ได้อยู่ในสาขานี้'), { status: 404 });
  const jobs = Array.isArray(delivery.jobs) && delivery.jobs.length ? delivery.jobs : [legacyDeliveryJob(delivery)];
  const requestedJobId = cleanString(body.source_job_id || 'legacy');
  let job = jobs.find((item,index) => String(item.id || item.job_id || `job-${index+1}`) === requestedJobId);
  if (!job && jobs.length === 1) job = jobs[0];
  if (!job) throw Object.assign(new Error('ไม่พบงานย่อยที่เลือกในรายการขนส่ง'), { status: 404 });
  const realJobId = String(job.id || job.job_id || (jobs.length === 1 ? 'legacy' : 'job-1'));
  const vehicleId = String(delivery.vehicle_id || body.vehicle_id || '');
  if (body.vehicle_id && delivery.vehicle_id && String(body.vehicle_id) !== String(delivery.vehicle_id)) {
    throw Object.assign(new Error('ทะเบียนรถไม่ตรงกับบิลงานขนส่งต้นทาง กรุณาแก้ทะเบียนในบิลต้นทางก่อนบันทึกรายได้คนขับ'), { status: 422 });
  }
  const loadingKg = Number(job.loading_weight_kg || 0);
  const unloadingKg = Number(job.unloading_weight_kg || 0);
  const weightKg = unloadingKg > 0 ? unloadingKg : loadingKg;
  return {
    source: { delivery, job, jobId: realJobId },
    body: {
      ...body,
      source_delivery_id: String(delivery._id),
      source_job_id: realJobId,
      vehicle_id: vehicleId,
      date: cleanString(job.unload_date || job.load_date || delivery.work_date || delivery.fill_date || body.date),
      driver_name: cleanString(delivery.driver_name || delivery.driver_name_input || body.driver_name),
      origin_place: cleanString(job.origin_place || delivery.origin_place || body.origin_place),
      destination_place: cleanString(job.destination_place || delivery.destination_place || body.destination_place),
      quantity: body.quantity || (weightKg > 0 ? `${round2(weightKg / 1000)} ตัน` : ''),
      reference: body.reference || cleanString(job.reference || job.job_reference || ''),
    },
  };
}
function driverAdvance(body, vehicle, branch, user, old = {}) {
  return {...old,...branchFields(branch),date:driverDate(body.date),vehicle_id:String(vehicle._id),plate_no:vehicle.plate_no,
    driver_name:driverWho(body,vehicle),amount_satang:driverMoney(body.amount_baht,'ยอดเบิก'),
    note:cleanString(body.note).slice(0,500),updated_at:nowIso(),updated_by:String(user.id)};
}
function driverTotals(trips, advances) {
  const byPair = new Map();
  const byPerson = new Map();
  const byVehicle = new Map();
  const monthly = new Map();
  const all = {trips:0,income_satang:0,advance_satang:0,balance_satang:0};

  function ensurePair(row) {
    const vehicle_id = String(row.vehicle_id || '');
    const driver_name = row.driver_name || '-';
    const key = `${vehicle_id}\u0000${driver_name.trim().toLocaleLowerCase('th')}`;
    if (!byPair.has(key)) {
      byPair.set(key, { key, vehicle_id, plate_no: row.plate_no || '-', driver_name, trips: 0, income_satang: 0, advance_satang: 0, balance_satang: 0 });
    }
    return byPair.get(key);
  }

  function ensurePerson(row) {
    const driver_name = row.driver_name || '-';
    const key = driver_name.trim().toLocaleLowerCase('th') || '-';
    if (!byPerson.has(key)) {
      byPerson.set(key, { key, driver_name, trips: 0, income_satang: 0, advance_satang: 0, balance_satang: 0, plate_set: new Set() });
    }
    const item = byPerson.get(key);
    if (row.plate_no) item.plate_set.add(row.plate_no);
    return item;
  }

  function ensureVehicle(row) {
    const vehicle_id = String(row.vehicle_id || row.plate_no || '-');
    if (!byVehicle.has(vehicle_id)) {
      byVehicle.set(vehicle_id, { key: vehicle_id, vehicle_id, plate_no: row.plate_no || '-', trips: 0, income_satang: 0, advance_satang: 0, balance_satang: 0, driver_set: new Set() });
    }
    const item = byVehicle.get(vehicle_id);
    if (row.driver_name) item.driver_set.add(row.driver_name);
    return item;
  }

  function ensureMonth(row) {
    const month = String(row.date).slice(0,7);
    if (!monthly.has(month)) monthly.set(month, { month, trips: 0, income_satang: 0, advance_satang: 0, balance_satang: 0 });
    return monthly.get(month);
  }

  trips.forEach(r => {
    const income = Number(r.income_satang || 0);
    for (const target of [ensurePair(r), ensurePerson(r), ensureVehicle(r), ensureMonth(r), all]) {
      target.trips += 1;
      target.income_satang += income;
    }
  });

  advances.forEach(r => {
    const amount = Number(r.amount_satang || 0);
    for (const target of [ensurePair(r), ensurePerson(r), ensureVehicle(r), ensureMonth(r), all]) {
      target.advance_satang += amount;
    }
  });

  const withBalance = (row) => ({ ...row, balance_satang: Number(row.income_satang || 0) - Number(row.advance_satang || 0) });
  const by_driver = [...byPair.values()].map(withBalance).sort((a,b)=>a.driver_name.localeCompare(b.driver_name,'th')||a.plate_no.localeCompare(b.plate_no,'th'));
  const by_person = [...byPerson.values()].map(row => withBalance({
    ...row,
    plate_nos: [...row.plate_set].sort((a,b)=>a.localeCompare(b,'th')),
    plate_no: [...row.plate_set].sort((a,b)=>a.localeCompare(b,'th')).join(', ') || '-',
    plates_count: row.plate_set.size,
  })).sort((a,b)=>a.driver_name.localeCompare(b.driver_name,'th'));
  const by_vehicle = [...byVehicle.values()].map(row => withBalance({
    ...row,
    driver_names: [...row.driver_set].sort((a,b)=>a.localeCompare(b,'th')),
    driver_name: [...row.driver_set].sort((a,b)=>a.localeCompare(b,'th')).join(', ') || '-',
    drivers_count: row.driver_set.size,
  })).sort((a,b)=>a.plate_no.localeCompare(b.plate_no,'th'));
  const by_month = [...monthly.values()].map(withBalance).sort((a,b)=>b.month.localeCompare(a.month));
  all.balance_satang = all.income_satang - all.advance_satang;
  return { total: all, by_driver, by_person, by_vehicle, by_month };
}

router.get('/driver-finance',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const {period,from,to}=driverPeriod(req.query.period);
  const filter={branch_id:branch.id,date:{$gte:from,$lte:to}};
  const deliveryFilter={branch_id:branch.id,work_date:{$gte:from,$lte:to}};
  const [vehicles,trips,advances,materials,deliveries]=await Promise.all([
    req.db.collection('vehicles').find({branch_id:branch.id,is_active:{$ne:0}},{sort:{plate_no:1},projection:{plate_no:1,driver_name:1}}).toArray(),
    req.db.collection('driver_trips').find(filter,{sort:{date:-1,created_at:-1}}).toArray(),
    req.db.collection('driver_advances').find(filter,{sort:{date:-1,created_at:-1}}).toArray(),
    req.db.collection('transport_materials').find({branch_id:branch.id,is_active:{$ne:0}},{sort:{name:1}}).toArray(),
    req.db.collection('deliveries').find(deliveryFilter,{sort:{work_date:-1,created_at:-1},projection:{work_date:1,fill_date:1,vehicle_id:1,plate_no:1,driver_name:1,driver_name_input:1,jobs:1,origin_place:1,destination_place:1,cargo_name:1,created_at:1}}).toArray(),
  ]);
  const pending_jobs=deliveryQueueRows(deliveries,trips);
  jsonResponse(res,{success:true,period,vehicles:vehicles.map(mongoToPlain),trips:trips.map(mongoToPlain),advances:advances.map(mongoToPlain),materials:materials.map(mongoToPlain),pending_jobs,...driverTotals(trips,advances)});
}));
router.post('/driver-finance/trips',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const resolved=await resolveDriverTripSource(req,branch,req.body||{});
  if(resolved.body.source_delivery_id){
    const duplicate=await req.db.collection('driver_trips').findOne({branch_id:branch.id,source_delivery_id:resolved.body.source_delivery_id,source_job_id:resolved.body.source_job_id});
    if(duplicate)return jsonResponse(res,{success:false,message:'เที่ยวงานนี้คิดรายได้คนขับแล้ว กรุณาเปิดรายการเดิมเพื่อแก้ไข'},409);
  }
  const originalBody=req.body; req.body=resolved.body;
  try {
    const vehicle=await driverVehicle(req,branch);
    const doc=driverRecord(resolved.body,vehicle,branch,req.user);
    doc.created_at=nowIso();doc.created_by=String(req.user.id);
    const result=await req.db.collection('driver_trips').insertOne(doc);
    jsonResponse(res,{success:true,data:mongoToPlain({...doc,_id:result.insertedId})},201);
  } finally { req.body=originalBody; }
}));
router.put('/driver-finance/trips/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสเที่ยวไม่ถูกต้อง'},400);
  const old=await req.db.collection('driver_trips').findOne({_id:id,branch_id:branch.id});
  if(!old)return jsonResponse(res,{success:false,message:'ไม่พบเที่ยวนี้'},404);
  const vehicle=await driverVehicle(req,branch);
  if (old.source_delivery_id && String(vehicle._id) !== String(old.vehicle_id)) {
    return jsonResponse(res,{success:false,message:'รายการนี้ผูกกับบิลงานขนส่งเดิม ไม่สามารถเปลี่ยนทะเบียนในบัญชีคนขับได้ กรุณาแก้ทะเบียนในบิลต้นทางก่อน'},422);
  }
  const doc=driverRecord(req.body,vehicle,branch,req.user,old);
  await req.db.collection('driver_trips').replaceOne({_id:id,branch_id:branch.id},doc);
  jsonResponse(res,{success:true,data:mongoToPlain(doc)});
}));
router.delete('/driver-finance/trips/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสเที่ยวไม่ถูกต้อง'},400);
  const result=await req.db.collection('driver_trips').deleteOne({_id:id,branch_id:branch.id});
  jsonResponse(res,{success:!!result.deletedCount,message:result.deletedCount?'':'ไม่พบรายการ'},result.deletedCount?200:404);
}));
router.post('/driver-finance/advances',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),vehicle=await driverVehicle(req,branch);
  const doc=driverAdvance(req.body,vehicle,branch,req.user);
  doc.created_at=nowIso();doc.created_by=String(req.user.id);
  const result=await req.db.collection('driver_advances').insertOne(doc);
  jsonResponse(res,{success:true,data:mongoToPlain({...doc,_id:result.insertedId})},201);
}));
router.put('/driver-finance/advances/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสเบิกเงินไม่ถูกต้อง'},400);
  const old=await req.db.collection('driver_advances').findOne({_id:id,branch_id:branch.id});
  if(!old)return jsonResponse(res,{success:false,message:'ไม่พบรายการเบิกเงิน'},404);
  const vehicle=await driverVehicle(req,branch),doc=driverAdvance(req.body,vehicle,branch,req.user,old);
  await req.db.collection('driver_advances').replaceOne({_id:id,branch_id:branch.id},doc);
  jsonResponse(res,{success:true,data:mongoToPlain(doc)});
}));
router.delete('/driver-finance/advances/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสเบิกเงินไม่ถูกต้อง'},400);
  const result=await req.db.collection('driver_advances').deleteOne({_id:id,branch_id:branch.id});
  jsonResponse(res,{success:!!result.deletedCount,message:result.deletedCount?'':'ไม่พบรายการ'},result.deletedCount?200:404);
}));
// Shared transport-material catalog: visible to every logged-in employee in their own branch.
router.get('/transport-materials',requireAuth,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const rows=await req.db.collection('transport_materials').find({branch_id:branch.id,is_active:{$ne:0}},{sort:{name:1}}).toArray();
  jsonResponse(res,{success:true,data:rows.map(mongoToPlain)});
}));

router.post('/driver-finance/materials',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const name=cleanString(req.body.name).slice(0,120);
  if(!name)return jsonResponse(res,{success:false,message:'กรุณากรอกชื่อวัสดุ'},422);
  const existing=await req.db.collection('transport_materials').findOne({branch_id:branch.id,name,is_active:{$ne:0}});
  if(existing)return jsonResponse(res,{success:false,message:'ชื่อวัสดุนี้มีอยู่แล้ว'},409);
  const doc={...branchFields(branch),name,is_active:1,created_at:nowIso(),updated_at:nowIso()};
  const result=await req.db.collection('transport_materials').insertOne(doc);
  jsonResponse(res,{success:true,data:mongoToPlain({...doc,_id:result.insertedId})},201);
}));
router.put('/driver-finance/materials/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสวัสดุไม่ถูกต้อง'},400);
  const name=cleanString(req.body.name).slice(0,120);
  if(!name)return jsonResponse(res,{success:false,message:'กรุณากรอกชื่อวัสดุ'},422);
  const conflict=await req.db.collection('transport_materials').findOne({branch_id:branch.id,name,is_active:{$ne:0},_id:{$ne:id}});
  if(conflict)return jsonResponse(res,{success:false,message:'ชื่อวัสดุนี้มีอยู่แล้ว'},409);
  const result=await req.db.collection('transport_materials').updateOne({_id:id,branch_id:branch.id,is_active:{$ne:0}},{$set:{name,updated_at:nowIso()}});
  jsonResponse(res,{success:!!result.matchedCount,message:result.matchedCount?'':'ไม่พบวัสดุ'},result.matchedCount?200:404);
}));
router.delete('/driver-finance/materials/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสวัสดุไม่ถูกต้อง'},400);
  const result=await req.db.collection('transport_materials').updateOne({_id:id,branch_id:branch.id,is_active:{$ne:0}},{$set:{is_active:0,updated_at:nowIso()}});
  if(result.matchedCount) emitDataChanged('transport-materials','archive',{branch_id:branch.id});
  jsonResponse(res,{success:!!result.matchedCount,message:result.matchedCount?'':'ไม่พบวัสดุ'},result.matchedCount?200:404);
}));

router.get('/trip-finance',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const period=String(req.query.period || today().slice(0,7));
  if(!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(period))return jsonResponse(res,{success:false,message:'รูปแบบช่วงเวลาต้องเป็น YYYY หรือ YYYY-MM'},422);
  const filter={branch_id:branch.id,date:{$gte:`${period}${period.length===4?'-01-01':'-01'}`,$lte:`${period}${period.length===4?'-12-31':'-31'}`}};
  const [vehicles,rows]=await Promise.all([
    req.db.collection('vehicles').find({branch_id:branch.id,is_active:{$ne:0}},{sort:{plate_no:1}}).toArray(),
    req.db.collection('trip_finance').find(filter,{sort:{date:-1,created_at:-1}}).toArray(),
  ]);
  jsonResponse(res,{success:true,period,vehicles:vehicles.map(mongoToPlain),rows:rows.map(mongoToPlain),...tripSummary(rows,vehicles)});
}));
router.post('/trip-finance',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req);
  const vehicle=await ledgerVehicle(req,branch);
  if(!vehicle)return jsonResponse(res,{success:false,message:'กรุณาเลือกทะเบียนรถในสาขา'},422);
  const doc=tripPayload(req.body,vehicle,branch,req.user);
  doc.created_at=nowIso();doc.created_by=String(req.user.id);
  const result=await req.db.collection('trip_finance').insertOne(doc);
  emitDataChanged('trip-finance','create',{id:String(result.insertedId),branch_id:branch.id});
  jsonResponse(res,{success:true,data:mongoToPlain({...doc,_id:result.insertedId})},201);
}));
router.put('/trip-finance/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสรายการไม่ถูกต้อง'},400);
  const existing=await req.db.collection('trip_finance').findOne({_id:id,branch_id:branch.id});
  if(!existing)return jsonResponse(res,{success:false,message:'ไม่พบรายการ'},404);
  const vehicle=await ledgerVehicle(req,branch);
  if(!vehicle)return jsonResponse(res,{success:false,message:'ไม่พบทะเบียนรถในสาขา'},422);
  const next=tripPayload(req.body,vehicle,branch,req.user,existing);
  await req.db.collection('trip_finance').replaceOne({_id:id,branch_id:branch.id},next);
  emitDataChanged('trip-finance','update',{id:String(id),branch_id:branch.id});
  jsonResponse(res,{success:true,data:mongoToPlain(next)});
}));
router.delete('/trip-finance/:id',requireAuth,requireOwner,asyncHandler(async(req,res)=>{
  const branch=await resolveBranchContext(req.db,req.user,req),id=oidOrNull(req.params.id);
  if(!id)return jsonResponse(res,{success:false,message:'รหัสรายการไม่ถูกต้อง'},400);
  const result=await req.db.collection('trip_finance').deleteOne({_id:id,branch_id:branch.id});
  if(!result.deletedCount)return jsonResponse(res,{success:false,message:'ไม่พบรายการ'},404);
  emitDataChanged('trip-finance','delete',{id:String(id),branch_id:branch.id});
  jsonResponse(res,{success:true});
}));

router.get('/deliveries', requireAuth, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const filter = await buildDeliveryFilter(req.db, req.user, req.query, branch);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const rows = await req.db.collection('deliveries').find(filter, { sort: { work_date: -1, created_at: -1 }, limit }).toArray();
  const data = await Promise.all(rows.map((row) => enrichDelivery(req.db, row)));
  jsonResponse(res, { success: true, data, branch });
}));

router.post('/deliveries', requireAuth, uploadFields, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const data = await normalizeDeliveryBody(req.db, req.body, req.files, req.user, {}, branch);
  const vehicleId = await resolveVehicleId(req.db, req.user, req.body, branch);
  if (!vehicleId) return jsonResponse(res, { success: false, message: 'กรอกทะเบียนรถหรือเลือกรถให้ถูกต้อง' }, 422);
  data.vehicle_id = vehicleId;
  data.created_at = nowIso();
  data.stock_synced = !isStockIntakeOperation(data.operation_type);
  const result = await req.db.collection('deliveries').insertOne(data);
  if (data.stock_synced) await syncStockForDeliveryCreate(req.db, result.insertedId, data, String(req.user.id));
  await createAutoNotifications(req.db, String(result.insertedId), data);
  emitDataChanged('deliveries', 'create', { id: String(result.insertedId) });
  emitDataChanged('dashboard', 'refresh', { reason: 'delivery-create' });
  const delivery = await enrichDelivery(req.db, { ...data, _id: result.insertedId });
  jsonResponse(res, { success: true, data: delivery }, 201);
}));

router.get('/deliveries/:id', requireAuth, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรายการไม่ถูกต้อง' }, 400);
  const filter = { _id: oid, branch_id: branch.id };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const delivery = await req.db.collection('deliveries').findOne(filter);
  if (!delivery) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);
  jsonResponse(res, { success: true, data: await enrichDelivery(req.db, delivery) });
}));

router.put('/deliveries/:id', requireAuth, uploadFields, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรายการไม่ถูกต้อง' }, 400);
  const filter = { _id: oid, branch_id: branch.id };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const existing = await req.db.collection('deliveries').findOne(filter);
  if (!existing) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);
  const data = await normalizeDeliveryBody(req.db, req.body, req.files, req.user, existing, branch);
  const vehicleId = await resolveVehicleId(req.db, req.user, { ...req.body, vehicle_id: req.body.vehicle_id || existing.vehicle_id }, branch);
  if (vehicleId) {
    data.vehicle_id = vehicleId;
  }
  const wasStockSynced = existing.stock_synced === true || existing.stock_synced === 1;
  data.stock_synced = !isStockIntakeOperation(data.operation_type);
  await req.db.collection('deliveries').updateOne(filter, { $set: data });
  if (wasStockSynced || data.stock_synced) await syncStockForDeliveryUpdate(req.db, oid, existing, data, String(req.user.id));
  emitDataChanged('deliveries', 'update', { id: String(oid) });
  emitDataChanged('dashboard', 'refresh', { reason: 'delivery-update' });
  const fresh = await req.db.collection('deliveries').findOne({ _id: oid });
  jsonResponse(res, { success: true, data: await enrichDelivery(req.db, fresh) });
}));


router.delete('/deliveries/:id', requireAuth, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรายการไม่ถูกต้อง' }, 400);
  const filter = { _id: oid, branch_id: branch.id };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const existing = await req.db.collection('deliveries').findOne(filter);
  if (!existing) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);
  await req.db.collection('deliveries').deleteOne(filter);
  if (existing.stock_synced === true || existing.stock_synced === 1) await syncStockForDeliveryDelete(req.db, existing, String(req.user.id));
  emitDataChanged('deliveries', 'delete', { id: String(oid) });
  emitDataChanged('dashboard', 'refresh', { reason: 'delivery-delete' });
  jsonResponse(res, { success: true });
}));


// Driver cross-branch fuel availability (read only)
router.get('/stocks/all-branches-status', requireAuth, asyncHandler(async (req, res) => {
  const branches = await req.db.collection('branches').find({ is_active: { $ne: 0 } }, { sort: { name: 1 } }).toArray();
  const stocks = await req.db.collection('stocks').find({}).toArray();
  const data = branches.map((b) => ({
    branch_id: String(b._id),
    branch_name: b.name,
    branch_code: b.code,
    items: stocks.filter((x) => String(x.branch_id) === String(b._id)).map((x) => ({
      item_type: x.item_type,
      balance_liters: Number(x.balance_liters || 0),
      level_status: stockLevelInfo(x).level_status,
      updated_at: x.updated_at || x.created_at || null
    }))
  }));
  jsonResponse(res, { success: true, data });
}));

router.get('/stocks/status', requireAuth, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const rows = await req.db.collection('stocks').find({ branch_id: branch.id, item_type: { $in: ITEM_TYPES } }).toArray();
  const map = new Map(rows.map((row) => [row.item_type, row]));
  const branchMeta = branchFields(branch);
  const data = ITEM_TYPES.map((itemType) => stockLevelInfo(map.get(itemType) || { ...branchMeta, item_type: itemType, balance_liters: 0 }));
  jsonResponse(res, { success: true, data, branch, updated_at: nowIso() });
}));

router.get('/stocks', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const rows = await req.db.collection('stocks').find({ branch_id: branch.id, item_type: { $in: ITEM_TYPES } }).toArray();
  const map = new Map(rows.map((row) => [row.item_type, row]));
  const branchMeta = branchFields(branch);
  const data = ITEM_TYPES.map((itemType) => stockLevelInfo(map.get(itemType) || { ...branchMeta, item_type: itemType, balance_liters: 0 }));
  jsonResponse(res, { success: true, data, branch });
}));

router.put('/stocks/:itemType/settings', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const itemType = normalizeItemType(req.params.itemType);
  if (!itemType) return jsonResponse(res, { success: false, message: 'ไม่พบประเภทน้ำมัน' }, 404);
  const defaults = DEFAULT_STOCK_SETTINGS[itemType];
  const capacity = round2(Math.max(1, toNumber(req.body.capacity_liters, defaults.capacity_liters)));
  const reorder = round2(Math.max(0, Math.min(capacity, toNumber(req.body.reorder_level_liters, defaults.reorder_level_liters))));
  const critical = round2(Math.max(0, Math.min(reorder, toNumber(req.body.critical_level_liters, defaults.critical_level_liters))));
  await req.db.collection('stocks').updateOne(
    { branch_id: branch.id, item_type: itemType },
    {
      $set: {
        ...branchFields(branch),
        tank_name: cleanString(req.body.tank_name) || defaults.tank_name,
        capacity_liters: capacity,
        reorder_level_liters: reorder,
        critical_level_liters: critical,
        updated_at: nowIso(),
      },
      $setOnInsert: { balance_liters: 0, created_at: nowIso() },
    },
    { upsert: true },
  );
  const stock = await evaluateStockLevel(req.db, itemType, branch.id, { forceNotification: false });
  emitDataChanged('stocks', 'settings', { branch_id: branch.id, item_type: itemType });
  emitDataChanged('dashboard', 'refresh', { branch_id: branch.id, reason: 'stock-settings' });
  jsonResponse(res, { success: true, data: stock, branch });
}));

router.get('/stocks/audits', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const rows = await req.db.collection('stock_audits').find({ branch_id: branch.id }, { sort: { audit_date: -1, created_at: -1 }, limit: 200 }).toArray();
  jsonResponse(res, { success: true, data: rows.map(mongoToPlain), branch });
}));

router.post('/stocks/audit', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const itemType = normalizeItemType(req.body.item_type || req.body.oil_type);
  if (!itemType) return jsonResponse(res, { success: false, message: 'เลือกประเภทน้ำมัน' }, 422);
  const actual = round2(Math.max(0, toNumber(req.body.actual_balance_liters, -1)));
  if (actual < 0) return jsonResponse(res, { success: false, message: 'กรอกยอดตรวจจริง' }, 422);
  const current = await req.db.collection('stocks').findOne({ branch_id: branch.id, item_type: itemType });
  const system = round2(toNumber(current?.balance_liters, 0));
  const variance = round2(actual - system);
  const auditDoc = {
    ...branchFields(branch),
    item_type: itemType,
    audit_date: parseDateOrNull(req.body.audit_date) || today(),
    system_balance_liters: system,
    actual_balance_liters: actual,
    variance_liters: variance,
    note: cleanString(req.body.note),
    user_id: String(req.user.id),
    created_at: nowIso(),
  };
  const result = await req.db.collection('stock_audits').insertOne(auditDoc);
  if (variance !== 0) {
    await applyStockChange(req.db, {
      ...branchFields(branch),
      item_type: itemType,
      change_liters: variance,
      transaction_type: 'ปรับตามยอดตรวจนับจริง',
      user_id: String(req.user.id),
      note: cleanString(req.body.note) || `ตรวจนับจริง ${actual} ลิตร`,
      transaction_date: auditDoc.audit_date,
    });
    await req.db.collection('notifications').insertOne({
      ...branchFields(branch),
      kind: 'stock_audit',
      item_type: itemType,
      title: `[${branch.name}] ตรวจนับสต๊อก ${itemType}`,
      message: `ยอดระบบ ${system.toFixed(2)} ลิตร ยอดจริง ${actual.toFixed(2)} ลิตร ส่วนต่าง ${variance > 0 ? '+' : ''}${variance.toFixed(2)} ลิตร`,
      type: variance < 0 ? 'warning' : 'info',
      is_read: 0,
      created_at: nowIso(),
    });
    emitDataChanged('notifications', 'create', { kind: 'stock_audit', branch_id: branch.id, item_type: itemType });
  }
  emitDataChanged('stocks', 'audit', { branch_id: branch.id, item_type: itemType, audit_id: String(result.insertedId) });
  emitDataChanged('dashboard', 'refresh', { branch_id: branch.id, reason: 'stock-audit' });
  emitDataChanged('reports', 'refresh', { branch_id: branch.id, reason: 'stock-audit' });
  jsonResponse(res, { success: true, data: mongoToPlain({ ...auditDoc, _id: result.insertedId }), branch });
}));

router.get('/stocks/transactions', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
  const [movements, legacy] = await Promise.all([
    req.db.collection('stock_movements').find({ branch_id: branch.id }, { sort: { created_at: -1 }, limit }).toArray(),
    req.db.collection('stock_transactions').find({ branch_id: branch.id }, { sort: { created_at: -1 }, limit: 30 }).toArray().catch(() => []),
  ]);
  const data = [...movements, ...legacy].map(mongoToPlain).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, limit);
  jsonResponse(res, { success: true, data, branch });
}));

router.post('/stocks/add', requireAuth, requireOwner, uploadFields, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const itemType = normalizeItemType(req.body.item_type || req.body.oil_type);
  const qty = round2(Math.max(0, toNumber(req.body.quantity_liters || req.body.liters, 0)));
  if (!itemType || qty <= 0) return jsonResponse(res, { success: false, message: 'เลือกประเภทและกรอกจำนวนลิตรที่เติม' }, 422);
  const photos = await extractPhotoFields(req.db, req.files || {}, {});
  await applyStockChange(req.db, {
    ...branchFields(branch),
    item_type: itemType,
    change_liters: qty,
    transaction_type: 'เติมเข้าสต๊อก',
    user_id: String(req.user.id),
    note: cleanString(req.body.note),
    transaction_date: req.body.transaction_date || today(),
    amount_baht: req.body.amount_baht,
    bill_no: req.body.bill_no,
    supplier_name: req.body.supplier_name,
    photo: photos.bill_photo || photos.oil_photo || photos.document_photo || photos.stock_photo || '',
  });
  const stock = await req.db.collection('stocks').findOne({ branch_id: branch.id, item_type: itemType });
  emitDataChanged('stocks', 'change', { branch_id: branch.id, item_type: itemType });
  emitDataChanged('dashboard', 'refresh', { branch_id: branch.id, reason: 'stock-change' });
  jsonResponse(res, { success: true, data: stockLevelInfo(stock), branch });
}));

router.post('/stocks/adjust', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const itemType = normalizeItemType(req.body.item_type || req.body.oil_type);
  const qty = toNumber(req.body.change_liters, 0);
  if (!itemType || qty === 0) return jsonResponse(res, { success: false, message: 'เลือกประเภทและกรอกจำนวนปรับสต๊อก' }, 422);
  await applyStockChange(req.db, {
    ...branchFields(branch),
    item_type: itemType,
    change_liters: qty,
    transaction_type: 'ปรับสต๊อก',
    user_id: String(req.user.id),
    note: cleanString(req.body.note),
    transaction_date: req.body.transaction_date || today(),
  });
  const stock = await req.db.collection('stocks').findOne({ branch_id: branch.id, item_type: itemType });
  emitDataChanged('stocks', 'change', { branch_id: branch.id, item_type: itemType });
  emitDataChanged('dashboard', 'refresh', { branch_id: branch.id, reason: 'stock-change' });
  jsonResponse(res, { success: true, data: stockLevelInfo(stock), branch });
}));

router.get('/dashboard/stats', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const filter = await buildDeliveryFilter(req.db, req.user, req.query, branch);
  const rows = await req.db.collection('deliveries').find(filter, { sort: { work_date: -1, created_at: -1 }, limit: 2000 }).toArray();
  const enriched = await Promise.all(rows.map((row) => enrichDelivery(req.db, row)));
  const totalLiters = enriched.reduce((sum, row) => sum + toNumber(row.quantity_liters, 0), 0);
  const totalAmount = enriched.reduce((sum, row) => sum + toNumber(row.amount_baht, 0), 0);
  const totalDistance = enriched.reduce((sum, row) => sum + toNumber(row.distance_km, 0), 0);
  const totalStandardLiters = enriched.reduce((sum, row) => sum + toNumber(row.standard_fuel_liters || row.recommended_fuel_liters || row.quantity_liters, 0), 0);
  const totalFuelVarianceLiters = enriched.reduce((sum, row) => sum + toNumber(row.fuel_variance_liters, 0), 0);
  const overStandardLiters = enriched.reduce((sum, row) => sum + Math.max(0, toNumber(row.fuel_variance_liters, 0)), 0);
  const overStandardCost = enriched.reduce((sum, row) => sum + Math.max(0, toNumber(row.fuel_variance_baht, 0)), 0);
  const totalStoneWeight = enriched.reduce((sum, row) => sum + toNumber(row.cargo_stone_weight, 0), 0);
  const totalSandWeight = enriched.reduce((sum, row) => sum + toNumber(row.cargo_sand_weight, 0), 0);
  const stocks = await req.db.collection('stocks').find({ branch_id: branch.id, item_type: { $in: ITEM_TYPES } }).toArray();
  const unreadNotifications = await req.db.collection('notifications').countDocuments({ branch_id: branch.id, is_read: { $ne: 1 } });
  const byDayMap = new Map();
  for (const row of enriched) {
    const key = parseDateOrNull(row.fill_date || row.work_date) || 'ไม่ระบุ';
    if (!byDayMap.has(key)) byDayMap.set(key, { name: key, value: 0, trips: 0, amount: 0 });
    const item = byDayMap.get(key);
    item.value += toNumber(row.quantity_liters, 0);
    item.amount += toNumber(row.amount_baht, 0);
    item.trips += deliveryJobCount(row);
  }
  const byDay = Array.from(byDayMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(-31);
  const byPlate = groupSum(enriched, 'plate_no', 'quantity_liters', 8);
  const byDriver = groupSum(enriched, 'driver_name', 'quantity_liters', 8);
  const byRecorder = groupSum(enriched, 'recorder_name', 'quantity_liters', 8);
  const lowStocks = stocks.map(stockLevelInfo).filter((stock) => stock.level_status !== 'ready');
  jsonResponse(res, {
    success: true,
    data: {
      branch,
      total_trips: enriched.reduce((sum, row) => sum + deliveryJobCount(row), 0),
      total_records: enriched.length,
      total_liters: round2(totalLiters),
      total_amount: round2(totalAmount),
      avg_price_per_liter: totalLiters > 0 ? round2(totalAmount / totalLiters) : 0,
      total_distance_km: round2(totalDistance),
      total_standard_liters: round2(totalStandardLiters),
      total_fuel_variance_liters: round2(totalFuelVarianceLiters),
      over_standard_liters: round2(overStandardLiters),
      over_standard_cost_baht: round2(overStandardCost),
      cost_per_km: totalDistance > 0 ? round2(totalAmount / totalDistance) : 0,
      avg_fuel_efficiency_km_per_liter: totalDistance > 0 && totalLiters > 0 ? round2(totalDistance / totalLiters) : 0,
      total_stone_weight: round2(totalStoneWeight),
      total_sand_weight: round2(totalSandWeight),
      unread_notifications: unreadNotifications,
      low_stock_count: lowStocks.length,
      by_item_type: groupSum(enriched, 'item_type', 'quantity_liters'),
      by_destination: groupJobSum(enriched, 'destination_place', 'quantity_liters', 8),
      by_day: byDay,
      by_plate: byPlate,
      by_driver: byDriver,
      by_recorder: byRecorder,
      latest: enriched.slice(0, 10),
      stocks: stocks.map(stockLevelInfo),
      low_stocks: stocks.map(stockLevelInfo).filter((stock) => stock.level_status !== 'ready'),
    },
  });
}));

router.get('/reports/monthly', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const requestedMonth = /^\d{4}-\d{2}$/.test(cleanString(req.query.month)) ? cleanString(req.query.month) : monthFromDate(today());
  const from = `${requestedMonth}-01`;
  const [year, month] = requestedMonth.split('-').map(Number);
  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const toExclusive = nextMonthDate.toISOString().slice(0, 10);
  const rows = await req.db.collection('deliveries').find({
    branch_id: branch.id,
    $or: [
      { report_month: requestedMonth },
      { fill_date: { $gte: from, $lt: toExclusive } },
      { work_date: { $gte: from, $lt: toExclusive } },
    ],
  }, { sort: { work_date: 1, created_at: 1 }, limit: 5000 }).toArray();
  const enriched = await Promise.all(rows.map((row) => enrichDelivery(req.db, row)));
  const movements = await req.db.collection('stock_movements').find({ branch_id: branch.id, transaction_date: { $gte: from, $lt: toExclusive } }).toArray();
  const audits = await req.db.collection('stock_audits').find({ branch_id: branch.id, audit_date: { $gte: from, $lt: toExclusive } }).toArray();

  const summary = enriched.reduce((acc, row) => {
    const actual = toNumber(row.quantity_liters, 0);
    const standard = toNumber(row.standard_fuel_liters || row.recommended_fuel_liters || row.quantity_liters, 0);
    const variance = toNumber(row.fuel_variance_liters, actual - standard);
    const amount = toNumber(row.amount_baht, 0);
    acc.records += 1;
    acc.trips += deliveryJobCount(row);
    acc.actual_liters += actual;
    acc.standard_liters += standard;
    acc.variance_liters += variance;
    acc.over_standard_liters += Math.max(0, variance);
    acc.saved_liters += Math.max(0, -variance);
    acc.fuel_cost_baht += amount;
    acc.standard_cost_baht += toNumber(row.expected_fuel_cost_baht, standard * toNumber(row.price_baht_per_liter, 0));
    acc.variance_cost_baht += toNumber(row.fuel_variance_baht, variance * toNumber(row.price_baht_per_liter, 0));
    acc.distance_km += toNumber(row.distance_km, 0);
    return acc;
  }, { records: 0, trips: 0, actual_liters: 0, standard_liters: 0, variance_liters: 0, over_standard_liters: 0, saved_liters: 0, fuel_cost_baht: 0, standard_cost_baht: 0, variance_cost_baht: 0, distance_km: 0 });
  Object.keys(summary).forEach((key) => { if (key !== 'records' && key !== 'trips') summary[key] = round2(summary[key]); });
  summary.avg_efficiency_km_per_liter = summary.actual_liters > 0 ? round2(summary.distance_km / summary.actual_liters) : 0;
  summary.cost_per_km = summary.distance_km > 0 ? round2(summary.fuel_cost_baht / summary.distance_km) : 0;
  summary.stock_in_liters = round2(movements.reduce((sum, row) => sum + Math.max(0, toNumber(row.change_liters, 0)), 0));
  summary.stock_out_liters = round2(movements.reduce((sum, row) => sum + Math.max(0, -toNumber(row.change_liters, 0)), 0));
  summary.audit_shortage_liters = round2(audits.reduce((sum, row) => sum + Math.max(0, -toNumber(row.variance_liters, 0)), 0));
  summary.audit_surplus_liters = round2(audits.reduce((sum, row) => sum + Math.max(0, toNumber(row.variance_liters, 0)), 0));

  function reportGroup(keyBuilder) {
    const map = new Map();
    for (const row of enriched) {
      const key = cleanString(keyBuilder(row)) || 'ไม่ระบุ';
      if (!map.has(key)) map.set(key, { name: key, records: 0, trips: 0, actual_liters: 0, standard_liters: 0, variance_liters: 0, fuel_cost_baht: 0, distance_km: 0 });
      const item = map.get(key);
      item.records += 1;
      item.trips += deliveryJobCount(row);
      item.actual_liters += toNumber(row.quantity_liters, 0);
      item.standard_liters += toNumber(row.standard_fuel_liters || row.recommended_fuel_liters || row.quantity_liters, 0);
      item.variance_liters += toNumber(row.fuel_variance_liters, 0);
      item.fuel_cost_baht += toNumber(row.amount_baht, 0);
      item.distance_km += toNumber(row.distance_km, 0);
    }
    return Array.from(map.values()).map((item) => ({
      ...item,
      actual_liters: round2(item.actual_liters),
      standard_liters: round2(item.standard_liters),
      variance_liters: round2(item.variance_liters),
      fuel_cost_baht: round2(item.fuel_cost_baht),
      distance_km: round2(item.distance_km),
      efficiency_km_per_liter: item.actual_liters > 0 ? round2(item.distance_km / item.actual_liters) : 0,
      cost_per_km: item.distance_km > 0 ? round2(item.fuel_cost_baht / item.distance_km) : 0,
    })).sort((a, b) => b.fuel_cost_baht - a.fuel_cost_baht);
  }

  const byDayMap = new Map();
  enriched.forEach((row) => {
    const day = parseDateOrNull(row.fill_date || row.work_date) || from;
    if (!byDayMap.has(day)) byDayMap.set(day, { date: day, actual_liters: 0, standard_liters: 0, variance_liters: 0, fuel_cost_baht: 0, distance_km: 0, records: 0 });
    const item = byDayMap.get(day);
    item.actual_liters += toNumber(row.quantity_liters, 0);
    item.standard_liters += toNumber(row.standard_fuel_liters || row.recommended_fuel_liters || row.quantity_liters, 0);
    item.variance_liters += toNumber(row.fuel_variance_liters, 0);
    item.fuel_cost_baht += toNumber(row.amount_baht, 0);
    item.distance_km += toNumber(row.distance_km, 0);
    item.records += 1;
  });
  const byDay = Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date)).map((item) => ({ ...item, actual_liters: round2(item.actual_liters), standard_liters: round2(item.standard_liters), variance_liters: round2(item.variance_liters), fuel_cost_baht: round2(item.fuel_cost_baht), distance_km: round2(item.distance_km) }));

  jsonResponse(res, {
    success: true,
    data: {
      branch,
      month: requestedMonth,
      period: { from, to_exclusive: toExclusive },
      generated_at: nowIso(),
      summary,
      by_item_type: reportGroup((row) => row.item_type),
      by_vehicle: reportGroup((row) => row.plate_no || row.vehicle_no),
      by_employee: reportGroup((row) => row.employee_name || row.recorder_name),
      by_day: byDay,
      stock_audits: audits.map(mongoToPlain),
      latest_records: enriched.slice(-20).reverse(),
    },
  });
}));

router.get('/notifications', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const rows = await req.db.collection('notifications').find({ branch_id: branch.id }, { sort: { created_at: -1 }, limit: 80 }).toArray();
  jsonResponse(res, { success: true, data: rows.map(mongoToPlain), branch });
}));

router.patch('/notifications/:id/read', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const branch = await resolveBranchContext(req.db, req.user, req);
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสแจ้งเตือนไม่ถูกต้อง' }, 400);
  await req.db.collection('notifications').updateOne({ _id: oid, branch_id: branch.id }, { $set: { is_read: 1, updated_at: nowIso() } });
  emitDataChanged('notifications', 'read', { id: String(oid) });
  jsonResponse(res, { success: true });
}));

app.use('/', router);

app.use((err, _req, res, _next) => {
  // Do not leak MongoDB collection/index names or raw stack traces to users.
  // Pre-checks are friendly, while unique indexes are the final race-safe gate.
  if (err?.code === 11000) {
    console.warn('[database] Duplicate-key conflict', { keyPattern: err.keyPattern });
    const key = err.keyPattern || {};
    const message = key.plate_no || key.plate
      ? 'ทะเบียนรถนี้ถูกใช้แล้ว กรุณาตรวจสอบทะเบียนรถหรือเลือกคันที่มีอยู่'
      : key.username ? 'ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเปลี่ยนชื่อผู้ใช้'
      : key.code ? 'รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น'
      : 'ข้อมูลนี้มีอยู่แล้ว กรุณาตรวจสอบรายการก่อนบันทึกอีกครั้ง';
    return jsonResponse(res, { success: false, message }, 409);
  }
  console.error(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  const mongoUnavailable = status === 500 && (
    !config.mongodb.uri || ['MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoTopologyClosedError'].includes(err?.name)
  );
  const dbNotConfigured = !config.mongodb.uri;
  const code = mongoUnavailable ? (dbNotConfigured ? 'DB_NOT_CONFIGURED' : 'DB_UNAVAILABLE') : 'REQUEST_FAILED';
  const message = dbNotConfigured ? 'Backend ยังไม่ได้ตั้งค่า MONGODB_URI กรุณาติดต่อผู้ดูแลระบบ'
    : mongoUnavailable ? 'เซิร์ฟเวอร์ยังเชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแล'
    : status === 500 ? 'เซิร์ฟเวอร์ขัดข้อง กรุณาติดต่อผู้ดูแลเพื่อตรวจสอบ Backend Logs' : err.message;
  return jsonResponse(res, { success: false, code, message }, mongoUnavailable ? 503 : status);
});

httpServer.listen(config.port, () => {
  console.log(`Heng Charoen Phuetphon Fuel Management API v78-google-route-endpoints running on port ${config.port}`);
});
