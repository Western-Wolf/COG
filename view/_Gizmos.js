// COG overlay - Gizmos (type-level: shared plumbing for all gizmos)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).
// Individual types live in _Gizmo_*.js.

const DEFAULT_GIZMO_FONT_SIZE = 18;

const DEFAULT_GIZMO_GOLD = "#e8d2a0";

const MIN_GIZMO_WIDTH = 32;

const MIN_GIZMO_HEIGHT = 6;

let openGizmoId = "";
let activeGizmoId = "";

const gizmoRenderers = new Map();
const loadedGizmoViewScripts = new Set();

/** Any typeId starting with "cog-" is reserved for COG. */
function isReservedCogGizmoTypeId(typeId) {
	return String(typeId || "").toLowerCase().startsWith("cog-");
}

function sanitizeGizmoTypeId(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "");
}

function normalizeGizmoType(value) {
	const t = String(value || "").toLowerCase();
	if (t === "cog-shout-meter" || t === "shout-meter" || t === "shoutmeter" || t === "shout") {
		return "cog-shout-meter";
	}
	if (t === "cog-feed" || t === "feed" || t === "feeds") {
		return "cog-feed";
	}
	if (t === "cog-suppressor" || t === "suppressor" || t === "suppress") {
		return "cog-suppressor";
	}
	if (!t || t === "cog-clock" || t === "clock") {
		return "cog-clock";
	}
	const cleaned = sanitizeGizmoTypeId(t);
	return cleaned || "cog-clock";
}

/**
 * Register a gizmo type implementation (mods + builtins).
 * Custom/mod types typically provide: mount / update / unmount.
 * Rich builtins also provide: create / ensure / build / layout / paint / fillEditor
 * (and optionally layoutBox / fontSizePx). create() owns instance defaults;
 * settingsSchema on the type def remains metadata for mods / tools.
 */
window.CogRegisterGizmoRenderer = function (typeId, api) {
	const cleaned = sanitizeGizmoTypeId(typeId);
	if (!cleaned) {
		return;
	}
	const id = normalizeGizmoType(cleaned);
	gizmoRenderers.set(id, api && typeof api === "object" ? api : {});
	if (!drag && typeof renderGears === "function") {
		renderGears();
	}
};

/**
 * Type-owned data folder under SKSE/Plugins/COG (relative), e.g. "gizmos/cog-feed".
 * Matches Papyrus COG_API.GizmoStorage / C++ CogGizmoStorage::Relative.
 * COG creates the absolute folder on register/load; view code builds subpaths off this string
 * (e.g. CogGizmoStorage("cog-feed") + "/effects").
 */
window.CogGizmoStorage = function (typeId) {
	if (!String(typeId || "").trim()) {
		return "";
	}
	return `gizmos/${normalizeGizmoType(typeId)}`;
};

function gizmoRendererApi(typeId) {
	return gizmoRenderers.get(normalizeGizmoType(typeId)) || null;
}

/** Next 1-based index for a new gizmo of this type (count of existing + 1). */
function nextGizmoTypeIndex(typeId) {
	const t = normalizeGizmoType(typeId);
	return (snapshot.gizmos || []).filter((z) => normalizeGizmoType(z.typeId) === t).length + 1;
}

/** Push a newly created gizmo instance and open its editor. */
function placeNewGizmo(gizmo) {
	if (!gizmo || typeof gizmo !== "object") {
		return null;
	}
	if (!Array.isArray(snapshot.gizmos)) {
		snapshot.gizmos = [];
	}
	ensureGizmo(gizmo);
	snapshot.gizmos.push(gizmo);
	selectEditorItem("gizmo", gizmo.id);
	scheduleSave();
	renderGears();
	renderEditor();
	return gizmo;
}

function gizmoTypeDef(typeId) {
	const id = normalizeGizmoType(typeId);
	return (snapshot.gizmoTypes || []).find((t) => normalizeGizmoType(t.typeId) === id) || null;
}

function parseGizmoSettingsSchema(typeDef) {
	if (!typeDef) {
		return [];
	}
	const raw = typeDef.settingsSchema != null ? typeDef.settingsSchema : typeDef.settingsSchemaJson;
	if (Array.isArray(raw)) {
		return raw;
	}
	if (typeof raw === "string" && raw.trim()) {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			return [];
		}
	}
	return [];
}

function ensureGizmoViewScripts() {
	for (const typeDef of snapshot.gizmoTypes || []) {
		const scriptPath = String(typeDef.viewScript || "").replace(/\\/g, "/").replace(/^\/+/, "");
		if (!scriptPath || scriptPath.includes("..") || scriptPath.includes(":")) {
			continue;
		}
		if (loadedGizmoViewScripts.has(scriptPath)) {
			continue;
		}
		loadedGizmoViewScripts.add(scriptPath);
		const el = document.createElement("script");
		el.src = "../" + scriptPath;
		el.async = false;
		el.onerror = () => {
			if (typeof window.cogReportError === "function") {
				window.cogReportError("gizmo view script", scriptPath);
			} else {
				console.error("COG failed to load gizmo view script", scriptPath);
			}
		};
		document.head.appendChild(el);
	}
}

/** Type-specific keys nested under gizmo.settings (used by patchGizmo / save). */
const GIZMO_SETTINGS_KEYS = new Set([
	"displayName",
	"displayMode",
	"displayLines",
	"fontSize",
	"timeFormat",
	"endCapMode",
	"endCap",
	"endCapOverlap",
	"borderThickness",
	"celestialShow",
	"textAlign",
	"clockIcon",
	"iconColor",
	"textColor",
	"borderColor",
	"celestialColor",
	"drainOrigin",
	"wordsMode",
	"primaryColor",
	"secondaryColor",
	"troughOpacity",
	"maxVisible",
	"stackOrigin",
	"durationMs",
	"fadeMs",
	"showNotifications",
	"showInventory",
	"showLocation",
	"showActiveEffects",
	"showSkills",
	"timerMinSec",
	"timerMaxSec",
	"showEffectIcons",
	"showEffectText",
	"showEffectTimer",
	"progressBarWidth",
	"numberFormat",
	"barColor",
	"effectIcon",
	"effectsColor",
	"suppressTransformEffects",
	"showNotificationIcons",
	"showInventoryIcons",
	"showLocationIcons",
	"showSkillIcons",
	"notificationIcon",
	"allowModNotificationIcon",
	"allowModNotificationColor",
	"suppressInventory",
	"showLocationDiscovery",
	"showCurrentLocation",
	"locationDiscoveryIcon",
	"currentLocationIcon",
	"locationDiscoveryColor",
	"currentLocationColor",
	"showSkillProgress",
	"showLevelProgress",
	"skillProgressIcon",
	"levelProgressIcon",
	"skillProgressColor",
	"levelProgressColor",
	"backdropColor",
	"backdropOpacity",
	"backdropDirection",
	"icon",
	"iconPlacement",
	"addColor",
	"removeColor",
	"stolenColor",
	"alwaysHide",
	"neverHide"
]);

function normalizeGizmoVisibility(value) {
	// Shared triad lives on normalizeVisibility (_Gauges.js loads first).
	return typeof normalizeVisibility === "function" ? normalizeVisibility(value) : "hud";
}

/** Type record defaultVisibility, else universal builtin defaults. */
function defaultVisibilityForType(typeId) {
	const typeDef = gizmoTypeDef(typeId);
	if (typeDef && typeDef.defaultVisibility != null && String(typeDef.defaultVisibility).trim() !== "") {
		return normalizeGizmoVisibility(typeDef.defaultVisibility);
	}
	const t = normalizeGizmoType(typeId);
	if (t === "cog-feed") {
		return "ui";
	}
	if (t === "cog-suppressor") {
		return "none";
	}
	return "hud";
}

