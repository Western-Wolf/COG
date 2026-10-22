// COG overlay - Clock / Celestial gizmo (individual gizmo type)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).
// Independent of _Gauges*.js (celestial arc kernel forked in-file).

// --- Celestial arc kernel (forked from meter arc; Clock-owned, may diverge) ---
const CLOCK_ARC_CAP_OUT_PCT = 0.05;

function clockLabelLineBoxPx(fontPx) {
	return Math.ceil(Math.max(6, fontPx) * 1.05);
}

// Mask paint: use shared paintMaskedFace / resolveDisplayIconHref from _UI.js.

function clockClearOverlayAbsolute(node) {
	if (!node) {
		return;
	}
	node.style.left = "";
	node.style.right = "";
	node.style.top = "";
	node.style.bottom = "";
	node.style.width = "";
	node.style.maxWidth = "";
	node.style.maxHeight = "";
	node.style.minWidth = "";
	node.style.flex = "";
	node.style.alignSelf = "";
	node.style.overflow = "";
	node.style.textAlign = "";
	node.style.whiteSpace = "";
	node.style.overflowWrap = "";
	node.style.wordBreak = "";
	node.style.transform = "";
}

/** Overlay is owned by a cardinal zone container (not the gauge root). */

function clockArcHollowMetrics(arcLayout, iconSize, iconGap, arcGeom = null) {
	const W = Math.max(0, Math.round(Number(arcLayout && arcLayout.W) || 0));
	const layoutH = Math.max(0, Math.round(Number(arcLayout && arcLayout.layoutH) || 0));
	const band = Math.max(
		0,
		Math.round(Number(arcGeom && arcGeom.band) || Number(arcLayout && arcLayout.band) || iconSize)
	);
	const inset = arcGeom ? arcGeom.leftInnerX + iconGap : band + iconGap;
	const span = Math.max(24, W - inset * 2);
	return { W, layoutH, band, inset, span };
}

/** Fit arc hollow label/count to width and vertical room (preferred is still 50% of band). */

function clockArcRotRad(gauge) {
	return ((Number(gauge.position.rotation) || 0) * Math.PI) / 180;
}

function clockArcRotatePt(cx, cy, x, y, rad) {
	const dx = x - cx;
	const dy = y - cy;
	return {
		x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
		y: cy + dx * Math.sin(rad) + dy * Math.cos(rad)
	};
}

function clockArcFontSizePx(item, iconSize) {
	const itemH = item && item.position ? item.position.height : item && item.height;
	const autoBase = Math.max(1, Number(iconSize) || Number(itemH) || 24);
	if (Number(item && item.fontSize) > 0) {
		return Math.max(6, Math.round(Number(item.fontSize)));
	}
	return Math.max(9, Math.round(autoBase * 0.5));
}

function clockArcOverlayMargin(item, iconSize) {
	const labelSize = clockArcFontSizePx(item, iconSize);
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const stackH = iconSize + iconGap + labelSize + lineGap + labelSize + lineGap;
	const itemW = item && item.position ? item.position.width : item && item.width;
	const sideRoom = Math.max(48, Math.round((Number(itemW) || 120) * 0.55));
	return { stackH, sideRoom, iconGap, lineGap, labelSize };
}

function clockArcCapLayout(gauge, band) {
	const W = Math.round(gauge.position.width);
	const hasCaps = gaugeUsesEndArt(gauge) && !!resolveGaugeEndArtHref(gauge);
	const artPath = migrateEndCapPath(gauge.endCap);
	const capH = Math.max(MIN_GIZMO_HEIGHT, Math.round(band));
	const capW = hasCaps ? Math.max(1, Math.round(capH * endCapAspectRatio(artPath))) : 0;
	const overlapPx = hasCaps ? (W * gauge.endCapOverlap) / 100 : 0;
	const capOutPx = hasCaps ? (band * CLOCK_ARC_CAP_OUT_PCT) / 100 : 0;
	let contactIn = hasCaps ? overlapPx + capOutPx : 0;
	if (hasCaps && W % 2) {
		contactIn += 0.5;
	}
	if (hasCaps && band % 2) {
		contactIn += 0.5;
	}
	const capShift = hasCaps ? -capW + capH + Math.round(overlapPx) : 0;
	return { hasCaps, capW, capH, capShift, contactIn, W };
}

/** Arc-local edges for zone anchoring (0Â° = semicircle opening upward). */

/** Arc-local edges for zone anchoring (0Â° = semicircle opening upward). */
function clockArcCapGeometry(gauge, capLayout, arcCore) {
	const { W, band, layoutH, cx, cy } = arcCore;
	const { hasCaps, capW, capH } = capLayout;
	const zoneGap = Math.max(2, Math.round(capH * 0.1));
	const centerX = cx;
	const centerY = cy;
	const leftInnerX = band;
	const rightInnerX = W - band;
	let leftOuterX = 0;
	let rightOuterX = W;
	const topOuterY = 0;
	let bottomOuterY = layoutH;
	if (hasCaps && capW) {
		leftOuterX = Math.min(0, band - capW);
		rightOuterX = Math.max(W, W - band + capW);
		bottomOuterY = layoutH + capW;
	}
	return {
		arcW: W,
		arcH: layoutH,
		band,
		zoneGap,
		leftOuterX,
		rightOuterX,
		topOuterY,
		bottomOuterY,
		leftInnerX,
		rightInnerX,
		centerX,
		centerY,
		capW
	};
}

function clockArcLayoutMetrics(gauge, band, arcGeom, arcCore) {
	const arcW = arcCore.W;
	const arcH = arcCore.layoutH;
	const rad = clockArcRotRad(gauge);
	const margin = clockArcOverlayMargin(gauge, band);
	const geom = arcGeom || clockArcCapGeometry(gauge, clockArcCapLayout(gauge, band), arcCore);
	// Element size follows the visible arc only; icon/label zones overflow outside.
	const layoutW = arcW;
	const layoutH = arcH;
	const rotorLeft = 0;
	const rotorTop = 0;
	return {
		arcW,
		arcH,
		rad,
		layoutW,
		layoutH,
		rotorLeft,
		rotorTop,
		margin,
		arcGeom: geom,
		arcCore,
		arcCenterX: rotorLeft + arcW / 2,
		arcCenterY: rotorTop + arcH / 2
	};
}

function clockArcLocalToEl(metrics, lx, ly) {
	const { arcW, arcH, rad, rotorLeft, rotorTop } = metrics;
	const rotated = clockArcRotatePt(arcW / 2, arcH / 2, lx, ly, rad);
	return { x: rotorLeft + rotated.x, y: rotorTop + rotated.y };
}

function clockArcRegionSatelliteCenter(metrics, region, zoneW, zoneH) {
	const geom = metrics.arcGeom;
	if (!geom) {
		return clockArcLocalToEl(metrics, metrics.arcW / 2, metrics.arcH / 2);
	}
	return clockArcLocalToEl(metrics, geom.centerX, geom.centerY);
}

function clockPlaceZoneAt(node, anchor, transform) {
	if (!node) {
		return;
	}
	node.style.left = `${anchor.x}px`;
	node.style.top = `${anchor.y}px`;
	node.style.right = "auto";
	node.style.bottom = "auto";
	node.style.transform = transform;
}

/** Position hollow/content satellite at arc center (Clock only uses centered). */
function clockPlaceArcZoneSatellite(zoneEl, arcMetrics, region) {
	if (!zoneEl) {
		return;
	}
	const center = clockArcRegionSatelliteCenter(
		arcMetrics,
		region || "centered",
		zoneEl.offsetWidth,
		zoneEl.offsetHeight
	);
	clockPlaceZoneAt(zoneEl, center, "translate(-50%, -50%)");
}

function clockArcPoint(cx, cy, r, angle) {
	return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
}

function clockArcBandPathD({ cx, cy, ro, ri }) {
	const xo0 = cx - ro;
	const xo1 = cx + ro;
	const xi0 = cx - ri;
	const xi1 = cx + ri;
	return `M ${xo0} ${cy} A ${ro} ${ro} 0 0 1 ${xo1} ${cy} L ${xi1} ${cy} A ${ri} ${ri} 0 0 0 ${xi0} ${cy} Z`;
}

function clockArcOuterPathD({ cx, cy, ro }) {
	return `M ${cx - ro} ${cy} A ${ro} ${ro} 0 0 1 ${cx + ro} ${cy}`;
}

function clockArcInnerPathD({ cx, cy, ri }) {
	return `M ${cx - ri} ${cy} A ${ri} ${ri} 0 0 1 ${cx + ri} ${cy}`;
}

function clockArcMeterBorderPx(band, borderThicknessPct) {
	const borderPct = borderThicknessPct ?? 0;
	return borderPct <= 0 ? 0 : (band * borderPct) / 100;
}

