# dsh-visual-system

**壁纸驱动视觉系统** —— 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 用。
一份 `preset.json`（十来个颜色锚点 + 一个媒体文件）就能换一整套配色和背景，支持静态图、
**视频**和 CSS 微动，并自带一个网页版切换器。

*A wallpaper-driven visual system for the DeepSeek Harness Web GUI: one preset file
swaps the entire colour system and the background, with image/video media, subtle CSS
motion, and a built-in switcher page.*

![主界面：demo 预设（深色）](preview/01-app-demo.png)

![切换页](preview/02-switcher.png)

> ### ⚠️ 素材说明（先读这个）
> 本仓库**只包含代码、预设定义，以及一张自绘的演示壁纸**（`presets/demo/`）。
> `presets/*/assets/` 下的第三方素材——Steam 创意工坊场景封面、系统壁纸等——**不入库**，
> 版权不属于本项目，也不在 MIT 许可证覆盖范围内。
> 仓库里的 `executioner` / `emblem` / `desktop` / `legion` 只保留 `preset.json` 定义
> （颜色锚点与取景参数），**运行需要你自己放入素材**。
> *Third-party artwork is deliberately not shipped. Only code, preset definitions and one
> original demo wallpaper are included.*

## 支持范围（重要，先说结论）

| 运行环境 | 插件加载 | 视觉注入（主题 + 壁纸） |
| --- | --- | --- |
| Web profile（`dsh web`） | ✅ | ✅ 已验证 |
| 桌面端（Electron，`desktop` profile） | ✅ 路由可用 | ❌ **暂不生效** |

桌面端上的实测结论（2026-10-05，v0.2.0-rc.2）：

- 把插件挂进 `$DSH_HOME/profiles/desktop/cordis.patch.yml` 后，**宿主侧完全正常**：
  `/dsh-visual/config` 与 `/dsh-visual/asset/**` 都能正常返回，宿主插件热加载/热卸载都生效。
- 但**界面不会变色、壁纸也不出现**。原因是本插件靠 `webserver/index-inject` 往宿主渲染的
  `index.html` 里塞 `<style>` / `<body>` 片段；而桌面端窗口加载的是打包页面
  （`dsh-app://app/`），它只消费注入表里的"全局变量"那类条目
  （桌面端自己用它注入 `__DSH_CONNECTION_RECOVERY__`、启动注入、快捷键配置），
  不吃 `style` / `html` 行。用刺眼探针预设（配色改成品红 + `showWallpaper`）做过对照实验，
  确认不是主题模式或缓存问题。

**路线图**：把"应用主题"这一步从宿主注入改成**客户端插件**（`dsh.client` 导出，
在渲染进程里直接写 CSS 自定义属性 + 挂壁纸元素）。素材路由继续沿用宿主侧。
这样 web 与桌面端就能用同一套实现——欢迎 PR。

## 特性

- **一份 preset.json = 一套主题**：十来个颜色锚点，由 `lib/palette.mjs` 展开成 DSH 设计系统
  完整的 `--dsw-*` token 集（色阶、语义别名、表面 token、状态色、滚动条），不用手写一百多个变量
- 支持静态图、视频（`mp4` / `webm`）、CSS 微动（`sway` 呼吸式、`drift` 缓慢推移）
- 尊重 `prefers-reduced-motion`
- 自带切换页面 `/dsh-visual/`，点图即切
- 素材路由支持 **Range**（视频可拖动进度）与 **ETag**（304 复用）
- 宿主侧插件，**没有浏览器端 bundle**，只用两个官方扩展点接入
- 素材路径做了目录穿越防护；预设目录外的文件只能通过 `preset.json` 里写死的 `assetPath` 引用

## 安装

插件是 out-of-tree 的宿主插件，挂在某个 profile 的 patch 层里。

1. 把本仓库放到任意目录，例如 `<你放插件的地方>\dsh-visual-system`。
2. 编辑该 profile 的 patch 文件（Web GUI 用 `web` profile）：

   `$DSH_HOME/profiles/web/cordis.patch.yml`

   ```yaml
   - insert:
       - id: visual-system
         name: 'file:///C:/你的路径/dsh-visual-system/index.js?v=1'
   ```

   > Windows 路径写成 `file:///C:/...`（正斜杠）。`?v=N` 是模块缓存破坏参数：
   > 改 `index.js` / `lib/*.mjs` 之后把它递增，Node 才会重新加载。
   > **存盘即生效**（loader 会热应用 patch），不用重启服务。

3. 刷新页面即生效。**改 `preset.json` 或换素材只需要刷新页面**。

卸载：删掉那段 `- insert:` 再刷新页面，就回到原生配色（插件目录留着不影响任何东西）。

## 仓库里的预设

| id | 名称 | 媒体 | 素材是否随仓库 |
| --- | --- | --- | --- |
| `demo` | 演示 · 极光 | `assets/aurora.png` 1920×1080，缓慢推移 | ✅ 本项目自绘，可直接用 |
| `executioner` | 处刑者 · ゆらぎ | `assets/cover.png` 3840×2160 + 呼吸式微动 | ❌ 需自备 |
| `emblem` | 国徽 | `assets/emblem.mp4` 3840×2400 30s 视频（可配 `poster`） | ❌ 需自备 |
| `desktop` | 唤起工农千百万 | 视频，通过 `assetPath` 直接引用本机已有文件 | ❌ 需自备 |
| `legion` | LEGION 蓝龙 | `assets/wallpaper.jpg` 3840×2400 + 缓慢推移 | ❌ 需自备 |