/** Prefer instance visibility; if missing, type default; else universal. */
function coalesceGizmoVisibility(gizmo, typeId) {
	const raw = gizmo && gizmo.visibility;
	if (raw != null && String(raw).trim() !== "") {
		return normalizeGizmoVisibility(raw);
	}
	return defaultVisibilityForType(typeId || (gizmo && gizmo.typeId));
}

function parseGizmoSettingsObject(gizmo) {
	if (gizmo.settings && typeof gizmo.settings === "object" && !Array.isArray(gizmo.settings)) {
		return gizmo.settings;
	}
	const raw = gizmo.settingsJson;
	if (typeof raw === "string" && raw.trim()) {
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed;
			}
		} catch (e) {
			/* ignore */
		}
	}
	return {};
}

/** Fill missing settings keys from the registered type schema, then leave the rest to ensure/create. */
function mergeSettingsFromTypeSchema(gizmo) {
	const settings = parseGizmoSettingsObject(gizmo);
	const schema = parseGizmoSettingsSchema(gizmoTypeDef(gizmo && gizmo.typeId));
	for (const field of schema || []) {
		if (!field || !field.key) {
			continue;
		}
		if (!Object.prototype.hasOwnProperty.call(field, "default")) {
			continue;
		}
		if (Object.prototype.hasOwnProperty.call(settings, field.key)) {
			continue;
		}
		settings[field.key] = field.default;
	}
	return settings;
}

function syncGizmoSettingsJson(gizmo) {
	const settings = mergeSettingsFromTypeSchema(gizmo);
	gizmo.settings = settings;
	gizmo.settingsJson = JSON.stringify(settings);
	return settings;
}

/**
 * Gizmo instance title lives in settings.displayName.
 * Migration Code for Transition from v1.01 or earlier to v1.1:
 * Legacy root displayName (and older title key name) move under nested settings.displayName (never written on root again).
 */
function ensureGizmoDisplayName(gizmo) {
	if (!gizmo || typeof gizmo !== "object") {
		return;
	}
	const settings = parseGizmoSettingsObject(gizmo);
	let title = "";
	if (String(settings.displayName || "").trim()) {
		title = String(settings.displayName).trim();
	} else if (String(gizmo.displayName || "").trim()) {
		title = String(gizmo.displayName).trim();
	} else if (String(gizmo.name || "").trim()) {
		title = String(gizmo.name).trim();
	}
	settings.displayName = title;
	gizmo.settings = settings;
	delete gizmo.displayName;
	delete gizmo.name;
}

function gizmoDisplayName(gizmo) {
	if (!gizmo) {
		return "";
	}
	ensureGizmoDisplayName(gizmo);
	const settings = gizmo.settings || parseGizmoSettingsObject(gizmo);
	return String(settings.displayName || "");
}

function ensureGizmoSettings(gizmo) {
	ensureGizmoDisplayName(gizmo);
	return syncGizmoSettingsJson(gizmo);
}

function ensureCustomGizmo(gizmo) {
	ensureGizmoDisplayName(gizmo);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy gizmo instance product key "type" becomes typeId (never kept as "type").
	if (!String(gizmo.typeId || "").trim() && String(gizmo.type || "").trim()) {
		gizmo.typeId = String(gizmo.type).trim();
	}
	delete gizmo.type;
	gizmo.typeId = normalizeGizmoType(gizmo.typeId);
	const typeDef = gizmoTypeDef(gizmo.typeId);
	const defW = Math.max(MIN_GIZMO_WIDTH, Number(typeDef && typeDef.defaultWidth) || 240);
	const defH = Math.max(MIN_GIZMO_HEIGHT, Number(typeDef && typeDef.defaultHeight) || 48);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation/width/height move under nested "display" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	migrateEntityDisplay(gizmo, {
		sized: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: defW,
		height: defH,
		minW: MIN_GIZMO_WIDTH,
		minH: MIN_GIZMO_HEIGHT
	});
	gizmo.visibility = coalesceGizmoVisibility(gizmo, gizmo.typeId);
	ensureGizmoSettings(gizmo);
	if (gizmo.livePayload == null && typeof gizmo.livePayloadJson === "string" && gizmo.livePayloadJson.trim()) {
		try {
			gizmo.livePayload = JSON.parse(gizmo.livePayloadJson);
		} catch (e) {
			gizmo.livePayload = gizmo.livePayloadJson;
		}
	}
	return gizmo;
}

function defaultsFromSchema(schema) {
	const out = {};
	for (const field of schema || []) {
		if (!field || !field.key) {
			continue;
		}
		if (Object.prototype.hasOwnProperty.call(field, "default")) {
			out[field.key] = field.default;
		}
	}
	return out;
}

function addGizmoFromType(typeDef) {
	if (!typeDef || !typeDef.typeId) {
		return;
	}
	const typeId = normalizeGizmoType(typeDef.typeId);
	const api = gizmoRendererApi(typeId);
	if (api && typeof api.create === "function") {
		placeNewGizmo(api.create());
		return;
	}
	const schema = parseGizmoSettingsSchema(typeDef);
	const settings = defaultsFromSchema(schema);
	const baseName = typeDef.displayName || typeId;
	const n = nextGizmoTypeIndex(typeId);
	const stockKey = `${baseName} {num}`;
	settings.displayName =
		typeof formatStockName === "function"
			? formatStockName(stockKey, { num: n })
			: `${baseName} ${n}`;
	placeNewGizmo(
		ensureCustomGizmo({
			id: "gizmo_" + Date.now().toString(36),
			typeId,
			sourceMod: typeDef.sourceMod || "",
			visibility: normalizeGizmoVisibility(typeDef.defaultVisibility || "hud"),
			display: {
				x: DEFAULT_HUD_X,
				y: DEFAULT_HUD_Y,
				rotation: 0,
				width: Math.max(MIN_GIZMO_WIDTH, Number(typeDef.defaultWidth) || 240),
				height: Math.max(MIN_GIZMO_HEIGHT, Number(typeDef.defaultHeight) || 48),
				maxAlpha: 100
			},
			settings,
			settingsJson: JSON.stringify(settings)
		})
	);
}

function layoutHudGizmoCustom(el, gizmo) {
	ensureCustomGizmo(gizmo);
	const box = { w: gizmo.display.width, h: gizmo.display.height };
	const css = hudItemLayoutCss(gizmo, box.w, box.h);
	el.style.left = css.x * 100 + "%";
	el.style.top = css.y * 100 + "%";
	el.style.width = gizmo.display.width + "px";
	el.style.height = gizmo.display.height + "px";
	el.style.setProperty("--gizmo-rot", (gizmo.display.rotation || 0) + "deg");
	applyHostMaxAlpha(el, gizmo);
}

function paintGizmoCustom(el, gizmo) {
	ensureCustomGizmo(gizmo);
	const host = el.querySelector(".gizmo-custom-host");
	if (!host) {
		return;
	}
	const renderer = gizmoRenderers.get(gizmo.typeId);
	if (renderer && typeof renderer.update === "function") {
		try {
			renderer.update(host, gizmo);
			return;
		} catch (e) {
			if (typeof window.cogReportError === "function") {
				window.cogReportError("gizmo renderer update:" + gizmo.typeId, e);
			} else {
				console.error("gizmo renderer update", gizmo.typeId, e);
			}
		}
	}
	if (!host.dataset.placeholder) {
		host.dataset.placeholder = "1";
		host.classList.add("is-placeholder");
		host.textContent = gizmoDisplayName(gizmo) || gizmo.typeId;
	}
}

function unmountGizmoCustom(el) {
	const type = el && el.dataset ? el.dataset.gizmoType : "";
	const host = el && el.querySelector ? el.querySelector(".gizmo-custom-host") : null;
	const renderer = gizmoRenderers.get(type);
	if (host && renderer && typeof renderer.unmount === "function") {
		try {
			renderer.unmount(host);
		} catch (e) {
			if (typeof window.cogReportError === "function") {
				window.cogReportError("gizmo renderer unmount:" + type, e);
			} else {
				console.error("gizmo renderer unmount", type, e);
			}
		}
	}
}

