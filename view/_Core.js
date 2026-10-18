// COG overlay - Core (snapshot, bridges, HUD utilities, boot)
// Classic script; loads last after all section scripts.

let snapshot = { sources: [], shoutMeter: null, general: { showDefaultGroup: true, editorKey: "F3", hideToggleKey: "", hideIncludesFlash: true, uiHidden: false, fillColor: "#c4a35a", borderColor: "#e8d2a0", iconColor: "#ffffff", neutralIconMode: "white", gadgetFont: "Roboto" }, groups: [], gears: [], gauges: [], gizmos: [], gizmoTypes: [], icons: [], importedIcons: [], fonts: [], suppressions: [] };
let saveTimer = null;
let activeTab = "general";
let drag = null;
/** Keeps gauge + clock auto font sizing aligned (slightly under half / prior baselines). */
const AUTO_FONT_SIZE_SCALE = 0.95;
const DEFAULT_HUD_X = 0.1;
const DEFAULT_HUD_Y = 0.1;
const DEFAULT_BORDER_THICKNESS_PCT = 15;
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
				snapshot.gizmoTypes = incoming.gizmoTypes;
				ensureGizmoViewScripts();
			}
			if (Array.isArray(incoming.suppressions)) {
				snapshot.suppressions = incoming.suppressions;
			}
			if (Array.isArray(incoming.suppressionAliases)) {
				snapshot.suppressionAliases = incoming.suppressionAliases;
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
		snapshot = incoming;
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
		if (rebindListening && snapshot.general.editorKey && snapshot.general.editorKey !== prevKey) {
			rebindListening = false;
		}
		applyTheme();
		layoutHydrated = true;
		if (!drag) {
			renderGears();
			if (currentEditorKey() !== prevEditor) {
				renderEditor(false);
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
	snapshot.general.neutralIconMode = normalizeNeutralIconMode(snapshot.general.neutralIconMode);
	if (!Array.isArray(snapshot.fonts)) {
		snapshot.fonts = [];
	}
	snapshot.general.gadgetFont = normalizeGadgetFont(snapshot.general.gadgetFont);
	if (!Array.isArray(snapshot.groups)) {
		snapshot.groups = [];
	}
	if (!Array.isArray(snapshot.gears)) {
		snapshot.gears = [];
	}
	if (!Array.isArray(snapshot.gauges)) {
		snapshot.gauges = [];
	}
	for (const g of snapshot.gauges) {
		ensureGauge(g);
	}
	if (!Array.isArray(snapshot.gizmos)) {
		snapshot.gizmos = [];
	}
	if (!Array.isArray(snapshot.gizmoTypes)) {
		snapshot.gizmoTypes = [];
	}
	if (!Array.isArray(snapshot.suppressions)) {
		snapshot.suppressions = [];
	}
	if (!Array.isArray(snapshot.suppressionAliases)) {
		snapshot.suppressionAliases = [];
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
	if (!Array.isArray(snapshot.icons)) {
		snapshot.icons = [];
	}
	if (!Array.isArray(snapshot.importedIcons)) {
		snapshot.importedIcons = [];
	}
	if (typeof rebuildIconRootMap === "function") {
		rebuildIconRootMap();
	}
	for (const src of snapshot.sources || []) {
		if (src && src.icon) {
			src.icon = normalizeIconRelPath(src.icon);
		}
	}
	preloadEndCapAspects();
	normalizeGearsSnapshot();
	normalizeGroupsSnapshot();
}

function cssAttr(value) {
	return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sourceFor(mod, name) {
	const m = String(mod || "");
	const n = String(name || "");
	return (snapshot.sources || []).find(
		(s) =>
			String(s.mod || "").toLowerCase() === m.toLowerCase() &&
			String(s.name || "").toLowerCase() === n.toLowerCase()
	);
}

function fmtPct(n) {
	return fmtDec(n, 3);
}

/** Fixed-decimal display for editor floats (kills float32 noise like 1.299999952). */
function fmtDec(n, digits = 3) {
	const d = Math.max(0, Math.min(10, Number(digits) || 0));
	return (Number(n) || 0).toFixed(d);
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
 * CSS left/top are the unrotated layout box; with transform-origin 50% 50%, the visual
 * footprint is a larger AABB when rotated.
 *
 * Persisted gizmo/gauge x/y are visual AABB top-left fractions.
 * Groups still use layout CSS fractions. Helpers convert AABB ↔ layout for paint/drag.
 */
function hudItemAabbPx(item, boxW, boxH, screenW, screenH) {
	const sw = screenW || window.innerWidth || 1;
	const sh = screenH || window.innerHeight || 1;
	const left = (item.x ?? DEFAULT_HUD_X) * sw;
	const top = (item.y ?? DEFAULT_HUD_Y) * sh;
	const aabb = rotatedAabbSize(boxW, boxH, item.rotation || 0);
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
	return hudItemLayoutFromAabbLeftTop(
		(item.x ?? DEFAULT_HUD_X) * sw,
		(item.y ?? DEFAULT_HUD_Y) * sh,
		boxW,
		boxH,
		item.rotation || 0,
		sw,
		sh
	);
}

/** Editor X/Y % = persisted AABB top-left on screen. */
function hudItemEditorPosPct(item, boxW, boxH) {
	return {
		x: (item.x ?? DEFAULT_HUD_X) * 100,
		y: (item.y ?? DEFAULT_HUD_Y) * 100
	};
}

function applyHudItemEditorPosPct(item, boxW, boxH, xPct, yPct) {
	item.x = clampPct(Number(xPct), 0, 100) / 100;
	item.y = clampPct(Number(yPct), 0, 100) / 100;
	clampHudItemToScreen(item, boxW, boxH);
}

/** Compute editor AABB X/Y without mutating the live item (so patch* can detect the change). */
function hudItemEditorPosPatch(item, boxW, boxH, xPct, yPct) {
	const probe = {
		x: item.x,
		y: item.y,
		rotation: item.rotation,
		posAnchor: item.posAnchor
	};
	applyHudItemEditorPosPct(probe, boxW, boxH, xPct, yPct);
	return { x: probe.x, y: probe.y };
}

/** Keep the rotated visual footprint on-screen (allows negative layout CSS when rotated). */
function clampHudItemToScreen(item, boxW, boxH) {
	const sw = window.innerWidth || 1;
	const sh = window.innerHeight || 1;
	const aabb = hudItemAabbPx(item, boxW, boxH, sw, sh);
	const left = Math.min(Math.max(0, aabb.left), Math.max(0, sw - aabb.w));
	const top = Math.min(Math.max(0, aabb.top), Math.max(0, sh - aabb.h));
	item.x = left / sw;
	item.y = top / sh;
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
	up.textContent = "Up";
	up.disabled = !!opts.upDisabled;
	up.addEventListener("click", () => opts.onUp());
	end.appendChild(up);
	stopHeaderToggle(up);

	const down = document.createElement("button");
	down.type = "button";
	down.className = "tiny";
	down.textContent = "Down";
	down.disabled = !!opts.downDisabled;
	down.addEventListener("click", () => opts.onDown());
	end.appendChild(down);
	stopHeaderToggle(down);
}

function flushSave() {
	clearTimeout(saveTimer);
	saveTimer = null;
	if (!layoutHydrated || !saveQueued) {
		saveQueued = false;
		return;
	}
	saveQueued = false;
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
			neutralIconMode: snapshot.general?.neutralIconMode,
			gadgetFont: snapshot.general?.gadgetFont
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
});

bootEditorChrome();

setInterval(() => {
	tickHudFeeds();
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE("tick");
	}
}, 50);
