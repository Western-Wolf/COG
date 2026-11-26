// COG overlay - Core (snapshot, bridges, HUD utilities, boot)
// Classic script; loads last after all section scripts.

// var (not let): _UI_Translation.js and other classic scripts read window.snapshot.
var snapshot = { version: "", sources: [], shoutMeter: null, general: { showDefaultGroup: true, editorKey: "F3", hideToggleKey: "", hideIncludesFlash: true, uiHidden: false, fillColor: "#c4a35a", borderColor: "#e8d2a0", iconColor: "#ffffff", gadgetFont: "Roboto", language: "en-CA", highlightMissingTranslations: false, updateStockTitlesOnTranslation: false }, groups: [], gears: [], gauges: [], gizmos: [], gizmoTypes: [], icons: [], importedIcons: [], fonts: [], suppressions: [], languages: ["en-CA"], translations: {}, gizmoTranslations: {} };
let saveTimer = null;
let activeTab = "general";
let drag = null;
/** Keeps gauge + clock auto font sizing aligned (slightly under half / prior baselines). */
const AUTO_FONT_SIZE_SCALE = 0.95;
const DEFAULT_HUD_X = 0.1;
const DEFAULT_HUD_Y = 0.1;
const DEFAULT_BORDER_THICKNESS_PCT = 10;
/** Frame gauge rim — was 5%; scaled with endcap knot thinning (~⅔). */
const DEFAULT_FRAME_BORDER_THICKNESS_PCT = 3;
let saveQueued = false;
let ignoreLayoutUntil = 0;
let hudVisible = true;
const HUD_FADE_MS = 250;
const hudShownAt = new Map();
const hudHideUntil = new Map();
let hudPreviewMode = false;
let layoutHydrated = false;

window.setFocused = (focused) => {
	document.body.classList.toggle("is-focused", !!focused);
	if (!focused) {
		closeAllEditorPopups();
		drag = null;
		flushSave();
	}
	renderGears();
	renderEditor(true);
};

function mergeTranslationCatalogs(incoming) {
	if (!incoming || typeof incoming !== "object") {
		return false;
	}
	let changed = false;
	if (Array.isArray(incoming.languages)) {
		snapshot.languages = incoming.languages;
		changed = true;
	}
	if (incoming.translations && typeof incoming.translations === "object") {
		snapshot.translations = incoming.translations;
		changed = true;
	}
	if (incoming.gizmoTranslations && typeof incoming.gizmoTranslations === "object") {
		snapshot.gizmoTranslations = incoming.gizmoTranslations;
		changed = true;
	}
	return changed;
}

function syncCogVersionBadge() {
	const badge = document.getElementById("cog-version-badge");
	if (!badge) {
		return;
	}
	const version = String((snapshot && snapshot.version) || "").trim().replace(/^v/i, "");
	if (!version) {
		badge.textContent = "";
		badge.hidden = true;
		badge.setAttribute("aria-hidden", "true");
		badge.removeAttribute("title");
		return;
	}
	// Leading space + "v" so the superscript reads as " v1.20" next to the title.
	badge.textContent = ` v${version}`;
	badge.hidden = false;
	badge.removeAttribute("aria-hidden");
	badge.title = `COG v${version}`;
}

function refreshAfterTranslationCatalogs() {
	if (typeof syncDocumentLang === "function") {
		syncDocumentLang();
	}
	if (drag) {
		return;
	}
	// Stock gear/gauge titles resolve from the catalog — rebuild HUD labels.
	if (typeof renderGears === "function") {
		renderGears();
	}
	// Rebuild General so the language <select> picks up new locale codes.
	if (activeTab === "general" && !helpMode) {
		renderEditor(true);
		return;
	}
	if (typeof applyTranslations === "function") {
		applyTranslations(document.getElementById("editor-panel") || document);
	}
}

/** Dedicated Interop for languages + catalogs (not bundled into applySnapshot). */
window.applyTranslationCatalogs = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		if (!mergeTranslationCatalogs(incoming)) {
			return;
		}
		normalizeSnapshot();
		refreshAfterTranslationCatalogs();
	} catch (e) {
		window.cogReportError("applyTranslationCatalogs", e);
	}
};

/** Stable signature so Sources UI can skip rebuilds when catalog content is unchanged. */
function feedSourceCatalogSignature(list) {
	if (!Array.isArray(list) || !list.length) {
		return "";
	}
	return list
		.map((e) => {
			if (!e || !e.id) {
				return "";
			}
			const html = e.settingsHtml != null ? String(e.settingsHtml) : "";
			return `${e.id}\n${e.displayName || ""}\n${html.length}\n${html}`;
		})
		.join("\x1e");
}

/** Feed source modules + settings HTML (not bundled into applySnapshot — Interop size). */
window.applyFeedSourceCatalog = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		if (!Array.isArray(incoming)) {
			return;
		}
		const prev = Array.isArray(snapshot.feedSources) ? snapshot.feedSources : [];
		const merged =
			typeof mergeFeedSourcesPreserveSettingsHtml === "function"
				? mergeFeedSourcesPreserveSettingsHtml(incoming, prev)
				: incoming;
		const prevSig = feedSourceCatalogSignature(prev);
		const nextSig = feedSourceCatalogSignature(merged);
		snapshot.feedSources = merged;
		window.CogFeedSourceCatalog = snapshot.feedSources;
		if (prevSig === nextSig) {
			return;
		}
		// New catalog entries → add missing sources.<id> blocks only (not a full flat remap).
		if (typeof ensureFeedSourceBlocksForAllGizmos === "function") {
			ensureFeedSourceBlocksForAllGizmos();
		}
		try {
			window.dispatchEvent(new CustomEvent("cog-feed-source-catalog"));
		} catch (e2) {
			/* ignore */
		}
	} catch (e) {
		window.cogReportError("applyFeedSourceCatalog", e);
	}
};

