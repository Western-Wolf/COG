// COG overlay - UI composer shell (renderEditor, keybinds, boot, shared field helpers)
// Classic script; shares globals with _Core.js.
// Load last among _UI_*.js (after Icons / Color / Defaults / Popups / General / Help).

/**
 * Opt-in rewrite of still-stock entity titles into toLang.
 * Gears: settings.displayName only (keyed by defaults.displayName).
 * Groups/gauges/gizmos: displayName when it matches a stock template in fromLang or en-CA.
 * Default Group is display-time only — skipped here.
 */
function pushStockEntityTitles(fromLang, toLang) {
	if (!snapshot || typeof localizeStockName !== "function") {
		return false;
	}
	const from = fromLang || (typeof COG_FALLBACK_LANG !== "undefined" ? COG_FALLBACK_LANG : "en-CA");
	const to = toLang || (snapshot.general && snapshot.general.language) || from;
	let changed = false;

	for (const gear of snapshot.gears || []) {
		if (typeof ensureGearAppearance === "function") {
			ensureGearAppearance(gear);
		}
		const src =
			typeof sourceFor === "function" ? sourceFor(gear.sourceMod, gear.varName) : null;
		// Prefer a name: catalog key (case-insensitive) so drifted "stamina" still pushes.
		const keyCandidates = [
			src && (src.displayName || src.display),
			gear.defaults && gear.defaults.displayName,
			gear.settings && gear.settings.displayName,
			src && src.varName,
			gear.varName
		];
		let key = "";
		if (typeof hasStockNameKey === "function") {
			for (const candidate of keyCandidates) {
				const k = String(candidate || "").trim();
				if (k && hasStockNameKey(k)) {
					key = k;
					break;
				}
			}
		}
		if (!key) {
			key = String(
				(src && (src.displayName || src.display)) ||
					(gear.defaults && gear.defaults.displayName) ||
					""
			).trim();
		}
		if (!key) {
			continue;
		}
		// Empty settings.displayName still shows src English — treat as stock.
		const cur = String((gear.settings && gear.settings.displayName) || key).trim();
		const next =
			typeof isStockNameAnyLocale === "function" &&
			isStockNameAnyLocale(cur, key, { defaultsDisplayName: key })
				? typeof tName === "function"
					? tName(key, null, null, to)
					: cur
				: localizeStockName(cur, key, to, from, { defaultsDisplayName: key });
		if (next && next !== (gear.settings && gear.settings.displayName)) {
			gear.settings.displayName = next;
			changed = true;
		}
	}

	const rewriteInstanceSettingsTitle = (entity, ensureFn) => {
		if (!entity || entity.id === "default") {
			return;
		}
		if (typeof ensureFn === "function") {
			ensureFn(entity);
		}
		const settings =
			entity.settings && typeof entity.settings === "object" && !Array.isArray(entity.settings)
				? entity.settings
				: null;
		if (!settings) {
			return;
		}
		const cur = settings.displayName;
		const matched =
			typeof matchStockInstanceTitle === "function"
				? matchStockInstanceTitle(cur, from)
				: null;
		if (!matched) {
		return;
	}
		const next = localizeStockName(cur, matched.key, to, from, { vars: matched.vars });
		if (next !== cur) {
			settings.displayName = next;
			if (Object.prototype.hasOwnProperty.call(entity, "settingsJson")) {
				entity.settingsJson = JSON.stringify(settings);
			}
			changed = true;
		}
	};

	for (const group of snapshot.groups || []) {
		rewriteInstanceSettingsTitle(group, typeof ensureGroupSettings === "function" ? ensureGroupSettings : null);
	}
	for (const gauge of snapshot.gauges || []) {
		rewriteInstanceSettingsTitle(gauge, typeof ensureGauge === "function" ? ensureGauge : null);
	}
	for (const gizmo of snapshot.gizmos || []) {
		rewriteInstanceSettingsTitle(gizmo, typeof ensureGizmo === "function" ? ensureGizmo : null);
	}

	if (changed) {
		snapshot.general.namesLanguage = to;
	}
	return changed;
}

let editorKey = "";
let rebindListening = false;
let rebindArmedAt = 0;
const REBIND_ARM_MS = 450;




/**
 * Shared number-format vocabulary for Groups/Gears and Feed (same menu modes).
 * Normalizers keep their own defaults (groups: barPercent; feed: barTotal).
 */
