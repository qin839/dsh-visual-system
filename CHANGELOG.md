# Changelog

# Changelog

## v1.4.0 — 2026-10-06

**测试与 CI**：仓库从"能跑"变成"有回归保护"。

- 新增 `test/`（19 个用例，只用 `node:test`，**零依赖**，96 ms 跑完）：
  - `palette.test.mjs` —— 颜色解析 / 混色夹取 / CSS 输出格式，以及 `buildStyles` 的确定性与 token 覆盖；
  - `presets.test.mjs` —— 每个 `preset.json` 的结构、锚点合法性、`asset` 形状（目录穿越防护契约），
    外加"每个预设都能真的生成出带 token 的 CSS"这个端到端 smoke test。
    **素材存在性只对随仓库发布的预设断言**：第三方素材不入库，干净克隆里不存在，
    对它们断言文件存在会造成"本地绿、CI 红"（第一版就踩了，已由 CI 抓到并改正）；
  - `client-bundle.test.mjs` —— 用假的 `__ModuleLoader__` **真的装载一遍客户端半边**，验证
    id / factory / `{ name, apply }` 契约。这一半坏了不会报错，只会静默失效，所以必须测；
  - `module.test.mjs` —— 宿主半边可导入，且 `package.json` 的对外契约
    （`dsh.bundle.patch` / `dsh.client`）没被改坏。
- 新增 `.github/workflows/ci.yml`：Node 20 / 22 双版本跑 `npm test`（无依赖，连 install 都省了）。
  替换掉原来的 `deno.yml` —— Deno 跑不了这些 `node:test` 用例，仓库里也没有 Deno 测试，
  留着只会让每次 push 挂红叉。
- **修掉一个真实缺陷**：`parseColor('rgb(1,2)')` 以前会返回 `{ r: 1, g: 2, b: undefined }` 而不报错，
  让 `undefined` 一路渗进生成的 CSS。现在缺分量或非数字一律抛错，并有用例锁住这个行为。
- `package.json` 加 `scripts.test`，`files` 纳入 `test/` —— 装下来的包也能自己 `npm test`。
## v1.3.0 — 2026-10-06

**一条命令安装**：本包现在声明 `dsh.bundle.patch`，装进 profile 后会被 dsh 的 reconcile
自动并进 `dsh.profile.bundles` 并生效，不再需要手改 `cordis.patch.yml`。

- 新增 `cordis.patch.yml`（insert `id: visual-system` / `name: dsh-visual-system`）。
- `package.json` 增加 `dsh.bundle.patch`，`files` 补上 `cordis.patch.yml` 与 `CHANGELOG.md`。
- README 的安装章节改写：「方式一：一条命令」（`dsh plugin --profile <web|desktop> add …`，
  含桌面端要用桌面端自带 CLI 的说明）与「方式二：手工挂载（out-of-tree / 调试用）」，
  并写明 `file://` 挂载享受不到运行时解析这个限制。

## v1.2.0 — 2026-10-05

客户端半边：主题在**桌面端**也生效了。

- 新增 `lib/client.js`：手写的客户端 bundle（官方闭包工厂格式
  `window.__ModuleLoader__.load({id, factory})`），不需要构建工具。
  它在渲染进程里贴 `<style>` 与 `#dsh-visual-media`，每 4 秒轮询状态。
- `index.js` 新增 `GET /dsh-visual/state`，一次返回「当前预设 + 生成好的 CSS + 素材地址」。
- `package.json` 增加 `exports["./client"]` 与 `dsh.client` 声明。
- 为什么需要它：桌面端窗口加载的是打包页面 `dsh-app://app/`，只消费注入表里的
  `script` / 全局变量行，**不吃 `style` / `html` 行**（实测：探针预设在桌面端
  重载后毫无变化）。客户端插件跑在渲染进程里，web 与桌面端行为一致。
- 实测：品红探针预设在不重启、不重载的情况下几秒内让桌面端整屏变色，撤销后自动恢复。

## v1.1.0 — 2026-10-05

- 新增 `tools/make-demo-wallpaper.ps1`：纯 `System.Drawing` 生成极光演示壁纸
  （光斑先在 1/8 分辨率绘制，再高质量放大 → 柔和光带而非椭圆边界）。
- `demo` 预设换成极光，颜色锚点与之对齐；`veil` 降到 0.34 让壁纸透出来。
- `preview/` 加入真实截图（主界面 + 切换页），只含自绘 demo 预设。
- README 补充支持范围与踩坑记录。

## v1.0.0 — 2026-10-05

首个公开版本。

- 宿主侧插件：`webserver/index-inject` 注入 + 素材/配置/切换器三个路由。
- `lib/palette.mjs` 把十来个颜色锚点展开成完整的 `--dsw-*` token 集。
- 支持静态图、视频与 CSS 微动（sway / drift），尊重 `prefers-reduced-motion`。
- 素材路由支持 Range 与 ETag；含目录穿越防护。
- `tools/we-pkg.mjs` / `we-tex.mjs`：Wallpaper Engine `.pkg` / `.tex` 提取工具
  （含 DXT1/3/5 与 RGBA 解码器）。
- 只随仓库发布一张自绘演示壁纸；第三方素材不入库。