window.applySnapshot = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		if (!incoming || typeof incoming !== "object") {
			return;
		}
		if (!Array.isArray(incoming.sources)) {
			incoming.sources = [];
		}
		const prevEditor = currentEditorKey();
		const holdLayout = !!(
			drag ||
			saveQueued ||
			saveTimer ||
			isEditingField() ||
			iconPickerState ||
			colorPickerState ||
			(typeof editorPopupRegistry !== "undefined" && editorPopupRegistry.size > 0) ||
			rebindListening ||
			Date.now() < ignoreLayoutUntil
		);
		if (holdLayout && snapshot.groups && snapshot.groups.length) {
			snapshot.sources = incoming.sources;
			if (Array.isArray(incoming.icons)) {
				snapshot.icons = incoming.icons;
				if (typeof rebuildIconRootMap === "function") {
					rebuildIconRootMap();
				}
				// Migration Code for Transition from v1.11 or earlier to v1.2 (one-shot).
				if (typeof migrateLegacyIconPathsInSnapshot === "function") {
					migrateLegacyIconPathsInSnapshot();
				} else if (typeof migratePictureIconPathsInSnapshot === "function") {
					migratePictureIconPathsInSnapshot();
				}
				if (typeof migrateVisibility12InSnapshot === "function") {
					migrateVisibility12InSnapshot();
				}
			}
			if (Array.isArray(incoming.fonts)) {
				snapshot.fonts = incoming.fonts;
			}
			if (incoming.shoutMeter != null) {
				snapshot.shoutMeter = incoming.shoutMeter;
			}
			if (incoming.gameTime != null) {
				snapshot.gameTime = incoming.gameTime;
			}
			if (Array.isArray(incoming.gizmoTypes)) {
				snapshot.gizmoTypes =
					typeof mergeGizmoTypesPreserveSettingsHtml === "function"
						? mergeGizmoTypesPreserveSettingsHtml(incoming.gizmoTypes, snapshot.gizmoTypes)
						: incoming.gizmoTypes;
				ensureGizmoViewScripts();
			}
			if (Array.isArray(incoming.feedSources)) {
				snapshot.feedSources =
					typeof mergeFeedSourcesPreserveSettingsHtml === "function"
						? mergeFeedSourcesPreserveSettingsHtml(incoming.feedSources, snapshot.feedSources)
						: incoming.feedSources;
				window.CogFeedSourceCatalog = snapshot.feedSources;
			}
			if (Array.isArray(incoming.suppressions)) {
				snapshot.suppressions = incoming.suppressions;
			}
			if (Array.isArray(incoming.suppressionAliases)) {
				snapshot.suppressionAliases = incoming.suppressionAliases;
			}
			mergeTranslationCatalogs(incoming);
			if (incoming.general && typeof incoming.general === "object") {
				if (incoming.general.language != null) {
					snapshot.general.language = incoming.general.language;
				}
				if (typeof incoming.general.highlightMissingTranslations === "boolean") {
					snapshot.general.highlightMissingTranslations = incoming.general.highlightMissingTranslations;
				}
				if (typeof incoming.general.updateStockTitlesOnTranslation === "boolean") {
					snapshot.general.updateStockTitlesOnTranslation =
						incoming.general.updateStockTitlesOnTranslation;
				}
			}
			if (Array.isArray(incoming.gizmos) && Array.isArray(snapshot.gizmos)) {
				const byId = new Map(incoming.gizmos.map((z) => [z.id, z]));
				for (const z of snapshot.gizmos) {
					const inc = byId.get(z.id);
					if (!inc) {
						continue;
					}
					if (Object.prototype.hasOwnProperty.call(inc, "livePayload")) {
						z.livePayload = inc.livePayload;
					}
					if (Object.prototype.hasOwnProperty.call(inc, "livePayloadJson")) {
						z.livePayloadJson = inc.livePayloadJson;
					}
				}
			}
			paintAllHudGizmosLive();
			if (!drag) {
				renderGears();
			}
			refreshCategorySelects();
			if (activeTab === "gears") {
				fillEditGearPicker();
			}
			if (helpMode && helpSubTab === "suppressions" && typeof refreshSuppressionsTable === "function") {
				refreshSuppressionsTable();
			}
			return;
		}
		const prevKey = snapshot.general && snapshot.general.editorKey;
		const prevIcons = snapshot.icons;
		const prevImportedIcons = snapshot.importedIcons;
		const prevFonts = snapshot.fonts;
		const prevGears = snapshot.gears;
		const prevGroups = snapshot.groups;
		const prevGauges = snapshot.gauges;
		const prevGizmos = snapshot.gizmos;
		const prevGizmoTypes = snapshot.gizmoTypes;
		const prevFeedSources = snapshot.feedSources;
		const prevLanguages = snapshot.languages;
		const prevTranslations = snapshot.translations;
		const prevGizmoTranslations = snapshot.gizmoTranslations;
		const prevVersion = snapshot.version;
		snapshot = incoming;
		if (!incoming.version) {
			snapshot.version = prevVersion;
		}
		// Catalog may be omitted on lean ticks — keep last in-memory icons/fonts.
		if (!Array.isArray(incoming.icons)) {
			snapshot.icons = prevIcons;
		}
		if (!Array.isArray(incoming.importedIcons)) {
			snapshot.importedIcons = prevImportedIcons;
		}
		if (!Array.isArray(incoming.fonts)) {
			snapshot.fonts = prevFonts;
		}
		// settingsHtml is catalog-only — preserve last body when lean PushToUi omits it.
		if (Array.isArray(incoming.gizmoTypes) && typeof mergeGizmoTypesPreserveSettingsHtml === "function") {
			snapshot.gizmoTypes = mergeGizmoTypesPreserveSettingsHtml(incoming.gizmoTypes, prevGizmoTypes);
		}
		// Feed source catalog HTML arrives via applyFeedSourceCatalog — preserve if omitted/lean.
		if (Array.isArray(incoming.feedSources) && typeof mergeFeedSourcesPreserveSettingsHtml === "function") {
			snapshot.feedSources = mergeFeedSourcesPreserveSettingsHtml(incoming.feedSources, prevFeedSources);
		} else if (!Array.isArray(incoming.feedSources)) {
			snapshot.feedSources = prevFeedSources;
		}
		if (Array.isArray(snapshot.feedSources)) {
			window.CogFeedSourceCatalog = snapshot.feedSources;
		}
		if (!Array.isArray(incoming.languages)) {
			snapshot.languages = prevLanguages;
		}
		if (!incoming.translations || typeof incoming.translations !== "object") {
			snapshot.translations = prevTranslations;
		}
		if (!incoming.gizmoTranslations || typeof incoming.gizmoTranslations !== "object") {
			snapshot.gizmoTranslations = prevGizmoTranslations;
		}
		// Never replace a populated layout with an empty/missing entity list (partial snapshot).
		if (!Array.isArray(incoming.gears) || (incoming.gears.length === 0 && Array.isArray(prevGears) && prevGears.length)) {
			snapshot.gears = prevGears;
		}
		if (!Array.isArray(incoming.groups) || (incoming.groups.length === 0 && Array.isArray(prevGroups) && prevGroups.length)) {
			snapshot.groups = prevGroups;
		}
		if (!Array.isArray(incoming.gauges) || (incoming.gauges.length === 0 && Array.isArray(prevGauges) && prevGauges.length)) {
			snapshot.gauges = prevGauges;
		}
		if (!Array.isArray(incoming.gizmos) || (incoming.gizmos.length === 0 && Array.isArray(prevGizmos) && prevGizmos.length)) {
			snapshot.gizmos = prevGizmos;
		}
		normalizeSnapshot();
		// State echo can still be flat while the UI already holds nested sources.* — keep them.
		mergePreservedFeedGizmoSources(prevGizmos, snapshot.gizmos);
		syncCogVersionBadge();
		if (rebindListening && snapshot.general.editorKey && snapshot.general.editorKey !== prevKey) {
			rebindListening = false;
		}
		applyTheme();
		layoutHydrated = true;
		if (typeof syncDocumentLang === "function") {
			syncDocumentLang();
		}
		if (!drag) {
			renderGears();
			if (currentEditorKey() !== prevEditor) {
				renderEditor(false);
			} else if (typeof applyTranslations === "function") {
				applyTranslations(document.getElementById("editor-panel") || document);
			}
		}
	} catch (e) {
		window.cogReportError("applySnapshot", e);
	}
};

