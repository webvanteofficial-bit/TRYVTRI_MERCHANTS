import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'lib', 'embedded.js');
const TMP = path.join(os.tmpdir(), 'tryvtri-embedded-fonts');

const SOURCES = {
  400: 'https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted/Roboto-Regular.ttf',
  700: 'https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted/Roboto-Bold.ttf',
};

function charset() {
  let s = '';
  for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c);
  for (let c = 0xa0; c <= 0xff; c++) s += String.fromCharCode(c);
  for (const c of [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac, 0x00a3, 0x2122, 0x00a9, 0x00ae, 0x2212]) {
    s += String.fromCharCode(c);
  }
  return s;
}

async function loadFont(url) {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, url.split('/').pop());
  if (fs.existsSync(file) && fs.statSync(file).size > 100000) return fs.readFileSync(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not download ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

const text = charset();
const lines = [];
for (const [weight, url] of Object.entries(SOURCES)) {
  const ttf = await loadFont(url);
  const subset = await subsetFont(ttf, text);
  lines.push(`export const FONT_${weight} = '${subset.toString('base64')}';`);
  console.log(`font ${weight}: ${subset.length} bytes`);
}
const logo = fs.readFileSync(path.join(ROOT, 'assets', 'tryvtri-logo.png'));
lines.push(`export const LOGO_PNG = '${logo.toString('base64')}';`);
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log('wrote ' + OUT);
