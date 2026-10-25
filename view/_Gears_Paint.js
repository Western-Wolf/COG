// COG overlay - Gears paint (appearance, icon/bar fill, hide-at visuals)
// Classic script; shares globals with _Gears.js / _Groups.js / gauges.

function emptyAppearance() {
	return {
		displayName: "",
		icon: "",
		iconColor: "",
		barColor: "",
		hideAt: "",
		hudLinkedElement: "",
		hudHideDuplicate: false
	};
}

function normalizeAppearance(raw, label) {
	const a = raw && typeof raw === "object" ? raw : {};
	const tag = label || "appearance";
	stripUnknownKeys(
		a,
		["displayName", "icon", "iconColor", "barColor", "hideAt", "hudLinkedElement", "hudHideDuplicate"],
		tag,
		{ legacySet: ["display", "startColor", "endColor"], deleteUnknown: false }
	);
	noteMigrationIf(
		!String(a.displayName || "").trim() && String(a.display || "").trim(),
		`${tag} display → displayName`
	);
	noteMigrationIf(
		(Object.prototype.hasOwnProperty.call(a, "startColor") ||
			Object.prototype.hasOwnProperty.call(a, "endColor")) &&
			!String(a.iconColor || "").trim(),
		`${tag} startColor/endColor → iconColor`
	);
	return {
		// Migration Code for Transition from v1.01 or earlier to v1.1: legacy appearance title `display` -> `displayName`.
		displayName: String(a.displayName || a.display || ""),
		icon: normalizeIconRampValue(a.icon),
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
	const gid = gear.id || gear.varName || "?";
	// Migration Code for Transition from v1.01 or earlier to v1.1: normalizeAppearance copies legacy `display` into `displayName`.
	gear.defaults = normalizeAppearance(gear.defaults, `gear ${gid} defaults`);
	gear.settings = normalizeAppearance(gear.settings, `gear ${gid} settings`);
	gear.locked = !!gear.locked;
}

function isEmptyAppearance(a) {
	return !a || !(a.displayName || a.icon || a.iconColor || a.barColor || a.hideAt);
}

function appearanceOf(gear, src) {
	ensureGearAppearance(gear);
	const s = gear && gear.settings;
	if (s && !isEmptyAppearance(s)) {
		return {
			displayName:
				s.displayName ||
				(src && (src.displayName || src.display || src.varName)) ||
				(gear && gear.varName) ||
				"",
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
		// Migration Code for Transition from v1.01 or earlier to v1.1: accept legacy live `display`.
		displayName: (src && (src.displayName || src.display || src.varName)) || (gear && gear.varName) || "",
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
	const style = ensureGroupSettings(group);
	return !!(style.useGroupColors && !gearExemptFromGroupColors(group, gear.id));
}

function meterPercent(src) {
	return Math.max(0, Math.min(100, Number(src && src.value) || 0));
}

function resolvedPalette(src, gear, group) {
	const pct = meterPercent(src);
	if (usesGroupColors(gear, group)) {
		const style = ensureGroupSettings(group);
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
		? normalizeNeutralIconMode(ensureGroupSettings(group).neutralIconMode)
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
		const style = ensureGroupSettings(group);
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
		// Fill-from-hidden rebuilds masks from sourceIconPath in applyIconFillFromHidden.
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
	const paint = sourceIconPaint(src, gear, group);
	if (!href) {
		return;
	}
	if (!paint) {
		icon.classList.remove("is-painted");
		let img = icon.querySelector("img");
		if (!img) {
			img = document.createElement("img");
			img.alt = "";
			icon.appendChild(img);
		}
		img.hidden = false;
		if (img.getAttribute("src") !== href) {
			img.src = href;
		}
		return;
	}
	icon.classList.add("is-painted");
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
	const style = group ? ensureGroupSettings(group) : null;
	const look = appearanceOf(gear, src);
	const mode = neutralIconModeFor(gear, group);
	const palette = resolvedPalette(src, gear, group);
	return [
		gear && group && gearExemptFromGroupColors(group, gear.id) ? "1" : "0",
		style && style.useGroupColors ? "1" : "0",
		src && src.type === "count" ? mode : "ratio",
		look.icon,
		sourceIconRel(src, gear),
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
	return ensureGroupSettings(group).fillFromHidden || "";
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
	const focused = preview || document.body.classList.contains("is-focused");
	let rel = 1;
	if (groupUsesHideFade(group, src, gear)) {
		rel = gearHudAlpha(src, gear, group);
		// Editor: keep a dim stand-in when fully hidden so the gear stays findable.
		if (focused && rel <= 0) {
			rel = 0.55;
		}
	} else if (focused && gearHudAlpha(src, gear, group) <= 0) {
		rel = 0.55;
	}
	const host = el.closest && el.closest(".hud-group");
	if (host && host.classList.contains("is-preview")) {
		rel *= 0.55;
	}
	// actual = relative × maxAlpha (preserves differences between gears under a low cap).
	el.style.opacity = String(
		typeof effectiveAlpha === "function" ? effectiveAlpha(rel, group) : rel
	);
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