const NUMBER_FORMATS = ["bar", "barPercent", "barTotal", "percent", "total"];

function numberFormatShowsBar(mode) {
	return mode === "bar" || mode === "barPercent" || mode === "barTotal";
}

function numberFormatShowsValue(mode) {
	return mode !== "bar";
}

function numberFormatShowsTotal(mode) {
	return mode === "barTotal" || mode === "total";
}

function safeCall(where, fn, fallback) {
	try {
		return fn();
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError(where, e);
	} else {
			console.error(where, e);
		}
		return fallback;
	}
}
window.safeCall = safeCall;




function editorKeyName() {
	return snapshot.general && snapshot.general.editorKey ? snapshot.general.editorKey : "F3";
}




function appendEditorRule(parent) {
	const hr = document.createElement("hr");
	hr.className = "editor-rule";
	parent.appendChild(hr);
	return hr;
}






function isEditingField() {
	if (rebindListening || iconPickerState || colorPickerState) {
		return true;
	}
	const el = document.activeElement;
	if (!el) {
		return false;
	}
	if (el.closest(".cog-select") || el.closest(".color-field") || el.closest(".icon-field") || el.closest(".cog-color-picker") || el.closest(".cog-icon-picker") || el.closest("#editor-keybind") || el.closest("#editor-help")) {
		return true;
	}
	const tag = el.tagName;
	return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON";
}

function currentEditorKey() {
	const groups = snapshot.groups.map((g) => `${g.id}:${g.displayName || ""}`).join("|");
	const gears = snapshot.gears.map((g) => g.id).join("|");
	const gauges = (snapshot.gauges || []).map((g) => {
		const s = g.settings || {};
		return `${g.id}:${s.displayName || ""}:${s.type || ""}:${s.shape || ""}`;
	}).join("|");
	const gizmos = (snapshot.gizmos || []).map((z) =>
		`${z.id}:${z.displayName || ""}:${z.typeId || ""}:${z.visibility || ""}:${(z.display && z.display.width) || ""}:${(z.display && z.display.height) || ""}:${typeof z.settingsJson === "string" ? z.settingsJson : JSON.stringify(z.settings || {})}`
	).join("|");
	return `${activeTab}|${helpMode ? "help" : "main"}|${helpSubTab}|${snapshot.general.showDefaultGroup}|${snapshot.general.editorKey}|${snapshot.general.hideToggleKey || ""}|${snapshot.general.hideIncludesFlash !== false}|${!!window.__cogHideKeyListening}|${snapshot.general.fillColor}|${snapshot.general.borderColor}|${snapshot.general.iconColor || themeIconColor()}|${snapshot.general.neutralIconMode}|${snapshot.general.gadgetFont}|${snapshot.general.language || ""}|${!!snapshot.general.highlightMissingTranslations}|${!!snapshot.general.updateStockTitlesOnTranslation}|${groups}|${gears}|${gauges}|${gizmos}|${typeof suppressionsFingerprint === "function" ? suppressionsFingerprint() : ""}`;
}

/** Tag a .pos-field / label's leading <span> via data-translation helpers. */
function tagFieldLabel(field, tag, fallback, typeId) {
	if (!field) {
		return field;
	}
	const span = field.querySelector(":scope > span");
	if (!span) {
		return field;
	}
	if (typeof setTranslatedText === "function") {
		setTranslatedText(span, tag, fallback, undefined, typeId);
	} else {
		span.textContent = fallback;
	}
	return field;
}

/**
 * Tag <option> labels. map: value → { tag, fallback } or [tag, fallback].
 * Never put badges on options — setTranslatedOption skips nesting.
 */
function tagSelectOptions(select, map, typeId) {
	if (!select || !map) {
		return select;
	}
	for (const opt of select.querySelectorAll("option")) {
		const entry = map[opt.value];
		if (!entry) {
			continue;
		}
		const tag = entry.tag != null ? entry.tag : entry[0];
		const fallback = entry.fallback != null ? entry.fallback : entry[1];
		if (typeof setTranslatedOption === "function") {
			setTranslatedOption(opt, tag, fallback, typeId);
		} else if (fallback != null) {
			opt.textContent = fallback;
		}
	}
	return select;
}


