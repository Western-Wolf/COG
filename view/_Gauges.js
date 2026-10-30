// COG overlay - Gauges (type-level: all gauge instances)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

/** Stub until _Core.js replaces with SKSE-backed cogConfigNote. */
function cogConfigNote(message) {
	console.info("COG config:", message);
}

/** Prefixed migration log (v1.01 → v1.1). */
function noteMigration(detail) {
	const text = String(detail || "").trim();
	if (!text) {
		return;
	}
	cogConfigNote(`Migration Code for Transition from v1.01 or earlier to v1.1: ${text}`);
}

function noteMigrationIf(condition, detail) {
	if (condition) {
		noteMigration(detail);
	}
}

/**
 * Log + optionally delete keys not in allowSet (and not in legacySet).
 * @param {object} obj
 * @param {Set<string>|string[]} allowSet
 * @param {string} bagLabel e.g. "group.settings"
 * @param {{ legacySet?: Set<string>|string[], deleteUnknown?: boolean, id?: string }} [opts]
 */
function stripUnknownKeys(obj, allowSet, bagLabel, opts) {
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
		return [];
	}
	const allow = allowSet instanceof Set ? allowSet : new Set(allowSet || []);
	const legacyRaw = opts && opts.legacySet;
	const legacy = legacyRaw instanceof Set ? legacyRaw : new Set(legacyRaw || []);
	const doDelete = !opts || opts.deleteUnknown !== false;
	const id = (opts && opts.id) || "";
	const stripped = [];
	for (const key of Object.keys(obj)) {
		if (allow.has(key) || legacy.has(key)) {
			continue;
		}
		stripped.push(key);
		const where = id ? `${bagLabel} '${key}' from ${id}` : `${bagLabel} key '${key}'`;
		cogConfigNote(`stripped unknown ${where}`);
		if (doDelete) {
			delete obj[key];
		}
	}
	return stripped;
}

const DEFAULT_GAUGE_WIDTH = 240;
const DEFAULT_GAUGE_HEIGHT = 24;
const MIN_GAUGE_WIDTH = 32;
const MIN_GAUGE_HEIGHT = 6;

/** Shared none|hud|ui triad for groups, gauges, and gizmos. Unknown/empty → hud. */
function normalizeVisibility(value) {
	const v = String(value || "")
		.trim()
		.toLowerCase();
	if (v === "none" || v === "ui") {
		return v;
	}
	return "hud";
}

/**
 * Migration Code for Transition from v1.01 or earlier to v1.1:
 * Legacy root bool "visible" → visibility none|hud (never kept as bool).
 */
function ensureEntityVisibility(entity) {
	if (!entity || typeof entity !== "object") {
		return "hud";
	}
	const label = entity.id || entity.typeId || "?";
	if (entity.visibility == null || String(entity.visibility).trim() === "") {
		if (Object.prototype.hasOwnProperty.call(entity, "visible")) {
			entity.visibility = entity.visible === false ? "none" : "hud";
			noteMigration(`${label} visible → visibility`);
		} else {
			entity.visibility = "hud";
		}
	}
	entity.visibility = normalizeVisibility(entity.visibility);
	delete entity.visible;
	return entity.visibility;
}

let openGaugeId = "";
let activeGaugeId = "";

function hudGaugeFadeKey(gaugeId) {
	return `gauge\t${gaugeId}`;
}

function syncGaugeHandleVisibility() {
	for (const el of document.querySelectorAll(".hud-gauge.is-handle-active")) {
		el.classList.remove("is-handle-active");
	}
	if (!activeGaugeId) {
		return;
	}
	const el = findHudGaugeEl(activeGaugeId);
	if (el) {
		el.classList.add("is-handle-active");
		// Bounds depend on layout; refresh when handles become visible (accordion select, etc.).
		syncGaugeHandleBounds(el);
	}
}

function gaugeShouldBeFront(id) {
	if (!id || !document.body.classList.contains("is-focused")) {
		return false;
	}
	return activeGaugeId === id || (activeTab === "gauges" && openGaugeId === id);
}

/**
 * Keep mounted gauges in snapshot/menu order.
 * hideAt remove/recreate used appendChild, which stacked reappearing gauges on top.
 * Place the gauge block after groups and before gizmos/other siblings (same as first paint).
 */
function reorderHudGauges(host) {
	if (!host) {
		return;
	}
	const ordered = [];
	for (const gauge of snapshot.gauges || []) {
		const id = gauge && gauge.id;
		if (!id) {
			continue;
		}
		for (const child of host.children) {
			if (child.classList && child.classList.contains("hud-gauge") && child.dataset.id === id) {
				ordered.push(child);
				break;
			}
		}
	}
	if (!ordered.length) {
		return;
	}
	let before = null;
	for (const child of host.children) {
		if (child.classList.contains("hud-group") || child.classList.contains("hud-gauge")) {
			continue;
		}
		before = child;
		break;
	}
	for (const el of ordered) {
		host.insertBefore(el, before);
	}
}

function syncActiveGaugeLayer() {
	const root = document.getElementById("hud");
	const frontRoot = document.getElementById("hud-front");
	if (!root || !frontRoot) {
		return;
	}
	for (const el of [...root.querySelectorAll(".hud-gauge"), ...frontRoot.querySelectorAll(".hud-gauge")]) {
		const id = el.dataset.id || "";
		const wantFront = gaugeShouldBeFront(id);
		el.classList.toggle("is-front", wantFront);
		const dest = wantFront ? frontRoot : root;
		if (el.parentElement !== dest) {
			dest.appendChild(el);
		}
	}
	reorderHudGauges(root);
	reorderHudGauges(frontRoot);
	syncHudFrontLayer();
	syncGaugeHandleVisibility();
}

function setActiveGauge(id) {
	const next = id || "";
	if (!next) {
		if (!activeGaugeId && !openGaugeId) {
		syncGaugeHandleVisibility();
		return;
	}
		selectEditorItem("", "");
		return;
	}
	if (activeGaugeId === next && openGaugeId === next && !openGroupId && !openGizmoId && !activeGizmoId) {
	syncActiveGaugeLayer();
		return;
	}
	selectEditorItem("gauge", next);
}

function clearActiveGauge() {
	setActiveGauge("");
}

