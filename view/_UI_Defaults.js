// COG overlay - defaults (theme colours, fonts, applyTheme)
// Classic script; shares globals with _UI.js and feature modules.

const FONT_IMPORT_ROOT = "assets/imports/fonts/";

function defaultFillColor() {
	return "#c4a35a";
}

function defaultBorderColor() {
	return "#e8d2a0";
}

function defaultIconStartColor() {
	return "#ffffff";
}

function defaultIconEndColor() {
	return "#ffffff";
}

function applyTheme() {
	const fill = themeFill();
	const border = themeBorder();
	const fontStack = gadgetFontStack();
	syncFontFaces();
	for (const el of [document.documentElement, document.body, document.getElementById("hud"), document.getElementById("hud-front")]) {
		if (!el) {
			continue;
		}
		el.style.setProperty("--cog-fill", fill);
		el.style.setProperty("--cog-border", border);
		el.style.setProperty("--cog-font-gadget", fontStack);
		el.style.setProperty("--cog-font-ui", fontStack);
	}
	updateKeybindHint();
}

const DEFAULT_GADGET_FONT = "Roboto";

/** CSS font-family stack: chosen gadget face → shipped Roboto → system sans-serif. */
function gadgetFontStack(family = resolvedGadgetFont()) {
	const name = String(family || DEFAULT_GADGET_FONT).trim() || DEFAULT_GADGET_FONT;
	if (name === DEFAULT_GADGET_FONT) {
		return `"${DEFAULT_GADGET_FONT}", sans-serif`;
	}
	return `"${name}", "${DEFAULT_GADGET_FONT}", sans-serif`;
}

function fontStem(fileName) {
	const name = String(fileName || "").trim().replace(/^.*[\\/]/, "");
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}

function fontFormatHint(fileName) {
	const lower = String(fileName || "").toLowerCase();
	if (lower.endsWith(".otf")) {
		return "opentype";
	}
	if (lower.endsWith(".woff2")) {
		return "woff2";
	}
	if (lower.endsWith(".woff")) {
		return "woff";
	}
	return "truetype";
}

function fontEntryFile(entry) {
	if (typeof entry === "string") {
		return String(entry || "").trim().replace(/^.*[\\/]/, "");
	}
	return String((entry && entry.file) || "").trim().replace(/^.*[\\/]/, "");
}

function fontEntryRoot(entry) {
	if (typeof entry === "string") {
		return "fonts";
	}
	return String((entry && entry.root) || "fonts");
}

function fontEntryUrl(entry) {
	const file = fontEntryFile(entry);
	if (!file) {
		return "";
	}
	return fontEntryRoot(entry) === "imports/fonts" ? FONT_IMPORT_ROOT + file : `assets/fonts/${file}`;
}

function availableFontFiles() {
	const list = Array.isArray(snapshot.fonts) ? snapshot.fonts : [];
	return list.map(fontEntryFile).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f));
}

function availableFontFamilies() {
	const stems = availableFontFiles().map(fontStem).filter(Boolean);
	const seen = new Set();
	const out = [];
	for (const stem of stems) {
		if (seen.has(stem)) {
			continue;
		}
		seen.add(stem);
		out.push(stem);
	}
	if (!seen.has(DEFAULT_GADGET_FONT)) {
		out.unshift(DEFAULT_GADGET_FONT);
	}
	return out;
}

function normalizeGadgetFont(value) {
	const raw = String(value || "").trim();
	const families = availableFontFamilies();
	if (raw && families.includes(raw)) {
		return raw;
	}
	if (raw === DEFAULT_GADGET_FONT || families.includes(DEFAULT_GADGET_FONT)) {
		return DEFAULT_GADGET_FONT;
	}
	return families[0] || DEFAULT_GADGET_FONT;
}

function resolvedGadgetFont() {
	return normalizeGadgetFont(snapshot.general && snapshot.general.gadgetFont);
}

function syncFontFaces() {
	let style = document.getElementById("cog-font-faces");
	if (!style) {
		style = document.createElement("style");
		style.id = "cog-font-faces";
		document.head.appendChild(style);
	}
	const rules = [];
	for (const file of availableFontFiles()) {
		const family = fontStem(file);
		if (!family) {
			continue;
		}
		const format = fontFormatHint(file);
		const srcEntry = (Array.isArray(snapshot.fonts) ? snapshot.fonts : []).find(
			(entry) => fontEntryFile(entry) === file
		);
		const url = fontEntryUrl(srcEntry || file);
		rules.push(
			`@font-face{font-family:"${family}";src:url("${url}") format("${format}");font-weight:normal;font-style:normal;}`
		);
	}
	style.textContent = rules.join("\n");
}

function themeFill() {
	return normalizeHexColor(snapshot.general && snapshot.general.fillColor, defaultFillColor());
}

function defaultIconColor() {
	return "#ffffff";
}

/** Single General backup icon tint.
 * Migration Code for Transition from v1.01 or earlier to v1.1: iconStartColor/iconEndColor → iconColor. */
function themeIconColor() {
	const g = snapshot.general || {};
	const direct = normalizeHexColor(g.iconColor, "");
	if (direct) {
		return direct;
	}
	const start = normalizeHexColor(g.iconStartColor, "");
	if (start) {
		return start;
	}
	return normalizeHexColor(g.iconEndColor, defaultIconColor()) || defaultIconColor();
}

function themeIconStart() {
	return themeIconColor();
}

function themeIconEnd() {
	return themeIconColor();
}

function themeBorder() {
	return normalizeHexColor(snapshot.general && snapshot.general.borderColor, defaultBorderColor());
}

