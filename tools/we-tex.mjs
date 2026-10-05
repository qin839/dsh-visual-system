/**
 * Wallpaper Engine `.tex` decoder — asset-prep tool for the DSH visual system.
 *
 * Layout (little-endian):
 *   char[8] "TEXV0005"   container version
 *   char[8] "TEXI0001"   image payload
 *   uint32  format       pixel format id
 *   uint32  flags        bit 0 = ?, bit 1 = ?, ... bit 4 = no interpolation
 *   uint32  textureWidth
 *   uint32  textureHeight
 *   uint32  imageWidth   (unused by the renderer)
 *   uint32  imageHeight  (unused)
 *   uint32  unknown
 *   uint32  mipCount
 *   mipCount × { uint32 width, uint32 height, <blocks> }
 *
 * Formats follow the community-documented ids; rather than trusting a table we
 * size-match the first mip's block data against each candidate codec and decode
 * with whichever fits exactly.
 *
 * Usage:
 *   node we-tex.mjs probe <file.tex>
 *   node we-tex.mjs decode <file.tex> <out.png>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/** Candidate codecs, ordered by how likely WE is to use them. */
const CODECS = [
  {
    name: 'DXT5',
    bytesPerBlock: 16,
    decode: decodeDxt5,
  },
  {
    name: 'DXT1',
    bytesPerBlock: 8,
    decode: decodeDxt1,
  },
  {
    name: 'DXT3',
    bytesPerBlock: 16,
    decode: decodeDxt3,
  },
  {
    name: 'RGBA8888',
    bytesPerPixel: 4,
    decode: decodeRgba8888,
  },
  {
    name: 'BGRA8888',
    bytesPerPixel: 4,
    decode: decodeBgra8888,
  },
  {
    name: 'RGBA4444',
    bytesPerPixel: 2,
    decode: decodeRgba4444,
  },
  {
    name: 'RGBA5551',
    bytesPerPixel: 2,
    decode: decodeRgba5551,
  },
];

/** Expected payload bytes for one mip under a codec. */
function payloadSize(codec, width, height) {
  if (codec.bytesPerPixel !== undefined) return width * height * codec.bytesPerPixel;
  const blocks = Math.ceil(width / 4) * Math.ceil(height / 4);
  return blocks * codec.bytesPerBlock;
}

/** Parse the container and its mip table. */
export function readTex(path) {
  const buf = readFileSync(path);
  const container = buf.toString('latin1', 0, 8);
  const image = buf.toString('latin1', 8, 16);
  if (container !== 'TEXV0005' || image !== 'TEXI0001') {
    throw new Error(`unsupported tex header: ${container} / ${image}`);
  }
  const format = buf.readUInt32LE(16);
  const flags = buf.readUInt32LE(20);
  const textureWidth = buf.readUInt32LE(24);
  const textureHeight = buf.readUInt32LE(28);
  const imageWidth = buf.readUInt32LE(32);
  const imageHeight = buf.readUInt32LE(36);
  const unknown = buf.readUInt32LE(40);
  const mipCount = buf.readUInt32LE(44);
  const { codec, mips } = resolveLayout(buf, mipCount);
  return {
    buf, format, flags, textureWidth, textureHeight, imageWidth, imageHeight,
    unknown, mipCount, mips, codec,
  };
}

/**
 * Walk the mip table for every candidate codec and keep the one whose walk
 * lands exactly on the end of the file — the definitive format check.
 */
function resolveLayout(buf, mipCount) {
  const attempts = [];
  for (const codec of CODECS) {
    let cursor = 48;
    const mips = [];
    let ok = true;
    for (let i = 0; i < mipCount; i += 1) {
      if (cursor + 8 > buf.length) { ok = false; break; }
      const width = buf.readUInt32LE(cursor);
      const height = buf.readUInt32LE(cursor + 4);
      cursor += 8;
      const size = payloadSize(codec, width, height);
      if (cursor + size > buf.length) { ok = false; break; }
      mips.push({ width, height, start: cursor });
      cursor += size;
    }
    if (ok && cursor === buf.length) attempts.push({ codec, mips });
  }
  if (attempts.length === 0) {
    throw new Error(`no codec explains the mip table (mipCount=${mipCount}, bytes=${buf.length})`);
  }
  // DXT5 and DXT3 share a block size; the format id breaks the tie.
  const byId = { 1: 'DXT5', 2: 'DXT3', 4: 'DXT5', 6: 'DXT3' };
  const wanted = byId[buf.readUInt32LE(16)];
  return attempts.find((a) => a.codec.name === wanted) ?? attempts[0];
}