window.applyLivePercent = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		applyLivePercentToHud(incoming);
	} catch (e) {
		window.cogReportError("applyLivePercent", e);
	}
};

/** Lean tick channel — sources/timers/counts, gameTime, shout, gizmo livePayload; no layout rebuild. */
window.applyLivePatch = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		if (!incoming || typeof incoming !== "object") {
			return;
		}
		if (Array.isArray(incoming.sources)) {
			snapshot.sources = incoming.sources;
		}
		if (incoming.gameTime != null) {
			snapshot.gameTime = incoming.gameTime;
		}
		if (incoming.shoutMeter != null) {
			snapshot.shoutMeter = incoming.shoutMeter;
		}
		if (Array.isArray(incoming.gizmos) && Array.isArray(snapshot.gizmos)) {
			const byId = new Map(incoming.gizmos.map((z) => [z.id, z]));
			for (const z of snapshot.gizmos) {
				const inc = byId.get(z.id);
				if (!inc) {
					continue;
				}
				if (Object.prototype.hasOwnProperty.call(inc, "livePayload")) {
					z.livePayload = inc.livePayload;
				}
				if (Object.prototype.hasOwnProperty.call(inc, "livePayloadJson")) {
					z.livePayloadJson = inc.livePayloadJson;
				}
			}
		}
		if (typeof applyLivePatchToHud === "function") {
			applyLivePatchToHud();
		} else {
			paintAllHudGizmosLive();
			if (!drag) {
				renderGears();
			}
		}
	} catch (e) {
		window.cogReportError("applyLivePatch", e);
	}
};

window.setHudVisible = (visible) => {
	const on = visible === true || visible === "true" || visible === 1 || visible === "1";
	if (hudVisible === on) {
		return;
	}
	hudVisible = on;
	document.body.classList.toggle("hud-hidden", !on);
	if (!drag) {
		renderGears();
	}
};

window.setUiHidden = (hidden) => {
	const on = hidden === true || hidden === "true" || hidden === 1 || hidden === "1";
	if (!snapshot.general) {
		snapshot.general = {};
	}
	if (!!snapshot.general.uiHidden === on) {
		document.body.classList.toggle("ui-hidden", on);
		return;
	}
	snapshot.general.uiHidden = on;
	document.body.classList.toggle("ui-hidden", on);
};

window.cogToSKSE = window.cogToSKSE || function () {};

/** Forward view errors into COG.log via the SKSE bridge (also keeps console.error). */
window.cogReportError = function cogReportError(where, err) {
	console.error(where, err);
	try {
		const detail = err && err.message ? err.message : String(err);
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE("jsError:" + where + ": " + detail);
		}
	} catch (_) {
		/* ignore bridge failures */
	}
};

/** Config strip/migration notes → console + COG.log (jsConfig:). */
window.cogConfigNote = function cogConfigNote(message) {
	const text = String(message || "");
	if (!text) {
		return;
	}
	console.info("COG config:", text);
	try {
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE("jsConfig:" + text);
		}
	} catch (_) {
		/* ignore bridge failures */
	}
};

function cogConfigNote(message) {
	if (typeof window.cogConfigNote === "function") {
		window.cogConfigNote(message);
	}
}

