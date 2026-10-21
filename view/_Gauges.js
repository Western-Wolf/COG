// COG overlay - Gauges (type-level: all gauge instances)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

const DEFAULT_GAUGE_WIDTH = 240;
const DEFAULT_GAUGE_HEIGHT = 24;
const MIN_GAUGE_WIDTH = 32;
const MIN_GAUGE_HEIGHT = 6;

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
		normalizeGaugeShape(gauge.shape) === "arc"
			? Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.height))
			: Math.round(gauge.height);
	const box = gaugeLayoutBox(gauge, iconSize);
	const aabb = hudItemAabbPx(gauge, box.w, box.h, w, h);
	drag = {
		kind: "gauge",
		id: gauge.id,
		mode,
		grabAabbX: ev.clientX - aabb.left,
		grabAabbY: ev.clientY - aabb.top,
		grabX: ev.clientX / w - (gauge.x ?? DEFAULT_HUD_X),
		grabY: ev.clientY / h - (gauge.y ?? DEFAULT_HUD_Y),
		startWidth: gauge.width,
		startHeight: gauge.height,
		startLayoutW: box.w,
		startLayoutH: box.h,
		startX: gauge.x,
		startY: gauge.y,
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
	const rad = -((Number(gauge.rotation) || 0) * Math.PI) / 180;
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
			normalizeGaugeShape(gauge.shape) === "arc"
				? Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.height))
				: Math.round(gauge.height);
		const box = gaugeLayoutBox(gauge, iconSize);
		const aabbSize = rotatedAabbSize(box.w, box.h, gauge.rotation || 0);
		let left = ev.clientX - (drag.grabAabbX || 0);
		let top = ev.clientY - (drag.grabAabbY || 0);
		left = Math.min(Math.max(0, left), Math.max(0, w - aabbSize.w));
		top = Math.min(Math.max(0, top), Math.max(0, h - aabbSize.h));
		gauge.x = left / w;
		gauge.y = top / h;
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
		gauge.rotation = Math.atan2(ev.clientY - sy, ev.clientX - sx) * (180 / Math.PI);
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
	const isArc = normalizeGaugeShape(gauge.shape) === "arc";
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
	const rad = ((Number(gauge.rotation) || 0) * Math.PI) / 180;
	const startAabb = rotatedAabbSize(
		drag.startLayoutW || drag.startWidth,
		drag.startLayoutH || startLayoutH,
		gauge.rotation || 0
	);
	const startCx = drag.startX * (window.innerWidth || 1) + startAabb.w / 2;
	const startCy = drag.startY * (window.innerHeight || 1) + startAabb.h / 2;
	const worldDx = midLocalX * Math.cos(rad) - midLocalY * Math.sin(rad);
	const worldDy = midLocalX * Math.sin(rad) + midLocalY * Math.cos(rad);
	gauge.width = Math.max(MIN_GAUGE_WIDTH, newW);
	if (isArc) {
		let thickness = drag.startHeight;
		if (axis.includes("n") || axis.includes("s")) {
			const boxH = Math.max(bottom - top, MIN_GAUGE_HEIGHT);
			thickness = Math.max(
				MIN_GAUGE_HEIGHT,
				Math.min(newW / 2 - 1, (boxH / Math.max(newLayoutH, 1)) * drag.startHeight)
			);
		}
		gauge.height = thickness;
	} else {
		gauge.height = Math.max(MIN_GAUGE_HEIGHT, newLayoutH);
	}
	const newCx = startCx + worldDx;
	const newCy = startCy + worldDy;
	const outBox = gaugeLayoutBox(gauge);
	const outAabb = rotatedAabbSize(outBox.w, outBox.h, gauge.rotation || 0);
	gauge.x = (newCx - outAabb.w / 2) / (window.innerWidth || 1);
	gauge.y = (newCy - outAabb.h / 2) / (window.innerHeight || 1);
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
	const order = [
		["showIcon", normalizeFrameSlot(gauge.showIcon)],
		["showNumber", normalizeFrameSlot(gauge.showNumber)],
		["showLabel", normalizeFrameSlot(gauge.showLabel)]
	];
	const claimed = new Set();
	for (const [key, slot] of order) {
		if (slot === "none") {
			gauge[key] = "none";
			continue;
		}
		if (claimed.has(slot)) {
			gauge[key] = "none";
		} else {
			claimed.add(slot);
			gauge[key] = slot;
		}
	}
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