function buildGizmoCustomEl(gizmo, preview) {
	ensureCustomGizmo(gizmo);
	const el = document.createElement("div");
	el.className = "hud-gizmo hud-gizmo-custom";
	el.dataset.id = gizmo.id;
	el.dataset.gizmoType = gizmo.typeId;
	const host = document.createElement("div");
	host.className = "gizmo-custom-host";
	el.appendChild(host);
	layoutHudGizmoCustom(el, gizmo);
	const renderer = gizmoRenderers.get(gizmo.typeId);
	if (renderer && typeof renderer.mount === "function") {
		try {
			renderer.mount(host, gizmo);
		} catch (e) {
			if (typeof window.cogReportError === "function") {
				window.cogReportError("gizmo renderer mount:" + gizmo.typeId, e);
			} else {
				console.error("gizmo renderer mount", gizmo.typeId, e);
			}
			host.classList.add("is-placeholder");
			host.dataset.placeholder = "1";
			host.textContent = gizmoDisplayName(gizmo) || gizmo.typeId;
		}
	} else {
		host.classList.add("is-placeholder");
		host.dataset.placeholder = "1";
		host.textContent = gizmoDisplayName(gizmo) || gizmo.typeId;
	}
	if (preview) {
		attachGizmoHandles(el, gizmo);
	}
	return el;
}

function patchGizmoSetting(id, key, value, live) {
	const gizmo = gizmoFor(id);
	if (!gizmo) {
		return;
	}
	const settings = ensureGizmoSettings(gizmo);
	const unchanged = settings[key] === value;
	if (unchanged) {
		if (live === false) {
			scheduleSave(true);
		}
		return;
	}
	settings[key] = value;
	gizmo.settings = settings;
	gizmo.settingsJson = JSON.stringify(settings);
	if (live === true) {
		syncHudGizmo(gizmo);
		return;
	}
	scheduleSave(true);
	syncHudGizmo(gizmo);
}

function appendGizmoVisibilityEditor(panel, gizmo) {
	const gid = gizmo.id;
	const field = document.createElement("label");
	field.className = "pos-field compact";
	const title = document.createElement("span");
	title.className = "field-title-row";
	const labelSpan = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(labelSpan, "cog-visibility", "Visibility");
	} else {
		labelSpan.textContent = "Visibility";
	}
	title.appendChild(labelSpan);
	const visibilityTip = makeInfoTip(
		"HUD Visible: only while the vanilla Heads-Up Display is up (hidden with the HUD in menus). UI Visible: also keep showing while menus hide the HUD (inventory, map, dialogue, etc.). None: editor preview only.",
		"cog-gizmo-visibility-tip"
	);
	title.appendChild(visibilityTip);
	const sel = document.createElement("select");
	sel.dataset.role = "visibility";
	sel.innerHTML = `<option value="none">None</option>
		<option value="hud">HUD Visible</option>
		<option value="ui">UI Visible</option>`;
	tagSelectOptions(sel, {
		none: ["cog-none", "None"],
		hud: ["cog-hud-visible", "HUD Visible"],
		ui: ["cog-ui-visible", "UI Visible"]
	});
	sel.value = normalizeGizmoVisibility(gizmo.visibility);
	sel.addEventListener("change", () => {
		patchGizmo(gid, { visibility: normalizeGizmoVisibility(sel.value) });
	});
	field.appendChild(title);
	field.appendChild(sel);
	const row = document.createElement("div");
	row.className = "style-row";
	row.appendChild(field);
	panel.appendChild(row);
}

function fillSchemaGizmoEditor(panel, gizmo) {
	const gid = gizmo.id;
	const live = () => gizmoFor(gid) || gizmo;
	const typeDef = gizmoTypeDef(gizmo.typeId);
	const schema = parseGizmoSettingsSchema(typeDef);
	const intro = document.createElement("p");
	intro.className = "hint";
	if (typeDef && typeDef.viewScript) {
		if (typeof setTranslatedText === "function") {
			setTranslatedText(
				intro,
				"cog-gizmo-custom-intro",
				"Custom gizmo from a mod. Drag, resize, and rotate on the HUD; settings below come from the mod schema."
			);
		} else {
			intro.textContent =
				"Custom gizmo from a mod. Drag, resize, and rotate on the HUD; settings below come from the mod schema.";
		}
	} else if (typeof setTranslatedText === "function") {
		setTranslatedText(intro, "cog-gizmo-settings", "Gizmo settings.");
	} else {
		intro.textContent = "Gizmo settings.";
	}
	panel.appendChild(intro);
	appendEditorRule(panel);
	if (!schema.length) {
		const empty = document.createElement("p");
		empty.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-gizmo-no-custom-settings", "No custom settings for this gizmo type.");
		} else {
			empty.textContent = "No custom settings for this gizmo type.";
		}
		panel.appendChild(empty);
		return;
	}
	const section = document.createElement("div");
	section.className = "gizmo-text-settings";
	const row = document.createElement("div");
	row.className = "style-row";
	for (const field of schema) {
		if (!field || !field.key) {
			continue;
		}
		const kind = String(field.kind || "string").toLowerCase();
		const label = field.label || field.key;
		const settings = () => syncGizmoSettingsJson(live());
		if (kind === "color") {
			const current = settings()[field.key];
			row.appendChild(
				makeOptionalColorField(label, current, field.default || DEFAULT_GIZMO_GOLD, (hex, live) => {
					patchGizmoSetting(gid, field.key, hex, live);
				})
			);
			continue;
		}
		if (kind === "bool" || kind === "boolean") {
			const wrap = document.createElement("label");
			wrap.className = "pos-field compact";
			wrap.innerHTML = "<span>" + label + "</span><select></select>";
			const sel = wrap.querySelector("select");
			sel.innerHTML = '<option value="true">On</option><option value="false">Off</option>';
			tagSelectOptions(sel, {
				true: ["cog-on", "On"],
				false: ["cog-off", "Off"]
			});
			sel.value = settings()[field.key] ? "true" : "false";
			sel.addEventListener("change", () => {
				patchGizmoSetting(gid, field.key, sel.value === "true");
			});
			row.appendChild(wrap);
			continue;
		}
		if (kind === "enum") {
			const wrap = document.createElement("label");
			wrap.className = "pos-field compact";
			const opts = Array.isArray(field.options) ? field.options : [];
			wrap.innerHTML = "<span>" + label + "</span><select></select>";
			const sel = wrap.querySelector("select");
			for (const opt of opts) {
				const o = document.createElement("option");
				o.value = String(opt);
				o.textContent = String(opt);
				sel.appendChild(o);
			}
			const cur = settings()[field.key];
			sel.value = cur != null ? String(cur) : String(field.default || (opts[0] != null ? opts[0] : ""));
			sel.addEventListener("change", () => {
				patchGizmoSetting(gid, field.key, sel.value);
			});
			row.appendChild(wrap);
			continue;
		}
		if (kind === "int" || kind === "float" || kind === "number") {
			const wrap = document.createElement("label");
			wrap.className = "pos-field compact";
			wrap.innerHTML = "<span>" + label + '</span><input type="text" inputmode="numeric">';
			const input = wrap.querySelector("input");
			const isInt = kind === "int";
			const min = field.min != null ? Number(field.min) : null;
			const max = field.max != null ? Number(field.max) : null;
			const decimals = isInt ? 0 : 3;
			const initial =
				settings()[field.key] != null ? settings()[field.key] : field.default ?? 0;
			input.value = fmtDec(initial, decimals);
			bindNumberField(input, {
				parse: (raw) => {
					const v = Number(raw);
					if (!Number.isFinite(v)) {
						return null;
					}
					let next = isInt ? Math.round(v) : v;
					if (min != null && Number.isFinite(min)) {
						next = Math.max(min, next);
					}
					if (max != null && Number.isFinite(max)) {
						next = Math.min(max, next);
					}
					return next;
				},
				apply: (v) => patchGizmoSetting(gid, field.key, v),
				decimals,
				current: () => {
					const cur = settings()[field.key];
					return cur != null ? Number(cur) : Number(field.default) || 0;
				}
			});
			row.appendChild(wrap);
			continue;
		}
		const wrap = document.createElement("label");
		wrap.className = "pos-field compact";
		wrap.innerHTML = "<span>" + label + '</span><input type="text" spellcheck="false">';
		const input = wrap.querySelector("input");
		input.value = settings()[field.key] != null ? String(settings()[field.key]) : String(field.default || "");
		const commitStr = () => patchGizmoSetting(gid, field.key, input.value);
		input.addEventListener("input", commitStr);
		input.addEventListener("change", commitStr);
		row.appendChild(wrap);
	}
	section.appendChild(row);
	panel.appendChild(section);
}

