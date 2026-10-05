/**
 * Wallpaper Engine `.pkg` reader — asset-prep tool for the DSH visual system.
 *
 * A workshop "scene" wallpaper ships its artwork inside `scene.pkg`, a trivial
 * container:
 *
 *   char[8]  magic           "PKGV0001" / "PKGV0020"
 *   uint32   fileCount
 *   fileCount × { uint32 nameLen, char[nameLen] name, uint32 offset, uint32 size }
 *   <data section>
 *
 * `offset` is relative to the start of the data section. Textures are WE's own
 * `.tex` format; see `we-tex.mjs` for the decoder.
 *
 * Usage:
 *   node we-pkg.mjs list  <scene.pkg> [substring]
 *   node we-pkg.mjs extract <scene.pkg> <entry-name> <out-file>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Parse the container header. */
export function readPkg(path) {
  const buf = readFileSync(path);
  // Some builds prefix the container with a 4-byte chunk length.
  const magicAt = buf.toString('latin1', 0, 8).startsWith('PKGV') ? 0 : 4;
  const magic = buf.toString('latin1', magicAt, magicAt + 8);
  if (!magic.startsWith('PKGV')) throw new Error(`not a WE pkg: magic=${JSON.stringify(magic)}`);
  const fileCount = buf.readUInt32LE(magicAt + 8);
  let cursor = magicAt + 12;
  const entries = [];
  for (let i = 0; i < fileCount; i += 1) {
    const nameLen = buf.readUInt32LE(cursor);
    cursor += 4;
    const name = buf.toString('utf8', cursor, cursor + nameLen);
    cursor += nameLen;
    const offset = buf.readUInt32LE(cursor);
    const size = buf.readUInt32LE(cursor + 4);
    cursor += 8;
    entries.push({ name, offset, size });
  }
  return { buf, magic, fileCount, dataStart: cursor, entries };
}

/** Read one entry's bytes. */
export function readEntry(pkg, entry) {
  return pkg.buf.subarray(pkg.dataStart + entry.offset, pkg.dataStart + entry.offset + entry.size);
}

const [command, pkgPath, ...rest] = process.argv.slice(2);
if (command === 'list') {
  const pkg = readPkg(pkgPath);
  const filter = rest[0] ?? '';
  const rows = pkg.entries
    .filter((e) => e.name.includes(filter))
    .sort((a, b) => b.size - a.size)
    .slice(0, 60)
    .map((e) => `${String(e.size).padStart(10)}  ${e.name}`);
  console.log(`magic=${pkg.magic} files=${pkg.fileCount} dataStart=${pkg.dataStart}`);
  console.log(rows.join('\n'));
} else if (command === 'extract') {
  const [entryName, outPath] = rest;
  const pkg = readPkg(pkgPath);
  const entry = pkg.entries.find((e) => e.name === entryName);
  if (!entry) throw new Error(`no entry named ${entryName}`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, readEntry(pkg, entry));
  console.log(`wrote ${outPath} (${entry.size} bytes)`);
} else if (command !== undefined) {
  throw new Error(`unknown command ${command}`);
}
