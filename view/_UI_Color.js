// COG overlay - color helpers, ramps, picker, color field controls
// Classic script; shares globals with _UI.js and feature modules.

let colorPickerState = null;

function normalizeHexColor(value, fallback) {
	const raw = String(value == null ? "" : value).trim().replace(/\s+/g, "");
	if (!raw) {
		return fallback;
	}
	const bare = raw.replace(/^#+/, "");
	if (/^[0-9a-fA-F]{6}$/i.test(bare)) {
		return `#${bare.toLowerCase()}`;
	}
	if (/^[0-9a-fA-F]{3}$/i.test(bare)) {
		return `#${bare[0]}${bare[0]}${bare[1]}${bare[1]}${bare[2]}${bare[2]}`.toLowerCase();
	}
	return fallback;
}

/** Digits only for hex fields that show a permanent # affix. */
function bareHexDigits(value) {
	return String(value == null ? "" : value)
		.trim()
		.replace(/\s+/g, "")
		.replace(/^#+/, "")
		.toLowerCase();
}

function sanitizeHexDigits(raw, maxLen) {
	const limit = Number.isFinite(maxLen) ? maxLen : 6;
	return String(raw == null ? "" : raw).replace(/[^0-9a-fA-F]/g, "").slice(0, limit);
}

/** Full #rrggbb only — 3-digit shorthand expands on Enter / blur, not while typing. */
function isFullHexColor(value) {
	const bare = bareHexDigits(value);
	return /^[0-9a-fA-F]{6}$/i.test(bare);
}

function isShorthandHexColor(value) {
	const bare = bareHexDigits(value);
	return /^[0-9a-fA-F]{3}$/i.test(bare);
}

/**
 * Wrap an input with a faded permanent prefix/suffix (e.g. # / % / s).
 * Moves `input` into the wrapper in-place. Idempotent.
 */
function wrapInputAffix(input, opts) {
	if (!input) {
		return null;
	}
	const existing = input.closest(".field-affix");
	if (existing) {
		return existing;
	}
	const prefix = opts && opts.prefix ? String(opts.prefix) : "";
	const suffix = opts && opts.suffix ? String(opts.suffix) : "";
	if (!prefix && !suffix) {
		return null;
	}
	const wrap = document.createElement("span");
	wrap.className = "field-affix";
	if (prefix) {
		wrap.classList.add("has-prefix");
	}
	if (suffix) {
		wrap.classList.add("has-suffix");
	}
	if (input.parentNode) {
		input.parentNode.insertBefore(wrap, input);
	}
	if (prefix) {
		const mark = document.createElement("span");
		mark.className = "field-affix-mark field-affix-prefix";
		mark.textContent = prefix;
		mark.setAttribute("aria-hidden", "true");
		wrap.appendChild(mark);
	}
	wrap.appendChild(input);
	if (suffix) {
		const mark = document.createElement("span");
		mark.className = "field-affix-mark field-affix-suffix";
		mark.textContent = suffix;
		mark.setAttribute("aria-hidden", "true");
		wrap.appendChild(mark);
	}
	return wrap;
}

/** Keep only 0-9a-f in a hex digit field; preserve caret when possible. */
function bindHexDigitFilter(input) {
	if (!input || input.dataset.hexFilter === "1") {
		return;
	}
	input.dataset.hexFilter = "1";
	input.maxLength = 6;
	input.spellcheck = false;
	input.autocomplete = "off";
	input.addEventListener("beforeinput", (ev) => {
		if (ev.inputType && ev.inputType.indexOf("insert") === 0 && ev.data != null && /[^0-9a-fA-F]/.test(ev.data)) {
			ev.preventDefault();
		}
	});
	input.addEventListener("input", () => {
		const start = input.selectionStart;
		const before = input.value;
		const cleaned = sanitizeHexDigits(before, 6);
		if (cleaned === before) {
			return;
		}
		input.value = cleaned;
		if (typeof start === "number") {
			const delta = before.length - cleaned.length;
			const next = Math.max(0, start - delta);
			try {
				input.setSelectionRange(next, next);
			} catch {
				/* ignore */
			}
		}
	});
}

function optionalHex(value) {
	return normalizeHexColor(value, "") || "";
}

/** Migration Code for Transition from v1.01 or earlier to v1.1:
 * Older startColor/endColor pairs become iconColor (single hex or 0%/100% ramp). */
function migrateLegacyIconPair(startColor, endColor) {
	const start = optionalHex(startColor);
	const end = optionalHex(endColor);
	if (!start && !end) {
		return "";
	}
	if (!start) {
		return end;
	}
	if (!end || end === start) {
		return start;
	}
	return formatColorRamp([
		{ pct: 0, color: start },
		{ pct: 100, color: end }
	]);
}

/** Parse hex or JSON stop array → sorted [{pct,color}, …]. */
function parseColorRamp(raw) {
	if (raw == null) {
		return [];
	}
	if (Array.isArray(raw)) {
		const stops = [];
		for (const item of raw) {
			if (!item || typeof item !== "object") {
				continue;
			}
			const color = optionalHex(item.color);
			if (!color) {
				continue;
			}
			let pct = Number(item.pct != null ? item.pct : item.percent);
			if (!Number.isFinite(pct)) {
				pct = 0;
			}
			pct = Math.max(0, Math.min(100, pct));
			stops.push({ pct, color });
		}
		stops.sort((a, b) => a.pct - b.pct);
		const uniq = [];
		for (const s of stops) {
			if (uniq.length && Math.abs(uniq[uniq.length - 1].pct - s.pct) < 1e-9) {
				uniq[uniq.length - 1] = s;
			} else {
				uniq.push(s);
			}
		}
		return uniq;
	}
	const text = String(raw).trim();
	if (!text) {
		return [];
	}
	if (text.charAt(0) === "[") {
		try {
			return parseColorRamp(JSON.parse(text));
		} catch {
			return [];
		}
	}
	const hex = optionalHex(text);
	return hex ? [{ pct: 0, color: hex }] : [];
}

function formatColorRamp(stops) {
	const list = parseColorRamp(Array.isArray(stops) ? stops : []);
	if (!list.length) {
		return "";
	}
	if (list.length === 1) {
		return list[0].color;
	}
	return JSON.stringify(list.map((s) => ({ pct: s.pct, color: s.color })));
}

/** Normalize wire value (hex, array, or legacy start/end) → hex or JSON string.
 * Migration Code for Transition from v1.01 or earlier to v1.1: legacyStart/legacyEnd fill empty iconColor. */
function normalizeColorRampValue(raw, legacyStart, legacyEnd) {
	if (raw != null && raw !== "") {
		const stops = parseColorRamp(raw);
		if (stops.length) {
			return formatColorRamp(stops);
		}
	}
	return migrateLegacyIconPair(legacyStart, legacyEnd);
}

function mixHexColors(a, b, t) {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	if (!ca && !cb) {
		return "";
	}
	if (!ca) {
		return optionalHex(b);
	}
	if (!cb) {
		return optionalHex(a);
	}
	const u = Math.max(0, Math.min(1, Number(t) || 0));
	const ch = (x, y) => Math.round(x + (y - x) * u);
	return `#${[ch(ca.r, cb.r), ch(ca.g, cb.g), ch(ca.b, cb.b)]
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("")}`;
}

function sampleColorRamp(stopsOrRaw, percent) {
	const stops = Array.isArray(stopsOrRaw) ? parseColorRamp(stopsOrRaw) : parseColorRamp(stopsOrRaw);
	if (!stops.length) {
		return "";
	}
	if (stops.length === 1) {
		return stops[0].color;
	}
	const pct = Math.max(0, Math.min(100, Number(percent) || 0));
	if (pct <= stops[0].pct) {
		return stops[0].color;
	}
	const last = stops[stops.length - 1];
	if (pct >= last.pct) {
		return last.color;
	}
	for (let i = 0; i < stops.length - 1; i += 1) {
		const a = stops[i];
		const b = stops[i + 1];
		if (pct + 1e-9 >= a.pct && pct - 1e-9 <= b.pct) {
			const span = b.pct - a.pct;
			const t = span <= 1e-9 ? 0 : (pct - a.pct) / span;
			return mixHexColors(a.color, b.color, t) || a.color;
		}
	}
	return last.color;
}

function clampByte(n) {
	const v = Math.round(Number(n));
	if (!Number.isFinite(v)) {
		return 0;
	}
	return Math.max(0, Math.min(255, v));
}

function hexToRgb(hex) {
	const h = normalizeHexColor(hex, "");
	if (!h) {
		return null;
	}
	return {
		r: parseInt(h.slice(1, 3), 16),
		g: parseInt(h.slice(3, 5), 16),
		b: parseInt(h.slice(5, 7), 16)
	};
}

function rgbToHex(r, g, b) {
	return `#${[clampByte(r), clampByte(g), clampByte(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsv(r, g, b) {
	r = clampByte(r) / 255;
	g = clampByte(g) / 255;
	b = clampByte(b) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d > 0) {
		if (max === r) {
			h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
		} else if (max === g) {
			h = ((b - r) / d + 2) * 60;
		} else {
			h = ((r - g) / d + 4) * 60;
		}
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h, s, v) {
	h = ((Number(h) % 360) + 360) % 360;
	s = Math.max(0, Math.min(1, Number(s) || 0));
	v = Math.max(0, Math.min(1, Number(v) || 0));
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

function closeColorPicker() {
	const id = colorPickerState && colorPickerState.popupId;
	const finalize = colorPickerState && colorPickerState.finalize;
	if (colorPickerState && colorPickerState.el && colorPickerState.el.parentNode) {
		colorPickerState.el.parentNode.removeChild(colorPickerState.el);
	}
	colorPickerState = null;
	unregisterEditorPopup(id);
	// Flush any live-only drag so the last colour is persisted once on close.
	if (typeof finalize === "function") {
		finalize();
	}
}

/**
 * Prisma/CEF clipboard (execCommand / navigator.clipboard) can hitch mouse capture
 * and sometimes "succeed" without updating the OS clipboard. Prefer Win32 via
 * cogToSKSE("clipboard:…"); only fall back to DOM/async when the bridge is missing.
 */
function copyTextToClipboardSync(text) {
	const value = String(text || "");
	if (!value) {
		return false;
	}
	try {
		const ta = document.createElement("textarea");
		ta.value = value;
		ta.setAttribute("readonly", "");
		ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
		document.body.appendChild(ta);
		ta.focus({ preventScroll: true });
		ta.select();
		ta.setSelectionRange(0, value.length);
		const ok = document.execCommand("copy");
		document.body.removeChild(ta);
		return !!ok;
	} catch (_) {
		return false;
	}
}

function copyInputTextOnShortcut(input, ev) {
	if (!input || !ev || !(ev.ctrlKey || ev.metaKey)) {
		return false;
	}
	const key = String(ev.key || "").toLowerCase();
	if (key !== "c" && key !== "x") {
		return false;
	}
	const start = Number(input.selectionStart);
	const end = Number(input.selectionEnd);
	const hasRange = Number.isFinite(start) && Number.isFinite(end) && end > start;
	const selected = hasRange ? String(input.value).slice(start, end) : String(input.value || "");
	if (!selected) {
		return false;
	}
	ev.preventDefault();
	ev.stopPropagation();

	const refocus = (forCut) => {
		try {
			input.focus({ preventScroll: true });
			if (hasRange && !forCut) {
				input.setSelectionRange(start, end);
			} else if (forCut && hasRange) {
				input.setSelectionRange(start, start);
			}
		} catch (_) {
			try {
				input.focus();
			} catch (__) {
				/* ignore */
			}
		}
	};

	const doCut = () => {
		if (key !== "x" || !hasRange || input.readOnly) {
			return false;
		}
		const next = String(input.value).slice(0, start) + String(input.value).slice(end);
		input.value = next;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		return true;
	};

	let nativeSent = false;
	try {
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE("clipboard:" + selected);
			nativeSent = true;
		}
	} catch (_) {
		nativeSent = false;
	}

	// Win32 path is enough — skip CEF copy (avoids Prisma mouse-capture hitch).
	if (nativeSent) {
		const cut = doCut();
		refocus(cut);
		return true;
	}

	const syncOk = copyTextToClipboardSync(selected);
	if (syncOk) {
		const cut = doCut();
		refocus(cut);
		return true;
	}

	if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
		navigator.clipboard
			.writeText(selected)
			.then(() => {
				const cut = doCut();
				refocus(cut);
			})
			.catch(() => {
				refocus(false);
			});
		return true;
	}

	refocus(false);
	return true;
}

function openColorPicker(anchor, opts) {
	beginEditorPopup("color");
	const allowEmpty = !!opts.allowEmpty;
	const fallback = opts.fallback || "#ffffff";
	let current = normalizeHexColor(opts.value, allowEmpty ? "" : fallback) || (allowEmpty ? "" : fallback);
	if (!current && !allowEmpty) {
		current = fallback;
	}
	let lastCommitted = current;
	let liveDirty = false;
	const rgb0 = hexToRgb(current) || hexToRgb(fallback) || { r: 255, g: 255, b: 255 };
	let hsv = rgbToHsv(rgb0.r, rgb0.g, rgb0.b);

	const pop = document.createElement("div");
	pop.className = "cog-color-picker";
	pop.innerHTML = `
		<div class="ccp-sv" tabindex="-1">
			<div class="ccp-sv-white"></div>
			<div class="ccp-sv-black"></div>
			<div class="ccp-sv-cursor"></div>
		</div>
		<div class="ccp-hue" tabindex="-1">
			<div class="ccp-hue-thumb"></div>
		</div>
		<div class="ccp-preview-row">
			<span class="ccp-preview"></span>
			<label class="ccp-hex-wrap"><span class="ccp-hex-label">Hex</span> <input type="text" class="ccp-hex" spellcheck="false" maxlength="6" autocomplete="off"></label>
		</div>
		<div class="ccp-rgb-row">
			<label>R <input type="number" class="ccp-r" min="0" max="255" step="1"></label>
			<label>G <input type="number" class="ccp-g" min="0" max="255" step="1"></label>
			<label>B <input type="number" class="ccp-b" min="0" max="255" step="1"></label>
		</div>
		${allowEmpty ? `<div class="ccp-actions"><button type="button" class="action ccp-clear">Clear</button></div>` : ""}`;

	const sv = pop.querySelector(".ccp-sv");
	const hueEl = pop.querySelector(".ccp-hue");
	const cursor = pop.querySelector(".ccp-sv-cursor");
	const hueThumb = pop.querySelector(".ccp-hue-thumb");
	const preview = pop.querySelector(".ccp-preview");
	const hexLabel = pop.querySelector(".ccp-hex-label");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(hexLabel, "cog-hex", "Hex");
	}
	const hexInput = pop.querySelector(".ccp-hex");
	wrapInputAffix(hexInput, { prefix: "#" });
	bindHexDigitFilter(hexInput);
	const rInput = pop.querySelector(".ccp-r");
	const gInput = pop.querySelector(".ccp-g");
	const bInput = pop.querySelector(".ccp-b");

	const emitLive = (hex) => {
		if (hex === current) {
			return;
		}
		current = hex;
		liveDirty = true;
		if (typeof opts.onLive === "function") {
			opts.onLive(hex);
		} else if (typeof opts.onChange === "function") {
			opts.onChange(hex, true);
		}
	};

	const emitCommit = (hex) => {
		current = hex;
		const need = hex !== lastCommitted || liveDirty;
		lastCommitted = hex;
		liveDirty = false;
		if (!need) {
			return;
		}
		if (typeof opts.onChange === "function") {
			opts.onChange(hex, false);
		}
	};

	const syncFromHsv = (mode, rewriteHex) => {
		const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
		const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
		sv.style.backgroundColor = `hsl(${hsv.h}, 100%, 50%)`;
		cursor.style.left = `${hsv.s * 100}%`;
		cursor.style.top = `${(1 - hsv.v) * 100}%`;
		hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
		preview.style.background = hex;
		if (rewriteHex !== false) {
			hexInput.value = bareHexDigits(hex);
		}
		rInput.value = String(rgb.r);
		gInput.value = String(rgb.g);
		bInput.value = String(rgb.b);
		if (mode === "live") {
			emitLive(hex);
		} else if (mode === "commit") {
			emitCommit(hex);
		}
	};

	const setFromHex = (hex, mode, rewriteHex) => {
		const rgb = hexToRgb(hex);
		if (!rgb) {
			return false;
		}
		hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
		syncFromHsv(mode, rewriteHex);
		return true;
	};

	const setFromRgb = (mode) => {
		hsv = rgbToHsv(rInput.value, gInput.value, bInput.value);
		syncFromHsv(mode, document.activeElement !== hexInput);
	};

	const pickSv = (clientX, clientY) => {
		const rect = sv.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		hsv.s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		hsv.v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
		syncFromHsv("live");
	};

	const pickHue = (clientX) => {
		const rect = hueEl.getBoundingClientRect();
		if (rect.width <= 0) {
			return;
		}
		hsv.h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
		syncFromHsv("live");
	};

	const bindDrag = (el, onMove) => {
		let dragging = false;
		el.addEventListener("pointerdown", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			el.setPointerCapture(ev.pointerId);
			dragging = true;
			onMove(ev.clientX, ev.clientY);
		});
		el.addEventListener("pointermove", (ev) => {
			if (!el.hasPointerCapture(ev.pointerId)) {
				return;
			}
			onMove(ev.clientX, ev.clientY);
		});
		const release = (ev) => {
			if (el.hasPointerCapture && el.hasPointerCapture(ev.pointerId)) {
				el.releasePointerCapture(ev.pointerId);
			}
			if (dragging) {
				dragging = false;
				emitCommit(current);
			}
		};
		el.addEventListener("pointerup", release);
		el.addEventListener("pointercancel", release);
	};
	bindDrag(sv, pickSv);
	bindDrag(hueEl, (x) => pickHue(x));

	const commitPickerHex = (raw, expandShorthand) => {
		const t = sanitizeHexDigits(raw, 6);
		if (allowEmpty && !t) {
			emitCommit("");
			preview.style.background = "transparent";
			return;
		}
		const ok = isFullHexColor(t) || (expandShorthand && isShorthandHexColor(t));
		if (!ok || !setFromHex(normalizeHexColor(t, current || fallback), "commit", true)) {
			hexInput.value = bareHexDigits(current);
		}
	};
	hexInput.addEventListener("input", () => {
		const t = sanitizeHexDigits(hexInput.value, 6);
		if (isFullHexColor(t)) {
			// Apply colour without rewriting the hex field (preserves backspace / caret).
			setFromHex(normalizeHexColor(t, current || fallback), "live", false);
		}
	});
	hexInput.addEventListener("blur", () => commitPickerHex(hexInput.value, true));
	hexInput.addEventListener("keydown", (ev) => {
		if (copyInputTextOnShortcut(hexInput, ev)) {
			return;
		}
		if (ev.key === "Enter") {
			ev.preventDefault();
			commitPickerHex(hexInput.value, true);
			hexInput.blur();
		}
	});
	const onRgbKeydown = (ev) => {
		const t = ev.target;
		if (t === rInput || t === gInput || t === bInput) {
			copyInputTextOnShortcut(t, ev);
		}
	};
	rInput.addEventListener("keydown", onRgbKeydown);
	gInput.addEventListener("keydown", onRgbKeydown);
	bInput.addEventListener("keydown", onRgbKeydown);
	const onRgbLive = () => setFromRgb("live");
	const onRgbCommit = () => setFromRgb("commit");
	rInput.addEventListener("input", onRgbLive);
	gInput.addEventListener("input", onRgbLive);
	bInput.addEventListener("input", onRgbLive);
	rInput.addEventListener("change", onRgbCommit);
	gInput.addEventListener("change", onRgbCommit);
	bInput.addEventListener("change", onRgbCommit);

	const clearBtn = pop.querySelector(".ccp-clear");
	if (clearBtn) {
		if (typeof setTranslatedText === "function") {
			setTranslatedText(clearBtn, "cog-clear", "Clear");
		}
		clearBtn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			emitCommit("");
			preview.style.background = "transparent";
			hexInput.value = "";
			closeColorPicker();
		});
	}

	pop.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	document.body.appendChild(pop);

	const place = () => {
		const rect = anchor.getBoundingClientRect();
		const pad = 8;
		const pw = pop.offsetWidth || 220;
		const ph = pop.offsetHeight || 260;
		let left = rect.left;
		let top = rect.bottom + 6;
		if (left + pw > window.innerWidth - pad) {
			left = Math.max(pad, window.innerWidth - pw - pad);
		}
		if (top + ph > window.innerHeight - pad) {
			top = Math.max(pad, rect.top - ph - 6);
		}
		pop.style.left = `${Math.round(left)}px`;
		pop.style.top = `${Math.round(top)}px`;
	};

	if (current) {
		setFromHex(current, false);
	} else {
		syncFromHsv(false);
		preview.style.background = "transparent";
		hexInput.value = "";
	}
	place();

	const popupId = registerEditorPopup("color", {
		close: closeColorPicker,
		reposition: place,
		retain: pop
	});
	colorPickerState = {
		el: pop,
		anchor,
		onChange: opts.onChange,
		onLive: opts.onLive,
		allowEmpty,
		reposition: place,
		popupId,
		finalize: () => {
			if (liveDirty) {
				emitCommit(current);
			}
		}
	};
	hexInput.focus();
	hexInput.select();
}

function makeColorControl(opts) {
	const label = opts.label || "Colour";
	const allowEmpty = !!opts.allowEmpty;
	const fallback = opts.fallback || "#ffffff";
	let value = allowEmpty
		? optionalHex(opts.value)
		: normalizeHexColor(opts.value, fallback);

	const field = document.createElement("div");
	field.className = "color-field";
	field.innerHTML = `<span>${label}</span>
		<span class="color-controls">
			<button type="button" class="color-swatch"></button>
			<input type="text" class="color-hex" spellcheck="false" maxlength="6" autocomplete="off">
		</span>`;
	const swatch = field.querySelector(".color-swatch");
	const text = field.querySelector(".color-hex");
	if (typeof setTranslatedAriaLabel === "function") {
		setTranslatedAriaLabel(swatch, "cog-colour-picker", "Colour picker");
	} else {
		swatch.setAttribute("aria-label", "Colour picker");
	}
	text.setAttribute("aria-label", label);
	wrapInputAffix(text, { prefix: "#" });
	bindHexDigitFilter(text);
	let hexFocused = false;

	const swatchDisplayColor = (hex) => {
		const stored = optionalHex(hex);
		if (stored) {
			return stored;
		}
		if (allowEmpty) {
			return optionalHex(fallback);
		}
		return normalizeHexColor(hex, fallback);
	};

	const paintSwatch = (hex) => {
		const display = swatchDisplayColor(hex);
		if (display) {
			swatch.style.background = display;
			swatch.classList.remove("is-empty");
		} else {
			swatch.style.background = "transparent";
			swatch.classList.add("is-empty");
		}
	};

	const paint = (hex, rewriteText) => {
		value = hex;
		if (rewriteText || !hexFocused) {
			text.value = bareHexDigits(hex);
		}
		paintSwatch(hex);
		if (allowEmpty && opts.placeholder) {
			text.placeholder = bareHexDigits(opts.placeholder);
		}
	};

	const commit = (raw, expandShorthand) => {
		const trimmed = sanitizeHexDigits(raw, 6);
		if (allowEmpty && !trimmed) {
			const changed = value !== "";
			paint("", true);
			if (changed && typeof opts.onCommit === "function") {
				opts.onCommit("", false);
			}
			return true;
		}
		const ok = isFullHexColor(trimmed) || (expandShorthand && isShorthandHexColor(trimmed));
		if (!ok) {
			return false;
		}
		const next = normalizeHexColor(trimmed, allowEmpty ? "" : (value || fallback));
		if (!next) {
			return false;
		}
		const changed = next !== value;
		paint(next, true);
		if (changed && typeof opts.onCommit === "function") {
			opts.onCommit(next, false);
		}
		return true;
	};

	paint(value, true);
	if (allowEmpty) {
		text.placeholder = bareHexDigits(opts.placeholder || fallback || "");
	}

	text.addEventListener("focus", () => {
		hexFocused = true;
	});
	text.addEventListener("input", () => {
		const t = sanitizeHexDigits(text.value, 6);
		if (allowEmpty && t === "") {
			value = "";
			paintSwatch("");
			if (typeof opts.onCommit === "function") {
				opts.onCommit("", true);
			}
			return;
		}
		// Live-apply full rrggbb only — never rewrite the field (keeps caret / backspace intact).
		if (isFullHexColor(t)) {
			const next = normalizeHexColor(t, value || fallback);
			if (!next) {
				return;
			}
			value = next;
			paintSwatch(next);
			if (typeof opts.onLive === "function") {
				opts.onLive(next);
			} else if (typeof opts.onCommit === "function") {
				opts.onCommit(next, true);
			}
		}
	});
	text.addEventListener("blur", () => {
		hexFocused = false;
		if (!commit(text.value, true)) {
			paint(value, true);
		}
	});
	text.addEventListener("keydown", (ev) => {
		if (copyInputTextOnShortcut(text, ev)) {
			return;
		}
		if (ev.key === "Enter") {
			ev.preventDefault();
			commit(text.value, true);
			text.blur();
		}
	});

	swatch.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		if (colorPickerState && colorPickerState.anchor === swatch) {
			closeColorPicker();
			return;
		}
		openColorPicker(swatch, {
			value: value || (allowEmpty ? "" : fallback),
			fallback,
			allowEmpty,
			onLive: (hex) => {
				paint(hex, true);
				if (typeof opts.onLive === "function") {
					opts.onLive(hex);
				} else if (typeof opts.onCommit === "function") {
					opts.onCommit(hex, true);
				}
			},
			onChange: (hex) => {
				paint(hex, true);
				if (typeof opts.onCommit === "function") {
					opts.onCommit(hex, false);
				}
			}
		});
	});

	return field;
}

/** Colour field with Clear (resets to empty → runtime fallback) and placeholder showing the default. */
function makeOptionalColorField(label, value, fallback, onCommit) {
	return makeColorControl({
		label,
		value,
		fallback,
		allowEmpty: true,
		placeholder: fallback || "",
		onCommit
	});
}

/**
 * Multi-stop colour ramp editor (iconColor / barColor).
 * Single-line chips (colour + % + ×) with inline +. Empty stops → inherit fallback.
 */
function makeColorRampEditor(label, value, fallback, onCommit) {
	const wrap = document.createElement("div");
	wrap.className = "color-ramp-editor";
	const heading = document.createElement("div");
	heading.className = "color-ramp-heading";
	heading.textContent = label;
	wrap.appendChild(heading);
	const hint = document.createElement("p");
	hint.className = "lede color-ramp-hint";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			hint,
			"cog-color-ramp-hint",
			"Empty inherits the backup. Multiple stops fade between percentages."
		);
	} else {
		hint.textContent = "Empty inherits the backup. Multiple stops fade between percentages.";
	}
	wrap.appendChild(hint);
	const list = document.createElement("div");
	list.className = "color-ramp-stops";
	wrap.appendChild(list);
	let stops = parseColorRamp(value);

	const emit = (live) => {
		if (typeof onCommit === "function") {
			onCommit(formatColorRamp(stops), !!live);
		}
	};

	const hasHundredStop = () => stops.some((s) => s.pct >= 100 - 1e-9);
	let addBtn = null;
	let addWrap = null;

	const closeAddCapTip = () => {
		if (!addWrap) {
			return;
		}
		closeInfoTipWrap(addWrap);
	};

	const syncAddBtn = () => {
		if (!addBtn || !addWrap) {
			return;
		}
		const atCap = hasHundredStop();
		addBtn.disabled = atCap;
		addBtn.removeAttribute("title");
		if (typeof setTranslatedAriaLabel === "function") {
			if (atCap) {
				setTranslatedAriaLabel(
					addBtn,
					"cog-cannot-add-colour-stop",
					"Cannot add \u2014 already has a 100% stop"
				);
			} else {
				setTranslatedAriaLabel(addBtn, "cog-add-colour-stop", "Add colour stop");
			}
		} else {
			addBtn.setAttribute(
				"aria-label",
				atCap ? "Cannot add \u2014 already has a 100% stop" : "Add colour stop"
			);
		}
		addWrap.classList.toggle("is-capped", atCap);
		if (!atCap) {
			closeAddCapTip();
		}
	};

	const addStop = () => {
		if (hasHundredStop()) {
			return;
		}
		const lastPct = stops.length ? stops[stops.length - 1].pct : 0;
		const nextPct = stops.length ? Math.min(100, lastPct + 10) : 0;
		stops.push({
			pct: stops.length ? nextPct : 0,
			color: optionalHex(fallback) || "#ffffff"
		});
		if (stops.length === 2 && stops[0].pct === 0 && stops[1].pct === 0) {
			stops[1].pct = 100;
		}
		stops = parseColorRamp(stops);
		emit(false);
		rebuild();
	};

	const rebuild = () => {
		closeAddCapTip();
		list.innerHTML = "";
		stops.forEach((stop, index) => {
			const card = document.createElement("div");
			card.className = "color-ramp-card";

			const colourCtrl = makeColorControl({
				label: "Colour",
				value: stop.color,
				fallback: fallback || "#ffffff",
				allowEmpty: false,
				onCommit: (hex, live) => {
					stops[index] = {
						...stops[index],
						color: hex || optionalHex(fallback) || "#ffffff"
					};
					emit(!!live);
				}
			});
			tagFieldLabel(colourCtrl, "cog-colour", "Colour");
			card.appendChild(colourCtrl);

			const pctLab = document.createElement("label");
			pctLab.className = "color-ramp-pct";
			const pctInput = document.createElement("input");
			pctInput.type = "text";
			pctInput.inputMode = "decimal";
			pctInput.spellcheck = false;
			pctInput.value = String(stop.pct);
			if (typeof setTranslatedAriaLabel === "function") {
				setTranslatedAriaLabel(pctInput, "cog-percentage", "Percentage");
			} else {
				pctInput.setAttribute("aria-label", "Percentage");
			}
			pctInput.addEventListener("input", () => {
				let n = Number(pctInput.value);
				if (!Number.isFinite(n)) {
					return;
				}
				n = Math.max(0, Math.min(100, n));
				stops[index] = { ...stops[index], pct: n };
				syncAddBtn();
				emit(true);
			});
			pctInput.addEventListener("change", () => {
				let n = Number(pctInput.value);
				if (!Number.isFinite(n)) {
					n = 0;
				}
				n = Math.max(0, Math.min(100, n));
				pctInput.value = String(n);
				stops[index] = { ...stops[index], pct: n };
				stops = parseColorRamp(stops);
				emit(false);
				rebuild();
			});
			pctLab.appendChild(pctInput);
			wrapInputAffix(pctInput, { suffix: "%" });
			card.appendChild(pctLab);

			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "clock-token-remove";
			if (typeof setTranslatedTitle === "function") {
				setTranslatedTitle(remove, "cog-remove", "Remove");
			} else {
				remove.title = "Remove";
			}
			if (typeof setTranslatedAriaLabel === "function") {
				setTranslatedAriaLabel(remove, "cog-remove-colour-stop", "Remove colour stop");
			} else {
				remove.setAttribute("aria-label", "Remove colour stop");
			}
			remove.textContent = "×";
			remove.addEventListener("click", () => {
				stops.splice(index, 1);
				emit(false);
				rebuild();
			});
			card.appendChild(remove);
			list.appendChild(card);
		});

		addWrap = document.createElement("span");
		addWrap.className = "color-ramp-add-wrap info-tip";
		addBtn = document.createElement("button");
		addBtn.type = "button";
		addBtn.className = "color-ramp-add";
		addBtn.textContent = "+";
		addBtn.addEventListener("click", addStop);
		const tipPanel = document.createElement("span");
		tipPanel.className = "info-tip-panel";
		tipPanel.hidden = true;
		if (typeof setTranslatedText === "function") {
			setTranslatedText(
				tipPanel,
				"cog-color-ramp-at-cap",
				"Already has a 100% stop \u2014 lower one first to add another."
			);
		} else {
			tipPanel.textContent =
				"Already has a 100% stop \u2014 lower one first to add another.";
		}
		addWrap._cogPanel = tipPanel;
		const showCapTip = () => {
			if (!hasHundredStop() || addWrap.classList.contains("is-open")) {
				return;
			}
			beginEditorPopup("info");
			addWrap.classList.add("is-open");
			const place = () => placeAnchoredPopup(tipPanel, addBtn, { gap: 6, align: "start" });
			addWrap._cogPopupId = registerEditorPopup("info", {
				close: () => closeInfoTipWrap(addWrap),
				reposition: place,
				retain: tipPanel
			});
			place();
		};
		addWrap.addEventListener("pointerenter", showCapTip);
		addWrap.addEventListener("pointerleave", closeAddCapTip);
		tipPanel.addEventListener("pointerdown", (ev) => ev.stopPropagation());
		tipPanel.addEventListener("click", (ev) => ev.stopPropagation());
		addWrap.appendChild(addBtn);
		addWrap.appendChild(tipPanel);
		syncAddBtn();
		list.appendChild(addWrap);
	};

	rebuild();
	return wrap;
}

function makeColorField(label, key, value, fallback) {
	return makeOptionalColorField(label, value, fallback, (hex, live) => {
		if (snapshot.general[key] === hex) {
			if (live === false) {
				scheduleSave(true);
			}
			return;
		}
		snapshot.general[key] = hex;
		applyTheme();
		if (live === true) {
			softRefreshHudPaint();
			return;
		}
		scheduleSave(true);
		if (live === false) {
			softRefreshHudPaint();
			return;
		}
		renderGears();
	});
}

/** Repaint existing HUD nodes from settings (no full rebuild / fade bookkeeping). */