function clockPaintArcBorders(borderOuter, borderInner, arcCore, borderColor, borderThicknessPct, endBorders) {
	const { cx, cy, ro, ri, band } = arcCore;
	const borderPx = clockArcMeterBorderPx(band, borderThicknessPct);
	const half = borderPx > 0 ? borderPx / 2 : 0;
	const paintBorderPath = (node, d) => {
		if (!node) {
			return;
		}
		node.setAttribute("d", d);
		if (borderPx > 0) {
			node.style.stroke = borderColor;
			node.style.strokeWidth = String(borderPx);
			node.style.opacity = "1";
		} else {
			node.style.stroke = "none";
			node.style.opacity = "0";
		}
	};
	paintBorderPath(
		borderOuter,
		half > 0 ? clockArcOuterPathD({ cx, cy, ro: Math.max(ri + 0.5, ro - half) }) : clockArcOuterPathD(arcCore)
	);
	paintBorderPath(
		borderInner,
		half > 0 ? clockArcInnerPathD({ cx, cy, ri: Math.min(ro - 0.5, ri + half) }) : clockArcInnerPathD(arcCore)
	);
	const endsOn = !!(endBorders && endBorders.enabled !== false && borderPx > 0);
	const paintEnd = (node, x0, x1) => {
		if (!node) {
			return;
		}
		if (!endsOn) {
			node.setAttribute("d", "");
			node.style.stroke = "none";
			node.style.opacity = "0";
			return;
		}
		node.setAttribute("d", `M ${x0} ${cy} L ${x1} ${cy}`);
		node.style.stroke = borderColor;
		node.style.strokeWidth = String(borderPx);
		node.style.strokeLinecap = "butt";
		node.style.opacity = "1";
	};
	if (endBorders) {
		paintEnd(endBorders.left, cx - ro, cx - ri);
		paintEnd(endBorders.right, cx + ri, cx + ro);
	}
}

function clockPaintEndCaps(gauge, { capL, capR, capH, capW, capShift, borderColor, arc = false, band = 0, contactIn = 0 }) {
	const capHref = resolveGaugeEndArtHref(gauge);
	if (arc) {
		// Semicircle ends are radial faces on the baseline (left: 0..band, right: W-band..W).
		// Rotate bar endcaps so the contact edge seats on that face; decoration hangs below.
		// contactIn > 0 pulls the seat up into the band (same role as bar overlap).
		const seat = Math.max(0, Math.round(band));
		const into = Math.max(0, contactIn);
		const paintArcCap = (node, side) => {
			if (!node) {
				return;
			}
			if (!capHref) {
				node.hidden = true;
				paintMaskedFace(node, "gizmo-celestial-endcap-face", { clear: true });
				return;
			}
			node.hidden = false;
			node.style.width = `${capW}px`;
			node.style.height = `${capH}px`;
			node.style.background = "";
			node.style.webkitMaskImage = "";
			node.style.maskImage = "";
			paintMaskedFace(node, "gizmo-celestial-endcap-face", { color: borderColor, href: capHref });
			node.style.top = "auto";
			node.style.bottom = `${into}px`;
			// Pivot on the contact edge (box right), at the inner corner of the end face.
			node.style.transformOrigin = "100% 100%";
			if (side === "left") {
				node.style.left = `${seat - capW}px`;
				node.style.right = "auto";
				node.style.transform = "rotate(-90deg)";
			} else {
				// right: band â‡’ box right edge at x = W - band (inner corner).
				node.style.right = `${seat}px`;
				node.style.left = "auto";
				node.style.transform = "rotate(90deg) scaleX(-1)";
			}
		};
		paintArcCap(capL, "left");
		paintArcCap(capR, "right");
		return;
	}
	const paintCap = (node, flip) => {
		if (!node) {
			return;
		}
		if (!capHref) {
			node.hidden = true;
			paintMaskedFace(node, "gizmo-celestial-endcap-face", { clear: true });
			return;
		}
		node.hidden = false;
		node.style.width = `${capW}px`;
		node.style.height = `${capH}px`;
		node.style.background = "";
		node.style.webkitMaskImage = "";
		node.style.maskImage = "";
		paintMaskedFace(node, "gizmo-celestial-endcap-face", { color: borderColor, href: capHref });
		node.style.top = "0";
		node.style.bottom = "auto";
		node.style.transform = flip ? "scaleX(-1)" : "";
		node.style.transformOrigin = "";
	};
	paintCap(capL, false);
	paintCap(capR, true);
	if (capL) {
		capL.style.left = `${capShift}px`;
		capL.style.right = "auto";
	}
	if (capR) {
		capR.style.right = `${capShift}px`;
		capR.style.left = "auto";
	}
}

function clockEnsureChrome(host, parts = {}) {
	if (!host) {
		return null;
	}
	let chrome = null;
	for (const child of host.children) {
		if (child.classList && child.classList.contains("gizmo-celestial-chrome")) {
			chrome = child;
			break;
		}
	}
	if (!chrome) {
		chrome = document.createElement("div");
		chrome.className = "gizmo-celestial-chrome";
		host.appendChild(chrome);
	}
	const border = parts.border || null;
	if (border && border.parentElement !== chrome) {
		chrome.appendChild(border);
	}
	for (const cap of parts.caps || []) {
		if (cap && cap.parentElement !== chrome) {
			chrome.appendChild(cap);
		}
	}
	return chrome;
}

// --- end celestial arc kernel ---

const MONTHS = [
	"Morning Star", "Sun's Dawn", "First Seed", "Rain's Hand",
	"Second Seed", "Midyear", "Sun's Height", "Last Seed",
	"Hearthfire", "Frostfall", "Sun's Dusk", "Evening Star"
];

const DEFAULT_GIZMO_WIDTH_TEXT = 240;
const DEFAULT_GIZMO_HEIGHT_TEXT = 48;
const DEFAULT_GIZMO_WIDTH_CELESTIAL = 275;
const DEFAULT_GIZMO_HEIGHT_CELESTIAL = 40;

const DEFAULT_GIZMO_CELESTIAL_COLOR = "#ffffff";

const CLOCK_TYPE_ID = "cog-clock";

/** Harvestable [tag, en-CA] pairs — clock display token chips / picker. */
const CLOCK_TOKENS = {
	dayOfWeek: ["cog-clock-token-day-of-week", "Day of week"],
	day: ["cog-clock-token-day", "Day"],
	dayOrdinal: ["cog-clock-token-day-ordinal", "Day + suffix"],
	month: ["cog-clock-token-month", "Month"],
	year: ["cog-clock-token-year", "Year"],
	time12: ["cog-clock-token-time-12h", "Time (12h)"],
	time24: ["cog-clock-token-time-24h", "Time (24h)"]
};
const CLOCK_TOKEN_IDS = Object.keys(CLOCK_TOKENS);
const SEASON_ICONS = {
	spring: "Seasons/spring.svg",
	summer: "Seasons/summer.svg",
	autumn: "Seasons/autumn.svg",
	winter: "Seasons/winter.svg"
};
const MOON_PHASE_ICONS = [
	"Celestial/moonphase-full.svg",
	"Celestial/moonphase-waning-gibbous.svg",
	"Celestial/moonphase-last-quarter.svg",
	"Celestial/moonphase-waning-crescent.svg",
	"Celestial/moonphase-new.svg",
	"Celestial/moonphase-waxing-crescent.svg",
	"Celestial/moonphase-first-quarter.svg",
	"Celestial/moonphase-waxing-gibbous.svg"
];

function normalizeGizmoDisplayMode(value) {
	return String(value || "").toLowerCase() === "celestial" ? "celestial" : "text";
}

function normalizeCelestialShow(value) {
	const v = String(value || "").toLowerCase();
	if (v === "always" || v === "all") {
		return "always";
	}
	if (v === "sky") {
		return "sky";
	}
	return "outdoors";
}

function normalizeClockIcon(value) {
	const v = String(value || "").toLowerCase();
	if (v === "clock" || v === "wait") {
		return "clock";
	}
	if (v === "season" || v === "seasons") {
		return "season";
	}
	return "none";
}

function tamrielSeasonFromMonth(month) {
	const m = Math.floor(Number(month) || 0);
	if (m >= 2 && m <= 4) {
		return "spring";
	}
	if (m >= 5 && m <= 7) {
		return "summer";
	}
	if (m >= 8 && m <= 10) {
		return "autumn";
	}
	return "winter";
}

function resolveClockIconHref(gizmo, src) {
	const kind = normalizeClockIcon(gizmo.settings.clockIcon);
	if (kind === "none") {
		return "";
	}
	if (kind === "clock") {
		return resolveDisplayIconHref("Actions/wait.svg");
	}
	if (kind === "season") {
		const month = src && src.month != null ? src.month : 0;
		const season = tamrielSeasonFromMonth(month);
		return resolveDisplayIconHref(SEASON_ICONS[season] || SEASON_ICONS.winter);
	}
	return "";
}

function normalizeSkyMode(value) {
	const v = String(value || "").toLowerCase();
	if (v === "full") {
		return "full";
	}
	if (v === "skydome" || v === "skydomeonly") {
		return "skydome";
	}
	if (v === "interior") {
		return "interior";
	}
	return "none";
}

function celestialSkyAllowsShow(setting, skyMode) {
	const mode = normalizeSkyMode(skyMode);
	if (normalizeCelestialShow(setting) === "always") {
		return true;
	}
	if (normalizeCelestialShow(setting) === "sky") {
		return mode === "full" || mode === "skydome";
	}
	return mode === "full";
}

function celestialBodyActive(cel, key) {
	if (!cel) {
		return false;
	}
	if (key === "sun") {
		return cel.sunActive === true || cel.sunVisible === true;
	}
	if (key === "masser") {
		return cel.masserActive === true || cel.masserVisible === true;
	}
	if (key === "secunda") {
		return cel.secundaActive === true || cel.secundaVisible === true;
	}
	return false;
}