function softRefreshHudPaint() {
	for (const group of snapshot.groups || []) {
		syncHudGroup(group);
	}
	for (const gauge of snapshot.gauges || []) {
		syncHudGauge(gauge);
	}
	for (const gizmo of snapshot.gizmos || []) {
		syncHudGizmo(gizmo);
	}
}



function clampPx(n, min, max) {
	const v = Math.round(Number(n));
	if (!Number.isFinite(v)) {
		return min;
	}
	return Math.max(min, Math.min(max, v));
}

function bindNumberField(el, opts) {
	if (!el || !opts) {
		return;
	}
	if (opts.prefix || opts.suffix) {
		wrapInputAffix(el, { prefix: opts.prefix || "", suffix: opts.suffix || "" });
	}
	const decimals = opts.decimals != null && Number.isFinite(Number(opts.decimals)) ? Number(opts.decimals) : null;
	const format =
		opts.format ||
		((v) => (decimals != null ? fmtDec(v, decimals) : String(v)));
	const parseRaw = opts.parse;
	const commit = (snap) => {
		let parsed = parseRaw(el.value);
		if (parsed == null) {
			if (snap) {
				el.value = format(opts.current());
			}
			return;
		}
		if (decimals != null) {
			parsed = quantizeDec(parsed, decimals);
		}
		// Same pattern as patchGizmo: skip apply/save when the value did not change
		// (duplicate input/change/mouseup events from one gesture).
		let cur = opts.current();
		if (decimals != null && Number.isFinite(Number(cur))) {
			cur = quantizeDec(Number(cur), decimals);
		}
		if (parsed === cur) {
			if (snap) {
				el.value = format(parsed);
			}
			return;
		}
		opts.apply(parsed);
		if (snap) {
			el.value = format(parsed);
		}
	};
	el.addEventListener("input", () => commit(false));
	el.addEventListener("change", () => commit(true));
	el.addEventListener("blur", () => commit(true));
	el.addEventListener("click", () => commit(false));
	el.addEventListener("mouseup", () => {
		commit(false);
		requestAnimationFrame(() => commit(false));
	});
	el.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			commit(true);
			el.blur();
		}
	});
	el.addEventListener("keyup", (ev) => {
		if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
			commit(false);
		}
	});
}

function stopHeaderToggle(el) {
	if (!el) {
		return;
	}
	el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	el.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
	});
}

/**
 * Enter / Escape for accordion rename — same commit-and-blur pattern as bindNumberField
 * and colour hex fields. Capture + stopPropagation so Ultralight does not also toggle
 * the parent <details> on Enter.
 */
function bindAccordionRenameKeys(nameInput, finishRename) {
	if (!nameInput || typeof finishRename !== "function") {
		return;
	}
	nameInput.addEventListener(
		"keydown",
		(ev) => {
			if (ev.key === "Enter" || ev.code === "Enter" || ev.code === "NumpadEnter") {
				ev.preventDefault();
				ev.stopPropagation();
				finishRename(true);
				nameInput.blur();
				return;
			}
			if (ev.key === "Escape" || ev.code === "Escape") {
				ev.preventDefault();
				ev.stopPropagation();
				finishRename(false);
				nameInput.blur();
			}
		},
		true
	);
	nameInput.addEventListener("blur", () => finishRename(true));
}

/**
 * Ultralight still toggles <details> when Space is typed in an <input> inside <summary>.
 * Park the field as a direct child of <details> (outside summary) for the rename, and
 * absolutely cover a flex slot left in the header so layout stays the same.
 */
function parkRenameFieldForEdit(details, nameInput) {
	if (!details || !nameInput || nameInput._cogRenameHome) {
		return;
	}
	const home = nameInput.parentElement;
	if (!home) {
				return;
			}
	const slot = document.createElement("span");
	slot.className = "name-field-slot";
	slot.setAttribute("aria-hidden", "true");
	home.insertBefore(slot, nameInput);
	nameInput._cogRenameHome = home;
	nameInput._cogRenameNext = nameInput.nextSibling;
	nameInput._cogRenameSlot = slot;
	const summary = details.querySelector(":scope > summary");
	if (summary && summary.nextSibling) {
		details.insertBefore(nameInput, summary.nextSibling);
	} else if (summary) {
		details.appendChild(nameInput);
	} else {
		details.insertBefore(nameInput, details.firstChild);
	}
	layoutParkedRenameField(nameInput);
}

