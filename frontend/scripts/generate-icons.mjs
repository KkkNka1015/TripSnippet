/**
 * PWA 图标生成脚本（纯 Node，零依赖）
 * - 程序化绘制复古罗盘图案，输出 192 / 512 两枚 PNG 到 public/icons/
 * - 已挂入 npm run build 前置步骤；仓库不提交 PNG 产物（.gitignore 排除）
 * - 运行：node scripts/generate-icons.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- PNG 编码（RGBA8 → PNG） ---------- */

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 复古罗盘绘制（3x3 超采样抗锯齿） ---------- */

const INK = [70, 56, 48]; // 深棕（罗盘针南半 / 外环）
const RED = [181, 86, 79]; // 复古红（罗盘针北半）
const PAPER = [242, 233, 213]; // 米色盘面
const GOLD = [196, 165, 108]; // 复古金（刻度）

/** 判断点 (x,y)（以中心为原点）是否在顶点向上的等腰三角形内 */
function inNorthNeedle(x, y, len, halfW) {
  return y < 0 && y > -len && Math.abs(x) < halfW * (1 + y / len);
}

function samplePixel(size, fx, fy) {
  const cx = size / 2;
  const cy = size / 2;
  const x = fx - cx;
  const y = fy - cy;
  const d = Math.hypot(x, y);
  const R = size * 0.46; // 外环外沿
  const r = size * 0.40; // 盘面外沿

  if (d > R) return [0, 0, 0, 0]; // 圆外透明
  if (d > r) return [...INK, 255]; // 深棕外环

  // 盘面
  let color = PAPER;

  // 外沿细金圈装饰
  if (d > r - size * 0.025) color = GOLD;

  // 罗盘针：北红南棕，东西留白
  const len = size * 0.30;
  const halfW = size * 0.085;
  if (inNorthNeedle(x, y, len, halfW)) color = RED;
  if (inNorthNeedle(-x, -y, len, halfW)) color = INK;

  // 主刻度：东西两枚短金线
  if (Math.abs(y) < size * 0.008 && Math.abs(x) > size * 0.30 && Math.abs(x) < size * 0.34) color = GOLD;

  // 中心装饰：白圆 + 深棕点
  if (d < size * 0.035) color = [255, 252, 240];
  if (d < size * 0.016) color = INK;

  return [...color, 255];
}

function makeIcon(size) {
  const SS = 3; // 超采样倍数
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = samplePixel(size, px + (sx + 0.5) / SS, py + (sy + 0.5) / SS);
          r += s[0];
          g += s[1];
          b += s[2];
          a += s[3];
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      rgba[i] = r / n;
      rgba[i + 1] = g / n;
      rgba[i + 2] = b / n;
      rgba[i + 3] = a / n;
    }
  }
  return encodePNG(size, size, rgba);
}

const outDir = path.join(ROOT, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const png = makeIcon(size);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`generated ${path.relative(ROOT, file)} (${png.length} bytes)`);
}