function shouldShowCelestialBody(gizmo, cel, key) {
	if (!cel || !celestialBodyActive(cel, key)) {
		return false;
	}
	return celestialSkyAllowsShow(gizmo.settings.celestialShow, cel.skyMode);
}

function normalizeTimeFormat(value) {
	const v = String(value || "").toLowerCase();
	return v === "12h" || v === "12" || v === "ampm" ? "12h" : "24h";
}

function defaultDisplayLines() {
	return [["dayOfWeek"], ["day", "month", "year"], ["time24"]];
}

function normalizeClockLineToken(token, timeFormat) {
	if (token === "era") {
		return [];
	}
	if (token === "time") {
		return normalizeTimeFormat(timeFormat) === "12h" ? ["time12"] : ["time24"];
	}
	if (CLOCK_TOKEN_IDS.includes(token)) {
		return [token];
	}
	return [];
}

function normalizeDisplayLines(raw, timeFormat) {
	if (!Array.isArray(raw)) {
		return defaultDisplayLines();
	}
	const tf = normalizeTimeFormat(timeFormat);
	const lines = raw
		.map((line) => {
			if (!Array.isArray(line)) {
				return [];
			}
			const tokens = [];
			for (const token of line) {
				tokens.push(...normalizeClockLineToken(token, tf));
			}
			return tokens;
		})
		.filter((line) => line.length);
	return lines.length ? lines : defaultDisplayLines();
}

function defaultClockGizmo(n) {
	const settings = {
		displayMode: "celestial",
		displayLines: defaultDisplayLines(),
		fontSize: DEFAULT_GIZMO_FONT_SIZE,
		timeFormat: "24h",
		endCapMode: "border",
		endCap: defaultEndCapArtPath(),
		endCapOverlap: 0,
		borderThickness: DEFAULT_BORDER_THICKNESS_PCT,
		celestialShow: "always",
		textAlign: "center",
		clockIcon: "season",
		iconColor: DEFAULT_GIZMO_GOLD,
		textColor: DEFAULT_GIZMO_GOLD,
		borderColor: DEFAULT_GIZMO_GOLD,
		celestialColor: DEFAULT_GIZMO_CELESTIAL_COLOR
	};
	settings.displayName =
		typeof formatStockName === "function"
			? formatStockName("Clock {num}", { num: n })
			: `Clock ${n}`;
	return {
		id: `gizmo_${Date.now().toString(36)}`,
		typeId: "cog-clock",
		visibility: "hud",
		position: {
			x: DEFAULT_HUD_X,
			y: DEFAULT_HUD_Y,
			rotation: 0,
			width: DEFAULT_GIZMO_WIDTH_CELESTIAL,
			height: DEFAULT_GIZMO_HEIGHT_CELESTIAL
		},
		settings,
		settingsJson: JSON.stringify(settings)
	};
}
function ensureClockGizmo(gizmo) {
	ensureGizmoDisplayName(gizmo);
	const s = ensureGizmoSettings(gizmo);
	s.displayMode = normalizeGizmoDisplayMode(s.displayMode);
	if (!Array.isArray(s.displayLines) || !s.displayLines.length) {
		s.displayLines = defaultDisplayLines();
	}
	s.timeFormat = normalizeTimeFormat(s.timeFormat);
	s.displayLines = normalizeDisplayLines(s.displayLines, s.timeFormat);
	const mode = s.displayMode;
	const defW = mode === "celestial" ? DEFAULT_GIZMO_WIDTH_CELESTIAL : DEFAULT_GIZMO_WIDTH_TEXT;
	const defH = mode === "celestial" ? DEFAULT_GIZMO_HEIGHT_CELESTIAL : DEFAULT_GIZMO_HEIGHT_TEXT;
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation/width/height move under nested "position" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	migrateEntityPosition(gizmo, {
		sized: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: defW,
		height: defH,
		minW: MIN_GIZMO_WIDTH,
		minH: MIN_GIZMO_HEIGHT
	});
	s.fontSize = Math.max(0, Number(s.fontSize) || 0);
	s.timeFormat = normalizeTimeFormat(s.timeFormat);
	s.endCapMode = normalizeEndCapMode(s.endCapMode, s.endCap);
	s.endCap = migrateEndCapPath(String(s.endCap || "")) || defaultEndCapArtPath();
	s.endCapOverlap = quantizeDec(Math.max(0, Math.min(45, Number(s.endCapOverlap) || 0)), 1);
	{
		const thickRaw = Number(s.borderThickness);
		s.borderThickness = Number.isFinite(thickRaw)
			? quantizeDec(Math.max(0, Math.min(50, thickRaw)), 1)
			: DEFAULT_BORDER_THICKNESS_PCT;
	}
	s.celestialShow = normalizeCelestialShow(s.celestialShow);
	s.textAlign = normalizeClockTextAlign(s.textAlign);
	s.clockIcon = normalizeClockIcon(s.clockIcon);
	s.iconColor = optionalHex(s.iconColor);
	s.textColor = optionalHex(s.textColor);
	s.borderColor = optionalHex(s.borderColor);
	s.celestialColor = optionalHex(s.celestialColor);
	gizmo.visibility = coalesceGizmoVisibility(gizmo, "cog-clock");
	gizmo.settings = s;
	gizmo.settingsJson = JSON.stringify(s);
	return gizmo;
}

function clockCelestial() {
	const src = clockGameTime();
	return src && src.celestial ? src.celestial : null;
}

function clockGameTime() {
	return snapshot.gameTime || null;
}

function formatClockToken(token, gizmo, src) {
	if (!src) {
		return "";
	}
	switch (token) {
	case "dayOfWeek":
		return src.dayName || "";
	case "day":
		return String(Math.floor(src.day || 1));
	case "dayOrdinal": {
		const day = Math.floor(src.day || 1);
		const suffix = src.ordinalSuffix || "";
		return suffix ? `${day}${suffix}` : String(day);
	}
	case "month":
		return src.monthName || MONTHS[src.month] || "";
	case "year": {
		const yr = src.year ? String(src.year) : "";
		return yr ? `4E ${yr}` : "";
	}
	case "time12": {
		const hour = Math.floor(src.hour || 0);
		const minute = src.minute || 0;
		const h12 = hour % 12 || 12;
		const ampm = hour < 12 ? "AM" : "PM";
		return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
	}
	case "time24": {
		const hour = Math.floor(src.hour || 0);
		const minute = src.minute || 0;
		return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
	}
	case "era":
		return "";
	case "time": {
		const hour = Math.floor(src.hour || 0);
		const minute = src.minute || 0;
		if (normalizeTimeFormat(gizmo.settings.timeFormat) === "12h") {
			const h12 = hour % 12 || 12;
			const ampm = hour < 12 ? "AM" : "PM";
			return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
		}
		return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
	}
	default:
		return "";
	}
}

function formatClockLine(gizmo, src, lineTokens) {
	const parts = (lineTokens || [])
		.map((token) => formatClockToken(token, gizmo, src))
		.filter((part) => part && String(part).trim());
	return parts.join(" ");
}

function gizmoClockIconSize(gizmo) {
	ensureGizmo(gizmo);
	if (normalizeClockIcon(gizmo.settings.clockIcon) === "none") {
		return 0;
	}
	if (normalizeGizmoDisplayMode(gizmo.settings.displayMode) === "celestial") {
		return Math.max(MIN_GIZMO_HEIGHT, Math.round(gizmo.position.height));
	}
	return Math.max(16, Math.round(gizmoFontSizePx(gizmo) * 1.15));
}

function gizmoClockIconGap(gizmo) {
	const icon = gizmoClockIconSize(gizmo);
	if (!icon) {
		return 0;
	}
	if (normalizeGizmoDisplayMode(gizmo.settings.displayMode) === "celestial") {
		return Math.max(2, Math.round(icon * 0.1));
	}
	return Math.max(4, Math.round(gizmoFontSizePx(gizmo) * 0.28));
}

function gizmoClockBlockHeight(gizmo) {
	ensureGizmo(gizmo);
	const textH = gizmoTextBlockHeight(gizmo);
	const icon = gizmoClockIconSize(gizmo);
	if (!icon) {
		return textH;
	}
	const gap = gizmoClockIconGap(gizmo);
	const align = normalizeClockTextAlign(gizmo.settings.textAlign);
	if (align === "center") {
		return textH + icon + gap;
	}
	return Math.max(textH, icon);
}

function gizmoTextBlockHeight(gizmo) {
	ensureGizmo(gizmo);
	const lines = gizmo.settings.displayLines.length;
	const font = gizmoFontSizePx(gizmo);
	return Math.max(font + 4, lines * (font + 4));
}

function gizmoArcMetricsFromGizmo(gizmo) {
	const W = Math.round(gizmo.position.width);
	const band = Math.max(MIN_GIZMO_HEIGHT, Math.round(gizmo.position.height));
	const ro = W / 2;
	const ri = Math.max(1, ro - band);
	const cx = W / 2;
	const cy = ro;
	return { W, band, ro, ri, cx, cy, layoutH: ro };
}

function celestialArcLayoutGauge(gizmo) {
	ensureGizmo(gizmo);
	return {
		position: {
			width: gizmo.position.width,
			rotation: gizmo.position.rotation || 0
		},
		endCapMode: gizmo.settings.endCapMode,
		endCap: gizmo.settings.endCap,
		endCapOverlap: gizmo.settings.endCapOverlap
	};
}

