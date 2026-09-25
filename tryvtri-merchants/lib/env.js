import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseFile(file) {
  const out = {};
  try {
    if (!fs.existsSync(file)) return out;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    /* ignore */
  }
  return out;
}

const local = process.env.VERCEL
  ? {}
  : { ...parseFile(path.join(ROOT, '.env')), ...parseFile(path.join(ROOT, '.env.local')) };

export function env(name, fallback) {
  const v = process.env[name] ?? local[name];
  return v === undefined || v === '' ? fallback : v;
}

export { ROOT };