function appendGizmoPositionSizeEditor(panel, gizmo) {
	const gid = gizmo.id;
	const live = () => gizmoFor(gid) || gizmo;
	appendEditorRule(panel);
	const posLede = document.createElement("p");
	posLede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(posLede, "cog-display", "Display");
	} else {
		posLede.textContent = "Display";
	}
	panel.appendChild(posLede);
	const posA = document.createElement("div");
	posA.className = "pos-row";
	posA.innerHTML = `
		<label class="pos-field"><span>X</span><input type="text" data-role="x" inputmode="decimal"></label>
		<label class="pos-field"><span>Y</span><input type="text" data-role="y" inputmode="decimal"></label>
		<label class="pos-field"><span>Rotation</span><input type="text" data-role="rotation" inputmode="decimal"></label>`;
	const posB = document.createElement("div");
	posB.className = "pos-row";
	posB.innerHTML = `
		<label class="pos-field"><span>Max Alpha</span><input type="text" data-role="maxAlpha" inputmode="decimal"></label>
		<label class="pos-field"><span>Width</span><input type="text" data-role="width" inputmode="numeric"></label>
		<label class="pos-field"><span>Height</span><input type="text" data-role="height" inputmode="numeric"></label>`;
	panel.appendChild(posA);
	panel.appendChild(posB);
	const xInput = posA.querySelector('[data-role="x"]');
	const yInput = posA.querySelector('[data-role="y"]');
	const rotInput = posA.querySelector('[data-role="rotation"]');
	const maxAlphaInput = posB.querySelector('[data-role="maxAlpha"]');
	const wInput = posB.querySelector('[data-role="width"]');
	const hInput = posB.querySelector('[data-role="height"]');
	// X/Y are single letters — leave untagged.

	tagFieldLabel(rotInput.closest("label"), "cog-rotation", "Rotation");
	tagFieldLabel(maxAlphaInput.closest("label"), "cog-max-alpha", "Max Alpha");
	tagFieldLabel(wInput.closest("label"), "cog-width", "Width");
	tagFieldLabel(hInput.closest("label"), "cog-height", "Height");
	const box = gizmoLayoutBox(gizmo);
	const editorPos = hudItemEditorPosPct(gizmo, box.w, box.h);
	xInput.value = fmtPct(editorPos.x);
	yInput.value = fmtPct(editorPos.y);
	rotInput.value = (Number(gizmo.display.rotation) || 0).toFixed(1);
	maxAlphaInput.value = String(Math.round(Number(gizmo.display.maxAlpha) || 100));
	wInput.value = String(Math.round(gizmo.display.width));
	hInput.value = String(Math.round(gizmo.display.height));
	bindNumberField(xInput, {
		suffix: "%",
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === "." || raw === "-") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? clampPct(v, 0, 100) / 100 : null;
		},
		apply: (v) => {
			const g = live();
			const box = gizmoLayoutBox(g);
			const cur = hudItemEditorPosPct(g, box.w, box.h);
			patchGizmo(gid, hudItemEditorPosPatch(g, box.w, box.h, v * 100, cur.y));
		},
		format: (v) => fmtPct(v * 100),
		current: () => {
			const g = live();
			const box = gizmoLayoutBox(g);
			return hudItemEditorPosPct(g, box.w, box.h).x / 100;
		}
	});
	bindNumberField(yInput, {
		suffix: "%",
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === "." || raw === "-") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? clampPct(v, 0, 100) / 100 : null;
		},
		apply: (v) => {
			const g = live();
			const box = gizmoLayoutBox(g);
			const cur = hudItemEditorPosPct(g, box.w, box.h);
			patchGizmo(gid, hudItemEditorPosPatch(g, box.w, box.h, cur.x, v * 100));
		},
		format: (v) => fmtPct(v * 100),
		current: () => {
			const g = live();
			const box = gizmoLayoutBox(g);
			return hudItemEditorPosPct(g, box.w, box.h).y / 100;
		}
	});
	bindNumberField(rotInput, {
		suffix: "°",
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === "-" || raw === "." || raw === "-.") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? v : null;
		},
		apply: (v) => {
			const g = live();
			patchGizmo(gid, { display: { rotation: v } });
			const box = gizmoLayoutBox(g);
			clampHudItemToScreen(g, box.w, box.h);
			const pos = entityDisplay(g);
			patchGizmo(gid, { display: { x: pos.x, y: pos.y } });
		},
		format: (v) => (Number(v) || 0).toFixed(1),
		current: () => live().display.rotation || 0
	});
	bindNumberField(maxAlphaInput, {
		suffix: "%",
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === "." || raw === "-") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
		},
		apply: (v) => patchGizmo(gid, { display: { maxAlpha: v } }),
		format: (v) => String(Math.round(Number(v) || 100)),
		current: () => {
			const a = Number(live().display.maxAlpha);
			return Number.isFinite(a) ? a : 100;
		}
	});
	bindNumberField(wInput, {
		suffix: "px",
		parse: (raw) => (String(raw).trim() === "" ? null : Math.max(MIN_GIZMO_WIDTH, Math.min(2000, Number(raw) || 0))),
		apply: (v) => patchGizmo(gid, { display: { width: v } }),
		format: (v) => String(Math.round(v)),
		current: () => live().display.width
	});
	bindNumberField(hInput, {
		suffix: "px",
		parse: (raw) => (String(raw).trim() === "" ? null : Math.max(MIN_GIZMO_HEIGHT, Math.min(512, Number(raw) || 0))),
		apply: (v) => patchGizmo(gid, { display: { height: v } }),
		format: (v) => String(Math.round(v)),
		current: () => live().display.height
	});
}

function normalizeClockTextAlign(value) {
	const v = String(value || "").toLowerCase();
	if (v === "left") {
		return "left";
	}
	if (v === "right") {
		return "right";
	}
	return "center";
}

function ensureGizmo(gizmo) {
	if (!gizmo || typeof gizmo !== "object") {
		return gizmo;
	}
	ensureGizmoDisplayName(gizmo);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy gizmo instance product key "type" becomes typeId.
	if (!String(gizmo.typeId || "").trim() && String(gizmo.type || "").trim()) {
		gizmo.typeId = String(gizmo.type).trim();
	}
	delete gizmo.type;
	gizmo.typeId = normalizeGizmoType(gizmo.typeId);
	const api = gizmoRendererApi(gizmo.typeId);
	if (api && typeof api.ensure === "function") {
		return api.ensure(gizmo);
	}
	return ensureCustomGizmo(gizmo);
}

function gizmoFontSizePx(gizmo) {
	ensureGizmo(gizmo);
	const api = gizmoRendererApi(gizmo.typeId);
	if (api && typeof api.fontSizePx === "function") {
		return api.fontSizePx(gizmo);
	}
	const s = ensureGizmoSettings(gizmo);
	if (s.fontSize > 0) {
		return Math.round(s.fontSize);
	}
	return DEFAULT_GIZMO_FONT_SIZE;
}

