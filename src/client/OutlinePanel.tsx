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

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { SourceRung } from './session-source.ts'
import type { BuddyKey } from './locales.ts'

/** Props of the ladder outline. */
export interface OutlinePanelProps {
  /** The rungs (one per user question turn), oldest first (in-window). */
  rungs: SourceRung[]
  /** Whether older history exists outside the loaded window. */
  hasMore: boolean
  /** Whether a page-up is currently in flight. */
  loadingOlder: boolean
  /** Translation helper. */
  t: (key: string, params?: Record<string, unknown>) => string
  /** Scroll the transcript to a rung's anchor (the owner ensures it is loaded). */
  scrollToKey: (key: string) => void
  /** Called when the user clicks a rung that is not yet loaded (page it in). */
  onRevealHidden: (rung: SourceRung) => void
  /** Called when the user clicks the "older" footer (page one more window). */
  onLoadOlder: () => void
  /** Whether to show timestamps in the tooltip. */
  showTimestamps: boolean
  /** Rail width in px (from settings). */
  railWidth: number
}

/** Locate the anchor element for a key inside the current document. */
function locateAnchor(key: string): HTMLElement | null {
  try {
    return document.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
  } catch {
    return null
  }
}

/** The turn currently nearest the top of the transcript viewport (scrollspy). */
function activeKeyFromViewport(rungs: SourceRung[], scrollport: HTMLElement | null): string | undefined {
  if (scrollport === null) return undefined
  const threshold = scrollport.getBoundingClientRect().top + 120
  let active: SourceRung | undefined
  for (const rung of rungs) {
    const el = locateAnchor(rung.key)
    if (el === null) continue
    const top = el.getBoundingClientRect().top
    if (top <= threshold) active = rung
    else break
  }
  return active?.key
}

