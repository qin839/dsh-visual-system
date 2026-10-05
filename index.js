/**
 * dsh-visual-system — a wallpaper-driven visual system for the DeepSeek
 * Harness Web GUI.
 *
 * A host plugin with no browser bundle. It uses two documented extension
 * points:
 *
 *   - `webserver/index-inject`  pushes one `<style>` row (the generated
 *     palette + carrier CSS) and one body row (the media carrier element)
 *     into every rendered index.html, so the look is in place before the
 *     shell mounts;
 *   - `webServer.register()`    serves the preset assets, plus a small
 *     switcher page at `/dsh-visual/`.
 *
 * Presets live in `presets/<id>/`: a `preset.json` of colour anchors and a
 * media file. `lib/palette.mjs` expands the anchors into the full `--dsw-*`
 * token set that `@deepseek-ai/dsh-client-ui-theme` owns.
 *
 * @module dsh-visual-system
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node caches ES modules by URL, so the loader's live patch reload only picks
// up this file. Forward our own `?v=` cache-buster to the helper module: bump
// the version in cordis.patch.yml and every file of the plugin is re-imported.
const bust = new URL(import.meta.url).search;
const { buildStyles } = await import(new URL(`./lib/palette.mjs${bust}`, import.meta.url).href);

const ROUTE = '/dsh-visual';
const here = dirname(fileURLToPath(import.meta.url));
const presetsDir = join(here, 'presets');
const configPath = join(here, 'config.json');

/** Media types we serve by extension. */
const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/* ---------------------------------------------------------------- loading -- */