/** The codec chosen for this texture. */
export function resolveCodec(tex) {
  return tex.codec;
}

function decodeDxt1(data, width, height) {
  const out = new Uint8Array(width * height * 4);
  const bw = Math.ceil(width / 4);
  for (let by = 0; by * 4 < height; by += 1) {
    for (let bx = 0; bx < bw; bx += 1) {
      const p = (by * bw + bx) * 8;
      const c0 = data.readUInt16LE(p);
      const c1 = data.readUInt16LE(p + 2);
      const bits = data.readUInt32LE(p + 4);
      const pal = build565Palette(c0, c1, false);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const idx = (bits >>> (2 * (4 * y + x))) & 3;
          const px = paletteLookup(pal, idx);
          writePixel(out, width, height, bx * 4 + x, by * 4 + y, px);
        }
      }
    }
  }
  return { data: out, width, height };
}

function decodeDxt3(data, width, height) {
  const out = new Uint8Array(width * height * 4);
  const bw = Math.ceil(width / 4);
  for (let by = 0; by * 4 < height; by += 1) {
    for (let bx = 0; bx < bw; bx += 1) {
      const p = (by * bw + bx) * 16;
      const alpha = data.readBigUInt64LE(p);
      const c0 = data.readUInt16LE(p + 8);
      const c1 = data.readUInt16LE(p + 10);
      const bits = data.readUInt32LE(p + 12);
      const pal = build565Palette(c0, c1, false);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const i = 4 * y + x;
          const idx = (bits >>> (2 * i)) & 3;
          const px = paletteLookup(pal, idx);
          const a4 = Number((alpha >> BigInt(4 * i)) & 0xfn);
          writePixel(out, width, height, bx * 4 + x, by * 4 + y, [px[0], px[1], px[2], a4 * 17]);
        }
      }
    }
  }
  return { data: out, width, height };
}

function decodeDxt5(data, width, height) {
  const out = new Uint8Array(width * height * 4);
  const bw = Math.ceil(width / 4);
  for (let by = 0; by * 4 < height; by += 1) {
    for (let bx = 0; bx < bw; bx += 1) {
      const p = (by * bw + bx) * 16;
      const a0 = data[p];
      const a1 = data[p + 1];
      const abits = data.readBigUInt64LE(p + 2);
      const c0 = data.readUInt16LE(p + 8);
      const c1 = data.readUInt16LE(p + 10);
      const bits = data.readUInt32LE(p + 12);
      const pal = build565Palette(c0, c1, false);
      const alpha = buildAlphaPalette(a0, a1);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const i = 4 * y + x;
          const idx = (bits >>> (2 * i)) & 3;
          const px = paletteLookup(pal, idx);
          const aIdx = Number((abits >> BigInt(3 * i)) & 7n);
          writePixel(out, width, height, bx * 4 + x, by * 4 + y, [px[0], px[1], px[2], alpha[aIdx]]);
        }
      }
    }
  }
  return { data: out, width, height };
}

function decodeRgba8888(data, width, height) {
  return { data: new Uint8Array(data.subarray(0, width * height * 4)), width, height };
}

function decodeBgra8888(data, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    out[i * 4] = data[i * 4 + 2];
    out[i * 4 + 1] = data[i * 4 + 1];
    out[i * 4 + 2] = data[i * 4];
    out[i * 4 + 3] = data[i * 4 + 3];
  }
  return { data: out, width, height };
}

function decodeRgba4444(data, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const v = data.readUInt16LE(i * 2);
    out[i * 4] = ((v >> 12) & 0xf) * 17;
    out[i * 4 + 1] = ((v >> 8) & 0xf) * 17;
    out[i * 4 + 2] = ((v >> 4) & 0xf) * 17;
    out[i * 4 + 3] = (v & 0xf) * 17;
  }
  return { data: out, width, height };
}

function decodeRgba5551(data, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const v = data.readUInt16LE(i * 2);
    out[i * 4] = Math.round((((v >> 11) & 0x1f) * 255) / 31);
    out[i * 4 + 1] = Math.round((((v >> 6) & 0x1f) * 255) / 31);
    out[i * 4 + 2] = Math.round((((v >> 1) & 0x1f) * 255) / 31);
    out[i * 4 + 3] = (v & 1) === 1 ? 255 : 0;
  }
  return { data: out, width, height };
}

