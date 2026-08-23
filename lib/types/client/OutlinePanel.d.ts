/**
 * dsh-session-buddy ladder outline panel — the in-conversation navigation
 * rail. Rungs come from the OFFICIAL sessions snapshot (see session-source.ts),
 * so the ladder stays complete even when dsh only renders the tail window.
 * Every user question turn renders as one thin vertical rounded bar; hovering
 * shows a floating tooltip (number + summary + time) with a subdued breathing
 * pulse; clicking scrolls the transcript to that turn and flashes it.
 *
 * The rail is always visible (no expand/collapse — unless there are fewer
 * than two turns, when it hides entirely). It anchors to the RIGHT EDGE of
 * the conversation scrollport and follows it, so when another plugin's right
 * sidebar expands and squeezes the conversation, the ladder moves with it.
 *
 * When older history exists outside the loaded window (`hasMore`), a footer
 * chip shows the remaining count; clicking a hidden rung asks the owner to
 * page the history window until that turn is loaded, then scrolls to it.
 *
 * @module dsh-session-buddy/client/OutlinePanel
 */
import { type ReactElement } from 'react';
import type { SourceRung } from './session-source.ts';
/** Props of the ladder outline. */
export interface OutlinePanelProps {
    /** The rungs (one per user question turn), oldest first (in-window). */
    rungs: SourceRung[];
    /** Whether older history exists outside the loaded window. */
    hasMore: boolean;
    /** Whether a page-up is currently in flight. */
    loadingOlder: boolean;
    /** Translation helper. */
    t: (key: string, params?: Record<string, unknown>) => string;
    /** Scroll the transcript to a rung's anchor (the owner ensures it is loaded). */
    scrollToKey: (key: string) => void;
    /** Called when the user clicks a rung that is not yet loaded (page it in). */
    onRevealHidden: (rung: SourceRung) => void;
    /** Called when the user clicks the "older" footer (page one more window). */
    onLoadOlder: () => void;
    /** Whether to show timestamps in the tooltip. */
    showTimestamps: boolean;
    /** Rail width in px (from settings). */
    railWidth: number;
}
/** The ladder outline (always-visible right rail, follows the scrollport). */
export declare function OutlinePanel(props: OutlinePanelProps): ReactElement;
//# sourceMappingURL=OutlinePanel.d.ts.map