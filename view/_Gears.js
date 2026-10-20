// COG overlay - Gears (type-level: all gears)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

const INVENTORY_GEAR_MOD = "COG.Inventory";

let pickerIndex = 0;
let gearFilterQ = "";
let gearFilterType = "";
let gearFilterCategory = "";
let pickerGroupId = "";
let pickerRoot = null;
let editGearId = "";
let openInventoryGearId = "";
let openGearsTabAcc = "edit";

function titleCaseLabel(text) {
	return String(text || "—").replace(/(^|[\s\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function sourceTitle(src, fallback, gear) {
	const display = appearanceOf(gear, src).display;
	if (display) {
		return titleCaseLabel(display);
	}
	if (src && src.name) {
		return titleCaseLabel(src.name);
	}
	return titleCaseLabel(fallback || "—");
}

function typeLabel(type) {
	if (type === "percent") {
		return typeof t === "function" ? t("cog-percent", "Percent") : "Percent";
	}
	if (type === "count") {
		return typeof t === "function" ? t("cog-count", "Count") : "Count";
	}
	if (type === "timer") {
		return typeof t === "function" ? t("cog-timer", "Timer") : "Timer";
	}
	return type || "?";
}

function sourceMeta(src) {
	const category = (src && src.category) || "—";
	const type = typeLabel(src && src.type);
	return `${category} · ${type} · ${formatValue(src)}`;
}

function uniqueCategories() {
	const set = new Set();
	for (const src of snapshot.sources || []) {
		if (!isPickableGearSource(src)) {
			continue;
		}
		if (src.category) {
			set.add(src.category);
		}
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

/** Rebuild every category filter from live sources; keep selection when still valid. */
function refreshCategorySelects(root) {
	const scope = root || document;
	for (const catSel of scope.querySelectorAll(".filter-category, #filter-category")) {
		const prev = catSel.value;
		while (catSel.options.length > 1) {
			catSel.remove(1);
		}
		for (const cat of uniqueCategories()) {
			const opt = document.createElement("option");
			opt.value = cat;
			opt.textContent = cat;
			catSel.appendChild(opt);
		}
		const stillThere = [...catSel.options].some((o) => o.value === prev);
		catSel.value = stillThere ? prev : "";
		if (!stillThere && gearFilterCategory === prev) {
			gearFilterCategory = "";
		}
		catSel.dispatchEvent(new Event("cog:options"));
	}
}

function sourceMatchesFilters(src) {
	if (!src) {
		return false;
	}
	if (gearFilterType && src.type !== gearFilterType) {
		return false;
	}
	if (gearFilterCategory && (src.category || "") !== gearFilterCategory) {
		return false;
	}
	const q = (gearFilterQ || "").trim().toLowerCase();
	if (!q) {
		return true;
	}
	const gear = gearBySource(src.mod, src.name);
	const display = appearanceOf(gear, src).display || src.display || "";
	const hay = `${display} ${src.name || ""} ${src.mod || ""} ${src.category || ""} ${src.type || ""} ${typeLabel(src.type)}`.toLowerCase();
	return hay.includes(q);
}

function emptyAppearance() {
	return {
		display: "",
		icon: "",
		iconColor: "",
		barColor: "",
		hideAt: "",
		hudLinkedElement: "",
		hudHideDuplicate: false
	};
}

function normalizeAppearance(raw) {
	const a = raw && typeof raw === "object" ? raw : {};
	return {
		display: String(a.display || ""),
		icon: normalizeIconRelPath(String(a.icon || "")),
		iconColor: normalizeColorRampValue(a.iconColor, a.startColor, a.endColor),
		barColor: normalizeColorRampValue(a.barColor, "", ""),
		hideAt: String(a.hideAt || ""),
		hudLinkedElement: String(a.hudLinkedElement || ""),
		hudHideDuplicate: !!a.hudHideDuplicate
	};
}

function ensureGearAppearance(gear) {
	if (!gear) {
		return;
	}
	gear.defaults = normalizeAppearance(gear.defaults);
	gear.settings = normalizeAppearance(gear.settings);
	gear.locked = !!gear.locked;
}

function isEmptyAppearance(a) {
	return !a || !(a.display || a.icon || a.iconColor || a.barColor || a.hideAt);
}

function appearanceOf(gear, src) {
	ensureGearAppearance(gear);
	const s = gear && gear.settings;
	if (s && !isEmptyAppearance(s)) {
		return {
			display: s.display || (src && (src.display || src.name)) || (gear && gear.name) || "",
			icon: s.icon || "",
			iconColor: s.iconColor || "",
			barColor: s.barColor || "",
			hideAt: s.hideAt || "",
			hudLinkedElement: s.hudLinkedElement || "",
			hudHideDuplicate: !!s.hudHideDuplicate
		};
	}
	const srcIcon = src
		? normalizeColorRampValue(src.iconColor, src.startColor, src.endColor)
		: "";
	const srcBar = src ? normalizeColorRampValue(src.barColor, "", "") : "";
	return {
		display: (src && (src.display || src.name)) || (gear && gear.name) || "",
		icon: (src && src.icon) || "",
		iconColor: srcIcon,
		barColor: srcBar,
		hideAt: (src && src.hideAt) || "",
		hudLinkedElement: (src && src.hudLinkedElement) || "",
		hudHideDuplicate: !!(src && src.hudHideDuplicate)
	};
}

function usesGroupColors(gear, group) {
	if (!gear || !group) {
		return false;
	}
	const style = ensureGroupStyle(group);
	return !!(style.useGroupColors && !gear.exemptFromGroupColors);
}

function meterPercent(src) {
	return Math.max(0, Math.min(100, Number(src && src.value) || 0));
}

function resolvedPalette(src, gear, group) {
	const pct = meterPercent(src);
	if (usesGroupColors(gear, group)) {
		const style = ensureGroupStyle(group);
		const iconRamp = normalizeColorRampValue(style.iconColor, style.startColor, style.endColor);
		const barRamp = normalizeColorRampValue(style.barColor, "", "");
		return {
			iconColor: iconRamp,
			barColor: barRamp,
			borderColor: optionalHex(style.borderColor) || themeBorder(),
			iconSample: sampleColorRamp(iconRamp, pct) || themeIconColor(),
			barSample: sampleColorRamp(barRamp, pct) || themeFill()
		};
	}
	const look = appearanceOf(gear, src);
	const iconRamp = look.iconColor || "";
	const barRamp = look.barColor || "";
	return {
		iconColor: iconRamp,
		barColor: barRamp,
		borderColor: themeBorder(),
		iconSample: sampleColorRamp(iconRamp, pct) || themeIconColor(),
		barSample: sampleColorRamp(barRamp, pct) || themeFill()
	};
}

function sourceBarColor(src, gear, group) {
	return resolvedPalette(src, gear, group).barSample;
}

function sourceBorderColor(src, gear, group) {
	return resolvedPalette(src, gear, group).borderColor;
}

function parseHexRgb(hex) {
	return hexToRgb(hex);
}

function mixHex(a, b, t) {
	return typeof mixHexColors === "function" ? mixHexColors(a, b, t) : a || b || "";
}

function iconRatio(src) {
	if (usesRatio(src)) {
		return Math.max(0, Math.min(1, (Number(src && src.value) || 0) / 100));
	}
	return 1;
}

function neutralIconModeFor(gear, group) {
	return usesGroupColors(gear, group)
		? normalizeNeutralIconMode(ensureGroupStyle(group).neutralIconMode)
		: normalizeNeutralIconMode(snapshot.general && snapshot.general.neutralIconMode);
}

function neutralIconPaint(palette, mode) {
	if (mode === "white") {
		return "#ffffff";
	}
	if (mode === "bar") {
		return palette.barSample || "";
	}
	if (mode === "border") {
		return palette.borderColor || "";
	}
	if (mode === "icon0") {
		return sampleColorRamp(palette.iconColor, 0) || themeIconColor();
	}
	if (mode === "icon100") {
		return sampleColorRamp(palette.iconColor, 100) || themeIconColor();
	}
	if (mode === "icon50") {
		return sampleColorRamp(palette.iconColor, 50) || themeIconColor();
	}
	return "#ffffff";
}

function sourceIconPaint(src, gear, group) {
	const href = sourceIconPath(src, gear);
	// Animated rasters: blank ramp means native colour (see rasterIconColorPlan).
	if (iconHrefIsAnimated(href)) {
		const plan = rasterIconColorPlan(src, gear, group);
		return plan.kind === "tint" ? plan.color : "";
	}
	const palette = resolvedPalette(src, gear, group);
	const mode = neutralIconModeFor(gear, group);
	// Counts have no meter progress — Neutral picks a solid icon colour.
	if (src && src.type === "count") {
		return neutralIconPaint(palette, mode);
	}
	return palette.iconSample || "";
}

/** User iconColor ramp only — no General theme fallback (blank = native for GIF/WebP). */
function iconTintRamp(src, gear, group) {
	if (usesGroupColors(gear, group)) {
		const style = ensureGroupStyle(group);
		return normalizeColorRampValue(style.iconColor, style.startColor, style.endColor);
	}
	return appearanceOf(gear, src).iconColor || "";
}

/**
 * GIF/WebP colour at the current meter value.
 * - blank ramp → native
 * - otherwise → solid tint sampled from the ramp
 */
function rasterIconColorPlan(src, gear, group) {
	const ramp = iconTintRamp(src, gear, group);
	const t = iconRatio(src);
	if (!ramp) {
		return { kind: "native" };
	}
	const color = sampleColorRamp(ramp, t * 100);
	if (!color) {
		return { kind: "native" };
	}
	return { kind: "tint", color };
}

function iconHrefIsAnimated(href) {
	return !!(href && /\.(gif|webp)(\?|$)/i.test(href));
}

function ensureRasterTintFace(icon) {
	let tint = icon.querySelector(":scope > .gear-icon-raster-tint");
	if (!tint) {
		tint = document.createElement("div");
		tint.className = "gear-icon-raster-tint gear-icon-face";
		icon.appendChild(tint);
	}
	return tint;
}

function setRasterTintFace(tint, href, color, opacity, frontierMask) {
	if (!tint) {
		return;
	}
	tint.hidden = false;
	tint.style.background = color || "#ffffff";
	tint.style.opacity = opacity == null ? "1" : String(opacity);
	const maskUrl = `url("${href}")`;
	if (frontierMask) {
		tint.style.webkitMaskImage = `${maskUrl}, ${frontierMask}`;
		tint.style.maskImage = `${maskUrl}, ${frontierMask}`;
		tint.style.webkitMaskComposite = "source-in";
		tint.style.maskComposite = "intersect";
		tint.style.webkitMaskRepeat = "no-repeat, no-repeat";
		tint.style.maskRepeat = "no-repeat, no-repeat";
		tint.style.webkitMaskPosition = "center, 0 0";
		tint.style.maskPosition = "center, 0 0";
		tint.style.webkitMaskSize = "contain, 100% 100%";
		tint.style.maskSize = "contain, 100% 100%";
	} else {
		tint.style.webkitMaskImage = maskUrl;
		tint.style.maskImage = maskUrl;
		tint.style.webkitMaskComposite = "";
		tint.style.maskComposite = "";
		tint.style.webkitMaskRepeat = "no-repeat";
		tint.style.maskRepeat = "no-repeat";
		tint.style.webkitMaskPosition = "center";
		tint.style.maskPosition = "center";
		tint.style.webkitMaskSize = "contain";
		tint.style.maskSize = "contain";
	}
}

/** Normal (non fill-from-hidden) GIF/WebP look. */
function applyRasterIconLook(icon, href, plan) {
	if (!icon || !href) {
		return;
	}
	icon.classList.add("is-raster");
	icon.classList.remove("is-painted", "is-fill-hidden", "is-fill-raster");
	icon.style.background = "transparent";
	icon.style.webkitMaskImage = "";
	icon.style.maskImage = "";

	for (const node of icon.querySelectorAll(
		".gear-icon-face:not(.gear-icon-raster-tint), img.gear-icon-base, img.gear-icon-fill, .gear-icon-base, .gear-icon-fill"
	)) {
		if (!node.classList.contains("gear-icon-raster-tint")) {
			node.remove();
		}
	}

	let img = icon.querySelector(":scope > img:not(.gear-icon-base):not(.gear-icon-fill)");
	if (!img) {
		img = document.createElement("img");
		img.alt = "";
		icon.appendChild(img);
	}
	if (img.getAttribute("src") !== href) {
		img.src = href;
	}
	if (typeof bindIconImgFallback === "function") {
		bindIconImgFallback(img);
	}
	img.hidden = false;
	img.style.webkitMaskImage = "";
	img.style.maskImage = "";

	const tint = ensureRasterTintFace(icon);
	if (plan.kind === "native") {
		img.style.filter = "none";
		img.style.opacity = "1";
		tint.hidden = true;
		tint.style.opacity = "";
		return;
	}
	if (plan.kind === "tint") {
		img.style.filter = "none";
		img.style.opacity = "0";
		setRasterTintFace(tint, href, plan.color, 1, "");
		return;
	}
	// blend: crossfade native ↔ tint
	img.style.filter = "none";
	img.style.opacity = String(1 - plan.tintAmount);
	setRasterTintFace(tint, href, plan.color, plan.tintAmount, "");
}

function applyIconPaint(el, src, gear, group) {
	const icon = el && el.querySelector(".gear-icon");
	if (!icon) {
		return;
	}
	const href = sourceIconPath(src, gear);
	if (icon.classList.contains("is-fill-hidden")) {
		if (icon.classList.contains("is-fill-raster")) {
			return;
		}
		const paint = sourceIconPaint(src, gear, group);
		if (!paint) {
			return;
		}
		const fill = icon.querySelector(".gear-icon-fill");
		if (fill) {
			fill.style.background = paint;
		}
		return;
	}
	if (href && iconHrefIsAnimated(href)) {
		applyRasterIconLook(icon, href, rasterIconColorPlan(src, gear, group));
		return;
	}
	if (!icon.classList.contains("is-painted")) {
		return;
	}
	const paint = sourceIconPaint(src, gear, group);
	if (!paint || !href) {
		return;
	}
	// Live percent ticks used to recolor only; pack frames need the mask/src refreshed too.
	paintMaskedFace(icon, "gear-icon-face", { color: paint, href });
	const img = icon.querySelector("img");
	if (img) {
		img.hidden = true;
		if (img.getAttribute("src") !== href) {
			img.src = href;
		}
	}
}

function iconPaintSig(src, gear, group) {
	const style = group ? ensureGroupStyle(group) : null;
	const look = appearanceOf(gear, src);
	const mode = neutralIconModeFor(gear, group);
	const palette = resolvedPalette(src, gear, group);
	return [
		gear && gear.exemptFromGroupColors ? "1" : "0",
		style && style.useGroupColors ? "1" : "0",
		src && src.type === "count" ? mode : "ratio",
		style && style.iconColor,
		style && style.barColor,
		optionalHex(style && style.borderColor),
		look.iconColor,
		look.barColor,
		palette.iconSample,
		palette.barSample,
		themeIconColor(),
		themeFill(),
		themeBorder()
	].join("|");
}

function parseHideAt(raw, type) {
	const text = String(raw || "").trim();
	const match = text.match(/^([<>])\s*([0-9]*\.?[0-9]+)\s*(%?)\s*$/);
	if (!match) {
		return null;
	}
	let threshold = Number(match[2]);
	if (!Number.isFinite(threshold) || threshold < 0) {
		return null;
	}
	const t = String(type || "").toLowerCase();
	const absolute = t === "count" || t === "counter" || t === "timer" || t === "countdown";
	const hadPercent = match[3] === "%";
	if (absolute && !hadPercent) {
		return { op: match[1], threshold, unit: "absolute" };
	}
	// Percent: explicit % suffix. Otherwise treat as 0–1 ratio.
	if (hadPercent) {
		threshold /= 100;
	}
	if (threshold > 1) {
		return null;
	}
	return { op: match[1], threshold, unit: "ratio" };
}

/** Editor field value for hideAt: percent 0–100 or absolute count/seconds. */
function hideAtEditorParts(raw, type) {
	const rule = parseHideAt(raw, type);
	if (!rule) {
		return { op: "", value: "" };
	}
	if (rule.unit === "absolute") {
		const v = Math.round(rule.threshold * 1000) / 1000;
		return { op: rule.op, value: String(v) };
	}
	const pct = Math.round(rule.threshold * 100000) / 1000;
	return { op: rule.op, value: String(pct) };
}

/** Build stored hideAt from editor controls. */
function hideAtFromEditor(op, valueRaw, type) {
	const o = op === "<" || op === ">" ? op : "";
	if (!o) {
		return "";
	}
	let n = Number(valueRaw);
	if (!Number.isFinite(n) || n < 0) {
		return "";
	}
	const t = String(type || "").toLowerCase();
	const absolute = t === "count" || t === "counter" || t === "timer" || t === "countdown";
	n = Math.round(n * 1000) / 1000;
	if (absolute) {
		let body = n.toFixed(5).replace(/\.?0+$/, "");
		if (!body) {
			body = "0";
		}
		return `${o}${body}`;
	}
	n = Math.max(0, Math.min(100, n));
	const ratio = n / 100;
	let body = ratio.toFixed(5).replace(/\.?0+$/, "");
	if (!body) {
		body = "0";
	}
	return `${o}${body}`;
}

function isHiddenByHideAt(src, gear) {
	const rule = parseHideAt(appearanceOf(gear, src).hideAt, src && src.type);
	if (!rule || !src) {
		return false;
	}
	if (src.type === "count") {
		const n = Number(src.value) || 0;
		return rule.op === "<" ? n < rule.threshold : n > rule.threshold;
	}
	if (src.type === "timer") {
		const seconds = Number.isFinite(Number(src.current)) ? Number(src.current) : 0;
		return rule.op === "<" ? seconds < rule.threshold : seconds > rule.threshold;
	}
	if (src.type !== "percent") {
		return false;
	}
	const ratio = (Number(src.value) || 0) / 100;
	return rule.op === "<" ? ratio < rule.threshold : ratio > rule.threshold;
}

/** Opacity / fill progress 0..1 for hideAt reveal (percent ratio, or timer seconds). */
function hideAtRevealProgress(rule, amount, opts) {
	const t = rule.threshold;
	const r = Math.max(0, Number(amount) || 0);
	const absolute = rule.unit === "absolute";
	if (rule.op === ">") {
		if (r > t) {
			return 0;
		}
		if (t <= 0) {
			return r > 0 ? 0 : 1;
		}
		return Math.max(0, Math.min(1, (t - r) / t));
	}
	if (r < t) {
		return 0;
	}
	if (absolute) {
		const max = Number(opts && opts.maximum);
		if (Number.isFinite(max) && max > t) {
			return Math.max(0, Math.min(1, (r - t) / (max - t)));
		}
		return 1;
	}
	if (t >= 1) {
		return r < 1 ? 0 : 1;
	}
	return Math.max(0, Math.min(1, (r - t) / (1 - t)));
}

function groupFillFromHidden(group) {
	return ensureGroupStyle(group).fillFromHidden || "";
}

/** Directional fill modes for hideAt reveal (percent/timer). */
function groupFillMode(group, src, gear) {
	if (!group || !src || (src.type !== "percent" && src.type !== "timer")) {
		return "";
	}
	if (!parseHideAt(appearanceOf(gear, src).hideAt, src.type)) {
		return "";
	}
	const mode = groupFillFromHidden(group);
	if (mode === "alpha" || mode === "up" || mode === "down" || mode === "alphaUp" || mode === "alphaDown") {
		return mode;
	}
	return "";
}

function groupUsesHideFade(group, src, gear) {
	return groupFillMode(group, src, gear) === "alpha";
}

function groupUsesIconFill(group, src, gear) {
	const mode = groupFillMode(group, src, gear);
	return mode === "up" || mode === "down" || mode === "alphaUp" || mode === "alphaDown";
}

function gearHudAlpha(src, gear, group) {
	if (isInactiveTimer(src)) {
		return 0;
	}
	const rule = parseHideAt(appearanceOf(gear, src).hideAt, src && src.type);
	if (!rule) {
		return 1;
	}
	if (src.type === "count") {
		return isHiddenByHideAt(src, gear) ? 0 : 1;
	}
	if (src.type !== "percent" && src.type !== "timer") {
		return 1;
	}
	const mode = groupFillMode(group, src, gear);
	if (mode === "up" || mode === "down" || mode === "alphaUp" || mode === "alphaDown") {
		// Stay in layout; icon greyscale/fill conveys the reveal.
		return 1;
	}
	if (mode === "alpha") {
		if (src.type === "timer" && rule.unit === "absolute") {
			const seconds = Number.isFinite(Number(src.current)) ? Number(src.current) : 0;
			return hideAtRevealProgress(rule, seconds, { maximum: Number(src.maximum) });
		}
		return hideAtRevealProgress(rule, (Number(src.value) || 0) / 100);
	}
	return isHiddenByHideAt(src, gear) ? 0 : 1;
}

function gearFillProgress(src, gear) {
	const rule = parseHideAt(appearanceOf(gear, src).hideAt, src && src.type);
	if (!rule || !src || (src.type !== "percent" && src.type !== "timer")) {
		return 1;
	}
	if (src.type === "timer" && rule.unit === "absolute") {
		const seconds = Number.isFinite(Number(src.current)) ? Number(src.current) : 0;
		return hideAtRevealProgress(rule, seconds, { maximum: Number(src.maximum) });
	}
	return hideAtRevealProgress(rule, (Number(src.value) || 0) / 100);
}

function applyGearHideFadeOpacity(el, src, gear, group, preview) {
	if (!el) {
		return;
	}
	// Editor/focus preview: never apply hideAt fade opacity — always readable.
	if (preview || document.body.classList.contains("is-focused")) {
		el.style.opacity = "";
		return;
	}
	const alpha = gearHudAlpha(src, gear, group);
	if (groupUsesHideFade(group, src, gear) && alpha > 0) {
		el.style.opacity = String(alpha);
	} else {
		el.style.opacity = "";
	}
}

function fillFrontierMask(dirUp, progress) {
	const p = Math.max(0, Math.min(1, Number(progress) || 0));
	const pct = Math.round(p * 1000) / 10;
	const soft = Math.min(3, Math.max(1, pct > 0 && pct < 100 ? 2 : 0));
	const solid = Math.max(0, pct - soft);
	const clear = Math.min(100, pct + soft);
	return dirUp
		? `linear-gradient(to top, #000 0%, #000 ${solid}%, rgba(0,0,0,0.5) ${pct}%, transparent ${clear}%)`
		: `linear-gradient(to bottom, #000 0%, #000 ${solid}%, rgba(0,0,0,0.5) ${pct}%, transparent ${clear}%)`;
}

/** GIF/WebP: greyscale base + coloured/native fill (keeps animation on native layer). */
function paintGearIconFillRaster(icon, href, mode, progress, plan) {
	const p = Math.max(0, Math.min(1, Number(progress) || 0));
	const dirUp = mode === "up" || mode === "alphaUp";
	const withAlpha = mode === "alphaUp" || mode === "alphaDown";
	const colorPlan = plan || { kind: "native" };

	icon.classList.add("is-fill-hidden", "is-fill-raster");
	icon.classList.remove("is-painted", "is-raster");
	icon.classList.toggle("is-fill-up", dirUp);
	icon.classList.toggle("is-fill-down", !dirUp);
	icon.style.background = "transparent";
	icon.style.webkitMaskImage = "";
	icon.style.maskImage = "";

	for (const node of icon.querySelectorAll(
		".gear-icon-face:not(.gear-icon-raster-tint), .gear-icon-base:not(img), .gear-icon-fill:not(img)"
	)) {
		node.remove();
	}

	const hostImg = icon.querySelector(":scope > img:not(.gear-icon-base):not(.gear-icon-fill)");
	if (hostImg) {
		hostImg.hidden = true;
	}
	const strayTint = icon.querySelector(":scope > .gear-icon-raster-tint");
	if (strayTint && !strayTint.classList.contains("gear-icon-fill-tint")) {
		strayTint.remove();
	}

	let base = icon.querySelector("img.gear-icon-base");
	if (!base) {
		base = document.createElement("img");
		base.className = "gear-icon-base";
		base.alt = "";
		icon.appendChild(base);
	}
	if (base.getAttribute("src") !== href) {
		base.src = href;
	}
	if (typeof bindIconImgFallback === "function") {
		bindIconImgFallback(base);
	}
	base.hidden = false;
	base.style.opacity = withAlpha ? String(FILL_FROM_HIDDEN_TROUGH_ALPHA) : "1";
	base.style.filter = "grayscale(1)";
	base.style.webkitMaskImage = "";
	base.style.maskImage = "";

	const grad = fillFrontierMask(dirUp, p);
	let fillImg = icon.querySelector("img.gear-icon-fill");
	let fillTint = icon.querySelector(".gear-icon-fill-tint");

	const needNative = colorPlan.kind === "native" || colorPlan.kind === "blend";
	const needTint = colorPlan.kind === "tint" || colorPlan.kind === "blend";

	if (needNative) {
		if (!fillImg) {
			fillImg = document.createElement("img");
			fillImg.className = "gear-icon-fill";
			fillImg.alt = "";
			icon.appendChild(fillImg);
		}
		if (fillImg.getAttribute("src") !== href) {
			fillImg.src = href;
		}
		if (typeof bindIconImgFallback === "function") {
			bindIconImgFallback(fillImg);
		}
		fillImg.hidden = false;
		const nativeOpacity =
			p <= 0 ? 0 : colorPlan.kind === "blend" ? 1 - colorPlan.tintAmount : 1;
		fillImg.style.opacity = String(nativeOpacity);
		fillImg.style.filter = "none";
		fillImg.style.webkitMaskImage = grad;
		fillImg.style.maskImage = grad;
		fillImg.style.webkitMaskSize = "100% 100%";
		fillImg.style.maskSize = "100% 100%";
		fillImg.style.webkitMaskRepeat = "no-repeat";
		fillImg.style.maskRepeat = "no-repeat";
	} else if (fillImg) {
		fillImg.remove();
		fillImg = null;
	}

	if (needTint) {
		if (!fillTint) {
			fillTint = document.createElement("div");
			fillTint.className = "gear-icon-fill-tint gear-icon-face gear-icon-fill";
			icon.appendChild(fillTint);
		}
		const tintOpacity =
			p <= 0 ? 0 : colorPlan.kind === "blend" ? colorPlan.tintAmount : 1;
		setRasterTintFace(fillTint, href, colorPlan.color, tintOpacity, grad);
	} else if (fillTint) {
		fillTint.remove();
	}
}

function paintGearIconFillMasked(icon, href, paint, mode, progress) {
	const p = Math.max(0, Math.min(1, Number(progress) || 0));
	const dirUp = mode === "up" || mode === "alphaUp";
	const withAlpha = mode === "alphaUp" || mode === "alphaDown";
	const color = paint || "#ffffff";

	icon.classList.add("is-painted", "is-fill-hidden");
	icon.classList.remove("is-fill-raster", "is-raster");
	icon.classList.toggle("is-fill-up", dirUp);
	icon.classList.toggle("is-fill-down", !dirUp);
	icon.style.background = "transparent";
	icon.style.webkitMaskImage = "";
	icon.style.maskImage = "";

	for (const node of icon.querySelectorAll(
		"img.gear-icon-base, img.gear-icon-fill, .gear-icon-fill-tint, .gear-icon-raster-tint"
	)) {
		node.remove();
	}
	for (const node of icon.querySelectorAll(".gear-icon-face:not(.gear-icon-base):not(.gear-icon-fill)")) {
		node.remove();
	}

	let base = icon.querySelector(".gear-icon-base");
	if (!base) {
		base = document.createElement("div");
		base.className = "gear-icon-base gear-icon-face";
		icon.appendChild(base);
	}
	let fill = icon.querySelector(".gear-icon-fill");
	if (!fill) {
		fill = document.createElement("div");
		fill.className = "gear-icon-fill gear-icon-face";
		icon.appendChild(fill);
	}

	const maskUrl = `url("${href}")`;
	base.style.inset = "0";
	base.style.width = "";
	base.style.height = "";
	base.style.top = "";
	base.style.bottom = "";
	base.style.background = FILL_FROM_HIDDEN_GREY;
	base.style.opacity = withAlpha ? String(FILL_FROM_HIDDEN_TROUGH_ALPHA) : "1";
	base.style.webkitMaskImage = maskUrl;
	base.style.maskImage = maskUrl;
	base.style.webkitMaskComposite = "";
	base.style.maskComposite = "";
	base.style.webkitMaskSize = "contain";
	base.style.maskSize = "contain";
	base.style.webkitMaskRepeat = "no-repeat";
	base.style.maskRepeat = "no-repeat";
	base.style.webkitMaskPosition = "center";
	base.style.maskPosition = "center";

	fill.style.inset = "0";
	fill.style.width = "";
	fill.style.height = "";
	fill.style.top = "";
	fill.style.bottom = "";
	fill.style.background = color;
	fill.style.opacity = p <= 0 ? "0" : "1";

	const grad = fillFrontierMask(dirUp, p);
	fill.style.webkitMaskImage = `${maskUrl}, ${grad}`;
	fill.style.maskImage = `${maskUrl}, ${grad}`;
	fill.style.webkitMaskComposite = "source-in";
	fill.style.maskComposite = "intersect";
	fill.style.webkitMaskRepeat = "no-repeat, no-repeat";
	fill.style.maskRepeat = "no-repeat, no-repeat";
	fill.style.webkitMaskPosition = "center, 0 0";
	fill.style.maskPosition = "center, 0 0";
	fill.style.webkitMaskSize = "contain, 100% 100%";
	fill.style.maskSize = "contain, 100% 100%";

	const img = icon.querySelector(":scope > img:not(.gear-icon-base):not(.gear-icon-fill)");
	if (img) {
		img.hidden = true;
	}
}

function paintGearIconFill(icon, href, paint, mode, progress, plan) {
	if (!icon || !href) {
		return;
	}
	if (iconHrefIsAnimated(href)) {
		paintGearIconFillRaster(icon, href, mode, progress, plan);
		return;
	}
	paintGearIconFillMasked(icon, href, paint, mode, progress);
}

function clearGearIconFill(icon) {
	if (!icon) {
		return;
	}
	icon.classList.remove("is-fill-hidden", "is-fill-up", "is-fill-down", "is-fill-raster");
	for (const node of icon.querySelectorAll(
		".gear-icon-base, .gear-icon-fill, .gear-icon-fill-tint, .gear-icon-raster-tint"
	)) {
		node.remove();
	}
	const img = icon.querySelector(":scope > img");
	if (img) {
		img.hidden = false;
		img.style.filter = "";
		img.style.opacity = "";
		img.style.webkitMaskImage = "";
		img.style.maskImage = "";
	}
}

function applyIconFillFromHidden(el, src, gear, group) {
	const icon = el && el.querySelector(".gear-icon");
	if (!icon) {
		return;
	}
	if (!groupUsesIconFill(group, src, gear)) {
		if (icon.classList.contains("is-fill-hidden")) {
			clearGearIconFill(icon);
			const href = sourceIconPath(src, gear);
			if (href && iconHrefIsAnimated(href)) {
				applyRasterIconLook(icon, href, rasterIconColorPlan(src, gear, group));
			} else {
				const paint = href ? sourceIconPaint(src, gear, group) : "";
				if (href && paint) {
					icon.classList.add("is-painted");
					paintMaskedFace(icon, "gear-icon-face", { color: paint, href });
					const img = icon.querySelector("img");
					if (img) {
						img.hidden = true;
					}
				} else {
					icon.classList.remove("is-painted");
					icon.style.background = "";
					const img = icon.querySelector("img");
					if (img) {
						img.hidden = false;
					}
				}
			}
		}
		return;
	}
	const href = sourceIconPath(src, gear);
	if (!href) {
		return;
	}
	const mode = groupFillMode(group, src, gear);
	const paint = sourceIconPaint(src, gear, group) || "#ffffff";
	paintGearIconFill(
		icon,
		href,
		paint,
		mode,
		gearFillProgress(src, gear),
		rasterIconColorPlan(src, gear, group)
	);
}

function normalizeGearsSnapshot() {
	if (!Array.isArray(snapshot.gears)) {
		snapshot.gears = [];
	}
	for (const gear of snapshot.gears) {
		delete gear.style;
		ensureGearAppearance(gear);
	}
}

/** Live AV/percent push from SKSE — update matching HUD gear nodes without a full rebuild. */
function applyLivePercentToHud(incoming) {
	if (!incoming || !incoming.mod || !incoming.name) {
		return;
	}
	const src = sourceFor(incoming.mod, incoming.name);
	if (!src) {
		return;
	}
	src.value = Number(incoming.value) || 0;
	if (incoming.current != null) {
		src.current = Number(incoming.current);
	}
	if (incoming.maximum != null) {
		src.maximum = Number(incoming.maximum);
	}
	if (drag) {
		return;
	}
	const gear = gearBySource(incoming.mod, incoming.name);
	const preview = document.body.classList.contains("is-focused");
	const needle = `\t${incoming.mod}\t${incoming.name}`;
	let saw = false;
	let needsRebuild = false;
	for (const el of document.querySelectorAll(".gear[data-gear-key]")) {
		if (!String(el.dataset.gearKey || "").endsWith(needle)) {
			continue;
		}
		saw = true;
		safeCall(`applyLivePercent:gear:${el.dataset.gearKey || "?"}`, () => {
			const groupId = String(el.dataset.gearKey).split("\t")[0];
			const group = (snapshot.groups || []).find((g) => g.id === groupId);
			const alpha = gearHudAlpha(src, gear, group);
			if (alpha <= 0 && !preview) {
				needsRebuild = true;
				return;
			}
			applyGearHideFadeOpacity(el, src, gear, group, preview);
			if (preview) {
				el.classList.toggle("is-preview", alpha < 1);
			}
			const fill = el.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(src));
				fill.style.backgroundColor = sourceBarColor(src, gear, group);
				const trough = el.querySelector(".gear-bar.has-trough .gear-bar-clip");
				if (trough) {
					trough.style.borderColor = sourceBorderColor(src, gear, group);
				}
			}
			const style = ensureGroupStyle(group || {});
			const showTotal =
				style.showNumber !== false && usesRatio(src) && numberFormatShowsTotal(style.numberFormat);
			for (const value of el.querySelectorAll(".gear-value")) {
				value.textContent = formatValue(src, showTotal);
			}
			applyIconFillFromHidden(el, src, gear, group);
			applyIconPaint(el, src, gear, group);
		});
	}
	if (!saw && gear) {
		const wouldShow = (snapshot.groups || []).some((g) => {
			if (!(g.gearIds || []).includes(gear.id)) {
				return false;
			}
			return preview || gearHudAlpha(src, gear, g) > 0;
		});
		if (wouldShow) {
			needsRebuild = true;
		}
	}
	const gaugeRebuild = applyLivePercentToBoundGauges(incoming, preview);
	if (needsRebuild || gaugeRebuild) {
		renderGears();
	}
}

/**
 * Batch live refresh after applyLivePatch replaced snapshot.sources / shout / gameTime / payloads.
 * Patches gears + gauges in place; full renderGears only if hideAt visibility needs DOM create/destroy.
 */
function applyLivePatchToHud() {
	if (drag) {
		if (typeof paintAllHudGizmosLive === "function") {
			paintAllHudGizmosLive();
		}
		return;
	}
	const preview = document.body.classList.contains("is-focused");
	let needsRebuild = false;
	const presentGearKeys = new Set();

	for (const el of document.querySelectorAll(".gear[data-gear-key]")) {
		presentGearKeys.add(String(el.dataset.gearKey || ""));
		safeCall(`applyLivePatch:gear:${el.dataset.gearKey || "?"}`, () => {
			const parts = String(el.dataset.gearKey || "").split("\t");
			if (parts.length < 3) {
				return;
			}
			const groupId = parts[0];
			const mod = parts[1];
			const name = parts.slice(2).join("\t");
			const src = sourceFor(mod, name);
			const gear = gearBySource(mod, name);
			const group = (snapshot.groups || []).find((g) => g.id === groupId);
			if (!src) {
				return;
			}
			const alpha = gearHudAlpha(src, gear, group);
			if (alpha <= 0 && !preview) {
				needsRebuild = true;
				return;
			}
			applyGearHideFadeOpacity(el, src, gear, group, preview);
			if (preview) {
				el.classList.toggle("is-preview", alpha < 1);
			}
			const fill = el.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(src));
				fill.style.backgroundColor = sourceBarColor(src, gear, group);
				const trough = el.querySelector(".gear-bar.has-trough .gear-bar-clip");
				if (trough) {
					trough.style.borderColor = sourceBorderColor(src, gear, group);
				}
			}
			const style = ensureGroupStyle(group || {});
			const showTotal =
				style.showNumber !== false && usesRatio(src) && numberFormatShowsTotal(style.numberFormat);
			for (const value of el.querySelectorAll(".gear-value")) {
				value.textContent = formatValue(src, showTotal);
			}
			applyIconFillFromHidden(el, src, gear, group);
			applyIconPaint(el, src, gear, group);
		});
	}

	// hideAt can remove gears from the DOM; when they should reappear there is no node to patch.
	if (!needsRebuild) {
		for (const group of snapshot.groups || []) {
			if (typeof isGroupVisible === "function" && !isGroupVisible(group) && !preview) {
				continue;
			}
			for (const gear of gearsInGroup(group.id)) {
				const src = sourceFor(gear.mod, gear.name);
				if (!src) {
					continue;
				}
				if (!(preview || gearHudAlpha(src, gear, group) > 0)) {
					continue;
				}
				const key = hudGearKey(group.id, gear);
				if (!presentGearKeys.has(key)) {
					needsRebuild = true;
					break;
				}
			}
			if (needsRebuild) {
				break;
			}
		}
	}

	if (typeof patchHudGaugeLive === "function" && typeof findHudGaugeEl === "function") {
		for (const gauge of snapshot.gauges || []) {
			safeCall(`applyLivePatch:gauge:${gauge.id != null ? gauge.id : "?"}`, () => {
				const el = findHudGaugeEl(gauge.id);
				const { src, gear } = typeof gaugeLinked === "function" ? gaugeLinked(gauge) : { src: null, gear: null };
				const stayVisible = !!gauge.alwaysVisible;
				const hidden = !stayVisible && !!(src && typeof isHudHidden === "function" && isHudHidden(src, gear));
				if (!el) {
					if (preview || stayVisible || !hidden) {
						needsRebuild = true;
					}
					return;
				}
				if (hidden && !preview && !stayVisible) {
					needsRebuild = true;
					return;
				}
				patchHudGaugeLive(el, gauge);
			});
		}
	}

	if (typeof paintAllHudGizmosLive === "function") {
		paintAllHudGizmosLive();
	}

	if (needsRebuild) {
		renderGears();
	}
}

function applyLivePercentToBoundGauges(incoming, preview) {
	if (!incoming || typeof patchHudGaugeLive !== "function" || typeof findHudGaugeEl !== "function") {
		return false;
	}
	let needsRebuild = false;
	let saw = false;
	for (const gauge of snapshot.gauges || []) {
		if (gauge.gearMod !== incoming.mod || gauge.gearName !== incoming.name) {
			continue;
		}
		saw = true;
		safeCall(`patchHudGaugeLive:${gauge.id != null ? gauge.id : "?"}`, () => {
			const el = findHudGaugeEl(gauge.id);
			const { src, gear } = typeof gaugeLinked === "function" ? gaugeLinked(gauge) : { src: null, gear: null };
			const stayVisible = !!gauge.alwaysVisible;
			const hidden = !stayVisible && !!(src && typeof isHudHidden === "function" && isHudHidden(src, gear));
			if (!el) {
				if (preview || stayVisible || !hidden) {
					needsRebuild = true;
				}
				return;
			}
			// Keep existing DOM when hideAt trips; syncHudGauges owns fade/remove on the next sync.
			patchHudGaugeLive(el, gauge);
		});
	}
	return needsRebuild && saw;
}

function isInventoryGear(gear) {
	return gear && gear.mod === INVENTORY_GEAR_MOD;
}

function isProtectedInventoryGear(gear) {
	return isInventoryGear(gear) && gear.locked;
}

function inventoryGears() {
	return [...(snapshot.gears || [])]
		.filter(isInventoryGear)
		.sort((a, b) => {
			if (a.locked !== b.locked) {
				return a.locked ? -1 : 1;
			}
			const an = appearanceOf(a, sourceFor(a.mod, a.name)).display || a.name || "";
			const bn = appearanceOf(b, sourceFor(b.mod, b.name)).display || b.name || "";
			return an.localeCompare(bn) || String(a.id).localeCompare(String(b.id));
		});
}

function isPickableGearSource(src) {
	return !!src;
}

function gearFor(id) {
	return snapshot.gears.find((g) => g.id === id);
}

function gearIdFor(mod, name) {
	return `${mod}_${name}`.replace(/[^A-Za-z0-9_-]+/g, "_");
}

function gearBySource(mod, name) {
	const m = String(mod || "").toLowerCase();
	const n = String(name || "").toLowerCase();
	return snapshot.gears.find(
		(g) => String(g.mod || "").toLowerCase() === m && String(g.name || "").toLowerCase() === n
	);
}

function formatValue(src, asTotal) {
	if (!src) {
		return "—";
	}
	if (src.type === "percent") {
		if (asTotal) {
			const max = Number(src.maximum);
			if (Number.isFinite(max) && max > 0) {
				const cur = Number.isFinite(Number(src.current)) ? Number(src.current) : (Number(src.value) || 0) / 100 * max;
				return `${Math.round(cur)}/${Math.round(max)}`;
			}
		}
		return `${Math.round(src.value)}%`;
	}
	if (src.type === "count") {
		return String(Math.round(src.value));
	}
	if (src.type === "timer") {
		const remaining = Number.isFinite(Number(src.current)) ? Number(src.current) : 0;
		if (!asTotal) {
			return `${Math.round(src.value)}%`;
		}
		const sec = Math.max(0, Math.round(remaining));
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		const clock = `${m}:${String(s).padStart(2, "0")}`;
		return remaining <= 0 ? `${clock} (inactive)` : clock;
	}
	return String(src.value);
}

function isInactiveTimer(src) {
	return src && src.type === "timer" && Number(src.current) <= 0;
}

function isHudHidden(src, gear, group) {
	return gearHudAlpha(src, gear, group) <= 0;
}

function fitGearLabels() {
	for (const label of document.querySelectorAll(".gear-label:not(.gauge-gear-label)")) {
		const stack = label.parentElement;
		fitLabelFont(label, stack ? stack.clientWidth : 0);
	}
}

function hudGearKey(groupId, gear) {
	return `${groupId}\t${gear.mod}\t${gear.name}`;
}

function barPercent(src) {
	return Math.max(0, Math.min(100, Number(src && src.value) || 0));
}

function sizeBarSheen(fill) {
	let sheen = fill.querySelector(".gear-bar-sheen");
	if (!sheen) {
		sheen = document.createElement("span");
		sheen.className = "gear-bar-sheen";
		fill.appendChild(sheen);
	}
	const bar = fill.parentElement;
	if (!bar) {
		return;
	}
	const trough = bar.clientWidth;
	if (trough > 0 && sheen.dataset.trough !== String(trough)) {
		sheen.dataset.trough = String(trough);
		sheen.style.width = `${trough}px`;
	}
}

function isBowDrawFill(fill) {
	const gear = fill.closest(".gear");
	return !!(gear && String(gear.dataset.gearKey || "").endsWith("\tCOG.Builtin\tBowDraw"));
}

function setBarFill(fill, pct) {
	const target = Math.max(0, Math.min(100, Number(pct) || 0));
	sizeBarSheen(fill);
	fill.classList.toggle("is-bow", isBowDrawFill(fill));
	fill.style.width = `${target}%`;
}

function buildGearEl(groupId, gear, src, style, stack, preview, group) {
	const el = document.createElement("div");
	el.dataset.gearKey = hudGearKey(groupId, gear);
	const playAlpha = gearHudAlpha(src, gear, group);
	el.className =
		"gear" +
		(preview && playAlpha < 1 ? " is-preview" : "") +
		(style.showIcon ? ` has-icon stack-${stack}` : " no-icon");
	applyGearHideFadeOpacity(el, src, gear, group, preview);
	if (style.showIcon) {
		const icon = document.createElement("div");
		icon.className = "gear-icon";
		const href = sourceIconPath(src, gear);
		const paint = href ? sourceIconPaint(src, gear, group) : "";
		if (href) {
			const img = document.createElement("img");
			img.src = href;
			img.alt = "";
			if (typeof bindIconImgFallback === "function") {
				bindIconImgFallback(img);
			}
			icon.appendChild(img);
			if (groupUsesIconFill(group, src, gear)) {
				paintGearIconFill(
					icon,
					href,
					paint || "#ffffff",
					groupFillMode(group, src, gear),
					gearFillProgress(src, gear),
					rasterIconColorPlan(src, gear, group)
				);
			} else if (iconHrefIsAnimated(href)) {
				applyRasterIconLook(icon, href, rasterIconColorPlan(src, gear, group));
			} else if (paint) {
				icon.classList.add("is-painted");
				paintMaskedFace(icon, "gear-icon-face", { color: paint, href });
				img.hidden = true;
			}
		}
		el.appendChild(icon);
	}
	const isRatio = usesRatio(src);
	const wantNumber = style.showNumber !== false;
	const showBar = wantNumber && isRatio && numberFormatShowsBar(style.numberFormat);
	const showValue = wantNumber && (isRatio ? numberFormatShowsValue(style.numberFormat) : true);
	const showTotal = wantNumber && isRatio && numberFormatShowsTotal(style.numberFormat);
	const needStack = style.showLabel || showValue || showBar;
	if (needStack) {
		const copy = document.createElement("div");
		copy.className = "gear-stack";
		if (showBar) {
			const bar = document.createElement("div");
			bar.className = "gear-bar" + (style.barTrough ? " has-trough" : "") + (showValue ? " has-value" : "");
			const clip = document.createElement("div");
			clip.className = "gear-bar-clip";
			if (style.barTrough) {
				clip.style.borderColor = sourceBorderColor(src, gear, group);
			}
			const fill = document.createElement("span");
			fill.className = "gear-bar-fill";
			const sheen = document.createElement("span");
			sheen.className = "gear-bar-sheen";
			fill.appendChild(sheen);
			fill.style.backgroundColor = sourceBarColor(src, gear, group);
			clip.appendChild(fill);
			bar.appendChild(clip);
			if (showValue) {
				const value = document.createElement("div");
				value.className = "gear-value";
				value.textContent = formatValue(src, showTotal);
				bar.appendChild(value);
			}
			copy.appendChild(bar);
		} else if (showValue) {
			const value = document.createElement("div");
			value.className = "gear-value";
			value.textContent = formatValue(src, showTotal);
			copy.appendChild(value);
		}
		if (style.showLabel) {
			const label = document.createElement("div");
			label.className = "gear-label";
			label.textContent = sourceTitle(src, gear.name, gear);
			copy.appendChild(label);
		}
		el.appendChild(copy);
		if (showBar) {
			const fill = copy.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(src));
			}
		}
	}
	el.dataset.styleSig = `${style.showIcon}|${style.showLabel}|${style.showNumber}|${style.numberFormat}|${style.barTrough}|${style.fillFromHidden || ""}|${stack}|${sourceIconPath(src, gear)}|${iconPaintSig(src, gear, group)}`;
	return el;
}

