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
- **宿主事件驱动 + 跨标签页**：触发点来自会话事件日志（回合完成 = reply、ask_user 工具 = ask、审批请求 = confirm），经 SSE 推送给所有打开的标签页；每条事件**最多弹一次**系统 toast——已通知台账在 toast 路由处做跨标签页/跨刷新去重；SSE 断连时回退到前端 DOM 观察
- **系统原生 toast**（Windows PowerShell WinRT / macOS osascript / Linux notify-send，无需浏览器权限、不受 Chrome 横幅压制）+ 红点 favicon 与 `(●)` 标题标记 + 可选提示音
- 通知标题为「工作区 · 会话标题」；每轮回复只提醒一次

### 梯子目录
- 对话右侧可折叠目录，按时间列出每轮**用户提问**
- 未 hover 时是细圆条（无文字、不拥挤），会话再多也清爽
- 悬停梯级弹出浮层 tooltip（序号 + 提问摘要 + 时间）；点击梯级滚动定位到该提问并高亮闪烁
- scrollspy 高亮当前所在提问；未在底部时显示「跳到最新」按钮
- 被隐藏的早期历史通过「`+更早`」footer 按需翻页载入
- 会话少于两个回合时自动隐藏
- 目录**锚定在对话界面右缘并始终跟随**：侧边栏展开/收起挤压对话宽度时，目录随之移动（事件驱动，空闲零开销）

### 应用内升级
- 设置卡片显示当前版本，可检查 npm 官方源上的最新版本
- 一键通过官方 `dsh plugin add` CLI 升级（完成后需重启 dsh web 生效）

### 会话清理
- **损坏会话**（历史无法通过 dsh 自身的加载校验，例如某条 `tool/result` 被写入空工具调用 id、dsh 读不回来）会在会话行显示一个**警告小标识**
- 会话行的三点菜单新增「**删除会话**」：确认后该会话数据被**永久删除、释放磁盘**——dsh 本身只有分叉/归档（归档不删文件）
- 当前正在打开的会话不显示删除项，host 侧也会拒绝删除 live 会话

### 工具操作折叠
- 每轮回复结束后，该轮执行的工具操作（Pwsh / Think / Write / Grep / Edit / Read …）自动折叠成一行 **「共执行 X 步操作」**，总结内容直接可见
- 点击该行可展开查看每一步的具体卡片（展开/收起状态按会话记忆）
- 只有真正结束的回合才会折叠（进行中的回合完整显示）；可在设置卡片关闭该功能，恢复始终展示所有工具调用

### 过程折叠
- **折叠思考块 + 过程小结** —— 每轮结束后，该轮反复出现的「Think」思考块、穿插其中的文字「小结」与上下文注入，合并为一行 **「共 N 次思考」**（该轮最终总结保留可见）；点击可展开查看
- **折叠过长的提问** —— 提问文字超过 6 行时（例如整段日志粘进提示词），默认只显示前 6 行并带底部渐隐，下方提供 **「展开全文」** 条；点击展开全文
- 每个折叠面在设置卡片都有独立开关（折叠工具操作 / 折叠思考块 / 折叠长提问），展开/收起状态按会话记忆

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
| 通知 | 宿主监听会话事件日志，把 reply/ask/confirm 触发经 SSE（`/api/session-buddy/events`）推送给每个标签页；已通知台账在 loopback-only 的 `/api/session-buddy/toast` 路由处做跨标签页/跨刷新去重（每条事件最多一个系统 toast）。SSE 断连时回退到前端 DOM 观察（`MutationObserver` + 官方锚点 + composer 停止按钮运行信号） |
| 目录 | 梯级来自官方 `sessions` 服务快照（与渲染的 DOM 无关）；dsh 会话历史是分页窗口，目录按需翻入被隐藏的历史，并通过官方锚点 key 与 DOM 对齐 |
| 升级 | 宿主读取 `https://registry.npmjs.org/dsh-session-buddy/latest`（离线时静默失败），实际升级由官方 `dsh plugin` CLI 执行 |
| 会话清理 | 宿主经 `sessionPersistence` 列会话、复刻 dsh 自身的加载期消息校验来标记损坏，删除时通过持久化服务 `locate()` 解析会话目录（不信任用户输入路径）；前端标记损坏行并注入菜单删除项 |
| 操作折叠 | 纯前端 DOM 遍历官方锚点行：`tool-call` 行按包裹它的 `turn-tail` 行分组（tail 只在 `turn/end` 后发布，因此恰好在该回合结束时折叠），每组折叠成一行「共执行 X 步操作」，展开/收起状态按会话记忆 |
| 过程折叠 | 同一套官方标记遍历把该轮的 `assistant-step` 行（思考块 + 文字「小结」+ 上下文注入）按 `turn-tail` 分组为「共 N 次思考」条，最终总结保持可见；过长的 `user` 行被限制到 6 行并带展开条。两者在官方标记消失时静默降级 |
| 目录定位 | 目录在窗口 resize、容器/祖先 resize 与 DOM 变更时重新读取对话滚动区右缘（合并为每帧一次），因此始终随对话宽度移动 |

界面主题自适应，全部使用官方 `--dsw-alias-*` 设计令牌。

## 限制

- 系统原生 toast 依赖系统通知设置；红点 favicon / 标题标记始终作为并行兜底
- 「每条事件最多一次系统 toast」的去重只作用于宿主事件驱动链路；该链路不可用时（旧宿主、或 SSE 断连）回退的 DOM 监听仍按标签页各自通知，同一事件下多个隐藏标签页可能各弹一次 toast
- 会话删除是**永久**操作（无回收站）；「删除会话」只在能识别出会话菜单 DOM 时注入，识别不到会静默降级
- 所有折叠功能都依赖官方 `data-chat-flow-kind` / `data-chat-anchor-key` 标记（提问折叠额外依赖 `_text_` 类）；若未来 dsh 移除这些标记，插件会静默停止折叠（绝不隐藏无法可靠归属到已结束回合的行）
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
