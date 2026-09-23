// Offline regression checks for legacy vehicle index repair, API error mapping,
// initialization concurrency guard, and the duplicate-submit guard on the UI.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'frontend/src/pages/VehiclesPage.jsx'), 'utf8');
assert.match(backend, /index\.key\?\.plate === 1/);
assert.match(backend, /Object\.keys\(index\.key\)\.length === 1/);
assert.match(backend, /dropIndex\(obsoletePlateIndex\.name\)/);
assert.match(backend, /unique_active_branch_plate_no_v2/);
assert.match(backend, /partialFilterExpression/);
assert.match(backend, /if \(mongoDbPromise\) return mongoDbPromise/);
assert.match(backend, /if \(err\?\.code === 11000\)/);
assert.match(backend, /'ทะเบียนรถนี้ถูกใช้แล้ว/);
assert.match(frontend, /if \(savingRef\.current\) return/);
assert.match(frontend, /disabled=\{saving\}/);
assert.doesNotMatch(frontend, /FileBarChart3/);
console.log('PASS: 11 offline vehicle-index, error-handling and double-submit checks');