function beginGaugeDrag(ev, gaugeId, mode) {
	ev.preventDefault();
	ev.stopPropagation();
	const gauge = gaugeFor(gaugeId);
	if (!gauge || gauge.locked) {
		return;
	}
	selectEditorItem("gauge", gaugeId, { skipHud: true });
	ensureGauge(gauge);
	const w = window.innerWidth || 1;
	const h = window.innerHeight || 1;
	const iconSize =
		normalizeGaugeShape(gaugeSettings(gauge).shape) === "arc"
			? Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.display.height))
			: Math.round(gauge.display.height);
	const box = gaugeLayoutBox(gauge, iconSize);
	const aabb = hudItemAabbPx(gauge, box.w, box.h, w, h);
	drag = {
		kind: "gauge",
		id: gauge.id,
		mode,
		grabAabbX: ev.clientX - aabb.left,
		grabAabbY: ev.clientY - aabb.top,
		grabX: ev.clientX / w - (gauge.display.x ?? DEFAULT_HUD_X),
		grabY: ev.clientY / h - (gauge.display.y ?? DEFAULT_HUD_Y),
		startWidth: gauge.display.width,
		startHeight: gauge.display.height,
		startLayoutW: box.w,
		startLayoutH: box.h,
		startX: gauge.display.x,
		startY: gauge.display.y,
		pointerLocal: screenToGaugeLocal(ev.clientX, ev.clientY, gauge)
	};
	if (ev.currentTarget && ev.pointerId != null && ev.currentTarget.setPointerCapture) {
		ev.currentTarget.setPointerCapture(ev.pointerId);
	}
}

function screenToGaugeLocal(clientX, clientY, gauge) {
	const el = findHudGaugeEl(gauge.id);
	let cx;
	let cy;
	if (el) {
		const rect = el.getBoundingClientRect();
		cx = rect.left + rect.width / 2;
		cy = rect.top + rect.height / 2;
	} else {
		const box = gaugeLayoutBox(gauge);
		({ cx, cy } = hudItemCenterPx(gauge, box.w, box.h));
	}
	const dx = clientX - cx;
	const dy = clientY - cy;
	const rad = -((Number(gauge.display.rotation) || 0) * Math.PI) / 180;
	return {
		x: dx * Math.cos(rad) - dy * Math.sin(rad),
		y: dx * Math.sin(rad) + dy * Math.cos(rad)
	};
}

function onGaugePointerMove(ev) {
	const gauge = gaugeFor(drag.id);
	if (!gauge) {
		return;
	}
	ensureGauge(gauge);
	const w = window.innerWidth || 1;
	const h = window.innerHeight || 1;
	if (drag.mode === "move") {
		const iconSize =
			normalizeGaugeShape(gaugeSettings(gauge).shape) === "arc"
				? Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.display.height))
				: Math.round(gauge.display.height);
		const box = gaugeLayoutBox(gauge, iconSize);
		const aabbSize = rotatedAabbSize(box.w, box.h, gauge.display.rotation || 0);
		let left = ev.clientX - (drag.grabAabbX || 0);
		let top = ev.clientY - (drag.grabAabbY || 0);
		left = Math.min(Math.max(0, left), Math.max(0, w - aabbSize.w));
		top = Math.min(Math.max(0, top), Math.max(0, h - aabbSize.h));
		gauge.display.x = left / w;
		gauge.display.y = top / h;
	} else if (drag.mode === "rotate") {
		const el = findHudGaugeEl(gauge.id);
		let sx;
		let sy;
		if (el) {
			const r = el.getBoundingClientRect();
			sx = r.left + r.width / 2;
			sy = r.top + r.height / 2;
		} else {
			const box = gaugeLayoutBox(gauge);
			({ cx: sx, cy: sy } = hudItemCenterPx(gauge, box.w, box.h));
		}
		gauge.display.rotation = Math.atan2(ev.clientY - sy, ev.clientX - sx) * (180 / Math.PI);
		const box = gaugeLayoutBox(gauge);
		clampHudItemToScreen(gauge, box.w, box.h);
	} else if (String(drag.mode).startsWith("resize-")) {
		resizeGaugeFromPointer(gauge, ev);
	}
	syncHudGauge(gauge);
}

function resizeGaugeFromPointer(gauge, ev) {
	const local = screenToGaugeLocal(ev.clientX, ev.clientY, {
		...gauge,
		x: drag.startX,
		y: drag.startY
	});
	const axis = String(drag.mode).replace(/^resize-/, "");
	const isArc = normalizeGaugeShape(gaugeSettings(gauge).shape) === "arc";
	const startLayoutH = isArc ? drag.startWidth / 2 : drag.startHeight;
	let left = -drag.startWidth / 2;
	let right = drag.startWidth / 2;
	let top = -startLayoutH / 2;
	let bottom = startLayoutH / 2;
	if (axis.includes("e")) {
		right = Math.max(left + MIN_GAUGE_WIDTH, local.x);
	}
	if (axis.includes("w")) {
		left = Math.min(right - MIN_GAUGE_WIDTH, local.x);
	}
	if (axis.includes("s")) {
		bottom = Math.max(top + (isArc ? startLayoutH * 0.15 : MIN_GAUGE_HEIGHT), local.y);
	}
	if (axis.includes("n")) {
		top = Math.min(bottom - (isArc ? startLayoutH * 0.15 : MIN_GAUGE_HEIGHT), local.y);
	}
	const newW = right - left;
	const newLayoutH = isArc ? newW / 2 : bottom - top;
	const midLocalX = (left + right) / 2;
	const midLocalY = (top + bottom) / 2;
	const rad = ((Number(gauge.display.rotation) || 0) * Math.PI) / 180;
	const startAabb = rotatedAabbSize(
		drag.startLayoutW || drag.startWidth,
		drag.startLayoutH || startLayoutH,
		gauge.display.rotation || 0
	);
	const startCx = drag.startX * (window.innerWidth || 1) + startAabb.w / 2;
	const startCy = drag.startY * (window.innerHeight || 1) + startAabb.h / 2;
	const worldDx = midLocalX * Math.cos(rad) - midLocalY * Math.sin(rad);
	const worldDy = midLocalX * Math.sin(rad) + midLocalY * Math.cos(rad);
	gauge.display.width = Math.max(MIN_GAUGE_WIDTH, newW);
	if (isArc) {
		let thickness = drag.startHeight;
		if (axis.includes("n") || axis.includes("s")) {
			const boxH = Math.max(bottom - top, MIN_GAUGE_HEIGHT);
			thickness = Math.max(
				MIN_GAUGE_HEIGHT,
				Math.min(newW / 2 - 1, (boxH / Math.max(newLayoutH, 1)) * drag.startHeight)
			);
		}
		gauge.display.height = thickness;
	} else {
		gauge.display.height = Math.max(MIN_GAUGE_HEIGHT, newLayoutH);
	}
	const newCx = startCx + worldDx;
	const newCy = startCy + worldDy;
	const outBox = gaugeLayoutBox(gauge);
	const outAabb = rotatedAabbSize(outBox.w, outBox.h, gauge.display.rotation || 0);
	gauge.display.x = (newCx - outAabb.w / 2) / (window.innerWidth || 1);
	gauge.display.y = (newCy - outAabb.h / 2) / (window.innerHeight || 1);
	clampHudItemToScreen(gauge, outBox.w, outBox.h);
}

