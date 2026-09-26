import { LOGO_PNG } from './embedded.js';

let cache;

export function logoDataUri() {
  if (cache !== undefined) return cache;
  cache = LOGO_PNG ? 'data:image/png;base64,' + LOGO_PNG : '';
  return cache;
}

export function logoSvgFallback(x, y, size) {
  const r = size * 0.11;
  const barW = size * 0.62;
  const barH = size * 0.19;
  const stemW = size * 0.2;
  const stemH = size * 0.56;
  const cx = x + size / 2;
  return `
  <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="#5fd37a"/>
  <rect x="${x + size * 0.045}" y="${y + size * 0.045}" width="${size * 0.91}" height="${size * 0.91}" rx="${r * 0.8}" fill="#14532d"/>
  <rect x="${cx - barW / 2}" y="${y + size * 0.1}" width="${barW}" height="${barH}" rx="${size * 0.03}" fill="#fbbf24"/>
  <rect x="${cx - stemW / 2}" y="${y + size * 0.1}" width="${stemW}" height="${stemH}" rx="${size * 0.025}" fill="#fbbf24"/>`;
}