function normalizeNumberFormatGauge(value) {
	const raw = String(value || "").trim();
	return NUMBER_FORMATS.includes(raw) ? raw : "barPercent";
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

function normalizeIconColorMode(value) {
	const v = String(value || "").toLowerCase();
	if (v === "border" || v === "useborder" || v === "use border colour" || v === "use border color") {
		return "border";
	}
	if (v === "bar" || v === "usebar" || v === "use bar colour" || v === "use bar color") {
		return "bar";
	}
	if (v === "label" || v === "uselabel" || v === "use label colour" || v === "use label color") {
		return "label";
	}
	return "keep";
}

function normalizeLabelColorMode(value) {
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
	return "keep";
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
	return {
		id: `gauge_${Date.now().toString(36)}`,
		displayName:
			typeof formatStockName === "function"
				? formatStockName("Gauge {num}", { num: n })
				: `Gauge ${n}`,
		type: "meter",
		shape: "bar",
		locked: false,
		visible: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: DEFAULT_GAUGE_WIDTH,
		height: DEFAULT_GAUGE_HEIGHT,
		gearMod: "",
		gearName: "",
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
		posAnchor: "tlc",
		frameShape: "Frames/circle.svg",
		frameFillColor: "",
		frameBorderColor: "",
		frameBorderThickness: 5,
		insideSize: 65,
		displayMode: "gear",
		alwaysVisible: false,
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

function ensureGauge(gauge) {
	if (!gauge || typeof gauge !== "object") {
		return gauge;
	}
	// Migration Code for Transition from v1.01 or earlier to v1.1: copy legacy title `name` into `displayName` when empty.
	if (!String(gauge.displayName || "").trim() && String(gauge.name || "").trim()) {
		gauge.displayName = String(gauge.name).trim();
	}
	if (typeof gauge.displayName !== "string") {
		gauge.displayName = "";
	}
	gauge.type = normalizeGaugeType(gauge.type);
	gauge.shape = normalizeGaugeShape(gauge.shape);
	gauge.locked = !!gauge.locked;
	gauge.visible = gauge.visible !== false;
	gauge.x = Number.isFinite(Number(gauge.x)) ? Number(gauge.x) : DEFAULT_HUD_X;
	gauge.y = Number.isFinite(Number(gauge.y)) ? Number(gauge.y) : DEFAULT_HUD_Y;
	gauge.rotation = Number(gauge.rotation) || 0;
	gauge.width = Math.max(MIN_GAUGE_WIDTH, Number(gauge.width) || DEFAULT_GAUGE_WIDTH);
	gauge.height = Math.max(MIN_GAUGE_HEIGHT, Number(gauge.height) || DEFAULT_GAUGE_HEIGHT);
	gauge.gearMod = String(gauge.gearMod || "");
	gauge.gearName = String(gauge.gearName || "");
	gauge.borderColor = String(gauge.borderColor || "");
	gauge.borderThickness = quantizeDec(Math.max(0, Math.min(50, Number(gauge.borderThickness) || 0)), 1);
	gauge.troughOpacity = quantizeDec(
		Math.max(0, Math.min(100, Number(gauge.troughOpacity) || DEFAULT_TROUGH_OPACITY)),
		0
	);
	const migratedCap = migrateEndCapPath(String(gauge.endCap || ""));
	gauge.endCapMode = normalizeEndCapMode(gauge.endCapMode, migratedCap);
	gauge.endCap = migratedCap || defaultEndCapArtPath();
	gauge.endCapOverlap = quantizeDec(Math.max(0, Math.min(45, Number(gauge.endCapOverlap) || 0)), 1);
	if (gauge.type === "frame") {
		gauge.showIcon = normalizeFrameSlot(gauge.showIcon);
		gauge.showLabel = normalizeFrameSlot(gauge.showLabel);
		gauge.showNumber = normalizeFrameSlot(gauge.showNumber);
	} else {
	gauge.showIcon = normalizeGaugePlacement(gauge.showIcon);
	gauge.showLabel = normalizeGaugePlacement(gauge.showLabel);
		gauge.showNumber = normalizeGaugePlacement(gauge.showNumber);
	}
	gauge.fillDirection = normalizeFillDirection(gauge.fillDirection);
	gauge.iconColorMode = normalizeIconColorMode(gauge.iconColorMode || "border");
	gauge.labelColorMode = normalizeLabelColorMode(gauge.labelColorMode || "border");
	gauge.numberColorMode = normalizeLabelColorMode(gauge.numberColorMode || "border");
	gauge.numberAsPercent = gauge.numberAsPercent === true;
	gauge.fontSize = Math.max(0, Number(gauge.fontSize) || 0);
	gauge.posAnchor = "tlc";
	gauge.frameShape = String(gauge.frameShape || "").trim() || defaultFrameShapePath();
	gauge.frameFillColor = String(gauge.frameFillColor || "");
	gauge.frameBorderColor = String(gauge.frameBorderColor || "");
	gauge.frameBorderThickness = quantizeDec(
		Math.max(
			0,
			Math.min(50, Number.isFinite(Number(gauge.frameBorderThickness)) ? Number(gauge.frameBorderThickness) : 5)
		),
		1
	);
	gauge.insideSize = quantizeDec(
		Math.max(5, Math.min(100, Number.isFinite(Number(gauge.insideSize)) ? Number(gauge.insideSize) : 65)),
		0
	);
	gauge.displayMode = normalizeGaugeDisplayMode(gauge.displayMode);
	if (gauge.alwaysVisible === undefined || gauge.alwaysVisible === null) {
		gauge.alwaysVisible = gauge.type === "frame";
	} else {
		gauge.alwaysVisible = !!gauge.alwaysVisible;
	}
	gauge.barTrough = gauge.barTrough === true;
	gauge.numberFormat = normalizeNumberFormatGauge(gauge.numberFormat);
	if (gauge.type === "frame") {
		repairFrameSlots(gauge);
	}
	gauge.pictureIcon = String(gauge.pictureIcon || "").trim() || defaultPictureIconPath();
	gauge.pictureDirection = normalizePictureDirection(gauge.pictureDirection);
	gauge.pictureRotation = Number(gauge.pictureRotation) || 0;
	gauge.pictureEmpty = optionalHex(gauge.pictureEmpty) || "#000000";
	gauge.pictureFull = optionalHex(gauge.pictureFull) || "#ffffff";
	gauge.pictureFade = optionalHex(gauge.pictureFade) || frameDefaultPictureFade();
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
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
		if (gauge[key] !== value) {
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
	Object.assign(gauge, patch);
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
	if (normalizeGaugeType(gauge.type) === "frame") {
		return { w: Math.round(gauge.width), h: Math.round(gauge.height) };
	}
	if (normalizeGaugeShape(gauge.shape) === "arc") {
		const band = Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.height));
		const arcCore = gaugeArcMetrics(gauge);
		const capLayout = gaugeArcCapLayout(gauge, band);
		const arcGeom = gaugeArcCapGeometry(gauge, capLayout, arcCore);
		const metrics = gaugeArcLayoutMetrics(gauge, band, arcGeom, arcCore);
		return { w: metrics.layoutW, h: metrics.layoutH };
	}
	const metrics = gaugeBarLayoutMetrics(gauge, iconSize || gauge.height);
	return { w: metrics.layoutW, h: metrics.layoutH };
}

function layoutHudGauge(el, gauge) {
	ensureGauge(gauge);
	if (normalizeGaugeType(gauge.type) === "frame") {
		const { w, h } = gaugeLayoutBox(gauge);
		const css = hudItemLayoutCss(gauge, w, h);
		el.style.left = `${css.x * 100}%`;
		el.style.top = `${css.y * 100}%`;
		el.style.width = `${w}px`;
		el.style.height = `${h}px`;
		el.style.setProperty("--gauge-rot", "0deg");
		el.style.setProperty("--gauge-frame-rot", `${gauge.rotation || 0}deg`);
		delete el.dataset.barLayout;
		delete el.dataset.arcLayout;
		return;
	}
	const shape = normalizeGaugeShape(gauge.shape);
	const isBar = shape === "bar";
	const isArc = shape === "arc";
	const iconSize = isBar
		? Math.round(gauge.height)
		: isArc
			? Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.height))
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
		rotor.style.setProperty("--gauge-rot", `${gauge.rotation || 0}deg`);
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
		rotor.style.setProperty("--gauge-rot", `${gauge.rotation || 0}deg`);
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
		el.style.setProperty("--gauge-rot", `${gauge.rotation || 0}deg`);
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
	return optionalHex(gauge.borderColor) || themeBorder();
}