/** Every preset directory that carries a readable `preset.json`. */
function listPresets() {
  if (!existsSync(presetsDir)) return [];
  const out = [];
  for (const entry of readdirSync(presetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(presetsDir, entry.name);
    const manifest = join(dir, 'preset.json');
    if (!existsSync(manifest)) continue;
    try {
      out.push({ dir, preset: JSON.parse(readFileSync(manifest, 'utf8')) });
    } catch (error) {
      out.push({ dir, preset: { id: entry.name, title: entry.name, error: String(error) } });
    }
  }
  return out;
}

/** The durable selection; falls back to the first usable preset. */
function readConfig(presets) {
  let active;
  try {
    active = JSON.parse(readFileSync(configPath, 'utf8')).active;
  } catch {
    active = undefined;
  }
  const known = presets.find((p) => p.preset.id === active);
  return { active: (known ?? presets[0])?.preset.id ?? null };
}

/** Resolve the active preset, read fresh so edits need only a page reload. */
function currentSelection() {
  const presets = listPresets();
  const config = readConfig(presets);
  const chosen = presets.find((p) => p.preset.id === config.active) ?? presets[0];
  return { presets, config, chosen };
}

/* ------------------------------------------------------------------ styles -- */

/** Media-carrier scaffolding: shared by every preset. */
function carrierCss(preset) {
  const motion = preset.motion;
  const lines = [
    '/* media carrier */',
    '#dsh-visual-media{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:transparent}',
    '#dsh-visual-media>*{display:block;width:100%;height:100%;object-fit:cover;object-position:var(--dsh-visual-focus,center 40%)}',
    '#dsh-visual-media::after{content:"";position:absolute;inset:0;pointer-events:none;background-repeat:no-repeat}',
    'html body:not([data-ds-dark-theme]) #dsh-visual-media{display:none}',
    'html body[data-ds-light-wallpaper] #dsh-visual-media{display:block}',
    'html body{scrollbar-color:var(--dsw-alias-scrollbar-bg-l1) transparent}',
    '@media (prefers-reduced-motion: reduce){#dsh-visual-media>*{animation:none!important}}',
  ];
  if (motion?.kind === 'sway') {
    lines.push(
      `@keyframes dsh-visual-sway{from{transform:scale(${motion.fromScale ?? 1.05}) translate3d(${-(motion.shift ?? 0.9)}%,0,0) rotate(${-(motion.rotate ?? 0.2)}deg)}to{transform:scale(${motion.toScale ?? 1.09}) translate3d(${motion.shift ?? 0.9}%,-0.6%,0) rotate(${motion.rotate ?? 0.2}deg)}}`,
      `#dsh-visual-media>*{animation:dsh-visual-sway ${motion.duration ?? 46}s ease-in-out infinite alternate;will-change:transform}`,
    );
  } else if (motion?.kind === 'drift') {
    lines.push(
      `@keyframes dsh-visual-drift{from{transform:scale(${motion.fromScale ?? 1.04}) translate3d(${-(motion.shift ?? 1.2)}%,${motion.rise ?? 1}%,0)}to{transform:scale(${motion.toScale ?? 1.12}) translate3d(${motion.shift ?? 1.2}%,${-(motion.rise ?? 1)}%,0)}}`,
      `#dsh-visual-media>*{animation:dsh-visual-drift ${motion.duration ?? 64}s ease-in-out infinite alternate;will-change:transform}`,
    );
  }
  return lines.join('\n');
}

/** Public URL for one preset-relative asset path. */
function assetUrl(presetId, relative) {
  return `${ROUTE}/asset/${encodeURIComponent(presetId)}/${relative.split('/').map(encodeURIComponent).join('/')}`;
}

/** The body row carrying the wallpaper element. */
function mediaRow(preset) {
  const url = assetUrl(preset.id, preset.asset);
  const focus = preset.focus ? ` style="object-position:${preset.focus}"` : '';
  if (preset.kind === 'video') {
    return `<div id="dsh-visual-media" aria-hidden="true"><video src="${url}"${focus} autoplay muted loop playsinline preload="auto" disablepictureinpicture></video></div>`;
  }
  return `<div id="dsh-visual-media" aria-hidden="true"><img src="${url}"${focus} alt="" decoding="async" fetchpriority="high"></div>`;
}

/** Compose the full injected stylesheet for the active preset. */
function composeStyles(preset) {
  return [buildStyles(preset), carrierCss(preset)].join('\n');
}

/* ------------------------------------------------------------------ assets -- */

/** Map a request path segment pair onto a file inside the preset directory. */
function resolveAsset(entry, relative) {
  const { preset, dir } = entry;
  const decoded = decodeURIComponent(relative);
  // A preset may point at a file that lives outside its own directory (for
  // example a Wallpaper Engine workshop video the user already owns). Only the
  // preset-declared name is accepted, so no path from the URL reaches the disk.
  if (preset.assetPath && decoded === preset.asset) {
    return existsSync(preset.assetPath) && statSync(preset.assetPath).isFile()
      ? preset.assetPath
      : undefined;
  }
  const clean = normalize(decoded).replace(/^([/\\])+/, '');
  const target = resolve(dir, clean);
  if (target !== resolve(dir) && !target.startsWith(resolve(dir) + sep)) return undefined;
  return existsSync(target) && statSync(target).isFile() ? target : undefined;
}

/** Stream one asset, honouring Range requests so video seeking works. */
function serveAsset(req, res, file) {
  const stat = statSync(file);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'no-cache' });
    res.end();
    return;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range) {
    const start = range[1] === '' ? Math.max(0, stat.size - Number(range[2])) : Number(range[1]);
    const end = range[1] === '' || range[2] === '' ? stat.size - 1 : Math.min(Number(range[2]), stat.size - 1);
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'content-type': type,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${stat.size}`,
      'accept-ranges': 'bytes',
      'cache-control': 'no-cache',
      etag,
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'content-type': type,
    'content-length': String(stat.size),
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
    etag,
    'last-modified': stat.mtime.toUTCString(),
  });
  createReadStream(file).pipe(res);
}

/* ---------------------------------------------------------------- switcher -- */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** The little control page at `/dsh-visual/`. */
function switcherPage({ presets, config }) {
  const cards = presets
    .map(({ preset }) => {
      const active = preset.id === config.active;
      const thumb = preset.poster ?? (preset.kind === 'video' ? undefined : preset.asset);
      const media =
        preset.kind === 'video' && thumb
          ? `<img src="${assetUrl(preset.id, thumb)}" alt="">`
          : preset.kind === 'video'
            ? `<video src="${assetUrl(preset.id, preset.asset)}" muted loop autoplay playsinline></video>`
            : `<img src="${assetUrl(preset.id, preset.asset)}" alt=""${preset.focus ? ` style="object-position:${preset.focus}"` : ''}>`;
      return `<button class="card${active ? ' on' : ''}" data-id="${escapeHtml(preset.id)}">
  <span class="thumb">${media}</span>
  <span class="meta">
    <span class="title">${escapeHtml(preset.title ?? preset.id)}${active ? '<em>当前</em>' : ''}</span>
    <span class="note">${escapeHtml(preset.note ?? '')}</span>
  </span>
</button>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSH 视觉系统</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#080b1a;color:#eef1fb;
 font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:40px}
