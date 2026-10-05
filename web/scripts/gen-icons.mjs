// Generates the PWA / home-screen icons in web/public/icons (no dependencies).
// Run with: node web/scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const inRoundRect = (x, y, cx, cy, w, h, r) => {
  const dx = Math.max(Math.abs(x - cx) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - cy) - (h / 2 - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by);
  const d2 = s(x, y, bx, by, cx, cy);
  const d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/**
 * The red "play button" logo on a background.
 * @param scale logo width relative to the icon (smaller for maskable icons' safe zone)
 * @param corner corner radius of the background (0 = full bleed square)
 */
function icon(size, { scale = 0.66, corner = 0, bg = [255, 255, 255] } = {}) {
  const w = size * scale;
  const h = w * (20 / 29);
  const r = h * 0.28;
  const c = size / 2;
  const tri = [
    [c - w * 0.12, c - h * 0.22],
    [c - w * 0.12, c + h * 0.22],
    [c + w * 0.145, c],
  ];
  const SS = 4;
  return png(size, (px, py) => {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = px + (sx + 0.5) / SS;
        const y = py + (sy + 0.5) / SS;
        let col = null;
        if (!corner || inRoundRect(x, y, c, c, size, size, corner)) col = [...bg, 255];
        if (inRoundRect(x, y, c, c, w, h, r)) col = [255, 0, 0, 255];
        if (inTriangle(x, y, ...tri)) col = [255, 255, 255, 255];
        if (col) acc = acc.map((v, i) => v + col[i]);
      }
    }
    const n = SS * SS;
    const a = acc[3] / n;
    return a ? [Math.round(acc[0] / (a / 255) / n), Math.round(acc[1] / (a / 255) / n), Math.round(acc[2] / (a / 255) / n), Math.round(a)] : [0, 0, 0, 0];
  });
}

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': icon(192, { corner: 192 * 0.22 }),
  'icon-512.png': icon(512, { corner: 512 * 0.22 }),
  'maskable-192.png': icon(192, { scale: 0.5 }),
  'maskable-512.png': icon(512, { scale: 0.5 }),
  'apple-touch-icon.png': icon(180, { scale: 0.62 }),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  console.log(`${name} ${data.length} bytes`);
}