function gaugeLinked(gauge) {
	const src = sourceFor(gauge.gearMod, gauge.gearName);
	const gear = gearBySource(gauge.gearMod, gauge.gearName);
	return { src, gear };
}

/** Geometry/style fingerprint — when unchanged, HUD sync can live-patch fill/count only. */
function gaugeStyleSig(gauge) {
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	const icon = src && typeof sourceIconPath === "function" ? sourceIconPath(src, gear) : "";
	return [
		gauge.type,
		gauge.shape,
		gauge.displayMode,
		gauge.frameShape,
		gauge.x,
		gauge.y,
		gauge.width,
		gauge.height,
		gauge.rotation,
		gauge.borderColor,
		gauge.borderThickness,
		gauge.troughOpacity,
		gauge.endCap,
		gauge.endCapMode,
		gauge.endCapOverlap,
		gauge.showIcon,
		gauge.showLabel,
		gauge.showNumber,
		gauge.fillDirection,
		gauge.numberFormat,
		gauge.fontSize,
		gauge.iconColorMode,
		gauge.labelColorMode,
		gauge.numberColorMode,
		gauge.frameFillColor,
		gauge.frameBorderColor,
		gauge.frameBorderThickness,
		gauge.insideSize,
		gauge.barTrough,
		gauge.alwaysVisible,
		gauge.pictureIcon,
		gauge.pictureDirection,
		gauge.pictureRotation,
		gauge.pictureEmpty,
		gauge.pictureFull,
		gauge.pictureFade,
		gauge.gearMod,
		gauge.gearName,
		icon,
		// Gear label text (stock titles follow UI language) — must invalidate live-patch reuse.
		typeof gearTitleSig === "function"
			? gearTitleSig(src, gear)
			: typeof sourceTitle === "function"
				? sourceTitle(src, gear && gear.name, gear)
				: ""
	].join("|");
}