h1{font-size:20px;font-weight:600;margin:0 0 4px}
p.sub{margin:0 0 28px;color:#98a2d0;font-size:13px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));max-width:1100px}
.card{display:flex;flex-direction:column;gap:0;padding:0;border:1px solid #ffffff24;border-radius:14px;
 background:#111737cc;color:inherit;cursor:pointer;overflow:hidden;text-align:left;font:inherit;
 transition:border-color .15s,transform .15s}
.card:hover{transform:translateY(-2px);border-color:#f2c14e88}
.card.on{border-color:#f2c14e;box-shadow:0 0 0 1px #f2c14e55}
.thumb{display:block;aspect-ratio:16/9;background:#05070f;overflow:hidden}
.thumb img,.thumb video{width:100%;height:100%;object-fit:cover;display:block}
.meta{display:flex;flex-direction:column;gap:2px;padding:12px 14px 14px}
.title{font-weight:600;display:flex;align-items:center;gap:8px}
.title em{font-style:normal;font-size:11px;padding:1px 7px;border-radius:999px;background:#f2c14e;color:#1b1405}
.note{color:#98a2d0;font-size:12px;line-height:1.5}
.hint{margin-top:24px;color:#7580ad;font-size:12px}
</style></head>
<body>
<h1>DSH 视觉系统</h1>
<p class="sub">选一张壁纸，刷新页面生效。当前：<b>${escapeHtml(config.active ?? '—')}</b></p>
<div class="grid">
${cards}
</div>
<p class="hint">也可以直接改 <code>config.json</code> 的 <code>active</code>；<code>theme</code> 变化只需刷新页面，不用重启服务。</p>
<script>
document.querySelectorAll('.card').forEach((el) => el.addEventListener('click', async () => {
  el.disabled = true;
  try {
    const res = await fetch('${ROUTE}/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: el.dataset.id }),
    });
    if (!res.ok) throw new Error(await res.text());
    location.reload();
  } catch (error) {
    el.disabled = false;
    alert('切换失败: ' + error.message);
  }
}));
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ plugin -- */

/**
 * Plugin body: inject the active preset's stylesheet and media carrier into
 * every index render, and publish the asset + switcher routes.
 * @param ctx - host cordis context.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    // A visual failure must never break the page: fall back to no injection.
    try {
      const { chosen } = currentSelection();
      if (!chosen) return;
      const { preset } = chosen;
      table.push({ kind: 'style', text: composeStyles(preset) });
      if (preset.kind === 'video' || preset.kind === 'image') {
        table.push({ kind: 'html', placement: 'body', html: mediaRow(preset) });
      }
    } catch (error) {
      console.warn('[dsh-visual-system] index injection failed:', error?.message ?? error);
    }
  });

  ctx.inject(['webServer'], (webCtx) => {
    const ws = webCtx.webServer;
    const disposers = [];

    // Assets: /dsh-visual/asset/<preset>/<relative path>
    disposers.push(
      ws.register({
        kind: 'prefix',
        path: `${ROUTE}/asset`,
        handler: (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const rest = url.pathname.slice(`${ROUTE}/asset/`.length);
          const slash = rest.indexOf('/');
          const id = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash));
          const relative = slash === -1 ? '' : rest.slice(slash + 1);
          const entry = listPresets().find((p) => p.preset.id === id);
          const file = entry && relative ? resolveAsset(entry, relative) : undefined;
          if (!file) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end(`dsh-visual-system: no asset ${id}/${relative}\n`);
            return;
          }
          serveAsset(req, res, file);
        },
      }),
    );

    // Preset selection API.
    disposers.push(
      ws.register({
        kind: 'exact',
        path: `${ROUTE}/config`,
        handler: (req, res) => {
          if (req.method === 'GET') {
            const selection = currentSelection();
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(
              JSON.stringify({
                active: selection.config.active,
                presets: selection.presets.map((p) => p.preset.id),
              }),
            );
            return;
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'GET, POST' });
            res.end();
            return;
          }
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              const known = listPresets().some((p) => p.preset.id === body.active);
              if (!known) throw new Error(`unknown preset ${JSON.stringify(body.active)}`);
              writeFileSync(configPath, `${JSON.stringify({ active: body.active }, null, 2)}\n`);
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ active: body.active }));
            } catch (error) {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
              res.end(`dsh-visual-system: ${error?.message ?? error}\n`);
            }
          });
        },
      }),
    );

    // 主题状态：客户端半边（lib/client.js）用这个接口一次拿到
    // 「当前预设 + 生成好的 CSS + 素材地址」，然后在渲染进程里自己挂样式和壁纸。
    // 之所以要这条路由：桌面端窗口加载的是打包页面（dsh-app://app/），
    // 吃不到 webserver/index-inject 的 style/html 行，只有客户端插件两端通用。
    disposers.push(
      ws.register({
        kind: 'exact',
        path: `${ROUTE}/state`,
        handler: (req, res) => {
          const selection = currentSelection();
          const preset = selection.chosen?.preset;
          const carriesMedia = preset && (preset.kind === 'video' || preset.kind === 'image');
          const payload = preset
            ? {
                active: preset.id,
                presets: selection.presets.map((p) => p.preset.id),
                css: composeStyles(preset),
                media: carriesMedia
                  ? { kind: preset.kind, url: assetUrl(preset.id, preset.asset), focus: preset.focus ?? null }
                  : null,
              }
            : { active: null, presets: [], css: '', media: null };
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify(payload));
        },
      }),
    );

    // The switcher page.
    disposers.push(
      ws.register({
        kind: 'prefix',
        path: ROUTE,
        handler: (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          if (url.pathname !== `${ROUTE}/` && url.pathname !== ROUTE) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('dsh-visual-system: not found\n');
            return;
          }
          const selection = currentSelection();
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(switcherPage(selection));
        },
      }),
    );

    webCtx.effect(() => () => {
      for (const dispose of disposers) dispose();
    });
  });
}

export { ROUTE as VISUAL_ROUTE };
