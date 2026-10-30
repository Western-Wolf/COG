// COG overlay - editor popups, placement, selects, tips
// Classic script; shares globals with _UI.js and feature modules.

/** Portaled editor overlays (color / icon / select / info / clockToken). */
const editorPopupRegistry = new Map();
let editorPopupSeq = 0;

function registerEditorPopup(kind, api) {
	const id = `${kind}:${++editorPopupSeq}`;
	editorPopupRegistry.set(id, {
		kind,
		close: api.close,
		reposition: typeof api.reposition === "function" ? api.reposition : null,
		retain: api.retain || null
	});
	return id;
}

function unregisterEditorPopup(id) {
	if (id) {
		editorPopupRegistry.delete(id);
	}
}

/**
 * Exclusive open: tear down every registered popup (and the in-panel group picker)
 * before a new overlay opens. Pass exceptId to keep one entry (rare; prefer close+reopen).
 * @param {string} [_kind] caller label (color|icon|select|info|clockToken)
 * @param {string|null} [exceptId]
 */
function beginEditorPopup(_kind, exceptId) {
	// Keep the in-panel group gear picker open when a filter <select> inside it opens;
	// tearing it down clears pickerGroupId and would send adds to the Default Group.
	const selectInsideOpenPicker =
		_kind === "select" &&
		typeof pickerRoot !== "undefined" &&
		pickerRoot &&
		pickerRoot.querySelector &&
		pickerRoot.querySelector(".group-picker:not([hidden])");
	if (!selectInsideOpenPicker && typeof closePicker === "function") {
		closePicker();
	}
	for (const [id, entry] of [...editorPopupRegistry.entries()]) {
		if (exceptId && id === exceptId) {
			continue;
		}
		try {
			entry.close();
		} catch (e) {
			console.error("beginEditorPopup", e);
			unregisterEditorPopup(id);
		}
	}
}

/** Run fn; on throw, log via cogReportError and return fallback (never rethrows). */

let hoverTipEl = null;
let hoverTipAnchor = null;

function ensureHoverTip() {
	if (!hoverTipEl) {
		hoverTipEl = document.createElement("div");
		hoverTipEl.className = "cog-hover-tip";
		hoverTipEl.hidden = true;
		document.body.appendChild(hoverTipEl);
	}
	return hoverTipEl;
}

function showHoverTip(anchor, text) {
	if (!anchor || !text) {
		hideHoverTip();
		return;
	}
	const el = ensureHoverTip();
	hoverTipAnchor = anchor;
	el.textContent = text;
	el.hidden = false;
	placeHoverTip();
}

function placeHoverTip() {
	if (!hoverTipEl || hoverTipEl.hidden || !hoverTipAnchor) {
		return;
	}
	const tip = hoverTipEl;
	const r = hoverTipAnchor.getBoundingClientRect();
	tip.style.left = "0px";
	tip.style.top = "0px";
	const tw = tip.offsetWidth;
	const th = tip.offsetHeight;
	let left = r.left + (r.width - tw) / 2;
	let top = r.top - th - 6;
	if (top < 4) {
		top = r.bottom + 6;
	}
	left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));
	tip.style.left = `${Math.round(left)}px`;
	tip.style.top = `${Math.round(top)}px`;
}

function hideHoverTip() {
	hoverTipAnchor = null;
	if (hoverTipEl) {
		hoverTipEl.hidden = true;
	}
}

/** Prisma/Ultralight does not show native title= tooltips — use .cog-hover-tip via data-tip. */
function bindDataTipHover() {
	if (document.documentElement.dataset.dataTipsBound === "1") {
		return;
	}
	document.documentElement.dataset.dataTipsBound = "1";
	document.addEventListener("mouseover", (ev) => {
		const host = ev.target.closest && ev.target.closest("[data-tip]");
		if (host) {
			if (hoverTipAnchor !== host) {
				showHoverTip(host, host.dataset.tip);
			}
			return;
		}
		if (hoverTipAnchor) {
			hideHoverTip();
		}
	});
	document.addEventListener("scroll", () => {
		if (hoverTipAnchor) {
			placeHoverTip();
		}
	}, true);
	window.addEventListener("resize", () => {
		if (hoverTipAnchor) {
			placeHoverTip();
		}
	});
}

bindDataTipHover();

function closeAllEditorPopups() {
	beginEditorPopup();
	hideHoverTip();
	// Safety: clear leftover state / orphans if a path skipped unregister.
	if (colorPickerState) {
		closeColorPicker();
	}
	if (iconPickerState) {
		closeIconPicker();
	}
	closeCogSelects();
	closeInfoTips();
	closeClockTokenPopovers();
}

function closeCogSelectWrap(wrap) {
	if (!wrap) {
		return;
	}
	wrap.classList.remove("is-open");
	const menu = wrap._cogMenu || wrap.querySelector(".cog-select-menu");
	if (menu) {
		menu.hidden = true;
		clearAnchoredPopupPlacement(menu);
	}
	const id = wrap._cogPopupId;
	wrap._cogPopupId = null;
	unregisterEditorPopup(id);
}