function gizmoLayoutBox(gizmo) {
	ensureGizmo(gizmo);
	const api = gizmoRendererApi(gizmo.typeId);
	if (api && typeof api.layoutBox === "function") {
		return api.layoutBox(gizmo);
	}
	return { w: gizmo.display.width, h: gizmo.display.height };
}

function gizmoFor(id) {
	return (snapshot.gizmos || []).find((z) => z.id === id);
}

function buildGizmoEl(gizmo, preview) {
	const type = normalizeGizmoType(gizmo.typeId);
	const api = gizmoRendererApi(type);
	const el =
		api && typeof api.build === "function" ? api.build(gizmo, preview) : buildGizmoCustomEl(gizmo, preview);
	if (el) {
		el.dataset.visibility = normalizeGizmoVisibility(gizmo.visibility);
	}
	return el;
}

function removeGizmo(id) {
	snapshot.gizmos = (snapshot.gizmos || []).filter((z) => z.id !== id);
	if (openGizmoId === id) {
		openGizmoId = "";
	}
	if (activeGizmoId === id) {
		activeGizmoId = "";
	}
	scheduleSave(true);
	renderGears();
	renderEditor(true);
}

function patchGizmo(id, patch, skipHud, live) {
	const gizmo = gizmoFor(id);
	if (!gizmo) {
		return;
	}
	const settings = ensureGizmoSettings(gizmo);
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
		if (key === "settingsJson") {
			continue;
		}
		if (key === "settings" && value && typeof value === "object" && !Array.isArray(value)) {
			for (const [sk, sv] of Object.entries(value)) {
				if (settings[sk] !== sv) {
					changed = true;
					settings[sk] = sv;
				}
			}
			continue;
		}
		if (key === "display" && value && typeof value === "object" && !Array.isArray(value)) {
			const pos = entityDisplay(gizmo);
			for (const [pk, pv] of Object.entries(value)) {
				if (pos[pk] !== pv) {
					changed = true;
					pos[pk] = pv;
				}
			}
			continue;
		}
		if (GIZMO_SETTINGS_KEYS.has(key)) {
			if (settings[key] !== value) {
				changed = true;
				settings[key] = value;
			}
			continue;
		}
		if (gizmo[key] !== value) {
			changed = true;
			gizmo[key] = value;
		}
	}
	if (!changed) {
		if (live === false) {
			scheduleSave(true);
		}
		return;
	}
	gizmo.settings = settings;
	gizmo.settingsJson = JSON.stringify(settings);
	ensureGizmo(gizmo);
	if (live === true) {
		if (!skipHud) {
			syncHudGizmo(gizmo);
		}
		return;
	}
	scheduleSave(true);
	if (!skipHud) {
		// Sync this item immediately so editor typing shows even when a pointer-drag
		// holds renderGears(), or when lean live patches skip full layout.
		syncHudGizmo(gizmo);
		// live === false: colour commit — impacted gizmo only (already synced).
		if (live !== false && !drag) {
			renderGears();
		}
	}
	if (Object.prototype.hasOwnProperty.call(patch, "displayName") || Object.prototype.hasOwnProperty.call(patch, "visibility")) {
		renderEditor(true);
	}
}

function findHudGizmoEl(id, preferredHost) {
	const sel = `.hud-gizmo[data-id="${cssAttr(id)}"]`;
	if (preferredHost) {
		const here = preferredHost.querySelector(sel);
		if (here) {
			return here;
		}
	}
	for (const host of [document.getElementById("hud-front"), document.getElementById("hud")]) {
		if (!host || host === preferredHost) {
			continue;
		}
		const el = host.querySelector(sel);
		if (el) {
			return el;
		}
	}
	return null;
}

function layoutHudGizmo(el, gizmo) {
	const api = gizmoRendererApi(gizmo.typeId);
	if (api && typeof api.layout === "function") {
		api.layout(el, gizmo);
		applyHostMaxAlpha(el, gizmo);
		return;
	}
	layoutHudGizmoCustom(el, gizmo);
}

function syncHudGizmo(gizmo) {
	const el = findHudGizmoEl(gizmo.id);
	if (!el) {
		return;
	}
	el.dataset.visibility = normalizeGizmoVisibility(gizmo.visibility);
	const api = gizmoRendererApi(gizmo.typeId);
	if (api && typeof api.layout === "function") {
		api.layout(el, gizmo);
		applyHostMaxAlpha(el, gizmo);
	} else {
		layoutHudGizmoCustom(el, gizmo);
	}
	if (api && typeof api.paint === "function") {
		api.paint(el, gizmo);
	} else {
		paintGizmoCustom(el, gizmo);
	}
	syncGizmoHandleBounds(gizmo);
}

/** Paint-only refresh while layout is held (drag/save/edit). */
function paintHudGizmoLive(gizmo) {
	const el = findHudGizmoEl(gizmo.id);
	if (!el) {
		return;
	}
	const api = gizmoRendererApi(gizmo.typeId);
	if (api && typeof api.paint === "function") {
		api.paint(el, gizmo);
		return;
	}
	if (gizmo.livePayload == null && gizmo.livePayloadJson) {
		try {
			gizmo.livePayload = JSON.parse(gizmo.livePayloadJson);
		} catch (e) {
			gizmo.livePayload = gizmo.livePayloadJson;
		}
	}
	paintGizmoCustom(el, gizmo);
}

function paintAllHudGizmosLive() {
	for (const z of snapshot.gizmos || []) {
		safeCall(`paintHudGizmoLive:${z && z.id != null ? z.id : "?"}`, () => {
			paintHudGizmoLive(z);
		});
	}
}

function syncGizmoHandleBounds(gizmo) {
	const el = findHudGizmoEl(gizmo.id);
	if (!el || !el.classList.contains("is-editable")) {
		return;
	}
	if (el.classList.contains("hud-gizmo-celestial")) {
		const pad = 6;
		const rotateGap = 22;
		const elRect = el.getBoundingClientRect();
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		let found = false;
		const includeRect = (rect) => {
			if (!rect || (rect.width < 0.5 && rect.height < 0.5)) {
				return;
			}
			minX = Math.min(minX, rect.left - elRect.left);
			minY = Math.min(minY, rect.top - elRect.top);
			maxX = Math.max(maxX, rect.right - elRect.left);
			maxY = Math.max(maxY, rect.bottom - elRect.top);
			found = true;
		};
		for (const child of el.children) {
			if (child.classList.contains("hud-handle") || child.hidden) {
				continue;
			}
			if (child.classList.contains("gizmo-celestial-rotor")) {
				const troughPath = child.querySelector(".gizmo-celestial-trough");
				if (troughPath) {
					includeRect(troughPath.getBoundingClientRect());
				}
				for (const cap of child.querySelectorAll(".gizmo-celestial-endcap:not([hidden])")) {
					includeRect(cap.getBoundingClientRect());
				}
				continue;
			}
			if (child.classList.contains("gizmo-celestial-hollow") && !child.hidden) {
				includeRect(child.getBoundingClientRect());
				continue;
			}
			includeRect(child.getBoundingClientRect());
		}
		if (!found) {
			el.style.removeProperty("--handle-left");
			el.style.removeProperty("--handle-top");
			el.style.removeProperty("--handle-width");
			el.style.removeProperty("--handle-height");
			el.style.removeProperty("--handle-rotate-gap");
			return;
		}
		minX -= pad;
		minY -= pad;
		maxX += pad;
		maxY += pad;
		el.style.setProperty("--handle-left", `${minX}px`);
		el.style.setProperty("--handle-top", `${minY}px`);
		el.style.setProperty("--handle-width", `${maxX - minX}px`);
		el.style.setProperty("--handle-height", `${maxY - minY}px`);
		el.style.setProperty("--handle-rotate-gap", `${rotateGap}px`);
		return;
	}
	el.style.removeProperty("--handle-left");
	el.style.removeProperty("--handle-top");
	el.style.removeProperty("--handle-width");
	el.style.removeProperty("--handle-height");
	el.style.removeProperty("--handle-rotate-gap");
	// Use layout box, not rotated AABB — getBoundingClientRect grows with --gizmo-rot.
	const w = el.clientWidth || el.offsetWidth || 0;
	const h = el.clientHeight || el.offsetHeight || 0;
	if (!w || !h) {
		return;
	}
	const pad = 6;
	el.style.setProperty("--handle-left", `${pad}px`);
	el.style.setProperty("--handle-top", `${pad}px`);
	el.style.setProperty("--handle-width", `${Math.max(1, w - pad * 2)}px`);
	el.style.setProperty("--handle-height", `${Math.max(1, h - pad * 2)}px`);
	el.style.setProperty("--handle-rotate-gap", "18px");
}