function normalizeGaugeType(value) {
	const t = String(value || "").toLowerCase();
	if (t === "frame") {
		return "frame";
	}
	if (t === "meter" || t === "bar") {
		return "meter";
	}
	return "meter";
}

function normalizeGaugeDisplayMode(value) {
	const v = String(value || "").toLowerCase();
	if (v === "picture") {
		return "picture";
	}
	if (v === "group") {
		return "gear";
	}
	return "gear";
}

function normalizePictureDirection(value) {
	const v = String(value || "").toLowerCase();
	if (v === "in" || v === "up" || v === "down" || v === "left" || v === "right") {
		return v;
	}
	return "out";
}

function defaultPictureIconPath() {
	if (typeof firstIconInFolder === "function") {
		return firstIconInFolder("Pictures");
	}
	return "";
}

function defaultFrameShapePath() {
	if (typeof firstIconInFolder === "function") {
		return firstIconInFolder("Frames") || "Frames/circle.svg";
	}
	return "Frames/circle.svg";
}

/** Stock General fill — borrowed as Picture Fade / Frame Border defaults (not live-linked). */
function frameDefaultPictureFade() {
	return typeof defaultFillColor === "function" ? defaultFillColor() : "#c4a35a";
}

function frameDefaultBorderColor() {
	return frameDefaultPictureFade();
}

/** Stock General border — borrowed as Frame Fill default (not live-linked). */
function frameDefaultFillColor() {
	return typeof defaultBorderColor === "function" ? defaultBorderColor() : "#e8d2a0";
}

function normalizeFrameSlot(value) {
	const v = String(value || "").toLowerCase();
	if (v === "top" || v === "middle" || v === "bottom") {
		return v;
	}
	return "none";
}

/** Resolve duplicate frame slots: keep Icon → Number → Title; clear losers to none. */
function repairFrameSlots(gauge) {
	const s = gauge.settings || gauge;
	const order = [
		["showIcon", normalizeFrameSlot(s.showIcon)],
		["showNumber", normalizeFrameSlot(s.showNumber)],
		["showLabel", normalizeFrameSlot(s.showLabel)]
	];
	const claimed = new Set();
	for (const [key, slot] of order) {
		if (slot === "none") {
			s[key] = "none";
			continue;
		}
		if (claimed.has(slot)) {
			s[key] = "none";
		} else {
			claimed.add(slot);
			s[key] = slot;
		}
	}
}

/** Gauge appearance/options bag (nested under settings). */
const GAUGE_SETTINGS_KEYS = new Set([
	"displayName",
	"type",
	"shape",
	"borderColor",
	"borderThickness",
	"troughOpacity",
	"endCapMode",
	"endCap",
	"endCapOverlap",
	"showIcon",
	"showLabel",
	"showNumber",
	"fillDirection",
	"iconColorMode",
	"labelColorMode",
	"numberColorMode",
	"numberAsPercent",
	"fontSize",
	"frameShape",
	"frameFillColor",
	"frameBorderColor",
	"frameBorderThickness",
	"insideSize",
	"displayMode",
	"neverHide",
	"barTrough",
	"numberFormat",
	"pictureIcon",
	"pictureDirection",
	"pictureRotation",
	"pictureEmpty",
	"pictureFull",
	"pictureFade"
]);

function defaultGaugeSettings() {
	return {
		displayName: "",
		type: "meter",
		shape: "bar",
		borderColor: "",
		borderThickness: DEFAULT_BORDER_THICKNESS_PCT,
		troughOpacity: DEFAULT_TROUGH_OPACITY,
		endCapMode: "border",
		endCap: defaultEndCapArtPath(),
		endCapOverlap: 0,
		showIcon: "none",
		showLabel: "none",
		showNumber: "none",
		fillDirection: "left",
		iconColorMode: "border",
		labelColorMode: "border",
		numberColorMode: "border",
		numberAsPercent: false,
		fontSize: 0,
		frameShape: "Frames/circle.svg",
		frameFillColor: "",
		frameBorderColor: "",
		frameBorderThickness: 5,
		insideSize: 65,
		displayMode: "gear",
		neverHide: false,
		barTrough: false,
		numberFormat: "barPercent",
		pictureIcon: "",
		pictureDirection: "out",
		pictureRotation: 0,
		pictureEmpty: "#000000",
		pictureFull: "#ffffff",
		pictureFade: "#c4a35a"
	};
}

function gaugeSettings(gauge) {
	ensureGauge(gauge);
	return gauge.settings;
}

function frameSlotSelectHtml(current, claimedByOthers) {
	const cur = normalizeFrameSlot(current);
	const claimed = new Set(claimedByOthers || []);
	const opts = [
		["none", "Off"],
		["top", "Top"],
		["middle", "Middle"],
		["bottom", "Bottom"]
	];
	return opts
		.filter(([value]) => value === "none" || value === cur || !claimed.has(value))
		.map(([value, label]) => `<option value="${value}">${label}</option>`)
		.join("");
}

const FRAME_SLOT_OPTION_TAGS = {
	none: ["cog-off", "Off"],
	top: ["cog-top", "Top"],
	middle: ["cog-middle", "Middle"],
	bottom: ["cog-bottom", "Bottom"]
};

function tagFrameSlotOptions(select) {
	return tagSelectOptions(select, FRAME_SLOT_OPTION_TAGS);
}

function normalizeGaugeShape(value) {
	const s = String(value || "").toLowerCase();
	return s === "arc" ? "arc" : "bar";
}

function normalizeGaugePlacement(value) {
	const v = String(value || "").toLowerCase();
	if (v === "left" || v === "right" || v === "up" || v === "down") {
		return v;
	}
	if (v === "centered" || v === "centre" || v === "center" || v === "middle") {
		return "centered";
	}
	return "none";
}

