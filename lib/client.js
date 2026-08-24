window.__ModuleLoader__.load({
	id: "dsh-session-buddy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/OutlinePanel.tsx
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
		/** Locate the anchor element for a key inside the current document. */
		function locateAnchor(key) {
			try {
				return document.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`);
			} catch {
				return null;
			}
		}
		/** The turn currently nearest the top of the transcript viewport (scrollspy). */
		function activeKeyFromViewport(rungs, scrollport) {
			if (scrollport === null) return void 0;
			const threshold = scrollport.getBoundingClientRect().top + 120;
			let active;
			for (const rung of rungs) {
				const el = locateAnchor(rung.key);
				if (el === null) continue;
				if (el.getBoundingClientRect().top <= threshold) active = rung;
				else break;
			}
			return active?.key;
		}
		/** The ladder outline (always-visible right rail, follows the scrollport). */
		function OutlinePanel(props) {
			const { rungs, hasMore, loadingOlder, t, scrollToKey, onRevealHidden, onLoadOlder, showTimestamps, railWidth } = props;
			const [hovered, setHovered] = (0, react.useState)(null);
			const [tooltipPos, setTooltipPos] = (0, react.useState)(null);
			const [active, setActive] = (0, react.useState)(void 0);
			const [left, setLeft] = (0, react.useState)(void 0);
			const [atBottom, setAtBottom] = (0, react.useState)(true);
			const [canScrollTop, setCanScrollTop] = (0, react.useState)(false);
			const [canScrollBottom, setCanScrollBottom] = (0, react.useState)(false);
			const scrollRef = (0, react.useRef)(null);
			const railRef = (0, react.useRef)(null);
			const empty = rungs.length < 2 && !hasMore;
			(0, react.useEffect)(() => {
				const GAP = 12;
				const total = 26;
				let ro;
				let timer;
				const update = () => {
					const sp = document.querySelector("[data-conversation-scroll]");
					if (sp === null) {
						timer = window.setTimeout(update, 300);
						return;
					}
					if (ro === void 0) {
						ro = new ResizeObserver(update);
						ro.observe(sp);
						window.addEventListener("resize", update, { passive: true });
					}
					const rect = sp.getBoundingClientRect();
					setLeft(Math.max(rect.left + 4, rect.right - total - GAP));
				};
				update();
				return () => {
					if (timer !== void 0) clearTimeout(timer);
					ro?.disconnect();
					window.removeEventListener("resize", update);
				};
			}, []);
			(0, react.useEffect)(() => {
				const scrollport = document.querySelector("[data-conversation-scroll]");
				if (scrollport === null) return;
				const onScroll = () => {
					setActive(activeKeyFromViewport(rungs, scrollport));
				};
				onScroll();
				scrollport.addEventListener("scroll", onScroll, { passive: true });
				return () => {
					scrollport.removeEventListener("scroll", onScroll);
				};
			}, [rungs]);
			(0, react.useEffect)(() => {
				const BOTTOM_EPSILON = 24;
				let timer;
				const check = () => {
					const sp = document.querySelector("[data-conversation-scroll]");
					if (sp === null) {
						timer = window.setTimeout(check, 300);
						return;
					}
					const atBottom = sp.scrollTop + sp.clientHeight >= sp.scrollHeight - BOTTOM_EPSILON;
					setAtBottom(atBottom);
				};
				const attach = () => {
					const sp = document.querySelector("[data-conversation-scroll]");
					if (sp === null) {
						timer = window.setTimeout(attach, 300);
						return;
					}
					check();
					sp.addEventListener("scroll", check, { passive: true });
					window.addEventListener("resize", check, { passive: true });
					const ro = new ResizeObserver(check);
					ro.observe(sp);
					sp.__dsbBottomCleanup = () => {
						sp.removeEventListener("scroll", check);
						window.removeEventListener("resize", check);
						ro.disconnect();
					};
				};
				attach();
				return () => {
					if (timer !== void 0) clearTimeout(timer);
					document.querySelector("[data-conversation-scroll]")?.__dsbBottomCleanup?.();
				};
			}, [rungs, hasMore]);
			/** Scroll the transcript to the latest message (bottom). */
			const scrollToBottom = () => {
				const sp = document.querySelector("[data-conversation-scroll]");
				if (sp === null) return;
				sp.scrollTo({
					top: sp.scrollHeight,
					behavior: "smooth"
				});
			};
			(0, react.useEffect)(() => {
				if (hovered === null || scrollRef.current === null) return;
				const index = rungs.findIndex((r) => r.key === hovered.key);
				if (index < 0) return;
				const item = scrollRef.current.children[index];
				if (item !== void 0) {
					const top = item.offsetTop - scrollRef.current.clientHeight / 2 + item.clientHeight / 2;
					scrollRef.current.scrollTo({
						top,
						behavior: "smooth"
					});
				}
			}, [hovered, rungs]);
			(0, react.useEffect)(() => {
				const list = scrollRef.current;
				if (list === null) return;
				const EPSILON = 2;
				const update = () => {
					setCanScrollTop(list.scrollTop > EPSILON);
					setCanScrollBottom(list.scrollTop + list.clientHeight < list.scrollHeight - EPSILON);
				};
				update();
				list.addEventListener("scroll", update, { passive: true });
				const ro = new ResizeObserver(update);
				ro.observe(list);
				window.addEventListener("resize", update, { passive: true });
				return () => {
					list.removeEventListener("scroll", update);
					ro.disconnect();
					window.removeEventListener("resize", update);
				};
			}, [rungs]);
			const updateTooltipPos = (rungKey) => {
				const row = scrollRef.current?.querySelector(`[data-dsh-key="${CSS.escape(rungKey)}"]`);
				if (row === null || row === void 0) return;
				const rect = row.getBoundingClientRect();
				const stripLeft = rect.left + rect.width / 2 - 4;
				setTooltipPos({
					top: rect.top + rect.height / 2,
					right: window.innerWidth - stripLeft + 10
				});
			};
			const handleHover = (rung, element) => {
				setHovered(rung);
				const rect = element.getBoundingClientRect();
				const stripLeft = rect.left + rect.width / 2 - 4;
				setTooltipPos({
					top: rect.top + rect.height / 2,
					right: window.innerWidth - stripLeft + 10
				});
			};
			const handleLeave = () => {
				setHovered(null);
				setTooltipPos(null);
			};
			(0, react.useEffect)(() => {
				const list = scrollRef.current;
				if (list === null || hovered === null) return;
				const onScroll = () => {
					updateTooltipPos(hovered.key);
				};
				list.addEventListener("scroll", onScroll, { passive: true });
				return () => {
					list.removeEventListener("scroll", onScroll);
				};
			}, [hovered, rungs]);
			if (empty) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsb-outline dsb-outline-empty",
				"data-dsh-part": "outline-empty"
			});
			const handleRungClick = (rung) => {
				if (locateAnchor(rung.key) === null) {
					onRevealHidden(rung);
					return;
				}
				scrollToKey(rung.key);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: "dsb-outline",
				"data-dsh-part": "outline",
				ref: railRef,
				style: { left },
				"aria-label": t("buddy.outline.title"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: [
							"dsb-outline-list",
							canScrollTop ? "dsb-outline-list-can-top" : "",
							canScrollBottom ? "dsb-outline-list-can-bottom" : ""
						].join(" "),
						"data-dsh-part": "outline-list",
						ref: scrollRef,
						role: "list",
						"aria-label": t("buddy.outline.title"),
						style: { "--dsb-rung-h": `${railWidth}px` },
						children: rungs.map((rung, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "listitem",
							className: [
								"dsb-outline-rung",
								rung.key === active ? "dsb-outline-rung-active" : "",
								hovered?.key === rung.key ? "dsb-outline-rung-hover" : ""
							].join(" "),
							"data-dsh-part": "outline-rung",
							"data-dsh-key": rung.key,
							"data-dsh-loaded": locateAnchor(rung.key) !== null ? "true" : "false",
							"aria-label": `${index + 1}. ${rung.summary}`,
							onMouseEnter: (event) => {
								handleHover(rung, event.currentTarget);
							},
							onMouseLeave: () => {
								handleLeave();
							},
							onFocus: (event) => {
								handleHover(rung, event.currentTarget);
							},
							onBlur: () => {
								handleLeave();
							},
							onClick: () => {
								handleRungClick(rung);
							}
						}, rung.key))
					}),
					hasMore ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsb-outline-footer",
						"data-dsh-part": "outline-footer",
						role: "button",
						disabled: loadingOlder,
						onClick: () => {
							onLoadOlder();
						},
						children: loadingOlder ? "…" : `+${t("buddy.outline.more")}`
					}) : null,
					!atBottom ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsb-outline-bottom",
						"data-dsh-part": "outline-bottom",
						role: "button",
						"aria-label": t("buddy.outline.bottom"),
						onClick: () => {
							scrollToBottom();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
							width: "12",
							height: "12",
							viewBox: "0 0 12 12",
							fill: "none",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								d: "M2 4.5L6 8.5L10 4.5",
								stroke: "currentColor",
								strokeWidth: "1.5",
								strokeLinecap: "round",
								strokeLinejoin: "round"
							})
						})
					}) : null
				]
			}), hovered !== null && tooltipPos !== null ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsb-outline-tooltip",
				"data-dsh-part": "outline-tooltip",
				role: "tooltip",
				style: {
					top: tooltipPos.top,
					right: tooltipPos.right
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsb-outline-tooltip-num",
						children: rungs.findIndex((r) => r.key === hovered.key) + 1
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsb-outline-tooltip-text",
						children: hovered.summary
					}),
					showTimestamps ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsb-outline-tooltip-time",
						children: new Date(hovered.time).toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit"
						})
					}) : null
				]
			}), document.body) : null] });
		}
		//#endregion
		//#region src/client/settings.ts
		/** Normalize an unknown section value to the UI settings (lenient). */
		function decodeSection(section) {
			if (typeof section !== "object" || section === null) return void 0;
			const value = section;
			return {
				enabled: value.enabled !== false,
				notifyReply: value.notifyReply !== false,
				notifyAsk: value.notifyAsk !== false,
				notifyConfirm: value.notifyConfirm !== false,
				sound: value.sound === true,
				outlineWidth: typeof value.outlineWidth === "number" ? Math.min(32, Math.max(12, Math.round(value.outlineWidth))) : 18,
				showTimestamps: value.showTimestamps !== false
			};
		}
		/** The scope spec the client binds against the `session-buddy` namespace. */
		const sessionBuddySettingsSpec = {
			namespace: "session-buddy",
			decode: decodeSection
		};
		/** Defaults the UI falls back to while the scope has no accepted section yet. */
		const DEFAULT_UI_SETTINGS = {
			enabled: true,
			notifyReply: true,
			notifyAsk: true,
			notifyConfirm: true,
			sound: false,
			outlineWidth: 18,
			showTimestamps: true
		};
		//#endregion
		//#region src/client/upgrade.ts
		/**
		* dsh-session-buddy browser half — version check + in-app upgrade wiring for
		* the settings card. Talks to the host's loopback routes:
		*   GET  /api/session-buddy/toast/version        → current/latest
		*   POST /api/session-buddy/toast/update         → start upgrade, get jobId
		*   GET  /api/session-buddy/toast/update/status  → poll job state
		* All calls fail-closed: a fetch/parse failure surfaces as "unknown / failed"
		* in the card and never throws into the settings UI.
		* @module dsh-session-buddy/client/upgrade
		*/
		/** The host route family (mirrors src/index.ts). */
		const ROUTE = "/api/session-buddy/toast";
		/** Check the current/latest version through the host. Never throws. */
		async function checkVersion() {
			try {
				const response = await fetch(`${ROUTE}/version`, { method: "GET" });
				if (!response.ok) return void 0;
				const body = await response.json();
				if (typeof body !== "object" || body === null) return void 0;
				return body;
			} catch {
				return;
			}
		}
		/** Start an upgrade to `version`. Returns the job id, or undefined on failure. */
		async function startUpgrade(version) {
			try {
				const response = await fetch(`${ROUTE}/update`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ version })
				});
				if (!response.ok) return void 0;
				const body = await response.json();
				if (body.ok !== true || body.jobId === void 0) return void 0;
				return body.jobId;
			} catch {
				return;
			}
		}
		/** Poll one upgrade job until it settles or `timeoutMs` elapses. Never throws. */
		async function pollUpgrade(jobId, timeoutMs = 12e4) {
			const deadline = Date.now() + timeoutMs;
			try {
				while (Date.now() < deadline) {
					const response = await fetch(`${ROUTE}/update/status?id=${encodeURIComponent(jobId)}`, { method: "GET" });
					if (response.ok) {
						const body = await response.json();
						if (body.ok === true && body.job !== void 0) {
							if (body.job.phase === "done" || body.job.phase === "error") return body.job;
						}
					}
					await new Promise((resolve) => setTimeout(resolve, 1e3));
				}
			} catch {}
		}
		//#endregion
		//#region src/client/SessionBuddySettingsCard.tsx
		/**
		* Session buddy settings card — the `session-buddy` entry inside the web
		* settings surface (设置 → 插件 → 插件配置). Follows the official plugin-card
		* pattern: a collapsible header (name + description + chevron) that expands
		* into the form. Every control writes straight back through the bound settings
		* scope, so changes apply live — no save/discard footer needed.
		* @module dsh-session-buddy/client/SessionBuddySettingsCard
		*/
		/** A labeled toggle row (official-style switch). */
		function Toggle(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsb-settings-field dsb-settings-field-switch",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsb-settings-label",
					children: props.label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "dsb-settings-switch",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						className: "dsb-check",
						"data-dsh-part": props.dataPart,
						checked: props.checked,
						onChange: (event) => {
							props.onChange(event.target.checked);
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsb-settings-switch-track",
						"aria-hidden": "true"
					})]
				})]
			});
		}
		/** Length presets for the ladder rungs (vertical bar height in px). */
		const WIDTH_PRESETS = [
			{
				value: 14,
				labelKey: "buddy.settings.widthSmall"
			},
			{
				value: 18,
				labelKey: "buddy.settings.widthMedium"
			},
			{
				value: 24,
				labelKey: "buddy.settings.widthLarge"
			}
		];
		/** A segmented (tab-style) picker, official-style. */
		function Segmented(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsb-settings-seg",
				role: "radiogroup",
				"data-dsh-part": props.dataPart,
				children: props.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "radio",
					"aria-checked": option.value === props.value,
					className: option.value === props.value ? "dsb-settings-seg-btn dsb-settings-seg-active" : "dsb-settings-seg-btn",
					"data-dsh-part": `${props.dataPart}-${option.value}`,
					onClick: () => {
						props.onChange(option.value);
					},
					children: option.label
				}, option.value))
			});
		}
		/** The session-buddy plugin card in 设置 → 插件 → 插件配置. */
		function SessionBuddySettingsCard(props) {
			const { scope, buddyT } = props;
			const snapshot = (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot());
			if (snapshot.status === "unavailable") return null;
			const value = snapshot.value ?? DEFAULT_UI_SETTINGS;
			const [open, setOpen] = (0, react.useState)(false);
			const [versionInfo, setVersionInfo] = (0, react.useState)(void 0);
			const [checking, setChecking] = (0, react.useState)(false);
			const [upgrading, setUpgrading] = (0, react.useState)(false);
			const [upgradeError, setUpgradeError] = (0, react.useState)(void 0);
			const [upgradeDone, setUpgradeDone] = (0, react.useState)(false);
			const set = (key, next) => {
				scope.set(key, next);
			};
			/** Check for a newer version through the host; fail-closed. */
			const handleCheckUpdate = async () => {
				setChecking(true);
				setUpgradeError(void 0);
				setUpgradeDone(false);
				const info = await checkVersion();
				setVersionInfo(info);
				setChecking(false);
			};
			/** Start an upgrade to the latest version; poll until it settles. */
			const handleUpgrade = async () => {
				if (versionInfo?.latest === void 0) return;
				const spec = `dsh-session-buddy@${versionInfo.latest}`;
				if (!window.confirm(buddyT("buddy.settings.upgradeConfirm").replace("{spec}", spec))) return;
				setUpgrading(true);
				setUpgradeError(void 0);
				setUpgradeDone(false);
				const jobId = await startUpgrade(versionInfo.latest);
				if (jobId === void 0) {
					setUpgradeError(buddyT("buddy.settings.versionUnknown"));
					setUpgrading(false);
					return;
				}
				const job = await pollUpgrade(jobId);
				setUpgrading(false);
				if (job === void 0) setUpgradeError(buddyT("buddy.settings.versionUnknown"));
				else if (job.phase === "error") setUpgradeError(job.error ?? buddyT("buddy.settings.upgradeFailed"));
				else setUpgradeDone(true);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: open ? "dsb-settings-card dsb-settings-card-open" : "dsb-settings-card",
				"data-dsh-part": "session-buddy-settings-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsb-settings-header",
					"aria-expanded": open,
					"aria-label": open ? buddyT("buddy.settings.collapse") : buddyT("buddy.settings.expand"),
					onClick: () => {
						setOpen((current) => !current);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsb-settings-headText",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsb-settings-name",
							children: buddyT("buddy.settings.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsb-settings-description",
							children: buddyT("buddy.settings.description")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "14",
						height: "14",
						className: open ? "dsb-settings-chevron dsb-settings-chevron-open" : "dsb-settings-chevron",
						viewBox: "0 0 14 14",
						fill: "none",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
							fill: "currentColor"
						})
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsb-settings-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							dataPart: "buddy-setting-enabled",
							label: buddyT("buddy.settings.enabled"),
							checked: value.enabled,
							onChange: (next) => {
								set("enabled", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-group-label",
							children: buddyT("buddy.settings.notify")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							dataPart: "buddy-setting-notifyReply",
							label: buddyT("buddy.settings.notifyReply"),
							checked: value.notifyReply,
							onChange: (next) => {
								set("notifyReply", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							dataPart: "buddy-setting-notifyAsk",
							label: buddyT("buddy.settings.notifyAsk"),
							checked: value.notifyAsk,
							onChange: (next) => {
								set("notifyAsk", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							dataPart: "buddy-setting-notifyConfirm",
							label: buddyT("buddy.settings.notifyConfirm"),
							checked: value.notifyConfirm,
							onChange: (next) => {
								set("notifyConfirm", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							dataPart: "buddy-setting-sound",
							label: buddyT("buddy.settings.sound"),
							checked: value.sound,
							onChange: (next) => {
								set("sound", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-group-label",
							children: buddyT("buddy.settings.outline")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsb-settings-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsb-settings-label",
								children: buddyT("buddy.settings.outlineWidth")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
								dataPart: "buddy-setting-outlineWidth",
								value: value.outlineWidth,
								onChange: (next) => {
									set("outlineWidth", next);
								},
								options: WIDTH_PRESETS.map((p) => ({
									value: p.value,
									label: buddyT(p.labelKey)
								}))
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							dataPart: "buddy-setting-showTimestamps",
							label: buddyT("buddy.settings.showTimestamps"),
							checked: value.showTimestamps,
							onChange: (next) => {
								set("showTimestamps", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-group-label",
							children: buddyT("buddy.settings.version")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-field",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsb-settings-label",
								children: buddyT("buddy.settings.versionCurrent").replace("{version}", versionInfo?.current ?? "0.1.0")
							})
						}),
						versionInfo?.latest !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-field",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsb-settings-label",
								children: buddyT("buddy.settings.versionLatest").replace("{version}", versionInfo.latest)
							})
						}) : null,
						versionInfo !== void 0 && versionInfo.latest !== void 0 && versionInfo.updateAvailable === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-field",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsb-settings-label",
								children: buddyT("buddy.settings.upToDate")
							})
						}) : null,
						upgradeError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-field",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsb-settings-label",
								children: buddyT("buddy.settings.upgradeFailed").replace("{error}", upgradeError)
							})
						}) : null,
						upgradeDone ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsb-settings-field",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsb-settings-label",
								children: buddyT("buddy.settings.upgradeDone")
							})
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsb-settings-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsb-settings-seg-btn dsb-settings-seg-active",
								"data-dsh-part": "buddy-check-update",
								disabled: checking || upgrading,
								onClick: () => {
									handleCheckUpdate();
								},
								children: checking ? buddyT("buddy.settings.checking") : buddyT("buddy.settings.checkUpdate")
							}), versionInfo?.updateAvailable === true && versionInfo.latest !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsb-settings-seg-btn dsb-settings-seg-active",
								"data-dsh-part": "buddy-upgrade",
								disabled: checking || upgrading,
								onClick: () => {
									handleUpgrade();
								},
								children: upgrading ? buddyT("buddy.settings.upgrading") : buddyT("buddy.settings.upgrade").replace("{version}", versionInfo.latest)
							}) : null]
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Chinese copy. */
		const zh = {
			"buddy.outline.title": "会话目录",
			"buddy.outline.expand": "展开会话目录",
			"buddy.outline.collapse": "收起会话目录",
			"buddy.outline.more": "更早",
			"buddy.outline.bottom": "滚动到最新对话",
			"buddy.outline.empty": "对话太少，暂不显示目录",
			"buddy.notify.reply": "AI 回复完成",
			"buddy.notify.ask": "需要你回答",
			"buddy.notify.confirm": "需要你确认执行",
			"buddy.notify.title": "dsh 会话",
			"buddy.notify.click": "点击回到会话",
			"buddy.settings.title": "会话助手 @Shrbuz",
			"buddy.settings.description": "回复完成/待回答/待确认时通知，并提供会话内梯子目录。",
			"buddy.settings.expand": "展开设置: 会话助手 @Shrbuz",
			"buddy.settings.collapse": "收起设置: 会话助手 @Shrbuz",
			"buddy.settings.enabled": "启用会话助手",
			"buddy.settings.notify": "通知触发",
			"buddy.settings.notifyReply": "AI 回复完成时通知",
			"buddy.settings.notifyAsk": "需要你回答时通知",
			"buddy.settings.notifyConfirm": "需要确认执行命令时通知",
			"buddy.settings.sound": "通知提示音",
			"buddy.settings.outline": "梯子目录",
			"buddy.settings.outlineWidth": "细条长度",
			"buddy.settings.widthSmall": "短",
			"buddy.settings.widthMedium": "中",
			"buddy.settings.widthLarge": "长",
			"buddy.settings.showTimestamps": "提示中显示时间戳",
			"buddy.settings.version": "版本与升级",
			"buddy.settings.versionCurrent": "当前版本 {version}",
			"buddy.settings.versionLatest": "最新版本 {version}",
			"buddy.settings.versionUnknown": "无法检查更新（离线或网络不可达）",
			"buddy.settings.checkUpdate": "检查更新",
			"buddy.settings.checking": "检查中…",
			"buddy.settings.upToDate": "已是最新版本",
			"buddy.settings.upgrade": "升级到 {version}",
			"buddy.settings.upgrading": "升级中…（完成后请重启 dsh）",
			"buddy.settings.upgradeDone": "升级完成，请重启 dsh web 生效",
			"buddy.settings.upgradeFailed": "升级失败：{error}",
			"buddy.settings.upgradeConfirm": "将运行 dsh plugin add {spec}，升级完成后需要重启 dsh web。是否继续？"
		};
		/** English copy. */
		const en = {
			"buddy.outline.title": "Outline",
			"buddy.outline.expand": "Expand outline",
			"buddy.outline.collapse": "Collapse outline",
			"buddy.outline.more": "older",
			"buddy.outline.bottom": "Scroll to the latest message",
			"buddy.outline.empty": "Not enough turns yet for an outline",
			"buddy.notify.reply": "AI finished replying",
			"buddy.notify.ask": "Your input is needed",
			"buddy.notify.confirm": "Command approval needed",
			"buddy.notify.title": "dsh session",
			"buddy.notify.click": "Click to return to the session",
			"buddy.settings.title": "Session Buddy @Shrbuz",
			"buddy.settings.description": "Get notified on reply/ask/approval, plus an in-conversation ladder outline.",
			"buddy.settings.expand": "Expand settings: Session Buddy @Shrbuz",
			"buddy.settings.collapse": "Collapse settings: Session Buddy @Shrbuz",
			"buddy.settings.enabled": "Enable Session Buddy",
			"buddy.settings.notify": "Notifications",
			"buddy.settings.notifyReply": "Notify when the AI finishes replying",
			"buddy.settings.notifyAsk": "Notify when your input is needed",
			"buddy.settings.notifyConfirm": "Notify when command approval is needed",
			"buddy.settings.sound": "Notification sound",
			"buddy.settings.outline": "Ladder outline",
			"buddy.settings.outlineWidth": "Rung length",
			"buddy.settings.widthSmall": "Short",
			"buddy.settings.widthMedium": "Medium",
			"buddy.settings.widthLarge": "Long",
			"buddy.settings.showTimestamps": "Show timestamps in tooltips",
			"buddy.settings.version": "Version & upgrades",
			"buddy.settings.versionCurrent": "Current {version}",
			"buddy.settings.versionLatest": "Latest {version}",
			"buddy.settings.versionUnknown": "Could not check for updates (offline or unreachable)",
			"buddy.settings.checkUpdate": "Check for updates",
			"buddy.settings.checking": "Checking…",
			"buddy.settings.upToDate": "Up to date",
			"buddy.settings.upgrade": "Upgrade to {version}",
			"buddy.settings.upgrading": "Upgrading… (restart dsh when done)",
			"buddy.settings.upgradeDone": "Upgrade complete — restart dsh web to apply",
			"buddy.settings.upgradeFailed": "Upgrade failed: {error}",
			"buddy.settings.upgradeConfirm": "This runs dsh plugin add {spec}; restart dsh web after it finishes. Continue?"
		};
		/** Active dictionary, picked by the document language at call time. */
		function dictionary() {
			return (typeof document !== "undefined" ? document.documentElement.lang : "zh").toLowerCase().startsWith("en") ? en : zh;
		}
		/** Translate a key with optional `{name}` template params; a missing key degrades to the key itself. */
		function t(key, params) {
			let text = dictionary()[key] ?? key;
			if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* dsh-session-buddy styles — every token remaps to the OFFICIAL dsh design
		* tokens (`--dsw-alias-*` / `--dsw-shadow-*`), so the ladder outline and
		* settings card follow the active theme (light/dark) automatically, with
		* static fallbacks when a token is absent.
		* @module dsh-session-buddy/client/styles
		*/
		const BUDDY_CSS = `
/* ---- token aliases (theme-aware, fallback values) ---- */
/* Declared on :root (not just .dsb-root) so the FIXED elements that are
   portaled to document.body — the jump-to-latest button and the hover tooltip
   — still inherit the theme tokens. portal() moves them out of .dsb-root, so
   a .dsb-root-scoped variable would not reach them. */
:root,
.dsb-root {
  --dsb-bg: var(--dsw-alias-bg-overlay, #e9ecf2);
  --dsb-bg-solid: var(--dsw-alias-bg-layer-2, #ffffff);
  --dsb-bg-hover: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
  --dsb-text-1: var(--dsw-alias-label-primary, #0f1115);
  --dsb-text-2: var(--dsw-alias-label-secondary, #61666b);
  --dsb-text-3: var(--dsw-alias-label-tertiary, #81858c);
  --dsb-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  --dsb-primary: var(--dsw-alias-state-business-primary, #4176e6);
  --dsb-primary-weak: var(--dsw-alias-state-business-weak, rgba(65, 118, 230, 0.14));
  --dsb-tooltip-bg: var(--dsw-alias-tooltip-bg, #2c2c2e);
  --dsb-tooltip-text: var(--dsw-alias-tooltip-fg, #f5f5f7);
  --dsb-shadow: var(--dsw-shadow-lv2, 0 8px 24px rgba(0, 0, 0, 0.1));
}

/* ---- ladder outline rail ---- */
/* Anchored to the conversation scrollport's right edge (via inline left),
   so it follows the conversation when another plugin's right sidebar expands
   and squeezes it. Always visible — no expand/collapse. */
.dsb-outline {
  box-sizing: border-box;
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  /* Below the official modal layer (z-index 1000 — settings dialog), so the
     ladder never covers the settings popup; still above conversation content
     (official z-index max 101). Tooltip uses 901 to stay above the rail. */
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 30px;
  /* No horizontal padding: the rung hit area spans the whole shell, so the
     blank band beside the thin strip also counts as hover (easier to aim). */
  padding: 10px 0;
  border: 1px solid var(--dsb-border);
  border-radius: 12px;
  background: var(--dsb-bg-solid);
  box-shadow: var(--dsb-shadow);
  transition: opacity 0.16s ease, left 0.16s ease;
}
.dsb-outline-empty { display: none; }

/* Internal scrollable rung list (dozens/hundreds of turns). The vertical
   padding gives the first/last rungs breathing room inside the scroll
   container (the hover pulse grows them; without it the top rung gets
   clipped by overflow).
   The scrollbar is hidden entirely — it takes ~8px of a 30px rail, shifts
   the rungs on mount, and its appear/disappear causes the hover flicker. The
   top/bottom fade shadows (see the -can-top / -can-bottom classes) tell the
   user there is more above/below instead. */
.dsb-outline-list {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-height: min(60vh, 480px);
  overflow-y: auto;
  padding: 10px 0;
  /* Hide the scrollbar in all engines (still scrollable via wheel/drag). */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.dsb-outline-list::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* Top/bottom fade shadows: a soft gradient from the rail background to
   transparent, drawn INSIDE the list's edges, telling the user there are
   more rungs above/below. They are pseudo-elements of the (position:relative)
   list, so they stay fixed to the edges while the content scrolls underneath.
   Only shown while that direction can actually scroll (JS sets the class). */
.dsb-outline-list-can-top::before,
.dsb-outline-list-can-bottom::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 18px;
  pointer-events: none;
  z-index: 2;
}
.dsb-outline-list-can-top::before {
  top: 0;
  background: linear-gradient(to bottom, var(--dsb-bg-solid), transparent);
}
.dsb-outline-list-can-bottom::after {
  bottom: 0;
  background: linear-gradient(to top, var(--dsb-bg-solid), transparent);
}

/* One ladder rung: the BUTTON is a full-width invisible hit area (so the blank
   band on either side of the strip counts as hover), and the visible 8px strip
   is drawn by the ::before pseudo-element, centered. Height from --dsb-rung-h. */
.dsb-outline-rung {
  appearance: none;
  border: 0;
  cursor: pointer;
  flex: none;
  position: relative;
  width: 100%;
  height: var(--dsb-rung-h, 18px);
  background: transparent;
  padding: 0;
}
.dsb-outline-rung::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleY(1);
  width: 8px;
  border-radius: 4px;
  background: var(--dsb-bg-hover);
  /* Background + glow are direct hover properties (NOT animation-driven), so
     they transition smoothly out on hover-leave. The breathe animation only
     nudges scaleY, whose exit snap is a subtle ~2px — much less jarring than
     the old hard stop of color + glow + scale together. */
  transition: background-color 0.3s ease, box-shadow 0.35s ease;
}
.dsb-outline-rung:hover::before {
  background: var(--dsb-primary-weak);
}
.dsb-outline-rung-active::before {
  background: var(--dsb-primary);
}

/* Footer chip: clickable "load older" that pages the history window. */
.dsb-outline-footer {
  appearance: none;
  border: 0;
  font: inherit;
  flex: none;
  margin-top: 2px;
  width: 100%;
  text-align: center;
  font-size: 9px;
  line-height: 14px;
  color: var(--dsb-text-3);
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.dsb-outline-footer:hover { opacity: 1; color: var(--dsb-text-1); }
.dsb-outline-footer:disabled { opacity: 0.4; cursor: default; }

/* Jump-to-latest: an absolutely-positioned child of the rail, hanging just
   below it. As a child it follows the rail's position automatically (moving
   with the rail when a sidebar squeezes the conversation) and stays centered
   on the rail. Shown only when the transcript is not at the bottom. */
.dsb-outline-bottom {
  box-sizing: border-box;
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  appearance: none;
  font: inherit;
  width: 30px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid var(--dsb-border);
  background: var(--dsb-bg-solid);
  color: var(--dsb-text-2);
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  box-shadow: var(--dsb-shadow);
  z-index: 900;
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.dsb-outline-bottom svg { display: block; }
.dsb-outline-bottom:hover {
  background: var(--dsb-bg-hover);
  color: var(--dsb-text-1);
  border-color: var(--dsb-primary);
}
.dsb-outline-bottom:active { transform: translateX(-50%) scale(0.96); }

/* Breathing on hover: a subdued pulse on the hovered rung (kept gentle so it
   reads as "you are here" without being distracting). Only scaleY is animated;
   the background + glow are transitioned hover properties so leaving the hover
   state fades them out smoothly instead of snapping. */
.dsb-outline-rung-hover::before {
  background: var(--dsb-primary);
  box-shadow: 0 0 0 3px var(--dsb-primary-weak);
  animation: dsb-outline-breathe 1.6s ease-in-out infinite;
}
@keyframes dsb-outline-breathe {
  /* translateX(-50%) keeps the strip centered — the ::before is positioned at
     left:50%, so an animation transform without it would shift the strip. */
  0%, 100% { transform: translateX(-50%) scaleY(1); }
  50% { transform: translateX(-50%) scaleY(1.12); }
}

/* Hover tooltip (floating, does not affect layout). */
.dsb-outline-flash {
  animation: dsb-outline-flash 1.1s ease;
}
@keyframes dsb-outline-flash {
  0% { box-shadow: 0 0 0 0 var(--dsb-primary-weak); }
  40% { box-shadow: 0 0 0 8px var(--dsb-primary-weak); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.dsb-outline-tooltip {
  position: fixed;
  /* top/right come inline from the hovered rung's position; the tooltip's
     right edge sits just left of the rung, vertically centered on it. */
  transform: translateY(-50%);
  max-width: 260px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--dsb-tooltip-bg);
  color: var(--dsb-tooltip-text);
  box-shadow: var(--dsb-shadow);
  font-size: 12px;
  line-height: 16px;
  z-index: 901;
  pointer-events: none;
}
.dsb-outline-tooltip-num {
  flex: none;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.dsb-outline-tooltip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsb-outline-tooltip-time {
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.65;
}

/* ---- settings card (official collapsible plugin-card pattern) ---- */
.dsb-settings-card {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  background: var(--dsw-alias-bg-layer-3, #ffffff);
  border-radius: 12px;
  list-style: none;
  transition: border-color 0.16s, background 0.16s;
}
.dsb-settings-card-open {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-color: var(--dsw-alias-label-dimmed, #adb2b8);
}
.dsb-settings-header {
  appearance: none;
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 12px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  display: flex;
}
.dsb-settings-headText { flex-direction: column; flex: 1; gap: 4px; min-width: 0; display: flex; }
.dsb-settings-name {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.dsb-settings-description {
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 13px;
  line-height: 1.5;
}
.dsb-settings-chevron {
  color: var(--dsw-alias-label-tertiary, #81858c);
  flex: none;
  transition: transform 0.16s;
}
.dsb-settings-chevron-open { transform: rotate(180deg); }
.dsb-settings-body {
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  margin: 0 16px;
  padding-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsb-settings-group-label {
  color: var(--dsw-alias-label-caption, #adb2b8);
  font-size: 12px;
  line-height: 18px;
  margin: 10px 0 2px;
  font-weight: 600;
}
.dsb-settings-field { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
.dsb-settings-field-switch { justify-content: space-between; }
.dsb-settings-label { color: var(--dsw-alias-label-primary, #0f1115); font-size: 13px; line-height: 20px; }

.dsb-settings-switch { position: relative; display: inline-block; width: 34px; height: 20px; flex: none; }
.dsb-settings-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.dsb-settings-switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, 0.12));
  transition: background-color 0.16s;
  cursor: pointer;
}
.dsb-settings-switch-track:before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  top: 2px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-inverted, #ffffff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.16s;
}
.dsb-settings-switch input:checked + .dsb-settings-switch-track { background: var(--dsw-alias-state-business-primary, #4176e6); }
.dsb-settings-switch input:checked + .dsb-settings-switch-track:before { transform: translateX(14px); }

/* Segmented (tab-style) picker for the outline width preset. */
.dsb-settings-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
}
.dsb-settings-seg-btn {
  appearance: none;
  border: 0;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #61666b);
  cursor: pointer;
  background: transparent;
  border-radius: 6px;
  padding: 3px 10px;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.dsb-settings-seg-btn:hover { color: var(--dsw-alias-label-primary, #0f1115); }
.dsb-settings-seg-active {
  background: var(--dsw-alias-label-primary-inverted, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
`;
		//#endregion
		//#region src/client/dom.ts
		/**
		* dsh-session-buddy DOM layer — the single place that knows how to read the
		* official dsh conversation DOM. Selectors here are CONFIRMED by the CDP probe
		* (scripts/cdp-probe.mjs) against the real dsh web page on 2026-08-23:
		*
		* - `[data-chat-anchor-key]` — one row per routed conversation node.
		* - `[data-chat-flow-key]` — equals the anchor key (durable id).
		* - `[data-chat-flow-kind]` — the stable ROLE marker:
		*     `user`        → a real user question turn (right-aligned bubble) ✓
		*     `steering`    → an interrupting user question (also a user turn) ✓
		*     `context`     → injected context rows (NOT user turns) — exclude ✗
		*     `assistant-step` → an AI reply step
		*     `tool-call` / `turn-tail` / `model-retry` / `command` → not user turns
		* - `[data-conversation-scroll]` — the session scrollport.
		* - `[data-composer-seat]` — the composer seat.
		* - Session title: `button.wSkVaW_crumb.wSkVaW_crumbCurrent` in the page
		*   header (breadcrumb); hash-classed, so matched by role + position.
		*
		* All read helpers are defensive: an absent marker degrades to a safe default
		* instead of throwing.
		*
		* @module dsh-session-buddy/client/dom
		*/
		/** Official stable DOM markers (CDP-confirmed). */
		const SELECTORS = {
			/** The session scroll container. */
			scrollport: "[data-conversation-scroll]",
			/** One row per routed message node. */
			anchorRow: "[data-chat-anchor-key]",
			/** The composer seat. */
			composerSeat: "[data-composer-seat]",
			/** Approval / confirmation dialog (role-based; needs CDP confirmation). */
			dialog: "[role=\"dialog\"]",
			/** The session-title breadcrumb button in the header (hash-classed). */
			titleCrumb: "button[class*=\"crumbCurrent\"], button[class*=\"crumb\"]"
		};
		/** `data-chat-flow-kind` values that ARE user question turns. */
		const USER_KINDS$1 = /* @__PURE__ */ new Set(["user", "steering"]);
		/** The scrollport of the current session, if present. */
		function findScrollport(root = document) {
			return root.querySelector(SELECTORS.scrollport);
		}
		/** All anchor rows in document order (CDP-confirmed: order = chat order). */
		function findAnchorRows(root = document) {
			return [...root.querySelectorAll(SELECTORS.anchorRow)];
		}
		/**
		* Is this anchor row a USER question turn? Uses the CDP-confirmed
		* `data-chat-flow-kind` marker: `user` and `steering` are real user turns;
		* everything else (context / assistant-step / tool-call / …) is not.
		*/
		function isUserRow(row) {
			const kind = row.getAttribute("data-chat-flow-kind");
			return kind !== null && USER_KINDS$1.has(kind);
		}
		/**
		* Whether the agent is STILL generating. The harness swaps the composer's
		* primary button to a square "stop" icon — an SVG `<rect>` — while `running`,
		* and back to the send arrow (`<path>`) once the reply settles. That rect is
		* the authoritative, locale-free "not done yet" signal: it tracks the harness's
		* own running state, so a reply is never reported complete during a thinking
		* pause. `[data-streaming]` is kept as a belt-and-suspenders check for views
		* that expose it.
		*/
		function isStreaming(root = document) {
			if (root.querySelector("[data-composer-seat] button[class*=\"primary\"] svg rect") !== null) return true;
			return root.querySelector("[data-streaming]") !== null;
		}
		/** Whether the composer seat is present (i.e. a session is open and editable). */
		function hasComposerSeat(root = document) {
			return root.querySelector(SELECTORS.composerSeat) !== null;
		}
		/**
		* Whether an approval/confirmation dialog is currently open.
		* @todo CDP probe: confirm `[role="dialog"]` catches the approval panel; if
		* not, this selector is refined in this one file.
		*/
		function hasOpenDialog(root = document) {
			return root.querySelector(SELECTORS.dialog) !== null;
		}
		/** Locate the anchor row for a given anchor key (for scrollIntoView). */
		function anchorRowByKey(root, key) {
			return root.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`);
		}
		/**
		* Read the current session title from the header breadcrumb (CDP-confirmed:
		* `button[class*="crumbCurrent"]` inside the page header above the scrollport).
		* Falls back to `undefined` so the notification uses its default title.
		*/
		function readSessionTitle(root = document) {
			const buttons = root.querySelectorAll(SELECTORS.titleCrumb);
			const crumb = [...buttons].find((b) => (b.className ?? "").toString().includes("crumbCurrent")) ?? [...buttons].at(-1);
			if (crumb === void 0) return void 0;
			const text = crumb.textContent?.trim();
			return text !== void 0 && text !== "" ? text : void 0;
		}
		//#endregion
		//#region src/client/events.ts
		/** Create the initial classifier state. */
		function createClassifierState() {
			return {
				notifiedKinds: /* @__PURE__ */ new Set(),
				hiddenDuringTurn: false
			};
		}
		/**
		* Classify a fresh snapshot into events. Pure: same input → same output for a
		* given state. Events are only emitted on a rising edge (a new settled turn,
		* input-wait turning on, approval appearing), and each trigger kind fires at
		* most once per settled turn.
		*
		* @param state - mutable classifier state (dedupe + edge tracking).
		* @param snapshot - the current DOM facts.
		* @returns events to act on (usually 0 or 1).
		*/
		function classifySnapshot(state, snapshot) {
			const events = [];
			const hiddenNow = snapshot.hidden === true;
			if (state.last === void 0) state.hiddenDuringTurn = hiddenNow;
			else if (snapshot.latestUserKey !== state.last.latestUserKey) state.hiddenDuringTurn = hiddenNow;
			else state.hiddenDuringTurn = state.hiddenDuringTurn || hiddenNow;
			const newSettled = [];
			for (const key of snapshot.settledAssistantKeys) if (state.last !== void 0 && !state.last.settledAssistantKeys.has(key)) newSettled.push(key);
			if (state.last === void 0) {
				for (const key of snapshot.settledAssistantKeys) state.notifiedKinds.add("reply");
				if (snapshot.pendingInteraction === "question") state.notifiedKinds.add("ask");
				if (snapshot.approvalPending || snapshot.pendingInteraction === "approval") state.notifiedKinds.add("confirm");
				state.lastReplyUserKey = snapshot.latestUserKey;
				state.lastAskUserKey = snapshot.latestUserKey;
			}
			if (!snapshot.generating) for (const key of newSettled) {
				if (key === snapshot.latestSettledKey && state.lastReplyUserKey !== snapshot.latestUserKey) {
					events.push({
						kind: "reply",
						summary: snapshot.latestReplySummary ?? "",
						title: snapshot.title,
						anchorKey: key,
						wasHidden: state.hiddenDuringTurn
					});
					state.lastReplyUserKey = snapshot.latestUserKey;
				}
				state.notifiedKinds.add("reply");
			}
			const questionPending = snapshot.pendingInteraction === "question";
			if (questionPending && !state.notifiedKinds.has("ask") && state.lastAskUserKey !== snapshot.latestUserKey) {
				events.push({
					kind: "ask",
					summary: "",
					title: snapshot.title
				});
				state.notifiedKinds.add("ask");
				state.lastAskUserKey = snapshot.latestUserKey;
			}
			if (!questionPending) state.notifiedKinds.delete("ask");
			const approvalPending = snapshot.approvalPending || snapshot.pendingInteraction === "approval";
			if (approvalPending && !state.notifiedKinds.has("confirm")) {
				events.push({
					kind: "confirm",
					summary: "",
					title: snapshot.title
				});
				state.notifiedKinds.add("confirm");
			}
			if (!approvalPending) state.notifiedKinds.delete("confirm");
			state.last = snapshot;
			return events;
		}
		//#endregion
		//#region src/client/listener.ts
		/**
		* dsh-session-buddy session listener — wires the pure event classifier to the
		* live dsh DOM with a MutationObserver. It watches the session scrollport
		* (`[data-conversation-scroll]`) plus the document root for structural
		* changes, rebuilds a snapshot via the DOM layer, and forwards classified
		* events to a callback. All event decisions live in events.ts (pure); this
		* file is only transport + stability detection + debounce.
		*
		* @module dsh-session-buddy/client/listener
		*/
		/** How long an assistant row must stay unchanged before it counts as settled. */
		const SETTLED_GRACE_MS = 1200;
		/**
		* The session listener. Returns a dispose function that tears down the
		* observers. Call once per page lifetime.
		*/
		function startSessionListener(options) {
			const state = createClassifierState();
			/** key → signature last observed for that anchor row. */
			let lastSignature = /* @__PURE__ */ new Map();
			let disposed = false;
			/** Pending "re-check soon" timer so rows that STOPPED mutating (reply done)
			* still get re-evaluated as settled even with no further DOM mutation. */
			let settleTimer;
			/** A stable content signature for one row (text + height). */
			function signatureOf(row) {
				return (row.textContent ?? "") + "|" + row.getBoundingClientRect().height;
			}
			/** Rebuild a snapshot from the current DOM and classify it. */
			function rebuildAndClassify() {
				if (disposed) return;
				const generating = isStreaming(document);
				const rows = findAnchorRows(document);
				const settled = /* @__PURE__ */ new Set();
				const streaming = /* @__PURE__ */ new Set();
				let latestReplySummary;
				let latestSettledKey;
				let latestUserKey;
				for (const row of rows) {
					const key = row.getAttribute("data-chat-anchor-key");
					if (key === null || key === "") continue;
					if (isUserRow(row)) {
						latestUserKey = key;
						continue;
					}
					const sig = signatureOf(row);
					const prev = lastSignature.get(key);
					lastSignature.set(key, sig);
					if (generating) {
						streaming.add(key);
						continue;
					}
					if (prev !== void 0 && sig === prev) {
						settled.add(key);
						latestSettledKey = key;
						latestReplySummary = (row.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
						continue;
					}
					streaming.add(key);
				}
				const snapshot = {
					settledAssistantKeys: settled,
					streamingAssistantKeys: streaming,
					waitingForInput: hasComposerSeat(document) && streaming.size === 0 && !generating,
					approvalPending: hasOpenDialog(document),
					latestReplySummary,
					latestSettledKey,
					latestUserKey,
					title: readSessionTitle(document),
					generating,
					hidden: document.hidden,
					pendingInteraction: options.readPendingInteraction?.()
				};
				for (const event of classifySnapshot(state, snapshot)) options.onEvent(event);
				if (generating) armSettleCheck();
			}
			/** Re-run classification after the grace window when there are unsettled rows. */
			function armSettleCheck() {
				if (settleTimer !== void 0 || disposed) return;
				settleTimer = setTimeout(() => {
					settleTimer = void 0;
					rebuildAndClassify();
				}, SETTLED_GRACE_MS);
			}
			const onMutation = () => {
				rebuildAndClassify();
			};
			const rootObserver = new MutationObserver(onMutation);
			rootObserver.observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
				attributeFilter: ["data-streaming"]
			});
			let scrollportObserver;
			function ensureScrollport() {
				scrollportObserver?.disconnect();
				scrollportObserver = void 0;
				const scrollport = findScrollport(document);
				if (scrollport === null) return;
				scrollportObserver = new MutationObserver(onMutation);
				scrollportObserver.observe(scrollport, {
					childList: true,
					subtree: true,
					characterData: true,
					attributes: true,
					attributeFilter: ["data-streaming"]
				});
			}
			ensureScrollport();
			const onVisibilityChange = () => {
				rebuildAndClassify();
			};
			document.addEventListener("visibilitychange", onVisibilityChange);
			queueMicrotask(rebuildAndClassify);
			return () => {
				disposed = true;
				if (settleTimer !== void 0) {
					clearTimeout(settleTimer);
					settleTimer = void 0;
				}
				rootObserver.disconnect();
				scrollportObserver?.disconnect();
				document.removeEventListener("visibilitychange", onVisibilityChange);
			};
		}
		//#endregion
		//#region src/client/notifier.ts
		/**
		* dsh-session-buddy notification module — notification delivery while the tab
		* is hidden:
		* 1. A native OS toast fired through the host (POST /api/session-buddy/toast),
		*    which pops a real system banner (PowerShell WinRT / osascript /
		*    notify-send) with NO browser notification permission required and no
		*    Chrome/OS toast suppression.
		* 2. A cross-tab marker while hidden: a red-dot favicon + `(●)` title badge,
		*    so there is a visible cue even when the OS banner is unavailable.
		* 3. Optional short sound (default off, configurable), rate-limited so a
		*    burst of notifications (reply + ask) doesn't machine-gun the beep.
		*
		* Notifications only fire while the tab is hidden (`document.hidden`), and a
		* single turn fires at most once (the classifier already dedupes; this module
		* additionally guards against edge-triggered double delivery).
		*
		* @module dsh-session-buddy/client/notifier
		*/
		/** Host route that pops a native OS toast (loopback-only, no auth). */
		const TOAST_ROUTE = "/api/session-buddy/toast";
		/** Favicon badge text (a red dot). */
		const FAVICON_BADGE = "●";
		/** A red-dot icon (SVG data URI, no asset) overlaid on the tab's favicon so a
		*  background tab is visibly marked across the tab strip / taskbar. */
		const RED_DOT_FAVICON = "data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><circle cx=\"8\" cy=\"8\" r=\"8\" fill=\"%23ff3b30\"/></svg>";
		/** Min gap between beeps, so a burst of notifications (reply + ask) doesn't
		* machine-gun the sound. */
		const SOUND_COOLDOWN_MS = 2500;
		/** Timestamp of the last beep. */
		let lastBeepAt = 0;
		/** One short beep, generated with the Web Audio API (no asset needed). Rate-
		* limited so rapid notification bursts don't produce a staccato of beeps. */
		function playBeep() {
			const now = Date.now();
			if (now - lastBeepAt < SOUND_COOLDOWN_MS) return;
			lastBeepAt = now;
			try {
				const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
				if (AudioContextClass === void 0) return;
				const ctx = new AudioContextClass();
				const oscillator = ctx.createOscillator();
				const gain = ctx.createGain();
				oscillator.connect(gain);
				gain.connect(ctx.destination);
				oscillator.frequency.value = 880;
				oscillator.type = "sine";
				gain.gain.setValueAtTime(.001, ctx.currentTime);
				gain.gain.exponentialRampToValueAtTime(.2, ctx.currentTime + .02);
				gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .25);
				oscillator.start();
				oscillator.stop(ctx.currentTime + .28);
				oscillator.onended;
				setTimeout(() => {
					ctx.close().catch(() => {});
				}, 500);
			} catch {}
		}
		/** Fire-and-forget native OS toast through the host route. Resolves true when
		*  the host fired the toast — i.e. this tab won the cross-tab claim (or no
		*  claim key was supplied) — and false when another tab already notified this
		*  episode (host answers 409) or the host was unreachable. Best-effort. */
		async function sendNativeToast(title, body, claimKey) {
			try {
				return (await fetch(TOAST_ROUTE, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(claimKey !== void 0 && claimKey !== "" ? {
						title,
						body,
						claimKey
					} : {
						title,
						body
					})
				})).ok;
			} catch {
				return false;
			}
		}
		/** Current marker state, or undefined when no marker is active. */
		let marker;
		/** Apply the red-dot favicon + title badge. Idempotent: re-activation just
		* re-applies, never double-stacking the title prefix. Persists until the tab
		* comes back to the foreground (see the visibilitychange listener below). */
		function applyMarker() {
			if (!document.hidden) return;
			if (marker === void 0) {
				let icon = document.querySelector("link[rel~=\"icon\"]");
				let created = false;
				if (icon === null) {
					icon = document.createElement("link");
					icon.rel = "icon";
					document.head.appendChild(icon);
					created = true;
				}
				marker = {
					originalTitle: document.title,
					icon,
					originalHref: icon.href !== "" ? icon.href : void 0,
					createdIcon: created
				};
			}
			const m = marker;
			document.title = `(${FAVICON_BADGE}) ${m.originalTitle}`;
			if (m.icon.href !== RED_DOT_FAVICON) m.icon.href = RED_DOT_FAVICON;
		}
		/** Restore the original title and favicon. */
		function clearMarker() {
			if (marker === void 0) return;
			const m = marker;
			marker = void 0;
			document.title = m.originalTitle;
			if (m.createdIcon) m.icon.remove();
			else if (m.originalHref !== void 0) m.icon.href = m.originalHref;
		}
		window.addEventListener("visibilitychange", () => {
			if (!document.hidden) clearMarker();
		});
		/**
		* Deliver one notification (respecting the hidden-tab gate): native OS toast
		* via the host + red-dot/title marker + (only when this tab wins the claim)
		* optional rate-limited beep. Resolves true when the native toast was
		* dispatched; false when gated by visibility or already claimed elsewhere.
		*/
		async function notify(options) {
			if (!document.hidden && options.forceHidden !== true) return false;
			const native = await sendNativeToast(options.title, options.body, options.claimKey);
			applyMarker();
			if (native && options.sound) playBeep();
			return native;
		}
		//#endregion
		//#region src/client/session-source.ts
		/** The user-turn node kinds that count as outline rungs. */
		const USER_KINDS = /* @__PURE__ */ new Set(["user", "steering"]);
		/** Collect rungs from the current conversation snapshot (in-window user turns).
		* The snapshot's `nodes` (raw Session-event projection) carries the user turns
		* (kind 'user' / 'steering') with content + time. DOM anchor keys are NOT on
		* the snapshot nodes — they are aligned later via `alignRungKeys` once the
		* transcript has rendered (see below). Until then each rung keeps a stable
		* seq-based placeholder key. */
		function collectRungsFromSnapshot(snapshot) {
			const nodes = snapshot.nodes ?? [];
			const rungs = [];
			for (const node of nodes) {
				if (!USER_KINDS.has(node.kind)) continue;
				const text = node.content?.map((b) => b.text ?? "").join(" ").replace(/\s+/g, " ").trim();
				const summary = text !== void 0 && text !== "" ? text.length > 60 ? text.slice(0, 60) + "…" : text : "…";
				rungs.push({
					key: `seq:${node.seq}`,
					summary,
					time: node.time ?? Date.now(),
					seq: node.seq
				});
			}
			return rungs;
		}
		/** Align rung keys with the rendered transcript. The Nth snapshot user turn
		* maps to the Nth DOM user row (same chronological order); a row whose text
		* contains the rung summary is the best-effort fallback for mismatches. Called
		* from render time, when the DOM has caught up with the snapshot. Mutates and
		* returns the given array (key field). */
		function alignRungKeys(rungs) {
			const domRows = [...document.querySelectorAll("[data-chat-flow-kind=\"user\"], [data-chat-flow-kind=\"steering\"]")];
			const byText = /* @__PURE__ */ new Map();
			for (const row of domRows) {
				const key = row.getAttribute("data-chat-anchor-key");
				if (key === null) continue;
				const text = (row.textContent ?? "").replace(/\s+/g, " ").trim();
				if (text !== "") byText.set(text.slice(0, 40), key);
			}
			for (let i = 0; i < rungs.length; i += 1) {
				const rung = rungs[i];
				const domKey = domRows[i]?.getAttribute("data-chat-anchor-key");
				if (domKey !== void 0 && domKey !== null && domKey !== "") {
					rung.key = domKey;
					continue;
				}
				const prefix = rung.summary.slice(0, 40);
				if (prefix !== "…" && byText.has(prefix)) rung.key = byText.get(prefix) ?? rung.key;
			}
			return rungs;
		}
		/** Resolve the current session face (or undefined when none is open). */
		function currentSessionFace(sessions) {
			const id = sessions.list.getSnapshot().current;
			if (id === void 0) return void 0;
			const scopeCtx = sessions.scope(id);
			if (scopeCtx === void 0) return void 0;
			return sessions.sessionOf(scopeCtx);
		}
		/**
		* Live session data source. Subscribes to the current session's snapshot and
		* emits the in-window rungs on every change. Call once per page lifetime.
		* @returns a disposer and the paging controls.
		*/
		function createSessionSource(sessions, handlers) {
			let currentFace;
			let sessionUnsubscribe;
			let listUnsubscribe;
			let disposed = false;
			const emit = () => {
				if (disposed) return;
				if (currentFace === void 0) {
					handlers.onRungs([]);
					handlers.onStatus({
						count: 0,
						hasMore: false,
						loadingOlder: false,
						pending: false
					});
					return;
				}
				const snapshot = currentFace.getSnapshot();
				const rungs = collectRungsFromSnapshot(snapshot);
				handlers.onRungs(rungs);
				handlers.onStatus({
					count: rungs.length,
					hasMore: snapshot.hasMore ?? false,
					loadingOlder: snapshot.loadingOlder ?? false,
					pending: snapshot.openState !== "open"
				});
			};
			const bindSession = (face) => {
				if (sessionUnsubscribe !== void 0) {
					sessionUnsubscribe();
					sessionUnsubscribe = void 0;
				}
				currentFace = face;
				if (face !== void 0) sessionUnsubscribe = face.subscribe(() => emit());
				emit();
			};
			const refreshCurrent = () => {
				if (disposed) return;
				const id = sessions.list.getSnapshot().current;
				if (id === void 0) {
					handlers.onSessionId?.(void 0);
					bindSession(void 0);
					return;
				}
				handlers.onSessionId?.(id);
				if (currentFace !== void 0 && currentFace.sessionId === id) return;
				bindSession(currentSessionFace(sessions));
			};
			listUnsubscribe = sessions.list.subscribe(() => refreshCurrent());
			refreshCurrent();
			/** Page the history window backwards until the given seq is inside it. */
			const loadOlderUntilSeq = async (seq) => {
				if (currentFace === void 0) return;
				for (let guard = 0; guard < 64; guard += 1) {
					const snapshot = currentFace.getSnapshot();
					if ((snapshot.nodes ?? []).some((n) => n.seq <= seq)) return;
					if (!(snapshot.hasMore ?? false)) return;
					if (snapshot.loadingOlder === true) {
						await new Promise((resolve) => setTimeout(resolve, 150));
						continue;
					}
					await currentFace.loadOlder();
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
			};
			/** Page one more older window (the footer's "load older" action). */
			const loadOlderOnce = async () => {
				if (currentFace === void 0) return;
				const snapshot = currentFace.getSnapshot();
				if (!(snapshot.hasMore ?? false) || snapshot.loadingOlder === true) return;
				await currentFace.loadOlder();
				await new Promise((resolve) => setTimeout(resolve, 200));
			};
			return {
				dispose: () => {
					disposed = true;
					listUnsubscribe?.();
					sessionUnsubscribe?.();
				},
				loadOlderUntilSeq,
				loadOlderOnce
			};
		}
		//#endregion
		//#region src/client/sse.ts
		/** The SSE endpoint the host exposes (must match src/index.ts EVENTS_ROUTE). */
		const EVENTS_ROUTE = "/api/session-buddy/events";
		/** Transition log, seeded with the state at module load. */
		const visibilityTransitions = [{
			at: Date.now(),
			hidden: document.hidden
		}];
		function recordVisibility() {
			const hidden = document.hidden;
			if (hidden === visibilityTransitions[visibilityTransitions.length - 1].hidden) return;
			visibilityTransitions.push({
				at: Date.now(),
				hidden
			});
			if (visibilityTransitions.length > 512) visibilityTransitions.splice(0, visibilityTransitions.length - 512);
		}
		document.addEventListener("visibilitychange", recordVisibility);
		/**
		* Whether the tab was hidden at any point during [start, now]. Pure + exported
		* for unit tests.
		*/
		function wasHiddenSince(start, now = Date.now()) {
			if (start > now) return false;
			for (let i = 0; i < visibilityTransitions.length; i += 1) {
				if (!visibilityTransitions[i].hidden) continue;
				const begin = visibilityTransitions[i].at;
				const end = i + 1 < visibilityTransitions.length ? visibilityTransitions[i + 1].at : now;
				if (begin <= now && end >= start) return true;
			}
			return false;
		}
		/**
		* Open the SSE stream. EventSource auto-reconnects; `onStatus` reports
		* connection state so the owner can fall back to DOM observation while the
		* stream is down. Returns a disposer that closes the connection.
		*/
		function startBuddyEventStream(options) {
			const { onTrigger, onStatus } = options;
			let disposed = false;
			let source = null;
			const report = (connected) => {
				try {
					onStatus?.(connected);
				} catch {}
			};
			const connect = () => {
				if (disposed) return;
				source?.close();
				source = new EventSource(EVENTS_ROUTE);
				source.addEventListener("trigger", (raw) => {
					if (disposed) return;
					try {
						const data = JSON.parse(raw.data);
						if (data === null || typeof data !== "object" || typeof data.kind !== "string") return;
						onTrigger(data);
					} catch {}
				});
				source.onopen = () => {
					if (!disposed) report(true);
				};
				source.onerror = () => {
					report(false);
				};
			};
			connect();
			return () => {
				disposed = true;
				source?.close();
				source = null;
				report(false);
			};
		}
		//#endregion
		//#region src/client/session-delete.ts
		/**
		* dsh-session-buddy browser half — session health & clean deletion.
		*
		* dsh has no "delete session" action (the session row menu only offers fork /
		* archive; archive hides but keeps files). This module adds:
		*   1. A corrupt-session marker — the host reports which sessions fail the
		*      harness's own load validation (their history can't load), and each such
		*      row gets a small warning badge so you know which one to delete.
		*   2. A "删除会话" item injected into the session row's three-dot menu. The
		*      menu is dsh-internal (not slot-extensible), so the item is injected by
		*      cloning an existing menu item (structure-proof) — when the menu can't
		*      be located the injection degrades silently.
		*   3. A confirmation dialog, then a POST to the host which permanently
		*      deletes the session's on-disk data (frees disk space).
		*
		* @module dsh-session-buddy/client/session-delete
		*/
		/** Host routes (must match src/index.ts). */
		const SESSIONS_ROUTE = "/api/session-buddy/sessions";
		const DELETE_ROUTE = "/api/session-buddy/sessions/delete";
		/** React fiber internal property prefix (React 17+ stable convention). */
		const FIBER_KEY_RE = /^__reactFiber\$/;
		/** Read a session row's id from its React fiber (key = session id). */
		function readSessionIdFromRow(row) {
			let fiber = null;
			for (const key of Object.keys(row)) if (FIBER_KEY_RE.test(key)) {
				fiber = row[key];
				break;
			}
			let cur = fiber;
			for (let depth = 0; depth < 8 && cur !== null && cur !== void 0; depth++) {
				const f = cur;
				if (typeof f.key === "string" && f.key.length > 0) return f.key;
				cur = f.return;
			}
			return null;
		}
		/** Fetch the session health listing (id → corrupt). Never throws. */
		async function fetchSessionHealth() {
			const out = /* @__PURE__ */ new Map();
			try {
				const response = await fetch(SESSIONS_ROUTE, { cache: "no-store" });
				if (!response.ok) return out;
				const data = await response.json();
				for (const s of data.sessions ?? []) if (typeof s?.id === "string") out.set(s.id, s);
			} catch {}
			return out;
		}
		/** Ask the host to permanently delete a session. Resolves ok/error. */
		async function deleteSession(sessionId) {
			try {
				const response = await fetch(DELETE_ROUTE, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId })
				});
				const data = await response.json();
				if (response.ok && data.ok === true) return { ok: true };
				return {
					ok: false,
					error: data.error ?? `HTTP ${response.status}`
				};
			} catch {
				return {
					ok: false,
					error: "host-unreachable"
				};
			}
		}
		/** The marker attribute we place on corrupt session rows. */
		const CORRUPT_ATTR = "data-dsb-corrupt";
		const CORRUPT_CSS = `[${CORRUPT_ATTR}] {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: var(--dsw-alias-state-warn-primary, #e0a02e);
  cursor: default;
}
[${CORRUPT_ATTR}] svg { width: 12px; height: 12px; }
/* The injected "删除会话" item: the real danger styling comes from dsh's own
   Menu danger class (added at runtime); this rule is only a fallback if that
   class goes stale after a dsh upgrade (non-important, so dsh's class wins). */
[data-dsb-delete-item] {
  color: var(--dsw-alias-state-error-primary, #e5484d);
}
[data-dsb-delete-item] svg { color: inherit; }`;
		/** dsh's `IconWarningOutline16` (extracted from the installed web bundle) —
		*  a circle warning glyph, matching the UI's own icon language. */
		const WARNING_ICON = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 14 14\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M6.3002 3.32843L7.69986 3.32843L7.69986 7.79657H6.3002L6.3002 3.32843Z\" fill=\"currentColor\"/><path d=\"M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z\" fill=\"currentColor\"/><path d=\"M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z\" fill=\"currentColor\"/></svg>";
		/** The EXACT `IconTrashOutline16` path used by dsh's own "删除工作区" item
		*  (extracted from the installed web bundle). We swap only the path data into
		*  the cloned item's EXISTING `<svg>` — that element carries the menu item's
		*  `itemIcon` class, which is what gives dsh icons their fill/color; replacing
		*  the whole `<svg>` would lose that class and render nothing. */
		const TRASH_D = "M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z";
		/** The Menu item's danger class (dsh `Menu.module.css`: `danger = _danger_19372_193`).
		*  Adding it to the injected item makes it render with dsh's EXACT danger styling,
		*  identical to the workspace row's "删除工作区" item. */
		const DANGER_CLASS = "_danger_19372_193";
		/** Re-apply corrupt markers to every session row (idempotent). The ⚠ badge
		*  lives in the row's own status slot (`[class$="_slot"]`, where the status
		*  dots render) — for a corrupt session that slot has no live state to show,
		*  so the ⚠ is the natural occupant. Flat rows without a slot fall back to
		*  after the title. */
		function applyCorruptMarkers(rows, corrupt) {
			for (const row of rows) {
				const id = readSessionIdFromRow(row);
				const entry = id !== null ? corrupt.get(id) : void 0;
				let marker = row.querySelector(`[${CORRUPT_ATTR}]`);
				if (entry !== void 0 && entry.corrupt) {
					const wantTitle = `损坏：历史无法加载${entry.corruptReason ? `（${entry.corruptReason}）` : ""}，可在此菜单删除`;
					if (marker === null) {
						marker = document.createElement("span");
						marker.setAttribute(CORRUPT_ATTR, "true");
						marker.title = wantTitle;
						marker.innerHTML = WARNING_ICON;
						const slot = row.querySelector("[class$=\"_slot\"]");
						if (slot !== null) slot.replaceChildren(marker);
						else {
							const title = row.querySelector("[class$=\"_title\"]");
							if (title !== null) title.parentElement?.insertBefore(marker, title.nextSibling);
							else row.appendChild(marker);
						}
					} else if (marker.title !== wantTitle) marker.title = wantTitle;
				} else if (marker !== null) marker.remove();
			}
		}
		/** Locale labels that identify the SESSION menu (fork/archive items). */
		const SESSION_MENU_LABELS = [
			"归档会话",
			"分叉会话",
			"Archive session",
			"Fork session"
		];
		/** Find the open session-row menu's item container, or null. */
		function findSessionMenuContainer(root) {
			const candidates = root.querySelectorAll("button, [role=\"menuitem\"], [role=\"menuitemradio\"], [role=\"menuitemcheckbox\"]");
			for (const el of candidates) {
				const text = (el.textContent ?? "").trim();
				if (SESSION_MENU_LABELS.some((label) => text.includes(label))) {
					const parent = el.parentElement;
					if (parent !== null && parent !== document.body) return parent;
					return el;
				}
			}
			return null;
		}
		/** A single injected delete item element (kept for removal). */
		let injectedDeleteItem = null;
		/**
		* Build the injected "删除会话" item by cloning an existing menu item, so its
		* structure/styles always match the current dsh menu. The label and the icon
		* are replaced with the delete wording + a theme-red trash icon. Returns null
		* when no session menu is present.
		*/
		function ensureDeleteMenuItem(container, onDelete) {
			if (injectedDeleteItem !== null && injectedDeleteItem.parentElement === container) return injectedDeleteItem;
			removeDeleteMenuItem();
			const template = Array.from(container.children).find((child) => child instanceof HTMLElement && child.getAttribute("data-dsb-delete-item") !== "true" && (child.textContent ?? "").trim().length > 0);
			const clone = template instanceof HTMLElement ? template.cloneNode(true) : document.createElement("button");
			clone.setAttribute("data-dsb-delete-item", "true");
			clone.removeAttribute("aria-selected");
			clone.classList.add(DANGER_CLASS);
			const svg = clone.querySelector("svg");
			if (svg !== null) {
				svg.setAttribute("viewBox", "0 0 16 16");
				svg.setAttribute("width", "16");
				svg.setAttribute("height", "16");
				const paths = svg.querySelectorAll("path");
				if (paths.length > 0) {
					paths[0].setAttribute("d", TRASH_D);
					for (let i = 1; i < paths.length; i++) paths[i].remove();
				}
			}
			const label = "删除会话";
			const walkText = (node) => {
				for (const child of Array.from(node.childNodes)) {
					if (child.nodeType === Node.TEXT_NODE) {
						child.textContent = label;
						return;
					}
					if (child instanceof HTMLElement) walkText(child);
				}
			};
			if (template instanceof HTMLElement) walkText(clone);
			else clone.textContent = label;
			clone.title = "永久删除该会话的数据（释放磁盘）";
			clone.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				onDelete();
			});
			container.appendChild(clone);
			injectedDeleteItem = clone;
			return clone;
		}
		function removeDeleteMenuItem() {
			if (injectedDeleteItem !== null) {
				injectedDeleteItem.remove();
				injectedDeleteItem = null;
			}
		}
		/** Format a byte count as a short human string (e.g. "28 KB"). */
		function formatBytes(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return "";
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
			return `${(bytes / 1048576).toFixed(1)} MB`;
		}
		/**
		* Show a confirmation dialog before permanently deleting a session. Returns
		* true only when the user explicitly confirms the delete (Enter or the red
		* button). Escape / overlay click / Cancel resolve false. Standard alert
		* dialog semantics: role=alertdialog, aria-modal, labelled by the title.
		*/
		function confirmDelete(info) {
			return new Promise((resolve) => {
				const overlay = document.createElement("div");
				overlay.setAttribute("data-dsb-modal", "true");
				overlay.style.cssText = [
					"position:fixed;inset:0;z-index:9999;",
					"display:flex;align-items:center;justify-content:center;",
					"background:var(--dsw-alias-bg-mask-2, rgba(0,0,0,.45));",
					"padding:20px;"
				].join("");
				const card = document.createElement("div");
				card.setAttribute("role", "alertdialog");
				card.setAttribute("aria-modal", "true");
				card.setAttribute("aria-labelledby", "dsb-delete-title");
				card.setAttribute("aria-describedby", "dsb-delete-desc");
				card.style.cssText = [
					"width:min(440px, 100%);border-radius:14px;padding:20px 22px;",
					"background:var(--dsw-alias-bg-layer-2, #ffffff);color:var(--dsw-alias-label-primary);",
					"box-shadow:0 16px 48px rgba(0,0,0,.5);",
					"border:1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));",
					"font-size:14px;line-height:1.7;"
				].join("");
				const header = document.createElement("div");
				header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;";
				const warn = document.createElement("span");
				warn.style.cssText = "display:inline-flex;color:var(--dsw-alias-state-error-primary, #e5484d);";
				warn.innerHTML = WARNING_ICON;
				const title = document.createElement("div");
				title.id = "dsb-delete-title";
				title.textContent = "删除会话";
				title.style.cssText = "font-size:16px;font-weight:600;";
				header.append(warn, title);
				const body = document.createElement("div");
				body.id = "dsb-delete-desc";
				body.style.cssText = "color:var(--dsw-alias-label-secondary);margin-bottom:16px;";
				const lead = document.createElement("div");
				lead.textContent = "将永久删除该会话的全部数据，此操作无法撤销，并会释放磁盘空间。";
				const meta = document.createElement("div");
				meta.style.cssText = "margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1, rgba(127,127,127,.07));word-break:break-all;";
				const nameLine = info.title !== void 0 && info.title !== "" ? `会话：${info.title}\n` : "";
				const sizeLine = info.size !== void 0 && info.size > 0 ? `占用：${formatBytes(info.size)}` : "";
				meta.textContent = `${nameLine}ID：${info.sessionId}${sizeLine === "" ? "" : "\n" + sizeLine}`;
				meta.style.whiteSpace = "pre-wrap";
				body.append(lead, meta);
				const actions = document.createElement("div");
				actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";
				const cancel = document.createElement("button");
				cancel.type = "button";
				cancel.textContent = "取消";
				cancel.style.cssText = btnStyle();
				const del = document.createElement("button");
				del.type = "button";
				del.textContent = "删除";
				del.style.cssText = ["padding:6px 18px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;", "background:var(--dsw-alias-state-error-primary, #e5484d);color:#fff;"].join("");
				let done = false;
				const finish = (value) => {
					if (done) return;
					done = true;
					overlay.remove();
					document.removeEventListener("keydown", onKey);
					resolve(value);
				};
				function onKey(event) {
					if (event.key === "Escape") {
						event.preventDefault();
						finish(false);
					} else if (event.key === "Enter") {
						event.preventDefault();
						finish(true);
					}
				}
				cancel.addEventListener("click", () => finish(false));
				del.addEventListener("click", () => finish(true));
				overlay.addEventListener("click", (event) => {
					if (event.target === overlay) finish(false);
				});
				document.addEventListener("keydown", onKey);
				actions.append(cancel, del);
				card.append(header, body, actions);
				overlay.appendChild(card);
				document.body.appendChild(overlay);
				del.focus();
			});
		}
		function btnStyle() {
			return ["padding:6px 18px;border-radius:8px;border:1px solid var(--dsw-alias-border, rgba(127,127,127,.25));", "background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:14px;"].join("");
		}
		/** Start the corrupt-marker + menu-injection manager. Returns a disposer. */
		function startSessionDeleteManager(options = {}) {
			const corrupt = /* @__PURE__ */ new Map();
			let timer = 0;
			let disposed = false;
			/** The session row whose three-dot menu most recently opened. */
			let menuOwnerId = null;
			/** Display title of that row (shown in the confirmation dialog). */
			let menuOwnerTitle = "";
			let lastMenuSeen = 0;
			const style = document.createElement("style");
			style.dataset.dsbSessionDeleteCss = "true";
			style.textContent = CORRUPT_CSS;
			document.head.appendChild(style);
			const refreshHealth = async () => {
				if (disposed) return;
				const fresh = await fetchSessionHealth();
				if (disposed) return;
				corrupt.clear();
				for (const [id, entry] of fresh) corrupt.set(id, entry);
				applyMarkers();
			};
			const applyMarkers = () => {
				applyCorruptMarkers(document.querySelectorAll("div[role=\"treeitem\"][class$=\"_sessionRow\"]"), corrupt);
			};
			/** Re-run the marker + menu injection passes (debounced). */
			const replay = () => {
				if (disposed) return;
				applyMarkers();
				const container = findSessionMenuContainer(document);
				if (container !== null) {
					if (Date.now() - lastMenuSeen > 5e3) {
						lastMenuSeen = Date.now();
						refreshHealth();
					}
					const current = options.currentSessionId?.();
					if (menuOwnerId === null || menuOwnerId === current) removeDeleteMenuItem();
					else ensureDeleteMenuItem(container, () => {
						const id = menuOwnerId;
						if (id === null) return;
						(async () => {
							if (!await confirmDelete({
								sessionId: id,
								title: menuOwnerTitle,
								size: corrupt.get(id)?.size
							})) return;
							const result = await deleteSession(id);
							removeDeleteMenuItem();
							if (result.ok) {
								refreshHealth();
								try {
									options.refreshSessions?.();
								} catch {}
							} else alertDeleteError(id, result.error ?? "未知错误");
						})();
					});
				} else removeDeleteMenuItem();
			};
			function alertDeleteError(sessionId, error) {
				const el = document.createElement("div");
				el.textContent = `删除失败（${sessionId}）：${error}`;
				el.style.cssText = [
					"position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;",
					"padding:10px 16px;border-radius:10px;font-size:13px;",
					"background:var(--dsw-alias-state-error-primary, #e5484d);color:#fff;",
					"box-shadow:0 8px 24px rgba(0,0,0,.4);"
				].join("");
				document.body.appendChild(el);
				setTimeout(() => el.remove(), 4e3);
			}
			const onCaptureClick = (event) => {
				const button = event.target?.closest?.("button") ?? null;
				if (button === null) return;
				const row = button.closest("div[role=\"treeitem\"][class$=\"_sessionRow\"]");
				if (row === null) return;
				menuOwnerId = readSessionIdFromRow(row);
				menuOwnerTitle = row.querySelector("[class$=\"_title\"]")?.textContent?.trim() ?? "";
			};
			document.addEventListener("click", onCaptureClick, true);
			const observer = new MutationObserver(() => {
				window.clearTimeout(timer);
				timer = window.setTimeout(replay, 60);
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			refreshHealth();
			replay();
			return () => {
				disposed = true;
				window.clearTimeout(timer);
				observer.disconnect();
				document.removeEventListener("click", onCaptureClick, true);
				removeDeleteMenuItem();
				for (const el of Array.from(document.querySelectorAll(`[${CORRUPT_ATTR}]`))) el.remove();
				for (const el of Array.from(document.querySelectorAll("[data-dsb-modal]"))) el.remove();
				style.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
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
		/** Required services (slots + settingsScope drive the settings card; sessions
		* feeds the ladder outline; the rest is pure DOM observation). */
		const inject = [
			"slots",
			"settingsScope",
			"sessions"
		];
		/** Notification copy per trigger kind. */
		const TRIGGER_TEXT = {
			reply: "buddy.notify.reply",
			ask: "buddy.notify.ask",
			confirm: "buddy.notify.confirm"
		};
		/** Map an event kind to the settings switch that gates it. */
		function switchOf(kind) {
			return kind === "reply" ? "notifyReply" : kind === "ask" ? "notifyAsk" : "notifyConfirm";
		}
		/** The current session's workspace display name (derived from its cwd), or
		* undefined when the session has no workspace / cwd. The workspace is NOT in
		* the header breadcrumb for a top-level session, so it is read from the
		* sessions service instead. Never throws: a failure here must not break the
		* notification dispatch (that would kill the red-dot/beep/toast together). */
		function currentWorkspaceName(sessions) {
			try {
				const list = sessions?.list?.getSnapshot();
				const id = list?.current;
				if (id === void 0) return void 0;
				const cwd = (list?.byId?.[id])?.cwd;
				if (cwd === void 0 || cwd === "") return void 0;
				if (typeof _deepseek_ai_dsh_client_runtime_client.workspaceTitleOf !== "function") return void 0;
				const name = (0, _deepseek_ai_dsh_client_runtime_client.workspaceTitleOf)(cwd);
				return name === "" ? void 0 : name;
			} catch {
				return;
			}
		}
		/** The harness's current pending-interaction marker for the open session
		* (`'question'` → the AI is asking you something; `'approval'` → command
		* approval pending). Never throws. */
		function readPendingInteraction(sessions) {
			try {
				const list = sessions?.list?.getSnapshot();
				const id = list?.current;
				if (id === void 0) return void 0;
				return list?.byId?.[id]?.pendingInteraction;
			} catch {
				return;
			}
		}
		/**
		* Client plugin body: inject the styles, bind the settings scope, mount the
		* ladder outline (backed by the sessions snapshot), and start the session
		* listener that drives notifications.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const styleTag = document.createElement("style");
			styleTag.dataset.plugin = "dsh-session-buddy";
			styleTag.dataset.pluginCss = "dsh-session-buddy/styles";
			styleTag.textContent = BUDDY_CSS;
			document.head.appendChild(styleTag);
			let styleRemoved = false;
			ctx.effect(() => () => {
				if (styleRemoved) return;
				styleRemoved = true;
				styleTag.remove();
			}, "session-buddy: styles");
			const settingsScope = ctx.settingsScope.bind(sessionBuddySettingsSpec);
			ctx.effect(() => ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					key: "session-buddy",
					inject: () => ({
						scope: settingsScope,
						buddyT: t
					})
				}, SessionBuddySettingsCard);
			}), "session-buddy: settings card");
			let outlineMounted = false;
			let root;
			let container;
			let source;
			let latestRungs = [];
			let latestHasMore = false;
			let latestLoadingOlder = false;
			/** Scroll the transcript to an anchor key (click on a loaded rung). */
			const scrollToKey = (key) => {
				const anchor = anchorRowByKey(document, key);
				if (anchor === null) return;
				anchor.scrollIntoView({
					block: "start",
					behavior: "smooth"
				});
				anchor.classList.add("dsb-outline-flash");
				setTimeout(() => anchor.classList.remove("dsb-outline-flash"), 1200);
			};
			/** Reveal a hidden rung: page the history window until its turn is loaded,
			* then scroll to it. */
			const revealHidden = async (rung) => {
				if (source === void 0) return;
				await source.loadOlderUntilSeq(rung.seq);
				scrollToKey(rung.key);
			};
			const renderOutline = () => {
				if (!outlineMounted || root === void 0) return;
				const settings = settingsScope.getSnapshot().value;
				alignRungKeys(latestRungs);
				root.render((0, react.createElement)(OutlinePanel, {
					rungs: latestRungs,
					hasMore: latestHasMore,
					loadingOlder: latestLoadingOlder,
					t,
					scrollToKey,
					onRevealHidden: (rung) => {
						revealHidden(rung);
					},
					onLoadOlder: () => {
						source?.loadOlderOnce();
					},
					showTimestamps: settings?.showTimestamps ?? true,
					railWidth: settings?.outlineWidth ?? 18
				}));
			};
			const mountOutline = () => {
				if (outlineMounted) return;
				outlineMounted = true;
				container = document.createElement("div");
				container.dataset.dshBuddyRoot = "";
				container.dataset.dshPlugin = "session-buddy";
				container.className = "dsb-root";
				document.body.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				source = createSessionSource(ctx.sessions, {
					onRungs: (rungs) => {
						latestRungs = rungs;
						renderOutline();
					},
					onStatus: (status) => {
						latestHasMore = status.hasMore;
						latestLoadingOlder = status.loadingOlder;
						renderOutline();
					}
				});
				renderOutline();
			};
			const unmountOutline = () => {
				if (!outlineMounted) return;
				source?.dispose();
				source = void 0;
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
				outlineMounted = false;
			};
			let listenerDispose;
			let sseDispose;
			let sessionDeleteDispose;
			/** True while the host event stream is connected — then it is the ONLY
			*  notifier (DOM observation is gated) so a reply never double-fires from
			*  two sources in the same tab. While the stream is down the DOM listener
			*  takes over as the fallback. */
			let sseConnected = false;
			/** The session id currently open in the GUI (the one the user is looking
			*  at). Host events for other sessions are ignored — same as the DOM path,
			*  which only ever watches the open session. */
			const currentSessionId = () => {
				try {
					return (ctx.sessions?.list?.getSnapshot())?.current;
				} catch {
					return;
				}
			};
			/** Shared notification dispatch for BOTH the DOM classifier and the host
			*  event stream: honors the per-kind switch, composes title/body, and hands
			*  off to notifier with an optional cross-tab claim key. */
			const dispatch = (event, claimKey) => {
				const current = settingsScope.getSnapshot().value;
				if (current === void 0 || !current.enabled) return;
				if (!current[switchOf(event.kind)]) return;
				const sessionTitle = event.title ?? t("buddy.notify.title");
				const workspace = currentWorkspaceName(ctx.sessions);
				const title = workspace !== void 0 && workspace !== sessionTitle ? `${workspace} · ${sessionTitle}` : sessionTitle;
				const summary = event.summary === "" ? "" : event.summary ?? "";
				notify({
					title,
					body: `${t(TRIGGER_TEXT[event.kind])}${summary === "" ? "" : " · " + summary}`.trim(),
					sound: current.sound,
					tag: event.kind,
					claimKey,
					anchorKey: event.anchorKey,
					onClick: (key) => {
						if (key !== void 0) scrollToKey(key);
					},
					forceHidden: event.kind === "reply" && event.wasHidden === true
				});
			};
			const syncEnabled = () => {
				const enabled = settingsScope.getSnapshot().value?.enabled ?? true;
				if (enabled && !outlineMounted) mountOutline();
				if (!enabled && outlineMounted) unmountOutline();
				if (listenerDispose === void 0) listenerDispose = startSessionListener({
					readPendingInteraction: () => readPendingInteraction(ctx.sessions),
					onEvent: (event) => {
						if (sseConnected) return;
						dispatch(event);
					}
				});
				if (sseDispose === void 0) sseDispose = startBuddyEventStream({
					onStatus: (connected) => {
						sseConnected = connected;
					},
					onTrigger: (trigger) => {
						const current = settingsScope.getSnapshot().value;
						if (current === void 0 || !current.enabled) return;
						if (trigger.sessionId !== currentSessionId()) return;
						dispatch({
							kind: trigger.kind,
							summary: trigger.summary ?? "",
							title: void 0,
							wasHidden: trigger.kind === "reply" && trigger.turnStartedAt !== void 0 ? wasHiddenSince(trigger.turnStartedAt) : false
						}, `${trigger.sessionId}:${trigger.dedupKey}:${trigger.kind}`);
					}
				});
				if (sessionDeleteDispose === void 0) sessionDeleteDispose = startSessionDeleteManager({
					currentSessionId,
					refreshSessions: () => {
						try {
							const sessions = ctx.sessions;
							if (typeof sessions.refresh === "function") sessions.refresh();
						} catch {}
					}
				});
			};
			const syncAll = () => {
				syncEnabled();
				renderOutline();
			};
			const settingsUnsubscribe = settingsScope.subscribe(() => {
				syncAll();
			});
			const domObserver = new MutationObserver(() => {
				renderOutline();
			});
			domObserver.observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true
			});
			syncAll();
			ctx.effect(() => () => {
				settingsUnsubscribe();
				domObserver.disconnect();
				listenerDispose?.();
				sseDispose?.();
				sessionDeleteDispose?.();
				unmountOutline();
			}, "session-buddy: ui");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map