function attachGizmoHandles(el, gizmo) {
	el.classList.add("is-editable");
	const rotateHandle = document.createElement("div");
	rotateHandle.className = "hud-handle hud-handle-rotate";
	rotateHandle.addEventListener("pointerdown", (ev) => beginGizmoDrag(ev, gizmo.id, "rotate"));
	el.appendChild(rotateHandle);
	for (const mode of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
		const handle = document.createElement("div");
		handle.className = `hud-handle hud-handle-resize hud-handle-${mode}`;
		handle.addEventListener("pointerdown", (ev) => beginGizmoDrag(ev, gizmo.id, `resize-${mode}`));
		el.appendChild(handle);
	}
	el.addEventListener("pointerdown", (ev) => {
		if (ev.target.closest(".hud-handle")) {
			return;
		}
		beginGizmoDrag(ev, gizmo.id, "move");
	});
	syncGizmoHandleBounds(gizmo);
}

function syncHudGizmos(root, frontRoot, preview) {
	const keep = new Set();
	for (const gizmo of snapshot.gizmos || []) {
		safeCall(`syncHudGizmo:${gizmo && gizmo.id != null ? gizmo.id : "?"}`, () => {
			ensureGizmo(gizmo);
			const isFront =
				preview && (activeGizmoId === gizmo.id || (activeTab === "gizmos" && openGizmoId === gizmo.id));
			const visibility = normalizeGizmoVisibility(gizmo.visibility);
			// none: editor preview only; hud: with vanilla HUD; ui: also while soft-hidden (menus).
			if (visibility === "none" && !preview) {
				return;
			}
			if (visibility === "hud" && !hudVisible && !preview) {
				return;
			}
			const gizmoType = normalizeGizmoType(gizmo.typeId);
			keep.add(gizmo.id);
			const dest = isFront && frontRoot ? frontRoot : root;
			let el = findHudGizmoEl(gizmo.id, dest);
			const mode = normalizeGizmoDisplayMode(ensureGizmoSettings(gizmo).displayMode);
			const needRebuild =
				!el ||
				el.parentElement !== dest ||
				el.dataset.gizmoType !== gizmoType ||
				(gizmoType === "cog-clock" && el.dataset.gizmoMode !== mode) ||
				(gizmoType === "cog-clock" && mode === "celestial" && !el.querySelector(".gizmo-celestial-rotor"));
			if (needRebuild) {
				if (el && el.parentElement) {
					unmountGizmoCustom(el);
					el.parentElement.removeChild(el);
				}
				el = buildGizmoEl(gizmo, preview);
				dest.appendChild(el);
			} else {
				el.classList.toggle("is-front", isFront);
				el.classList.toggle("is-editable", preview);
				if (gizmoType === "cog-shout-meter") {
					layoutHudGizmoShoutMeter(el, gizmo);
					paintGizmoShoutMeter(el, gizmo);
				} else if (gizmoType === "cog-feed") {
					layoutGizmoFeed(el, gizmo);
					paintGizmoFeed(el, gizmo);
				} else if (gizmoType === "cog-clock") {
					layoutHudGizmoClock(el, gizmo);
					paintGizmoClock(el, gizmo);
					paintCelestialArc(el, gizmo);
				} else if (gizmoType === "cog-suppressor") {
					layoutHudGizmoSuppressor(el, gizmo);
					paintGizmoSuppressor(el, gizmo);
				} else {
					layoutHudGizmoCustom(el, gizmo);
					paintGizmoCustom(el, gizmo);
				}
				if (preview && !el.querySelector(".hud-handle-rotate")) {
					const fresh = buildGizmoEl(gizmo, true);
					el.replaceWith(fresh);
					el = fresh;
				}
				if (!preview) {
					for (const h of el.querySelectorAll(".hud-handle")) {
						h.remove();
					}
					el.classList.remove("is-editable");
				}
			}
			el.dataset.visibility = visibility;
			el.classList.toggle("is-front", isFront);
			el.classList.toggle("is-preview", visibility === "none");
		});
	}
	syncGizmoHandleVisibility();
	const knownIds = new Set((snapshot.gizmos || []).map((g) => g.id));
	for (const host of [root, frontRoot]) {
		if (!host) {
			continue;
		}
		for (const el of [...host.querySelectorAll(".hud-gizmo")]) {
			if (keep.has(el.dataset.id)) {
				continue;
			}
			// Leave CSS-hidden HUD gizmos mounted across brief menu/load flashes (quicksave).
			if (!hudVisible && !preview && knownIds.has(el.dataset.id)) {
				continue;
			}
			unmountGizmoCustom(el);
			el.remove();
		}
	}
	reorderHudGizmos(root);
	reorderHudGizmos(frontRoot);
}

/**
 * Keep mounted gizmos in snapshot/menu order at the end of the host
 * (after groups + gauges). Visibility remove/recreate used appendChild and
 * could stack a returning gizmo above siblings.
 */
function reorderHudGizmos(host) {
	if (!host) {
		return;
	}
	const ordered = [];
	for (const gizmo of snapshot.gizmos || []) {
		const id = gizmo && gizmo.id;
		if (!id) {
			continue;
		}
		for (const child of host.children) {
			if (child.classList && child.classList.contains("hud-gizmo") && child.dataset.id === id) {
				ordered.push(child);
				break;
			}
		}
	}
	for (const el of ordered) {
		host.appendChild(el);
	}
}

function syncGizmoHandleVisibility() {
	for (const el of document.querySelectorAll(".hud-gizmo.is-handle-active")) {
		el.classList.remove("is-handle-active");
	}
	if (!activeGizmoId) {
		return;
	}
	const el = findHudGizmoEl(activeGizmoId);
	if (el) {
		el.classList.add("is-handle-active");
	}
}

function gizmoShouldBeFront(id) {
	if (!id || !document.body.classList.contains("is-focused")) {
		return false;
	}
	return activeGizmoId === id || (activeTab === "gizmos" && openGizmoId === id);
}

function syncActiveGizmoLayer() {
	const root = document.getElementById("hud");
	const frontRoot = document.getElementById("hud-front");
	if (!root || !frontRoot) {
		return;
	}
	for (const el of [...root.querySelectorAll(".hud-gizmo"), ...frontRoot.querySelectorAll(".hud-gizmo")]) {
		const id = el.dataset.id || "";
		const wantFront = gizmoShouldBeFront(id);
		el.classList.toggle("is-front", wantFront);
		const dest = wantFront ? frontRoot : root;
		if (el.parentElement !== dest) {
			dest.appendChild(el);
		}
	}
	reorderHudGizmos(root);
	reorderHudGizmos(frontRoot);
	syncHudFrontLayer();
}

function setActiveGizmo(id) {
	const next = id || "";
	if (!next) {
		if (!activeGizmoId && !openGizmoId) {
			syncGizmoHandleVisibility();
			return;
		}
		selectEditorItem("", "");
		return;
	}
	if (activeGizmoId === next && openGizmoId === next && !openGroupId && !openGaugeId && !activeGaugeId) {
		syncActiveGizmoLayer();
		syncGizmoHandleVisibility();
		return;
	}
	selectEditorItem("gizmo", next);
}