把素材放进对应的 `presets/<id>/assets/` 目录即可；`assetPath` 那种写法用于
"素材已经在别处、不想复制一份"的情况（只接受 `preset.json` 里写死的文件名，
URL 里传的路径不会碰到磁盘）。

## 切换

浏览器打开 **`http://<你的 DSH Web 地址>/dsh-visual/`**，点图即切，刷新页面生效。
等价于直接改 `config.json`：

```json
{ "active": "demo" }
```

其它接口：

```text
GET  /dsh-visual/config                  # 当前预设 + 预设清单
POST /dsh-visual/config  {"active":"…"}  # 切换
GET  /dsh-visual/asset/<id>/<path>       # 预设素材（支持 Range，视频可拖动）
```

## 加一个预设

1. 建 `presets/<id>/`，放 `preset.json` 和媒体文件。
2. 锚点写进 `dark` / `light` 两套。最少只要这几个：

```jsonc
{
  "id": "mywall",
  "title": "显示名",
  "note": "一句话来源说明",
  "kind": "image",              // 或 "video"
  "asset": "assets/cover.png",
  "assetPath": "D:\\...\\x.mp4", // 可选：素材在别处（只允许 preset 里写死的名字）
  "focus": "center 40%",         // object-position
  "motion": { "kind": "drift", "duration": 70, "shift": 1.2 },  // 或 "sway"
  "dark":  { "base": "#070a20", "surface": "#151b3b", "ink": "#eef1fb",
             "accent": "#f2c14e", "accent2": "#5ad2e6", "business": "#f2c14e",
             "veil": 0.5,
             "scrim": { "base": "rgba(5,7,20,0.66)", "wash": ["radial-gradient(...)"], "vignette": 0.46 } },
  "light": { "base": "#ffffff", "surface": "#f8f9fe", "ink": "#090b1f",
             "accent": "#c98a12", "accent2": "#0f6d88", "veil": 0.97 }
}
```

`veil` 控制表面透明度（越大越不透明），`scrim` 是压在图上面的那层纱。

## 它是怎么接进 GUI 的

宿主侧插件，没有浏览器端 bundle，只用两个官方扩展点：

- `webserver/index-inject` —— 每次渲染 `index.html` 时推入一行 `<style>`（生成的调色板 +
  载体 CSS）和一行 body HTML（`#dsh-visual-media` 载体元素），所以外观在 shell 挂载前就已就位；
- `ctx.webServer.register()` —— 提供素材、切换器、配置读写三个路由。

图层顺序（这是关键）：`body` 的背景色会被传播成画布底色，所以**纱（scrim）不能放在 body 上**，
否则会跑到壁纸下面。现在的顺序是：

```text
body 背景色(画布) → #dsh-visual-media 媒体 → ::after 纱/晕影 → 应用表面(半透明 token) → 内容
```

`#dsh-visual-media` 位于 `z-index:-1`，`::after` 承载 `scrim`，读长文本时靠 `vignette`
在阅读栏下压出一片墨色。浅色模式默认不显示壁纸（用纸面配色），预设里加
`"light": { "showWallpaper": true }` 可以打开。

## 工具

### 生成演示壁纸

仓库自带的那张极光是**代码画出来的**，可复现、无版权问题：

```powershell
pwsh -NoProfile -File tools/make-demo-wallpaper.ps1
pwsh -NoProfile -File tools/make-demo-wallpaper.ps1 -Out out.png -Width 2560 -Height 1440
```

做法是把光斑先画在 1/8 分辨率的小图上，再用高质量双三次插值放大回原尺寸，
得到柔和的光带而不是能看出边界的椭圆；星星和底部压暗仍画在全分辨率上。

### Wallpaper Engine 素材提取

`tools/we-pkg.mjs` / `tools/we-tex.mjs` 用于从你自己机器上的 Wallpaper Engine 场景里
取出原始美术（`presets/executioner` 的 3840×2160 封面就是这么来的）：

```powershell
# 列出 scene.pkg 里最大的文件
node tools/we-pkg.mjs list "…\431960\3223543799\scene.pkg"
# 抽出某个 .tex
node tools/we-pkg.mjs extract "…\scene.pkg" "materials/封面.tex" cover.tex
# 新版 WE 把 PNG/JPEG 直接封在 TEXB 块里，直接捞出即可
node tools/we-tex.mjs probe  cover.tex
node tools/we-tex.mjs carve  cover.tex cover.png
```

`we-tex.mjs` 另外带一套 DXT1/3/5 与 RGBA 解码器，供老版本（裸 mip 链）的 `.tex` 用。
这两个脚本与 Wallpaper Engine 官方无关，只是读取你自己已有的文件。

## 目录结构

```text
index.js                     宿主插件本体：注入 + 三个路由
lib/palette.mjs              颜色锚点 → 完整 --dsw-* token 集
presets/<id>/                一个目录一个预设（preset.json + assets/）
preview/                     README 用的截图（均为自绘 demo 预设，版权干净）
tools/make-demo-wallpaper.ps1  生成演示壁纸
tools/we-pkg.mjs, we-tex.mjs   Wallpaper Engine .pkg / .tex 提取工具
config.json                  当前选中的预设（每台机器不同，已 gitignore）
```

## 环境要求

- 一个能起 Web GUI 的 DeepSeek Harness profile（本项目在 `web` profile 上开发）。
- Node.js 22+（宿主插件跑在 DSH 进程里）。
- 桌面端支持见上面的「支持范围」。

## License

MIT，见 [LICENSE](LICENSE)。**只覆盖代码与预设定义**，不覆盖任何第三方素材。
