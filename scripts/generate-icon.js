/**
 * Draws assets/icon.png, the marketplace icon: a closed eye on a dark tile.
 *
 * Generated rather than committed as an opaque binary so the artwork can be
 * adjusted without a design tool. Run with `npm run icon`.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 128;
const SAMPLES = 4; // Supersampling factor, for antialiased edges.
const BACKGROUND = [26, 31, 43];
const FOREGROUND = [138, 180, 248];

/** Signed distance from a point to the circle arc used for the eyelid. */
function arcDistance(x, y, cx, cy, radius) {
  return Math.abs(Math.hypot(x - cx, y - cy) - radius);
}

function coverage(x, y) {
  const inset = 10;
  const radius = 22;

  // Rounded square mask.
  const dx = Math.max(inset - x, x - (SIZE - inset), 0);
  const dy = Math.max(inset - y, y - (SIZE - inset), 0);
  if (Math.hypot(dx, dy) > radius) {
    return null;
  }

  // Eyelid: a stroked arc, clipped by angle so both ends taper symmetrically.
  const lidAngle = Math.atan2(x - SIZE / 2, y - 18);
  const lid = arcDistance(x, y, SIZE / 2, 18, 52) < 4.5 && Math.abs(lidAngle) < 0.8;

  // Three lashes fanning out below the lid.
  let lash = false;
  for (const angle of [-0.62, 0, 0.62]) {
    const baseX = SIZE / 2 + Math.sin(angle) * 40;
    const baseY = 18 + Math.cos(angle) * 52;
    const tipX = SIZE / 2 + Math.sin(angle) * 62;
    const tipY = 18 + Math.cos(angle) * 68;
    lash = lash || distanceToSegment(x, y, baseX, baseY, tipX, tipY) < 3.5;
  }

  return lid || lash ? 1 : 0;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function render() {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  let offset = 0;

  for (let y = 0; y < SIZE; y++) {
    raw[offset++] = 0; // Filter type: none.
    for (let x = 0; x < SIZE; x++) {
      let inside = 0;
      let ink = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const value = coverage(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES);
          if (value !== null) {
            inside++;
            ink += value;
          }
        }
      }

      const total = SAMPLES * SAMPLES;
      const alpha = inside / total;
      const mix = inside === 0 ? 0 : ink / inside;

      for (let channel = 0; channel < 3; channel++) {
        raw[offset++] = Math.round(
          BACKGROUND[channel] * (1 - mix) + FOREGROUND[channel] * mix
        );
      }
      raw[offset++] = Math.round(alpha * 255);
    }
  }

  return raw;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // Bit depth.
header[9] = 6; // Colour type: RGBA.

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(render(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);