function renderGears() {
	if (drag) {
		return;
	}
	const root = document.getElementById("hud");
	const frontRoot = document.getElementById("hud-front");
	const preview = document.body.classList.contains("is-focused");
	if (preview !== hudPreviewMode) {
		hudPreviewMode = preview;
		root.innerHTML = "";
		if (frontRoot) {
			frontRoot.innerHTML = "";
		}
		hudShownAt.clear();
		hudHideUntil.clear();
	}
	if (!hudVisible && !preview) {
		// Keep HUD DOM mounted; body.hud-hidden hides it via CSS. Destroying here made
		// quicksave/Loading Menu flash every element as it was rebuilt on show.
		syncHudGizmos(root, frontRoot, false);
		syncHudFrontLayer();
		return;
	}
	const now = Date.now();
	const keepGroups = new Set();
	for (const group of snapshot.groups) {
		const isFront = preview && activeTab === "groups" && openGroupId === group.id;
		if (!isGroupVisible(group) && !preview) {
			continue;
		}
		// Soft-hide normally drops non-front HUD; editor preview keeps everything mounted.
		if (!hudVisible && !preview) {
			continue;
		}
		const dest = isFront && frontRoot ? frontRoot : root;
		const style = ensureGroupStyle(group);
		const stack = normalizeStack(group.stack);
		const wanted = [];
		for (const gear of gearsInGroup(group.id)) {
			const src = sourceFor(gear.mod, gear.name);
			if (!src) {
				continue;
			}
			const key = hudGearKey(group.id, gear);
			const fadeMode = groupUsesHideFade(group, src, gear);
			const hidden = isHudHidden(src, gear, group);
			if (hidden && !preview) {
				if (fadeMode) {
					hudShownAt.delete(key);
					hudHideUntil.delete(key);
					continue;
				}
				if (hudShownAt.has(key) && !hudHideUntil.has(key)) {
					hudHideUntil.set(key, now + HUD_FADE_MS);
				}
				if (!hudHideUntil.has(key) || now >= hudHideUntil.get(key)) {
					hudShownAt.delete(key);
					hudHideUntil.delete(key);
					continue;
				}
			} else {
				hudHideUntil.delete(key);
				if (!hudShownAt.has(key)) {
					hudShownAt.set(key, now);
				}
			}
			wanted.push({ gear, src, key });
		}
		if (!wanted.length && !preview) {
			continue;
		}
		keepGroups.add(group.id);
		let groupEl = findHudGroupEl(group.id, dest);
		let created = false;
		if (!groupEl) {
			groupEl = document.createElement("div");
			groupEl.className = "hud-group";
			groupEl.dataset.id = group.id;
			const line = document.createElement("div");
			line.className = "hud-line";
			groupEl.appendChild(line);
			const slots = document.createElement("div");
			slots.className = "hud-slots";
			groupEl.appendChild(slots);
			dest.appendChild(groupEl);
			created = true;
		} else if (groupEl.parentElement !== dest) {
			dest.appendChild(groupEl);
			created = true;
		}
		groupEl.classList.toggle("is-preview", !isGroupVisible(group));
		groupEl.classList.toggle("is-front", isFront);
		let slots = groupEl.querySelector(".hud-slots");
		if (!slots) {
			slots = document.createElement("div");
			slots.className = "hud-slots";
			groupEl.appendChild(slots);
		}
		const keepKeys = new Set(wanted.map((item) => item.key));
		for (const child of [...slots.children]) {
			if (!keepKeys.has(child.dataset.gearKey)) {
				child.remove();
			}
		}
		let labelsDirty = created;
		let slotIndex = 0;
		for (const item of wanted) {
			const fadingOut = hudHideUntil.has(item.key) && now < hudHideUntil.get(item.key);
			const fadeMode = groupUsesHideFade(group, item.src, item.gear);
			const fillMode = groupUsesIconFill(group, item.src, item.gear);
			const fadingIn =
				!preview && !fadingOut && !fadeMode && !fillMode && now - (hudShownAt.get(item.key) || now) < HUD_FADE_MS;
			const styleSig = `${style.showIcon}|${style.showLabel}|${style.showNumber}|${style.numberFormat}|${style.barTrough}|${style.fillFromHidden || ""}|${stack}|${sourceIconPath(item.src, item.gear)}|${iconPaintSig(item.src, item.gear, group)}`;
			let el = slots.querySelector(`[data-gear-key="${cssAttr(item.key)}"]`);
			if (!el || el.dataset.styleSig !== styleSig) {
				const next = buildGearEl(group.id, item.gear, item.src, style, stack, preview, group);
				if (el) {
					slots.replaceChild(next, el);
				} else {
					slots.appendChild(next);
				}
				el = next;
				labelsDirty = true;
			}
			if (slots.children[slotIndex] !== el) {
				slots.insertBefore(el, slots.children[slotIndex] || null);
			}
			slotIndex += 1;
			const showTotal =
				style.showNumber !== false &&
				usesRatio(item.src) &&
				numberFormatShowsTotal(style.numberFormat);
			const playAlpha = gearHudAlpha(item.src, item.gear, group);
			const wouldHide = playAlpha < 1;
			el.classList.toggle("is-preview", !!(preview && wouldHide));
			if ((fadeMode || fillMode) && !preview) {
				applyGearHideFadeOpacity(el, item.src, item.gear, group, false);
				el.classList.toggle("is-fading-in", false);
				el.classList.toggle("is-fading-out", false);
			} else {
				el.style.opacity = "";
				el.classList.toggle("is-fading-in", fadingIn);
				el.classList.toggle("is-fading-out", fadingOut);
			}
			const fill = el.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(item.src));
				fill.style.backgroundColor = sourceBarColor(item.src, item.gear, group);
			}
			const trough = el.querySelector(".gear-bar.has-trough .gear-bar-clip");
			if (trough) {
				trough.style.borderColor = sourceBorderColor(item.src, item.gear, group);
			}
			applyIconFillFromHidden(el, item.src, item.gear, group);
			applyIconPaint(el, item.src, item.gear, group);
			for (const value of el.querySelectorAll(".gear-value")) {
				value.textContent = formatValue(item.src, showTotal);
			}
		}
		// Layout after children exist so rotation vars apply to a real box.
		layoutHudGroup(groupEl, group, wanted.length);
		if (labelsDirty) {
			for (const label of slots.querySelectorAll(".gear-label")) {
				const stackEl = label.parentElement;
				fitLabelFont(label, stackEl ? stackEl.clientWidth : 0);
			}
		}
		if (preview) {
			if (!groupEl.querySelector(".hud-handle-rotate")) {
				const rotateHandle = document.createElement("div");
				rotateHandle.className = "hud-handle hud-handle-rotate";
				rotateHandle.addEventListener("pointerdown", (ev) => beginGroupDrag(ev, groupEl.dataset.id, "rotate"));
				groupEl.appendChild(rotateHandle);
				groupEl.addEventListener("pointerdown", (ev) => {
					if (ev.target.closest(".hud-handle")) {
						return;
					}
					beginGroupDrag(ev, groupEl.dataset.id, "move");
				});
			}
		} else {
			for (const handle of groupEl.querySelectorAll(".hud-handle")) {
				handle.remove();
			}
		}
	}
	for (const host of [root, frontRoot]) {
		if (!host) {
			continue;
		}
		for (const groupEl of [...host.querySelectorAll(".hud-group")]) {
			const id = groupEl.dataset.id;
			if (!keepGroups.has(id)) {
				groupEl.remove();
				continue;
			}
			const isFront = preview && activeTab === "groups" && openGroupId === id;
			const belongsInFront = !!(isFront && frontRoot);
			const belongsHere = belongsInFront ? host === frontRoot : host === root;
			if (!belongsHere) {
				groupEl.remove();
			}
		}
	}
	// Groups are created as they first gain visible gears; keep DOM order = snapshot order.
	if (root) {
		let hostIndex = 0;
		for (const group of snapshot.groups) {
			if (!keepGroups.has(group.id)) {
				continue;
			}
			const isFront = preview && activeTab === "groups" && openGroupId === group.id;
			if (isFront && frontRoot) {
				continue;
			}
			const groupEl = findHudGroupEl(group.id, root);
			if (!groupEl || groupEl.parentElement !== root) {
				continue;
			}
			if (root.children[hostIndex] !== groupEl) {
				root.insertBefore(groupEl, root.children[hostIndex] || null);
			}
			hostIndex += 1;
		}
	}
	syncHudGauges(root, frontRoot, preview);
	syncHudGizmos(root, frontRoot, preview);
	syncHudFrontLayer();
}

