/**
 * dsh-session-buddy session data source (approach 2) — reads the ladder
 * rungs from the OFFICIAL `sessions` client service instead of scanning the
 * DOM. This is what makes the outline complete even when dsh only renders the
 * tail window (PAGE_MESSAGES = 50): the conversation snapshot carries every
 * in-window node regardless of DOM presence, and `loadOlder()` pages the
 * history window backwards so clicking a hidden question can load the page
 * that contains it.
 *
 * Data model (verified in @deepseek-ai/dsh-client-runtime):
 * - `ctx.sessions.list.getSnapshot().current` → current session id
 * - `ctx.sessions.scope(id)` → scoped ctx; `ctx.sessions.sessionOf(ctx)` → SessionFace
 * - `SessionFace.getSnapshot()` → ConversationSnapshot
 * - `snapshot.chat.order` → ordered node keys (stable, also DOM anchor keys)
 * - `snapshot.chat.nodes.get(key)` → ChatConversationViewNode { key, kind, anchorSeq }
 * - kind `user` / `steering` = a real user question turn
 * - `SessionFace.loadOlder()` → page the history window backwards (50 msg/page)
 * - `SessionFace.subscribe(fn)` → notify on any window/snapshot change
 *
 * @module dsh-session-buddy/client/session-source
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionFace } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { OutlineRung } from './dom.ts'

/** The user-turn node kinds that count as outline rungs. */
const USER_KINDS = new Set(['user', 'steering'])

/** Data-source status surfaced to the UI. */
export interface SessionSourceStatus {
  /** Total user turns currently visible in the collected rungs. */
  count: number
  /** Whether older history still exists outside the loaded window. */
  hasMore: boolean
  /** Whether a page-up (loadOlder) is currently in flight. */
  loadingOlder: boolean
  /** Set when a session is open but its window has not settled yet. */
  pending: boolean
}

/** One collected rung plus the node facts needed for paging/scroll. */
export interface SourceRung extends OutlineRung {
  /** The node's anchorSeq (for "which page contains it" decisions). */
  seq: number
}

/** Callbacks the owner wires. */
export interface SessionSourceHandlers {
  /** Fired whenever the collected rungs change (initial, page-up, session switch). */
  onRungs: (rungs: SourceRung[]) => void
  /** Fired when status changes (hasMore / loadingOlder / pending). */
  onStatus: (status: SessionSourceStatus) => void
  /** Optional: the current session id (for debugging / tests). */
  onSessionId?: (id: string | undefined) => void
}

/** Collect rungs from the current conversation snapshot (in-window user turns).
 * The snapshot's `nodes` (raw Session-event projection) carries the user turns
 * (kind 'user' / 'steering') with content + time. DOM anchor keys are NOT on
 * the snapshot nodes — they are aligned later via `alignRungKeys` once the
 * transcript has rendered (see below). Until then each rung keeps a stable
 * seq-based placeholder key. */
export function collectRungsFromSnapshot(snapshot: ConversationSnapshot): SourceRung[] {
  const nodes = snapshot.nodes ?? []
  const rungs: SourceRung[] = []
  for (const node of nodes) {
    if (!USER_KINDS.has(node.kind)) continue
    const content = (node as { content?: readonly { text?: string }[] }).content
    const text = content
      ?.map((b) => b.text ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const summary = text !== undefined && text !== '' ? (text.length > 60 ? text.slice(0, 60) + '…' : text) : '…'
    rungs.push({
      key: `seq:${node.seq}`,
      summary,
      time: (node as { time?: number }).time ?? Date.now(),
      seq: node.seq,
    })
  }
  return rungs
}

/** Align rung keys with the rendered transcript. The Nth snapshot user turn
 * maps to the Nth DOM user row (same chronological order); a row whose text
 * contains the rung summary is the best-effort fallback for mismatches. Called
 * from render time, when the DOM has caught up with the snapshot. Mutates and
 * returns the given array (key field). */
export function alignRungKeys(rungs: SourceRung[]): SourceRung[] {
  const domRows = [...document.querySelectorAll<HTMLElement>(
    '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]',
  )]
  const byText = new Map<string, string>()
  for (const row of domRows) {
    const key = row.getAttribute('data-chat-anchor-key')
    if (key === null) continue
    const text = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text !== '') byText.set(text.slice(0, 40), key)
  }
  for (let i = 0; i < rungs.length; i += 1) {
    const rung = rungs[i]
    const domKey = domRows[i]?.getAttribute('data-chat-anchor-key')
    if (domKey !== undefined && domKey !== null && domKey !== '') {
      rung.key = domKey
      continue
    }
    // Fallback: match by summary prefix against any DOM user row.
    const prefix = rung.summary.slice(0, 40)
    if (prefix !== '…' && byText.has(prefix)) {
      rung.key = byText.get(prefix) ?? rung.key
    }
  }
  return rungs
}

