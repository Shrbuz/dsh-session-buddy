# dsh-session-buddy

English | [中文](./README.zh.md)

Session notifications + an in-conversation ladder outline for the **DeepSeek Harness Web GUI (dsh web)**. Get notified when the AI finishes replying, asks you a question, or needs command approval — even while the tab is away — and navigate past questions via a compact outline rail.

<sub><span style="opacity:.6">Built independently with dsh + Deepseek-V4-Flash</span></sub>

## Features

### Session notifications
- **Three trigger kinds**, each independently switchable:
  - `reply`: the AI finished replying
  - `ask`: the AI explicitly asks you a question (ask-user tool) — a plain finished reply does NOT re-fire
  - `confirm`: a command approval is pending (approval dialog)
- A reply notifies when you were **away at any point during that turn**; stays silent while you watch it
- **Host-driven + cross-tab**: triggers come from the session event log (reply on a completed turn, ask on the ask-user tool, confirm on an approval request) relayed over SSE to every open tab, and each event pops **at most one OS toast** — a notified ledger claims it once across tabs and reloads; DOM observation is the fallback while the stream is down
- **Native OS toast** (Windows PowerShell WinRT / macOS osascript / Linux notify-send) — no browser permission, not suppressed by Chrome — plus a red-dot favicon & `(●)` title badge, and an optional sound
- Title is "workspace · session title"; one notification per reply

### Ladder outline
- A collapsible rail on the right side listing every **user question** in order
- Thin rounded bars when idle (no text, no crowding), even with dozens/hundreds of turns
- Hover a rung for a floating tooltip (number + question summary + time); click to scroll to that turn with a flash highlight
- Scrollspy highlights the current turn; a jump-to-latest button appears when you are not at the bottom
- Older history is paged in on demand via the "`+older`" footer
- Hidden automatically when the session has fewer than two turns
- The rail **anchors to the conversation's right edge and follows it** whenever a sidebar expands/shrinks the conversation (event-driven, zero idle cost)

### In-app upgrades
- The settings card shows the current version and can check the npm registry for the latest release
- One-click upgrade through the official `dsh plugin add` CLI (restart dsh web to apply)

### Session cleanup
- Corrupt sessions — whose history fails the harness's own load validation (e.g. a `tool/result` persisted with an empty tool call id, which dsh refuses to read back) — are marked with a small warning badge on the session row
- The session row's three-dot menu gains a **"删除会话"** item: confirm, and the session's data is permanently deleted from disk (frees space) — dsh itself only offers fork/archive (archive keeps the files)
- Deleting is hidden for the currently open session, and the host refuses to delete a live session

### Tool-run collapsing
- After each turn finishes, the tool calls that turn executed (Pwsh / Think / Write / Grep / Edit / Read …) are folded into a single **"共执行 X 步操作"** row, so the closing summary is directly visible
- Click the row to expand the individual tool cards again (state is remembered per session)
- A turn is only folded once it has actually ended (a running turn stays fully visible); switch it off in the settings card to always show every tool call