function filteredPickerSources() {
	return sourcesNotInGroup(pickerGroupId).filter((src) => isPickableGearSource(src) && sourceMatchesFilters(src));
}

function gearMatchesFilters(gear) {
	const src = sourceFor(gear.mod, gear.name);
	const look = appearanceOf(gear, src);
	const probe = src
		? { ...src, display: look.display || src.display }
		: {
				mod: gear.mod,
				name: gear.name,
				display: look.display || gear.name,
				category: "",
				type: ""
			};
	return sourceMatchesFilters(probe);
}

function filteredEditGears() {
	return [...(snapshot.gears || [])]
		.filter((gear) => !isInventoryGear(gear) && gearMatchesFilters(gear))
		.sort((a, b) => {
			const an = appearanceOf(a, sourceFor(a.mod, a.name)).display || a.name || "";
			const bn = appearanceOf(b, sourceFor(b.mod, b.name)).display || b.name || "";
			return an.localeCompare(bn) || String(a.id).localeCompare(String(b.id));
		});
}

function fillEditGearPicker() {
	const body = document.getElementById("tab-body");
	if (!body || activeTab !== "gears") {
		return;
	}
	const picker = body.querySelector(".gear-edit-picker");
	const list = picker && picker.querySelector(".picker-list");
	const filter = picker && picker.querySelector(".picker-filter");
	if (!list || !filter) {
		return;
	}
	refreshCategorySelects(picker);
	syncEditPickerMode(picker);
	gearFilterQ = filter.value || "";
	const options = filteredEditGears();
	list.innerHTML = "";
	if (!options.length) {
		const empty = document.createElement("li");
		empty.className = "empty";
		if ((snapshot.gears || []).length) {
			if (typeof setTranslatedText === "function") {
				setTranslatedText(empty, "cog-no-matches", "No matches.");
			} else {
				empty.textContent = "No matches.";
			}
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-no-gears-registered", "No gears registered yet.");
		} else {
			empty.textContent = "No gears registered yet.";
		}
		list.appendChild(empty);
		return;
	}
	if (editGearId && options.some((g) => g.id === editGearId)) {
		pickerIndex = options.findIndex((g) => g.id === editGearId);
	} else {
		pickerIndex = Math.max(0, Math.min(pickerIndex, options.length - 1));
	}
	options.forEach((gear, i) => {
		const src = sourceFor(gear.mod, gear.name);
		const li = document.createElement("li");
		if (i === pickerIndex || gear.id === editGearId) {
			li.className = "is-active";
		}
		li.innerHTML = `<span class="opt-title"></span><span class="opt-meta"></span>`;
		li.querySelector(".opt-title").textContent = sourceTitle(src, gear.name, gear);
		const placed = effectiveGroupId(gear);
		const bits = [(src && src.category) || "—", typeLabel(src && src.type)];
		if (placed) {
			const groupName = groupDisplayName(placed);
			bits.push(
				typeof tf === "function" ? tf("cog-in-group", "in {group}", { group: groupName }) : `in ${groupName}`
			);
		} else {
			bits.push(typeof t === "function" ? t("cog-unplaced", "Unplaced") : "Unplaced");
		}
		li.querySelector(".opt-meta").textContent = bits.join(" · ");
		li.addEventListener("mousedown", (ev) => {
			ev.preventDefault();
			selectEditGear(gear.id);
		});
		list.appendChild(li);
	});
}

