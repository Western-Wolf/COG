// COG overlay - Meter bar shape (loads after _Gauges.js / _Gauges_Meter.js).

const GAUGE_BAR_CAP_SEAT_PCT = 0.25;

const GAUGE_BAR_CAP_OUT_PCT = 0.05;

function gaugeBarRotRad(gauge) {
	return ((Number(gauge.display.rotation) || 0) * Math.PI) / 180;
}

function gaugeBarRotatePt(cx, cy, x, y, rad) {
	const dx = x - cx;
	const dy = y - cy;
	return {
		x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
		y: cy + dx * Math.sin(rad) + dy * Math.cos(rad)
	};
}

function gaugeBarOverlayMargin(gauge, iconSize) {
	const labelSize = gaugeFontSizePx(gauge, iconSize);
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const stackH = iconSize + iconGap + labelSize + lineGap + labelSize + lineGap;
	const sideRoom = Math.max(48, Math.round((Number(gauge.display.width) || 120) * 0.55));
	return { stackH, sideRoom, iconGap, lineGap, labelSize };
}

function gaugeBarCapLayout(gauge, capH) {
	const hasCaps = gaugeUsesEndArt(gauge) && !!resolveGaugeEndArtHref(gauge);
	const artPath = migrateEndCapPath(gaugeSettings(gauge).endCap);
	const capW = hasCaps ? Math.max(1, Math.round(capH * endCapAspectRatio(artPath))) : 0;
	const overlapPx = hasCaps ? (gauge.display.width * gaugeSettings(gauge).endCapOverlap) / 100 : 0;
	const capSeatPx = hasCaps ? (gauge.display.width * GAUGE_BAR_CAP_SEAT_PCT) / 100 : 0;
	const capOutPx = hasCaps ? (gauge.display.width * GAUGE_BAR_CAP_OUT_PCT) / 100 : 0;
	const contactIn = hasCaps ? Math.round(overlapPx - capOutPx) : 0;
	const seatIn = hasCaps ? Math.round(capSeatPx) : 0;
	const capShift = hasCaps ? -capW + contactIn : 0;
	return { hasCaps, capW, capH, capShift, contactIn, seatIn, capOutPx, overlapPx };
}

/** Bar-local endcap edges and axis centers for zone anchoring. */

/** Bar-local endcap edges and axis centers for zone anchoring. */
function gaugeBarCapGeometry(gauge, capLayout) {
	const barW = Math.round(gauge.display.width);
	const barH = Math.round(gauge.display.height);
	const { hasCaps, capW, capH, capShift } = capLayout;
	const zoneGap = Math.max(2, Math.round(capH * 0.1));
	const centerX = barW / 2;
	const centerY = barH / 2;
	if (!hasCaps || !capW) {
		return {
			barW,
			barH,
			zoneGap,
			leftOuterX: 0,
			rightOuterX: barW,
			topOuterY: 0,
			bottomOuterY: barH,
			centerX,
			centerY
		};
	}
	return {
		barW,
		barH,
		zoneGap,
		capW,
		leftOuterX: capShift,
		rightOuterX: barW - capShift,
		topOuterY: 0,
		bottomOuterY: barH,
		centerX,
		centerY,
		leftCapCenterX: capShift + capW / 2,
		rightCapCenterX: barW - capShift - capW / 2
	};
}

function gaugeBarLayoutMetrics(gauge, iconSize, capGeom) {
	const barW = Math.round(gauge.display.width);
	const barH = Math.round(gauge.display.height);
	const rad = gaugeBarRotRad(gauge);
	const margin = gaugeBarOverlayMargin(gauge, iconSize);
	const geom = capGeom || gaugeBarCapGeometry(gauge, gaugeBarCapLayout(gauge, iconSize || barH));
	// Element size follows the visible bar only; icon/label zones overflow outside.
	const layoutW = barW;
	const layoutH = barH;
	const rotorLeft = 0;
	const rotorTop = 0;
	return {
		barW,
		barH,
		rad,
		layoutW,
		layoutH,
		rotorLeft,
		rotorTop,
		margin,
		capGeom: geom,
		barCenterX: rotorLeft + barW / 2,
		barCenterY: rotorTop + barH / 2
	};
}

function barLocalToEl(metrics, lx, ly) {
	const { barW, barH, rad, rotorLeft, rotorTop } = metrics;
	const rotated = gaugeBarRotatePt(barW / 2, barH / 2, lx, ly, rad);
	return { x: rotorLeft + rotated.x, y: rotorTop + rotated.y };
}

/** Rotate a bar-local direction vector into layout space (same spin as the bar). */

/** Rotate a bar-local direction vector into layout space (same spin as the bar). */
function barOutwardToEl(metrics, outX, outY) {
	const rad = metrics.rad;
	return {
		x: outX * Math.cos(rad) - outY * Math.sin(rad),
		y: outX * Math.sin(rad) + outY * Math.cos(rad)
	};
}

function barZoneHalfAlongOut(outEl, zoneW, zoneH) {
	return (zoneW * Math.abs(outEl.x) + zoneH * Math.abs(outEl.y)) / 2;
}