function clearActiveGizmo() {
	setActiveGizmo("");
}

function beginGizmoDrag(ev, gizmoId, mode) {
	ev.preventDefault();
	ev.stopPropagation();
	const gizmo = gizmoFor(gizmoId);
	if (!gizmo) {
		return;
	}
	selectEditorItem("gizmo", gizmoId, { skipHud: true });
	ensureGizmo(gizmo);
	const w = window.innerWidth || 1;
	const h = window.innerHeight || 1;
	const box = gizmoLayoutBox(gizmo);
	const aabb = hudItemAabbPx(gizmo, box.w, box.h, w, h);
	drag = {
		kind: "gizmo",
		id: gizmo.id,
		mode,
		grabAabbX: ev.clientX - aabb.left,
		grabAabbY: ev.clientY - aabb.top,
		grabX: ev.clientX / w - (gizmo.display.x ?? DEFAULT_HUD_X),
		grabY: ev.clientY / h - (gizmo.display.y ?? DEFAULT_HUD_Y),
		startWidth: gizmo.display.width,
		startHeight: gizmo.display.height,
		startLayoutW: box.w,
		startLayoutH: box.h,
		startX: gizmo.display.x,
		startY: gizmo.display.y,
		pointerLocal: screenToGizmoLocal(ev.clientX, ev.clientY, gizmo)
	};
	if (ev.currentTarget && ev.pointerId != null && ev.currentTarget.setPointerCapture) {
		ev.currentTarget.setPointerCapture(ev.pointerId);
	}
}

function screenToGizmoLocal(clientX, clientY, gizmo) {
	const el = findHudGizmoEl(gizmo.id);
	let cx;
	let cy;
	if (el) {
		const rect = el.getBoundingClientRect();
		cx = rect.left + rect.width / 2;
		cy = rect.top + rect.height / 2;
	} else {
		const box = gizmoLayoutBox(gizmo);
		({ cx, cy } = hudItemCenterPx(gizmo, box.w, box.h));
	}
	const dx = clientX - cx;
	const dy = clientY - cy;
	const rad = -((Number(gizmo.display.rotation) || 0) * Math.PI) / 180;
	return {
		x: dx * Math.cos(rad) - dy * Math.sin(rad),
		y: dx * Math.sin(rad) + dy * Math.cos(rad)
	};
}

function resizeGizmoFromPointer(gizmo, ev) {
	const local = screenToGizmoLocal(ev.clientX, ev.clientY, {
		...gizmo,
		x: drag.startX,
		y: drag.startY
	});
	const axis = String(drag.mode).replace(/^resize-/, "");
	const isCelestial = normalizeGizmoDisplayMode(ensureGizmoSettings(gizmo).displayMode) === "celestial";
	const startLayoutH = isCelestial ? drag.startWidth / 2 : drag.startHeight;
	let left = -drag.startWidth / 2;
	let right = drag.startWidth / 2;
	let top = -startLayoutH / 2;
	let bottom = startLayoutH / 2;
	if (axis.includes("e")) {
		right = Math.max(left + MIN_GIZMO_WIDTH, local.x);
	}
	if (axis.includes("w")) {
		left = Math.min(right - MIN_GIZMO_WIDTH, local.x);
	}
	if (axis.includes("s")) {
		bottom = Math.max(top + (isCelestial ? startLayoutH * 0.15 : MIN_GIZMO_HEIGHT), local.y);
	}
	if (axis.includes("n")) {
		top = Math.min(bottom - (isCelestial ? startLayoutH * 0.15 : MIN_GIZMO_HEIGHT), local.y);
	}
	const newW = right - left;
	const newLayoutH = isCelestial ? newW / 2 : bottom - top;
	const midLocalX = (left + right) / 2;
	const midLocalY = (top + bottom) / 2;
	const rad = ((Number(gizmo.display.rotation) || 0) * Math.PI) / 180;
	const startAabb = rotatedAabbSize(
		drag.startLayoutW || drag.startWidth,
		drag.startLayoutH || startLayoutH,
		gizmo.display.rotation || 0
	);
	const startCx = drag.startX * (window.innerWidth || 1) + startAabb.w / 2;
	const startCy = drag.startY * (window.innerHeight || 1) + startAabb.h / 2;
	const worldDx = midLocalX * Math.cos(rad) - midLocalY * Math.sin(rad);
	const worldDy = midLocalX * Math.sin(rad) + midLocalY * Math.cos(rad);
	gizmo.display.width = Math.max(MIN_GIZMO_WIDTH, newW);
	if (isCelestial) {
		let thickness = drag.startHeight;
		if (axis.includes("n") || axis.includes("s")) {
			const boxH = Math.max(bottom - top, MIN_GIZMO_HEIGHT);
			thickness = Math.max(
				MIN_GIZMO_HEIGHT,
				Math.min(newW / 2 - 1, (boxH / Math.max(newLayoutH, 1)) * drag.startHeight)
			);
		}
		gizmo.display.height = thickness;
	} else {
		gizmo.display.height = Math.max(MIN_GIZMO_HEIGHT, newLayoutH);
	}
	const newCx = startCx + worldDx;
	const newCy = startCy + worldDy;
	const outBox = gizmoLayoutBox(gizmo);
	const outAabb = rotatedAabbSize(outBox.w, outBox.h, gizmo.display.rotation || 0);
	gizmo.display.x = (newCx - outAabb.w / 2) / (window.innerWidth || 1);
	gizmo.display.y = (newCy - outAabb.h / 2) / (window.innerHeight || 1);
	clampHudItemToScreen(gizmo, outBox.w, outBox.h);
}

function onGizmoPointerMove(ev) {
	const gizmo = gizmoFor(drag.id);
	if (!gizmo) {
		return;
	}
	ensureGizmo(gizmo);
	const w = window.innerWidth || 1;
	const h = window.innerHeight || 1;
	if (drag.mode === "move") {
		const box = gizmoLayoutBox(gizmo);
		const aabbSize = rotatedAabbSize(box.w, box.h, gizmo.display.rotation || 0);
		let left = ev.clientX - (drag.grabAabbX || 0);
		let top = ev.clientY - (drag.grabAabbY || 0);
		left = Math.min(Math.max(0, left), Math.max(0, w - aabbSize.w));
		top = Math.min(Math.max(0, top), Math.max(0, h - aabbSize.h));
		gizmo.display.x = left / w;
		gizmo.display.y = top / h;
	} else if (drag.mode === "rotate") {
		const el = findHudGizmoEl(gizmo.id);
		let sx;
		let sy;
		if (el) {
			const r = el.getBoundingClientRect();
			sx = r.left + r.width / 2;
			sy = r.top + r.height / 2;
		} else {
			const box = gizmoLayoutBox(gizmo);
			({ cx: sx, cy: sy } = hudItemCenterPx(gizmo, box.w, box.h));
		}
		gizmo.display.rotation = Math.atan2(ev.clientY - sy, ev.clientX - sx) * (180 / Math.PI);
		const box = gizmoLayoutBox(gizmo);
		clampHudItemToScreen(gizmo, box.w, box.h);
	} else if (String(drag.mode).startsWith("resize-")) {
		resizeGizmoFromPointer(gizmo, ev);
	}
	syncHudGizmo(gizmo);
}

