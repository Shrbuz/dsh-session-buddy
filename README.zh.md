# dsh-session-buddy（会话助手 @Shrbuz）

中文 | [English](./README.md)

为 **DeepSeek Harness Web GUI（dsh web）** 提供**会话通知** + **会话内梯子目录**。AI 回复完成 / 向你提问 / 需要你确认执行时，标签页切走也能收到提醒；对话侧边以紧凑的梯子目录快速定位历史提问。

<sub><span style="opacity:.6">由 dsh + Deepseek-V4-Flash 独立完成</span></sub>

## 功能

### 会话通知
- **三类触发点**（各自独立开关）：
  - `reply`：AI 回复完成
  - `ask`：AI 明确向你提问（ask_user 工具）——普通回复结束不会误报
  - `confirm`：有待确认的命令审批（审批对话框）
- 回复完成时只要**这轮回复期间你离开过页面**就提醒；全程看着则不打扰
- **系统原生 toast**（Windows PowerShell WinRT / macOS osascript / Linux notify-send，无需浏览器权限、不受 Chrome 横幅压制）+ 红点 favicon 与 `(●)` 标题标记 + 可选提示音
- 通知标题为「工作区 · 会话标题」；每轮回复只提醒一次

### 梯子目录
- 对话右侧可折叠目录，按时间列出每轮**用户提问**
- 未 hover 时是细圆条（无文字、不拥挤），会话再多也清爽
- 悬停梯级弹出浮层 tooltip（序号 + 提问摘要 + 时间）；点击梯级滚动定位到该提问并高亮闪烁
- scrollspy 高亮当前所在提问；未在底部时显示「跳到最新」按钮
- 被隐藏的早期历史通过「`+更早`」footer 按需翻页载入
- 会话少于两个回合时自动隐藏

### 应用内升级
- 设置卡片显示当前版本，可检查 npm 官方源上的最新版本
- 一键通过官方 `dsh plugin add` CLI 升级（完成后需重启 dsh web 生效）

## 安装

### 从 npm

```sh
dsh plugin --profile web add dsh-session-buddy
```

### 从本地目录（开发）

```sh
dsh plugin --profile web add link:<this-dir>
```

安装完成后**重启** `dsh web`，在 设置 → 插件 → 插件配置 →「会话助手 @Shrbuz」中配置。

## 升级

两种升级到新版本的方式：

### 命令行

```sh
dsh plugin --profile web update dsh-session-buddy
```

插件以语义化版本范围（`^0.x.y`）安装，`dsh plugin update` 会自动升到最新的兼容版本。要强制指定版本：

```sh
dsh plugin --profile web add dsh-session-buddy@<版本号>
```

### 应用内

打开插件设置卡片 →「版本与升级」→「检查更新」，发现新版本后点「升级」。

无论哪种方式，升级后请**重启** `dsh web` 以加载新版本。

## 使用

### 通知
- 在插件设置卡片中开关三类触发点、提示音与总开关
- AI 回复期间切走标签页，完成后会收到系统原生 toast；AI 提问或需要审批时，标签页隐藏也会收到提醒

### 梯子目录
- 悬停右侧目录预览各提问；点击梯级跳转定位
- 用「`+更早`」footer 翻出被隐藏的历史；「跳到最新」按钮一键滚到底部
- 梯级长度、tooltip 是否显示时间戳可在设置卡片中调整
- 梯级很多超出目录高度时，滚动条自动隐藏，顶部/底部出现渐隐光影提示上下还有更多；「`+更早`」固定在底部、始终可达

### 升级
- 见上方「升级」一节——通过 `dsh plugin update` 或在设置卡片（「版本与升级」）操作

## 工作原理

| 层 | 实现 |
|---|---|
| 通知 | 前端 DOM 观察（`MutationObserver` + 官方锚点 + composer 停止按钮运行信号判定"回复真正完成"）+ `visibilitychange` 重建；宿主通过 loopback-only 的 `/api/session-buddy/toast` 路由弹系统原生 toast |
| 目录 | 梯级来自官方 `sessions` 服务快照（与渲染的 DOM 无关）；dsh 会话历史是分页窗口，目录按需翻入被隐藏的历史，并通过官方锚点 key 与 DOM 对齐 |
| 升级 | 宿主读取 `https://registry.npmjs.org/dsh-session-buddy/latest`（离线时静默失败），实际升级由官方 `dsh plugin` CLI 执行 |

界面主题自适应，全部使用官方 `--dsw-alias-*` 设计令牌。

## 限制

- 系统原生 toast 依赖系统通知设置；红点 favicon / 标题标记始终作为并行兜底
- 升级需要重启 `dsh web` 后生效

## 开发

```sh
pnpm install
pnpm build          # tsc -b && tsdown → lib/
pnpm typecheck
```

回归脚本：

```sh
node scripts/smoke-host.mjs        # host 逻辑冒烟（无 web）
node scripts/verify-live.mjs       # 活体验证（boot graph + bundle + 路由）
node scripts/verify-outline.mjs    # CDP：恢复会话→翻出隐藏历史→梯级点击/闪烁
node scripts/verify-tooltip.mjs    # CDP：翻页后梯级的 hover tooltip
node scripts/verify-notify.mjs     # CDP：隐藏标签页时通知触发（可见时不打扰）
```

## License

Apache-2.0