/** Bar-map edge midpoint and outward unit normal (bar-local, 0Â° = horizontal bar). */

/** Bar-map edge midpoint and outward unit normal (bar-local, 0Â° = horizontal bar). */
function barRegionEdgeAndOutward(geom, region) {
	const { centerX, centerY, leftOuterX, rightOuterX, topOuterY, bottomOuterY } = geom;
	switch (region) {
		case "left":
			return { edgeX: leftOuterX, edgeY: centerY, outX: -1, outY: 0 };
		case "right":
			return { edgeX: rightOuterX, edgeY: centerY, outX: 1, outY: 0 };
		case "up":
			return { edgeX: centerX, edgeY: topOuterY, outX: 0, outY: -1 };
		case "down":
			return { edgeX: centerX, edgeY: bottomOuterY, outX: 0, outY: 1 };
		case "centered":
			return { edgeX: centerX, edgeY: centerY, outX: 0, outY: 0 };
		default:
			return { edgeX: centerX, edgeY: centerY, outX: 0, outY: 0 };
	}
}

/** Inner edge anchor: zoneGap outside the bar/endcap outer edge along the rotated normal. */

/** Inner edge anchor: zoneGap outside the bar/endcap outer edge along the rotated normal. */
function barRegionSatelliteEdge(metrics, region) {
	const geom = metrics.capGeom;
	if (!geom) {
		return barLocalToEl(metrics, metrics.barW / 2, metrics.barH / 2);
	}
	if (region === "centered") {
		return barLocalToEl(metrics, geom.centerX, geom.centerY);
	}
	const { edgeX, edgeY, outX, outY } = barRegionEdgeAndOutward(geom, region);
	const edgeEl = barLocalToEl(metrics, edgeX, edgeY);
	const outEl = barOutwardToEl(metrics, outX, outY);
	const dist = geom.zoneGap;
	return {
		x: edgeEl.x + outEl.x * dist,
		y: edgeEl.y + outEl.y * dist
	};
}

/**
 * Satellite zone center in layout px (centered region only).
 * Other regions anchor on their bar-facing inner edge for consistent tip distance.
 */

/**
 * Satellite zone center in layout px (centered region only).
 * Other regions anchor on their bar-facing inner edge for consistent tip distance.
 */
function barRegionSatelliteCenter(metrics, region, zoneW, zoneH) {
	const geom = metrics.capGeom;
	if (!geom) {
		return barLocalToEl(metrics, metrics.barW / 2, metrics.barH / 2);
	}
	if (region === "centered") {
		return barLocalToEl(metrics, geom.centerX, geom.centerY);
	}
	const { edgeX, edgeY, outX, outY } = barRegionEdgeAndOutward(geom, region);
	const edgeEl = barLocalToEl(metrics, edgeX, edgeY);
	const outEl = barOutwardToEl(metrics, outX, outY);
	const dist = geom.zoneGap + barZoneHalfAlongOut(outEl, zoneW, zoneH);
	return {
		x: edgeEl.x + outEl.x * dist,
		y: edgeEl.y + outEl.y * dist
	};
}

function placeBarZoneAt(node, anchor, transform) {
	if (!node) {
		return;
	}
	node.style.left = `${anchor.x}px`;
	node.style.top = `${anchor.y}px`;
	node.style.right = "auto";
	node.style.bottom = "auto";
	node.style.transform = transform;
}

/** CSS transform so the zone's bar-facing inner edge sits on the anchor point. */

/** CSS transform so the zone's bar-facing inner edge sits on the anchor point. */
function barSatelliteInnerTransform(outEl) {
	const ax = Math.abs(outEl.x);
	const ay = Math.abs(outEl.y);
	if (ax >= ay) {
		return outEl.x > 0 ? "translate(0%, -50%)" : "translate(-100%, -50%)";
	}
	return outEl.y > 0 ? "translate(-50%, 0%)" : "translate(-50%, -100%)";
}

/** Position a zone satellite after content is measured. */

/** Position a zone satellite after content is measured. */
function placeBarZoneSatellite(zoneEl, barMetrics, region) {
	if (!zoneEl) {
		return;
	}
	if (region === "centered") {
		const center = barRegionSatelliteCenter(
			barMetrics,
			region,
			zoneEl.offsetWidth,
			zoneEl.offsetHeight
		);
		placeBarZoneAt(zoneEl, center, "translate(-50%, -50%)");
		return;
	}
	const geom = barMetrics.capGeom;
	if (!geom) {
		return;
	}
	const { outX, outY } = barRegionEdgeAndOutward(geom, region);
	const outEl = barOutwardToEl(barMetrics, outX, outY);
	const anchor = barRegionSatelliteEdge(barMetrics, region);
	placeBarZoneAt(zoneEl, anchor, barSatelliteInnerTransform(outEl));
}

