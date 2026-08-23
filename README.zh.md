# dsh-session-buddy（会话助手 @Shrbuz）

> **中文** · [English](./README.md)

面向 **DeepSeek Harness Web GUI（dsh web）** 的会话增强插件。
补上 dsh 官方缺失的两件事：**会话通知** + **会话内梯子目录**。

<div align="center">
  <b style="font-size:1.1em;">AI 回复完成 / AI 向你提问 / 需要确认执行时，标签页切走也能收到提醒；对话侧边以「梯子目录」快速定位历史提问。</b>
</div>

## ✨ 功能

### 会话通知
- **三类触发点**（各自独立开关）：
  - `reply`：AI 回复完成
  - `ask`：**仅当 AI 明确向你提问**（ask_user 工具）——普通回复结束不会误报"需要你回答"
  - `confirm`：需要确认执行命令（审批对话框）
- 回复完成时**只要这轮回复期间你离开过页面**（切走/切回检查）就提醒；全程看着则不打扰
- **系统原生 toast**（Windows PowerShell WinRT / macOS osascript / Linux notify-send，无需浏览器权限、不受 Chrome 横幅压制）+ **始终并行的红点 favicon 与 `(●)` 标题标记** + 可选提示音
- 通知标题为「工作区 · 会话标题」；同一轮回复去重只提醒一次

### 梯子目录（Ladder Outline）
- 对话右侧折叠目录，按时间列出每轮**用户提问**
- **未 hover**：圆角矩形细条（不占空间，不拥挤）——会话再多也清爽
- **hover**：整条梯子外壳宽度都是命中区（细条两侧空白也算），浮层 tooltip **跟随该条位置**显示序号 + 提问摘要 + 时间（不推移布局）
- **点击**细条 → 滚动定位到该提问并高亮闪烁；随会话滚动 **scrollspy 高亮当前项**
- **置底按钮**：梯子外层容器正下方一个**与梯子同风格的圆角方形容器**（边框线+圆角+背景），内为置底箭头，点击滚动到最新对话；已置底时隐藏；居中对齐梯子
- 目录自身可滚动，容纳几十上百条提问
- 会话为空 / 仅一个回合时不显示

## 🔌 技术要点

- **目录数据源**：官方 `sessions` 服务快照（`ctx.sessions` → 当前会话 `SessionFace.getSnapshot()`），**不依赖 DOM 渲染了多少**——dsh 会话历史是分页窗口（`PAGE_MESSAGES=50`，重启只加载尾部窗口），目录通过「`+更早` footer → `loadOlder()` 翻页」把被隐藏的历史提问按需载入
- **通知**：前端 DOM 观察（`MutationObserver` + 官方锚点 + **composer 停止按钮 `running` 信号**判定"回复真正完成"，不再依赖被节流的定时器）+ `visibilitychange` 触发重建（离开/回来立即捕获）
- **reply 去重与时机**：回复期间只要离开过（`hiddenDuringTurn`）就触发；`ask` 仅当 harness 标记 `pendingInteraction === 'question'`（AI 真提问）；`confirm` 为 `pendingInteraction === 'approval'` 或审批对话框出现
- 宿主端注册设置命名空间 + 一个 **loopback-only 的 `/api/session-buddy/toast` 路由**（客户端 POST，宿主跑系统原生 toast）
- 主题自适应：全部使用官方 `--dsw-alias-*` 设计令牌

## 📦 安装

```bash
# 从源码安装（开发）
dsh plugin --profile web add link:<this-dir>

# 或从 npm
dsh plugin --profile web add dsh-session-buddy
```

重启 dsh web 后，在 设置 → 插件 → 插件配置 找到「会话助手 @Shrbuz」卡片配置。

## 🛠 开发

```bash
pnpm install
pnpm build          # tsc -b && tsdown → lib/
pnpm typecheck
```

回归脚本：
```bash
node scripts/smoke-host.mjs        # host 逻辑冒烟（无 web）
node scripts/verify-live.mjs       # 活体验证（boot graph + client bundle）
node scripts/verify-approach2.mjs  # CDP：快照数据源 rungs + hasMore + footer 翻页
node scripts/verify-outline.mjs    # CDP：恢复会话→翻出隐藏历史→锚点/点击/闪烁
node scripts/verify-redesign.mjs   # CDP：竖向细条/收敛呼吸/跟随压缩/点击滚动
node scripts/verify-tooltip.mjs    # CDP：翻页后 rung 的 hover tooltip
node scripts/verify-bottom.mjs     # CDP：置底按钮 显示/滚动到底/置底隐藏
node scripts/verify-notify.mjs     # CDP：隐藏标签页时通知触发（可见时不打扰）
node scripts/cdp-probe.mjs         # CDP 探针：dump 真实会话 DOM 信号
node scripts/dump-outline.mjs      # dump 插件渲染的目录 DOM
node scripts/debug-hover.mjs       # 调试 hover 行为
node scripts/diag-session.mjs      # 诊断会话恢复状态
node scripts/diag-session-source.mjs # 诊断快照 rung 收集
node scripts/diag-tooltip.mjs      # 诊断 tooltip hover
node scripts/diag-left.mjs         # 诊断梯子 left 定位
node scripts/diag-restore.mjs      # 诊断多候选会话恢复
node scripts/probe-title.mjs       # 定位会话标题元素
node scripts/probe-sidebar.mjs     # dump 侧边栏结构
```
> 注：CDP 探针通过 boot-then-seed 恢复真实会话，用目录 footer 翻出被隐藏的历史
> 提问，并自带端口清理，可串行/重复运行而不互相干扰。

## 📜 License

Apache-2.0
