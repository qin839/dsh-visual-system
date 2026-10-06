// 预设完整性测试：把"预设写坏了"这类问题挡在提交之前。
//
// 这里同时覆盖三件事：
//   1. 每个 preset.json 的结构与颜色锚点合法（锚点能被 parseColor 解析）；
//   2. 随仓库发布的预设，素材文件真的在（第三方素材不在仓库里，允许缺）；
//   3. 每个真实预设都能生成出带 --dsw-* token 的 CSS —— 端到端 smoke test。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseColor, buildStyles } from '../lib/palette.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const presetsDir = join(repoRoot, 'presets');

/** 两种配色方案都必须给的锚点。 */
const REQUIRED_ANCHORS = ['base', 'surface', 'ink', 'accent', 'accent2', 'business', 'onAccent'];

/** 素材随仓库发布的预设（其余预设引用的是用户本地的第三方资源）。 */
const SHIPPED = new Set(['demo']);

const presetDirs = readdirSync(presetsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test('presets/ 下至少有一个预设', () => {
  assert.ok(presetDirs.length > 0, 'presets 目录是空的');
});

for (const dir of presetDirs) {
  test(`预设 ${dir}：结构、锚点、素材、样式生成`, () => {
    const file = join(presetsDir, dir, 'preset.json');
    assert.ok(existsSync(file), `${dir}/preset.json 不存在`);

    const preset = JSON.parse(readFileSync(file, 'utf8'));

    assert.equal(preset.id, dir, 'id 必须与目录名一致，否则 /dsh-visual/ 切换器会对不上');
    assert.equal(typeof preset.title, 'string');
    assert.ok(preset.title.length > 0, 'title 不能为空');
    assert.ok(['image', 'video'].includes(preset.kind), `kind 只能是 image/video，实际是 ${preset.kind}`);

    // asset 只能是"一个文件名"，可以带 assets/ 前缀：
    //   - 随仓库发布的预设：assets/<文件>
    //   - 复用用户本地原文件的预设（配 assetPath）：裸文件名，如 "红.mp4"
    // 但绝不允许路径分隔符或 ..（目录穿越防护的契约）
    assert.match(preset.asset, /^(assets\/)?[^/\\]+$/, `asset 形状不对：${preset.asset}`);
    assert.ok(!preset.asset.includes('..'), `asset 里不能出现 ..：${preset.asset}`);
    if (!preset.asset.startsWith('assets/')) {
      assert.equal(
        typeof preset.assetPath,
        'string',
        `${dir} 的 asset 不是仓库自带素材（${preset.asset}），那就必须给 assetPath 指出处`,
      );
    }

    for (const scheme of ['dark', 'light']) {
      const block = preset[scheme];
      assert.ok(block && typeof block === 'object', `${scheme} 配色块缺失`);

      for (const key of REQUIRED_ANCHORS) {
        assert.ok(key in block, `${scheme}.${key} 缺失`);
      }

      // 任何字符串型取值都必须是合法颜色
      for (const [key, value] of Object.entries(block)) {
        if (typeof value === 'string') {
          assert.doesNotThrow(() => parseColor(value), `${scheme}.${key} 不是合法颜色：${value}`);
        }
      }

      if ('veil' in block) {
        assert.equal(typeof block.veil, 'number', `${scheme}.veil 必须是数字`);
        assert.ok(block.veil >= 0 && block.veil <= 1, `${scheme}.veil 必须在 0..1：${block.veil}`);
      }
    }

    // 素材：仓库自带的必须在；第三方素材要么在本地，要么显式声明 assetPath
    const assetPath = join(presetsDir, dir, preset.asset);
    if (SHIPPED.has(dir)) {
      assert.ok(existsSync(assetPath), `${dir} 声称随仓库发布，但素材不在：${preset.asset}`);
    } else {
      assert.ok(
        existsSync(assetPath) || typeof preset.assetPath === 'string',
        `${dir} 既没有本地素材，也没有 assetPath（用户私有素材的出处）`,
      );
    }

    // 端到端：真实预设必须能生成样式
    const css = buildStyles({ ...preset, name: preset.title });
    assert.ok(css.includes('--dsw-'), `${dir} 生成的 CSS 里没有任何 token`);
    assert.ok(css.length > 1000, `${dir} 生成的 CSS 太短（${css.length} 字符），像是提前返回了`);
  });
}