function ensureGaugeBarRotor(el) {
	let rotor = el.querySelector(".gauge-bar-rotor");
	if (!rotor) {
		rotor = document.createElement("div");
		rotor.className = "gauge-bar-rotor";
		const track = el.querySelector(".gauge-bar-track");
		el.insertBefore(rotor, el.firstChild);
		if (track) {
			rotor.appendChild(track);
		}
	}
	const track = rotor.querySelector(".gauge-bar-track") || el.querySelector(".gauge-bar-track");
	let border = el.querySelector(".gauge-bar-border");
	if (!border && track) {
		border = track.querySelector(".gauge-bar-border");
	}
	if (!border) {
		border = document.createElement("div");
		border.className = "gauge-bar-border";
	}
	const capL = el.querySelector(".gauge-endcap-left");
	const capR = el.querySelector(".gauge-endcap-right");
	ensureGaugeChrome(rotor, { border, caps: [capL, capR] });
	return rotor;
}

/**
 * Bar left/right: flex rows outside each endcap tip.
 * Left:  [label | icon] tipâ€¦   Right:  â€¦tip [icon | label]
 * Icon is nearer the endcap; label is farther out.
 */
function ensureGaugeBarSides(el) {
	let sideL = el.querySelector(".gauge-bar-side.is-left");
	let sideR = el.querySelector(".gauge-bar-side.is-right");
	if (!sideL) {
		sideL = document.createElement("div");
		sideL.className = "gauge-bar-side is-left";
		sideL.hidden = true;
		sideL.innerHTML = `<div class="gauge-bar-far"></div><div class="gauge-bar-near"></div>`;
		el.insertBefore(sideL, el.firstChild);
	}
	if (!sideR) {
		sideR = document.createElement("div");
		sideR.className = "gauge-bar-side is-right";
		sideR.hidden = true;
		sideR.innerHTML = `<div class="gauge-bar-near"></div><div class="gauge-bar-far"></div>`;
		el.insertBefore(sideR, el.firstChild);
	}
	return {
		sideL,
		sideR,
		nearL: sideL.querySelector(".gauge-bar-near"),
		farL: sideL.querySelector(".gauge-bar-far"),
		nearR: sideR.querySelector(".gauge-bar-near"),
		farR: sideR.querySelector(".gauge-bar-far")
	};
}

function gaugeBarZoneActive(gauge, src, gear, placement) {
	return gaugeBarRegionActive(gauge, src, gear, placement);
}

/** Overlay assigned to a bar map region and has content to show. */
function gaugeBarOverlayInRegion(gauge, src, gear, role, region) {
	if (gaugeOverlayRegion(gauge, role) !== region) {
		return false;
	}
	if (role === "icon") {
		return !!(src && sourceIconPath(src, gear));
	}
	if (role === "label") {
		return !!(src && sourceTitle(src, gear && gear.varName, gear));
	}
	if (role === "count") {
		return gaugeCountVisible(gauge) && !!(src && formatGaugeCountValue(gauge, src));
	}
	return false;
}

function gaugeBarRegionActive(gauge, src, gear, region) {
	return (
		gaugeBarOverlayInRegion(gauge, src, gear, "icon", region) ||
		gaugeBarOverlayInRegion(gauge, src, gear, "label", region) ||
		gaugeBarOverlayInRegion(gauge, src, gear, "count", region)
	);
}

function countBarRegionTextSlots(gauge, src, gear, region) {
	let n = 0;
	if (gaugeBarOverlayInRegion(gauge, src, gear, "label", region)) {
		n++;
	}
	if (gaugeBarOverlayInRegion(gauge, src, gear, "count", region)) {
		n++;
	}
	return n;
}

function releaseBarOverlayNodes(el) {
	const iconEl = el.querySelector(".gauge-gear-icon");
	const labelEl = el.querySelector(".gauge-gear-label");
	const countEl = el.querySelector(".gauge-gear-count");
	for (const node of [iconEl, labelEl, countEl]) {
		if (node && node.parentElement && node.parentElement !== el) {
			clearGaugeOverlayAbsolute(node);
			el.appendChild(node);
		}
	}
}

/** Detach overlays from zone containers so each region can claim only its own elements. */

/** Detach overlays from zone containers so each region can claim only its own elements. */
function prepareGaugeBarZoneLayout(el) {
	releaseBarOverlayNodes(el);
	rehomeBarZoneContainer(el, el.querySelector(".gauge-bar-center"));
	rehomeBarZoneContainer(el, el.querySelector(".gauge-bar-zone.is-up"));
	rehomeBarZoneContainer(el, el.querySelector(".gauge-bar-zone.is-down"));
	for (const slot of el.querySelectorAll(".gauge-bar-near, .gauge-bar-far")) {
		for (const child of [...slot.children]) {
			el.appendChild(child);
		}
		slot.replaceChildren();
	}
}

function rehomeBarZoneContainer(el, container) {
	if (!container) {
		return;
	}
	for (const child of [...container.children]) {
		el.appendChild(child);
	}
	container.replaceChildren();
}

/** Bar overlays in a cardinal zone are laid out by zone containers, not absolute stack math. */