function normalizeSnapshot() {
	if (!snapshot.general) {
		snapshot.general = {};
	}
	if (typeof snapshot.general.showDefaultGroup !== "boolean") {
		snapshot.general.showDefaultGroup = true;
	}
	snapshot.general.editorKey = snapshot.general.editorKey || "F3";
	if (typeof snapshot.general.hideToggleKey !== "string") {
		snapshot.general.hideToggleKey = "";
	}
	if (typeof snapshot.general.hideIncludesFlash !== "boolean") {
		snapshot.general.hideIncludesFlash = true;
	}
	snapshot.general.uiHidden = !!snapshot.general.uiHidden;
	document.body.classList.toggle("ui-hidden", !!snapshot.general.uiHidden);
	snapshot.general.fillColor = optionalHex(snapshot.general.fillColor);
	snapshot.general.borderColor = optionalHex(snapshot.general.borderColor);
	{
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Older general.iconStartColor / iconEndColor migrate to general.iconColor (prefer start).
		let icon = optionalHex(snapshot.general.iconColor);
		if (!icon) {
			icon = optionalHex(snapshot.general.iconStartColor);
		}
		if (!icon) {
			icon = optionalHex(snapshot.general.iconEndColor);
		}
		snapshot.general.iconColor = icon || (typeof defaultIconColor === "function" ? defaultIconColor() : "#ffffff");
		delete snapshot.general.iconStartColor;
		delete snapshot.general.iconEndColor;
	}
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Neutral icon colour removed — counts sample iconColor ramps.
	if (Object.prototype.hasOwnProperty.call(snapshot.general, "neutralIconMode")) {
		delete snapshot.general.neutralIconMode;
		noteMigration("general drop neutralIconMode");
	}
	if (!Array.isArray(snapshot.fonts)) {
		snapshot.fonts = [];
	}
	snapshot.general.gadgetFont = normalizeGadgetFont(snapshot.general.gadgetFont);
	if (!snapshot.general.language || !String(snapshot.general.language).trim()) {
		snapshot.general.language = typeof COG_FALLBACK_LANG !== "undefined" ? COG_FALLBACK_LANG : "en-CA";
	}
	if (typeof snapshot.general.highlightMissingTranslations !== "boolean") {
		snapshot.general.highlightMissingTranslations = false;
	}
	if (typeof snapshot.general.updateStockTitlesOnTranslation !== "boolean") {
		snapshot.general.updateStockTitlesOnTranslation = false;
	}
	if (!Array.isArray(snapshot.languages)) {
		snapshot.languages = [];
	}
	if (!snapshot.translations || typeof snapshot.translations !== "object") {
		snapshot.translations = {};
	}
	if (!snapshot.gizmoTranslations || typeof snapshot.gizmoTranslations !== "object") {
		snapshot.gizmoTranslations = {};
	}
	if (!Array.isArray(snapshot.groups)) {
		snapshot.groups = [];
	}
	if (!Array.isArray(snapshot.gears)) {
		snapshot.gears = [];
	}
	if (!Array.isArray(snapshot.gauges)) {
		snapshot.gauges = [];
	}
	if (!Array.isArray(snapshot.gizmos)) {
		snapshot.gizmos = [];
	}
	if (!Array.isArray(snapshot.gizmoTypes)) {
		snapshot.gizmoTypes = [];
	}
	if (!Array.isArray(snapshot.feedSources)) {
		snapshot.feedSources = [];
	}
	window.CogFeedSourceCatalog = snapshot.feedSources;
	if (!Array.isArray(snapshot.suppressions)) {
		snapshot.suppressions = [];
	}
	if (!Array.isArray(snapshot.suppressionAliases)) {
		snapshot.suppressionAliases = [];
	}
	if (!Array.isArray(snapshot.icons)) {
		snapshot.icons = [];
	}
	if (!Array.isArray(snapshot.importedIcons)) {
		snapshot.importedIcons = [];
	}
	if (typeof rebuildIconRootMap === "function") {
		rebuildIconRootMap();
	}
	// Migration Code for Transition from v1.11 or earlier to v1.2 (one-shot):
	// Artwork undo, Quest Art → Endcaps, flat Endcaps → Shapes/Knots — before ensure*.
	if (typeof migrateLegacyIconPathsInSnapshot === "function") {
		migrateLegacyIconPathsInSnapshot();
	} else if (typeof migratePictureIconPathsInSnapshot === "function") {
		migratePictureIconPathsInSnapshot();
	}
	// Visibility none→"" / ui→"hud, menu" — before ensure* coalesce.
	if (typeof migrateVisibility12InSnapshot === "function") {
		migrateVisibility12InSnapshot();
	}
	for (const g of snapshot.gauges) {
		ensureGauge(g);
	}
	ensureGizmoViewScripts();
	for (const z of snapshot.gizmos) {
		if (z && z.livePayload != null && z.livePayloadJson == null) {
			try {
				z.livePayloadJson = typeof z.livePayload === "string" ? z.livePayload : JSON.stringify(z.livePayload);
			} catch (e) {
				/* ignore */
			}
		}
		ensureGizmo(z);
	}
	for (const src of snapshot.sources || []) {
		if (!src || typeof src !== "object") {
			continue;
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy live source identity keys "mod"/"name" become sourceMod/varName.
		if (!String(src.sourceMod || "").trim() && String(src.mod || "").trim()) {
			src.sourceMod = String(src.mod).trim();
		}
		if (!String(src.varName || "").trim() && String(src.name || "").trim()) {
			src.varName = String(src.name).trim();
		}
		delete src.mod;
		delete src.name;
		if (src.icon) {
			src.icon =
				(typeof normalizeIconRampValue === "function" ? normalizeIconRampValue(src.icon) : "") ||
				normalizeIconRelPath(src.icon);
		}
	}
	preloadEndCapAspects();
	normalizeGearsSnapshot();
	normalizeGroupsSnapshot();
}

function cssAttr(value) {
	return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sourceFor(sourceMod, varName) {
	const m = String(sourceMod || "");
	const n = String(varName || "");
	return (snapshot.sources || []).find(
		(s) =>
			String(s.sourceMod || s.mod || "").toLowerCase() === m.toLowerCase() &&
			String(s.varName || s.name || "").toLowerCase() === n.toLowerCase()
	);
}

/** Editor percentage fields: display + store snap (X/Y, alpha, thickness, opacity, …). */
const PCT_DECIMALS = 3;

function fmtPct(n) {
	return fmtDec(n, PCT_DECIMALS);
}

function quantizePct(n) {
	return quantizeDec(n, PCT_DECIMALS);
}

/** Fixed-decimal display for editor floats (kills float32 noise like 1.299999952). */
function fmtDec(n, digits = 3) {
	const d = Math.max(0, Math.min(10, Number(digits) || 0));
	const v = Number(n);
	return (Number.isFinite(v) ? v : 0).toFixed(d);
}

/** Snap a number to `digits` decimal places before store / apply. */
function quantizeDec(n, digits = 3) {
	const d = Math.max(0, Math.min(10, Number(digits) || 0));
	const f = 10 ** d;
	const v = Number(n);
	if (!Number.isFinite(v)) {
		return 0;
	}
	return Math.round(v * f) / f;
}


function clampPct(n, min, max) {
	const v = Number(n);
	if (!Number.isFinite(v)) {
		return min;
	}
	return Math.max(min, Math.min(max, v));
}

/** Axis-aligned size of a w×h box after rotation about its center. */
function rotatedAabbSize(boxW, boxH, rotDeg) {
	const rad = ((Number(rotDeg) || 0) * Math.PI) / 180;
	const c = Math.abs(Math.cos(rad));
	const s = Math.abs(Math.sin(rad));
	const w = Math.max(0, Number(boxW) || 0);
	const h = Math.max(0, Number(boxH) || 0);
	return { w: w * c + h * s, h: w * s + h * c };
}

/**
 * Ensure entity.display exists and return it.
 * Call ensureGroup / ensureGauge / ensureGizmo first when migrating legacy flat keys.
 */
function entityDisplay(e) {
	if (!e || typeof e !== "object") {
		return null;
	}
	if (!e.display || typeof e.display !== "object" || Array.isArray(e.display)) {
		e.display = {};
	}
	return e.display;
}

/** Cap opacity fraction 0..1 from display.maxAlpha (0–100%, default 100). */
function maxAlphaFrac(entity) {
	const d = entity && entity.display;
	const raw = d && d.maxAlpha != null ? Number(d.maxAlpha) : 100;
	const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 100;
	return pct / 100;
}

/** actualAlpha = relativeAlpha (0..1) × maxAlpha. */
function effectiveAlpha(relativeAlpha, entity) {
	const a = Math.max(0, Math.min(1, Number(relativeAlpha) || 0));
	return a * maxAlphaFrac(entity);
}

/**
 * Set --cog-max-alpha on a HUD host (groups/gauges/gizmos).
 * CSS uses it for host content (1 × maxAlpha / 0.55 × maxAlpha); JS multiplies the same way per-element.
 */
function applyHostMaxAlpha(el, entity) {
	if (!el) {
		return;
	}
	el.style.setProperty("--cog-max-alpha", String(maxAlphaFrac(entity)));
}

const ENTITY_DISPLAY_FLAT_KEYS = ["x", "y", "rotation", "width", "height", "posAnchor"];

function entityHasLegacyFlatDisplay(entity) {
	if (!entity || typeof entity !== "object") {
		return false;
	}
	return ENTITY_DISPLAY_FLAT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(entity, k));
}

/** True when nested display already has the numeric fields ensure* needs. */
function entityDisplayShapeOk(display, sized) {
	if (!display || typeof display !== "object" || Array.isArray(display)) {
		return false;
	}
	if (
		!Number.isFinite(Number(display.x)) ||
		!Number.isFinite(Number(display.y)) ||
		!Number.isFinite(Number(display.rotation))
	) {
		return false;
	}
	if (sized) {
		if (!Number.isFinite(Number(display.width)) || !Number.isFinite(Number(display.height))) {
			return false;
		}
	}
	return true;
}

/**
 * Migration Code for Transition from v1.01 or earlier to v1.1 (one-shot remap):
 * Legacy flat placement keys → nested display; drop posAnchor.
 * Hot path early-outs when already nested with no flat keys and required fields present.
 *
 * @param {object} entity
 * @param {{ x?: number, y?: number, rotation?: number, width?: number, height?: number, maxAlpha?: number, minW?: number, minH?: number, sized?: boolean }} defaults
 */
function migrateEntityDisplay(entity, defaults = {}) {
	if (!entity || typeof entity !== "object") {
		return null;
	}
	const sized = !!defaults.sized;
	const hadNested =
		entity.display && typeof entity.display === "object" && !Array.isArray(entity.display);
	const hadFlat = entityHasLegacyFlatDisplay(entity);

	// Hot path: already on nested scheme with usable fields — drop rare leftover posAnchor only.
	if (hadNested && !hadFlat && entityDisplayShapeOk(entity.display, sized)) {
		if (Object.prototype.hasOwnProperty.call(entity.display, "posAnchor")) {
			noteMigrationIf(true, `${entity.id || entity.typeId || "?"} ignored legacy posAnchor`);
			delete entity.display.posAnchor;
		}
		return entity.display;
	}

	const bag = hadNested ? { ...entity.display } : {};
	const label = entity.id || entity.typeId || "?";
	noteMigrationIf(!hadNested && hadFlat, `${label} flat placement → nested display`);
	noteMigrationIf(
		Object.prototype.hasOwnProperty.call(entity, "posAnchor") ||
			Object.prototype.hasOwnProperty.call(bag, "posAnchor"),
		`${label} ignored legacy posAnchor`
	);
	const knownDisplay = sized
		? ["x", "y", "rotation", "width", "height", "maxAlpha"]
		: ["x", "y", "rotation", "maxAlpha"];
	stripUnknownKeys(bag, knownDisplay, "display", { id: label, legacySet: ["posAnchor"] });
	const pick = (key, fallback) => {
		if (Number.isFinite(Number(bag[key]))) {
			return Number(bag[key]);
		}
		if (Number.isFinite(Number(entity[key]))) {
			return Number(entity[key]);
		}
		return fallback;
	};
	const display = {
		x: pick("x", defaults.x ?? DEFAULT_HUD_X),
		y: pick("y", defaults.y ?? DEFAULT_HUD_Y),
		rotation: pick("rotation", defaults.rotation ?? 0),
		maxAlpha: quantizePct(Math.max(0, Math.min(100, pick("maxAlpha", defaults.maxAlpha ?? 100))))
	};
	if (sized) {
		const minW = defaults.minW ?? 0;
		const minH = defaults.minH ?? 0;
		display.width = Math.max(minW, pick("width", defaults.width ?? 0));
		display.height = Math.max(minH, pick("height", defaults.height ?? 0));
	}
	entity.display = display;
	delete entity.x;
	delete entity.y;
	delete entity.rotation;
	delete entity.width;
	delete entity.height;
	delete entity.posAnchor;
	return display;
}

/**
 * CSS left/top are the unrotated layout box; with transform-origin 50% 50%, the visual
 * footprint is a larger AABB when rotated.
 *
 * Persisted gizmo/gauge display.x/y are visual AABB top-left fractions.
 * Groups still use layout CSS fractions. Helpers convert AABB ↔ layout for paint/drag.
 */
function hudItemAabbPx(item, boxW, boxH, screenW, screenH) {
	const sw = screenW || window.innerWidth || 1;
	const sh = screenH || window.innerHeight || 1;
	const pos = entityDisplay(item) || {};
	const left = (pos.x ?? DEFAULT_HUD_X) * sw;
	const top = (pos.y ?? DEFAULT_HUD_Y) * sh;
	const aabb = rotatedAabbSize(boxW, boxH, pos.rotation || 0);
	return { left, top, w: aabb.w, h: aabb.h, cx: left + aabb.w / 2, cy: top + aabb.h / 2 };
}

function hudItemLayoutFromAabbLeftTop(left, top, boxW, boxH, rotDeg, screenW, screenH) {
	const sw = screenW || window.innerWidth || 1;
	const sh = screenH || window.innerHeight || 1;
	const aabb = rotatedAabbSize(boxW, boxH, rotDeg);
	const cx = left + aabb.w / 2;
	const cy = top + aabb.h / 2;
	return {
		x: (cx - boxW / 2) / sw,
		y: (cy - boxH / 2) / sh
	};
}

/** CSS left/top fractions for an AABB-space item. */
function hudItemLayoutCss(item, boxW, boxH) {
	const sw = window.innerWidth || 1;
	const sh = window.innerHeight || 1;
	const pos = entityDisplay(item) || {};
	return hudItemLayoutFromAabbLeftTop(
		(pos.x ?? DEFAULT_HUD_X) * sw,
		(pos.y ?? DEFAULT_HUD_Y) * sh,
		boxW,
		boxH,
		pos.rotation || 0,
		sw,
		sh
	);
}

/** Editor X/Y % = persisted AABB top-left on screen. */
function hudItemEditorPosPct(item, boxW, boxH) {
	const pos = entityDisplay(item) || {};
	return {
		x: (pos.x ?? DEFAULT_HUD_X) * 100,
		y: (pos.y ?? DEFAULT_HUD_Y) * 100
	};
}

function applyHudItemEditorPosPct(item, boxW, boxH, xPct, yPct) {
	const pos = entityDisplay(item);
	pos.x = clampPct(Number(xPct), 0, 100) / 100;
	pos.y = clampPct(Number(yPct), 0, 100) / 100;
	clampHudItemToScreen(item, boxW, boxH);
}

/** Compute editor AABB X/Y without mutating the live item (so patch* can detect the change). */
function hudItemEditorPosPatch(item, boxW, boxH, xPct, yPct) {
	const src = entityDisplay(item) || {};
	const probe = {
		display: {
			x: src.x,
			y: src.y,
			rotation: src.rotation,
			maxAlpha: src.maxAlpha
		}
	};
	applyHudItemEditorPosPct(probe, boxW, boxH, xPct, yPct);
	return { display: { x: probe.display.x, y: probe.display.y } };
}

/** Keep the rotated visual footprint on-screen (allows negative layout CSS when rotated). */
function clampHudItemToScreen(item, boxW, boxH) {
	const sw = window.innerWidth || 1;
	const sh = window.innerHeight || 1;
	const aabb = hudItemAabbPx(item, boxW, boxH, sw, sh);
	const left = Math.min(Math.max(0, aabb.left), Math.max(0, sw - aabb.w));
	const top = Math.min(Math.max(0, aabb.top), Math.max(0, sh - aabb.h));
	const pos = entityDisplay(item);
	pos.x = left / sw;
	pos.y = top / sh;
}

function hudItemCenterPx(item, boxW, boxH) {
	const aabb = hudItemAabbPx(item, boxW, boxH);
	return { cx: aabb.cx, cy: aabb.cy };
}

function onPointerMove(ev) {
	if (!drag) {
		return;
	}
	if (drag.kind === "gauge") {
		onGaugePointerMove(ev);
		return;
	}
	if (drag.kind === "gizmo") {
		onGizmoPointerMove(ev);
		return;
	}
	onGroupPointerMove(ev);
}

function onPointerUp() {
	if (!drag) {
		return;
	}
	const kind = drag.kind;
	const id = drag.id || "";
	drag = null;
	if (kind === "gauge" && id) {
		selectEditorItem("gauge", id);
	} else if (kind === "gizmo" && id) {
		selectEditorItem("gizmo", id);
	} else if (kind === "group" && id) {
		selectEditorItem("group", id);
	}
	scheduleSave(true);
	renderEditor(true);
	renderGears();
}

function fitLabelFont(label, widthPx, preferredPx, maxHeightPx = 0) {
	if (!label || widthPx < 8) {
		return;
	}
	const text = String(label.textContent || "").trim();
	const words = text.split(/\s+/).filter(Boolean);
	if (!words.length) {
		return;
	}
	const baseSize = Number(preferredPx);
	const fitKey = `${text}|${Math.round(widthPx)}|${Number.isFinite(baseSize) ? Math.round(baseSize) : ""}|${Math.round(maxHeightPx)}`;
	if (label.dataset.fitKey === fitKey) {
		return;
	}
	label.dataset.fitKey = fitKey;
	label.style.fontSize = Number.isFinite(baseSize) && baseSize > 0 ? `${baseSize}px` : "";
	const longest = words.reduce((a, b) => (a.length >= b.length ? a : b));
	const cs = window.getComputedStyle(label);
	const meas = document.createElement("span");
	meas.style.cssText = [
		"position:absolute",
		"left:-9999px",
		"top:0",
		"white-space:nowrap",
		`font-family:${cs.fontFamily}`,
		`font-weight:${cs.fontWeight}`,
		`font-style:${cs.fontStyle}`,
		`letter-spacing:${cs.letterSpacing}`,
		`font-size:${cs.fontSize}`
	].join(";");
	meas.textContent = cs.whiteSpace === "nowrap" ? text : longest;
	document.body.appendChild(meas);
	const wordW = meas.offsetWidth;
	const base = parseFloat(cs.fontSize) || 10;
	document.body.removeChild(meas);
	if (wordW > widthPx) {
		label.style.fontSize = `${Math.max(6, base * (widthPx / wordW))}px`;
	}
	if (maxHeightPx > 0 && label.offsetHeight > maxHeightPx) {
		const cur = parseFloat(label.style.fontSize) || base;
		label.style.fontSize = `${Math.max(6, cur * (maxHeightPx / label.offsetHeight))}px`;
	}
}

function hudFadeShouldShow(key, hidden, preview, now) {
	if (hidden && !preview) {
		if (hudShownAt.has(key) && !hudHideUntil.has(key)) {
			hudHideUntil.set(key, now + HUD_FADE_MS);
		}
		if (!hudHideUntil.has(key) || now >= hudHideUntil.get(key)) {
			hudShownAt.delete(key);
			hudHideUntil.delete(key);
			return false;
		}
		return true;
	}
	hudHideUntil.delete(key);
	if (!hudShownAt.has(key)) {
		hudShownAt.set(key, now);
	}
	return true;
}

function hudFadeMotion(key, preview, now) {
	const fadingOut = hudHideUntil.has(key) && now < hudHideUntil.get(key);
	const fadingIn = !preview && !fadingOut && now - (hudShownAt.get(key) || now) < HUD_FADE_MS;
	return { fadingIn, fadingOut };
}

function applyHudFadeClasses(el, key, preview, now) {
	const { fadingIn, fadingOut } = hudFadeMotion(key, preview, now);
	el.classList.toggle("is-fading-in", fadingIn);
	el.classList.toggle("is-fading-out", fadingOut);
}

function syncHudFrontLayer() {
	const frontRoot = document.getElementById("hud-front");
	if (!frontRoot) {
		return;
	}
	const hasFront = frontRoot.childElementCount > 0;
	frontRoot.classList.toggle("has-front", hasFront);
	frontRoot.hidden = !hasFront;
}

/** Suppress accordion toggle handlers while syncing open/selection from code. */
let selectionSyncLock = false;

/**
 * Exclusive HUD/editor selection across groups, gauges, and gizmos.
 * kind: "group" | "gauge" | "gizmo" | "" (clear all)
 * opts.skipHud — skip renderGears (e.g. start of a drag; layer sync still runs).
 */
function selectEditorItem(kind, id, opts) {
	const next = id || "";
	const wantGroup = kind === "group" && next ? next : "";
	const wantGauge = kind === "gauge" && next ? next : "";
	const wantGizmo = kind === "gizmo" && next ? next : "";
	const skipHud = !!(opts && opts.skipHud);

	openGroupId = wantGroup;
	openGaugeId = wantGauge;
	openGizmoId = wantGizmo;
	if (typeof activeGaugeId !== "undefined") {
		activeGaugeId = wantGauge;
	}
	if (typeof activeGizmoId !== "undefined") {
		activeGizmoId = wantGizmo;
	}

	selectionSyncLock = true;
	try {
		for (const el of document.querySelectorAll("details.group-acc")) {
			const want = !!wantGroup && el.dataset.groupId === wantGroup;
			if (el.open !== want) {
				el.open = want;
			}
			el.classList.toggle("is-selected", want);
		}
		for (const el of document.querySelectorAll("details.gauge-acc")) {
			const want = !!wantGauge && el.dataset.gaugeId === wantGauge;
			if (el.open !== want) {
				el.open = want;
			}
			el.classList.toggle("is-selected", want);
		}
		for (const el of document.querySelectorAll("details.gizmo-acc")) {
			const want = !!wantGizmo && el.dataset.gizmoId === wantGizmo;
			if (el.open !== want) {
				el.open = want;
			}
			el.classList.toggle("is-selected", want);
		}
	} finally {
		selectionSyncLock = false;
	}

	if (typeof syncActiveGaugeLayer === "function") {
		syncActiveGaugeLayer();
	} else if (typeof syncGaugeHandleVisibility === "function") {
		syncGaugeHandleVisibility();
	}
	if (typeof syncActiveGizmoLayer === "function") {
		syncActiveGizmoLayer();
	} else if (typeof syncGizmoHandleVisibility === "function") {
		syncGizmoHandleVisibility();
	}
	if (!skipHud && !drag && typeof renderGears === "function") {
		renderGears();
	}
}

/** Close editor accordions / HUD-front picks so stacking reflects list order. */
function collapseEditorAccordionsForStackOrder() {
	selectEditorItem("", "");
}

/**
 * Swap an item in a snapshot list by id. Later list entries paint on top.
 * Up (dir=-1) = send back; Down (dir=+1) = bring forward.
 * pinnedFirstId (e.g. default group) stays at index 0 and cannot move.
 */
function moveSnapshotById(list, id, dir, pinnedFirstId) {
	if (!Array.isArray(list) || !id) {
		return false;
	}
	if (pinnedFirstId && id === pinnedFirstId) {
		return false;
	}
	const i = list.findIndex((item) => item && item.id === id);
	if (i < 0) {
		return false;
	}
	const j = i + dir;
	if (j < 0 || j >= list.length) {
		return false;
	}
	if (pinnedFirstId && j === 0) {
		return false;
	}
	const tmp = list[i];
	list[i] = list[j];
	list[j] = tmp;
	return true;
}

function moveGroupInList(id, dir) {
	if (!moveSnapshotById(snapshot.groups, id, dir, DEFAULT_GROUP_ID)) {
		return;
	}
	collapseEditorAccordionsForStackOrder();
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function moveGaugeInList(id, dir) {
	if (!Array.isArray(snapshot.gauges)) {
		snapshot.gauges = [];
	}
	if (!moveSnapshotById(snapshot.gauges, id, dir)) {
		return;
	}
	collapseEditorAccordionsForStackOrder();
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function moveGizmoInList(id, dir) {
	if (!Array.isArray(snapshot.gizmos)) {
		snapshot.gizmos = [];
	}
	if (!moveSnapshotById(snapshot.gizmos, id, dir)) {
		return;
	}
	collapseEditorAccordionsForStackOrder();
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function appendStackOrderButtons(end, opts) {
	const up = document.createElement("button");
	up.type = "button";
	up.className = "tiny";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(up, "cog-up", "Up");
	} else {
		up.textContent = "Up";
	}
	up.disabled = !!opts.upDisabled;
	up.addEventListener("click", () => opts.onUp());
	end.appendChild(up);
	stopHeaderToggle(up);

	const down = document.createElement("button");
	down.type = "button";
	down.className = "tiny";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(down, "cog-down", "Down");
	} else {
		down.textContent = "Down";
	}
	down.disabled = !!opts.downDisabled;
	down.addEventListener("click", () => opts.onDown());
	end.appendChild(down);
	stopHeaderToggle(down);
}

function feedSourcesBagUsable(sources) {
	if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
		return false;
	}
	const keys = Object.keys(sources);
	if (!keys.length) {
		return false;
	}
	// Prefer nested bags that look like real source blocks (enabled present on at least one).
	return keys.some((sid) => {
		const block = sources[sid];
		return block && typeof block === "object" && !Array.isArray(block)
			&& Object.prototype.hasOwnProperty.call(block, "enabled");
	});
}

/** Keep nested Feed settings.sources when a snapshot echo drops them (flat legacy shape). */
function mergePreservedFeedGizmoSources(prevGizmos, nextGizmos) {
	if (!Array.isArray(prevGizmos) || !Array.isArray(nextGizmos) || !nextGizmos.length) {
		return;
	}
	const prevById = new Map();
	for (const z of prevGizmos) {
		if (z && z.id) {
			prevById.set(z.id, z);
		}
	}
	for (const z of nextGizmos) {
		if (!z || !z.id) {
			continue;
		}
		if (typeof normalizeGizmoType === "function" && normalizeGizmoType(z.typeId) !== "cog-feed") {
			continue;
		}
		const prev = prevById.get(z.id);
		if (!prev) {
			continue;
		}
		const prevSettings =
			prev.settings && typeof prev.settings === "object" && !Array.isArray(prev.settings)
				? prev.settings
				: null;
		const prevSources =
			prevSettings && feedSourcesBagUsable(prevSettings.sources) ? prevSettings.sources : null;
		if (!prevSources) {
			continue;
		}
		if (!z.settings || typeof z.settings !== "object" || Array.isArray(z.settings)) {
			z.settings = {};
		}
		const nextSources = feedSourcesBagUsable(z.settings.sources) ? z.settings.sources : null;
		if (!nextSources) {
			// Snapshot echoed flat/malformed — keep the last good nested bag.
			z.settings.sources = prevSources;
			if (prevSettings.feedSourcesVersion != null) {
				z.settings.feedSourcesVersion = prevSettings.feedSourcesVersion;
			}
			continue;
		}
		const merged = { ...prevSources };
		for (const [sid, block] of Object.entries(nextSources)) {
			merged[sid] = {
				...(prevSources[sid] && typeof prevSources[sid] === "object" ? prevSources[sid] : {}),
				...(block && typeof block === "object" ? block : {})
			};
		}
		z.settings.sources = merged;
	}
}

function flushSave() {
	clearTimeout(saveTimer);
	saveTimer = null;
	if (!layoutHydrated || !saveQueued) {
		saveQueued = false;
		return;
	}
	saveQueued = false;
	// Persist nested sources.* (migrate flat leftovers before the state push).
	if (typeof ensureGizmo === "function" && typeof normalizeGizmoType === "function") {
		for (const z of snapshot.gizmos || []) {
			if (z && normalizeGizmoType(z.typeId) === "cog-feed") {
				ensureGizmo(z);
			}
		}
	}
	const gizmos = (snapshot.gizmos || []).map((z) => {
		const copy = { ...z };
		delete copy.livePayload;
		delete copy.livePayloadJson;
		if (copy.settings && typeof copy.settings === "object") {
			copy.settings = copy.settings;
			delete copy.settingsJson;
		} else if (typeof copy.settingsJson === "string" && copy.settingsJson.trim()) {
			try {
				copy.settings = JSON.parse(copy.settingsJson);
			} catch (e) {
				copy.settings = {};
			}
			delete copy.settingsJson;
		}
		return copy;
	});
	const payload = JSON.stringify({
		general: {
			showDefaultGroup: snapshot.general?.showDefaultGroup,
			editorKey: snapshot.general?.editorKey,
			hideToggleKey: snapshot.general?.hideToggleKey || "",
			hideIncludesFlash: snapshot.general?.hideIncludesFlash !== false,
			fillColor: snapshot.general?.fillColor,
			borderColor: snapshot.general?.borderColor,
			iconColor: snapshot.general?.iconColor,
			gadgetFont: snapshot.general?.gadgetFont,
			language: snapshot.general?.language || "en-CA",
			highlightMissingTranslations: !!snapshot.general?.highlightMissingTranslations,
			updateStockTitlesOnTranslation: !!snapshot.general?.updateStockTitlesOnTranslation
		},
		groups: snapshot.groups,
		gears: snapshot.gears,
		gauges: snapshot.gauges || [],
		gizmos
	});
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE("state:" + payload);
	}
}

