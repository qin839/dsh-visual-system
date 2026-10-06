// 宿主半边（Node）的冒烟测试：能导入、导出对的符号、对外契约没被改坏。
// 真正的路由行为需要 DSH 运行时（webServer 服务），不在这里假装测。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { apply, VISUAL_ROUTE } from '../index.js';

test('宿主半边可导入并导出 apply()', () => {
  assert.equal(typeof apply, 'function');
});

test('导出的路由前缀形状正确', () => {
  assert.equal(typeof VISUAL_ROUTE, 'string');
  assert.ok(VISUAL_ROUTE.startsWith('/'), `路由必须以 / 开头：${VISUAL_ROUTE}`);
  assert.ok(!VISUAL_ROUTE.endsWith('/'), `路由不该以 / 结尾：${VISUAL_ROUTE}`);
});

test('package.json 的对外契约没被改坏', () => {
  // 这两个字段决定了 dsh 能不能装上并启用这个插件：
  //   dsh.bundle.patch -> reconcile 会把它并进 profile 的 bundles
  //   dsh.client       -> 客户端半边会被发现并加载
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'dsh-visual-system');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.equal(pkg.type, 'module');
});