function closeCogSelects(except) {
	for (const wrap of document.querySelectorAll(".cog-select.is-open")) {
		if (wrap !== except) {
			closeCogSelectWrap(wrap);
		}
	}
	// Portaled menus can outlive their wraps after #tab-body rebuild — sweep orphans.
	for (const menu of document.querySelectorAll("body > .cog-select-menu.is-placed")) {
		const home = menu._cogHome;
		if (except && home && (home === except || except.contains(home))) {
			continue;
		}
		menu.hidden = true;
		clearAnchoredPopupPlacement(menu);
		if (home && !home.isConnected) {
			menu.remove();
		}
	}
}

function closeInfoTipWrap(wrap) {
	if (!wrap) {
		return;
	}
	wrap.classList.remove("is-open");
	const panel = wrap._cogPanel || wrap.querySelector(".info-tip-panel");
	if (panel) {
		panel.hidden = true;
		clearAnchoredPopupPlacement(panel);
	}
	const id = wrap._cogPopupId;
	wrap._cogPopupId = null;
	unregisterEditorPopup(id);
}

function closeInfoTips(except) {
	for (const wrap of document.querySelectorAll(".info-tip.is-open")) {
		if (wrap !== except) {
			closeInfoTipWrap(wrap);
		}
	}
	for (const panel of document.querySelectorAll("body > .info-tip-panel.is-placed")) {
		const home = panel._cogHome;
		if (except && home && (home === except || except.contains(home))) {
			continue;
		}
		panel.hidden = true;
		clearAnchoredPopupPlacement(panel);
		if (home && !home.isConnected) {
			panel.remove();
		}
	}
}

function closeClockTokenPopover(popover) {
	if (!popover) {
		return;
	}
	popover.hidden = true;
	clearAnchoredPopupPlacement(popover);
	const id = popover._cogPopupId;
	popover._cogPopupId = null;
	unregisterEditorPopup(id);
}

function closeClockTokenPopovers() {
	for (const pop of document.querySelectorAll(".clock-token-popover.is-placed, .clock-token-popover:not([hidden])")) {
		closeClockTokenPopover(pop);
	}
}

/** Clip popups to the editor tab body (or panel), not the full window. */
function editorPopupClipRect() {
	const el = document.getElementById("tab-body") || document.getElementById("editor-panel");
	if (el) {
		return el.getBoundingClientRect();
	}
	return {
		left: 0,
		top: 0,
		right: window.innerWidth,
		bottom: window.innerHeight,
		width: window.innerWidth,
		height: window.innerHeight
	};
}

function clearAnchoredPopupPlacement(el) {
	if (!el) {
		return;
	}
	el.classList.remove("is-placed");
	el.style.position = "";
	el.style.left = "";
	el.style.top = "";
	el.style.right = "";
	el.style.bottom = "";
	el.style.width = "";
	el.style.maxHeight = "";
	el.style.zIndex = "";
	el.style.fontFamily = "";
	el.style.fontSize = "";
	el.style.fontWeight = "";
	el.style.lineHeight = "";
	// Return portaled popup to its home so layout/cleanup stay predictable.
	if (el._cogHome && el.parentElement !== el._cogHome) {
		el._cogHome.appendChild(el);
	}
}

/**
 * Fixed-position a popup next to an anchor, flipping up/down and shifting
 * left/right so it stays inside the editor clip rect (avoids tab-body scrollbars).
 * Portals to document.body — #editor-panel has transform, which would otherwise
 * make position:fixed resolve against the panel instead of the viewport.
 */
function placeAnchoredPopup(el, anchor, opts) {
	if (!el || !anchor) {
		return;
	}
	if (!el._cogHome) {
		el._cogHome = el.parentElement;
	}
	if (el.parentElement !== document.body) {
		document.body.appendChild(el);
	}

	const gap = opts && opts.gap != null ? opts.gap : 6;
	const pad = opts && opts.pad != null ? opts.pad : 6;
	const matchWidth = !!(opts && opts.matchAnchorWidth);
	const clip = editorPopupClipRect();
	const ar = anchor.getBoundingClientRect();

	el.classList.add("is-placed");
	el.hidden = false;
	el.style.position = "fixed";
	el.style.zIndex = "10020";
	el.style.right = "auto";
	el.style.bottom = "auto";
	el.style.left = "0px";
	el.style.top = "0px";
	// Match the trigger/button type size — body portal loses #editor-panel / .pos-field em cascade.
	const anchorStyle = window.getComputedStyle(anchor);
	el.style.fontFamily = anchorStyle.fontFamily;
	el.style.fontSize = anchorStyle.fontSize;
	el.style.fontWeight = anchorStyle.fontWeight;
	el.style.lineHeight = anchorStyle.lineHeight;
	if (matchWidth) {
		el.style.width = `${Math.max(1, Math.round(ar.width))}px`;
	} else {
		el.style.width = "";
	}
	el.style.maxHeight = "";

	const spaceBelow = Math.max(0, clip.bottom - ar.bottom - gap - pad);
	const spaceAbove = Math.max(0, ar.top - clip.top - gap - pad);
	const placeBelow = spaceBelow >= spaceAbove || spaceBelow >= 64;
	const maxH = Math.max(48, placeBelow ? spaceBelow : spaceAbove);
	if (opts && opts.capMaxHeight) {
		el.style.maxHeight = `${Math.min(opts.capMaxHeight, maxH)}px`;
	} else {
		el.style.maxHeight = `${maxH}px`;
	}

	const pw = el.offsetWidth || (matchWidth ? ar.width : 220);
	const ph = el.offsetHeight || 80;

	let top = placeBelow ? ar.bottom + gap : ar.top - ph - gap;
	if (placeBelow && top + ph > clip.bottom - pad && spaceAbove > spaceBelow) {
		top = ar.top - ph - gap;
	} else if (!placeBelow && top < clip.top + pad && spaceBelow > spaceAbove) {
		top = ar.bottom + gap;
	}
	top = Math.max(clip.top + pad, Math.min(top, clip.bottom - Math.min(ph, maxH) - pad));

	let left = ar.left;
	if (opts && opts.align === "end") {
		left = ar.right - pw;
	}
	if (left + pw > clip.right - pad) {
		left = ar.right - pw;
	}
	if (left < clip.left + pad) {
		left = clip.left + pad;
	}
	if (left + pw > clip.right - pad) {
		left = Math.max(clip.left + pad, clip.right - pw - pad);
	}

	el.style.left = `${Math.round(left)}px`;
	el.style.top = `${Math.round(top)}px`;
}

