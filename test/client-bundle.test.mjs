// 客户端半边（浏览器 bundle）的装载契约测试。
//
// 这一半是整个插件最容易"静默坏掉"的地方：格式一旦不对，桌面端不会报错，
// 只是主题再也不出现。所以这里用一个假的 __ModuleLoader__ 把它真的装一遍。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(repoRoot, 'lib', 'client.js'), 'utf8');

test('client.js 通过 __ModuleLoader__ 注册，id 与包名一致', () => {
  let registered = null;
  const fakeWindow = {
    __ModuleLoader__: {
      load(module) {
        registered = module;
      },
    },
  };

  // 文件本身只依赖 window，所以可以直接在受控作用域里求值
  new Function('window', source)(fakeWindow);

  assert.ok(registered, 'client.js 没有调用 window.__ModuleLoader__.load()');
  assert.equal(registered.id, 'dsh-visual-system');
  assert.equal(typeof registered.factory, 'function', 'factory 必须是函数');
});

test('工厂返回 { name, apply }，且不依赖任何平台模块', () => {
  let registered = null;
  new Function('window', source)({
    __ModuleLoader__: { load: (module) => { registered = module; } },
  });

  const plugin = registered.factory((name) => {
    throw new Error(`本插件声明 inject: []，不应该 require 平台模块：${name}`);
  });

  assert.equal(plugin.name, 'dsh-visual-system');
  assert.equal(typeof plugin.apply, 'function');
});

test('client.js 不引用 Node 内置模块（它跑在渲染进程里）', () => {
  for (const pattern of [/\brequire\(['"]node:/, /from ['"]node:/, /\bprocess\.env\b/]) {
    assert.ok(!pattern.test(source), `客户端 bundle 里出现了 Node 专有用法：${pattern}`);
  }
});