function patchHudGaugeLive(el, gauge) {
	if (!el || !gauge) {
			return;
		}
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	if (normalizeGaugeType(gauge.type) === "frame") {
		if (typeof patchGaugeFrameLive === "function") {
			patchGaugeFrameLive(el, gauge, src, gear);
		}
			return;
		}
	if (normalizeGaugeShape(gauge.shape) === "arc") {
		patchGaugeArcLive(el, gauge, src, gear);
	} else {
		patchGaugeBarLive(el, gauge, src, gear);
	}
	const text = src ? formatGaugeCountValue(gauge, src) : "";
	const paint = src ? gaugeCountPaint(gauge, src, gear) : "";
	for (const countEl of el.querySelectorAll(".gauge-gear-count")) {
		if (countEl.hidden) {
			continue;
		}
	countEl.textContent = text;
	countEl.classList.toggle("is-default-color", !paint);
		countEl.style.color = paint || "";
	}
}

function paintGauge(el, gauge) {
	ensureGauge(gauge);
	if (normalizeGaugeType(gauge.type) === "frame") {
		if (typeof paintGaugeFrame === "function") {
			paintGaugeFrame(el, gauge);
		}
	} else if (normalizeGaugeShape(gauge.shape) === "arc") {
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
	if (normalizeGaugeType(gauge.type) === "frame") {
		return `frame:${normalizeGaugeDisplayMode(gauge.displayMode)}:${String(gauge.frameShape || "")}`;
	}
	return normalizeGaugeShape(gauge.shape);
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
	if (normalizeGaugeType(gauge.type) === "frame") {
		if (typeof buildGaugeFrameEl === "function") {
			return buildGaugeFrameEl(gauge, preview);
		}
	}
	if (normalizeGaugeShape(gauge.shape) === "arc") {
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
		if (!gauge.visible && !preview) {
				return;
		}
			const stayVisible = !!gauge.alwaysVisible;
			if (!hudVisible && !preview && !stayVisible) {
				return;
		}
		const { src, gear } = gaugeLinked(gauge);
			const hidden = !stayVisible && !!(src && isHudHidden(src, gear));
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