function layoutParkedRenameField(nameInput) {
	const slot = nameInput && nameInput._cogRenameSlot;
	const details = nameInput && nameInput.parentElement;
	if (!slot || !details) {
		return;
	}
	const dr = details.getBoundingClientRect();
	const sr = slot.getBoundingClientRect();
	if (!(sr.width > 0) || !(sr.height > 0)) {
		return;
	}
	nameInput.style.position = "absolute";
	nameInput.style.left = `${Math.round(sr.left - dr.left)}px`;
	nameInput.style.top = `${Math.round(sr.top - dr.top)}px`;
	nameInput.style.width = `${Math.round(sr.width)}px`;
	nameInput.style.height = `${Math.round(sr.height)}px`;
	nameInput.style.boxSizing = "border-box";
	nameInput.style.margin = "0";
	nameInput.style.zIndex = "3";
}

function restoreRenameField(nameInput) {
	if (!nameInput || !nameInput._cogRenameHome) {
		return;
	}
	const home = nameInput._cogRenameHome;
	const next = nameInput._cogRenameNext;
	const slot = nameInput._cogRenameSlot;
	nameInput.style.position = "";
	nameInput.style.left = "";
	nameInput.style.top = "";
	nameInput.style.width = "";
	nameInput.style.height = "";
	nameInput.style.boxSizing = "";
	nameInput.style.margin = "";
	nameInput.style.zIndex = "";
	if (next && next.parentElement === home) {
		home.insertBefore(nameInput, next);
	} else {
		home.appendChild(nameInput);
	}
	if (slot && slot.parentElement) {
		slot.remove();
	}
	nameInput._cogRenameHome = null;
	nameInput._cogRenameNext = null;
	nameInput._cogRenameSlot = null;
}

/** Replace `### Title #cog-help-tag` (any ATX level) with the translated title. */

function renderEditor(force) {
	const body = document.getElementById("tab-body");
	if (!body || !document.body.classList.contains("is-focused")) {
		return;
	}
	const key = currentEditorKey();
	// Never tear down fields while the user is typing (even if general colours changed).
	if (!force && isEditingField()) {
		return;
	}
	if (!force && key === editorKey) {
		if (activeTab === "groups" && pickerRoot) {
			const picker = pickerRoot.querySelector(".group-picker");
			if (picker && !picker.hidden) {
				fillPicker();
			}
		}
		return;
	}
	editorKey = key;
	// Tear down portaled selects/info before wiping wraps (same funnel as setFocused(false)).
	closeAllEditorPopups();
	body.innerHTML = "";
	if (helpMode) {
		renderHelpTab(body);
		if (typeof applyTranslations === "function") {
			applyTranslations(body);
		}
		return;
	}
	if (activeTab === "general") {
		renderGeneral(body);
	} else if (activeTab === "groups") {
		renderGroups(body);
	} else if (activeTab === "gears") {
		renderGearsTab(body);
	} else if (activeTab === "gizmos") {
		renderGizmos(body);
	} else {
		renderGauges(body);
	}
	// Project-wide custom dropdowns (matches Show Celestial Objects / Groups styling).
	enhanceSelects(body);
	if (typeof applyTranslations === "function") {
		applyTranslations(body);
	}
}

document.getElementById("tabs").addEventListener("click", (ev) => {
	const helpBtn = ev.target.closest("[data-help-tab]");
	if (helpBtn) {
		helpSubTab = helpBtn.dataset.helpTab || "about";
		for (const tab of document.querySelectorAll("#tabs .tab")) {
			tab.classList.toggle("is-active", tab === helpBtn);
		}
		closeAllEditorPopups();
		renderEditor(true);
		return;
	}
	const btn = ev.target.closest(".tab[data-tab]");
	if (!btn) {
		return;
	}
	helpMode = false;
	activeTab = btn.dataset.tab || "general";
	syncHelpChrome();
	closeAllEditorPopups();
	renderEditor(true);
	renderGears();
});