function build565Palette(c0, c1) {
  const a = unpack565(c0);
  const b = unpack565(c1);
  const pal = [a, b];
  if (c0 > c1) {
    pal.push([(2 * a[0] + b[0]) / 3, (2 * a[1] + b[1]) / 3, (2 * a[2] + b[2]) / 3, 255]);
    pal.push([(a[0] + 2 * b[0]) / 3, (a[1] + 2 * b[1]) / 3, (a[2] + 2 * b[2]) / 3, 255]);
  } else {
    pal.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 255]);
    pal.push([0, 0, 0, 0]);
  }
  return pal;
}

function buildAlphaPalette(a0, a1) {
  const alpha = [a0, a1];
  if (a0 > a1) {
    for (let i = 1; i <= 6; i += 1) alpha.push(((7 - i) * a0 + i * a1) / 7);
  } else {
    for (let i = 1; i <= 4; i += 1) alpha.push(((5 - i) * a0 + i * a1) / 5);
    alpha.push(0, 255);
  }
  return alpha.map((v) => Math.round(v));
}

function unpack565(v) {
  return [
    Math.round((((v >> 11) & 0x1f) * 255) / 31),
    Math.round((((v >> 5) & 0x3f) * 255) / 63),
    Math.round(((v & 0x1f) * 255) / 31),
    255,
  ];
}

function paletteLookup(pal, idx) {
  const px = pal[idx] ?? [0, 0, 0, 255];
  return [Math.round(px[0]), Math.round(px[1]), Math.round(px[2]), Math.round(px[3])];
}

function writePixel(out, width, height, x, y, px) {
  if (x >= width || y >= height) return;
  const o = (y * width + x) * 4;
  out[o] = px[0];
  out[o + 1] = px[1];
  out[o + 2] = px[2];
  out[o + 3] = px[3];
}

/* ------------------------------------------------------------------ PNG ---- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode RGBA bytes as a PNG buffer. */
export function encodePng({ data, width, height }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------- CLI --- */

/**
 * Newer WE builds wrap an ordinary PNG/JPEG inside the TEXB block instead of
 * raw block-compressed mips, so the fastest correct extraction is to carve the
 * standard image stream out of the container.
 * @returns every carved image, in file order.
 */
export function carveImages(buf) {
  const found = [];
  for (let i = 0; i + 8 < buf.length; i += 1) {
    const isPng = buf[i] === 0x89 && buf.toString('latin1', i + 1, i + 4) === 'PNG';
    const isJpg = buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff;
    if (!isPng && !isJpg) continue;
    if (isPng) {
      const end = buf.indexOf(Buffer.from('IEND'), i, 'latin1');
      if (end === -1) continue;
      found.push({ kind: 'png', start: i, end: end + 8 });
      i = end + 8;
    } else {
      const end = buf.indexOf(Buffer.from([0xff, 0xd9]), i + 3);
      if (end === -1) continue;
      found.push({ kind: 'jpeg', start: i, end: end + 2 });
      i = end + 2;
    }
  }
  return found;
}

const [command, file, out] = process.argv.slice(2);
if (command === 'probe') {
  const buf = readFileSync(file);
  const images = carveImages(buf).map((img) => {
    // Read the PNG IHDR when present so the report is self-describing.
    let size = '';
    if (img.kind === 'png' && buf.readUInt32BE(img.start + 16) > 0) {
      size = `${buf.readUInt32BE(img.start + 16)}x${buf.readUInt32BE(img.start + 20)}`;
    }
    return `${img.kind} ${size} bytes=${img.end - img.start} at=${img.start}`;
  });
  console.log(`container=${buf.toString('latin1', 0, 8)} images=${images.length}`);
  console.log(images.join('\n'));
} else if (command === 'carve') {
  const buf = readFileSync(file);
  const [first] = carveImages(buf);
  if (!first) throw new Error('no embedded image found');
  writeFileSync(out, buf.subarray(first.start, first.end));
  console.log(`wrote ${out} (${first.kind}, ${first.end - first.start} bytes)`);
} else if (command === 'decode') {
  const tex = readTex(file);
  const codec = resolveCodec(tex);
  const mip = tex.mips[0];
  const decoded = codec.decode(tex.buf, mip.width, mip.height);
  writeFileSync(out, encodePng(decoded));
  console.log(`wrote ${out} — ${mip.width}x${mip.height} codec=${codec.name} formatId=${tex.format}`);
} else if (command !== undefined) {
  throw new Error(`unknown command ${command}`);
}