### Transcript folding
- **Fold think blocks + process notes** — after a turn finishes, its repeated `Think` reasoning blocks, the interleaved text "小结" notes, and any context injections between them merge into one **"共 N 次思考"** row (the turn's final summary stays visible); click to expand them again
- **Fold over-long questions** — a question whose text runs past 6 lines (e.g. a whole log pasted into the prompt) is clamped to those first lines with a soft bottom fade and an **"展开全文"** bar; click to expand the full text
- Each folding surface has its own switch in the settings card (折叠工具操作 / 折叠思考块 / 折叠长提问), and expand/collapse state is remembered per session

## Install

### From npm

```sh
dsh plugin --profile web add dsh-session-buddy
```

### From a local directory (development)

```sh
dsh plugin --profile web add link:<this-dir>
```

After installing, **restart** `dsh web`, then configure it under 设置 → 插件 → 插件配置 → "Session Buddy @Shrbuz".

## Upgrade

Two ways to upgrade to a newer version:

### CLI

```sh
dsh plugin --profile web update dsh-session-buddy
```

The plugin is installed as a semver range (`^0.x.y`), so `dsh plugin update` picks up the newest compatible release. To force a specific version:

```sh
dsh plugin --profile web add dsh-session-buddy@<version>
```

### In-app

Open the plugin settings card → "Version & upgrades" → "Check for updates", then click "Upgrade" when a newer version exists.

After upgrading either way, **restart** `dsh web` to load the new version.

## Usage

### Notifications
- Open the plugin settings card and toggle the three trigger kinds, the sound, and the master switch
- Switch away from the tab while the AI is replying and you will get a native toast when it finishes; if the AI asks you a question or needs an approval, you are notified while the tab is hidden

### Ladder outline
- Hover the right-side rail to preview each question; click a rung to jump to it
- Use the `+older` footer to page in hidden history; the jump-to-latest button scrolls to the bottom
- Rung length and tooltip timestamps are configurable in the settings card
- When many rungs exceed the rail height, the scrollbar is hidden and top/bottom fade shadows indicate there is more above/below; the `+older` footer stays fixed and always reachable

### Upgrades
- See the **Upgrade** section above — via `dsh plugin update` or the settings card ("Version & upgrades")

## How it works

| Layer | Implementation |
|---|---|
| Notifications | Host watches the session event log and relays reply/ask/confirm triggers over SSE (`/api/session-buddy/events`) to every tab; a notified ledger claimed at the loopback-only `/api/session-buddy/toast` route dedupes across tabs and reloads (one OS toast per event). Client-side DOM observation (`MutationObserver` + official anchors + the composer stop-button running signal) is the fallback while the stream is down |
| Outline | Rungs come from the official `sessions` service snapshot (independent of how much DOM is rendered); dsh conversation history is a paged window, so the outline pages hidden history in on demand and aligns rungs to the DOM via the official anchor keys |
| Upgrades | The host reads `https://registry.npmjs.org/dsh-session-buddy/latest` (fail-closed when offline) and runs the official `dsh plugin` CLI for the actual upgrade |
| Session cleanup | The host lists sessions via `sessionPersistence`, flags corruption by replicating the harness's own load-time message validation, and deletes a session's directory (resolved through the persistence service's `locate()`, never from user input); the browser marks corrupt rows and injects the delete item into the row menu |
| Tool-run collapsing | Pure client DOM pass over the official anchor rows: `tool-call` rows are grouped by their enclosing `turn-tail` row (the tail is only published after `turn/end`, so folding happens exactly when the turn is finished), each group collapses to a "共执行 X 步操作" chip with per-session expand state |
| Transcript folding | The same official-markers pass groups a turn's `assistant-step` rows (think blocks + text "小结" + context injections) by its `turn-tail` row into a "共 N 次思考" chip, leaving the final summary visible; over-long `user` rows are clamped to 6 lines with an expand bar. Both silently degrade if the official markers vanish |
| Outline positioning | The rail re-reads the conversation scrollport's right edge on resize, on container/ancestor resize, and on DOM mutations (coalesced to one pass per frame), so it always moves with the conversation width |

The UI is theme-aware and styled entirely with the official `--dsw-alias-*` design tokens.

## Limitations

- Native toasts depend on the OS notification settings; the favicon/title badge always works as a parallel cue
- The "one OS toast per event" dedup applies to the host-driven stream; while that stream is down (older host, or a connection failure) the DOM fallback notifies per tab, so several hidden tabs could each pop a toast for the same event
- Session deletion is **permanent** (no recycle bin); the "删除会话" item is only injected into the session menu while the menu DOM is recognizable, and degrades silently otherwise
- All folding surfaces rely on the official `data-chat-flow-kind` / `data-chat-anchor-key` markers (question clamping additionally on the `_text_` class); if a future dsh version drops them, the plugin silently stops folding (it never hides rows it cannot confidently attribute to a finished turn)
- An upgrade takes effect only after restarting `dsh web`

## Development

```sh
pnpm install
pnpm build          # tsc -b && tsdown → lib/
pnpm typecheck
```

Regression scripts:

```sh
node scripts/smoke-host.mjs        # host-logic smoke (no web)
node scripts/verify-live.mjs       # live check against a running dsh (boot graph + bundle + routes)
node scripts/verify-outline.mjs    # CDP: restore session, page hidden history, rung click/flash
node scripts/verify-tooltip.mjs    # CDP: hover tooltip on a paged-in rung
node scripts/verify-notify.mjs     # CDP: notification fires while hidden, silent while visible
```

## License

Apache-2.0