document.addEventListener("pointerdown", (ev) => {
	const t = ev.target;
	if (
		t.closest(".cog-color-picker") ||
		t.closest(".color-swatch") ||
		t.closest(".cog-icon-picker") ||
		t.closest(".icon-swatch") ||
		t.closest(".cog-select") ||
		t.closest(".cog-select-menu") ||
		t.closest(".info-tip") ||
		t.closest(".info-tip-panel") ||
		t.closest(".clock-token-popover") ||
		t.closest(".clock-line-btn") ||
		// Groups-tab Add gear picker only (not Edit Gears). pointerdown must not clear
		// pickerGroupId before the list item's mousedown runs addGear(src, groupId).
		(t.closest(".group-picker") && !t.closest(".gear-edit-picker"))
	) {
		return;
	}
	closeAllEditorPopups();
});

window.addEventListener("resize", () => {
	repositionOpenEditorPopups();
	placeHoverTip();
});

document.addEventListener(
	"scroll",
	(ev) => {
		const t = ev.target;
		if (t === document.getElementById("tab-body") || (t && t.id === "tab-body")) {
			repositionOpenEditorPopups();
		}
	},
	true
);

document.addEventListener("keydown", (ev) => {
	if (ev.key !== "Escape") {
		return;
	}
	if (editorPopupRegistry.size > 0 || colorPickerState || iconPickerState) {
		ev.preventDefault();
		closeAllEditorPopups();
	}
});

const SKIP_BIND_CODES = new Set([
	"ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
	"AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock", "Tab"
]);

const EVENT_CODE_KEYS = {
	Space: "Space",
	Enter: "Enter",
	Backspace: "Backspace",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Backquote: "`",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Insert: "Insert",
	Delete: "Delete",
	Home: "Home",
	End: "End",
	PageUp: "PageUp",
	PageDown: "PageDown",
	ArrowUp: "Up",
	ArrowDown: "Down",
	ArrowLeft: "Left",
	ArrowRight: "Right",
	NumLock: "NumLock",
	ScrollLock: "ScrollLock"
};

function eventToKeyName(ev) {
	const code = ev.code || "";
	if (SKIP_BIND_CODES.has(code)) {
		return "";
	}
	if (code.startsWith("Key") && /^Key[A-Z]$/.test(code)) {
		return code.slice(3);
	}
	if (code.startsWith("Digit") && /^Digit[0-9]$/.test(code)) {
		return code.slice(5);
	}
	if (/^F([1-9]|1[0-2])$/.test(code)) {
		return code;
	}
	if (code.startsWith("Numpad")) {
		const rest = code.slice(6);
		const mapped = { Add: "Num+", Subtract: "Num-", Multiply: "Num*", Divide: "Num/", Decimal: "Num.", Enter: "NumEnter" };
		if (mapped[rest]) {
			return mapped[rest];
		}
		if (/^[0-9]$/.test(rest)) {
			return `Num${rest}`;
		}
	}
	if (EVENT_CODE_KEYS[code]) {
		return EVENT_CODE_KEYS[code];
	}
	const key = ev.key || "";
	if (key === "Escape" || key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
		return "";
	}
	if (/^F([1-9]|1[0-2])$/.test(key)) {
		return key;
	}
	if (key.length === 1 && /[a-zA-Z]/.test(key)) {
		return key.toUpperCase();
	}
	if (key.length === 1 && /[0-9]/.test(key)) {
		return key;
	}
	const codeNo = ev.keyCode || ev.which || 0;
	if (codeNo >= 112 && codeNo <= 123) {
		return `F${codeNo - 111}`;
	}
	if (codeNo >= 65 && codeNo <= 90) {
		return String.fromCharCode(codeNo);
	}
	if (codeNo >= 48 && codeNo <= 57) {
		return String.fromCharCode(codeNo);
	}
	return "";
}

window.setEditorKeyName = (name) => {
	const next = String(name || "").trim();
	if (next) {
		snapshot.general.editorKey = next;
	}
	rebindListening = false;
	rebindArmedAt = 0;
	updateKeybindHint();
};

window.cancelEditorRebind = () => {
	rebindListening = false;
	rebindArmedAt = 0;
	updateKeybindHint();
};

window.setHideToggleKeyName = (name) => {
	const next = String(name || "").trim();
	if (!snapshot.general) {
		snapshot.general = {};
	}
	snapshot.general.hideToggleKey = next;
	window.__cogHideKeyListening = false;
	if (activeTab === "general") {
		renderEditor(false);
	}
};

