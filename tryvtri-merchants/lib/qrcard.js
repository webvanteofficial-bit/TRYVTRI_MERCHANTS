import QRCode from 'qrcode';
import sharp from 'sharp';
import opentype from 'opentype.js';
import { FONT_400, FONT_700 } from './embedded.js';
import { logoDataUri, logoSvgFallback } from './logo.js';

const BRAND = 'TRYVTRI';
const CAPTION = 'Scan to try it on';
const GREEN = '#16a34a';
const DARK = '#111827';
const GREY = '#6b7280';
const LINE = '#e5e7eb';

export const CARD_W = 1000;
export const CARD_H = 1300;

const QR_X = 120;
const QR_Y = 80;
const QR_BOX = 760;
const QUIET = 4;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function slug(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'product'
  );
}

function trunc(s, max) {
  const t = String(s || '').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '\u2026' : t;
}

export function track(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('ref', 'tryvtri');
    return u.toString();
  } catch {
    return url;
  }
}

const fontCache = {};

function fontFor(weight) {
  const w = weight >= 700 ? 700 : 400;
  if (!fontCache[w]) {
    const b = Buffer.from(w === 700 ? FONT_700 : FONT_400, 'base64');
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    fontCache[w] = opentype.parse(ab);
  }
  return fontCache[w];
}

function text(x, y, str, size, fill, weight, spacing) {
  const s = String(str ?? '');
  if (!s) return '';
  try {
    const font = fontFor(weight);
    let d;
    if (spacing) {
      const chars = Array.from(s);
      const adv = chars.map((c) => font.getAdvanceWidth(c, size));
      const total = adv.reduce((a, n) => a + n, 0) + spacing * Math.max(0, chars.length - 1);
      let cx = x - total / 2;
      d = chars
        .map((c, i) => {
          const seg = font.getPath(c, cx, y, size).toPathData(2);
          cx += adv[i] + spacing;
          return seg;
        })
        .join(' ');
    } else {
      const w = font.getAdvanceWidth(s, size);
      d = font.getPath(s, x - w / 2, y, size).toPathData(2);
    }
    return `<path d="${d}" fill="${fill}"/>`;
  } catch {
    const ls = spacing ? ` letter-spacing="${spacing}"` : '';
    return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight || 400}" fill="${fill}" text-anchor="middle"${ls}>${esc(s)}</text>`;
  }
}

function logoGroup(cx, cy) {
  const plate = 216;
  const size = 196;
  const px = cx - plate / 2;
  const py = cy - plate / 2;
  const ix = cx - size / 2;
  const iy = cy - size / 2;
  const uri = logoDataUri();
  const art = uri
    ? `<image href="${uri}" x="${ix}" y="${iy}" width="${size}" height="${size}" clip-path="url(#logoClip)"/>`
    : logoSvgFallback(ix, iy, size);

  return `
  <defs>
    <clipPath id="logoClip">
      <rect x="${ix}" y="${iy}" width="${size}" height="${size}" rx="28"/>
    </clipPath>
  </defs>
  <rect x="${px}" y="${py}" width="${plate}" height="${plate}" rx="38" fill="#ffffff"/>
  ${art}`;
}

export function buildQrCard(url, name, sku) {
  const target = track(url);
  const qr = QRCode.create(target, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const data = qr.modules.data;

  const span = size + QUIET * 2;
  const unit = Math.max(1, Math.floor(QR_BOX / span));
  const qrPx = span * unit;
  const ox = QR_X + (QR_BOX - qrPx) / 2;
  const oy = QR_Y + (QR_BOX - qrPx) / 2;

  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }
  }

  const cx = QR_X + QR_BOX / 2;
  const qrBottom = QR_Y + QR_BOX;

  const nameLine = name ? text(cx, qrBottom + 264, trunc(name, 36), 42, DARK, 700) : '';
  const skuLine = sku ? text(cx, qrBottom + 370, 'SKU: ' + trunc(sku, 24), 52, DARK, 700) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect x="3" y="3" width="${CARD_W - 6}" height="${CARD_H - 6}" rx="44" fill="#ffffff" stroke="${LINE}" stroke-width="6"/>
  <g transform="translate(${ox} ${oy}) scale(${unit})" shape-rendering="crispEdges"><path d="${d}" fill="${DARK}"/></g>
  ${logoGroup(cx, QR_Y + QR_BOX / 2)}
  ${text(cx, qrBottom + 118, BRAND, 76, GREEN, 700, 3)}
  ${text(cx, qrBottom + 190, CAPTION, 41, GREY, 400)}
  ${nameLine}
  ${skuLine}
</svg>`;
}

export async function buildQrCardPng(url, name, sku) {
  const svg = buildQrCard(url, name, sku);
  return sharp(Buffer.from(svg), { density: 96 })
    .resize(CARD_W, CARD_H)
    .png({ compressionLevel: 9 })
    .toBuffer();
}