/**
 * Real colour sources only: bar | border | icon.
 * With allowEmpty, unrecognized values (keep / label / …) return "" so callers can migrate.
 */
function normalizeIconColorMode(value, opts) {
	const v = String(value || "").toLowerCase();
	if (v === "border" || v === "useborder" || v === "use border colour" || v === "use border color") {
		return "border";
	}
	if (v === "bar" || v === "usebar" || v === "use bar colour" || v === "use bar color") {
		return "bar";
	}
	if (v === "icon" || v === "matchicon" || v === "match icon colours" || v === "match icon colors") {
		return "icon";
	}
	if (opts && opts.allowEmpty) {
		return "";
	}
	return "border";
}

/**
 * Real colour sources only: bar | border | icon.
 * With allowEmpty, unrecognized values (keep / …) return "" so callers can migrate.
 */
function normalizeLabelColorMode(value, opts) {
	const v = String(value || "").toLowerCase();
	if (v === "border" || v === "matchborder" || v === "match border colour" || v === "match border color") {
		return "border";
	}
	if (v === "bar" || v === "matchbar" || v === "match bar colour" || v === "match bar color") {
		return "bar";
	}
	if (v === "icon" || v === "matchicon" || v === "match icon colours" || v === "match icon colors") {
		return "icon";
	}
	if (opts && opts.allowEmpty) {
		return "";
	}
	return "border";
}

function gaugePlacementSelectHtml(selected) {
	const v = normalizeGaugePlacement(selected);
	return `<option value="none"${v === "none" ? " selected" : ""}>None</option>
		<option value="left"${v === "left" ? " selected" : ""}>Left</option>
		<option value="right"${v === "right" ? " selected" : ""}>Right</option>
		<option value="centered"${v === "centered" ? " selected" : ""}>Centered</option>
		<option value="up"${v === "up" ? " selected" : ""}>Up</option>
		<option value="down"${v === "down" ? " selected" : ""}>Down</option>`;
}

const GAUGE_PLACEMENT_OPTION_TAGS = {
	none: ["cog-none", "None"],
	left: ["cog-left", "Left"],
	right: ["cog-right", "Right"],
	centered: ["cog-centered", "Centered"],
	up: ["cog-up", "Up"],
	down: ["cog-down", "Down"]
};

function tagGaugePlacementOptions(select) {
	return tagSelectOptions(select, GAUGE_PLACEMENT_OPTION_TAGS);
}

function normalizeFillDirection(value) {
	const v = String(value || "").toLowerCase().replace(/\s+/g, "");
	if (v === "right" || v === "fromright") {
		return "right";
	}
	if (v === "center" || v === "fromcenter" || v === "middle") {
		return "center";
	}
	return "left";
}

function defaultGauge(n) {
	const settings = defaultGaugeSettings();
	settings.displayName =
		typeof formatStockName === "function"
			? formatStockName("Gauge {num}", { num: n })
			: `Gauge ${n}`;
	return {
		id: `gauge_${Date.now().toString(36)}`,
		locked: false,
		visibility: "hud",
		display: {
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: DEFAULT_GAUGE_WIDTH,
		height: DEFAULT_GAUGE_HEIGHT,
			maxAlpha: 100
		},
		sourceMod: "",
		varName: "",
		settings
	};
}