function syncEditPickerMode(picker) {
	const root = picker || (document.getElementById("tab-body") && document.getElementById("tab-body").querySelector(".gear-edit-picker"));
	if (!root) {
		return;
	}
	const browsing = root.dataset.browsing === "1";
	root.classList.toggle("has-selection", !!editGearId && !browsing);
}

function beginEditPickerBrowse(picker) {
	if (!picker) {
		return;
	}
	picker.dataset.browsing = "1";
	syncEditPickerMode(picker);
	fillEditGearPicker();
}

function endEditPickerBrowse(picker) {
	if (!picker) {
		return;
	}
	delete picker.dataset.browsing;
	syncEditPickerMode(picker);
}

function selectEditGear(id) {
	const body = document.getElementById("tab-body");
	const picker = body && body.querySelector(".gear-edit-picker");
	endEditPickerBrowse(picker);
	if (editGearId === id) {
		fillEditGearPicker();
		return;
	}
	editGearId = id || "";
	renderEditor(true);
}

function renderEditGearForm(host, selectedGearId = editGearId, options = {}) {
	const { skipPickerRefresh = false } = options;
	host.innerHTML = "";
	if (!selectedGearId) {
		const hint = document.createElement("p");
		hint.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(hint, "cog-select-gear-to-edit", "Select a gear above to edit its appearance.");
		} else {
			hint.textContent = "Select a gear above to edit its appearance.";
		}
		host.appendChild(hint);
		return;
	}
	const gear = gearFor(selectedGearId);
	if (!gear) {
		if (selectedGearId === editGearId) {
			editGearId = "";
		}
		const hint = document.createElement("p");
		hint.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(hint, "cog-gear-unavailable", "That gear is no longer available. Pick another from the list.");
		} else {
			hint.textContent = "That gear is no longer available. Pick another from the list.";
		}
		host.appendChild(hint);
		return;
	}
	ensureGearAppearance(gear);
	const src = sourceFor(gear.mod, gear.name);
	const look = gear.settings;
	const placed = effectiveGroupId(gear);
	const form = document.createElement("div");
	form.className = "gear-edit-form";
	form.dataset.id = gear.id;
	form.innerHTML = `
		<p class="lede" data-role="heading"></p>
		<div class="gear-edit-identity">
			<label class="pos-field grow"><span>Display name</span><input type="text" data-role="display" spellcheck="false"></label>
			<div data-role="iconSlot"></div>
		</div>
		<div class="color-row" data-role="colors"></div>
		<div class="hide-at-row" data-role="hideAtRow">
			<label class="pos-field compact hide-at-op"><span>Hide when</span>
				<select data-role="hideAtOp">
					<option value="">Off</option>
					<option value="<">Below</option>
					<option value=">">Above</option>
				</select>
			</label>
			<label class="pos-field compact hide-at-pct"><span data-role="hideAtThresholdLabel">Threshold</span>
				<input type="number" data-role="hideAtPct" min="0" step="any" inputmode="decimal">
			</label>
		</div>
		<div class="hide-at-row" data-role="hudSuppressRow">
			<label class="pos-field compact hide-at-op"><span>HUD Suppression</span>
				<select data-role="hudHideDuplicate">
					<option value="0">Off</option>
					<option value="1">On</option>
				</select>
			</label>
			<label class="pos-field compact hud-suppress-target"><span>HUD Target</span>
				<input type="text" data-role="hudLinkedElement" spellcheck="false" placeholder="hud.casting">
			</label>
		</div>
		<div class="toolbar">
			<button type="button" class="action" data-role="reset">Reset to defaults</button>
		</div>
		<p class="lede" data-role="meta"></p>`;
	const placeLabel = placed
		? groupDisplayName(placed)
		: typeof t === "function"
			? t("cog-unplaced", "Unplaced")
			: "Unplaced";
	form.querySelector('[data-role="heading"]').textContent = `${sourceTitle(src, gear.name, gear)} · ${placeLabel}`;
	const metaEl = form.querySelector('[data-role="meta"]');
	if (src) {
		const metaVars = { mod: gear.mod, name: gear.name, meta: sourceMeta(src) };
		if (typeof setTranslatedText === "function") {
			setTranslatedText(metaEl, "cog-gear-meta-mod", "Mod {mod} · {name} · {meta}", metaVars);
		} else {
			metaEl.textContent = `Mod ${gear.mod} · ${gear.name} · ${sourceMeta(src)}`;
		}
	} else {
		const metaVars = { mod: gear.mod, name: gear.name };
		if (typeof setTranslatedText === "function") {
			setTranslatedText(
				metaEl,
				"cog-gear-meta-unregistered",
				"Mod {mod} · {name} · (source not registered this session)",
				metaVars
			);
		} else {
			metaEl.textContent = `Mod ${gear.mod} · ${gear.name} · (source not registered this session)`;
		}
	}
	const displayInput = form.querySelector('[data-role="display"]');
	const hideOpSel = form.querySelector('[data-role="hideAtOp"]');
	const hidePctInput = form.querySelector('[data-role="hideAtPct"]');
	const hideRow = form.querySelector('[data-role="hideAtRow"]');
	const hideLabel = form.querySelector('[data-role="hideAtThresholdLabel"]');
	tagFieldLabel(form.querySelector(".gear-edit-identity .pos-field"), "cog-display-name", "Display name");
	tagFieldLabel(form.querySelector(".hide-at-op"), "cog-hide-when", "Hide when");
	tagSelectOptions(hideOpSel, {
		"": ["cog-off", "Off"],
		"<": ["cog-below", "Below"],
		">": ["cog-above", "Above"]
	});
	tagFieldLabel(form.querySelector(".hide-at-pct"), "cog-threshold", "Threshold");
	tagFieldLabel(form.querySelector('[data-role="hudSuppressRow"] .hide-at-op'), "cog-hud-suppression", "HUD Suppression");
	tagSelectOptions(form.querySelector('[data-role="hudHideDuplicate"]'), {
		"0": ["cog-off", "Off"],
		"1": ["cog-on", "On"]
	});
	tagFieldLabel(form.querySelector(".hud-suppress-target"), "cog-hud-target", "HUD Target");
	const hudLinkInputEarly = form.querySelector('[data-role="hudLinkedElement"]');
	if (typeof setTranslatedPlaceholder === "function") {
		setTranslatedPlaceholder(hudLinkInputEarly, "cog-hud-target-placeholder", "hud.casting");
	}
	const resetBtn = form.querySelector('[data-role="reset"]');
	if (typeof setTranslatedText === "function") {
		setTranslatedText(resetBtn, "cog-reset-to-defaults", "Reset to defaults");
	}
	displayInput.value = look.display || "";
	const hideType = (src && src.type) || "";
	const hideAbsolute = hideType === "count" || hideType === "timer";
	if (hideLabel) {
		if (typeof setTranslatedText === "function") {
			setTranslatedText(hideLabel, "cog-threshold", "Threshold");
		} else {
			hideLabel.textContent = "Threshold";
		}
	}
	if (hideAbsolute) {
		hidePctInput.removeAttribute("max");
		hidePctInput.step = "any";
	} else {
		hidePctInput.max = "100";
		hidePctInput.step = "0.001";
	}
	if (hideType === "timer") {
		wrapInputAffix(hidePctInput, { suffix: "s" });
	} else if (!hideAbsolute) {
		wrapInputAffix(hidePctInput, { suffix: "%" });
	}
	const hideParts = hideAtEditorParts(look.hideAt || "", hideType);
	hideOpSel.value = hideParts.op;
	hidePctInput.value = hideParts.value;
	hidePctInput.disabled = !hideParts.op;
	if (hideRow) {
		if (hideType === "count") {
			hideRow.appendChild(
				makeInfoTip(
					"Hide this gear when its count is below or above the threshold (any number). Example: Below 1 hides when empty.",
					"cog-gear-hide-tip-count"
				)
			);
		} else if (hideType === "timer") {
			hideRow.appendChild(
				makeInfoTip(
					"Hide this gear when remaining time (seconds) is below or above the threshold. Group Fill from Hidden can soften the reveal.",
					"cog-gear-hide-tip-timer"
				)
			);
		} else {
			hideRow.appendChild(
				makeInfoTip(
					"Hide this gear when its meter is below or above the threshold (0–100%). Group Fill from Hidden can soften the reveal.",
					"cog-gear-hide-tip-percent"
				)
			);
		}
	}
	const hudDupSel = form.querySelector('[data-role="hudHideDuplicate"]');
	const hudLinkInput = hudLinkInputEarly;
	const hudRow = form.querySelector('[data-role="hudSuppressRow"]');
	hudDupSel.value = look.hudHideDuplicate ? "1" : "0";
	hudLinkInput.value = String(look.hudLinkedElement || "");
	hudLinkInput.disabled = !look.hudHideDuplicate;
	if (hudRow) {
		hudRow.appendChild(
			makeInfoTip(
				"While this gear is exposed (enabled in a visible group, or a visible gauge bound to it), soft-hide the HUD target. Use an alias (e.g. hud.casting) or a raw menu/path (e.g. HUD Menu|HUDMovieBaseInstance.Health).",
				"cog-gear-hud-suppress-tip"
			)
		);
	}
	const commitHudSuppress = () => {
		const on = hudDupSel.value === "1";
		hudLinkInput.disabled = !on;
		patchGearSettings(gear.id, {
			hudHideDuplicate: on,
			hudLinkedElement: String(hudLinkInput.value || "").trim()
		});
	};
	hudDupSel.addEventListener("change", () => commitHudSuppress());
	hudLinkInput.addEventListener("change", () => commitHudSuppress());
	hudLinkInput.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			hudLinkInput.blur();
		}
	});
	const iconCtrl = makeIconControl({
		label: "Icon",
		value: look.icon || "",
		showName: true,
		onCommit: (icon) => {
			patchGearSettings(gear.id, { icon });
		}
	});
	tagFieldLabel(iconCtrl, "cog-icon", "Icon");
	form.querySelector('[data-role="iconSlot"]').appendChild(iconCtrl);
	const colors = form.querySelector('[data-role="colors"]');
	colors.classList.add("color-ramp-stack");
	const tagColorRamp = (editor, headingTag, headingFallback) => {
		const heading = editor.querySelector(".color-ramp-heading");
		const hint = editor.querySelector(".color-ramp-hint");
		if (typeof setTranslatedText === "function") {
			setTranslatedText(heading, headingTag, headingFallback);
			setTranslatedText(
				hint,
				"cog-color-ramp-hint",
				"Empty inherits the backup. Multiple stops fade between percentages."
			);
		}
		return editor;
	};
	colors.appendChild(
		tagColorRamp(
			makeColorRampEditor("Icon colours", look.iconColor, themeIconColor(), (ramp, live) => {
				patchGearSettings(gear.id, { iconColor: ramp }, live);
			}),
			"cog-icon-colours",
			"Icon colours"
		)
	);
	colors.appendChild(
		tagColorRamp(
			makeColorRampEditor("Bar colours", look.barColor, themeFill(), (ramp, live) => {
				patchGearSettings(gear.id, { barColor: ramp }, live);
			}),
			"cog-bar-colours",
			"Bar colours"
		)
	);
	const commitText = (key, el) => {
		patchGearSettings(gear.id, { [key]: el.value.trim() });
		const nextPlaced = effectiveGroupId(gear);
		const nextPlaceLabel = nextPlaced
			? groupDisplayName(nextPlaced)
			: typeof t === "function"
				? t("cog-unplaced", "Unplaced")
				: "Unplaced";
		form.querySelector('[data-role="heading"]').textContent = `${sourceTitle(sourceFor(gear.mod, gear.name), gear.name, gear)} · ${nextPlaceLabel}`;
		if (key === "display") {
			refreshInventoryGearChrome(gear.id);
		}
		if (!skipPickerRefresh) {
			fillEditGearPicker();
		}
	};
	const commitHideAt = () => {
		const op = hideOpSel.value;
		hidePctInput.disabled = !op;
		if (!op) {
			hidePctInput.value = "";
			patchGearSettings(gear.id, { hideAt: "" });
			return;
		}
		let n = Number(hidePctInput.value);
		if (!Number.isFinite(n) || n < 0) {
			n = 0;
			hidePctInput.value = "0";
		}
		if (!hideAbsolute) {
			n = Math.max(0, Math.min(100, Math.round(n * 1000) / 1000));
		} else {
			n = Math.round(n * 1000) / 1000;
		}
		hidePctInput.value = String(n);
		patchGearSettings(gear.id, { hideAt: hideAtFromEditor(op, n, hideType) });
	};
	displayInput.addEventListener("input", () => commitText("display", displayInput));
	displayInput.addEventListener("change", () => commitText("display", displayInput));
	displayInput.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			displayInput.blur();
		}
	});
	hideOpSel.addEventListener("change", () => commitHideAt());
	hidePctInput.addEventListener("input", () => {
		const op = hideOpSel.value;
		if (!op) {
			return;
		}
		const n = Number(hidePctInput.value);
		if (!Number.isFinite(n) || n < 0) {
			return;
		}
		const clamped = hideAbsolute ? n : Math.max(0, Math.min(100, n));
		patchGearSettings(gear.id, { hideAt: hideAtFromEditor(op, clamped, hideType) });
	});
	hidePctInput.addEventListener("change", () => commitHideAt());
	hidePctInput.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			hidePctInput.blur();
		}
	});
	form.querySelector('[data-role="reset"]').addEventListener("click", () => resetGearSettings(gear.id));
	host.appendChild(form);
	enhanceSelects(form);
}

