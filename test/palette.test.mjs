// 颜色工具与样式生成器的单元测试。
// 只依赖 node:test —— 本项目零运行时依赖，测试也不引入任何依赖。
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseColor, mix, alpha, css, mixCss, alphaCss, buildStyles } from '../lib/palette.mjs';

/* --------------------------------------------------------------- parseColor -- */

test('parseColor：#rgb / #rrggbb / #rrggbbaa', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#4fd1c5'), { r: 79, g: 209, b: 197, a: 1 });
  assert.deepEqual(parseColor('#4FD1C5'), { r: 79, g: 209, b: 197, a: 1 });
  const withAlpha = parseColor('#4fd1c580');
  assert.deepEqual({ ...withAlpha, a: undefined }, { r: 79, g: 209, b: 197, a: undefined });
  assert.ok(Math.abs(withAlpha.a - 128 / 255) < 1e-9, 'aa 应换算成 0..1 的透明度');
});

test('parseColor：rgb() / rgba() 与已解析对象', () => {
  assert.deepEqual(parseColor('rgb(1 2 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseColor('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
  // 已解析的分量可以直接回喂（mix 的结果能再参与运算）
  assert.deepEqual(parseColor({ r: 9, g: 8, b: 7, a: 0.25 }), { r: 9, g: 8, b: 7, a: 0.25 });
  assert.deepEqual(parseColor({ r: 9, g: 8, b: 7 }), { r: 9, g: 8, b: 7, a: 1 });
});

test('parseColor：畸形输入必须报错，不能静默产出 undefined', () => {
  for (const bad of ['', 'nope', '#12', '#12345', 'rgb(1,2)', 'rgba(1,2,3,x)', 'rgb()']) {
    assert.throws(() => parseColor(bad), /colour/i, `应拒绝：${JSON.stringify(bad)}`);
  }
});

/* --------------------------------------------------------------------- mix -- */

test('mix：端点是原色，越界要夹取到 0..255', () => {
  assert.deepEqual(mix('#000', '#fff', 0), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(mix('#000', '#fff', 1), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(mix('#000', '#fff', 0.5).r, 128);
  // t 超出 0..1 时是线性外推，但分量必须被夹回 0..255（不能出现负值或 >255）
  for (const result of [mix('#000', '#fff', 2), mix('#fff', '#000', -1), mix('#000', '#fff', 1.5)]) {
    for (const channel of ['r', 'g', 'b']) {
      assert.ok(
        result[channel] >= 0 && result[channel] <= 255 && Number.isInteger(result[channel]),
        `分量必须是 0..255 的整数，实际 ${channel}=${result[channel]}`,
      );
    }
  }
});

test('alpha / css / mixCss / alphaCss 的输出格式', () => {
  assert.deepEqual(alpha('#4fd1c5', 0.2), { r: 79, g: 209, b: 197, a: 0.2 });
  assert.equal(css({ r: 1, g: 2, b: 3, a: 1 }), 'rgb(1 2 3)', '不透明时用空格语法、不带 alpha');
  assert.equal(css({ r: 1, g: 2, b: 3, a: 0.5 }), 'rgba(1, 2, 3, 0.5)');
  assert.equal(alphaCss('#4fd1c5', 0.2), 'rgba(79, 209, 197, 0.2)');
  assert.equal(mixCss('#000', '#fff', 0.5), 'rgb(128 128 128)');
});

/* -------------------------------------------------------------- buildStyles -- */

const minimalPreset = {
  id: 'unit',
  name: '单元测试',
  dark: {
    base: '#05081c',
    surface: '#111a33',
    ink: '#eef2ff',
    accent: '#4fd1c5',
    accent2: '#c084fc',
    business: '#f5b544',
    onAccent: '#04211f',
    warn: '#f0b429',
    danger: '#ef5f7a',
    success: '#4ade80',
    veil: 0.34,
  },
  light: {
    base: '#ffffff',
    surface: '#f6f8fd',
    ink: '#0a0f22',
    accent: '#0f766e',
    accent2: '#7c3aed',
    business: '#a16207',
    onAccent: '#ffffff',
    veil: 0.97,
  },
};

test('buildStyles：输出确定、带注释头、token 齐全', () => {
  const first = buildStyles(minimalPreset);
  const second = buildStyles(minimalPreset);
  assert.equal(first, second, '同样的预设必须生成同样的 CSS');
  assert.match(first, /^\/\* 单元测试 /);

  const tokens = new Set(first.match(/--dsw-[a-z0-9-]+/g) ?? []);
  assert.ok(tokens.size > 50, `token 太少：${tokens.size}`);
  for (const token of ['--dsw-alias-bg-base', '--dsw-static-neutral-bluish-500']) {
    assert.ok(tokens.has(token), `缺少关键 token：${token}`);
  }
});

test('buildStyles：缺少 name 时用 id 作注释', () => {
  const { name, ...withoutName } = minimalPreset;
  assert.match(buildStyles(withoutName), /^\/\* unit /);
});
