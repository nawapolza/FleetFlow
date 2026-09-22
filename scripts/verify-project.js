const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build']);
const conflictPattern = /^(<<<<<<<(?: .*)?|=======|>>>>>>>(?: .*)?)$/m;
const conflicts = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    const textExtensions = new Set([
      '.js', '.jsx', '.json', '.md', '.txt', '.html', '.css', '.yaml', '.yml',
      '.env', '.example', '.cjs', '.mjs'
    ]);
    if (!textExtensions.has(extension) && !entry.name.startsWith('.env')) continue;
    let text;
    try {
      text = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    if (conflictPattern.test(text)) conflicts.push(path.relative(root, fullPath));
  }
}

walk(root);

const jsonFiles = [
  'package.json',
  'package-lock.json',
  'backend/package.json',
  'backend/package-lock.json',
  'frontend/package.json',
  'frontend/package-lock.json'
];
const jsonErrors = [];
for (const relativePath of jsonFiles) {
  const fullPath = path.join(root, relativePath);
  try {
    JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    jsonErrors.push(`${relativePath}: ${error.message}`);
  }
}

if (conflicts.length || jsonErrors.length) {
  console.error('Project verification failed.');
  if (conflicts.length) {
    console.error('\nMerge conflict markers found in:');
    for (const file of conflicts) console.error(`- ${file}`);
  }
  if (jsonErrors.length) {
    console.error('\nInvalid JSON files:');
    for (const error of jsonErrors) console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Project verification passed: no merge markers and all package JSON files are valid.');