function applyGearCardFilters() {
	fillEditGearPicker();
}

function closePicker() {
	if (pickerRoot) {
		const picker = pickerRoot.querySelector(".group-picker");
		if (picker) {
			picker.hidden = true;
		}
	}
	pickerIndex = 0;
	pickerGroupId = "";
	pickerRoot = null;
}

function openPicker(root, groupId) {
	closePicker();
	const picker = root.querySelector(".group-picker");
	const filter = root.querySelector(".picker-filter");
	if (!picker || !filter) {
		return;
	}
	pickerRoot = root;
	pickerGroupId = groupId;
	picker.hidden = false;
	pickerIndex = 0;
	fillPicker();
	filter.focus();
}

function fillPicker() {
	if (!pickerRoot) {
		return;
	}
	refreshCategorySelects(pickerRoot);
	const list = pickerRoot.querySelector(".picker-list");
	const filter = pickerRoot.querySelector(".picker-filter");
	if (!list || !filter) {
		return;
	}
	gearFilterQ = filter.value || "";
	const options = filteredPickerSources();
	list.innerHTML = "";
	if (!options.length) {
		const empty = document.createElement("li");
		empty.className = "empty";
		if (sourcesNotInGroup(pickerGroupId).length) {
			if (typeof setTranslatedText === "function") {
				setTranslatedText(empty, "cog-no-matches", "No matches.");
			} else {
				empty.textContent = "No matches.";
			}
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-all-sources-in-group", "All sources are already in this group.");
		} else {
			empty.textContent = "All sources are already in this group.";
		}
		list.appendChild(empty);
		return;
	}
	pickerIndex = Math.max(0, Math.min(pickerIndex, options.length - 1));
	options.forEach((src, i) => {
		const li = document.createElement("li");
		if (i === pickerIndex) {
			li.className = "is-active";
		}
		li.innerHTML = `<span class="opt-title"></span><span class="opt-meta"></span>`;
		li.querySelector(".opt-title").textContent = sourceTitle(src, src.name, gearBySource(src.mod, src.name));
		const placed = gearBySource(src.mod, src.name);
		const bits = [src.category || "—", typeLabel(src.type)];
		if (placed) {
			const groupName = groupDisplayName(effectiveGroupId(placed));
			bits.push(
				typeof tf === "function" ? tf("cog-in-group", "in {group}", { group: groupName }) : `in ${groupName}`
			);
		}
		li.querySelector(".opt-meta").textContent = bits.join(" · ");
		const targetGroupId = pickerGroupId;
		li.dataset.groupId = targetGroupId || "";
		li.addEventListener("mousedown", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			addGear(src, li.dataset.groupId || targetGroupId);
		});
		list.appendChild(li);
	});
}

