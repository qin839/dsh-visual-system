# Changelog

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