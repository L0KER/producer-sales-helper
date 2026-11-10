#!/usr/bin/env node
// Static checks for a no-build, plain-ES-module app:
//   1. every .js/.mjs file parses;
//   2. every relative import points at a real file;
//   3. every local asset referenced by index.html / manifest exists.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(tmpdir(), 'psh-check-'));
const errors = [];
let parsed = 0;
let imports = 0;
let assets = 0;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(root);
const scripts = files.filter((file) => /\.(m?js)$/.test(file) && !file.startsWith(temp));

for (const file of scripts) {
  const target = path.join(temp, `${path.relative(root, file).replace(/[\\/]/g, '__')}.mjs`);
  cpSync(file, target);
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${path.relative(root, file)}: ${result.stderr.trim() || 'syntax error'}`);
  } else {
    parsed += 1;
  }
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
for (const file of scripts) {
  const source = readFileSync(file, 'utf8');
  let match;
  while ((match = IMPORT_RE.exec(source))) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    imports += 1;
    const resolved = path.resolve(path.dirname(file), spec);
    const candidates = [resolved, `${resolved}.js`, `${resolved}.mjs`, path.join(resolved, 'index.js')];
    if (!candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile())) {
      errors.push(`${path.relative(root, file)}: import not found — ${spec}`);
    }
  }
}

const HTML_RE = /\b(?:src|href)=["']([^"']+)["']/g;
for (const file of ['index.html', 'manifest.webmanifest']) {
  const full = path.join(root, file);
  if (!existsSync(full)) {
    errors.push(`${file}: missing`);
    continue;
  }
  const source = readFileSync(full, 'utf8');
  let match;
  while ((match = HTML_RE.exec(source))) {
    const ref = match[1];
    if (/^(?:https?:|data:|mailto:|tel:|#|\/\/)/.test(ref)) continue;
    const clean = ref.split(/[?#]/)[0];
    if (!clean || clean === './') continue;
    assets += 1;
    const target = path.resolve(root, clean);
    if (!existsSync(target)) errors.push(`${file}: asset not found — ${ref}`);
  }
}

rmSync(temp, { recursive: true, force: true });

if (errors.length) {
  console.error(`\nПроверка не пройдена (${errors.length}):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${parsed} файлов разобрано, ${imports} импортов разрешено, ${assets} ссылок проверено.`);
}