/** The ladder outline (always-visible right rail, follows the scrollport). */
export function OutlinePanel(props: OutlinePanelProps): ReactElement {
  const { rungs, hasMore, loadingOlder, t, scrollToKey, onRevealHidden, onLoadOlder, showTimestamps, railWidth } = props
  const [hovered, setHovered] = useState<SourceRung | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; right: number } | null>(null)
  const [active, setActive] = useState<string | undefined>(undefined)
  const [left, setLeft] = useState<number | undefined>(undefined)
  const [atBottom, setAtBottom] = useState(true)
  // Whether the rung list can scroll up / down (drives the edge fade shadows
  // that indicate more rungs above/below, since the scrollbar is hidden).
  const [canScrollTop, setCanScrollTop] = useState(false)
  const [canScrollBottom, setCanScrollBottom] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<HTMLElement | null>(null)

  // Hidden only when there are fewer than two rungs AND no older history to
  // page in (so an "older" entry remains reachable when history is hidden).
  const empty = rungs.length < 2 && !hasMore

  // Follow the conversation scrollport's right edge: when a right sidebar
  // expands (any plugin) the scrollport shrinks, and we move with it. We sit
  // INSIDE the scrollport's right edge (so we stay on screen when the
  // scrollport fills the viewport) and shift left as the sidebar squeezes it.
  // The scrollport may mount a beat after this component (session open), so we
  // poll until it appears before attaching the ResizeObserver.
  useEffect(() => {
    const GAP = 12
    const total = 8 + 16 + 2
    let ro: ResizeObserver | undefined
    let timer: number | undefined
    let disposed = false
    const update = (): void => {
      const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      if (sp === null) {
        // Scrollport not mounted yet — retry shortly.
        timer = window.setTimeout(update, 300)
        return
      }
      if (ro === undefined) {
        ro = new ResizeObserver(update)
        ro.observe(sp)
        window.addEventListener('resize', update, { passive: true })
      }
      const rect = sp.getBoundingClientRect()
      setLeft(Math.max(rect.left + 4, rect.right - total - GAP))
    }
    update()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // Scrollspy: on transcript scroll, highlight the rung for the top turn.
  useEffect(() => {
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) return
    const onScroll = (): void => { setActive(activeKeyFromViewport(rungs, scrollport)) }
    onScroll()
    scrollport.addEventListener('scroll', onScroll, { passive: true })
    return () => { scrollport.removeEventListener('scroll', onScroll) }
  }, [rungs])

  // Track whether the transcript is scrolled to the bottom — the "jump to
  // latest" button shows only when NOT at the bottom (it would be pointless
  // otherwise). The scrollport may mount late, so poll until it appears.
  useEffect(() => {
    const BOTTOM_EPSILON = 24
    let timer: number | undefined
    let disposed = false
    const check = (): void => {
      const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      if (sp === null) {
        timer = window.setTimeout(check, 300)
        return
      }
      const atBottom = sp.scrollTop + sp.clientHeight >= sp.scrollHeight - BOTTOM_EPSILON
      setAtBottom(atBottom)
    }
    const attach = (): void => {
      const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      if (sp === null) { timer = window.setTimeout(attach, 300); return }
      check()
      sp.addEventListener('scroll', check, { passive: true })
      window.addEventListener('resize', check, { passive: true })
      // Content height changes (new turns / paging) should re-evaluate too.
      const ro = new ResizeObserver(check)
      ro.observe(sp)
      ;(sp as HTMLElement & { __dsbBottomCleanup?: () => void }).__dsbBottomCleanup = () => {
        sp.removeEventListener('scroll', check)
        window.removeEventListener('resize', check)
        ro.disconnect()
      }
    }
    attach()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      ;(sp as HTMLElement & { __dsbBottomCleanup?: () => void })?.__dsbBottomCleanup?.()
    }
  }, [rungs, hasMore])

  /** Scroll the transcript to the latest message (bottom). */
  const scrollToBottom = (): void => {
    const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (sp === null) return
    sp.scrollTo({ top: sp.scrollHeight, behavior: 'smooth' })
  }

  if (empty) {
    return <div className="dsb-outline dsb-outline-empty" data-dsh-part="outline-empty" />
  }

  // Keep the hovered rung in view as the list scrolls.
  useEffect(() => {
    if (hovered === null || scrollRef.current === null) return
    const index = rungs.findIndex((r) => r.key === hovered.key)
    if (index < 0) return
    const item = scrollRef.current.children[index] as HTMLElement | undefined
    if (item !== undefined) {
      const top = item.offsetTop - scrollRef.current.clientHeight / 2 + item.clientHeight / 2
      scrollRef.current.scrollTo({ top, behavior: 'smooth' })
    }
  }, [hovered, rungs])

  // Scroll-direction state for the edge fade shadows: update on every list
  // scroll and whenever the list or its content resizes (rungs mount/stream).
  useEffect(() => {
    const list = scrollRef.current
    if (list === null) return
    const EPSILON = 2
    const update = (): void => {
      setCanScrollTop(list.scrollTop > EPSILON)
      setCanScrollBottom(list.scrollTop + list.clientHeight < list.scrollHeight - EPSILON)
    }
    update()
    list.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(list)
    window.addEventListener('resize', update, { passive: true })
    return () => {
      list.removeEventListener('scroll', update)
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [rungs])

  // Position the tooltip beside the hovered rung (fixed to the viewport, so it
  // stays put while the rail itself is a fixed element). Re-read on every
  // hover and whenever the rail list scrolls (the rung may move).
  const updateTooltipPos = (rungKey: string): void => {
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-dsh-key="${CSS.escape(rungKey)}"]`)
    if (row === null || row === undefined) return
    const rect = row.getBoundingClientRect()
    // The button is a full-width hit area; anchor the tooltip to the VISUAL
    // 8px strip (centered), not the button's left edge.
    const stripLeft = rect.left + rect.width / 2 - 4
    // Tooltip sits to the LEFT of the strip, vertically centered on it
    // (right-anchored so no horizontal translate is needed).
    setTooltipPos({ top: rect.top + rect.height / 2, right: window.innerWidth - stripLeft + 10 })
  }

  const handleHover = (rung: SourceRung, element: HTMLElement): void => {
    setHovered(rung)
    // Use the hovered element directly — the event source is the rung itself,
    // which is more reliable than re-querying by key. Anchor to the centered
    // 8px visual strip (the button hit area is the full shell width).
    const rect = element.getBoundingClientRect()
    const stripLeft = rect.left + rect.width / 2 - 4
    setTooltipPos({ top: rect.top + rect.height / 2, right: window.innerWidth - stripLeft + 10 })
  }

  const handleLeave = (): void => {
    setHovered(null)
    setTooltipPos(null)
  }

  // When the rail scrolls (hovered rung recentered), keep the tooltip attached.
  useEffect(() => {
    const list = scrollRef.current
    if (list === null || hovered === null) return
    const onScroll = (): void => { updateTooltipPos(hovered.key) }
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => { list.removeEventListener('scroll', onScroll) }
  }, [hovered, rungs])

  const handleRungClick = (rung: SourceRung): void => {
    // If the anchor is not in the DOM, it is outside the loaded window —
    // ask the owner to page it in, then scroll.
    if (locateAnchor(rung.key) === null) {
      onRevealHidden(rung)
      return
    }
    scrollToKey(rung.key)
  }

  return (
    <>
      <aside
        className="dsb-outline"
        data-dsh-part="outline"
        ref={railRef}
        style={{ left }}
        aria-label={t('buddy.outline.title' as BuddyKey)}
      >
      <div
        className={[
          'dsb-outline-list',
          canScrollTop ? 'dsb-outline-list-can-top' : '',
          canScrollBottom ? 'dsb-outline-list-can-bottom' : '',
        ].join(' ')}
        data-dsh-part="outline-list"
        ref={scrollRef}
        role="list"
        aria-label={t('buddy.outline.title' as BuddyKey)}
        style={{ '--dsb-rung-h': `${railWidth}px` } as CSSProperties}
      >
        {rungs.map((rung, index) => (
          <button
            key={rung.key}
            type="button"
            role="listitem"
            className={[
              'dsb-outline-rung',
              rung.key === active ? 'dsb-outline-rung-active' : '',
              hovered?.key === rung.key ? 'dsb-outline-rung-hover' : '',
            ].join(' ')}
            data-dsh-part="outline-rung"
            data-dsh-key={rung.key}
            data-dsh-loaded={locateAnchor(rung.key) !== null ? 'true' : 'false'}
            aria-label={`${index + 1}. ${rung.summary}`}
            onMouseEnter={(event) => { handleHover(rung, event.currentTarget) }}
            onMouseLeave={() => { handleLeave() }}
            onFocus={(event) => { handleHover(rung, event.currentTarget) }}
            onBlur={() => { handleLeave() }}
            onClick={() => { handleRungClick(rung) }}
          />
        ))}
      </div>

      {/* "Load older" footer: OUTSIDE the scrollable list, so it never scrolls
          out of view and is always reachable even with many rungs. */}
      {hasMore ? (
        <button
          type="button"
          className="dsb-outline-footer"
          data-dsh-part="outline-footer"
          role="button"
          disabled={loadingOlder}
          onClick={() => { onLoadOlder() }}
        >
          {loadingOlder ? '…' : `+${t('buddy.outline.more')}`}
        </button>
      ) : null}

      {/* Jump-to-latest: an absolutely-positioned child of the rail, hanging
          just below it. As a child it follows the rail's position automatically
          (it moves with the rail when a sidebar squeezes the conversation),
          and stays horizontally centered on it. */}
      {!atBottom ? (
        <button
          type="button"
          className="dsb-outline-bottom"
          data-dsh-part="outline-bottom"
          role="button"
          aria-label={t('buddy.outline.bottom' as BuddyKey)}
          onClick={() => { scrollToBottom() }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 4.5L6 8.5L10 4.5"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
      </aside>

      {hovered !== null && tooltipPos !== null ? createPortal(
        <div
          className="dsb-outline-tooltip"
          data-dsh-part="outline-tooltip"
          role="tooltip"
          style={{ top: tooltipPos.top, right: tooltipPos.right }}
        >
          <span className="dsb-outline-tooltip-num">
            {rungs.findIndex((r) => r.key === hovered.key) + 1}
          </span>
          <span className="dsb-outline-tooltip-text">{hovered.summary}</span>
          {showTimestamps ? (
            <span className="dsb-outline-tooltip-time">
              {new Date(hovered.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </>
  )
}
