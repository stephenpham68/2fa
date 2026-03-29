/**
 * Generates PNG icons for the Chrome extension without any external dependencies.
 * Uses Node.js built-in zlib for PNG compression.
 * Output: public/icons/icon{16,32,48,128}.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/icons');
mkdirSync(OUT_DIR, { recursive: true });

// CRC32 table for PNG chunk checksums
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function makePNG(size, pixelFn) {
  // IHDR: width, height, 8-bit RGBA (color type 6)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // bytes 10-12: compression=0, filter=0, interlace=0

  // Raw scanlines: filter byte + RGBA * width per row
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes, 0);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const i = y * rowBytes + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Blue rounded-square shield icon
// Primary color: #3b82f6 (59, 130, 246)
function iconPixel(x, y, size) {
  const s = size;
  const pad = s * 0.06;
  const r = s * 0.22; // corner radius
  const cx = s / 2, cy = s / 2;

  // Rounded rectangle bounds
  const left = pad, right = s - pad, top = pad, bottom = s - pad;
  const innerLeft = left + r, innerRight = right - r;
  const innerTop = top + r, innerBottom = bottom - r;

  // Distance to nearest corner center for rounded rect check
  const px = x + 0.5, py = y + 0.5;
  const inInner = px >= innerLeft && px <= innerRight && py >= innerTop && py <= innerBottom;
  const inHBar = px >= left && px <= right && py >= innerTop && py <= innerBottom;
  const inVBar = px >= innerLeft && px <= innerRight && py >= top && py <= bottom;
  const cornerX = px < innerLeft ? innerLeft : px > innerRight ? innerRight : px;
  const cornerY = py < innerTop ? innerTop : py > innerBottom ? innerBottom : py;
  const dist = Math.sqrt((px - cornerX) ** 2 + (py - cornerY) ** 2);

  const inRoundedRect = inInner || inHBar || inVBar || dist <= r;
  if (!inRoundedRect) return [0, 0, 0, 0]; // transparent

  // Shield shape inside the rounded rect
  const nx = (px - cx) / (s * 0.35); // normalized -1..1
  const ny = (py - top) / (bottom - top); // normalized 0..1

  let inShield = false;
  if (ny < 0.12 || ny > 0.92) {
    inShield = false;
  } else if (ny < 0.5) {
    inShield = Math.abs(nx) < 0.75;
  } else {
    const taper = (1 - ny) / 0.5; // 1 at ny=0.5, 0 at ny=1
    inShield = Math.abs(nx) < taper * 0.75;
  }

  if (inShield) return [255, 255, 255, 220]; // white shield
  return [59, 130, 246, 255]; // blue background
}

const SIZES = [16, 32, 48, 128];
for (const size of SIZES) {
  const png = makePNG(size, iconPixel);
  const outPath = resolve(OUT_DIR, `icon${size}.png`);
  writeFileSync(outPath, png);
  console.log(`  icon${size}.png`);
}
console.log('Icons generated in public/icons/');