function ensureGauge(gauge) {
	if (!gauge || typeof gauge !== "object") {
		return gauge;
	}
	gauge.locked = !!gauge.locked;
	ensureEntityVisibility(gauge);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation/width/height move under nested "display" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	migrateEntityDisplay(gauge, {
		sized: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: DEFAULT_GAUGE_WIDTH,
		height: DEFAULT_GAUGE_HEIGHT,
		minW: MIN_GAUGE_WIDTH,
		minH: MIN_GAUGE_HEIGHT
	});
	const gid = gauge.id || "?";
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy gauge binding keys "gearMod"/"gearName" become sourceMod/varName.
	if (!String(gauge.sourceMod || "").trim() && String(gauge.gearMod || "").trim()) {
		gauge.sourceMod = String(gauge.gearMod).trim();
		noteMigration(`gauge ${gid} gearMod → sourceMod`);
	}
	if (!String(gauge.varName || "").trim() && String(gauge.gearName || "").trim()) {
		gauge.varName = String(gauge.gearName).trim();
		noteMigration(`gauge ${gid} gearName → varName`);
	}
	delete gauge.gearMod;
	delete gauge.gearName;
	gauge.sourceMod = String(gauge.sourceMod || "");
	gauge.varName = String(gauge.varName || "");
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Builtin Vampiric Hunger varName Bloodlust → VampiricHunger on gauge bindings.
	if (
		String(gauge.sourceMod).toLowerCase() === "cog.builtin" &&
		String(gauge.varName).toLowerCase() === "bloodlust"
	) {
		noteMigration(`gauge ${gid} COG.Builtin Bloodlust → VampiricHunger`);
		gauge.sourceMod = "COG.Builtin";
		gauge.varName = "VampiricHunger";
	}

	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat gauge chrome keys move under nested "settings" (never written back flat on save).
	const bag =
		gauge.settings && typeof gauge.settings === "object" && !Array.isArray(gauge.settings)
			? { ...gauge.settings }
			: {};
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy root displayName (and older title key name) move under nested settings.displayName (never written on root again).
	// Prefer settings.displayName; else root displayName; else legacy root name.
	if (!String(bag.displayName || "").trim()) {
		if (String(gauge.displayName || "").trim()) {
			bag.displayName = String(gauge.displayName).trim();
			noteMigration(`gauge ${gid} root displayName → settings.displayName`);
		} else if (String(gauge.name || "").trim()) {
			bag.displayName = String(gauge.name).trim();
			noteMigration(`gauge ${gid} root name → settings.displayName`);
		} else {
			bag.displayName = "";
		}
	} else {
		bag.displayName = String(bag.displayName).trim();
	}
	delete gauge.displayName;
	delete gauge.name;
	let foldedFlatChrome = false;
	for (const key of GAUGE_SETTINGS_KEYS) {
		if (key === "displayName") {
			continue;
		}
		if (!Object.prototype.hasOwnProperty.call(bag, key) && Object.prototype.hasOwnProperty.call(gauge, key)) {
			bag[key] = gauge[key];
			foldedFlatChrome = true;
		}
		delete gauge[key];
	}
	noteMigrationIf(foldedFlatChrome, `gauge ${gid} flat chrome → settings`);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy root type moves under nested settings.type (never written on root again).
	// Prefer settings.type; else root type (folded into bag above).
	noteMigrationIf(
		Object.prototype.hasOwnProperty.call(gauge, "type") && !Object.prototype.hasOwnProperty.call(bag, "type"),
		`gauge ${gid} root type → settings.type`
	);
	delete gauge.type;
	bag.type = normalizeGaugeType(bag.type);

	bag.shape = normalizeGaugeShape(bag.shape);
	bag.borderColor = String(bag.borderColor || "");
	bag.borderThickness = quantizePct(Math.max(0, Math.min(50, Number(bag.borderThickness) || 0)));
	{
		const n = Number(bag.troughOpacity);
		bag.troughOpacity = quantizePct(
			Math.max(0, Math.min(100, Number.isFinite(n) ? n : DEFAULT_TROUGH_OPACITY))
		);
	}
	const migratedCap = migrateEndCapPath(String(bag.endCap || ""));
	bag.endCapMode = normalizeEndCapMode(bag.endCapMode, migratedCap);
	bag.endCap = migratedCap || defaultEndCapArtPath();
	bag.endCapOverlap = quantizePct(Math.max(0, Math.min(45, Number(bag.endCapOverlap) || 0)));
	if (bag.type === "frame") {
		bag.showIcon = normalizeFrameSlot(bag.showIcon);
		bag.showLabel = normalizeFrameSlot(bag.showLabel);
		bag.showNumber = normalizeFrameSlot(bag.showNumber);
	} else {
		bag.showIcon = normalizeGaugePlacement(bag.showIcon);
		bag.showLabel = normalizeGaugePlacement(bag.showLabel);
		bag.showNumber = normalizeGaugePlacement(bag.showNumber);
	}
	bag.fillDirection = normalizeFillDirection(bag.fillDirection);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Colour modes are bar | border | icon only (drop keep / title / number copies).
	{
		const raw = bag.iconColorMode;
		const next = normalizeIconColorMode(raw, { allowEmpty: true });
		if (!next) {
			if (raw != null && String(raw).trim() !== "") {
				noteMigration(`gauge ${gid} iconColorMode ${raw} → border`);
			}
			bag.iconColorMode = "border";
		} else {
			bag.iconColorMode = next;
		}
	}
	{
		const raw = bag.labelColorMode;
		const next = normalizeLabelColorMode(raw, { allowEmpty: true });
		if (!next) {
			if (raw != null && String(raw).trim() !== "") {
				noteMigration(`gauge ${gid} labelColorMode ${raw} → border`);
			}
			bag.labelColorMode = "border";
		} else {
			bag.labelColorMode = next;
		}
	}
	{
		const raw = bag.numberColorMode;
		const next = normalizeLabelColorMode(raw, { allowEmpty: true });
		if (!next) {
			if (raw != null && String(raw).trim() !== "") {
				noteMigration(`gauge ${gid} numberColorMode ${raw} → border`);
			}
			bag.numberColorMode = "border";
		} else {
			bag.numberColorMode = next;
		}
	}
	bag.numberAsPercent = bag.numberAsPercent === true;
	bag.fontSize = Math.max(0, Number(bag.fontSize) || 0);
	bag.frameShape = String(bag.frameShape || "").trim() || defaultFrameShapePath();
	bag.frameFillColor = String(bag.frameFillColor || "");
	bag.frameBorderColor = String(bag.frameBorderColor || "");
	bag.frameBorderThickness = quantizePct(
		Math.max(
			0,
			Math.min(50, Number.isFinite(Number(bag.frameBorderThickness)) ? Number(bag.frameBorderThickness) : 5)
		)
	);
	bag.insideSize = quantizePct(
		Math.max(5, Math.min(100, Number.isFinite(Number(bag.insideSize)) ? Number(bag.insideSize) : 65))
	);
	bag.displayMode = normalizeGaugeDisplayMode(bag.displayMode);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// alwaysVisible → neverHide (blocks soft-hide from Hide when / inactive timers; does not override Gauge Visibility HUD).
	if (bag.neverHide === undefined || bag.neverHide === null) {
		if (Object.prototype.hasOwnProperty.call(bag, "alwaysVisible")) {
			bag.neverHide = !!bag.alwaysVisible;
			noteMigration(`gauge ${gid} alwaysVisible → neverHide`);
		} else if (Object.prototype.hasOwnProperty.call(gauge, "alwaysVisible")) {
			bag.neverHide = !!gauge.alwaysVisible;
			noteMigration(`gauge ${gid} alwaysVisible → neverHide`);
		} else {
			bag.neverHide = bag.type === "frame";
		}
	} else {
		bag.neverHide = !!bag.neverHide;
	}
	delete bag.alwaysVisible;
	delete gauge.alwaysVisible;
	bag.barTrough = bag.barTrough === true;
	bag.numberFormat = normalizeNumberFormat(bag.numberFormat, "barPercent");
	bag.pictureIcon = String(bag.pictureIcon || "").trim() || defaultPictureIconPath();
	bag.pictureDirection = normalizePictureDirection(bag.pictureDirection);
	bag.pictureRotation = Number(bag.pictureRotation) || 0;
	bag.pictureEmpty = optionalHex(bag.pictureEmpty) || "#000000";
	bag.pictureFull = optionalHex(bag.pictureFull) || "#ffffff";
	bag.pictureFade = optionalHex(bag.pictureFade) || frameDefaultPictureFade();
	stripUnknownKeys(bag, GAUGE_SETTINGS_KEYS, "gauge.settings", { id: gid });
	const cleaned = {};
	for (const key of GAUGE_SETTINGS_KEYS) {
		if (Object.prototype.hasOwnProperty.call(bag, key)) {
			cleaned[key] = bag[key];
		}
	}
	gauge.settings = cleaned;
	if (cleaned.type === "frame") {
		repairFrameSlots(gauge);
	}
	return gauge;
}

function gaugeFor(id) {
	return (snapshot.gauges || []).find((g) => g.id === id);
}