function addGear(src, groupId) {
	const target = groupId || DEFAULT_GROUP_ID;
	if (!groupFor(target)) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("addGear", new Error(`Unknown group id '${target}'`));
		}
		return;
	}
	const existing = gearBySource(src.mod, src.name);
	const gearId = gearIdFor(src.mod, src.name);
	if (!existing) {
		const look = {
			display: src.display || src.name || "",
			icon: src.icon || "",
			iconColor: normalizeColorRampValue(src.iconColor, src.startColor, src.endColor),
			barColor: normalizeColorRampValue(src.barColor, "", ""),
			hideAt: src.hideAt || "",
			hudLinkedElement: src.hudLinkedElement || "",
			hudHideDuplicate: !!src.hudHideDuplicate
		};
		snapshot.gears.push({
			id: gearId,
			mod: src.mod,
			name: src.name,
			enabled: true,
			defaults: { ...look },
			settings: { ...look }
		});
		addGearToGroup(gearId, target);
		scheduleSave();
	} else if (effectiveGroupId(existing) === target) {
		closePicker();
		return;
	} else {
		addGearToGroup(existing.id, target);
		scheduleSave();
	}
	closePicker();
	renderGears();
	renderEditor(true);
}

function removeGear(id) {
	removeGearFromAllGroups(id);
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function patchGear(id, patch) {
	const gear = gearFor(id);
	if (!gear) {
		return;
	}
	Object.assign(gear, patch);
	ensureGearAppearance(gear);
	scheduleSave();
	if (!drag) {
		renderGears();
	}
}

function patchGearSettings(id, patch, live) {
	const gear = gearFor(id);
	if (!gear) {
		return;
	}
	ensureGearAppearance(gear);
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
		if (gear.settings[key] !== value) {
			changed = true;
			break;
		}
	}
	if (!changed) {
		if (live === false) {
			scheduleSave(true);
		}
		return;
	}
	Object.assign(gear.settings, patch);
	const group = groupFor(effectiveGroupId(gear));
	if (live === true) {
		if (group) {
			syncHudGroup(group);
		}
		return;
	}
	scheduleSave(true);
	if (live === false) {
		if (group) {
			syncHudGroup(group);
		}
		return;
	}
	if (!drag) {
		renderGears();
	}
}