/** Bar overlays in a cardinal zone are laid out by zone containers, not absolute stack math. */
function barOverlayUsesZoneLayout(gauge, src, gear, placement) {
	if (!placement || placement === "none") {
		return false;
	}
	return placement === "left" || placement === "right" || placement === "centered" || placement === "up" || placement === "down";
}

function ensureGaugeBarCenterRow(el) {
	let row = el.querySelector(".gauge-bar-center");
	if (!row) {
		row = document.createElement("div");
		row.className = "gauge-bar-center";
		row.hidden = true;
		el.appendChild(row);
	}
	return row;
}

/** Bar centered: icon | title | count in a horizontal row over the bar. */

/** Bar centered: icon | title | count in a horizontal row over the bar. */
function layoutGaugeBarCenterRow(el, gauge, { iconSize, iconOffset = 0, barMetrics, barWidth = 0 }) {
	const row = ensureGaugeBarCenterRow(el);
	const iconEl = el.querySelector(".gauge-gear-icon");
	const labelEl = el.querySelector(".gauge-gear-label");
	const countEl = el.querySelector(".gauge-gear-count");
	const { src, gear } = gaugeLinked(gauge);
	const active = gaugeBarRegionActive(gauge, src, gear, "centered");
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));

	if (!active) {
		row.hidden = true;
		return { inRow: false, textWidth: 0, textSlots: 0 };
	}

	row.hidden = false;
	row.style.gap = `${iconGap}px`;

	const placeText = (node) => {
		if (!node) {
			return;
		}
		clearGaugeOverlayAbsolute(node);
		node.style.transform = "";
		node.style.whiteSpace = "nowrap";
		node.style.flex = "0 1 auto";
		node.style.minWidth = "0";
		node.style.maxWidth = "100%";
		node.style.overflow = "hidden";
		node.style.textAlign = "center";
		row.appendChild(node);
	};

	if (gaugeBarOverlayInRegion(gauge, src, gear, "icon", "centered") && iconEl && !iconEl.hidden) {
		clearGaugeOverlayAbsolute(iconEl);
		iconEl.style.transform = "";
		iconEl.style.flex = `0 0 ${iconSize}px`;
		iconEl.style.width = `${iconSize}px`;
		iconEl.style.height = `${iconSize}px`;
		row.appendChild(iconEl);
	}
	if (gaugeBarOverlayInRegion(gauge, src, gear, "label", "centered") && labelEl && !labelEl.hidden) {
		placeText(labelEl);
	}
	if (gaugeBarOverlayInRegion(gauge, src, gear, "count", "centered") && countEl && !countEl.hidden) {
		placeText(countEl);
	}

	placeBarZoneSatellite(row, barMetrics, "centered");

	const textSlots = countBarRegionTextSlots(gauge, src, gear, "centered");
	const iconW =
		gaugeBarOverlayInRegion(gauge, src, gear, "icon", "centered") && iconEl && !iconEl.hidden
			? iconSize
			: 0;
	const gaps = Math.max(0, (row.children.length - 1) * iconGap);
	const textWidth = Math.max(24, Math.round(Number(barWidth) || 0) - iconW - gaps);

	return { inRow: true, textWidth, textSlots };
}

function ensureGaugeBarZone(el, zone) {
	const cls = zone === "up" ? "is-up" : "is-down";
	let zoneEl = el.querySelector(`.gauge-bar-zone.${cls}`);
	if (!zoneEl) {
		zoneEl = document.createElement("div");
		zoneEl.className = `gauge-bar-zone ${cls}`;
		zoneEl.hidden = true;
		el.appendChild(zoneEl);
	}
	return zoneEl;
}

/**
 * Bar up/down zones: vertical stacks independent of other zones.
 * Up: title, count, icon (icon nearest bar). Down: icon, title, count.
 */

/**
 * Bar up/down zones: vertical stacks independent of other zones.
 * Up: title, count, icon (icon nearest bar). Down: icon, title, count.
 */
