# 更新日志

本文件记录项目的所有重要变更。

## 0.1.0 - 2026-08-23

**dsh-session-buddy** 首个正式版本 —— 为 DeepSeek Harness Web GUI 提供会话通知 + 会话内梯子目录。

### 新功能

- **会话通知** —— 三种可独立开关的触发类型：
  - `reply`：AI 回复完成时通知，即使标签页切走也照常弹
  - `ask`：仅当 AI 显式向你提问时（ask-user 工具）才通知，普通回复结束不会误报"需要你回答"
  - `confirm`：有待确认的命令审批时通知（审批弹窗）
- **"离开过"即通知** —— 该轮回复期间只要你有任何时刻切走（切走再切回查看）就会通知；全程盯着看则保持静默
- **系统原生 toast**（Windows PowerShell WinRT / macOS osascript / Linux notify-send —— 无需浏览器权限、不被 Chrome 压制），另加红点 favicon + `(●)` 标题徽标 + 可选提示音；标题为"工作区 · 会话标题"，每轮回复去重只弹一次
- **梯子目录** —— 右侧可折叠栏，按顺序列出每个用户提问回合：
  - 空闲时：细圆条（无文字、不拥挤）；悬停时：整条栏宽都是命中区，锚定梯级弹出悬浮提示（编号 + 提问摘要 + 时间）
  - 点击梯级滚动到对应回合并闪烁高亮；滚动跟随（scrollspy）高亮当前回合
  - "跳到最新"按钮沿用栏壳样式，已在底部时自动隐藏
  - 长会话内部滚动；少于 2 个回合时隐藏

### 技术说明

- 目录数据取自官方 `sessions` 服务快照（`ctx.sessions` → `SessionFace.getSnapshot()`），与渲染 DOM 无关，通过 `+older` 页脚按需翻入隐藏历史
- 通知由 DOM 观察 + composer 停止按钮运行信号 + `visibilitychange` 重建驱动（不依赖节流定时器）
- 仅 loopback 的 `/api/session-buddy/toast` 宿主路由负责弹系统 toast；样式全部使用官方 `--dsw-alias-*` 设计令牌