window.cancelHideKeyRebind = () => {
	window.__cogHideKeyListening = false;
	if (activeTab === "general") {
		renderEditor(false);
	}
};

function updateKeybindHint() {
	const el = document.getElementById("editor-keybind");
	if (!el) {
		return;
	}
	const key = editorKeyName();
	// Visible label is "{key} closes". Hover tip explains rebind (Prisma ignores title=).
	let tip;
	if (rebindListening) {
		const label =
			typeof t === "function" ? t("cog-editor-key-listening-label", "\u2026 closes") : "\u2026 closes";
		tip =
			typeof t === "function"
				? t("cog-editor-key-listening", "Press a new key\u2026 (click to cancel)")
				: "Press a new key\u2026 (click to cancel)";
		el.removeAttribute("data-translation");
		el.removeAttribute("data-translation-fallback");
		el.removeAttribute("data-translation-vars");
		el.textContent = label;
		if (typeof setTranslatedAriaLabel === "function") {
			setTranslatedAriaLabel(
				el,
				"cog-editor-key-listening-aria",
				"Listening for a new editor key. Click to cancel."
			);
		} else {
			el.setAttribute("aria-label", "Listening for a new editor key. Click to cancel.");
		}
	} else {
		tip =
			typeof t === "function"
				? t("cog-editor-key-rebind-tip", "Click to rebind the editor key")
				: "Click to rebind the editor key";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(el, "cog-editor-key-closes", "{key} closes", { key });
		} else {
			el.textContent = `${key} closes`;
		}
		if (typeof setTranslatedAriaLabel === "function") {
			setTranslatedAriaLabel(el, "cog-editor-key-closes-aria", "Editor key {key}. Click to rebind.", {
				key
			});
		} else {
			el.setAttribute("aria-label", `Editor key ${key}. Click to rebind.`);
		}
	}
	el.classList.toggle("is-listening", rebindListening);
	el.removeAttribute("title");
	el.dataset.tip = tip;
	if (hoverTipAnchor === el) {
		showHoverTip(el, tip);
	}
}
window.updateKeybindHint = updateKeybindHint;

function setRebindListening(on) {
	const next = !!on;
	if (rebindListening === next) {
		updateKeybindHint();
		return;
	}
	rebindListening = next;
	rebindArmedAt = next ? Date.now() : 0;
	updateKeybindHint();
	// Defer native capture until after the pointer event finishes.
	const msg = next ? "rebindStart" : "rebindCancel";
	setTimeout(() => {
		if (rebindListening !== next) {
			return;
		}
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE(msg);
		}
	}, 0);
}

function bindEditorKeyHint() {
	const el = document.getElementById("editor-keybind");
	if (!el || el.dataset.bound === "1") {
		return;
	}
	el.dataset.bound = "1";
	let pressPointerId = null;
	el.addEventListener("pointerdown", (ev) => {
		if (ev.button !== 0) {
			return;
		}
		pressPointerId = ev.pointerId;
		ev.stopPropagation();
	});
	el.addEventListener("pointerup", (ev) => {
		if (ev.button !== 0 || pressPointerId !== ev.pointerId) {
			return;
		}
		pressPointerId = null;
		ev.preventDefault();
		ev.stopPropagation();
		setRebindListening(!rebindListening);
	});
	el.addEventListener("pointercancel", () => {
		pressPointerId = null;
	});
	el.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter" || ev.key === " ") {
			ev.preventDefault();
			ev.stopPropagation();
			setRebindListening(!rebindListening);
		}
	});
	updateKeybindHint();
}

document.addEventListener("keydown", (ev) => {
	if (!rebindListening) {
		return;
	}
	ev.preventDefault();
	ev.stopPropagation();
	if (ev.key === "Escape") {
		setRebindListening(false);
		return;
	}
	if (Date.now() - rebindArmedAt < REBIND_ARM_MS) {
		return;
	}
	const name = eventToKeyName(ev);
	if (!name) {
		return;
	}
	snapshot.general.editorKey = name;
	rebindListening = false;
	rebindArmedAt = 0;
	updateKeybindHint();
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE("editorKey:" + name);
	}
	scheduleSave(true);
}, true);

/** Called from _Core.js after all section scripts have loaded. */
function bootEditorChrome() {
	bindEditorHelpButton();
	bindEditorKeyHint();
	applyTheme();
}