function layoutGaugeBarVerticalZone(el, gauge, zone, { iconSize, barMetrics, barWidth = 0 }) {
	const zoneEl = ensureGaugeBarZone(el, zone);
	const iconEl = el.querySelector(".gauge-gear-icon");
	const labelEl = el.querySelector(".gauge-gear-label");
	const countEl = el.querySelector(".gauge-gear-count");
	const { src, gear } = gaugeLinked(gauge);
	const active = gaugeBarRegionActive(gauge, src, gear, zone);
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));

	if (!active) {
		zoneEl.hidden = true;
		return { inZone: false, textWidth: 0, textSlots: 0 };
	}

	zoneEl.hidden = false;
	zoneEl.style.flexDirection = "column";
	zoneEl.style.alignItems = "center";
	zoneEl.style.gap = `${lineGap}px`;
	zoneEl.style.margin = "0";

	const placeText = (node) => {
		if (!node) {
			return;
		}
		clearGaugeOverlayAbsolute(node);
		node.style.transform = "";
		node.style.whiteSpace = "nowrap";
		node.style.textAlign = "center";
		node.style.maxWidth = "100%";
		node.style.overflow = "hidden";
		zoneEl.appendChild(node);
	};

	const placeIcon = () => {
		clearGaugeOverlayAbsolute(iconEl);
		iconEl.style.transform = "";
		iconEl.style.width = `${iconSize}px`;
		iconEl.style.height = `${iconSize}px`;
		iconEl.style.flex = `0 0 ${iconSize}px`;
		zoneEl.appendChild(iconEl);
	};

	if (zone === "up") {
		if (gaugeBarOverlayInRegion(gauge, src, gear, "label", "up") && labelEl && !labelEl.hidden) {
			placeText(labelEl);
		}
		if (gaugeBarOverlayInRegion(gauge, src, gear, "count", "up") && countEl && !countEl.hidden) {
			placeText(countEl);
		}
		if (gaugeBarOverlayInRegion(gauge, src, gear, "icon", "up") && iconEl && !iconEl.hidden) {
			placeIcon();
		}
	} else {
		if (gaugeBarOverlayInRegion(gauge, src, gear, "icon", "down") && iconEl && !iconEl.hidden) {
			placeIcon();
		}
		if (gaugeBarOverlayInRegion(gauge, src, gear, "label", "down") && labelEl && !labelEl.hidden) {
			placeText(labelEl);
		}
		if (gaugeBarOverlayInRegion(gauge, src, gear, "count", "down") && countEl && !countEl.hidden) {
			placeText(countEl);
		}
	}

	placeBarZoneSatellite(zoneEl, barMetrics, zone);

	const textSlots = countBarRegionTextSlots(gauge, src, gear, zone);
	const textWidth = Math.max(24, Math.round(Number(barWidth) || 0));

	return { inZone: true, textWidth, textSlots };
}