function scheduleSave(immediate) {
	saveQueued = true;
	ignoreLayoutUntil = Date.now() + 800;
	clearTimeout(saveTimer);
	if (immediate) {
		flushSave();
		return;
	}
	saveTimer = setTimeout(flushSave, 80);
}

document.addEventListener("pointerdown", (ev) => {
	const t = ev.target;
	if (t.closest("#editor-panel") || t.closest("#tabs")) {
		// Accordion toggles own selection; do not clear on editor chrome clicks.
		return;
	}
	// Body-portaled editor menus live outside #editor-panel — treat them as chrome.
	if (
		t.closest(".cog-color-picker") ||
		t.closest(".cog-icon-picker") ||
		t.closest(".cog-select-menu") ||
		t.closest(".info-tip-panel") ||
		t.closest(".clock-token-popover")
	) {
		return;
	}
	const gaugeEl = t.closest(".hud-gauge.is-editable");
	if (gaugeEl) {
		selectEditorItem("gauge", gaugeEl.dataset.id || "");
		return;
	}
	const gizmoEl = t.closest(".hud-gizmo.is-editable");
	if (gizmoEl) {
		selectEditorItem("gizmo", gizmoEl.dataset.id || "");
		return;
	}
	const groupEl = t.closest(".hud-group");
	if (groupEl && groupEl.classList.contains("is-preview")) {
		selectEditorItem("group", groupEl.dataset.id || "");
		return;
	}
	if (!drag) {
		selectEditorItem("", "");
	}
});

document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);
window.addEventListener("resize", () => {
	if (!drag) {
		renderGears();
	}
	if (typeof scheduleGizmoPaneHeights === "function") {
		scheduleGizmoPaneHeights();
	}
});

bootEditorChrome();

setInterval(() => {
	tickHudFeeds();
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE("tick");
	}
}, 50);