function celestialArcCapExtend(gizmo) {
	const arc = gizmoArcMetricsFromGizmo(gizmo);
	const capLayout = clockArcCapLayout(celestialArcLayoutGauge(gizmo), arc.band);
	return capLayout.hasCaps ? capLayout.capW : 0;
}

function celestialGizmoArcMetrics(gizmo) {
	const arcCore = gizmoArcMetricsFromGizmo(gizmo);
	const band = arcCore.band;
	const capGauge = celestialArcLayoutGauge(gizmo);
	const capLayout = clockArcCapLayout(capGauge, band);
	const arcGeom = clockArcCapGeometry(capGauge, capLayout, arcCore);
	return clockArcLayoutMetrics(capGauge, band, arcGeom, arcCore);
}

function ensureGizmoCelestialRotor(el) {
	const hollow = el.querySelector(".gizmo-celestial-hollow");
	if (hollow && hollow.parentElement !== el) {
		el.appendChild(hollow);
	}
	let rotor = el.querySelector(".gizmo-celestial-rotor");
	if (!rotor) {
		rotor = document.createElement("div");
		rotor.className = "gizmo-celestial-rotor";
		const track = el.querySelector(".gizmo-celestial-track");
		el.insertBefore(rotor, el.firstChild);
		if (track) {
			rotor.appendChild(track);
		}
	}
	const track = rotor.querySelector(".gizmo-celestial-track") || el.querySelector(".gizmo-celestial-track");
	const capL = el.querySelector(".gizmo-celestial-endcap-left");
	const capR = el.querySelector(".gizmo-celestial-endcap-right");
	if (track) {
		clockEnsureChrome(track, { caps: [capL, capR] });
	}
	return rotor;
}

function ensureGizmoCelestialHollow(el) {
	let hollow = el.querySelector(".gizmo-celestial-hollow");
	if (!hollow) {
		hollow = document.createElement("div");
		hollow.className = "gizmo-celestial-hollow";
		hollow.hidden = true;
		hollow.innerHTML = `
			<div class="gizmo-celestial-slot is-left"></div>
			<div class="gizmo-celestial-copy"></div>
			<div class="gizmo-celestial-slot is-right"></div>`;
		el.appendChild(hollow);
	}
	if (hollow.parentElement !== el) {
		el.appendChild(hollow);
	}
	return hollow;
}

function gizmoCelestialHollowHeight(gizmo, iconSize, iconGap) {
	const font = gizmoFontSizePx(gizmo);
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const lineH = clockLabelLineBoxPx(Math.max(9, Math.round(font)));
	const lines = Math.max(1, (gizmo.settings.displayLines || []).length);
	const align = normalizeClockTextAlign(gizmo.settings.textAlign);
	const hasIcon = iconSize > 0;
	let copyH = 0;
	if (hasIcon && align === "center") {
		copyH += iconSize;
	}
	if (lines > 0) {
		const textBlock = lines * lineH + lineGap * Math.max(0, lines - 1);
		copyH += copyH > 0 ? lineGap + textBlock : textBlock;
	}
	const sideIcon = hasIcon && (align === "left" || align === "right");
	const sideH = sideIcon ? iconSize : 0;
	return Math.max(hasIcon ? iconSize : 0, copyH, sideH);
}

function fitGizmoCelestialHollowText(el, gizmo, iconSize, info) {
	const textEl = el.querySelector(".gizmo-clock-text");
	const hollow = el.querySelector(".gizmo-celestial-hollow:not([hidden])");
	const copy = hollow && hollow.querySelector(".gizmo-celestial-copy");
	const iconEl = el.querySelector(".gizmo-clock-icon");
	if (!textEl || textEl.hidden || !hollow || !copy) {
		return;
	}
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const lines = textEl.querySelectorAll(".gizmo-clock-line");
	const lineCount = Math.max(1, lines.length);
	const align = info.align;
	const iconReserved =
		iconEl && !iconEl.hidden && copy.contains(iconEl)
			? iconSize + (lineGap > 0 ? lineGap : 0)
			: 0;
	const hollowH = hollow.clientHeight > 0 ? hollow.clientHeight : info.hollowH;
	const copyMeasured = copy.clientWidth > 0 ? copy.clientWidth : 0;
	const copyFitW = Math.max(24, Math.min(copyMeasured || info.labelWidth, info.labelWidth) - 2);
	const copyTextRoom = Math.max(
		0,
		hollowH - iconReserved - lineGap * Math.max(0, lineCount - 1)
	);
	const perLineH = lineCount > 0 ? copyTextRoom / lineCount : copyTextRoom;
	const basePreferred = gizmoFontSizePx(gizmo);
	const copyHeightPreferred = Math.max(6, Math.floor(perLineH / 1.05));
	const copyPreferred = Math.min(basePreferred, copyHeightPreferred);

	for (const line of lines) {
		line.style.whiteSpace = "nowrap";
		fitLabelFont(line, copyFitW, copyPreferred, perLineH);
	}
}

function layoutGizmoCelestialHollow(el, gizmo) {
	const hollow = ensureGizmoCelestialHollow(el);
	const iconEl = el.querySelector(".gizmo-clock-icon");
	const textEl = el.querySelector(".gizmo-clock-text");
	const slotL = hollow.querySelector(".gizmo-celestial-slot.is-left");
	const slotR = hollow.querySelector(".gizmo-celestial-slot.is-right");
	const copy = hollow.querySelector(".gizmo-celestial-copy");
	if (!slotL || !slotR || !copy) {
		return { labelInHollow: false, labelWidth: 0 };
	}

	const arcCore = gizmoArcMetricsFromGizmo(gizmo);
	const arcLayout = { W: arcCore.W, layoutH: arcCore.layoutH, band: arcCore.band };
	const iconSize = gizmoClockIconSize(gizmo);
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const slotPad = Math.max(4, Math.round(iconSize * 0.15));
	const align = normalizeClockTextAlign(gizmo.settings.textAlign);
	const capGauge = celestialArcLayoutGauge(gizmo);
	const capLayout = clockArcCapLayout(capGauge, arcCore.band);
	const arcGeom = clockArcCapGeometry(capGauge, capLayout, arcCore);
	const arcMetrics = celestialGizmoArcMetrics(gizmo);
	const hasIcon = iconSize > 0 && iconEl && !iconEl.hidden;
	const hasText = textEl && String(textEl.textContent || "").trim().length > 0;

	if (!hasIcon && !hasText) {
		hollow.hidden = true;
		hollow.style.transform = "";
		delete hollow.dataset.structSig;
		if (iconEl && iconEl.parentElement !== el) {
			clockClearOverlayAbsolute(iconEl);
			el.appendChild(iconEl);
		}
		if (textEl && textEl.parentElement !== el) {
			clockClearOverlayAbsolute(textEl);
			el.appendChild(textEl);
		}
		return { labelInHollow: false, labelWidth: 0 };
	}

	const { span } = clockArcHollowMetrics(arcLayout, iconSize, iconGap, arcGeom);
	const hollowH = gizmoCelestialHollowHeight(gizmo, iconSize, iconGap);

	hollow.hidden = false;
	hollow.style.width = `${span}px`;
	hollow.style.height = `${hollowH}px`;
	hollow.style.right = "";
	hollow.style.bottom = "";
	hollow.style.transform = "";

	const structSig = [
		align,
		hasIcon ? "I" : "",
		hasText ? "T" : "",
		Math.round(iconSize),
		Math.round(slotPad),
		Math.round(iconGap)
	].join("|");
	const reuseStructure = hollow.dataset.structSig === structSig;
	if (!reuseStructure) {
		copy.replaceChildren();
		slotL.replaceChildren();
		slotR.replaceChildren();
		hollow.dataset.structSig = structSig;
	}

	const prepIconSlot = (slot, side) => {
		const filled = side === "left" ? align === "left" && hasIcon : align === "right" && hasIcon;
		if (filled) {
			const slotW = iconSize + slotPad;
			slot.style.flex = `0 0 ${slotW}px`;
			slot.style.width = `${slotW}px`;
			slot.style.minWidth = `${slotW}px`;
			slot.style.display = "flex";
			slot.style.alignItems = "center";
			slot.style.justifyContent = "center";
			slot.style.paddingLeft = side === "right" ? `${slotPad}px` : "0";
			slot.style.paddingRight = side === "left" ? `${slotPad}px` : "0";
			clockClearOverlayAbsolute(iconEl);
			iconEl.style.width = `${iconSize}px`;
			iconEl.style.height = `${iconSize}px`;
			iconEl.style.flex = `0 0 ${iconSize}px`;
			iconEl.style.transform = "";
			if (!reuseStructure || iconEl.parentElement !== slot) {
				slot.appendChild(iconEl);
			}
			return slotW;
		}
		slot.style.flex = `0 0 ${slotPad}px`;
		slot.style.width = `${slotPad}px`;
		slot.style.minWidth = `${slotPad}px`;
		slot.style.display = "flex";
		slot.style.alignItems = "center";
		slot.style.justifyContent = "center";
		slot.style.padding = "0";
		return slotPad;
	};

	const leftW = prepIconSlot(slotL, "left");
	const rightW = prepIconSlot(slotR, "right");

	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	copy.style.flexDirection = "column";
	copy.style.justifyContent = "flex-end";
	copy.style.alignItems = "stretch";
	copy.style.gap = `${lineGap}px`;

	if (hasIcon && align === "center") {
		clockClearOverlayAbsolute(iconEl);
		iconEl.style.width = `${iconSize}px`;
		iconEl.style.height = `${iconSize}px`;
		iconEl.style.flex = `0 0 ${iconSize}px`;
		iconEl.style.alignSelf = "center";
		iconEl.style.transform = "";
		if (!reuseStructure || iconEl.parentElement !== copy) {
			copy.appendChild(iconEl);
		}
	}
	if (hasText) {
		clockClearOverlayAbsolute(textEl);
		textEl.style.flex = "0 1 auto";
		textEl.style.width = "100%";
		textEl.style.maxWidth = "100%";
		textEl.style.minWidth = "0";
		textEl.style.overflow = "hidden";
		const textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";
		textEl.style.textAlign = textAlign;
		textEl.style.alignSelf =
			align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
		textEl.style.transform = "";
		if (!reuseStructure || textEl.parentElement !== copy) {
			copy.appendChild(textEl);
		}
	}

	if (iconEl && !hasIcon) {
		clockClearOverlayAbsolute(iconEl);
		el.appendChild(iconEl);
	}

	const labelWidth = Math.max(24, span - leftW - rightW);

	clockPlaceArcZoneSatellite(hollow, arcMetrics, "centered");

	fitGizmoCelestialHollowText(el, gizmo, iconSize, {
		labelWidth,
		hollowH,
		align,
		hasIcon
	});

	return { labelInHollow: hasText, labelWidth };
}
function gizmoLayoutBoxClock(gizmo) {
	const mode = normalizeGizmoDisplayMode(gizmo.settings.displayMode);
	const blockH = gizmoClockBlockHeight(gizmo);
	if (mode === "celestial") {
		const arcCore = gizmoArcMetricsFromGizmo(gizmo);
		const band = arcCore.band;
		const capGauge = celestialArcLayoutGauge(gizmo);
		const capLayout = clockArcCapLayout(capGauge, band);
		const arcGeom = clockArcCapGeometry(capGauge, capLayout, arcCore);
		const metrics = clockArcLayoutMetrics(capGauge, band, arcGeom, arcCore);
		return { w: metrics.layoutW, h: metrics.layoutH };
	}
	return { w: gizmo.position.width, h: Math.max(gizmo.position.height, blockH) };
}