function renderGizmos(body) {
	const intro = document.createElement("p");
	intro.className = "lede gizmos-intro";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			intro,
			"cog-gizmos-intro",
			"Gizmos are COG-only overlay widgets. Open a gizmo accordion to raise it above the editor for dragging and rotating. Up/Down reorder the list — later gizmos draw on top of earlier ones."
		);
	} else {
		intro.textContent =
			"Gizmos are COG-only overlay widgets. Open a gizmo accordion to raise it above the editor for dragging and rotating. Up/Down reorder the list — later gizmos draw on top of earlier ones.";
	}
	body.appendChild(intro);

	const layout = document.createElement("div");
	layout.className = "gizmos-layout";

	const galleryCol = document.createElement("div");
	galleryCol.className = "gizmo-gallery-col";

	const types = Array.isArray(snapshot.gizmoTypes) && snapshot.gizmoTypes.length
		? snapshot.gizmoTypes
		: [
				{ typeId: "cog-clock", displayName: "Clock", galleryIcon: "Actions/wait.svg", sourceMod: "COG" },
				{ typeId: "cog-shout-meter", displayName: "Shout Meter", galleryIcon: "Actions/shout.svg", sourceMod: "COG" },
				{ typeId: "cog-feed", displayName: "Feed", galleryIcon: "Scribe/list.svg", sourceMod: "COG" },
				{ typeId: "cog-suppressor", displayName: "Suppressor", galleryIcon: "Actions/stop.svg", sourceMod: "COG" }
			];
	const builtinTypes = [];
	const modTypes = [];
	for (const typeDef of types) {
		if (isBuiltinGizmoType(typeDef)) {
			builtinTypes.push(typeDef);
		} else {
			modTypes.push(typeDef);
		}
	}

	const appendGallerySection = (titleTag, titleFallback, typeList) => {
		const section = document.createElement("div");
		section.className = "gizmo-gallery-section";
		const lede = document.createElement("p");
		lede.className = "lede gizmo-gallery-section-lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(lede, titleTag, titleFallback);
		} else {
			lede.textContent = titleFallback;
		}
		section.appendChild(lede);
		const gallery = document.createElement("div");
		gallery.className = "gizmo-gallery";
		for (const typeDef of typeList) {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "gizmo-gallery-item";
			const icon = document.createElement("img");
			const galleryRel = typeDef.galleryIcon || "Actions/wait.svg";
			icon.src = resolveDisplayIconHref(galleryRel);
			icon.alt = "";
			bindIconImgFallback(icon);
			const label = document.createElement("span");
			const typeTitle = typeDef.displayName || typeDef.typeId || "Gizmo";
			label.textContent =
				typeof tName === "function" ? tName(typeTitle) : typeTitle;
			btn.appendChild(icon);
			btn.appendChild(label);
			btn.addEventListener("click", () => addGizmoFromType(typeDef));
			gallery.appendChild(btn);
		}
		section.appendChild(gallery);
		galleryCol.appendChild(section);
	};

	appendGallerySection("cog-gizmos-builtin", "COG Built In Gizmos", builtinTypes);
	appendGallerySection("cog-gizmos-mod-added", "Mod-added Gizmos", modTypes);

	const listCol = document.createElement("div");
	listCol.className = "gizmo-list-col";
	renderGizmosList(listCol);

	layout.appendChild(galleryCol);
	layout.appendChild(listCol);
	body.appendChild(layout);
}

function isBuiltinGizmoType(typeDef) {
	const typeId = normalizeGizmoType(typeDef?.typeId || typeDef || "");
	if (isReservedCogGizmoTypeId(typeId)) {
		return true;
	}
	const mod = String(typeDef?.sourceMod || "").trim();
	return !mod || mod === "COG";
}

function renderGizmosList(host) {
	if (!Array.isArray(snapshot.gizmos)) {
		snapshot.gizmos = [];
	}
	if (openGizmoId && !snapshot.gizmos.some((z) => z.id === openGizmoId)) {
		openGizmoId = snapshot.gizmos[0] ? snapshot.gizmos[0].id : "";
	}
	if (!snapshot.gizmos.length) {
		const empty = document.createElement("p");
		empty.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(
				empty,
				"cog-no-gizmos-yet",
				"No gizmos yet. Choose a type from the gallery on the left to add one."
			);
		} else {
			empty.textContent = "No gizmos yet. Choose a type from the gallery on the left to add one.";
		}
		host.appendChild(empty);
		return;
	}
	for (const gizmo of snapshot.gizmos) {
		ensureGizmo(gizmo);
		const details = document.createElement("details");
		details.className = "accordion gizmo-acc";
		details.dataset.gizmoId = gizmo.id;
		details.setAttribute("name", "cog-gizmos");
		details.open = openGizmoId === gizmo.id;
		details.classList.toggle("is-selected", openGizmoId === gizmo.id || activeGizmoId === gizmo.id);
		details.innerHTML = `
			<summary>
				<span class="group-title"></span>
				<input class="name-field" data-role="displayName" spellcheck="false" hidden>
				<span class="end"></span>
			</summary>
			<div class="accordion-body" data-role="gizmoBody"></div>`;
		const title = details.querySelector(".group-title");
		const nameInput = details.querySelector('[data-role="displayName"]');
		const gizmoTitle = () => gizmoDisplayName(gizmo) || "Clock";
		title.textContent = gizmoTitle();
		nameInput.value = gizmoTitle();
		const end = details.querySelector(".end");
		const edit = document.createElement("button");
		edit.type = "button";
		edit.className = "tiny";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(edit, "cog-edit", "Edit");
		} else {
			edit.textContent = "Edit";
		}
		end.appendChild(edit);
		const finishRename = (save) => {
			if (!details.classList.contains("is-renaming")) {
				return;
			}
			details.classList.remove("is-renaming");
			restoreRenameField(nameInput);
			nameInput.hidden = true;
			title.hidden = false;
			if (save) {
				const next = nameInput.value.trim() || gizmoTitle();
				patchGizmo(gizmo.id, { displayName: next });
				const refreshed = gizmoFor(gizmo.id);
				title.textContent = refreshed ? gizmoDisplayName(refreshed) || next : next;
			} else {
				nameInput.value = gizmoTitle();
			}
		};
		edit.addEventListener("click", () => {
			selectEditorItem("gizmo", gizmo.id);
			details.classList.add("is-renaming");
			title.hidden = true;
			nameInput.hidden = false;
			nameInput.value = gizmoTitle();
			parkRenameFieldForEdit(details, nameInput);
			nameInput.focus();
			nameInput.select();
		});
		bindAccordionRenameKeys(nameInput, finishRename);
		stopHeaderToggle(edit);
		nameInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
		nameInput.addEventListener("click", (ev) => ev.stopPropagation());

		const gizmoIndex = snapshot.gizmos.findIndex((z) => z.id === gizmo.id);
		appendStackOrderButtons(end, {
			upDisabled: gizmoIndex <= 0,
			downDisabled: gizmoIndex < 0 || gizmoIndex >= snapshot.gizmos.length - 1,
			onUp: () => moveGizmoInList(gizmo.id, -1),
			onDown: () => moveGizmoInList(gizmo.id, 1)
		});

		const del = document.createElement("button");
		del.type = "button";
		del.className = "remove";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(del, "cog-delete", "Delete");
		} else {
			del.textContent = "Delete";
		}
		del.addEventListener("click", () => removeGizmo(gizmo.id));
		end.appendChild(del);
		stopHeaderToggle(del);

		fillGizmoEditor(details.querySelector('[data-role="gizmoBody"]'), gizmo);
		bindExclusiveGizmo(details);
		host.appendChild(details);
	}
	enhanceSelects(host);
}

function bindExclusiveGizmo(details) {
	details.addEventListener("toggle", () => {
		if (selectionSyncLock) {
			return;
		}
		if (!details.open) {
			if (details.classList.contains("is-renaming")) {
				details.open = true;
				return;
			}
			if (openGizmoId === details.dataset.gizmoId || activeGizmoId === details.dataset.gizmoId) {
				selectEditorItem("", "");
			}
			return;
		}
		selectEditorItem("gizmo", details.dataset.gizmoId || "");
	});
}

function fillGizmoEditor(panel, gizmo) {
	ensureGizmo(gizmo);
	const api = gizmoRendererApi(gizmo.typeId);
	if (api && typeof api.fillEditor === "function") {
		api.fillEditor(panel, gizmo);
	} else {
		fillSchemaGizmoEditor(panel, gizmo);
	}
	appendGizmoPositionSizeEditor(panel, gizmo);
}

