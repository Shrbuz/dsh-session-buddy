/**
 * dsh-session-buddy locale dictionaries (zh/en) plus the tiny self-contained
 * translation helper. The buddy UI mounts as a floating surface, so it has no
 * framework locale seat and resolves its copy from the document language —
 * the same approach the pet and task-board floating surfaces use.
 * @module dsh-session-buddy/client/locales
 */
/** Dictionary namespace this package registers (informational). */
export const NS = 'session-buddy';
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
    'buddy.settings.outlineWidth': '细条长度',
    'buddy.settings.widthSmall': '短',
    'buddy.settings.widthMedium': '中',
    'buddy.settings.widthLarge': '长',
    'buddy.settings.showTimestamps': '提示中显示时间戳',
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
};
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
    'buddy.settings.outlineWidth': 'Rung length',
    'buddy.settings.widthSmall': 'Short',
    'buddy.settings.widthMedium': 'Medium',
    'buddy.settings.widthLarge': 'Long',
    'buddy.settings.showTimestamps': 'Show timestamps in tooltips',
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
};
/** Active dictionary, picked by the document language at call time. */
export function dictionary() {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh';
    return lang.toLowerCase().startsWith('en') ? en : zh;
}
/** Translate a key with optional `{name}` template params; a missing key degrades to the key itself. */
export function t(key, params) {
    let text = dictionary()[key] ?? key;
    if (params !== undefined) {
        for (const [name, value] of Object.entries(params)) {
            text = text.replaceAll(`{${name}}`, String(value));
        }
    }
    return text;
}
