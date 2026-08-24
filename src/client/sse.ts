/**
 * dsh-session-buddy browser half — event-driven notification stream.
 *
 * Subscribes to the host's SSE route (/api/session-buddy/events) which relays
 * reply/ask/confirm triggers derived from the session event log (see
 * src/host/events.ts). With this connected, notifications no longer depend on
 * one tab's DOM observation: every open tab receives the same trigger and the
 * claim ledger (host side) makes sure exactly one pops the OS toast.
 *
 * Also owns the tab-visibility history used to answer "was the user away at
 * any point since this turn started?" for a reply — the host reports the turn
 * start timestamp, and this module knows when the tab was hidden.
 *
 * @module dsh-session-buddy/client/sse
 */

/** A trigger relayed by the host (mirror of src/host/events.ts BuddyTrigger). */
export interface BuddyTriggerEvent {
  kind: 'reply' | 'ask' | 'confirm'
  sessionId: string
  workspace?: string
  turn?: number
  turnStartedAt?: number
  summary?: string
  dedupKey: string
}

/** Options for the event stream. */
export interface BuddyEventStreamOptions {
  /** Fired for every trigger the host relays. */
  onTrigger: (trigger: BuddyTriggerEvent) => void
  /** Fired on connection state changes (true = SSE connected). */
  onStatus?: (connected: boolean) => void
}

/** The SSE endpoint the host exposes (must match src/index.ts EVENTS_ROUTE). */
const EVENTS_ROUTE = '/api/session-buddy/events'

// ── Tab-visibility history ──────────────────────────────────────────────────
// The browser is told when a reply's turn started; to reproduce the old
// "stepped away during the reply" semantics we need to know whether the tab
// was hidden at ANY point in [turnStartedAt, now]. We record every
// visibilitychange with a timestamp and answer by interval overlap.

interface VisibilityTransition { at: number; hidden: boolean }

/** Transition log, seeded with the state at module load. */
const visibilityTransitions: VisibilityTransition[] = [{ at: Date.now(), hidden: document.hidden }]

function recordVisibility(): void {
  const hidden = document.hidden
  const last = visibilityTransitions[visibilityTransitions.length - 1]
  if (hidden === last.hidden) return
  visibilityTransitions.push({ at: Date.now(), hidden })
  // Bound the log (a reply is at most minutes old; 512 transitions is plenty).
  if (visibilityTransitions.length > 512) visibilityTransitions.splice(0, visibilityTransitions.length - 512)
}

document.addEventListener('visibilitychange', recordVisibility)

/**
 * Whether the tab was hidden at any point during [start, now]. Pure + exported
 * for unit tests.
 */
export function wasHiddenSince(start: number, now: number = Date.now()): boolean {
  if (start > now) return false
  // Each transition marks the state from its `at` until the next transition
  // (or `now`). A hidden interval overlaps [start, now] when it starts ≤ now
  // and ends ≥ start.
  for (let i = 0; i < visibilityTransitions.length; i += 1) {
    if (!visibilityTransitions[i].hidden) continue
    const begin = visibilityTransitions[i].at
    const end = i + 1 < visibilityTransitions.length ? visibilityTransitions[i + 1].at : now
    if (begin <= now && end >= start) return true
  }
  return false
}

// ── EventSource lifecycle ───────────────────────────────────────────────────

/**
 * Open the SSE stream. EventSource auto-reconnects; `onStatus` reports
 * connection state so the owner can fall back to DOM observation while the
 * stream is down. Returns a disposer that closes the connection.
 */
export function startBuddyEventStream(options: BuddyEventStreamOptions): () => void {
  const { onTrigger, onStatus } = options
  let disposed = false
  let source: EventSource | null = null

  const report = (connected: boolean): void => {
    try { onStatus?.(connected) } catch { /* observer containment */ }
  }

  const connect = (): void => {
    if (disposed) return
    source?.close()
    source = new EventSource(EVENTS_ROUTE)
    source.addEventListener('trigger', (raw) => {
      if (disposed) return
      try {
        const data = JSON.parse((raw as MessageEvent).data) as BuddyTriggerEvent
        if (data === null || typeof data !== 'object' || typeof data.kind !== 'string') return
        onTrigger(data)
      } catch {
        // Bad frame — ignore; a malformed event must not break the stream.
      }
    })
    source.onopen = () => { if (!disposed) report(true) }
    source.onerror = () => {
      // EventSource auto-reconnects; report the outage so the DOM fallback
      // takes over until it comes back.
      report(false)
    }
  }

  connect()

  return () => {
    disposed = true
    source?.close()
    source = null
    report(false)
  }
}