function addClockGizmo() {
	placeNewGizmo(defaultClockGizmo(nextGizmoTypeIndex("cog-clock")));
}

function formatClockGizmo(gizmo, src) {
	if (!gizmo || !src) {
		return "";
	}
	return (gizmo.settings.displayLines || [])
		.map((line) => formatClockLine(gizmo, src, line))
		.filter((line) => line.trim())
		.join("\n");
}
function layoutHudGizmoClock(el, gizmo) {
	ensureGizmo(gizmo);
	const box = gizmoLayoutBox(gizmo);
	const mode = normalizeGizmoDisplayMode(gizmo.settings.displayMode);
	const css = hudItemLayoutCss(gizmo, box.w, box.h);
	el.style.left = `${css.x * 100}%`;
	el.style.top = `${css.y * 100}%`;
	el.style.width = `${box.w}px`;
	el.style.height = `${box.h}px`;
	el.style.setProperty("--gizmo-rot", `${gizmo.position.rotation || 0}deg`);
	el.classList.toggle("is-celestial", mode === "celestial");
	if (mode === "celestial") {
		el.style.setProperty("--gizmo-rot", "0deg");
		const arcCore = gizmoArcMetricsFromGizmo(gizmo);
		const band = arcCore.band;
		const capGauge = celestialArcLayoutGauge(gizmo);
		const capLayout = clockArcCapLayout(capGauge, band);
		const arcGeom = clockArcCapGeometry(capGauge, capLayout, arcCore);
		const metrics = clockArcLayoutMetrics(capGauge, band, arcGeom, arcCore);
		const rotor = ensureGizmoCelestialRotor(el);
		rotor.style.left = `${metrics.rotorLeft}px`;
		rotor.style.top = `${metrics.rotorTop}px`;
		rotor.style.width = `${metrics.arcW}px`;
		rotor.style.height = `${metrics.arcH}px`;
		rotor.style.setProperty("--gizmo-celestial-rot", `${gizmo.position.rotation || 0}deg`);
		el.dataset.gizmoArcLayout = JSON.stringify({
			layoutW: metrics.layoutW,
			layoutH: metrics.layoutH,
			rotorLeft: metrics.rotorLeft,
			rotorTop: metrics.rotorTop,
			arcW: metrics.arcW,
			arcH: metrics.arcH
		});
	} else {
		el.style.setProperty("--gizmo-rot", `${gizmo.position.rotation || 0}deg`);
		delete el.dataset.gizmoArcLayout;
	}
	const textHost = el.querySelector(".gizmo-clock-text");
	const bodyHost = el.querySelector(".gizmo-clock-body");
	if (bodyHost) {
		const align = normalizeClockTextAlign(gizmo.settings.textAlign);
		bodyHost.classList.remove("is-align-center", "is-align-left", "is-align-right");
		bodyHost.classList.add(`is-align-${align}`);
		bodyHost.style.marginTop = "";
		bodyHost.classList.remove("is-in-arc");
	}
	if (textHost) {
		const font = gizmoFontSizePx(gizmo);
		textHost.style.fontSize = `${font}px`;
		textHost.style.marginTop = "";
		textHost.classList.remove("is-in-arc");
	}
	const iconHost = el.querySelector(".gizmo-clock-icon");
	if (iconHost && mode !== "celestial") {
		const iconSize = gizmoClockIconSize(gizmo);
		if (iconSize) {
			iconHost.style.width = `${iconSize}px`;
			iconHost.style.height = `${iconSize}px`;
		}
	}
}

function paintGizmoClockIcon(el, gizmo, src) {
	const iconHost = el.querySelector(".gizmo-clock-icon");
	if (!iconHost) {
		return;
	}
	const href = resolveClockIconHref(gizmo, src);
	if (!href) {
		iconHost.hidden = true;
		iconHost.style.background = "";
		iconHost.style.webkitMaskImage = "";
		iconHost.style.maskImage = "";
		paintMaskedFace(iconHost, "gizmo-clock-icon-face", { clear: true });
		return;
	}
	iconHost.hidden = false;
	iconHost.style.background = "";
	iconHost.style.webkitMaskImage = "";
	iconHost.style.maskImage = "";
	const color = normalizeHexColor(gizmo.settings.iconColor, DEFAULT_GIZMO_GOLD);
	paintMaskedFace(iconHost, "gizmo-clock-icon-face", { color, href });
}

