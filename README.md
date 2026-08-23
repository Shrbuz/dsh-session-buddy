# dsh-session-buddy（Session Buddy @Shrbuz）

> **English** · [中文](./README.zh.md)

For the **DeepSeek Harness Web GUI (dsh web)**.
Adds the two things the official UI lacks: **session notifications** + an **in-conversation ladder outline**.

<div align="center">
  <b style="font-size:1.1em;">Get notified when the AI finishes replying / asks you a question / needs command approval, even while the tab is away; navigate past questions via the ladder outline.</b>
</div>

## ✨ Features

### Session notifications
- **Three trigger kinds** (each independently switchable):
  - `reply`: AI reply complete
  - `ask`: **only when the AI explicitly asks you a question** (ask-user tool) — a plain finished reply does NOT re-fire "your input is needed"
  - `confirm`: command approval pending (approval dialog)
- A reply notifies if you were **away at any point during that turn** (switch away / switch back to check); silent when you watched it
- **Native OS toast** (Windows PowerShell WinRT / macOS osascript / Linux notify-send — no browser permission, not suppressed by Chrome) + a parallel red-dot favicon & `(●)` title badge + optional sound
- Toast title is "workspace · session title"; deduplicated to one notification per reply

### Ladder Outline
- Collapsible rail on the right side, listing every **user question** turn in order
- **Idle**: thin rounded bars (no text, no crowding) — stays clean with dozens/hundreds of turns
- **Hover**: the whole rail-shell width is the hit area (the blank band beside the strip counts too), so it is easy to aim; floating tooltip anchored to the rung with number + question summary + time
- **Click** a rung → scroll to that turn with a flash highlight; **scrollspy** highlights the current turn
- **Jump-to-latest**: a bordered rounded-square container styled like the rail shell, sitting just below it, with a bottom-arrow icon; clicking scrolls to the latest message, hidden already-at-bottom, and centered under the rail
- The rail scrolls internally to hold many turns; hidden when the session has <2 turns

## 🔌 Technical notes

- Outline data source: the official `sessions` service snapshot (`ctx.sessions` → current `SessionFace.getSnapshot()`), independent of how much DOM is rendered — dsh conversation history is a paged window (`PAGE_MESSAGES=50`; a restart loads only the tail window), and the outline pages the hidden history in on demand via the "`+older`" footer (`loadOlder()`)
- Notifications: client-side DOM observation (`MutationObserver` + official anchors + the **composer stop-button `running` signal** to decide "reply truly done" — no throttled-timer reliance) + a `visibilitychange` rebuild (switch away/back is captured immediately)
- Reply timing: fires when the user was **away during the turn** (`hiddenDuringTurn`); `ask` only on `pendingInteraction === 'question'`; `confirm` on `pendingInteraction === 'approval'` or the approval dialog
- Host half registers the settings namespace plus one **loopback-only `/api/session-buddy/toast` route** (the client POSTs, the host runs the native OS toast)
- Theme-aware: styled entirely with official `--dsw-alias-*` design tokens

## 📦 Install

```bash
# from source (development)
dsh plugin --profile web add link:<this-dir>

# or from npm
dsh plugin --profile web add dsh-session-buddy
```

Restart dsh web, then configure under 设置 → 插件 → 插件配置 → "Session Buddy @Shrbuz".

## 🛠 Development

```bash
pnpm install
pnpm build          # tsc -b && tsdown → lib/
pnpm typecheck
```

Regression scripts:
```bash
node scripts/smoke-host.mjs        # host-logic smoke (no web)
node scripts/verify-live.mjs       # live check (boot graph + client bundle)
node scripts/verify-approach2.mjs  # CDP: snapshot-backed rungs + hasMore + footer paging
node scripts/verify-outline.mjs    # CDP: restore session, page hidden history, rung anchors/click/flash
node scripts/verify-redesign.mjs   # CDP: vertical rungs / subdued breathing / follow-squeeze / click-scroll
node scripts/verify-tooltip.mjs    # CDP: hover tooltip on a paged-in rung
node scripts/verify-notify.mjs     # CDP: notification fires while hidden, silent while visible
node scripts/cdp-probe.mjs         # CDP probe: dump real session DOM signals
node scripts/dump-outline.mjs      # dump the rendered outline DOM
node scripts/debug-hover.mjs       # debug hover behavior
node scripts/diag-session.mjs      # diagnose session-restore state
node scripts/diag-session-source.mjs # diagnose snapshot rung collection
node scripts/diag-tooltip.mjs      # diagnose tooltip hover
node scripts/diag-left.mjs         # diagnose ladder left positioning
node scripts/diag-restore.mjs      # diagnose session restore across candidates
node scripts/probe-title.mjs       # locate the session title element
node scripts/probe-sidebar.mjs     # dump the sidebar structure
```
> Note: the CDP probes restore a real session (boot-then-seed), page hidden
> history in via the outline footer, and clean up their own ports, so they can
> run serially or repeat without interfering with each other.

## 📜 License

Apache-2.0
