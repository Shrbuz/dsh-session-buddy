/**
 * Session buddy settings card — the `session-buddy` entry inside the web
 * settings surface (设置 → 插件 → 插件配置). Follows the official plugin-card
 * pattern: a collapsible header (name + description + chevron) that expands
 * into the form. Every control writes straight back through the bound settings
 * scope, so changes apply live — no save/discard footer needed.
 * @module dsh-session-buddy/client/SessionBuddySettingsCard
 */
import { type ReactElement } from 'react';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { SessionBuddyUiSettings } from './settings.ts';
/** Props of the session-buddy settings card (injected through the slot entry). */
export interface SessionBuddySettingsCardProps {
    /** The bound `session-buddy` settings scope (reads + writes). */
    scope: SettingsScope<SessionBuddyUiSettings>;
    /** Translation helper. */
    buddyT: (key: string) => string;
}
/** The session-buddy plugin card in 设置 → 插件 → 插件配置. */
export declare function SessionBuddySettingsCard(props: SessionBuddySettingsCardProps): ReactElement | null;
//# sourceMappingURL=SessionBuddySettingsCard.d.ts.map