function resetGearSettings(id) {
	const gear = gearFor(id);
	if (!gear) {
		return;
	}
	ensureGearAppearance(gear);
	const src = sourceFor(gear.mod, gear.name);
	if (src) {
		// Live registration is the source of truth for defaults (disk may be stale
		// until the next Register after a Papyrus display/mapping fix).
		gear.defaults = {
			display: src.display || src.name || "",
			icon: src.icon || "",
			iconColor: normalizeColorRampValue(src.iconColor, src.startColor, src.endColor),
			barColor: normalizeColorRampValue(src.barColor, "", ""),
			hideAt: src.hideAt || "",
			hudLinkedElement: src.hudLinkedElement || "",
			hudHideDuplicate: !!src.hudHideDuplicate
		};
	}
	gear.settings = { ...gear.defaults };
	scheduleSave(true);
	renderGears();
	renderEditor(true);
}

function bindGearFilters(root) {
	const scope = root || document;
	const isEditPicker =
		!!(scope.classList && scope.classList.contains("gear-edit-picker")) ||
		!!(scope.querySelector && scope.querySelector(".gear-edit-picker"));
	const filter = scope.querySelector(".picker-filter") || scope.querySelector("#picker-filter");
	const typeSel = scope.querySelector("#filter-type") || scope.querySelector(".filter-type");
	const catSel = scope.querySelector("#filter-category") || scope.querySelector(".filter-category");
	const refresh = () => {
		if (isEditPicker) {
			fillEditGearPicker();
		} else {
			fillPicker();
		}
	};
	if (filter) {
		filter.value = gearFilterQ;
		filter.addEventListener("focus", () => {
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			}
		});
		filter.addEventListener("input", () => {
			gearFilterQ = filter.value || "";
			pickerIndex = 0;
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			} else {
				refresh();
			}
		});
		filter.addEventListener("keydown", (ev) => {
			if (isEditPicker) {
				const picker = scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker");
				beginEditPickerBrowse(picker);
				const options = filteredEditGears();
				if (ev.key === "ArrowDown") {
					ev.preventDefault();
					pickerIndex = Math.min(options.length - 1, pickerIndex + 1);
					fillEditGearPicker();
				} else if (ev.key === "ArrowUp") {
					ev.preventDefault();
					pickerIndex = Math.max(0, pickerIndex - 1);
					fillEditGearPicker();
				} else if (ev.key === "Enter") {
					ev.preventDefault();
					if (options[pickerIndex]) {
						selectEditGear(options[pickerIndex].id);
					}
				} else if (ev.key === "Escape") {
					ev.preventDefault();
					endEditPickerBrowse(picker);
					filter.blur();
				}
				return;
			}
			const options = filteredPickerSources();
			if (ev.key === "ArrowDown") {
				ev.preventDefault();
				pickerIndex = Math.min(options.length - 1, pickerIndex + 1);
				fillPicker();
			} else if (ev.key === "ArrowUp") {
				ev.preventDefault();
				pickerIndex = Math.max(0, pickerIndex - 1);
				fillPicker();
			} else if (ev.key === "Enter") {
				ev.preventDefault();
				if (options[pickerIndex] && pickerGroupId) {
					addGear(options[pickerIndex], pickerGroupId);
				}
			} else if (ev.key === "Escape") {
				ev.preventDefault();
				closePicker();
			}
		});
	}
	if (typeSel) {
		typeSel.value = gearFilterType;
		typeSel.addEventListener("change", () => {
			gearFilterType = typeSel.value || "";
			pickerIndex = 0;
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			} else {
				refresh();
			}
		});
	}
	if (catSel) {
		catSel.value = gearFilterCategory;
		catSel.addEventListener("change", () => {
			gearFilterCategory = catSel.value || "";
			pickerIndex = 0;
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			} else {
				refresh();
			}
		});
	}
}