function layoutGaugeBarSideRows(el, gauge, { iconSize, iconOffset = 0, barMetrics, barWidth = 0 }) {
	const parts = ensureGaugeBarSides(el);
	const { sideL, sideR, nearL, farL, nearR, farR } = parts;
	const iconEl = el.querySelector(".gauge-gear-icon");
	const labelEl = el.querySelector(".gauge-gear-label");
	const countEl = el.querySelector(".gauge-gear-count");
	const { src, gear } = gaugeLinked(gauge);
	const labelPlace = gaugeOverlayRegion(gauge, "label");
	const countPlace = gaugeOverlayRegion(gauge, "count");
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const slotPad = Math.max(4, Math.round(iconSize * 0.15));
	const iconOnLeft =
		gaugeBarOverlayInRegion(gauge, src, gear, "icon", "left") && iconEl && !iconEl.hidden;
	const iconOnRight =
		gaugeBarOverlayInRegion(gauge, src, gear, "icon", "right") && iconEl && !iconEl.hidden;
	const labelOnLeft =
		gaugeBarOverlayInRegion(gauge, src, gear, "label", "left") && labelEl && !labelEl.hidden;
	const labelOnRight =
		gaugeBarOverlayInRegion(gauge, src, gear, "label", "right") && labelEl && !labelEl.hidden;
	const countOnLeft =
		gaugeBarOverlayInRegion(gauge, src, gear, "count", "left") && countEl && !countEl.hidden;
	const countOnRight =
		gaugeBarOverlayInRegion(gauge, src, gear, "count", "right") && countEl && !countEl.hidden;
	const useLeft = iconOnLeft || labelOnLeft || countOnLeft;
	const useRight = iconOnRight || labelOnRight || countOnRight;

	const resetSlot = (slot) => {
		if (!slot) {
			return;
		}
		slot.style.flex = "0 0 0px";
		slot.style.width = "0";
		slot.style.minWidth = "0";
		slot.style.padding = "0";
		slot.style.maxWidth = "";
		slot.style.margin = "0";
	};

	const placeIcon = (slot, side) => {
		slot.style.flex = `0 0 ${iconSize}px`;
		slot.style.width = `${iconSize}px`;
		slot.style.minWidth = `${iconSize}px`;
		slot.style.padding = "0";
		// Gap between the icon and the endcap tip.
		slot.style.marginLeft = side === "right" ? `${slotPad}px` : "0";
		slot.style.marginRight = side === "left" ? `${slotPad}px` : "0";
		clearGaugeOverlayAbsolute(iconEl);
		iconEl.style.width = `${iconSize}px`;
		iconEl.style.height = `${iconSize}px`;
		iconEl.style.transform = "";
		slot.appendChild(iconEl);
	};

	const placeIconPad = (slot, side) => {
		// Empty near slot still keeps text off the endcap.
		slot.style.flex = `0 0 ${slotPad}px`;
		slot.style.width = `${slotPad}px`;
		slot.style.minWidth = `${slotPad}px`;
		slot.style.padding = "0";
		slot.style.margin = "0";
	};

	const placeFarSlot = (slot, side, withIcon, withTitle, withCount) => {
		const sideRoom = Math.max(48, Math.round((Number(barWidth) || 120) * 0.55));
		const pad = withIcon ? slotPad : 0;
		const stackTitleCount = withTitle && withCount && labelPlace === countPlace;
		const singleText = (withTitle && !withCount) || (withCount && !withTitle);
		slot.style.padding = "0";
		slot.style.marginLeft = side === "right" && withIcon ? `${pad}px` : "0";
		slot.style.marginRight = side === "left" && withIcon ? `${pad}px` : "0";
		if (stackTitleCount) {
			slot.style.flex = `0 0 ${sideRoom}px`;
			slot.style.width = `${sideRoom}px`;
			slot.style.minWidth = `${sideRoom}px`;
			slot.style.maxWidth = `${sideRoom}px`;
			slot.style.flexDirection = "column";
			slot.style.alignItems = side === "left" ? "flex-end" : "flex-start";
		} else if (singleText) {
			slot.style.flex = "0 1 auto";
			slot.style.width = "auto";
			slot.style.minWidth = "0";
			slot.style.maxWidth = `${sideRoom}px`;
			slot.style.flexDirection = "";
			slot.style.alignItems = side === "left" ? "flex-end" : "flex-start";
		} else {
			slot.style.flex = `0 0 ${sideRoom}px`;
			slot.style.width = `${sideRoom}px`;
			slot.style.minWidth = `${sideRoom}px`;
			slot.style.maxWidth = `${sideRoom}px`;
			slot.style.flexDirection = "";
			slot.style.alignItems = "center";
		}
		if (withTitle && labelEl) {
			clearGaugeOverlayAbsolute(labelEl);
			labelEl.style.width = "100%";
			labelEl.style.maxWidth = "100%";
			labelEl.style.whiteSpace = "nowrap";
			labelEl.style.overflowWrap = "normal";
			labelEl.style.overflow = "hidden";
			labelEl.style.textAlign = side === "left" ? "right" : "left";
			labelEl.style.transform = "";
			slot.appendChild(labelEl);
		}
		if (withCount) {
			clearGaugeOverlayAbsolute(countEl);
			countEl.style.width = "100%";
			countEl.style.maxWidth = "100%";
			countEl.style.whiteSpace = "nowrap";
			countEl.style.overflowWrap = "normal";
			countEl.style.overflow = "hidden";
			countEl.style.textAlign = side === "left" ? "right" : "left";
			countEl.style.transform = "";
			slot.appendChild(countEl);
		}
		return sideRoom;
	};

	resetSlot(nearL);
	resetSlot(farL);
	resetSlot(nearR);
	resetSlot(farR);

	sideL.hidden = !useLeft;
	sideR.hidden = !useRight;

	let labelWidth = 0;
	if (iconOnLeft) {
		placeIcon(nearL, "left");
	} else if (labelOnLeft || countOnLeft) {
		placeIconPad(nearL, "left");
	}
	if (iconOnRight) {
		placeIcon(nearR, "right");
	} else if (labelOnRight || countOnRight) {
		placeIconPad(nearR, "right");
	}
	if (labelOnLeft || countOnLeft) {
		labelWidth = placeFarSlot(farL, "left", iconOnLeft, labelOnLeft, countOnLeft);
	}
	if (labelOnRight || countOnRight) {
		labelWidth = placeFarSlot(farR, "right", iconOnRight, labelOnRight, countOnRight);
	}

	if (useLeft) {
		placeBarZoneSatellite(sideL, barMetrics, "left");
	}
	if (useRight) {
		placeBarZoneSatellite(sideR, barMetrics, "right");
	}

	return {
		iconInSide: iconOnLeft || iconOnRight,
		labelInSide: labelOnLeft || labelOnRight || countOnLeft || countOnRight,
		labelWidth
	};
}

/** Available box for a gauge label; used for sizing + font fit. */

function patchGaugeBarLive(el, gauge, src, gear) {
	const fill = el.querySelector(".gauge-bar-fill");
	if (!fill) {
		return;
	}
	const pct = src ? barPercent(src) : 0;
	fill.style.width = `${pct}%`;
	fill.style.backgroundColor = src ? sourceBarColor(src, gear, null) : themeFill();
	const dir = normalizeFillDirection(gaugeSettings(gauge).fillDirection);
	if (dir === "right") {
		fill.style.left = "auto";
		fill.style.right = "0";
		fill.style.transform = "";
	} else if (dir === "center") {
		fill.style.left = `${(100 - pct) / 2}%`;
		fill.style.right = "auto";
		fill.style.transform = "";
	} else {
		fill.style.left = "0";
		fill.style.right = "auto";
		fill.style.transform = "";
	}
	if (typeof sizeBarSheen === "function") {
		sizeBarSheen(fill);
	}
	// Full paintGaugeBar is skipped on live ticks; still refresh icon path + tint.
	const capH = Math.round(gauge.display.height);
	const capLayout =
		typeof gaugeBarCapLayout === "function" ? gaugeBarCapLayout(gauge, capH) : { capShift: 0 };
	if (typeof paintGaugeGearIcon === "function") {
		paintGaugeGearIcon(el, gauge, {
			iconSize: capH,
			iconOffset: Number(capLayout.capShift) || 0,
			barWidth: gauge.display.width,
			barHeight: gauge.display.height
		});
	}
}