function addGauge() {
	if (!Array.isArray(snapshot.gauges)) {
		snapshot.gauges = [];
	}
	const n = snapshot.gauges.length + 1;
	const gauge = defaultGauge(n);
	snapshot.gauges.push(gauge);
	selectEditorItem("gauge", gauge.id);
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function removeGauge(id) {
	snapshot.gauges = (snapshot.gauges || []).filter((g) => g.id !== id);
	if (openGaugeId === id) {
		openGaugeId = "";
	}
	if (activeGaugeId === id) {
		clearActiveGauge();
	}
	scheduleSave(true);
	renderGears();
	renderEditor(true);
}

function patchGauge(id, patch, skipHud, live) {
	const gauge = gaugeFor(id);
	if (!gauge) {
		return;
	}
	const settings = gaugeSettings(gauge);
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
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
			const pos = entityDisplay(gauge);
			for (const [pk, pv] of Object.entries(value)) {
				if (pos[pk] !== pv) {
					changed = true;
					pos[pk] = pv;
				}
			}
			continue;
		}
		if (GAUGE_SETTINGS_KEYS.has(key)) {
			if (settings[key] !== value) {
				changed = true;
				settings[key] = value;
			}
			continue;
		}
		if (gauge[key] !== value) {
			changed = true;
			gauge[key] = value;
		}
	}
	if (!changed) {
		if (live === false) {
			scheduleSave(true);
		}
		return;
	}
	gauge.settings = settings;
	ensureGauge(gauge);
	if (live === true) {
		if (!skipHud) {
			syncHudGauge(gauge);
		}
		return;
	}
	scheduleSave(true);
	if (!skipHud) {
		syncHudGauge(gauge);
		// live === false: colour commit — this gauge only (already synced).
		if (live !== false && !drag) {
		renderGears();
	}
	}
	if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
		renderEditor(true);
	}
}

function findHudGaugeEl(id, preferredHost) {
	const sel = `.hud-gauge[data-id="${cssAttr(id)}"]`;
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

function gaugeLayoutBox(gauge, iconSize = 0) {
	ensureGauge(gauge);
	if (normalizeGaugeType(gaugeSettings(gauge).type) === "frame") {
		return { w: Math.round(gauge.display.width), h: Math.round(gauge.display.height) };
	}
	if (normalizeGaugeShape(gaugeSettings(gauge).shape) === "arc") {
		const band = Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.display.height));
		const arcCore = gaugeArcMetrics(gauge);
		const capLayout = gaugeArcCapLayout(gauge, band);
		const arcGeom = gaugeArcCapGeometry(gauge, capLayout, arcCore);
		const metrics = gaugeArcLayoutMetrics(gauge, band, arcGeom, arcCore);
		return { w: metrics.layoutW, h: metrics.layoutH };
	}
	const metrics = gaugeBarLayoutMetrics(gauge, iconSize || gauge.display.height);
	return { w: metrics.layoutW, h: metrics.layoutH };
}

function layoutHudGauge(el, gauge) {
	ensureGauge(gauge);
	applyHostMaxAlpha(el, gauge);
	if (normalizeGaugeType(gaugeSettings(gauge).type) === "frame") {
		const { w, h } = gaugeLayoutBox(gauge);
		const css = hudItemLayoutCss(gauge, w, h);
		el.style.left = `${css.x * 100}%`;
		el.style.top = `${css.y * 100}%`;
		el.style.width = `${w}px`;
		el.style.height = `${h}px`;
		el.style.setProperty("--gauge-rot", "0deg");
		el.style.setProperty("--gauge-frame-rot", `${gauge.display.rotation || 0}deg`);
		delete el.dataset.barLayout;
		delete el.dataset.arcLayout;
		return;
	}
	const shape = normalizeGaugeShape(gaugeSettings(gauge).shape);
	const isBar = shape === "bar";
	const isArc = shape === "arc";
	const iconSize = isBar
		? Math.round(gauge.display.height)
		: isArc
			? Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.display.height))
			: 0;
	const { w, h } = gaugeLayoutBox(gauge, iconSize);
	const css = hudItemLayoutCss(gauge, w, h);
	el.style.left = `${css.x * 100}%`;
	el.style.top = `${css.y * 100}%`;
	el.style.width = `${w}px`;
	el.style.height = `${h}px`;
	if (isBar) {
		el.style.setProperty("--gauge-rot", "0deg");
		const capLayout = gaugeBarCapLayout(gauge, iconSize);
		const capGeom = gaugeBarCapGeometry(gauge, capLayout);
		const metrics = gaugeBarLayoutMetrics(gauge, iconSize, capGeom);
		const rotor = ensureGaugeBarRotor(el);
		rotor.style.left = `${metrics.rotorLeft}px`;
		rotor.style.top = `${metrics.rotorTop}px`;
		rotor.style.width = `${metrics.barW}px`;
		rotor.style.height = `${metrics.barH}px`;
		rotor.style.setProperty("--gauge-rot", `${gauge.display.rotation || 0}deg`);
		el.dataset.barLayout = JSON.stringify({
			layoutW: metrics.layoutW,
			layoutH: metrics.layoutH,
			rotorLeft: metrics.rotorLeft,
			rotorTop: metrics.rotorTop,
			barW: metrics.barW,
			barH: metrics.barH
		});
		delete el.dataset.arcLayout;
	} else if (isArc) {
		el.style.setProperty("--gauge-rot", "0deg");
		const band = iconSize;
		const arcCore = gaugeArcMetrics(gauge);
		const capLayout = gaugeArcCapLayout(gauge, band);
		const arcGeom = gaugeArcCapGeometry(gauge, capLayout, arcCore);
		const metrics = gaugeArcLayoutMetrics(gauge, band, arcGeom, arcCore);
		const rotor = ensureGaugeArcRotor(el);
		rotor.style.left = `${metrics.rotorLeft}px`;
		rotor.style.top = `${metrics.rotorTop}px`;
		rotor.style.width = `${metrics.arcW}px`;
		rotor.style.height = `${metrics.arcH}px`;
		rotor.style.setProperty("--gauge-rot", `${gauge.display.rotation || 0}deg`);
		ensureGaugeArcZones(el);
		el.dataset.arcLayout = JSON.stringify({
			layoutW: metrics.layoutW,
			layoutH: metrics.layoutH,
			rotorLeft: metrics.rotorLeft,
			rotorTop: metrics.rotorTop,
			arcW: metrics.arcW,
			arcH: metrics.arcH
		});
		delete el.dataset.barLayout;
	} else {
		el.style.setProperty("--gauge-rot", `${gauge.display.rotation || 0}deg`);
		delete el.dataset.barLayout;
		delete el.dataset.arcLayout;
	}
}

function syncHudGauge(gauge) {
	const el = findHudGaugeEl(gauge.id);
	if (!el) {
		return;
	}
	layoutHudGauge(el, gauge);
	paintGauge(el, gauge);
	el.dataset.styleSig = gaugeStyleSig(gauge);
}

