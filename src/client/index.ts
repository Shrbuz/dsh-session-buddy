/**
 * dsh-session-buddy browser half — mounts the ladder outline + notification
 * logic as a global floating surface (host-global like the pet: it has no
 * session dimension of its own, it follows whatever session is open). It
 * reads its switches live from the `session-buddy` settings scope, drives
 * notifications from the official conversation DOM (session listener), and
 * renders the outline from the OFFICIAL sessions snapshot so it stays
 * complete even when dsh only renders the tail window.
 *
 * @module dsh-session-buddy/client
 */

import { workspaceTitleOf, type ClientContext, type ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Slot type augmentation: declares `settings.plugin.item` so the settings
// card can be registered under the `session-buddy` namespace key.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OutlinePanel } from './OutlinePanel.tsx'
import { SessionBuddySettingsCard } from './SessionBuddySettingsCard.tsx'
import { sessionBuddySettingsSpec, type SessionBuddyUiSettings } from './settings.ts'
import { t } from './locales.ts'
import { BUDDY_CSS } from './styles.ts'
import { startSessionListener } from './listener.ts'
import { notify } from './notifier.ts'
import { anchorRowByKey } from './dom.ts'
import { createSessionSource, alignRungKeys, type SourceRung } from './session-source.ts'
import { startBuddyEventStream, wasHiddenSince, type BuddyTriggerEvent } from './sse.ts'
import { startSessionDeleteManager } from './session-delete.ts'
import type { SessionEvent, TriggerKind } from './events.ts'

/** Required services (slots + settingsScope drive the settings card; sessions
 * feeds the ladder outline; the rest is pure DOM observation). */
export const inject = ['slots', 'settingsScope', 'sessions']

/** Notification copy per trigger kind. */
const TRIGGER_TEXT: Record<TriggerKind, string> = {
  reply: 'buddy.notify.reply',
  ask: 'buddy.notify.ask',
  confirm: 'buddy.notify.confirm',
}

/** Map an event kind to the settings switch that gates it. */
function switchOf(kind: TriggerKind): keyof SessionBuddyUiSettings {
  return kind === 'reply' ? 'notifyReply' : kind === 'ask' ? 'notifyAsk' : 'notifyConfirm'
}

/** The current session's workspace display name (derived from its cwd), or
 * undefined when the session has no workspace / cwd. The workspace is NOT in
 * the header breadcrumb for a top-level session, so it is read from the
 * sessions service instead. Never throws: a failure here must not break the
 * notification dispatch (that would kill the red-dot/beep/toast together). */
function currentWorkspaceName(sessions: ISessions): string | undefined {
  try {
    const list = sessions?.list?.getSnapshot()
    const id = list?.current
    if (id === undefined) return undefined
    const summary = list?.byId?.[id]
    const cwd = summary?.cwd
    if (cwd === undefined || cwd === '') return undefined
    if (typeof workspaceTitleOf !== 'function') return undefined
    const name = workspaceTitleOf(cwd)
    return name === '' ? undefined : name
  } catch {
    return undefined
  }
}

/** The harness's current pending-interaction marker for the open session
 * (`'question'` → the AI is asking you something; `'approval'` → command
 * approval pending). Never throws. */
function readPendingInteraction(sessions: ISessions): 'approval' | 'plan-review' | 'question' | undefined {
  try {
    const list = sessions?.list?.getSnapshot()
    const id = list?.current
    if (id === undefined) return undefined
    return list?.byId?.[id]?.pendingInteraction
  } catch {
    return undefined
  }
}

/**
 * Client plugin body: inject the styles, bind the settings scope, mount the
 * ladder outline (backed by the sessions snapshot), and start the session
 * listener that drives notifications.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Styles are injected by the module loader's style-tag discipline. The
  // tag's data-plugin MUST equal the loader module id (dsh-session-buddy) or
  // the loader cannot claim the styles for unload cleanup.
  const styleTag = document.createElement('style')
  styleTag.dataset.plugin = 'dsh-session-buddy'
  styleTag.dataset.pluginCss = 'dsh-session-buddy/styles'
  styleTag.textContent = BUDDY_CSS
  document.head.appendChild(styleTag)
  let styleRemoved = false
  ctx.effect(() => () => {
    if (styleRemoved) return
    styleRemoved = true
    styleTag.remove()
  }, 'session-buddy: styles')

  // The `session-buddy` settings scope mirrors the Host section; the outline
  // reads its UI preferences live and the settings card writes back through it.
  const settingsScope = ctx.settingsScope.bind<SessionBuddyUiSettings>(sessionBuddySettingsSpec)

  // Plugin configuration card (设置 → 插件 → 插件配置). Registered only while
  // the settings section exists; the slot owner dispatches it by the
  // `session-buddy` namespace key.
  ctx.effect(() => ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register(
      {
        name: 'settings.plugin.item',
        key: 'session-buddy',
        inject: () => ({ scope: settingsScope, buddyT: t }),
      },
      SessionBuddySettingsCard,
    )
  }), 'session-buddy: settings card')

  // ---- Ladder outline ----
  let outlineMounted = false
  let root: ReturnType<typeof createRoot> | undefined
  let container: HTMLDivElement | undefined
  let source: ReturnType<typeof createSessionSource> | undefined
  let latestRungs: SourceRung[] = []
  let latestHasMore = false
  let latestLoadingOlder = false

  /** Scroll the transcript to an anchor key (click on a loaded rung). */
  const scrollToKey = (key: string): void => {
    const anchor = anchorRowByKey(document, key)
    if (anchor === null) return
    anchor.scrollIntoView({ block: 'start', behavior: 'smooth' })
    anchor.classList.add('dsb-outline-flash')
    setTimeout(() => anchor.classList.remove('dsb-outline-flash'), 1200)
  }

  /** Reveal a hidden rung: page the history window until its turn is loaded,
   * then scroll to it. */
  const revealHidden = async (rung: SourceRung): Promise<void> => {
    if (source === undefined) return
    await source.loadOlderUntilSeq(rung.seq)
    // After paging, the rung should have a DOM anchor; scroll to it.
    scrollToKey(rung.key)
  }

  const renderOutline = (): void => {
    if (!outlineMounted || root === undefined) return
    const settings = settingsScope.getSnapshot().value
    // Align rung keys with the rendered transcript (the DOM catches up with
    // the snapshot slightly later, so align here at render time).
    alignRungKeys(latestRungs)
    root.render(createElement(OutlinePanel, {
      rungs: latestRungs,
      hasMore: latestHasMore,
      loadingOlder: latestLoadingOlder,
      t,
      scrollToKey,
      onRevealHidden: (rung) => { void revealHidden(rung) },
      onLoadOlder: () => { void source?.loadOlderOnce() },
      showTimestamps: settings?.showTimestamps ?? true,
      railWidth: settings?.outlineWidth ?? 18,
    }))
  }

  const mountOutline = (): void => {
    if (outlineMounted) return
    outlineMounted = true
    container = document.createElement('div')
    container.dataset.dshBuddyRoot = ''
    container.dataset.dshPlugin = 'session-buddy'
    container.className = 'dsb-root'
    document.body.appendChild(container)
    root = createRoot(container)

    // The outline data source: reads rungs from the official sessions snapshot.
    source = createSessionSource(ctx.sessions as unknown as ISessions, {
      onRungs: (rungs) => {
        latestRungs = rungs
        renderOutline()
      },
      onStatus: (status) => {
        latestHasMore = status.hasMore
        latestLoadingOlder = status.loadingOlder
        renderOutline()
      },
    })
    renderOutline()
  }

  const unmountOutline = (): void => {
    if (!outlineMounted) return
    source?.dispose()
    source = undefined
    root?.unmount()
    root = undefined
    container?.remove()
    container = undefined
    outlineMounted = false
  }

  // ---- Settings-driven behavior ----
  // Read the live settings whenever they change: enable/disable the outline
  // (master switch) and forward events only when the relevant trigger switch
  // is on.
  let listenerDispose: (() => void) | undefined
  let sseDispose: (() => void) | undefined
  let sessionDeleteDispose: (() => void) | undefined
  /** True while the host event stream is connected — then it is the ONLY
   *  notifier (DOM observation is gated) so a reply never double-fires from
   *  two sources in the same tab. While the stream is down the DOM listener
   *  takes over as the fallback. */
  let sseConnected = false

  /** The session id currently open in the GUI (the one the user is looking
   *  at). Host events for other sessions are ignored — same as the DOM path,
   *  which only ever watches the open session. */
  const currentSessionId = (): string | undefined => {
    try {
      const list = (ctx.sessions as unknown as ISessions)?.list?.getSnapshot()
      return list?.current
    } catch {
      return undefined
    }
  }

  /** Shared notification dispatch for BOTH the DOM classifier and the host
   *  event stream: honors the per-kind switch, composes title/body, and hands
   *  off to notifier with an optional cross-tab claim key. */
  const dispatch = (event: SessionEvent, claimKey?: string): void => {
    const current = settingsScope.getSnapshot().value
    if (current === undefined || !current.enabled) return
    if (!current[switchOf(event.kind)]) return
    const sessionTitle = event.title ?? t('buddy.notify.title')
    const workspace = currentWorkspaceName(ctx.sessions as unknown as ISessions)
    const title = workspace !== undefined && workspace !== sessionTitle
      ? `${workspace} · ${sessionTitle}`
      : sessionTitle
    const summary = event.summary === '' ? '' : event.summary ?? ''
    const body = `${t(TRIGGER_TEXT[event.kind])}${summary === '' ? '' : ' · ' + summary}`.trim()
    void notify({
      title,
      body,
      sound: current.sound,
      tag: event.kind,
      claimKey,
      anchorKey: event.anchorKey,
      onClick: (key) => { if (key !== undefined) scrollToKey(key) },
      forceHidden: event.kind === 'reply' && event.wasHidden === true,
    })
  }

  const syncEnabled = (): void => {
    const settings = settingsScope.getSnapshot().value
    const enabled = settings?.enabled ?? true
    if (enabled && !outlineMounted) mountOutline()
    if (!enabled && outlineMounted) unmountOutline()

    // The listener runs once; the switches are checked per-event.
    if (listenerDispose === undefined) {
      listenerDispose = startSessionListener({
        readPendingInteraction: () => readPendingInteraction(ctx.sessions as unknown as ISessions),
        onEvent: (event: SessionEvent) => {
          // While the host event stream is up it is authoritative (cross-tab,
          // claim-deduped). The DOM classifier keeps running so its dedupe
          // state stays current, but we only dispatch through it when the
          // stream is down — otherwise one reply would fire twice.
          if (sseConnected) return
          dispatch(event)
        },
      })
    }

    // Host-driven event stream (reply/ask/confirm over SSE). Primary notifier;
    // falls back to DOM observation while disconnected.
    if (sseDispose === undefined) {
      sseDispose = startBuddyEventStream({
        onStatus: (connected) => { sseConnected = connected },
        onTrigger: (trigger: BuddyTriggerEvent) => {
          const current = settingsScope.getSnapshot().value
          if (current === undefined || !current.enabled) return
          // Only the open session notifies (matches the DOM path's scope).
          if (trigger.sessionId !== currentSessionId()) return
          dispatch(
            {
              kind: trigger.kind,
              summary: trigger.summary ?? '',
              title: undefined,
              // Host tells us when the reply's turn started; reconstruct
              // "the user stepped away during this reply" from the tab's own
              // visibility history. Unknown start time → fall back to the
              // plain hidden-tab gate (no surprise toast).
              wasHidden: trigger.kind === 'reply' && trigger.turnStartedAt !== undefined
                ? wasHiddenSince(trigger.turnStartedAt)
                : false,
            },
            // Cross-tab dedup key: session + host-assigned episode id + kind.
            `${trigger.sessionId}:${trigger.dedupKey}:${trigger.kind}`,
          )
        },
      })
    }

    // Session health: mark corrupt (unloadable) sessions and inject the
    // "删除会话" item into the session row's three-dot menu so you can cleanly
    // delete a corrupt session's data (frees disk space).
    if (sessionDeleteDispose === undefined) {
      sessionDeleteDispose = startSessionDeleteManager({
        currentSessionId,
        // After a delete, ask the dsh session service to re-list from the host
        // so the removed session's row disappears without a manual refresh.
        refreshSessions: () => {
          try {
            const sessions = ctx.sessions as unknown as { refresh?: () => unknown }
            if (typeof sessions.refresh === 'function') sessions.refresh()
          } catch { /* best-effort */ }
        },
      })
    }
  }

  const syncAll = (): void => {
    syncEnabled()
    renderOutline()
  }

  const settingsUnsubscribe = settingsScope.subscribe(() => { syncAll() })
  // Watch the DOM so the outline re-renders as turns stream in / paging lands.
  const domObserver = new MutationObserver(() => { renderOutline() })
  domObserver.observe(document.body, { childList: true, subtree: true, characterData: true })

  // Initial mount.
  syncAll()

  ctx.effect(() => () => {
    settingsUnsubscribe()
    domObserver.disconnect()
    listenerDispose?.()
    sseDispose?.()
    sessionDeleteDispose?.()
    unmountOutline()
  }, 'session-buddy: ui')
}
