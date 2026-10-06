/**
 * Palette engine for the DSH visual system.
 *
 * A preset describes its look with a handful of anchors (background, ink,
 * accent, states). This module turns those anchors into the full `--dsw-*`
 * token set that `@deepseek-ai/dsh-client-ui-theme` owns, so a new wallpaper
 * costs eight colours instead of a hundred and twenty tokens.
 *
 * The split mirrors the design system's own layering:
 *   - `--dsw-static-*`  the raw ramps, scheme-independent
 *   - `--dsw-alias-*`   semantic aliases, mapped per light/dark scheme
 *   - `--dsw-specific-*` surface tokens for individual regions
 *
 * @module dsh-visual-system/palette
 */

/* ------------------------------------------------------------------ colour -- */

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa` or `rgb()/rgba()` into components. */
export function parseColor(input) {
  // Already-parsed components pass straight through, so `mix()` results can be
  // fed back into the helpers.
  if (input && typeof input === 'object' && 'r' in input && 'g' in input && 'b' in input) {
    return { r: input.r, g: input.g, b: input.b, a: input.a ?? 1 };
  }
  const value = String(input).trim();
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6) hex += 'ff';
    if (hex.length !== 8) throw new Error(`bad hex colour ${input}`);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255,
    };
  }
  const match = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (match) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const [r, g, b, a = 1] = parts;
    // 缺分量 / 非数字必须报错，而不是悄悄产出 undefined（那会一路渗进生成的 CSS）
    if (parts.length < 3 || ![r, g, b, a].every((n) => Number.isFinite(n))) {
      throw new Error(`bad rgb() colour ${input}`);
    }
    return { r, g, b, a };
  }
  throw new Error(`unsupported colour ${input}`);
}

const round = (n) => Math.max(0, Math.min(255, Math.round(n)));

/** Linear blend; `t` = 0 returns `a`, `t` = 1 returns `b`. */
export function mix(a, b, t) {
  const x = parseColor(a);
  const y = parseColor(b);
  return {
    r: round(x.r + (y.r - x.r) * t),
    g: round(x.g + (y.g - x.g) * t),
    b: round(x.b + (y.b - x.b) * t),
    a: x.a + (y.a - x.a) * t,
  };
}

/** Same colour with a different alpha. */
export const alpha = (color, a) => ({ ...parseColor(color), a });

/** CSS string, dropping alpha when fully opaque. */
export function css({ r, g, b, a }) {
  return a >= 0.999 ? `rgb(${r} ${g} ${b})` : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}

/** `mix()` that returns a CSS string. */
export const mixCss = (a, b, t) => css(mix(a, b, t));
/** `alpha()` that returns a CSS string. */
export const alphaCss = (color, a) => css(alpha(color, a));

/* ------------------------------------------------------------------ ramps --- */

/** Stop positions for the neutral-bluish ramp, from lightest to darkest. */
const BLUISH_STOPS = [
  ['00', 0.0], ['50', 0.035], ['60', 0.07], ['75', 0.12], ['100', 0.18],
  ['150', 0.25], ['200', 0.33], ['250', 0.4], ['300', 0.47], ['400', 0.58],
  ['500', 0.67], ['550', 0.73], ['600', 0.79], ['700', 0.86], ['750', 0.9],
  ['800', 0.94], ['850', 0.965], ['875', 0.977], ['900', 0.986], ['950', 0.994],
  ['1000', 1.0],
];

/** Build a five-step accent ramp from one hue. */
function accentRamp(hue, scheme) {
  const pole = scheme === 'dark' ? '#05070f' : '#ffffff';
  const steps = (t) => mixCss(hue, pole, t);
  return {
    50: steps(scheme === 'dark' ? 0.86 : 0.93),
    100: steps(scheme === 'dark' ? 0.74 : 0.84),
    200: steps(scheme === 'dark' ? 0.58 : 0.7),
    300: steps(scheme === 'dark' ? 0.38 : 0.5),
    400: scheme === 'dark' ? css(mix(hue, '#ffffff', 0.16)) : steps(0.24),
    450: scheme === 'dark' ? css(mix(hue, '#ffffff', 0.08)) : steps(0.32),
    500: css(parseColor(hue)),
    600: steps(0.22),
    800: steps(0.72),
    900: steps(scheme === 'dark' ? 0.84 : 0.9),
  };
}

/* -------------------------------------------------------------- generation -- */

/**
 * Compose the complete stylesheet for one preset.
 * @param preset - parsed `preset.json`.
 * @returns CSS text, with `__ASSET__` already resolved by the caller's map.
 */
export function buildStyles(preset) {
  const out = [];
  const { dark = {}, light = {}, name } = preset;

  for (const scheme of ['light', 'dark']) {
    const spec = scheme === 'dark' ? dark : light;
    const base = spec.base ?? (scheme === 'dark' ? '#0b1030' : '#ffffff');
    const surface = spec.surface ?? (scheme === 'dark' ? '#151b3b' : '#f8f9fe');
    const ink = spec.ink ?? (scheme === 'dark' ? '#eef1fb' : '#090b1f');
    const accent = spec.accent ?? (scheme === 'dark' ? '#f2c14e' : '#c98a12');
    const accent2 = spec.accent2 ?? (scheme === 'dark' ? '#5ad2e6' : '#0f6d88');
    const success = spec.success ?? '#46d99a';
    const warn = spec.warn ?? (scheme === 'dark' ? '#ff8f3c' : '#c2641a');
    const danger = spec.danger ?? (scheme === 'dark' ? '#f2555a' : '#d02a2a');
    const onAccent = spec.onAccent ?? (scheme === 'dark' ? '#1b1405' : '#fffaf0');

    const hi = spec.hi ?? (scheme === 'dark' ? ink : '#ffffff');
    const lo = spec.lo ?? (scheme === 'dark' ? mixCss(base, '#000000', 0.55) : ink);

    // ---- static ramps: scheme-independent hues, per-scheme endpoints --------
    const statics = [`  /* ${scheme} ramps */`];
    for (const [stop, t] of BLUISH_STOPS) {
      statics.push(`  --dsw-static-neutral-bluish-${stop}: ${mixCss(hi, lo, t)};`);
    }
    // The neutral ramp is the same ladder, slightly desaturated toward grey.
    const grey = '#8a8a8a';
    for (const [stop, t] of BLUISH_STOPS) {
      statics.push(`  --dsw-static-neutral-${stop}: ${mixCss(mix(hi, grey, 0.25), mix(lo, grey, 0.25), t)};`);
    }
    for (const [stop, value] of Object.entries(accentRamp(accent2, scheme))) {
      statics.push(`  --dsw-static-deepseek-${stop}: ${value};`);
    }
    for (const [stop, value] of Object.entries(accentRamp(warn, scheme))) {
      statics.push(`  --dsw-static-amber-${stop}: ${value};`);
    }
    for (const [stop, value] of Object.entries(accentRamp(success, scheme))) {
      statics.push(`  --dsw-static-green-${stop}: ${value};`);
    }
    for (const [stop, value] of Object.entries(accentRamp(danger, scheme))) {
      statics.push(`  --dsw-static-red-${stop}: ${value};`);
    }
    statics.push(`  --dsw-static-neutral-1000: #000000;`);
    statics.push(`  --dsw-static-neutral-bluish-1000: ${lo};`);

    // ---- alpha model: how much of the wallpaper each surface lets through ---
    const veil = spec.veil ?? (scheme === 'dark' ? 0.5 : 0.86);
    const layer = (t) => alphaCss(mix(surface, ink, t * 0.05), veil + (1 - veil) * t * 0.62);
    const opaque = (t) => alphaCss(mix(surface, scheme === 'dark' ? '#000000' : '#ffffff', t * 0.04), 0.995);

    const lines = [
      ...statics,
      `  /* aliases */`,
      `  --dsw-alias-bg-base: ${layer(0)};`,
      `  --dsw-alias-bg-layer-1: ${layer(0.28)};`,
      `  --dsw-alias-bg-layer-2: ${layer(0.55)};`,
      `  --dsw-alias-bg-layer-3: ${opaque(0.6)};`,
      `  --dsw-alias-bg-module-platform: ${opaque(0.35)};`,
      `  --dsw-alias-bg-overlay: ${alphaCss(mix(surface, ink, 0.55), 0.92)};`,
      `  --dsw-alias-bg-multi-select: ${opaque(0.6)};`,
      `  --dsw-alias-bg-skeleton: ${alphaCss(ink, scheme === 'dark' ? 0.06 : 0.05)};`,
      `  --dsw-alias-bg-mask-1: ${alphaCss('#000000', scheme === 'dark' ? 0.5 : 0.24)};`,
      `  --dsw-alias-bg-mask-2: ${alphaCss('#000000', 0.2)};`,
      `  --dsw-alias-bg-mask-3: ${alphaCss('#000000', 0.48)};`,
      `  --dsw-alias-bg-mask-photo: ${alphaCss('#000000', 0.88)};`,
      `  --dsw-alias-bg-mask-drop: ${alphaCss(scheme === 'dark' ? '#272730' : '#ffffff', 0.7)};`,

      `  --dsw-alias-brand-primary: ${accent};`,
      `  --dsw-alias-brand-primary-new-colorprimary-new-color: ${accent};`,
      `  --dsw-alias-brand-primary-invert: ${mixCss(accent, scheme === 'dark' ? '#ffffff' : '#000000', 0.7)};`,
      `  --dsw-alias-brand-text: ${spec.brandText ?? accent};`,
      `  --dsw-alias-label-primary-foreground: ${onAccent};`,
      `  --dsw-alias-label-primary-inverted: ${scheme === 'dark' ? lo : ink};`,
      `  --dsw-alias-label-primary: ${ink};`,
      `  --dsw-alias-label-primary-dimmed: ${mixCss(ink, base, 0.18)};`,
      `  --dsw-alias-label-primary-bluish: ${scheme === 'dark' ? ink : mixCss(accent2, '#000000', 0.45)};`,
      `  --dsw-alias-label-secondary: ${mixCss(ink, base, scheme === 'dark' ? 0.32 : 0.4)};`,
      `  --dsw-alias-label-tertiary: ${mixCss(ink, base, scheme === 'dark' ? 0.45 : 0.5)};`,
      `  --dsw-alias-label-caption: ${mixCss(ink, base, scheme === 'dark' ? 0.56 : 0.56)};`,
      `  --dsw-alias-label-dimmed: ${mixCss(ink, base, 0.72)};`,

      `  --dsw-alias-link: ${accent2};`,
      `  --dsw-alias-button-primary-fill: ${accent};`,
      `  --dsw-alias-button-primary-hover: ${mixCss(accent, '#ffffff', 0.22)};`,
      `  --dsw-alias-button-primary-dimmed: ${alphaCss(accent, 0.35)};`,
      `  --dsw-alias-button-info-fill: ${accent};`,
      `  --dsw-alias-button-info-hover: ${mixCss(accent, '#ffffff', 0.22)};`,
      `  --dsw-alias-button-contrast-fill: ${mixCss(ink, base, 0.4)};`,
      `  --dsw-alias-button-elevated-fill: ${opaque(0.4)};`,
      `  --dsw-alias-button-floating-fill: ${opaque(0.5)};`,
      `  --dsw-alias-button-floating-hover: ${opaque(0.3)};`,
      `  --dsw-alias-button-ghost-active-fill: ${alphaCss(accent, 0.14)};`,
      `  --dsw-alias-button-ghost-active-hover: ${alphaCss(accent, 0.2)};`,
      `  --dsw-alias-button-ghost-active-border: ${alphaCss(accent, 0.45)};`,
      `  --dsw-alias-button-tool-bar-fill: ${alphaCss('#545557', 0.5)};`,
      `  --dsw-alias-button-tool-bar-fill-invisible: ${alphaCss('#1f1f1f', 0.36)};`,
      `  --dsw-alias-button-tool-bar-hover: ${alphaCss('#545557', 0.6)};`,

      `  --dsw-alias-interactive-bg-hover: ${alphaCss(ink, scheme === 'dark' ? 0.07 : 0.05)};`,
      `  --dsw-alias-interactive-bg-hover-solid: ${alphaCss(mix(surface, ink, 0.14), 0.9)};`,
      `  --dsw-alias-interactive-bg-hover-accent: ${alphaCss(accent, 0.18)};`,
      `  --dsw-alias-interactive-bg-hover-danger: ${alphaCss(danger, 0.14)};`,
      `  --dsw-alias-interactive-bg-active: ${alphaCss(accent, 0.2)};`,

      `  --dsw-alias-border-l1: ${alphaCss(ink, scheme === 'dark' ? 0.07 : 0.06)};`,
      `  --dsw-alias-border-l2: ${alphaCss(ink, scheme === 'dark' ? 0.16 : 0.12)};`,
      `  --dsw-alias-border-l2-darkmode-thin: ${alphaCss(ink, 0.09)};`,
      `  --dsw-alias-border-l3: ${alphaCss(ink, scheme === 'dark' ? 0.22 : 0.16)};`,
      `  --dsw-alias-border-l4: ${alphaCss(accent, scheme === 'dark' ? 0.3 : 0.42)};`,
      `  --dsw-alias-border-inverted: ${alphaCss(ink, 0.1)};`,
      `  --dsw-alias-border-inverted2: ${alphaCss(ink, 0.12)};`,

      `  --dsw-alias-state-success-primary: ${success};`,
      `  --dsw-alias-state-success-secondary: ${mixCss(success, '#ffffff', 0.24)};`,
      `  --dsw-alias-state-success-tertiary: ${alphaCss(success, 0.16)};`,
      `  --dsw-alias-state-warn-primary: ${warn};`,
      `  --dsw-alias-state-warn-secondary: ${mixCss(warn, '#ffffff', 0.24)};`,
      `  --dsw-alias-state-warn-label: ${scheme === 'dark' ? warn : mixCss(warn, '#000000', 0.2)};`,
      `  --dsw-alias-state-warn-tertiary: ${alphaCss(warn, 0.16)};`,
      `  --dsw-alias-state-error-primary: ${danger};`,
      `  --dsw-alias-state-error-secondary: ${mixCss(danger, '#ffffff', 0.2)};`,
      `  --dsw-alias-state-business-primary: ${spec.business ?? accent};`,
      `  --dsw-alias-state-business-tertiary: ${alphaCss(spec.business ?? accent, 0.16)};`,

      `  --dsw-alias-scrollbar-bg-l1: ${mixCss(ink, base, 0.78)};`,
      `  --dsw-alias-scrollbar-bg-l2: ${mixCss(ink, base, 0.72)};`,
      `  --dsw-alias-scrollbar-hover-l1: ${mixCss(ink, base, 0.64)};`,
      `  --dsw-alias-scrollbar-hover-l2: ${mixCss(ink, base, 0.58)};`,

      `  --dsw-alias-markdown-code-block: ${alphaCss(mix(base, '#000000', 0.3), scheme === 'dark' ? 0.72 : 0.0)};`,
      `  --dsw-alias-markdown-code-block-banner: ${alphaCss(mix(base, '#000000', 0.2), scheme === 'dark' ? 0.86 : 0)};`,
      `  --dsw-alias-markdown-code-segment-selected: ${opaque(0.6)};`,
      `  --dsw-alias-markdown-code-segment-unselected: ${layer(0.3)};`,
      `  --dsw-alias-markdown-inline-code: ${alphaCss(mix(base, '#000000', 0.25), scheme === 'dark' ? 0.85 : 0.0)};`,
      `  --dsw-alias-markdown-citation: ${opaque(0.5)};`,
      `  --dsw-alias-markdown-tag: ${opaque(0.5)};`,
      `  --dsw-alias-markdown-placeholder: ${opaque(0.5)};`,

      `  --dsw-alias-toast-bg: ${css(mix(surface, ink, 0.16))};`,
      `  --dsw-alias-tooltip-bg: ${css(mix(surface, ink, 0.16))};`,

      `  --dsw-specific-sidebar-fill: ${alphaCss(mix(surface, '#000000', 0.12), veil + 0.06)};`,
      `  --dsw-specific-sidebar-nav-item-hover: ${alphaCss(accent, 0.09)};`,
      `  --dsw-specific-sidebar-nav-item-active: ${alphaCss(accent, 0.14)};`,
      `  --dsw-specific-sidebar-nav-item-active-accent: ${alphaCss(accent, 0.24)};`,
      `  --dsw-specific-input-major: ${alphaCss(mix(surface, ink, 0.06), 0.9)};`,
      `  --dsw-specific-login-input: ${alphaCss(mix(surface, ink, 0.03), 0.82)};`,
      `  --dsw-specific-selector: ${opaque(0.6)};`,
      `  --dsw-specific-tip: ${opaque(0.55)};`,
      `  --dsw-specific-bubble: ${alphaCss(mix(surface, ink, 0.1), 0.88)};`,
      `  --dsw-specific-bubble-highlight: ${alphaCss(mix(surface, accent, 0.14), 0.9)};`,
      `  --dsw-specific-menu: var(--dsw-alias-bg-layer-3);`,
    ];

    const selector = scheme === 'dark' ? 'html body[data-ds-dark-theme]' : 'html body';
    // `body`'s background propagates to the canvas, so it can only carry the
    // opaque page colour: the media carrier paints above it. The translucent
    // scrim therefore rides the carrier's own ::after, which sits above the
    // wallpaper and below the app surfaces.
    out.push(`${selector} {\n${lines.join('\n')}\n  background-color: ${spec.base ?? '#ffffff'};\n}`);
  }

  const darkScrim = buildScrim(dark.scrim, 'rgba(5, 7, 20, 0.55)');
  if (darkScrim) {
    out.push(`html body[data-ds-dark-theme] #dsh-visual-media::after {\n${darkScrim}\n}`);
  }
  if (light.showWallpaper === true) {
    const lightScrim = buildScrim(light.scrim, 'rgba(255, 255, 255, 0.82)');
    if (lightScrim) {
      out.push(`html body[data-ds-light-wallpaper] #dsh-visual-media::after {\n${lightScrim}\n}`);
    }
  }

  return `/* ${name ?? preset.id} — generated from preset.json anchors */\n${out.join('\n\n')}\n`;
}

/** Scrim declarations for the media carrier's overlay. */
function buildScrim(scrim = {}, fallback) {
  const images = [...(scrim.wash ?? [])];
  if (scrim.vignette) {
    images.push(
      `radial-gradient(1200px 820px at 56% 46%, rgba(0,0,0,${scrim.vignette}), rgba(0,0,0,0) 74%)`,
    );
  }
  const lines = [`  background-color: ${scrim.base ?? fallback};`];
  if (images.length > 0) lines.push(`  background-image: ${images.join(', ')};`);
  return lines.join('\n');
}