function gaugeBorderColor(gauge) {
	return optionalHex(gaugeSettings(gauge).borderColor) || themeBorder();
}

function gaugeLinked(gauge) {
	const src = sourceFor(gauge.sourceMod, gauge.varName);
	const gear = gearBySource(gauge.sourceMod, gauge.varName);
	return { src, gear };
}

/** Geometry/style fingerprint — when unchanged, HUD sync can live-patch fill/count only. */
function gaugeStyleSig(gauge) {
	const s = gaugeSettings(gauge);
	const { src, gear } = gaugeLinked(gauge);
	const icon = src && typeof sourceIconPath === "function" ? sourceIconPath(src, gear) : "";
	return [
		s.type,
		s.shape,
		s.displayMode,
		s.frameShape,
		gauge.display.x,
		gauge.display.y,
		gauge.display.width,
		gauge.display.height,
		gauge.display.rotation,
		s.borderColor,
		s.borderThickness,
		s.troughOpacity,
		s.endCap,
		s.endCapMode,
		s.endCapOverlap,
		s.showIcon,
		s.showLabel,
		s.showNumber,
		s.fillDirection,
		s.numberFormat,
		s.fontSize,
		s.iconColorMode,
		s.labelColorMode,
		s.numberColorMode,
		s.frameFillColor,
		s.frameBorderColor,
		s.frameBorderThickness,
		s.insideSize,
		s.barTrough,
		s.neverHide,
		s.pictureIcon,
		s.pictureDirection,
		s.pictureRotation,
		s.pictureEmpty,
		s.pictureFull,
		s.pictureFade,
		gauge.sourceMod,
		gauge.varName,
		icon,
		// Gear label text (stock titles follow UI language) — must invalidate live-patch reuse.
		typeof gearTitleSig === "function"
			? gearTitleSig(src, gear)
			: typeof sourceTitle === "function"
				? sourceTitle(src, gear && gear.varName, gear)
				: ""
	].join("|");
}

function patchHudGaugeLive(el, gauge) {
	if (!el || !gauge) {
		return;
	}
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	if (normalizeGaugeType(gaugeSettings(gauge).type) === "frame") {
		if (typeof patchGaugeFrameLive === "function") {
			patchGaugeFrameLive(el, gauge, src, gear);
		}
		return;
	}
	if (normalizeGaugeShape(gaugeSettings(gauge).shape) === "arc") {
		patchGaugeArcLive(el, gauge, src, gear);
		} else {
		patchGaugeBarLive(el, gauge, src, gear);
	}
	const text = src ? formatGaugeCountValue(gauge, src) : "";
	const countPaint = src ? gaugeCountPaint(gauge, src, gear) : "";
	for (const countEl of el.querySelectorAll(".gauge-gear-count")) {
		if (countEl.hidden) {
			continue;
		}
		countEl.textContent = text;
		countEl.classList.toggle("is-default-color", !countPaint);
		countEl.style.color = countPaint || "";
	}
	// Title colour can track bar/icon ramps — refresh on live ticks (full paint is skipped).
	const labelPaint = src ? gaugeLabelPaint(gauge, src, gear) : "";
	for (const labelEl of el.querySelectorAll(".gauge-gear-label")) {
		if (labelEl.hidden) {
			continue;
		}
		labelEl.classList.toggle("is-default-color", !labelPaint);
		labelEl.style.color = labelPaint || "";
	}
}

function paintGauge(el, gauge) {
	ensureGauge(gauge);
	if (normalizeGaugeType(gaugeSettings(gauge).type) === "frame") {
		if (typeof paintGaugeFrame === "function") {
			paintGaugeFrame(el, gauge);
		}
	} else if (normalizeGaugeShape(gaugeSettings(gauge).shape) === "arc") {
		paintGaugeArc(el, gauge);
	} else {
		paintGaugeBar(el, gauge);
	}
	syncGaugeHandleBounds(el);
}

/** Host element that owns resize/rotate handles (rotated with the painted meter when possible). */
function gaugeHandleHost(el) {
	if (!el) {
		return null;
	}
	if (el.classList.contains("hud-gauge-frame")) {
		return el.querySelector(".gauge-frame-handle-layer") || el;
	}
	if (el.classList.contains("hud-gauge-bar")) {
		return el.querySelector(".gauge-bar-rotor") || el;
	}
	if (el.classList.contains("hud-gauge-arc")) {
		return el.querySelector(".gauge-arc-rotor") || el;
	}
	return el;
}

function clearGaugeHandleBoxVars(node) {
	if (!node || !node.style) {
			return;
		}
	node.style.removeProperty("--handle-left");
	node.style.removeProperty("--handle-top");
	node.style.removeProperty("--handle-width");
	node.style.removeProperty("--handle-height");
	node.style.removeProperty("--handle-rotate-gap");
}

function setGaugeHandleBoxVars(node, pad, rotateGap, w, h) {
	node.style.setProperty("--handle-left", `${pad}px`);
	node.style.setProperty("--handle-top", `${pad}px`);
	node.style.setProperty("--handle-width", `${Math.max(1, w - pad * 2)}px`);
	node.style.setProperty("--handle-height", `${Math.max(1, h - pad * 2)}px`);
	node.style.setProperty("--handle-rotate-gap", `${rotateGap}px`);
}

/** Tight resize/rotate handles to painted gauge content (not the full layout margin box). */
function syncGaugeHandleBounds(el) {
	if (!el || !el.classList.contains("hud-gauge")) {
		return;
	}
	const pad = 6;
	const rotateGap = 22;
	const isArc = el.classList.contains("hud-gauge-arc");
	const isBar = el.classList.contains("hud-gauge-bar");
	const isFrame = el.classList.contains("hud-gauge-frame");
	// Frame / bar / arc: size the unrotated local box. Handles live on a rotated host
	// (frame layer or meter rotor) so they turn with the gauge — not a screen AABB.
	if (isFrame || isBar || isArc) {
		const host = gaugeHandleHost(el);
		const boxNode = isFrame ? el : host || el;
		const w = boxNode.clientWidth || boxNode.offsetWidth || 0;
		const h = boxNode.clientHeight || boxNode.offsetHeight || 0;
		if (!w || !h) {
			clearGaugeHandleBoxVars(el);
			if (host && host !== el) {
				clearGaugeHandleBoxVars(host);
			}
			return;
		}
		if (host && host !== el) {
			clearGaugeHandleBoxVars(el);
			setGaugeHandleBoxVars(host, pad, rotateGap, w, h);
	} else {
			setGaugeHandleBoxVars(el, pad, rotateGap, w, h);
		}
			return;
		}
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
		if (child.classList.contains("gauge-frame-handle-layer")) {
			continue;
		}
			includeRect(child.getBoundingClientRect());
	}
	if (!found) {
		clearGaugeHandleBoxVars(el);
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
}