function gaugeBarChromeNodes(el) {
	let cache = el._cogBarChrome;
	if (!cache || !cache.track || !cache.track.isConnected) {
		cache = {
			track: el.querySelector(".gauge-bar-track"),
			clip: el.querySelector(".gauge-bar-clip"),
			trough: el.querySelector(".gauge-bar-trough"),
			fill: el.querySelector(".gauge-bar-fill"),
			capL: el.querySelector(".gauge-endcap-left"),
			capR: el.querySelector(".gauge-endcap-right"),
			border: el.querySelector(".gauge-bar-border"),
			rotor: el.querySelector(".gauge-bar-rotor"),
			label: null,
			center: null,
			zoneUp: null,
			zoneDown: null,
			sides: null
		};
		el._cogBarChrome = cache;
	}
	return cache;
}

function paintGaugeBar(el, gauge) {
	if (normalizeGaugeType(gaugeSettings(gauge).type) !== "meter" || normalizeGaugeShape(gaugeSettings(gauge).shape) !== "bar") {
		return;
	}
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	ensureGaugeBarRotor(el);
	const nodes = gaugeBarChromeNodes(el);
	let { track, clip, trough, fill, capL, capR, border, rotor } = nodes;
	if (!border) {
		border = document.createElement("div");
		border.className = "gauge-bar-border";
		nodes.border = border;
		ensureGaugeChrome(rotor || el.querySelector(".gauge-bar-rotor"), { border, caps: [capL, capR] });
	}
	if (!track || !trough || !fill) {
		return;
	}

	const borderPct = gaugeSettings(gauge).borderThickness;
	const borderPx = borderPct <= 0 ? 0 : (gauge.display.height * borderPct) / 100;
	const capH = Math.round(gauge.display.height);
	const capLayout = gaugeBarCapLayout(gauge, capH);
	const { hasCaps, capW, capShift, seatIn } = capLayout;
	const borderColor = gaugeBorderColor(gauge);

	// Full-width track and borders; endcaps overlap onto the ends (same idea as arcs).
	track.style.left = "0";
	track.style.right = "0";
	track.style.top = "0";
	track.style.bottom = "0";
	track.style.border = "0";

	if (clip) {
		// Extend fill/trough slightly under cap seats so trough doesn't peek at the edges.
		clip.style.left = hasCaps ? `${-seatIn}px` : "0";
		clip.style.right = hasCaps ? `${-seatIn}px` : "0";
		clip.style.top = "0";
		clip.style.bottom = "0";
	}

	if (border) {
		border.style.left = "0";
		border.style.right = "0";
		border.style.top = "0";
		border.style.bottom = "0";
		if (borderPx > 0) {
			border.style.borderTop = `${borderPx}px solid ${borderColor}`;
			border.style.borderBottom = `${borderPx}px solid ${borderColor}`;
			if (!hasCaps) {
				border.style.borderLeft = `${borderPx}px solid ${borderColor}`;
				border.style.borderRight = `${borderPx}px solid ${borderColor}`;
			} else {
				border.style.borderLeft = "0";
				border.style.borderRight = "0";
			}
		} else {
			border.style.border = "0";
		}
	}

	const troughA = gaugeSettings(gauge).troughOpacity / 100;
	if (troughA <= 0) {
		trough.style.opacity = "0";
	} else {
		trough.style.opacity = String(troughA);
	}
	trough.style.background = "#000";

	const pct = src ? barPercent(src) : 0;
	fill.style.width = `${pct}%`;
	fill.style.backgroundColor = src ? sourceBarColor(src, gear, null) : themeFill();
	const dir = normalizeFillDirection(gaugeSettings(gauge).fillDirection);
	if (dir === "right") {
		fill.style.left = "auto";
		fill.style.right = "0";
		fill.style.transform = "";
	} else if (dir === "center") {
		fill.style.left = `${(100 - pct) / 2}%`;
		fill.style.right = "auto";
		fill.style.transform = "";
	} else {
		fill.style.left = "0";
		fill.style.right = "auto";
		fill.style.transform = "";
	}
	sizeBarSheen(fill);

	paintGaugeEndCaps(gauge, { capL, capR, capH, capW, capShift, borderColor });

	const overlay = { iconSize: capH, iconOffset: capShift, barWidth: gauge.display.width, barHeight: gauge.display.height };
	ensureGaugeBarRotor(el);
	const capGeom = gaugeBarCapGeometry(gauge, capLayout);
	const barMetrics = gaugeBarLayoutMetrics(gauge, capH, capGeom);
	paintGaugeGearIcon(el, gauge, overlay);
	paintGaugeLabel(el, gauge, overlay);
	paintGaugeCount(el, gauge, overlay);
	prepareGaugeBarZoneLayout(el);
	// Center/up/down claim their overlays first; left/right runs last.
	const centerRow = layoutGaugeBarCenterRow(el, gauge, {
		iconSize: capH,
		iconOffset: capShift,
		barMetrics,
		barWidth: gauge.display.width
	});
	const upZone = layoutGaugeBarVerticalZone(el, gauge, "up", {
		iconSize: capH,
		barMetrics,
		barWidth: gauge.display.width
	});
	const downZone = layoutGaugeBarVerticalZone(el, gauge, "down", {
		iconSize: capH,
		barMetrics,
		barWidth: gauge.display.width
	});
	const sideRow = layoutGaugeBarSideRows(el, gauge, {
		iconSize: capH,
		iconOffset: capShift,
		barMetrics,
		barWidth: gauge.display.width
	});
	nodes.center = el.querySelector(".gauge-bar-center");
	nodes.zoneUp = el.querySelector(".gauge-bar-zone.is-up");
	nodes.zoneDown = el.querySelector(".gauge-bar-zone.is-down");
	nodes.label = el.querySelector(".gauge-gear-label");
	nodes.sides = el.querySelectorAll(".gauge-bar-side:not([hidden])");
	const fitBarZoneText = (zoneEl, zoneInfo) => {
		if (!zoneEl || (!zoneInfo.inRow && !zoneInfo.inZone)) {
			return;
		}
		const labelEl = zoneEl.querySelector(".gauge-gear-label");
		const countEl = zoneEl.querySelector(".gauge-gear-count");
		const preferred = Number(labelEl && labelEl.dataset.labelSize) || gaugeFontSizePx(gauge, capH);
		const slotCount = Math.max(1, zoneInfo.textSlots || 0);
		const gapTotal =
			slotCount > 1 ? Math.max(2, Math.round(capH * 0.1)) * (slotCount - 1) : 0;
		const fitW =
			zoneInfo.inRow
				? Math.max(24, Math.floor((zoneInfo.textWidth - gapTotal) / slotCount) - 2)
				: Math.max(24, zoneInfo.textWidth - 2);
		if (labelEl && !labelEl.hidden) {
			labelEl.style.whiteSpace = "nowrap";
			fitLabelFont(labelEl, fitW, preferred);
		}
		if (countEl && !countEl.hidden) {
			countEl.style.whiteSpace = "nowrap";
			fitLabelFont(countEl, fitW, preferred);
		}
	};
	if (sideRow.labelInSide) {
		const preferred =
			Number(nodes.label?.dataset.labelSize) || gaugeFontSizePx(gauge, capH);
		const fitW = Math.max(24, sideRow.labelWidth - 2);
		for (const sideRoot of nodes.sides) {
			const labelEl = sideRoot.querySelector(".gauge-gear-label");
			const countEl = sideRoot.querySelector(".gauge-gear-count");
			if (labelEl && !labelEl.hidden) {
				fitLabelFont(labelEl, fitW, preferred);
			}
			if (countEl && !countEl.hidden) {
				fitLabelFont(countEl, fitW, preferred);
			}
		}
	}
	if (centerRow.inRow) {
		fitBarZoneText(nodes.center, centerRow);
	}
	if (upZone.inZone) {
		fitBarZoneText(nodes.zoneUp, upZone);
	}
	if (downZone.inZone) {
		fitBarZoneText(nodes.zoneDown, downZone);
	}

	const inactive =
		!gaugeSettings(gauge).alwaysVisible &&
		(src ? isHudHidden(src, gear) : !src) &&
		document.body.classList.contains("is-focused");
	el.classList.toggle("is-inactive", inactive);
}

