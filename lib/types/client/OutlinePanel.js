import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
/** Locate the anchor element for a key inside the current document. */
function locateAnchor(key) {
    try {
        return document.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`);
    }
    catch {
        return null;
    }
}
/** The turn currently nearest the top of the transcript viewport (scrollspy). */
function activeKeyFromViewport(rungs, scrollport) {
    if (scrollport === null)
        return undefined;
    const threshold = scrollport.getBoundingClientRect().top + 120;
    let active;
    for (const rung of rungs) {
        const el = locateAnchor(rung.key);
        if (el === null)
            continue;
        const top = el.getBoundingClientRect().top;
        if (top <= threshold)
            active = rung;
        else
            break;
    }
    return active?.key;
}
/** The ladder outline (always-visible right rail, follows the scrollport). */
export function OutlinePanel(props) {
    const { rungs, hasMore, loadingOlder, t, scrollToKey, onRevealHidden, onLoadOlder, showTimestamps, railWidth } = props;
    const [hovered, setHovered] = useState(null);
    const [tooltipPos, setTooltipPos] = useState(null);
    const [active, setActive] = useState(undefined);
    const [left, setLeft] = useState(undefined);
    const [atBottom, setAtBottom] = useState(true);
    const scrollRef = useRef(null);
    const railRef = useRef(null);
    // Hidden only when there are fewer than two rungs AND no older history to
    // page in (so an "older" entry remains reachable when history is hidden).
    const empty = rungs.length < 2 && !hasMore;
    // Follow the conversation scrollport's right edge: when a right sidebar
    // expands (any plugin) the scrollport shrinks, and we move with it. We sit
    // INSIDE the scrollport's right edge (so we stay on screen when the
    // scrollport fills the viewport) and shift left as the sidebar squeezes it.
    // The scrollport may mount a beat after this component (session open), so we
    // poll until it appears before attaching the ResizeObserver.
    useEffect(() => {
        const GAP = 12;
        const total = 8 + 16 + 2;
        let ro;
        let timer;
        let disposed = false;
        const update = () => {
            const sp = document.querySelector('[data-conversation-scroll]');
            if (sp === null) {
                // Scrollport not mounted yet — retry shortly.
                timer = window.setTimeout(update, 300);
                return;
            }
            if (ro === undefined) {
                ro = new ResizeObserver(update);
                ro.observe(sp);
                window.addEventListener('resize', update, { passive: true });
            }
            const rect = sp.getBoundingClientRect();
            setLeft(Math.max(rect.left + 4, rect.right - total - GAP));
        };
        update();
        return () => {
            disposed = true;
            if (timer !== undefined)
                clearTimeout(timer);
            ro?.disconnect();
            window.removeEventListener('resize', update);
        };
    }, []);
    // Scrollspy: on transcript scroll, highlight the rung for the top turn.
    useEffect(() => {
        const scrollport = document.querySelector('[data-conversation-scroll]');
        if (scrollport === null)
            return;
        const onScroll = () => { setActive(activeKeyFromViewport(rungs, scrollport)); };
        onScroll();
        scrollport.addEventListener('scroll', onScroll, { passive: true });
        return () => { scrollport.removeEventListener('scroll', onScroll); };
    }, [rungs]);
    // Track whether the transcript is scrolled to the bottom — the "jump to
    // latest" button shows only when NOT at the bottom (it would be pointless
    // otherwise). The scrollport may mount late, so poll until it appears.
    useEffect(() => {
        const BOTTOM_EPSILON = 24;
        let timer;
        let disposed = false;
        const check = () => {
            const sp = document.querySelector('[data-conversation-scroll]');
            if (sp === null) {
                timer = window.setTimeout(check, 300);
                return;
            }
            const atBottom = sp.scrollTop + sp.clientHeight >= sp.scrollHeight - BOTTOM_EPSILON;
            setAtBottom(atBottom);
        };
        const attach = () => {
            const sp = document.querySelector('[data-conversation-scroll]');
            if (sp === null) {
                timer = window.setTimeout(attach, 300);
                return;
            }
            check();
            sp.addEventListener('scroll', check, { passive: true });
            window.addEventListener('resize', check, { passive: true });
            // Content height changes (new turns / paging) should re-evaluate too.
            const ro = new ResizeObserver(check);
            ro.observe(sp);
            sp.__dsbBottomCleanup = () => {
                sp.removeEventListener('scroll', check);
                window.removeEventListener('resize', check);
                ro.disconnect();
            };
        };
        attach();
        return () => {
            disposed = true;
            if (timer !== undefined)
                clearTimeout(timer);
            const sp = document.querySelector('[data-conversation-scroll]');
            sp?.__dsbBottomCleanup?.();
        };
    }, [rungs, hasMore]);
    /** Scroll the transcript to the latest message (bottom). */
    const scrollToBottom = () => {
        const sp = document.querySelector('[data-conversation-scroll]');
        if (sp === null)
            return;
        sp.scrollTo({ top: sp.scrollHeight, behavior: 'smooth' });
    };
    if (empty) {
        return _jsx("div", { className: "dsb-outline dsb-outline-empty", "data-dsh-part": "outline-empty" });
    }
    // Keep the hovered rung in view as the list scrolls.
    useEffect(() => {
        if (hovered === null || scrollRef.current === null)
            return;
        const index = rungs.findIndex((r) => r.key === hovered.key);
        if (index < 0)
            return;
        const item = scrollRef.current.children[index];
        if (item !== undefined) {
            const top = item.offsetTop - scrollRef.current.clientHeight / 2 + item.clientHeight / 2;
            scrollRef.current.scrollTo({ top, behavior: 'smooth' });
        }
    }, [hovered, rungs]);
    // Position the tooltip beside the hovered rung (fixed to the viewport, so it
    // stays put while the rail itself is a fixed element). Re-read on every
    // hover and whenever the rail list scrolls (the rung may move).
    const updateTooltipPos = (rungKey) => {
        const row = scrollRef.current?.querySelector(`[data-dsh-key="${CSS.escape(rungKey)}"]`);
        if (row === null || row === undefined)
            return;
        const rect = row.getBoundingClientRect();
        // The button is a full-width hit area; anchor the tooltip to the VISUAL
        // 8px strip (centered), not the button's left edge.
        const stripLeft = rect.left + rect.width / 2 - 4;
        // Tooltip sits to the LEFT of the strip, vertically centered on it
        // (right-anchored so no horizontal translate is needed).
        setTooltipPos({ top: rect.top + rect.height / 2, right: window.innerWidth - stripLeft + 10 });
    };
    const handleHover = (rung, element) => {
        setHovered(rung);
        // Use the hovered element directly — the event source is the rung itself,
        // which is more reliable than re-querying by key. Anchor to the centered
        // 8px visual strip (the button hit area is the full shell width).
        const rect = element.getBoundingClientRect();
        const stripLeft = rect.left + rect.width / 2 - 4;
        setTooltipPos({ top: rect.top + rect.height / 2, right: window.innerWidth - stripLeft + 10 });
    };
    const handleLeave = () => {
        setHovered(null);
        setTooltipPos(null);
    };
    // When the rail scrolls (hovered rung recentered), keep the tooltip attached.
    useEffect(() => {
        const list = scrollRef.current;
        if (list === null || hovered === null)
            return;
        const onScroll = () => { updateTooltipPos(hovered.key); };
        list.addEventListener('scroll', onScroll, { passive: true });
        return () => { list.removeEventListener('scroll', onScroll); };
    }, [hovered, rungs]);
    const handleRungClick = (rung) => {
        // If the anchor is not in the DOM, it is outside the loaded window —
        // ask the owner to page it in, then scroll.
        if (locateAnchor(rung.key) === null) {
            onRevealHidden(rung);
            return;
        }
        scrollToKey(rung.key);
    };
    return (_jsxs(_Fragment, { children: [_jsxs("aside", { className: "dsb-outline", "data-dsh-part": "outline", ref: railRef, style: { left }, "aria-label": t('buddy.outline.title'), children: [_jsxs("div", { className: "dsb-outline-list", "data-dsh-part": "outline-list", ref: scrollRef, role: "list", "aria-label": t('buddy.outline.title'), style: { '--dsb-rung-h': `${railWidth}px` }, children: [rungs.map((rung, index) => (_jsx("button", { type: "button", role: "listitem", className: [
                                    'dsb-outline-rung',
                                    rung.key === active ? 'dsb-outline-rung-active' : '',
                                    hovered?.key === rung.key ? 'dsb-outline-rung-hover' : '',
                                ].join(' '), "data-dsh-part": "outline-rung", "data-dsh-key": rung.key, "data-dsh-loaded": locateAnchor(rung.key) !== null ? 'true' : 'false', "aria-label": `${index + 1}. ${rung.summary}`, onMouseEnter: (event) => { handleHover(rung, event.currentTarget); }, onMouseLeave: () => { handleLeave(); }, onFocus: (event) => { handleHover(rung, event.currentTarget); }, onBlur: () => { handleLeave(); }, onClick: () => { handleRungClick(rung); } }, rung.key))), hasMore ? (_jsx("button", { type: "button", className: "dsb-outline-footer", "data-dsh-part": "outline-footer", role: "button", disabled: loadingOlder, onClick: () => { onLoadOlder(); }, children: loadingOlder ? '…' : `+${t('buddy.outline.more')}` })) : null] }), !atBottom ? (_jsx("button", { type: "button", className: "dsb-outline-bottom", "data-dsh-part": "outline-bottom", role: "button", "aria-label": t('buddy.outline.bottom'), onClick: () => { scrollToBottom(); }, children: _jsx("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M2 4.5L6 8.5L10 4.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) })) : null] }), hovered !== null && tooltipPos !== null ? createPortal(_jsxs("div", { className: "dsb-outline-tooltip", "data-dsh-part": "outline-tooltip", role: "tooltip", style: { top: tooltipPos.top, right: tooltipPos.right }, children: [_jsx("span", { className: "dsb-outline-tooltip-num", children: rungs.findIndex((r) => r.key === hovered.key) + 1 }), _jsx("span", { className: "dsb-outline-tooltip-text", children: hovered.summary }), showTimestamps ? (_jsx("span", { className: "dsb-outline-tooltip-time", children: new Date(hovered.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })) : null] }), document.body) : null] }));
}