function paintGizmoClock(el, gizmo) {
	const textHost = el.querySelector(".gizmo-clock-text");
	if (!textHost) {
		return;
	}
	const src = clockGameTime();
	paintGizmoClockIcon(el, gizmo, src);
	textHost.innerHTML = "";
	const lines = (gizmo.settings.displayLines || []).map((line) => formatClockLine(gizmo, src, line));
	if (!lines.length || lines.every((line) => !line.trim())) {
		const empty = document.createElement("div");
		empty.className = "gizmo-clock-line";
		empty.textContent = "—";
		textHost.appendChild(empty);
	} else {
		for (const line of lines) {
			const row = document.createElement("div");
			row.className = "gizmo-clock-line";
			row.textContent = line.trim() || "";
			textHost.appendChild(row);
		}
	}
	textHost.style.color = normalizeHexColor(gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
}

function celestialArcAngle(arcT) {
	const t = Math.max(0, Math.min(1, Number(arcT) || 0));
	return Math.PI * t;
}

function celestialClipId(gizmoId) {
	return `gizmo-celestial-clip-${String(gizmoId).replace(/[^\w-]/g, "_")}`;
}

function ensureCelestialBandClip(svg, gizmoId, bandPath) {
	let defs = svg.querySelector("defs");
	if (!defs) {
		defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		svg.insertBefore(defs, svg.firstChild);
	}
	const id = celestialClipId(gizmoId);
	let clip = defs.querySelector(`#${id}`);
	if (!clip) {
		clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
		clip.setAttribute("id", id);
		clip.setAttribute("clipPathUnits", "userSpaceOnUse");
		clip.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
		defs.appendChild(clip);
	}
	clip.querySelector("path").setAttribute("d", bandPath);
	return id;
}

function paintCelestialEndCaps(rotor, gizmo, arcCore, borderColor) {
	const capL = rotor.querySelector(".gizmo-celestial-endcap-left");
	const capR = rotor.querySelector(".gizmo-celestial-endcap-right");
	const capGauge = celestialArcLayoutGauge(gizmo);
	const { band } = arcCore;
	const capLayout = clockArcCapLayout(capGauge, band);
	if (!resolveGaugeEndArtHref(capGauge)) {
		if (capL) {
			capL.hidden = true;
		}
		if (capR) {
			capR.hidden = true;
		}
		return;
	}
	clockPaintEndCaps(capGauge, {
		capL,
		capR,
		capH: capLayout.capH,
		capW: capLayout.capW,
		capShift: capLayout.capShift,
		borderColor,
		arc: true,
		band,
		contactIn: capLayout.contactIn
	});
}

function placeCelestialBody(layer, cls, href, arcT, sizePx, color, gizmoRot) {
	if (!layer) {
		return;
	}
	const hostClass = `gizmo-celestial-body ${cls}`.trim();
	let node = layer.querySelector(`.${cls}`);
	// Rebuild legacy nodes (IMG or silhouette-era hosts) into face-only hosts.
	if (node && (node.tagName === "IMG" || node.querySelector(".gizmo-body-silhouette") || !node.querySelector(".gizmo-body-face"))) {
		const div = document.createElement("div");
		div.className = hostClass;
		div.innerHTML = '<div class="gizmo-body-face"></div>';
		node.replaceWith(div);
		node = div;
	}
	if (!node) {
		node = document.createElement("div");
		node.className = hostClass;
		node.innerHTML = '<div class="gizmo-body-face"></div>';
		layer.appendChild(node);
	} else {
		node.className = hostClass;
		const staleSil = node.querySelector(".gizmo-body-silhouette");
		if (staleSil) {
			staleSil.remove();
		}
		if (!node.querySelector(".gizmo-body-face")) {
			const faceEl = document.createElement("div");
			faceEl.className = "gizmo-body-face";
			node.appendChild(faceEl);
		}
	}
	const arc = Number(arcT);
	if (arc < 0 || !href) {
		node.hidden = true;
		paintMaskedFace(node, "gizmo-body-face", { clear: true });
		return;
	}
	node.hidden = false;
	const paint = normalizeHexColor(color, DEFAULT_GIZMO_CELESTIAL_COLOR);
	paintMaskedFace(node, "gizmo-body-face", { color: paint, href });
	const size = Math.max(8, Math.round(sizePx));
	node.style.width = `${size}px`;
	node.style.height = `${size}px`;
	const metrics = layer.dataset.arcMetrics ? JSON.parse(layer.dataset.arcMetrics) : null;
	if (!metrics) {
		return;
	}
	const angle = celestialArcAngle(arc);
	const r = metrics.ro - metrics.band / 2;
	const [x, y] = clockArcPoint(metrics.cx, metrics.cy, r, angle);
	node.style.left = `${x}px`;
	node.style.top = `${y}px`;
	// Counter-rotate so bodies stay upright while the celestial rotor turns.
	const upright = -(Number(gizmoRot) || 0);
	node.style.transform = `translate(-50%, -50%) rotate(${upright}deg)`;
}

function paintCelestialArc(el, gizmo) {
	if (normalizeGizmoDisplayMode(gizmo.settings.displayMode) !== "celestial") {
		return;
	}
	ensureGizmoCelestialRotor(el);
	const rotor = el.querySelector(".gizmo-celestial-rotor");
	const track = rotor && rotor.querySelector(".gizmo-celestial-track");
	const svg = track && track.querySelector(".gizmo-celestial-svg");
	const trough = svg && svg.querySelector(".gizmo-celestial-trough");
	const borderOuter = svg && svg.querySelector(".gizmo-celestial-border-outer");
	const borderInner = svg && svg.querySelector(".gizmo-celestial-border-inner");
	const borderEndL = svg && svg.querySelector(".gizmo-celestial-border-end-left");
	const borderEndR = svg && svg.querySelector(".gizmo-celestial-border-end-right");
	const layer = track && track.querySelector(".gizmo-body-layer");
	if (!rotor || !track || !svg || !trough || !layer) {
		return;
	}
	const arcCore = gizmoArcMetricsFromGizmo(gizmo);
	const { W, band, layoutH, cx, cy, ro, ri } = arcCore;
	if (track) {
		track.style.left = "0";
		track.style.right = "0";
		track.style.top = "0";
		track.style.bottom = "0";
		track.style.transform = W % 2 ? "translateX(0.5px)" : "";
	}
	layer.dataset.arcMetrics = JSON.stringify({ cx, cy, ro, ri, band });
	svg.setAttribute("viewBox", `0 0 ${W} ${layoutH}`);
	const bandPath = clockArcBandPathD(arcCore);
	trough.setAttribute("d", bandPath);
	const clipId = ensureCelestialBandClip(svg, gizmo.id, bandPath);
	const borderColor = normalizeHexColor(gizmo.settings.borderColor, DEFAULT_GIZMO_GOLD);
	const celestialColor = normalizeHexColor(gizmo.settings.celestialColor, DEFAULT_GIZMO_CELESTIAL_COLOR);
	const usesArt = gaugeUsesEndArt(celestialArcLayoutGauge(gizmo));
	clockPaintArcBorders(borderOuter, borderInner, arcCore, borderColor, gizmo.settings.borderThickness, {
		left: borderEndL,
		right: borderEndR,
		enabled: !usesArt
	});
	trough.style.fill = "rgba(0,0,0,0.2)";
	layer.style.width = `${W}px`;
	layer.style.height = `${layoutH}px`;
	layer.style.clipPath = `url(#${clipId})`;
	layer.style.webkitClipPath = `url(#${clipId})`;
	paintCelestialEndCaps(rotor, gizmo, arcCore, borderColor);
	const cel = clockCelestial();
	const bodySize = Math.max(12, Math.round(band * 0.9));
	const secundaSize = Math.round(bodySize * 0.7);
	const gizmoRot = Number(gizmo.position.rotation) || 0;
	if (cel) {
		placeCelestialBody(
			layer,
			"gizmo-body-sun",
			shouldShowCelestialBody(gizmo, cel, "sun") ? resolveDisplayIconHref("Celestial/sun.svg") : "",
			cel.sunArc,
			bodySize,
			celestialColor,
			gizmoRot
		);
		const masserPhase = Math.max(0, Math.min(7, Number(cel.masserPhase) || 0));
		const secundaPhase = Math.max(0, Math.min(7, Number(cel.secundaPhase) || 0));
		placeCelestialBody(
			layer,
			"gizmo-body-masser",
			shouldShowCelestialBody(gizmo, cel, "masser") ? resolveDisplayIconHref(MOON_PHASE_ICONS[masserPhase]) : "",
			cel.masserArc,
			bodySize,
			celestialColor,
			gizmoRot
		);
		placeCelestialBody(
			layer,
			"gizmo-body-secunda",
			shouldShowCelestialBody(gizmo, cel, "secunda") ? resolveDisplayIconHref(MOON_PHASE_ICONS[secundaPhase]) : "",
			cel.secundaArc,
			secundaSize,
			celestialColor,
			gizmoRot
		);
	} else {
		placeCelestialBody(layer, "gizmo-body-sun", "", -1, bodySize, celestialColor, gizmoRot);
		placeCelestialBody(layer, "gizmo-body-masser", "", -1, bodySize, celestialColor, gizmoRot);
		placeCelestialBody(layer, "gizmo-body-secunda", "", -1, secundaSize, celestialColor, gizmoRot);
	}
	layoutGizmoCelestialHollow(el, gizmo);
}

function buildGizmoClockEl(gizmo, preview) {
	const mode = normalizeGizmoDisplayMode(gizmo.settings.displayMode);
	const el = document.createElement("div");
	el.className = `hud-gizmo hud-gizmo-clock${mode === "celestial" ? " hud-gizmo-celestial" : ""}`;
	el.dataset.id = gizmo.id;
	el.dataset.gizmoType = "cog-clock";
	el.dataset.gizmoMode = mode;
	if (mode === "celestial") {
		el.innerHTML = `
			<div class="gizmo-celestial-rotor">
				<div class="gizmo-celestial-track">
					<svg class="gizmo-celestial-svg" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
						<path class="gizmo-celestial-trough"></path>
						<path class="gizmo-celestial-border-outer" fill="none"></path>
						<path class="gizmo-celestial-border-inner" fill="none"></path>
						<path class="gizmo-celestial-border-end-left" fill="none"></path>
						<path class="gizmo-celestial-border-end-right" fill="none"></path>
					</svg>
					<div class="gizmo-body-layer"></div>
					<div class="gizmo-celestial-chrome">
						<div class="gizmo-celestial-endcap gizmo-celestial-endcap-left" hidden><div class="gizmo-celestial-endcap-face"></div></div>
						<div class="gizmo-celestial-endcap gizmo-celestial-endcap-right" hidden><div class="gizmo-celestial-endcap-face"></div></div>
					</div>
				</div>
			</div>
			<div class="gizmo-celestial-hollow" hidden>
				<div class="gizmo-celestial-slot is-left"></div>
				<div class="gizmo-celestial-copy"></div>
				<div class="gizmo-celestial-slot is-right"></div>
			</div>
			<div class="gizmo-clock-icon" hidden></div>
			<div class="gizmo-clock-text"></div>`;
	} else {
		el.innerHTML = `
			<div class="gizmo-clock-body">
				<div class="gizmo-clock-icon" hidden></div>
				<div class="gizmo-clock-text"></div>
			</div>`;
	}
	layoutHudGizmoClock(el, gizmo);
	paintGizmoClock(el, gizmo);
	paintCelestialArc(el, gizmo);
	if (preview) {
		attachGizmoHandles(el, gizmo);
	}
	return el;
}

function makeClockTemplateEditor(gizmo, gid) {
	const host = document.createElement("div");
	host.className = "clock-template-editor";
	const live = () => gizmoFor(gid) || gizmo;

	const render = () => {
		// Portaled token menus must close before wiping the host (homes go away).
		for (const pop of document.querySelectorAll(".clock-token-popover")) {
			const home = pop._cogHome;
			if (!home || host.contains(home) || host.contains(pop)) {
				closeClockTokenPopover(pop);
			}
		}
		const current = live();
		host.innerHTML = "";
		const linesWrap = document.createElement("div");
		linesWrap.className = "clock-template-lines";
		const lines = normalizeDisplayLines(current.settings.displayLines, current.settings.timeFormat);
		for (let li = 0; li < lines.length; li++) {
			const row = document.createElement("div");
			row.className = "clock-template-line";
			const chips = document.createElement("div");
			chips.className = "clock-template-chips";
			for (let ti = 0; ti < lines[li].length; ti++) {
				const token = lines[li][ti];
				const chip = document.createElement("span");
				chip.className = "clock-token";
				const chipLabel = document.createElement("span");
				const tokenEntry = CLOCK_TOKENS[token];
				if (tokenEntry) {
					setTranslatedText(chipLabel, tokenEntry[0], tokenEntry[1], CLOCK_TYPE_ID);
				} else {
					chipLabel.textContent = token;
				}
				chip.appendChild(chipLabel);
				const remove = document.createElement("button");
				remove.type = "button";
				remove.className = "clock-token-remove";
				remove.textContent = "×";
				setTranslatedTitle(remove, "cog-remove", "Remove");
				remove.addEventListener("click", () => {
					const next = normalizeDisplayLines(live().settings.displayLines, live().settings.timeFormat);
					next[li] = next[li].filter((_, idx) => idx !== ti);
					const filtered = next.filter((line) => line.length);
					patchGizmo(gid, { displayLines: filtered.length ? filtered : defaultDisplayLines() });
					render();
				});
				chip.appendChild(remove);
				chips.appendChild(chip);
			}
			const actions = document.createElement("div");
			actions.className = "clock-template-line-actions";
			const addBtn = document.createElement("button");
			addBtn.type = "button";
			addBtn.className = "tiny clock-line-btn";
			addBtn.textContent = "+";
			setTranslatedTitle(addBtn, "cog-add-item", "Add Item");
			const popover = document.createElement("div");
			popover.className = "clock-token-popover";
			popover.hidden = true;
			// Body-portaled menus must stop pointerdown so #editor-panel outside-click
			// handling (Core.js) does not collapse the gizmo accordion mid-pick.
			popover.addEventListener("pointerdown", (ev) => ev.stopPropagation());
			for (const id of CLOCK_TOKEN_IDS) {
				const pick = document.createElement("button");
				pick.type = "button";
				pick.className = "clock-token-pick";
				setTranslatedText(pick, CLOCK_TOKENS[id][0], CLOCK_TOKENS[id][1], CLOCK_TYPE_ID);
				pick.addEventListener("click", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					const next = normalizeDisplayLines(live().settings.displayLines, live().settings.timeFormat);
					if (!next[li]) {
						next[li] = [];
					}
					next[li].push(id);
					patchGizmo(gid, { displayLines: next });
					closeClockTokenPopover(popover);
					render();
				});
				popover.appendChild(pick);
			}
			addBtn.addEventListener("click", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				const wasOpen = !popover.hidden;
				if (wasOpen) {
					closeClockTokenPopover(popover);
					return;
				}
				beginEditorPopup("clockToken");
				const place = () => placeAnchoredPopup(popover, addBtn, { gap: 4, align: "end" });
				popover._cogPopupId = registerEditorPopup("clockToken", {
					close: () => closeClockTokenPopover(popover),
					reposition: place,
					retain: popover
				});
				place();
			});
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.className = "tiny clock-line-btn";
			delBtn.textContent = "−";
			setTranslatedTitle(delBtn, "cog-remove-line", "Remove Line");
			delBtn.disabled = lines.length <= 1;
			delBtn.addEventListener("click", () => {
				const next = normalizeDisplayLines(live().settings.displayLines, live().settings.timeFormat).filter((_, idx) => idx !== li);
				patchGizmo(gid, { displayLines: next.length ? next : defaultDisplayLines() });
				render();
			});
			actions.appendChild(addBtn);
			actions.appendChild(delBtn);
			row.appendChild(chips);
			row.appendChild(actions);
			row.appendChild(popover);
			linesWrap.appendChild(row);
		}
		host.appendChild(linesWrap);
		const addLine = document.createElement("button");
		addLine.type = "button";
		addLine.className = "tiny clock-add-line";
		setTranslatedText(addLine, "cog-add-line", "+ Add line");
		setTranslatedTitle(addLine, "cog-add-line", "+ Add line");
		addLine.addEventListener("click", () => {
			const next = normalizeDisplayLines(live().settings.displayLines, live().settings.timeFormat).slice();
			next.push(["time24"]);
			patchGizmo(gid, { displayLines: next });
			render();
		});
		host.appendChild(addLine);
	};

	render();
	return host;
}
function fillClockGizmoEditor(panel, gizmo) {
	const gid = gizmo.id;
	const live = () => gizmoFor(gid) || gizmo;

	const modeRow = document.createElement("div");
	modeRow.className = "style-row";
	const modeField = document.createElement("label");
	modeField.className = "pos-field compact";
	modeField.innerHTML = `<span>Mode</span><select data-role="displayMode">
		<option value="text">Text-only</option>
		<option value="celestial">Celestial</option>
	</select>`;
	tagFieldLabel(modeField, "cog-mode", "Mode");
	const modeSel = modeField.querySelector("select");
	tagSelectOptions(modeSel, {
		text: ["cog-mode-text-only", "Text-only"],
		celestial: ["cog-mode-celestial", "Celestial"]
	});
	modeSel.value = normalizeGizmoDisplayMode(gizmo.settings.displayMode);
	modeSel.addEventListener("change", () => {
		const mode = normalizeGizmoDisplayMode(modeSel.value);
		const patch = { displayMode: mode };
		if (mode === "celestial" && live().position.width === DEFAULT_GIZMO_WIDTH_TEXT) {
			patch.position = {
				width: DEFAULT_GIZMO_WIDTH_CELESTIAL,
				height: DEFAULT_GIZMO_HEIGHT_CELESTIAL
			};
		}
		patchGizmo(gid, patch);
		renderEditor(true);
	});
	modeRow.appendChild(modeField);
	panel.appendChild(modeRow);

	appendEditorRule(panel);
	const displaySection = document.createElement("div");
	displaySection.className = "gizmo-display-settings";
	const displayLede = document.createElement("p");
	displayLede.className = "lede";
	setTranslatedText(displayLede, "cog-display", "Display");
	displaySection.appendChild(displayLede);
	const displayHint = document.createElement("p");
	displayHint.className = "hint";
	setTranslatedText(
		displayHint,
		"cog-clock-display-hint",
		"Arrange date and time fields across lines. Each badge is one value in the order shown.",
		CLOCK_TYPE_ID
	);
	displaySection.appendChild(displayHint);
	displaySection.appendChild(makeClockTemplateEditor(gizmo, gid));
	panel.appendChild(displaySection);

	appendEditorRule(panel);
	const textSection = document.createElement("div");
	textSection.className = "gizmo-text-settings";
	const textLede = document.createElement("p");
	textLede.className = "lede";
	setTranslatedText(textLede, "cog-text-settings", "Text settings");
	textSection.appendChild(textLede);
	const textRow = document.createElement("div");
	textRow.className = "style-row";
	const iconField = document.createElement("label");
	iconField.className = "pos-field compact";
	iconField.innerHTML = `<span>Icon</span><select data-role="clockIcon">
		<option value="none">None</option>
		<option value="clock">Clock</option>
		<option value="season">Season</option>
	</select>`;
	tagFieldLabel(iconField, "cog-icon", "Icon");
	const iconSel = iconField.querySelector("select");
	tagSelectOptions(
		iconSel,
		{
			none: ["cog-none", "None"],
			clock: ["cog-clock-icon-clock", "Clock"],
			season: ["cog-clock-icon-season", "Season"]
		},
		CLOCK_TYPE_ID
	);
	iconSel.value = normalizeClockIcon(gizmo.settings.clockIcon);
	iconSel.addEventListener("change", () => {
		patchGizmo(gid, { clockIcon: normalizeClockIcon(iconSel.value) });
	});
	textRow.appendChild(iconField);
	const alignField = document.createElement("label");
	alignField.className = "pos-field compact";
	alignField.innerHTML = `<span>Text align</span><select data-role="textAlign">
		<option value="center">Center</option>
		<option value="left">Left</option>
		<option value="right">Right</option>
	</select>`;
	tagFieldLabel(alignField, "cog-text-align", "Text align");
	const alignSel = alignField.querySelector("select");
	tagSelectOptions(alignSel, {
		center: ["cog-align-center", "Center"],
		left: ["cog-align-left", "Left"],
		right: ["cog-align-right", "Right"]
	});
	alignSel.value = normalizeClockTextAlign(gizmo.settings.textAlign);
	alignSel.addEventListener("change", () => {
		patchGizmo(gid, { textAlign: normalizeClockTextAlign(alignSel.value) });
	});
	textRow.appendChild(alignField);
	const fontField = document.createElement("label");
	fontField.className = "pos-field compact";
	fontField.innerHTML = `<span>Font</span><input type="text" data-role="fontSize" inputmode="numeric" placeholder="auto">`;
	tagFieldLabel(fontField, "cog-font", "Font");
	const fontInput = fontField.querySelector("input");
	setTranslatedPlaceholder(fontInput, "cog-auto", "auto");
	fontInput.value = gizmo.settings.fontSize > 0 ? String(Math.round(gizmo.settings.fontSize)) : "";
	bindNumberField(fontInput, {
		suffix: "px",
		parse: (raw) => {
			if (String(raw).trim() === "") {
				return 0;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? Math.max(0, Math.min(128, v)) : null;
		},
		apply: (v) => patchGizmo(gid, { fontSize: v }),
		format: (v) => (v > 0 ? String(Math.round(v)) : ""),
		current: () => live().settings.fontSize || 0
	});
	textRow.appendChild(fontField);
	textSection.appendChild(textRow);
	const textColorRow = document.createElement("div");
	textColorRow.className = "style-row";
	const iconColor = makeOptionalColorField(
		"Icon Colour",
		gizmo.settings.iconColor,
		DEFAULT_GIZMO_GOLD,
		(hex, live) => patchGizmo(gid, { iconColor: hex }, false, live)
	);
	iconColor.classList.add("compact");
	tagFieldLabel(iconColor, "cog-icon-colour", "Icon Colour");
	textColorRow.appendChild(iconColor);
	const textColor = makeOptionalColorField(
		"Text Colour",
		gizmo.settings.textColor,
		DEFAULT_GIZMO_GOLD,
		(hex, live) => patchGizmo(gid, { textColor: hex }, false, live)
	);
	textColor.classList.add("compact");
	tagFieldLabel(textColor, "cog-text-colour", "Text Colour");
	textColorRow.appendChild(textColor);
	textSection.appendChild(textColorRow);
	panel.appendChild(textSection);

	const celestialSection = document.createElement("div");
	celestialSection.className = "gizmo-celestial-settings";
	celestialSection.hidden = normalizeGizmoDisplayMode(gizmo.settings.displayMode) !== "celestial";
	appendEditorRule(celestialSection);
	const celestialLede = document.createElement("p");
	celestialLede.className = "lede";
	setTranslatedText(celestialLede, "cog-celestial-settings", "Celestial settings");
	celestialSection.appendChild(celestialLede);
	const celestialHint = document.createElement("p");
	celestialHint.className = "hint";
	setTranslatedText(
		celestialHint,
		"cog-clock-celestial-hint",
		"Width is the arc diameter; Height is band thickness (same as an arc gauge).",
		CLOCK_TYPE_ID
	);
	celestialSection.appendChild(celestialHint);
	const celestialRow = document.createElement("div");
	celestialRow.className = "style-row celestial-main-row";
	const celestialShowField = document.createElement("label");
	celestialShowField.className = "pos-field compact";
	celestialShowField.innerHTML = `<span>Show celestial objects</span><select data-role="celestialShow">
		<option value="always">Always</option>
		<option value="sky">When sky is visible</option>
		<option value="outdoors">When outdoors</option>
	</select>`;
	tagFieldLabel(celestialShowField, "cog-show-celestial-objects", "Show celestial objects");
	const celestialShowSel = celestialShowField.querySelector("select");
	tagSelectOptions(celestialShowSel, {
		always: ["cog-always", "Always"],
		sky: ["cog-when-sky-visible", "When sky is visible"],
		outdoors: ["cog-when-outdoors", "When outdoors"]
	});
	celestialShowSel.value = normalizeCelestialShow(gizmo.settings.celestialShow);
	celestialShowSel.addEventListener("change", () => {
		patchGizmo(gid, { celestialShow: normalizeCelestialShow(celestialShowSel.value) });
	});
	celestialRow.appendChild(celestialShowField);
	const endMode = document.createElement("label");
	endMode.className = "pos-field compact mid";
	endMode.innerHTML = `<span>Endcaps</span><select data-role="endCapMode">
		<option value="border">Extend Border</option>
		<option value="endcap">Use Endcap</option>
	</select>`;
	tagFieldLabel(endMode, "cog-endcaps", "Endcaps");
	const endModeSel = endMode.querySelector("select");
	tagSelectOptions(endModeSel, {
		border: ["cog-extend-border", "Extend Border"],
		endcap: ["cog-use-endcap", "Use Endcap"]
	});
	endModeSel.value = normalizeEndCapMode(gizmo.settings.endCapMode, gizmo.settings.endCap);
	celestialRow.appendChild(endMode);
	const endModeNow = endModeSel.value;
	const showEndArt = endModeNow === "endcap";
	endModeSel.addEventListener("change", () => {
		const mode = normalizeEndCapMode(endModeSel.value, gizmo.settings.endCap) || "border";
		const patch = { endCapMode: mode };
		if (mode === "endcap" && !migrateEndCapPath(live().settings.endCap)) {
			patch.endCap = defaultEndCapArtPath();
		}
		patchGizmo(gid, patch);
		renderEditor(true);
	});
	celestialSection.appendChild(celestialRow);
	if (showEndArt) {
		const endArtRow = document.createElement("div");
		endArtRow.className = "style-row endcap-row";
		const endCaps = makeIconControl({
			label: "Endcap",
			value: gizmo.settings.endCap,
			folder: "Endcaps",
			endArtPicker: true,
			clearLabel:
				typeof t === "function" ? t("cog-clear-endcap", "Clear endcap") : "Clear endcap",
			showName: true,
			onCommit: (path) => patchGizmo(gid, { endCap: path || defaultEndCapArtPath() })
		});
		endCaps.classList.add("compact");
		tagFieldLabel(endCaps, "cog-endcap", "Endcap");
		endArtRow.appendChild(endCaps);
		const overlap = document.createElement("label");
		overlap.className = "pos-field compact narrow overlap-cap-field";
		overlap.innerHTML = `<span>Overlap</span><input type="number" min="0" max="45" step="0.5" data-role="endCapOverlap">`;
		tagFieldLabel(overlap, "cog-overlap", "Overlap");
		const overlapInput = overlap.querySelector("input");
		overlapInput.value = fmtDec(gizmo.settings.endCapOverlap, 1);
		bindNumberField(overlapInput, {
			suffix: "%",
			parse: (raw) => (String(raw).trim() === "" ? null : Math.max(0, Math.min(45, Number(raw) || 0))),
			apply: (v) => patchGizmo(gid, { endCapOverlap: v }),
			decimals: 1,
			current: () => live().settings.endCapOverlap
		});
		endArtRow.appendChild(overlap);
		celestialSection.appendChild(endArtRow);
	}
	const celestialColorRow = document.createElement("div");
	celestialColorRow.className = "style-row";
	const borderColor = makeOptionalColorField(
		"Border Colour",
		gizmo.settings.borderColor,
		DEFAULT_GIZMO_GOLD,
		(hex, live) => patchGizmo(gid, { borderColor: hex }, false, live)
	);
	borderColor.classList.add("compact");
	tagFieldLabel(borderColor, "cog-border-colour", "Border Colour");
	celestialColorRow.appendChild(borderColor);
	const thick = document.createElement("label");
	thick.className = "pos-field compact narrow";
	thick.innerHTML = `<span>Border Thickness</span><input type="number" min="0" max="50" step="0.5" data-role="borderThickness">`;
	tagFieldLabel(thick, "cog-border-thickness", "Border Thickness");
	const thickInput = thick.querySelector("input");
	thickInput.value = fmtDec(gizmo.settings.borderThickness, 1);
	bindNumberField(thickInput, {
		suffix: "%",
		parse: (raw) => (String(raw).trim() === "" ? null : Math.max(0, Math.min(50, Number(raw) || 0))),
		apply: (v) => patchGizmo(gid, { borderThickness: v }),
		decimals: 1,
		current: () => live().settings.borderThickness
	});
	celestialColorRow.appendChild(thick);
	const celestialColor = makeOptionalColorField(
		"Celestial Colour",
		gizmo.settings.celestialColor,
		DEFAULT_GIZMO_CELESTIAL_COLOR,
		(hex, live) => patchGizmo(gid, { celestialColor: hex }, false, live)
	);
	celestialColor.classList.add("compact");
	tagFieldLabel(celestialColor, "cog-celestial-colour", "Celestial Colour");
	celestialColorRow.appendChild(celestialColor);
	celestialSection.appendChild(celestialColorRow);
	panel.appendChild(celestialSection);
}

window.CogRegisterGizmoRenderer("cog-clock", {
	create() {
		return defaultClockGizmo(nextGizmoTypeIndex("cog-clock"));
	},
	ensure: ensureClockGizmo,
	build: buildGizmoClockEl,
	layout: layoutHudGizmoClock,
	paint(el, gizmo) {
		paintGizmoClock(el, gizmo);
		paintCelestialArc(el, gizmo);
	},
	fillEditor: fillClockGizmoEditor,
	layoutBox: gizmoLayoutBoxClock,
	fontSizePx(gizmo) {
		const s = ensureGizmoSettings(gizmo);
		if (s.fontSize > 0) {
			return Math.round(s.fontSize);
		}
		if (normalizeGizmoDisplayMode(s.displayMode) === "celestial") {
			return Math.max(10, Math.round(gizmo.position.height * 0.85 * AUTO_FONT_SIZE_SCALE));
		}
		return Math.max(12, Math.round(gizmo.position.height * 0.38 * AUTO_FONT_SIZE_SCALE));
	}
});