function buildGaugeBarEl(gauge, preview) {
	const el = document.createElement("div");
	el.className = "hud-gauge hud-gauge-bar";
	el.dataset.gaugeShape = "bar";
	el.dataset.id = gauge.id;
	el.innerHTML = `
		<div class="gauge-bar-rotor">
			<div class="gauge-bar-track">
				<div class="gauge-bar-meter">
					<div class="gauge-bar-clip">
						<span class="gauge-bar-trough"></span>
						<span class="gauge-bar-fill"><span class="gear-bar-sheen"></span></span>
					</div>
				</div>
			</div>
			<div class="gauge-chrome">
				<div class="gauge-bar-border"></div>
				<div class="gauge-endcap gauge-endcap-left" hidden><div class="gauge-endcap-face"></div></div>
				<div class="gauge-endcap gauge-endcap-right" hidden><div class="gauge-endcap-face"></div></div>
			</div>
		</div>
		<div class="gauge-bar-side is-left" hidden>
			<div class="gauge-bar-far"></div>
			<div class="gauge-bar-near"></div>
		</div>
		<div class="gauge-bar-side is-right" hidden>
			<div class="gauge-bar-near"></div>
			<div class="gauge-bar-far"></div>
		</div>
		<div class="gauge-gear-icon gear-icon" hidden><img alt=""></div>
		<div class="gauge-gear-label gear-label" hidden></div>
		<span class="gauge-gear-count gear-value" hidden></span>`;
	layoutHudGauge(el, gauge);
	paintGauge(el, gauge);
	if (preview) {
		attachGaugeHandles(el, gauge);
	}
	return el;
}