/** Resolve the current session face (or undefined when none is open). */
export function currentSessionFace(sessions: ISessions): SessionFace | undefined {
  const list = sessions.list.getSnapshot()
  const id = list.current
  if (id === undefined) return undefined
  const scopeCtx = sessions.scope(id)
  if (scopeCtx === undefined) return undefined
  return sessions.sessionOf(scopeCtx as unknown as Context)
}

/** The session-source control face. */
export interface SessionSourceControl {
  dispose: () => void
  loadOlderUntilSeq: (seq: number) => Promise<void>
  loadOlderOnce: () => Promise<void>
}

/**
 * Live session data source. Subscribes to the current session's snapshot and
 * emits the in-window rungs on every change. Call once per page lifetime.
 * @returns a disposer and the paging controls.
 */
export function createSessionSource(
  sessions: ISessions,
  handlers: SessionSourceHandlers,
): SessionSourceControl {
  let currentFace: SessionFace | undefined
  let sessionUnsubscribe: (() => void) | undefined
  let listUnsubscribe: (() => void) | undefined
  let disposed = false

  const emit = (): void => {
    if (disposed) return
    if (currentFace === undefined) {
      handlers.onRungs([])
      handlers.onStatus({ count: 0, hasMore: false, loadingOlder: false, pending: false })
      return
    }
    const snapshot = currentFace.getSnapshot()
    const rungs = collectRungsFromSnapshot(snapshot)
    handlers.onRungs(rungs)
    handlers.onStatus({
      count: rungs.length,
      hasMore: snapshot.hasMore ?? false,
      loadingOlder: snapshot.loadingOlder ?? false,
      pending: snapshot.openState !== 'open',
    })
  }

  const bindSession = (face: SessionFace | undefined): void => {
    if (sessionUnsubscribe !== undefined) {
      sessionUnsubscribe()
      sessionUnsubscribe = undefined
    }
    currentFace = face
    if (face !== undefined) {
      sessionUnsubscribe = face.subscribe(() => emit())
    }
    emit()
  }

  const refreshCurrent = (): void => {
    if (disposed) return
    const id = sessions.list.getSnapshot().current
    if (id === undefined) {
      handlers.onSessionId?.(undefined)
      bindSession(undefined)
      return
    }
    handlers.onSessionId?.(id)
    if (currentFace !== undefined && currentFace.sessionId === id) return
    bindSession(currentSessionFace(sessions))
  }

  listUnsubscribe = sessions.list.subscribe(() => refreshCurrent())
  refreshCurrent()

  /** Page the history window backwards until the given seq is inside it. */
  const loadOlderUntilSeq = async (seq: number): Promise<void> => {
    if (currentFace === undefined) return
    // The target may already be in-window (the snapshot's node seqs are the
    // same axis as the rung seqs).
    for (let guard = 0; guard < 64; guard += 1) {
      const snapshot = currentFace.getSnapshot()
      const nodes = snapshot.nodes ?? []
      const inWindow = nodes.some((n) => n.seq <= seq)
      if (inWindow) return
      if (!(snapshot.hasMore ?? false)) return
      // Wait for any in-flight page to settle, then page once more.
      if (snapshot.loadingOlder === true) {
        await new Promise((resolve) => setTimeout(resolve, 150))
        continue
      }
      await currentFace.loadOlder()
      // A loadOlder mutation triggers the subscriber → emit() → onRungs; we
      // also give the DOM a beat to render before the next check.
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  /** Page one more older window (the footer's "load older" action). */
  const loadOlderOnce = async (): Promise<void> => {
    if (currentFace === undefined) return
    const snapshot = currentFace.getSnapshot()
    if (!(snapshot.hasMore ?? false) || snapshot.loadingOlder === true) return
    await currentFace.loadOlder()
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return {
    dispose: () => {
      disposed = true
      listUnsubscribe?.()
      sessionUnsubscribe?.()
    },
    loadOlderUntilSeq,
    loadOlderOnce,
  }
}
