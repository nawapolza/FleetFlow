const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const mustExist = (relativePath) => { if (!exists(relativePath)) failures.push(`Missing file: ${relativePath}`); };
const mustContain = (relativePath, snippets) => {
  if (!exists(relativePath)) return;
  const text = read(relativePath);
  snippets.forEach((snippet) => { if (!text.includes(snippet)) failures.push(`${relativePath} missing: ${snippet}`); });
};

[
  'frontend/src/contexts/BranchContext.jsx',
  'frontend/src/pages/BranchesPage.jsx',
  'frontend/src/components/BranchScopeBar.jsx',
  'MONGODB_CHANGES_V62.md',
  'TEST_REPORT_V62.md',
  'RELEASE_NOTES_V62.md',
  'PACKAGE_MANIFEST_V62.txt',
].forEach(mustExist);

for (const relativePath of ['package.json', 'frontend/package.json', 'backend/package.json']) {
  try {
    const data = JSON.parse(read(relativePath));
    if (data.version !== '62.0.0') failures.push(`${relativePath} version is ${data.version}, expected 62.0.0`);
  } catch (error) {
    failures.push(`${relativePath} is invalid JSON: ${error.message}`);
  }
}

for (const subdir of ['frontend', 'backend']) {
  try {
    const pkg = JSON.parse(read(`${subdir}/package.json`));
    const lock = JSON.parse(read(`${subdir}/package-lock.json`));
    const lockRoot = lock.packages?.[''] || {};
    for (const key of ['name', 'version']) {
      if (pkg[key] !== lockRoot[key]) failures.push(`${subdir} package-lock root ${key} does not match package.json`);
    }
    for (const key of ['dependencies', 'devDependencies']) {
      if (JSON.stringify(pkg[key] || {}) !== JSON.stringify(lockRoot[key] || {})) failures.push(`${subdir} ${key} does not match package-lock root metadata`);
    }
  } catch (error) {
    failures.push(`${subdir} package/lock validation failed: ${error.message}`);
  }
}

mustContain('backend/server.js', [
  "build: 'heng-charoen-v62-multi-branch'",
  "router.get('/branches', requireAuth",
  "router.post('/branches', requireAuth, requireOwner",
  "router.put('/branches/:id', requireAuth, requireOwner",
  "router.delete('/branches/:id', requireAuth, requireOwner",
  "createIndex({ branch_id: 1, item_type: 1 }, { unique: true })",
  "resolveBranchContext(req.db, req.user, req)",
  "branch_id: branch.id",
  "'X-Branch-Id'",
  "previous_branch_id: sourceBranch.id",
  "{ user_id: { $exists: false } }",
  "ทะเบียนรถนี้มีอยู่แล้วในสาขาที่เลือก",
]);

mustContain('frontend/src/api.js', ["const BRANCH_KEY", "headers.set('X-Branch-Id', branchId)", 'createBranch:', 'updateBranch:', 'deleteBranch:']);
mustContain('frontend/src/App.jsx', ['<BranchProvider>', 'BranchesPage', 'activeBranchId']);
mustContain('frontend/src/components/Layout.jsx', ["key: 'branches'", 'BranchSelector', 'activeBranchId']);
mustContain('frontend/src/pages/BranchesPage.jsx', ['เปิดใช้งานอีกครั้ง', 'api.deleteBranch', 'api.updateBranch']);
mustContain('frontend/src/pages/StockPage.jsx', ['คลังที่กำลังจัดการ', 'stock-section-nav', 'activeBranch?.name']);
mustContain('frontend/src/components/DeliveryForm.jsx', ['form-branch-badge', "activeBranch?.id || 'branch'"]);
mustContain('frontend/src/pages/UsersPage.jsx', ['สาขาสังกัด', 'ย้ายสาขาได้โดยไม่ลบประวัติรายการเดิม', 'เปิดใช้งานผู้ใช้']);
mustContain('frontend/src/pages/VehiclesPage.jsx', ['ไม่ระบุ / ใช้ทั่วไป', 'รถใช้ทั่วไป']);

const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'backend/server.js')], { encoding: 'utf8' });
if (syntax.status !== 0) failures.push(`Backend syntax check failed: ${syntax.stderr || syntax.stdout}`);

const genericVerify = spawnSync(process.execPath, [path.join(root, 'scripts/verify-project.js')], { encoding: 'utf8' });
if (genericVerify.status !== 0) failures.push(`Generic project verification failed: ${genericVerify.stderr || genericVerify.stdout}`);

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, callback);
    else callback(fullPath);
  }
}

walk(path.join(root, 'frontend', 'src'), (filePath) => {
  if (!/\.(js|jsx)$/.test(filePath)) return;
  const source = fs.readFileSync(filePath, 'utf8');
  const importPattern = /from\s+['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(source))) {
    const target = path.resolve(path.dirname(filePath), match[1]);
    const candidates = [target, `${target}.js`, `${target}.jsx`, path.join(target, 'index.js'), path.join(target, 'index.jsx')];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) failures.push(`${path.relative(root, filePath)} unresolved import: ${match[1]}`);
  }
});

try {
  const css = read('frontend/src/index.css');
  let state = 'normal';
  let depth = 0;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1] || '';
    if (state === 'normal') {
      if (char === '/' && next === '*') { state = 'comment'; index += 1; }
      else if (char === '"' || char === "'") state = char;
      else if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
    } else if (state === 'comment') {
      if (char === '*' && next === '/') { state = 'normal'; index += 1; }
    } else if (char === '\\') index += 1;
    else if (char === state) state = 'normal';
    if (depth < 0) throw new Error('extra closing brace');
  }
  if (depth !== 0) throw new Error(`unbalanced braces: ${depth}`);
} catch (error) {
  failures.push(`CSS validation failed: ${error.message}`);
}

if (failures.length) {
  console.error('V62 verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('V62 verification passed: multi-branch CRUD, scoped data, staff transfer, shared vehicles, package locks, imports, CSS and backend syntax are present.');
