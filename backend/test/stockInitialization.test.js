const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for the actual startup stock upsert in server.js. If a field
// is assigned by both MongoDB operators, startup fails with code 40.
test('startup stock upsert keeps branch fields out of $setOnInsert', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const begin = src.indexOf('const branches = await db.collection(\'branches\').find(');
  const end = src.indexOf('const missingFieldUpdates = [', begin);
  assert.ok(begin >= 0 && end > begin, 'stock initializer is present');
  const block = src.slice(begin, end);
  assert.match(block, /\$set:\s*\{\s*\.\.\.branch,\s*updated_at:\s*nowIso\(\)\s*\}/);
  const insertBlock = block.match(/\$setOnInsert:\s*\{([\s\S]*?)\},\s*\$set:/);
  assert.ok(insertBlock, '$setOnInsert is present');
  assert.doesNotMatch(insertBlock[1], /\.\.\.branch|\bbranch_id\s*:|\bbranch_name\s*:|\bbranch_code\s*:|\bitem_type\s*:/);
  assert.match(insertBlock[1], /balance_liters:\s*0/);
  assert.match(block, /\{ branch_id: branch\.branch_id, item_type: itemType \}/);
});