function openInventoryGearPicker() {
	// Defer until after the click event finishes (same pattern as editor key rebind).
	setTimeout(() => {
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE("inventoryGear:open");
		}
	}, 0);
}

function removeInventoryGear(gear) {
	if (!gear || !isInventoryGear(gear) || isProtectedInventoryGear(gear)) {
		return;
	}
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE("inventoryGear:remove:" + gear.name);
	}
	if (openInventoryGearId === gear.id) {
		openInventoryGearId = "";
	}
}

/** Keep inventory accordion title + body lede in sync after display-name edits. */
function refreshInventoryGearChrome(gearId) {
	const gear = gearFor(gearId);
	if (!gear || !isInventoryGear(gear)) {
		return;
	}
	const src = sourceFor(gear.mod, gear.name);
	const look = appearanceOf(gear, src);
	const fallbackLabel =
		typeof t === "function" ? t("cog-inventory-gear", "Inventory gear") : "Inventory gear";
	const label = look.display || gear.name || fallbackLabel;
	const acc = document.querySelector(`.inventory-gear-acc[data-gear-id="${CSS.escape(gear.id)}"]`);
	if (!acc) {
		return;
	}
	const title = acc.querySelector(".group-title");
	if (title) {
		title.textContent = label;
	}
	const lede = acc.querySelector('[data-role="inventoryGearBody"] > .lede');
	if (lede) {
		lede.textContent = `${label}${src ? ` · ${sourceMeta(src)}` : ""}`;
	}
}

function renderInventoryGearEditor(host, gear) {
	const src = sourceFor(gear.mod, gear.name);
	const look = appearanceOf(gear, src);
	const title = document.createElement("p");
	title.className = "lede";
	const invFallback =
		typeof t === "function" ? t("cog-inventory-gear", "Inventory gear") : "Inventory gear";
	title.textContent = `${look.display || gear.name || invFallback}${src ? ` · ${sourceMeta(src)}` : ""}`;
	host.appendChild(title);
	const formHost = document.createElement("div");
	formHost.className = "gear-edit-host";
	host.appendChild(formHost);
	renderEditGearForm(formHost, gear.id, { skipPickerRefresh: true });
}

function bindExclusiveGearsTab(details) {
	details.addEventListener("toggle", () => {
		if (!details.open) {
			if (openGearsTabAcc === details.dataset.gearsTab) {
				openGearsTabAcc = "";
			}
			return;
		}
		openGearsTabAcc = details.dataset.gearsTab || "";
		const root = details.parentElement;
		if (root) {
			for (const other of root.querySelectorAll("details.gears-tab-acc")) {
				if (other !== details) {
					other.open = false;
				}
			}
		}
	});
}

function renderGearsTab(body) {
	if (editGearId && !gearFor(editGearId)) {
		editGearId = "";
	}
	const edit = document.createElement("details");
	edit.className = "accordion gears-tab-acc";
	edit.dataset.gearsTab = "edit";
	edit.open = openGearsTabAcc === "edit" || !openGearsTabAcc;
	edit.innerHTML = `<summary>Registered Gears</summary><div class="accordion-body"></div>`;
	const editBody = edit.querySelector(".accordion-body");
	const editSummary = edit.querySelector("summary");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(editSummary, "cog-registered-gears", "Registered Gears");
	}
	const lede = document.createElement("p");
	lede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			lede,
			"cog-registered-gears-lede",
			"Search for a registered tracker to change its appearance. Changes update the HUD live. Placement still comes from the Groups tab."
		);
	} else {
		lede.textContent =
			"Search for a registered tracker to change its appearance. Changes update the HUD live. Placement still comes from the Groups tab.";
	}
	editBody.appendChild(lede);

	const picker = document.createElement("div");
	picker.className = "group-picker gear-edit-picker";
	picker.innerHTML = `
		<div class="picker-filters">
			<label class="pos-field"><span>Type</span>
				<select class="filter-type">
					<option value="">All types</option>
					<option value="percent">Percent</option>
					<option value="count">Count</option>
					<option value="timer">Timer</option>
				</select>
			</label>
			<label class="pos-field"><span>Category</span>
				<select class="filter-category">
					<option value="">All categories</option>
				</select>
			</label>
		</div>
		<input class="picker-filter" type="text" placeholder="Filter by name…" autocomplete="off" spellcheck="false">
		<ul class="picker-list"></ul>`;
	tagFieldLabel(picker.querySelector(".filter-type")?.closest("label"), "cog-type", "Type");
	tagSelectOptions(picker.querySelector(".filter-type"), {
		"": ["cog-all-types", "All types"],
		percent: ["cog-percent", "Percent"],
		count: ["cog-count", "Count"],
		timer: ["cog-timer", "Timer"]
	});
	tagFieldLabel(picker.querySelector(".filter-category")?.closest("label"), "cog-category", "Category");
	tagSelectOptions(picker.querySelector(".filter-category"), {
		"": ["cog-all-categories", "All categories"]
	});
	const pickerFilter = picker.querySelector(".picker-filter");
	if (typeof setTranslatedPlaceholder === "function") {
		setTranslatedPlaceholder(pickerFilter, "cog-filter-by-name", "Filter by name…");
	}
	refreshCategorySelects(picker);
	editBody.appendChild(picker);
	bindGearFilters(picker);
	enhanceSelects(picker);
	fillEditGearPicker();

	appendEditorRule(editBody);

	const formHost = document.createElement("div");
	formHost.className = "gear-edit-host";
	editBody.appendChild(formHost);
	renderEditGearForm(formHost);

	body.appendChild(edit);
	bindExclusiveGearsTab(edit);

	const create = document.createElement("details");
	create.className = "accordion gears-tab-acc";
	create.dataset.gearsTab = "create";
	create.open = openGearsTabAcc === "create";
	create.innerHTML = `<summary>Inventory Gears</summary><div class="accordion-body"></div>`;
	const createBody = create.querySelector(".accordion-body");
	const createSummary = create.querySelector("summary");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(createSummary, "cog-inventory-gears", "Inventory Gears");
	}
	const createLede = document.createElement("p");
	createLede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			createLede,
			"cog-inventory-gears-lede",
			"Track item counts from your inventory. Add items from your inventory into the temporary container; each new item becomes its own gear and is returned to your inventory when you close the container. These gears live here—not in Registered Gears above—but you can hook them to groups, gauges, and gizmos."
		);
	} else {
		createLede.textContent =
			"Track item counts from your inventory. Add items from your inventory into the temporary container; each new item becomes its own gear and is returned to your inventory when you close the container. These gears live here—not in Registered Gears above—but you can hook them to groups, gauges, and gizmos.";
	}
	createBody.appendChild(createLede);

	const bar = document.createElement("div");
	bar.className = "toolbar";
	const addBtn = document.createElement("button");
	addBtn.type = "button";
	addBtn.className = "action";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(addBtn, "cog-add-item-from-inventory", "Add Item from Inventory");
	} else {
		addBtn.textContent = "Add Item from Inventory";
	}
	addBtn.addEventListener("click", () => openInventoryGearPicker());
	bar.appendChild(addBtn);
	createBody.appendChild(bar);

	const gears = inventoryGears();
	if (openInventoryGearId && !gears.some((g) => g.id === openInventoryGearId)) {
		openInventoryGearId = gears[0] ? gears[0].id : "";
	}
	if (!gears.length) {
		const empty = document.createElement("p");
		empty.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-no-inventory-gears", "No inventory gears yet.");
		} else {
			empty.textContent = "No inventory gears yet.";
		}
		createBody.appendChild(empty);
	} else {
		for (const gear of gears) {
			ensureGearAppearance(gear);
			const src = sourceFor(gear.mod, gear.name);
			const look = appearanceOf(gear, src);
			const details = document.createElement("details");
			details.className = "accordion inventory-gear-acc";
			details.dataset.gearId = gear.id;
			details.setAttribute("name", "cog-inventory-gears");
			details.open = openInventoryGearId === gear.id;
			details.innerHTML = `
				<summary>
					<span class="group-title"></span>
					<span class="end"></span>
				</summary>
				<div class="accordion-body" data-role="inventoryGearBody"></div>`;
			const title = details.querySelector(".group-title");
			const invFallback =
				typeof t === "function" ? t("cog-inventory-gear", "Inventory gear") : "Inventory gear";
			title.textContent = look.display || gear.name || invFallback;
			const end = details.querySelector(".end");
			if (isProtectedInventoryGear(gear)) {
				const note = document.createElement("span");
				note.className = "locked-note";
				if (typeof setTranslatedText === "function") {
					setTranslatedText(note, "cog-cannot-delete", "Cannot delete");
				} else {
					note.textContent = "Cannot delete";
				}
				end.appendChild(note);
			} else {
				const del = document.createElement("button");
				del.type = "button";
				del.className = "remove";
				if (typeof setTranslatedText === "function") {
					setTranslatedText(del, "cog-delete", "Delete");
				} else {
					del.textContent = "Delete";
				}
				del.addEventListener("click", () => removeInventoryGear(gear));
				end.appendChild(del);
				stopHeaderToggle(del);
			}
			renderInventoryGearEditor(details.querySelector('[data-role="inventoryGearBody"]'), gear);
			details.addEventListener("toggle", () => {
				if (details.open) {
					openInventoryGearId = gear.id;
				}
			});
			createBody.appendChild(details);
		}
	}
	body.appendChild(create);
	bindExclusiveGearsTab(create);
}

function makeGearColorField(label, gearId, key, value, fallback) {
	return makeOptionalColorField(label, value, fallback, (hex, live) => patchGearSettings(gearId, { [key]: hex }, live));
}

function makeNeutralIconField(selectEl) {
	const field = document.createElement("label");
	field.className = "color-field color-field-select";
	const labelSpan = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(labelSpan, "cog-neutral-icon-colour", "Neutral icon colour");
	} else {
		labelSpan.textContent = "Neutral icon colour";
	}
	field.appendChild(labelSpan);
	field.appendChild(selectEl);
	return field;
}

function makeNeutralIconSelect(value, onChange) {
	const sel = document.createElement("select");
	sel.dataset.role = "neutralIconMode";
	sel.innerHTML = `
		<option value="white">Always White</option>
		<option value="bar">Bar</option>
		<option value="border">Border</option>
		<option value="icon0">Icon 0%</option>
		<option value="icon50">Icon 50%</option>
		<option value="icon100">Icon 100%</option>`;
	tagSelectOptions(sel, {
		white: ["cog-always-white", "Always White"],
		bar: ["cog-bar", "Bar"],
		border: ["cog-border", "Border"],
		icon0: ["cog-icon-0", "Icon 0%"],
		icon50: ["cog-icon-50", "Icon 50%"],
		icon100: ["cog-icon-100", "Icon 100%"]
	});
	sel.value = normalizeNeutralIconMode(value);
	sel.addEventListener("change", () => onChange(normalizeNeutralIconMode(sel.value)));
	return sel;
}

