/**
 * dsh-session-buddy locale dictionaries (zh/en) plus the tiny self-contained
 * translation helper. The buddy UI mounts as a floating surface, so it has no
 * framework locale seat and resolves its copy from the document language —
 * the same approach the pet and task-board floating surfaces use.
 * @module dsh-session-buddy/client/locales
 */
/** Dictionary namespace this package registers (informational). */
export declare const NS = "session-buddy";
/** Chinese copy. */
export declare const zh: {
    readonly 'buddy.outline.title': "会话目录";
    readonly 'buddy.outline.expand': "展开会话目录";
    readonly 'buddy.outline.collapse': "收起会话目录";
    readonly 'buddy.outline.more': "更早";
    readonly 'buddy.outline.bottom': "滚动到最新对话";
    readonly 'buddy.outline.empty': "对话太少，暂不显示目录";
    readonly 'buddy.notify.reply': "AI 回复完成";
    readonly 'buddy.notify.ask': "需要你回答";
    readonly 'buddy.notify.confirm': "需要你确认执行";
    readonly 'buddy.notify.title': "dsh 会话";
    readonly 'buddy.notify.click': "点击回到会话";
    readonly 'buddy.settings.title': "会话助手 @Shrbuz";
    readonly 'buddy.settings.description': "回复完成/待回答/待确认时通知，并提供会话内梯子目录。";
    readonly 'buddy.settings.expand': "展开设置: 会话助手 @Shrbuz";
    readonly 'buddy.settings.collapse': "收起设置: 会话助手 @Shrbuz";
    readonly 'buddy.settings.enabled': "启用会话助手";
    readonly 'buddy.settings.notify': "通知触发";
    readonly 'buddy.settings.notifyReply': "AI 回复完成时通知";
    readonly 'buddy.settings.notifyAsk': "需要你回答时通知";
    readonly 'buddy.settings.notifyConfirm': "需要确认执行命令时通知";
    readonly 'buddy.settings.sound': "通知提示音";
    readonly 'buddy.settings.outline': "梯子目录";
    readonly 'buddy.settings.outlineWidth': "细条长度";
    readonly 'buddy.settings.widthSmall': "短";
    readonly 'buddy.settings.widthMedium': "中";
    readonly 'buddy.settings.widthLarge': "长";
    readonly 'buddy.settings.showTimestamps': "提示中显示时间戳";
    readonly 'buddy.settings.version': "版本与升级";
    readonly 'buddy.settings.versionCurrent': "当前版本 {version}";
    readonly 'buddy.settings.versionLatest': "最新版本 {version}";
    readonly 'buddy.settings.versionUnknown': "无法检查更新（离线或网络不可达）";
    readonly 'buddy.settings.checkUpdate': "检查更新";
    readonly 'buddy.settings.checking': "检查中…";
    readonly 'buddy.settings.upToDate': "已是最新版本";
    readonly 'buddy.settings.upgrade': "升级到 {version}";
    readonly 'buddy.settings.upgrading': "升级中…（完成后请重启 dsh）";
    readonly 'buddy.settings.upgradeDone': "升级完成，请重启 dsh web 生效";
    readonly 'buddy.settings.upgradeFailed': "升级失败：{error}";
    readonly 'buddy.settings.upgradeConfirm': "将运行 dsh plugin add {spec}，升级完成后需要重启 dsh web。是否继续？";
};
/** English copy. */
export declare const en: {
    readonly 'buddy.outline.title': "Outline";
    readonly 'buddy.outline.expand': "Expand outline";
    readonly 'buddy.outline.collapse': "Collapse outline";
    readonly 'buddy.outline.more': "older";
    readonly 'buddy.outline.bottom': "Scroll to the latest message";
    readonly 'buddy.outline.empty': "Not enough turns yet for an outline";
    readonly 'buddy.notify.reply': "AI finished replying";
    readonly 'buddy.notify.ask': "Your input is needed";
    readonly 'buddy.notify.confirm': "Command approval needed";
    readonly 'buddy.notify.title': "dsh session";
    readonly 'buddy.notify.click': "Click to return to the session";
    readonly 'buddy.settings.title': "Session Buddy @Shrbuz";
    readonly 'buddy.settings.description': "Get notified on reply/ask/approval, plus an in-conversation ladder outline.";
    readonly 'buddy.settings.expand': "Expand settings: Session Buddy @Shrbuz";
    readonly 'buddy.settings.collapse': "Collapse settings: Session Buddy @Shrbuz";
    readonly 'buddy.settings.enabled': "Enable Session Buddy";
    readonly 'buddy.settings.notify': "Notifications";
    readonly 'buddy.settings.notifyReply': "Notify when the AI finishes replying";
    readonly 'buddy.settings.notifyAsk': "Notify when your input is needed";
    readonly 'buddy.settings.notifyConfirm': "Notify when command approval is needed";
    readonly 'buddy.settings.sound': "Notification sound";
    readonly 'buddy.settings.outline': "Ladder outline";
    readonly 'buddy.settings.outlineWidth': "Rung length";
    readonly 'buddy.settings.widthSmall': "Short";
    readonly 'buddy.settings.widthMedium': "Medium";
    readonly 'buddy.settings.widthLarge': "Long";
    readonly 'buddy.settings.showTimestamps': "Show timestamps in tooltips";
    readonly 'buddy.settings.version': "Version & upgrades";
    readonly 'buddy.settings.versionCurrent': "Current {version}";
    readonly 'buddy.settings.versionLatest': "Latest {version}";
    readonly 'buddy.settings.versionUnknown': "Could not check for updates (offline or unreachable)";
    readonly 'buddy.settings.checkUpdate': "Check for updates";
    readonly 'buddy.settings.checking': "Checking…";
    readonly 'buddy.settings.upToDate': "Up to date";
    readonly 'buddy.settings.upgrade': "Upgrade to {version}";
    readonly 'buddy.settings.upgrading': "Upgrading… (restart dsh when done)";
    readonly 'buddy.settings.upgradeDone': "Upgrade complete — restart dsh web to apply";
    readonly 'buddy.settings.upgradeFailed': "Upgrade failed: {error}";
    readonly 'buddy.settings.upgradeConfirm': "This runs dsh plugin add {spec}; restart dsh web after it finishes. Continue?";
};
/** Key union for this namespace. */
export type BuddyKey = keyof typeof zh;
/** Active dictionary, picked by the document language at call time. */
export declare function dictionary(): Record<BuddyKey, string>;
/** Translate a key with optional `{name}` template params; a missing key degrades to the key itself. */
export declare function t(key: string, params?: Record<string, unknown>): string;
//# sourceMappingURL=locales.d.ts.map