function repositionOpenEditorPopups() {
	for (const entry of editorPopupRegistry.values()) {
		if (typeof entry.reposition === "function") {
			entry.reposition();
		}
	}
}

/** Info (i) control. Optional `tag` marks the panel for editor translations. */
function makeInfoTip(text, tag, typeId) {
	const wrap = document.createElement("span");
	wrap.className = "info-tip";
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "info-tip-btn";
	btn.textContent = "i";
	if (typeof setTranslatedAriaLabel === "function") {
		setTranslatedAriaLabel(btn, "cog-more-info", "More info");
	} else {
		btn.setAttribute("aria-label", "More info");
	}
	const panel = document.createElement("span");
	panel.className = "info-tip-panel";
	panel.hidden = true;
	const fallback = text == null ? "" : String(text);
	if (tag && typeof setTranslatedText === "function") {
		setTranslatedText(panel, tag, fallback, undefined, typeId);
	} else {
		panel.textContent = fallback;
	}
	wrap._cogPanel = panel;
	btn.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		const open = panel.hidden;
		if (!open) {
			closeInfoTipWrap(wrap);
			return;
		}
		beginEditorPopup("info");
		wrap.classList.add("is-open");
		const place = () => placeAnchoredPopup(panel, btn, { gap: 6, align: "start" });
		wrap._cogPopupId = registerEditorPopup("info", {
			close: () => closeInfoTipWrap(wrap),
			reposition: place,
			retain: panel
		});
		place();
	});
	panel.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	panel.addEventListener("click", (ev) => ev.stopPropagation());
	wrap.appendChild(btn);
	wrap.appendChild(panel);
	return wrap;
}

function enhanceSelect(select) {
	if (!select || select.dataset.enhanced === "1") {
		return;
	}
	select.dataset.enhanced = "1";
	const wrap = document.createElement("div");
	wrap.className = "cog-select";
	select.parentNode.insertBefore(wrap, select);
	wrap.appendChild(select);
	select.classList.add("cog-select-native");
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "cog-select-trigger";
	const menu = document.createElement("ul");
	menu.className = "cog-select-menu";
	menu.hidden = true;
	wrap._cogMenu = menu;
	const sync = () => {
		menu.innerHTML = "";
		for (const opt of select.options) {
			const li = document.createElement("li");
			li.dataset.value = opt.value;
			li.textContent = opt.textContent;
			if (opt.value === select.value) {
				li.classList.add("is-selected");
			}
			li.addEventListener("mousedown", (ev) => ev.preventDefault());
			li.addEventListener("click", () => {
				select.value = opt.value;
				select.dispatchEvent(new Event("change", { bubbles: true }));
				closeCogSelects();
				sync();
			});
			menu.appendChild(li);
		}
		const cur = select.options[select.selectedIndex];
		btn.textContent = cur ? cur.textContent : "—";
	};
	sync();
	btn.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		const open = menu.hidden;
		if (!open) {
			closeCogSelectWrap(wrap);
			return;
		}
		beginEditorPopup("select");
		wrap.classList.add("is-open");
		const place = () =>
			placeAnchoredPopup(menu, btn, {
				matchAnchorWidth: true,
				gap: 3,
				capMaxHeight: 12 * 16
			});
		wrap._cogPopupId = registerEditorPopup("select", {
			close: () => closeCogSelectWrap(wrap),
			reposition: place,
			retain: menu
		});
		place();
	});
	menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	select.addEventListener("change", sync);
	select.addEventListener("cog:options", sync);
	wrap.appendChild(btn);
	wrap.appendChild(menu);
}

function enhanceSelects(root) {
	if (!root) {
		return;
	}
	for (const select of root.querySelectorAll("select")) {
		enhanceSelect(select);
	}
}

