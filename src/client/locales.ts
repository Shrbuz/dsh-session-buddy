/**
 * dsh-session-buddy locale dictionaries (zh/en) plus the tiny self-contained
 * translation helper. The buddy UI mounts as a floating surface, so it has no
 * framework locale seat and resolves its copy from the document language —
 * the same approach the pet and task-board floating surfaces use.
 * @module dsh-session-buddy/client/locales
 */

/** Dictionary namespace this package registers (informational). */
export const NS = 'session-buddy'

/** Chinese copy. */
export const zh = {
  'buddy.outline.title': '会话目录',
  'buddy.outline.expand': '展开会话目录',
  'buddy.outline.collapse': '收起会话目录',
  'buddy.outline.more': '更早',
  'buddy.outline.bottom': '滚动到最新对话',
  'buddy.outline.empty': '对话太少，暂不显示目录',
  'buddy.notify.reply': 'AI 回复完成',
  'buddy.notify.ask': '需要你回答',
  'buddy.notify.confirm': '需要你确认执行',
  'buddy.notify.title': 'dsh 会话',
  'buddy.notify.click': '点击回到会话',
  'buddy.settings.title': '会话助手 @Shrbuz',
  'buddy.settings.description': '回复完成/待回答/待确认时通知，并提供会话内梯子目录。',
  'buddy.settings.expand': '展开设置: 会话助手 @Shrbuz',
  'buddy.settings.collapse': '收起设置: 会话助手 @Shrbuz',
  'buddy.settings.enabled': '启用会话助手',
  'buddy.settings.notify': '通知触发',
  'buddy.settings.notifyReply': 'AI 回复完成时通知',
  'buddy.settings.notifyAsk': '需要你回答时通知',
  'buddy.settings.notifyConfirm': '需要确认执行命令时通知',
  'buddy.settings.sound': '通知提示音',
  'buddy.settings.outline': '梯子目录',
  'buddy.settings.view': '对话显示',
  'buddy.settings.outlineWidth': '细条长度',
  'buddy.settings.widthSmall': '短',
  'buddy.settings.widthMedium': '中',
  'buddy.settings.widthLarge': '长',
  'buddy.settings.showTimestamps': '提示中显示时间戳',
  'buddy.settings.collapseTools': '折叠工具操作',
  'buddy.settings.collapseToolsDesc': '每轮回复结束后，把该轮执行的工具操作折叠成一行「共执行 X 步操作」，点击可展开查看详情。',
  'buddy.settings.foldThink': '折叠思考块',
  'buddy.settings.foldThinkDesc': '把该轮内多个「Think」思考块与穿插其中的文字小结、上下文注入合并成一行「共 N 次思考」（该轮最终总结保留），点击展开可查看各思考摘要。',
  'buddy.settings.foldLongUser': '折叠长提问',
  'buddy.settings.foldLongUserDesc': '把过长的用户提问（如整段粘贴的日志）默认折叠到前 6 行，点击可展开全文。',
  'buddy.collapse.steps': '共执行 {n} 步操作',
  'buddy.collapse.show': '展开该轮执行的 {n} 步操作',
  'buddy.collapse.hide': '收起该轮执行的 {n} 步操作',
  'buddy.think.count': '共 {n} 次思考',
  'buddy.think.show': '展开该轮 {n} 次思考',
  'buddy.think.hide': '收起该轮 {n} 次思考',
  'buddy.user.expand': '展开全文',
  'buddy.user.collapse': '收起',
  'buddy.settings.version': '版本与升级',
  'buddy.settings.versionCurrent': '当前版本 {version}',
  'buddy.settings.versionLatest': '最新版本 {version}',
  'buddy.settings.versionUnknown': '无法检查更新（离线或网络不可达）',
  'buddy.settings.checkUpdate': '检查更新',
  'buddy.settings.checking': '检查中…',
  'buddy.settings.upToDate': '已是最新版本',
  'buddy.settings.upgrade': '升级到 {version}',
  'buddy.settings.upgrading': '升级中…（完成后请重启 dsh）',
  'buddy.settings.upgradeDone': '升级完成，请重启 dsh web 生效',
  'buddy.settings.upgradeFailed': '升级失败：{error}',
  'buddy.settings.upgradeConfirm': '将运行 dsh plugin add {spec}，升级完成后需要重启 dsh web。是否继续？',
} as const