function gaugeHudShape(gauge) {
	if (normalizeGaugeType(gaugeSettings(gauge).type) === "frame") {
		return `frame:${normalizeGaugeDisplayMode(gaugeSettings(gauge).displayMode)}:${String(gaugeSettings(gauge).frameShape || "")}`;
	}
	return normalizeGaugeShape(gaugeSettings(gauge).shape);
}

function attachGaugeHandles(el, gauge) {
	el.classList.add("is-editable");
	for (const old of el.querySelectorAll(".hud-handle")) {
		old.remove();
	}
	let host = el;
	if (el.classList.contains("hud-gauge-frame")) {
		host = el.querySelector(".gauge-frame-handle-layer");
		if (!host) {
			host = document.createElement("div");
			host.className = "gauge-frame-handle-layer";
			el.appendChild(host);
		}
	} else {
		host = gaugeHandleHost(el) || el;
	}
	const rotateHandle = document.createElement("div");
	rotateHandle.className = "hud-handle hud-handle-rotate";
	rotateHandle.addEventListener("pointerdown", (ev) => beginGaugeDrag(ev, gauge.id, "rotate"));
	host.appendChild(rotateHandle);
	for (const mode of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
		const handle = document.createElement("div");
		handle.className = `hud-handle hud-handle-resize hud-handle-${mode}`;
		handle.addEventListener("pointerdown", (ev) => beginGaugeDrag(ev, gauge.id, `resize-${mode}`));
		host.appendChild(handle);
	}
	el.addEventListener("pointerdown", (ev) => {
		if (ev.target.closest(".hud-handle")) {
			return;
		}
		beginGaugeDrag(ev, gauge.id, "move");
	});
	syncGaugeHandleBounds(el);
}

function buildGaugeEl(gauge, preview) {
	ensureGauge(gauge);
	if (normalizeGaugeType(gaugeSettings(gauge).type) === "frame") {
		if (typeof buildGaugeFrameEl === "function") {
			return buildGaugeFrameEl(gauge, preview);
		}
	}
	if (normalizeGaugeShape(gaugeSettings(gauge).shape) === "arc") {
		return buildGaugeArcEl(gauge, preview);
	}
	return buildGaugeBarEl(gauge, preview);
}

function syncHudGauges(root, frontRoot, preview) {
	const now = Date.now();
	const keep = new Set();
	for (const gauge of snapshot.gauges || []) {
		safeCall(`syncHudGauge:${gauge && gauge.id != null ? gauge.id : "?"}`, () => {
		ensureGauge(gauge);
		const isFront =
			preview && (activeGaugeId === gauge.id || (activeTab === "gauges" && openGaugeId === gauge.id));
		const visibility = normalizeVisibility(gauge.visibility);
		// none: editor preview only; hud: with vanilla HUD; ui: also while soft-hidden (menus).
		if (visibility === "none" && !preview) {
			return;
		}
		// neverHide blocks soft-hide (Hide when + inactive timers); it must not override Gauge Visibility HUD.
		if (visibility === "hud" && !hudVisible && !preview) {
			return;
		}
		const neverHide = !!gaugeSettings(gauge).neverHide;
		const { src, gear } = gaugeLinked(gauge);
			// isHudHidden covers hideAt and inactive timers (gearHudAlpha / isInactiveTimer).
			const hidden = !neverHide && !!(src && isHudHidden(src, gear));
		const fadeKey = hudGaugeFadeKey(gauge.id);
		if (!hudFadeShouldShow(fadeKey, hidden && !isFront, preview, now)) {
				return;
		}
		keep.add(gauge.id);
		const dest = isFront && frontRoot ? frontRoot : root;
		let el = findHudGaugeEl(gauge.id, dest);
		const shape = gaugeHudShape(gauge);
		if (!el || el.parentElement !== dest || el.dataset.gaugeShape !== shape) {
			if (el && el.parentElement) {
				el.parentElement.removeChild(el);
			}
			el = buildGaugeEl(gauge, preview);
			dest.appendChild(el);
				el.dataset.styleSig = gaugeStyleSig(gauge);
		} else {
			el.classList.toggle("is-front", isFront);
			el.classList.toggle("is-editable", preview);
				const styleSig = gaugeStyleSig(gauge);
				if (el.dataset.styleSig !== styleSig) {
			layoutHudGauge(el, gauge);
			paintGauge(el, gauge);
					el.dataset.styleSig = styleSig;
				} else {
					patchHudGaugeLive(el, gauge);
				}
			if (preview) {
				const handleHost = gaugeHandleHost(el);
				const rotateHandle = el.querySelector(".hud-handle-rotate");
				const handlesOnHost = !!(rotateHandle && handleHost && rotateHandle.parentElement === handleHost);
				if (!rotateHandle || !handlesOnHost) {
					if (rotateHandle && handleHost && rotateHandle.parentElement !== handleHost) {
						attachGaugeHandles(el, gauge);
					} else {
				const fresh = buildGaugeEl(gauge, true);
				el.replaceWith(fresh);
				el = fresh;
						el.dataset.styleSig = gaugeStyleSig(gauge);
					}
				}
			}
			if (!preview) {
				for (const h of el.querySelectorAll(".hud-handle")) {
					h.remove();
				}
				el.classList.remove("is-editable");
			}
		}
		el.classList.toggle("is-front", isFront);
		el.classList.toggle("is-preview", visibility === "none");
		// CSS soft-hide only keeps data-visibility="ui". neverHide does not promote HUD → ui.
		el.dataset.visibility = visibility;
		applyHudFadeClasses(el, fadeKey, preview, now);
		});
	}
	syncGaugeHandleVisibility();
	const knownIds = new Set((snapshot.gauges || []).map((g) => g.id));
	for (const host of [root, frontRoot]) {
		if (!host) {
			continue;
		}
		for (const el of [...host.querySelectorAll(".hud-gauge")]) {
			if (keep.has(el.dataset.id)) {
				continue;
			}
			if (!hudVisible && !preview && knownIds.has(el.dataset.id)) {
			continue;
		}
			el.remove();
		}
	}
	reorderHudGauges(root);
	reorderHudGauges(frontRoot);
}