/** English copy. */
export const en = {
  'buddy.outline.title': 'Outline',
  'buddy.outline.expand': 'Expand outline',
  'buddy.outline.collapse': 'Collapse outline',
  'buddy.outline.more': 'older',
  'buddy.outline.bottom': 'Scroll to the latest message',
  'buddy.outline.empty': 'Not enough turns yet for an outline',
  'buddy.notify.reply': 'AI finished replying',
  'buddy.notify.ask': 'Your input is needed',
  'buddy.notify.confirm': 'Command approval needed',
  'buddy.notify.title': 'dsh session',
  'buddy.notify.click': 'Click to return to the session',
  'buddy.settings.title': 'Session Buddy @Shrbuz',
  'buddy.settings.description': 'Get notified on reply/ask/approval, plus an in-conversation ladder outline.',
  'buddy.settings.expand': 'Expand settings: Session Buddy @Shrbuz',
  'buddy.settings.collapse': 'Collapse settings: Session Buddy @Shrbuz',
  'buddy.settings.enabled': 'Enable Session Buddy',
  'buddy.settings.notify': 'Notifications',
  'buddy.settings.notifyReply': 'Notify when the AI finishes replying',
  'buddy.settings.notifyAsk': 'Notify when your input is needed',
  'buddy.settings.notifyConfirm': 'Notify when command approval is needed',
  'buddy.settings.sound': 'Notification sound',
  'buddy.settings.outline': 'Ladder outline',
  'buddy.settings.view': 'Conversation view',
  'buddy.settings.outlineWidth': 'Rung length',
  'buddy.settings.widthSmall': 'Short',
  'buddy.settings.widthMedium': 'Medium',
  'buddy.settings.widthLarge': 'Long',
  'buddy.settings.showTimestamps': 'Show timestamps in tooltips',
  'buddy.settings.collapseTools': 'Collapse tool runs',
  'buddy.settings.collapseToolsDesc': 'After each reply finishes, fold that turn\'s tool calls into a single "共执行 X 步操作" row; click to expand the details.',
  'buddy.settings.foldThink': 'Fold think blocks',
  'buddy.settings.foldThinkDesc': 'Fold this turn\'s multiple "Think" reasoning blocks — together with the text "小结" notes and any context injections between them — into a single "共 N 次思考" row (the turn\'s final summary stays visible); click to browse each summary.',
  'buddy.settings.foldLongUser': 'Collapse long questions',
  'buddy.settings.foldLongUserDesc': 'Clamp over-long user questions (e.g. a pasted log) to the first 6 lines by default; click to expand the full text.',
  'buddy.collapse.steps': '{n} steps executed',
  'buddy.collapse.show': 'Show the {n} steps executed in this turn',
  'buddy.collapse.hide': 'Hide the {n} steps executed in this turn',
  'buddy.think.count': '{n} think blocks',
  'buddy.think.show': 'Show the {n} think blocks in this turn',
  'buddy.think.hide': 'Hide the {n} think blocks in this turn',
  'buddy.user.expand': 'Show full question',
  'buddy.user.collapse': 'Collapse',
  'buddy.settings.version': 'Version & upgrades',
  'buddy.settings.versionCurrent': 'Current {version}',
  'buddy.settings.versionLatest': 'Latest {version}',
  'buddy.settings.versionUnknown': 'Could not check for updates (offline or unreachable)',
  'buddy.settings.checkUpdate': 'Check for updates',
  'buddy.settings.checking': 'Checking…',
  'buddy.settings.upToDate': 'Up to date',
  'buddy.settings.upgrade': 'Upgrade to {version}',
  'buddy.settings.upgrading': 'Upgrading… (restart dsh when done)',
  'buddy.settings.upgradeDone': 'Upgrade complete — restart dsh web to apply',
  'buddy.settings.upgradeFailed': 'Upgrade failed: {error}',
  'buddy.settings.upgradeConfirm': 'This runs dsh plugin add {spec}; restart dsh web after it finishes. Continue?',
} as const

/** Key union for this namespace. */
export type BuddyKey = keyof typeof zh

/** Active dictionary, picked by the document language at call time. */
export function dictionary(): Record<BuddyKey, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? en : zh
}

/** Translate a key with optional `{name}` template params; a missing key degrades to the key itself. */
export function t(key: string, params?: Record<string, unknown>): string {
  let text: string = (dictionary() as Record<string, string>)[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
