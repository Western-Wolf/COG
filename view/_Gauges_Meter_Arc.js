// COG overlay - Meter arc shape (loads after _Gauges.js / _Gauges_Meter.js).

function gaugeArcMetrics(gauge) {
	const W = Math.round(gauge.display.width);
	const band = Math.max(MIN_GAUGE_HEIGHT, Math.round(gauge.display.height));
	const ro = W / 2;
	const ri = Math.max(1, ro - band);
	const cx = W / 2;
	const cy = ro;
	return { W, band, ro, ri, cx, cy, layoutH: ro };
}

function gaugeArcCapLayout(gauge, band) {
	const W = Math.round(gauge.display.width);
	const hasCaps = gaugeUsesEndArt(gauge) && !!resolveGaugeEndArtHref(gauge);
	const artPath = migrateEndCapPath(gaugeSettings(gauge).endCap);
	const capH = Math.max(MIN_GAUGE_HEIGHT, Math.round(band));
	const capW = hasCaps ? Math.max(1, Math.round(capH * endCapAspectRatio(artPath))) : 0;
	const overlapPx = hasCaps ? (W * gaugeSettings(gauge).endCapOverlap) / 100 : 0;
	const capOutPx = hasCaps ? (band * GAUGE_BAR_CAP_OUT_PCT) / 100 : 0;
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
function gaugeArcCapGeometry(gauge, capLayout, arcCore) {
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

function gaugeArcLayoutMetrics(gauge, band, arcGeom, arcCore) {
	const arcW = arcCore.W;
	const arcH = arcCore.layoutH;
	const rad = gaugeBarRotRad(gauge);
	const margin = gaugeBarOverlayMargin(gauge, band);
	const geom = arcGeom || gaugeArcCapGeometry(gauge, gaugeArcCapLayout(gauge, band), arcCore);
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

function arcLocalToEl(metrics, lx, ly) {
	const { arcW, arcH, rad, rotorLeft, rotorTop } = metrics;
	const rotated = gaugeBarRotatePt(arcW / 2, arcH / 2, lx, ly, rad);
	return { x: rotorLeft + rotated.x, y: rotorTop + rotated.y };
}

function arcOutwardToEl(metrics, outX, outY) {
	const rad = metrics.rad;
	return {
		x: outX * Math.cos(rad) - outY * Math.sin(rad),
		y: outX * Math.sin(rad) + outY * Math.cos(rad)
	};
}

function arcRegionSatelliteEdge(metrics, region) {
	const geom = metrics.arcGeom;
	if (!geom) {
		return arcLocalToEl(metrics, metrics.arcW / 2, metrics.arcH / 2);
	}
	if (region === "centered") {
		return arcLocalToEl(metrics, geom.centerX, geom.centerY);
	}
	const { edgeX, edgeY, outX, outY } = barRegionEdgeAndOutward(geom, region);
	const edgeEl = arcLocalToEl(metrics, edgeX, edgeY);
	const outEl = arcOutwardToEl(metrics, outX, outY);
	const dist = geom.zoneGap;
	return {
		x: edgeEl.x + outEl.x * dist,
		y: edgeEl.y + outEl.y * dist
	};
}

function arcRegionSatelliteCenter(metrics, region, zoneW, zoneH) {
	const geom = metrics.arcGeom;
	if (!geom) {
		return arcLocalToEl(metrics, metrics.arcW / 2, metrics.arcH / 2);
	}
	if (region === "centered") {
		return arcLocalToEl(metrics, geom.centerX, geom.centerY);
	}
	const { edgeX, edgeY, outX, outY } = barRegionEdgeAndOutward(geom, region);
	const edgeEl = arcLocalToEl(metrics, edgeX, edgeY);
	const outEl = arcOutwardToEl(metrics, outX, outY);
	const dist = geom.zoneGap + barZoneHalfAlongOut(outEl, zoneW, zoneH);
	return {
		x: edgeEl.x + outEl.x * dist,
		y: edgeEl.y + outEl.y * dist
	};
}

function placeArcZoneSatellite(zoneEl, arcMetrics, region) {
	if (!zoneEl) {
		return;
	}
	if (region === "centered") {
		const center = arcRegionSatelliteCenter(
			arcMetrics,
			region,
			zoneEl.offsetWidth,
			zoneEl.offsetHeight
		);
		placeBarZoneAt(zoneEl, center, "translate(-50%, -50%)");
		return;
	}
	const geom = arcMetrics.arcGeom;
	if (!geom) {
		return;
	}
	const { outX, outY } = barRegionEdgeAndOutward(geom, region);
	const outEl = arcOutwardToEl(arcMetrics, outX, outY);
	const anchor = arcRegionSatelliteEdge(arcMetrics, region);
	placeBarZoneAt(zoneEl, anchor, barSatelliteInnerTransform(outEl));
}

function arcPoint(cx, cy, r, angle) {
	return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
}

function arcBandPathD({ cx, cy, ro, ri }) {
	const xo0 = cx - ro;
	const xo1 = cx + ro;
	const xi0 = cx - ri;
	const xi1 = cx + ri;
	return `M ${xo0} ${cy} A ${ro} ${ro} 0 0 1 ${xo1} ${cy} L ${xi1} ${cy} A ${ri} ${ri} 0 0 0 ${xi0} ${cy} Z`;
}

function arcOuterPathD({ cx, cy, ro }) {
	return `M ${cx - ro} ${cy} A ${ro} ${ro} 0 0 1 ${cx + ro} ${cy}`;
}

function arcInnerPathD({ cx, cy, ri }) {
	return `M ${cx - ri} ${cy} A ${ri} ${ri} 0 0 1 ${cx + ri} ${cy}`;
}

function arcMeterBorderPx(band, borderThicknessPct) {
	const borderPct = borderThicknessPct ?? 0;
	return borderPct <= 0 ? 0 : (band * borderPct) / 100;
}

function paintArcMeterBorders(borderOuter, borderInner, arcCore, borderColor, borderThicknessPct, endBorders) {
	const { cx, cy, ro, ri, band } = arcCore;
	const borderPx = arcMeterBorderPx(band, borderThicknessPct);
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
		half > 0 ? arcOuterPathD({ cx, cy, ro: Math.max(ri + 0.5, ro - half) }) : arcOuterPathD(arcCore)
	);
	paintBorderPath(
		borderInner,
		half > 0 ? arcInnerPathD({ cx, cy, ri: Math.min(ro - 0.5, ri + half) }) : arcInnerPathD(arcCore)
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

function arcFillClipD(metrics, pct, dir) {
	const { cx, cy, ro, ri } = metrics;
	const span = (Math.PI * Math.max(0, Math.min(100, pct))) / 100;
	if (span <= 0.0001) {
		return `M ${cx} ${cy} Z`;
	}
	const d = normalizeFillDirection(dir);
	const large = span > Math.PI ? 1 : 0;
	let aStart;
	let aEnd;
	let outerSweep;
	let innerSweep;
	if (d === "right") {
		aStart = 0;
		aEnd = span;
		outerSweep = 0;
		innerSweep = 1;
	} else if (d === "center") {
		aStart = Math.PI / 2 + span / 2;
		aEnd = Math.PI / 2 - span / 2;
		outerSweep = 1;
		innerSweep = 0;
	} else {
		aStart = Math.PI;
		aEnd = Math.PI - span;
		outerSweep = 1;
		innerSweep = 0;
	}
	const [xos, yos] = arcPoint(cx, cy, ro, aStart);
	const [xoe, yoe] = arcPoint(cx, cy, ro, aEnd);
	const [xie, yie] = arcPoint(cx, cy, ri, aEnd);
	const [xis, yis] = arcPoint(cx, cy, ri, aStart);
	return `M ${xos} ${yos} A ${ro} ${ro} 0 ${large} ${outerSweep} ${xoe} ${yoe} L ${xie} ${yie} A ${ri} ${ri} 0 ${large} ${innerSweep} ${xis} ${yis} Z`;
}

/** Which arc overlays share one placement slot (config + content). */
function gaugeArcOverlayStackIntent(gauge, src, gear, placement) {
	if (!src) {
		return { icon: false, title: false, count: false };
	}
	const icon = normalizeGaugePlacement(gaugeSettings(gauge).showIcon);
	const title = normalizeGaugePlacement(gaugeSettings(gauge).showLabel);
	const count = normalizeGaugePlacement(gaugeSettings(gauge).showNumber);
	return {
		icon: icon === placement && !!sourceIconPath(src, gear),
		title: title === placement && !!sourceTitle(src, gear && gear.varName, gear),
		count:
			gaugeCountVisible(gauge) &&
			count === placement &&
			!!formatGaugeCountValue(gauge, src)
	};
}

function gaugeArcCenteredStackIntent(gauge, src, gear) {
	return gaugeArcOverlayStackIntent(gauge, src, gear, "centered");
}

/** Top positions for title â†’ count â†’ icon stack on arcs. */

/** Top positions for title â†’ count â†’ icon stack on arcs. */
function gaugeArcOverlayStackLayout(gauge, src, gear, placement, layoutH, iconSize, iconGap, labelSize) {
	const stack = gaugeArcOverlayStackIntent(gauge, src, gear, placement);
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const layout = { iconTop: null, countTop: null, titleTop: null };
	if (!stack.icon && !stack.title && !stack.count) {
		return layout;
	}
	if (placement === "centered") {
		let cursor = layoutH - iconGap;
		if (stack.count) {
			layout.countTop = cursor - labelSize;
			cursor = layout.countTop - lineGap;
		}
		if (stack.title) {
			layout.titleTop = cursor - labelSize;
			cursor = layout.titleTop - lineGap;
		}
		if (stack.icon) {
			layout.iconTop = Math.max(0, cursor - iconSize);
		}
	} else if (placement === "up") {
		let cursor = stack.icon ? -iconGap - iconSize : -iconGap;
		if (stack.icon) {
			layout.iconTop = -iconGap - iconSize;
			cursor = layout.iconTop - lineGap;
		}
		if (stack.count) {
			layout.countTop = cursor - labelSize;
			cursor = layout.countTop - lineGap;
		}
		if (stack.title) {
			layout.titleTop = cursor - labelSize;
		}
	}
	return layout;
}

function gaugeArcCenteredLayout(gauge, src, gear, layoutH, iconSize, iconGap, labelSize) {
	return gaugeArcOverlayStackLayout(gauge, src, gear, "centered", layoutH, iconSize, iconGap, labelSize);
}

function gaugeArcOverlayStackHeight(gauge, src, gear, placement, iconSize, iconGap, labelSize) {
	const stack = gaugeArcOverlayStackIntent(gauge, src, gear, placement);
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const lineH = gaugeLabelLineBoxPx(labelSize);
	const parts = [];
	if (placement === "centered") {
		if (stack.icon) {
			parts.push(iconSize);
		}
		if (stack.title) {
			parts.push(lineH);
		}
		if (stack.count) {
			parts.push(lineH);
		}
	} else {
		if (stack.icon) {
			parts.push(iconSize + iconGap);
		}
		if (stack.count) {
			parts.push(lineH + lineGap);
		}
		if (stack.title) {
			parts.push(lineH);
		}
	}
	if (!parts.length) {
		return 0;
	}
	return parts.reduce((sum, n) => sum + n, 0) + lineGap * (parts.length - 1);
}

function gaugeArcCenteredStackHeight(gauge, src, gear, iconSize, iconGap, labelSize) {
	return gaugeArcOverlayStackHeight(gauge, src, gear, "centered", iconSize, iconGap, labelSize);
}

/** Left/right on arcs share one hollow between endcaps. */
function gaugeArcSidePlacement(place) {
	const p = normalizeGaugePlacement(place);
	return p === "left" || p === "right";
}

/** Title and count both live in the arc hollow (left or right - same band). */

/** Title and count both live in the arc hollow (left or right - same band). */
function gaugeTitleCountShareArcHollow(gauge) {
	if (!gaugeCountVisible(gauge)) {
		return false;
	}
	const title = normalizeGaugePlacement(gaugeSettings(gauge).showLabel);
	if (title === "none") {
		return false;
	}
	return gaugeArcSidePlacement(title) && gaugeArcSidePlacement(gaugeSettings(gauge).showNumber);
}

/** Title and count occupy the same placement slot (stack count below title). */

/** Arc left/right/centered share one hollow between the endcaps. */
function gaugeArcInHollowPlacement(placement) {
	return placement === "left" || placement === "right" || placement === "centered";
}

function gaugeArcOverlayInHollow(gauge, src, gear, role) {
	if (!src) {
		return false;
	}
	if (role === "icon") {
		const place = normalizeGaugePlacement(gaugeSettings(gauge).showIcon);
		return gaugeArcInHollowPlacement(place) && !!sourceIconPath(src, gear);
	}
	if (role === "label") {
		const place = normalizeGaugePlacement(gaugeSettings(gauge).showLabel);
		return gaugeArcInHollowPlacement(place) && !!sourceTitle(src, gear && gear.varName, gear);
	}
	if (role === "count") {
		const place = gaugeCountPlacement(gauge);
		return (
			gaugeCountVisible(gauge) &&
			gaugeArcInHollowPlacement(place) &&
			!!formatGaugeCountValue(gauge, src)
		);
	}
	return false;
}

function gaugeArcHollowActive(gauge, src, gear) {
	return (
		gaugeArcOverlayInHollow(gauge, src, gear, "icon") ||
		gaugeArcOverlayInHollow(gauge, src, gear, "label") ||
		gaugeArcOverlayInHollow(gauge, src, gear, "count")
	);
}

function gaugeArcHollowPlacementAlign(placement) {
	if (placement === "left") {
		return { alignSelf: "flex-start", text: "left" };
	}
	if (placement === "right") {
		return { alignSelf: "flex-end", text: "right" };
	}
	return { alignSelf: "center", text: "center" };
}

function gaugeArcHollowHeight(gauge, src, gear, iconSize, iconGap, labelSize) {
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const lineH = gaugeLabelLineBoxPx(labelSize);
	let copyH = 0;
	const iconPlace = normalizeGaugePlacement(gaugeSettings(gauge).showIcon);
	if (gaugeArcOverlayInHollow(gauge, src, gear, "icon") && iconPlace === "centered") {
		copyH += iconSize;
	}
	if (gaugeArcOverlayInHollow(gauge, src, gear, "label")) {
		copyH += copyH > 0 ? lineGap + lineH : lineH;
	}
	if (gaugeArcOverlayInHollow(gauge, src, gear, "count")) {
		copyH += copyH > 0 ? lineGap + lineH : lineH;
	}
	const sideIcon =
		gaugeArcOverlayInHollow(gauge, src, gear, "icon") &&
		(iconPlace === "left" || iconPlace === "right");
	const sideH = sideIcon ? iconSize : 0;
	return Math.max(iconSize, copyH, sideH);
}

function gaugeArcHollowMetrics(arcLayout, iconSize, iconGap, arcGeom = null) {
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

/** Fit arc hollow label/count to width and vertical room (preferred is still 50% of band). */
function fitGaugeArcHollowText(el, gauge, src, gear, iconSize, hollowInfo) {
	if (!hollowInfo.labelInHollow) {
		return;
	}
	const hollow = el.querySelector(".gauge-arc-hollow:not([hidden])");
	const copy = el.querySelector(".gauge-arc-copy");
	const labelEl = el.querySelector(".gauge-gear-label");
	const countEl = el.querySelector(".gauge-gear-count");
	const iconEl = el.querySelector(".gauge-gear-icon");
	if (!hollow || !copy) {
		return;
	}
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const basePreferred = gaugeLabelPreferredPx(iconSize, gauge);
	// Prefer measured height, but fall back to the layout value — opening/closing the
	// editor rebuilds HUD nodes before the browser has flushed layout (clientHeight === 0),
	// which previously collapsed preferred size to 6px. Clock already had this fallback.
	const hollowH =
		hollow.clientHeight > 0 ? hollow.clientHeight : Math.max(0, Number(hollowInfo.hollowH) || 0);
	if (hollowH <= 0) {
		return;
	}
	const iconReserved =
		iconEl && !iconEl.hidden && copy.contains(iconEl)
			? iconSize + (lineGap > 0 ? lineGap : 0)
			: 0;
	let copyTextSlots = 0;
	if (labelEl && !labelEl.hidden && copy.contains(labelEl)) {
		copyTextSlots++;
	}
	if (countEl && !countEl.hidden && copy.contains(countEl)) {
		copyTextSlots++;
	}
	const copyMeasured = copy.clientWidth > 0 ? copy.clientWidth : 0;
	const copyFitW = Math.max(24, Math.min(copyMeasured || hollowInfo.labelWidth, hollowInfo.labelWidth) - 2);
	const copyTextRoom = Math.max(0, hollowH - iconReserved - lineGap * Math.max(0, copyTextSlots - 1));
	const copyPerLineH = copyTextSlots > 0 ? copyTextRoom / copyTextSlots : copyTextRoom;
	const copyHeightPreferred = Math.max(6, Math.floor(copyPerLineH / 1.05));
	const copyPreferred = Math.min(basePreferred, copyHeightPreferred);

	const fitText = (node, widthPx, preferredPx, maxHeightPx) => {
		if (!node || node.hidden) {
			return;
		}
		node.style.whiteSpace = "nowrap";
		node.style.overflowWrap = "normal";
		fitLabelFont(node, widthPx, preferredPx, maxHeightPx);
	};

	fitText(labelEl, copyFitW, copyPreferred, copyPerLineH);
	fitText(countEl, copyFitW, copyPreferred, copyPerLineH);
}

function ensureGaugeArcZones(el) {
	ensureGaugeBarZone(el, "up").hidden = true;
	ensureGaugeBarZone(el, "down").hidden = true;
}

/**
 * Unified arc hollow at circle center: [icon-left | copy stack | icon-right].
 * Only the icon moves between columns; title and count keep their own alignment.
 */

/**
 * Unified arc hollow at circle center: [icon-left | copy stack | icon-right].
 * Only the icon moves between columns; title and count keep their own alignment.
 */
function layoutGaugeArcHollowZone(el, gauge, { iconSize, arcLayout, arcMetrics, arcGeom = null }) {
	const hollow = el.querySelector(".gauge-arc-hollow");
	const slotL = el.querySelector(".gauge-arc-slot.is-left");
	const slotR = el.querySelector(".gauge-arc-slot.is-right");
	const copy = el.querySelector(".gauge-arc-copy");
	const iconEl = el.querySelector(".gauge-gear-icon");
	const labelEl = el.querySelector(".gauge-gear-label");
	const countEl = el.querySelector(".gauge-gear-count");
	const { src, gear } = gaugeLinked(gauge);
	const iconPlace = normalizeGaugePlacement(gaugeSettings(gauge).showIcon);
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const lineGap = Math.max(2, Math.round(iconGap * 0.5));
	const labelSize = gaugeFontSizePx(gauge, iconSize);
	const slotPad = Math.max(4, Math.round(iconSize * 0.15));
	const empty = { iconInHollow: false, labelInHollow: false, centerInHollow: false, labelWidth: 0, hollowH: 0 };

	if (!hollow || !slotL || !slotR || !copy) {
		return empty;
	}

	if (hollow.parentElement !== el) {
		el.appendChild(hollow);
	}

	const centerRow = el.querySelector(".gauge-bar-center");
	if (centerRow) {
		centerRow.hidden = true;
	}

	const active = gaugeArcHollowActive(gauge, src, gear);
	if (!active) {
		hollow.hidden = true;
		hollow.style.transform = "";
		delete hollow.dataset.structSig;
		releaseOverlayFromArcHollow(el, iconEl);
		releaseOverlayFromArcHollow(el, labelEl);
		releaseOverlayFromArcHollow(el, countEl);
		return empty;
	}

	const hasIcon = gaugeArcOverlayInHollow(gauge, src, gear, "icon") && iconEl && !iconEl.hidden;
	const hasLabel = gaugeArcOverlayInHollow(gauge, src, gear, "label") && labelEl && !labelEl.hidden;
	const hasCount = gaugeArcOverlayInHollow(gauge, src, gear, "count") && countEl && !countEl.hidden;
	const labelPlace = normalizeGaugePlacement(gaugeSettings(gauge).showLabel);
	const countPlace = gaugeCountPlacement(gauge);
	const iconCentered = hasIcon && iconPlace === "centered";
	const iconLeft = hasIcon && iconPlace === "left";
	const iconRight = hasIcon && iconPlace === "right";

	const { span } = gaugeArcHollowMetrics(arcLayout, iconSize, iconGap, arcGeom);
	const hollowH = gaugeArcHollowHeight(gauge, src, gear, iconSize, iconGap, labelSize);

	hollow.hidden = false;
	hollow.style.width = `${span}px`;
	hollow.style.height = `${hollowH}px`;
	hollow.style.right = "";
	hollow.style.bottom = "";
	hollow.style.transform = "";

	const structSig = [
		iconLeft ? "IL" : "",
		iconRight ? "IR" : "",
		iconCentered ? "IC" : "",
		hasLabel ? `L:${labelPlace}` : "",
		hasCount ? `C:${countPlace}` : "",
		Math.round(iconSize),
		Math.round(slotPad),
		Math.round(lineGap)
	].join("|");
	const reuseStructure = hollow.dataset.structSig === structSig;
	if (!reuseStructure) {
		copy.replaceChildren();
		slotL.replaceChildren();
		slotR.replaceChildren();
		hollow.dataset.structSig = structSig;
	}

	const prepIconSlot = (slot, side) => {
		const filled = side === "left" ? iconLeft : iconRight;
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
			clearGaugeOverlayAbsolute(iconEl);
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

	copy.style.flexDirection = "column";
	copy.style.justifyContent = "flex-end";
	copy.style.alignItems = "stretch";
	copy.style.gap = `${lineGap}px`;

	const placeCopyText = (node, placement) => {
		const align = gaugeArcHollowPlacementAlign(placement);
		clearGaugeOverlayAbsolute(node);
		node.style.flex = "0 1 auto";
		node.style.width = "100%";
		node.style.maxWidth = "100%";
		node.style.minWidth = "0";
		node.style.whiteSpace = "nowrap";
		node.style.overflowWrap = "normal";
		node.style.wordBreak = "normal";
		node.style.overflow = "hidden";
		node.style.textAlign = align.text;
		node.style.alignSelf = align.alignSelf;
		node.style.transform = "";
		if (!reuseStructure || node.parentElement !== copy) {
			copy.appendChild(node);
		}
	};

	if (iconCentered) {
		const iconAlign = gaugeArcHollowPlacementAlign("centered");
		clearGaugeOverlayAbsolute(iconEl);
		iconEl.style.width = `${iconSize}px`;
		iconEl.style.height = `${iconSize}px`;
		iconEl.style.flex = `0 0 ${iconSize}px`;
		iconEl.style.alignSelf = iconAlign.alignSelf;
		iconEl.style.transform = "";
		if (!reuseStructure || iconEl.parentElement !== copy) {
			copy.appendChild(iconEl);
		}
	}
	if (hasLabel) {
		placeCopyText(labelEl, labelPlace);
	}
	if (hasCount) {
		placeCopyText(countEl, countPlace);
	}

	if (iconEl && !hasIcon) {
		releaseOverlayToGaugeRoot(el, iconEl);
	}
	if (labelEl && !hasLabel) {
		releaseOverlayToGaugeRoot(el, labelEl);
	}
	if (countEl && !hasCount) {
		releaseOverlayToGaugeRoot(el, countEl);
	}

	const labelWidth = Math.max(24, span - leftW - rightW);

	placeArcZoneSatellite(hollow, arcMetrics, "centered");

	return {
		iconInHollow: hasIcon,
		labelInHollow: hasLabel || hasCount,
		centerInHollow: iconCentered,
		labelWidth,
		hollowH
	};
}

function ensureGaugeArcRotor(el) {
	const hollow = el.querySelector(".gauge-arc-hollow");
	if (hollow && hollow.parentElement !== el) {
		el.appendChild(hollow);
	}
	let rotor = el.querySelector(".gauge-arc-rotor");
	if (!rotor) {
		rotor = document.createElement("div");
		rotor.className = "gauge-arc-rotor";
		const track = el.querySelector(".gauge-arc-track");
		el.insertBefore(rotor, el.firstChild);
		if (track) {
			rotor.appendChild(track);
		}
	}
	const track = rotor.querySelector(".gauge-arc-track") || el.querySelector(".gauge-arc-track");
	const border = el.querySelector(".gauge-arc-border-svg");
	const capL = el.querySelector(".gauge-endcap-left");
	const capR = el.querySelector(".gauge-endcap-right");
	const chromeHost = track || rotor;
	ensureGaugeChrome(chromeHost, { border, caps: [capL, capR] });
	return rotor;
}

/** Radial sheen across the arc band (outer→inner), matching bar top→bottom. */

/** Radial sheen across the arc band (outer→inner), matching bar top→bottom. */
function ensureGaugeArcSheenGradient(svg, gauge, arcCore) {
	if (!svg || !gauge || !arcCore) {
		return null;
	}
	const { cx, cy, ro, ri } = arcCore;
	const r = Math.max(1, ro);
	const innerOff = Math.max(0, Math.min(1, Math.max(0, ri) / r));
	const bandOff = (t) => innerOff + t * (1 - innerOff);
	const gradId = `gauge-arc-sheen-grad-${gauge.id}`;
	const defs = svg.querySelector("defs") || svg.insertBefore(document.createElementNS("http://www.w3.org/2000/svg", "defs"), svg.firstChild);
	let grad = defs.querySelector(".gauge-arc-sheen-grad");
	if (!grad) {
		grad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
		grad.classList.add("gauge-arc-sheen-grad");
		for (let i = 0; i < 5; i++) {
			grad.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "stop"));
		}
		defs.appendChild(grad);
	}
	const stopSpecs = [
		[0, "rgba(0, 0, 0, 0.52)"],
		[0.3, "rgba(0, 0, 0, 0.18)"],
		[0.62, "rgba(255, 255, 255, 0.05)"],
		[0.84, "rgba(255, 255, 255, 0.28)"],
		[1, "rgba(255, 255, 255, 0.72)"]
	];
	const stops = grad.querySelectorAll("stop");
	stopSpecs.forEach(([t, color], i) => {
		const stop = stops[i];
		if (!stop) {
			return;
		}
		stop.setAttribute("offset", String(bandOff(t)));
		stop.setAttribute("stop-color", color);
	});
	grad.setAttribute("id", gradId);
	grad.setAttribute("gradientUnits", "userSpaceOnUse");
	grad.setAttribute("cx", String(cx));
	grad.setAttribute("cy", String(cy));
	grad.setAttribute("r", String(r));
	grad.removeAttribute("fr");
	return grad;
}

function ensureGaugeArcFillSheen(svg, gauge, arcCore, bandPath, clipId, show) {
	if (!svg) {
		return null;
	}
	ensureGaugeArcSheenGradient(svg, gauge, arcCore);
	let sheen = svg.querySelector(".gauge-arc-fill-sheen");
	if (!sheen) {
		sheen = document.createElementNS("http://www.w3.org/2000/svg", "path");
		sheen.classList.add("gauge-arc-fill-sheen");
		sheen.setAttribute("pointer-events", "none");
		const fill = svg.querySelector(".gauge-arc-fill");
		if (fill && fill.nextSibling) {
			svg.insertBefore(sheen, fill.nextSibling);
		} else if (fill) {
			svg.appendChild(sheen);
		} else {
			svg.appendChild(sheen);
		}
	}
	sheen.setAttribute("d", bandPath || "");
	sheen.setAttribute("clip-path", `url(#${clipId})`);
	sheen.setAttribute("fill", `url(#gauge-arc-sheen-grad-${gauge.id})`);
	sheen.style.display = show ? "" : "none";
	return sheen;
}

function prepareGaugeArcZoneLayout(el) {
	releaseBarOverlayNodes(el);
	rehomeBarZoneContainer(el, el.querySelector(".gauge-bar-center"));
	rehomeBarZoneContainer(el, el.querySelector(".gauge-bar-zone.is-up"));
	rehomeBarZoneContainer(el, el.querySelector(".gauge-bar-zone.is-down"));
}

/** Arc up/down zones: vertical stacks independent of other zones. */

/** Arc up/down zones: vertical stacks independent of other zones. */
function layoutGaugeArcVerticalZone(el, gauge, zone, { iconSize, arcMetrics, arcWidth = 0 }) {
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

	placeArcZoneSatellite(zoneEl, arcMetrics, zone);

	const textSlots = countBarRegionTextSlots(gauge, src, gear, zone);
	const textWidth = Math.max(24, Math.round(Number(arcWidth) || 0));

	return { inZone: true, textWidth, textSlots };
}

/**
 * Bar left/right: flex rows outside each endcap tip.
 * Left:  [label | icon] tipâ€¦   Right:  â€¦tip [icon | label]
 * Icon is nearer the endcap; label is farther out.
 */

function patchGaugeArcLive(el, gauge, src, gear) {
	const fill = el.querySelector(".gauge-arc-fill");
	const clipPath = el.querySelector(".gauge-arc-fill-clip");
	if (!fill) {
		return;
	}
	const arcCore = gaugeArcMetrics(gauge);
	const pct = src ? barPercent(src) : 0;
	const dir = normalizeFillDirection(gaugeSettings(gauge).fillDirection);
	const fillClipD = arcFillClipD(arcCore, pct, dir);
	fill.style.fill = src ? sourceBarColor(src, gear, null) : themeFill();
	if (clipPath) {
		const clipPathEl =
			clipPath.querySelector("path") ||
			clipPath.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
		clipPathEl.setAttribute("d", fillClipD);
	}
	const svg = el.querySelector(".gauge-arc-body-svg");
	const clipId = `gauge-arc-clip-${gauge.id}`;
	const showSheen = pct > 0.0001 && !!src;
	ensureGaugeArcFillSheen(svg, gauge, arcCore, fill.getAttribute("d") || arcBandPathD(arcCore), clipId, showSheen);
	// Full paintGaugeArc is skipped on live ticks; still refresh icon path + tint.
	if (typeof paintGaugeGearIcon === "function") {
		const { W, band, layoutH } = arcCore;
		const capLayout = gaugeArcCapLayout(gauge, band);
		const arcGeom = gaugeArcCapGeometry(gauge, capLayout, arcCore);
		const arcMetrics = gaugeArcLayoutMetrics(gauge, band, arcGeom, arcCore);
		paintGaugeGearIcon(el, gauge, {
			iconSize: capLayout.capH,
			iconOffset: capLayout.capShift,
			arcLayout: { layoutH, band, W, arcGeom, arcMetrics }
		});
	}
}

/** Live value/count/color patch without layout or chrome rebuild. */

function paintGaugeArc(el, gauge) {
	if (normalizeGaugeType(gaugeSettings(gauge).type) !== "meter" || normalizeGaugeShape(gaugeSettings(gauge).shape) !== "arc") {
		return;
	}
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	const arcCore = gaugeArcMetrics(gauge);
	const { W, band, layoutH } = arcCore;
	const track = el.querySelector(".gauge-arc-track");
	const bodySvg = el.querySelector(".gauge-arc-body-svg");
	const borderSvg = el.querySelector(".gauge-arc-border-svg");
	const svg = bodySvg;
	const clipPath = el.querySelector(".gauge-arc-fill-clip");
	const trough = el.querySelector(".gauge-arc-trough");
	const fill = el.querySelector(".gauge-arc-fill");
	const borderOuter = el.querySelector(".gauge-arc-border-outer");
	const borderInner = el.querySelector(".gauge-arc-border-inner");
	const borderEndL = el.querySelector(".gauge-arc-border-end-left");
	const borderEndR = el.querySelector(".gauge-arc-border-end-right");
	const capL = el.querySelector(".gauge-endcap-left");
	const capR = el.querySelector(".gauge-endcap-right");
	if (!svg || !trough || !fill) {
		return;
	}

	const borderColor = gaugeBorderColor(gauge);
	const capLayout = gaugeArcCapLayout(gauge, band);
	const { hasCaps, capW, capShift, contactIn } = capLayout;
	const capH = capLayout.capH;
	const arcGeom = gaugeArcCapGeometry(gauge, capLayout, arcCore);
	const arcMetrics = gaugeArcLayoutMetrics(gauge, band, arcGeom, arcCore);
	const arcLayout = { layoutH, band, W, arcGeom, arcMetrics };
	ensureGaugeArcRotor(el);

	const bandPath = arcBandPathD(arcCore);
	const pct = src ? barPercent(src) : 0;
	const dir = normalizeFillDirection(gaugeSettings(gauge).fillDirection);
	const clipId = `gauge-arc-clip-${gauge.id}`;
	const maskId = `gauge-arc-trough-mask-${gauge.id}`;
	const fillClipD = arcFillClipD(arcCore, pct, dir);

	svg.setAttribute("viewBox", `0 0 ${W} ${layoutH}`);
	if (borderSvg) {
		borderSvg.setAttribute("viewBox", `0 0 ${W} ${layoutH}`);
	}
	// Keep 1:1 with the gauge box so endcaps (CSS px) match path endpoints (user units).
	if (track) {
		track.style.left = "0";
		track.style.right = "0";
		track.style.top = "0";
		track.style.bottom = "0";
		track.style.transform = W % 2 ? "translateX(0.5px)" : "";
	}

	trough.setAttribute("d", bandPath);
	fill.setAttribute("d", bandPath);

	const troughA = gaugeSettings(gauge).troughOpacity / 100;
	trough.style.fill = troughA <= 0 ? "none" : `rgba(0, 0, 0, ${troughA})`;
	trough.style.opacity = "1";

	fill.style.fill = src ? sourceBarColor(src, gear, null) : themeFill();
	fill.style.opacity = "1";
	if (clipPath) {
		clipPath.setAttribute("id", clipId);
		clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
		const clipPathEl = clipPath.querySelector("path") || clipPath.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
		clipPathEl.setAttribute("d", fillClipD);
		fill.setAttribute("clip-path", `url(#${clipId})`);
	}
	const showSheen = pct > 0.0001 && !!src;
	ensureGaugeArcFillSheen(svg, gauge, arcCore, bandPath, clipId, showSheen);
	let troughMask = svg.querySelector(".gauge-arc-trough-mask");
	if (!troughMask) {
		const defs = svg.querySelector("defs") || svg.insertBefore(document.createElementNS("http://www.w3.org/2000/svg", "defs"), svg.firstChild);
		troughMask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
		troughMask.classList.add("gauge-arc-trough-mask");
		const maskRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		maskRect.setAttribute("fill", "white");
		const maskHole = document.createElementNS("http://www.w3.org/2000/svg", "path");
		maskHole.classList.add("gauge-arc-trough-mask-hole");
		maskHole.setAttribute("fill", "black");
		troughMask.appendChild(maskRect);
		troughMask.appendChild(maskHole);
		defs.appendChild(troughMask);
	}
	troughMask.setAttribute("id", maskId);
	const maskRect = troughMask.querySelector("rect");
	if (maskRect) {
		maskRect.setAttribute("x", "0");
		maskRect.setAttribute("y", "0");
		maskRect.setAttribute("width", String(W));
		maskRect.setAttribute("height", String(layoutH));
	}
	const maskHole = troughMask.querySelector(".gauge-arc-trough-mask-hole");
	if (maskHole) {
		maskHole.setAttribute("d", fillClipD);
	}
	if (troughA <= 0) {
		trough.removeAttribute("mask");
	} else {
		trough.setAttribute("mask", `url(#${maskId})`);
	}

	// Inset stroke centerlines by half thickness so the visual outer/inner edges
	// match the band (same as CSS border-box on bars), and endcaps can seat on 0..band.
	paintArcMeterBorders(borderOuter, borderInner, arcCore, borderColor, gaugeSettings(gauge).borderThickness, {
		left: borderEndL,
		right: borderEndR,
		enabled: !hasCaps
	});

	paintGaugeEndCaps(gauge, {
		capL,
		capR,
		capH,
		capW,
		capShift,
		borderColor,
		arc: true,
		band,
		contactIn
	});
	paintGaugeGearIcon(el, gauge, {
		iconSize: capH,
		iconOffset: capShift,
		arcLayout
	});
	paintGaugeLabel(el, gauge, {
		iconSize: capH,
		iconOffset: capShift,
		arcLayout,
		barWidth: W,
		barHeight: band
	});
	paintGaugeCount(el, gauge, {
		iconSize: capH,
		iconOffset: capShift,
		arcLayout,
		barWidth: W,
		barHeight: band
	});
	prepareGaugeArcZoneLayout(el);
	const hollowInfo = layoutGaugeArcHollowZone(el, gauge, {
		iconSize: capH,
		arcLayout,
		arcMetrics,
		arcGeom
	});
	const upZone = layoutGaugeArcVerticalZone(el, gauge, "up", {
		iconSize: capH,
		arcMetrics,
		arcWidth: W
	});
	const downZone = layoutGaugeArcVerticalZone(el, gauge, "down", {
		iconSize: capH,
		arcMetrics,
		arcWidth: W
	});
	const fitArcZoneText = (zoneInfo, zoneEl) => {
		if (!zoneEl || (!zoneInfo.inRow && !zoneInfo.inZone)) {
			return;
		}
		const labelEl = zoneEl.querySelector(".gauge-gear-label");
		const countEl = zoneEl.querySelector(".gauge-gear-count");
		const preferred =
			Number(labelEl && labelEl.dataset.labelSize) || gaugeFontSizePx(gauge, capH);
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
	fitArcZoneText(upZone, el.querySelector(".gauge-bar-zone.is-up"));
	fitArcZoneText(downZone, el.querySelector(".gauge-bar-zone.is-down"));
	fitGaugeArcHollowText(el, gauge, src, gear, capH, hollowInfo);

	const inactive =
		!gaugeSettings(gauge).alwaysVisible &&
		(src ? isHudHidden(src, gear) : !src) &&
		document.body.classList.contains("is-focused");
	el.classList.toggle("is-inactive", inactive);
}

function buildGaugeArcEl(gauge, preview) {
	const el = document.createElement("div");
	el.className = "hud-gauge hud-gauge-arc";
	el.dataset.gaugeShape = "arc";
	el.dataset.id = gauge.id;
	el.innerHTML = `
		<div class="gauge-arc-track">
			<div class="gauge-arc-meter">
				<svg class="gauge-arc-body-svg" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
					<defs>
						<clipPath class="gauge-arc-fill-clip"><path></path></clipPath>
						<mask class="gauge-arc-trough-mask">
							<rect fill="white"></rect>
							<path class="gauge-arc-trough-mask-hole" fill="black"></path>
						</mask>
					</defs>
					<path class="gauge-arc-trough"></path>
					<path class="gauge-arc-fill"></path>
					<path class="gauge-arc-fill-sheen" pointer-events="none"></path>
				</svg>
			</div>
			<div class="gauge-chrome">
				<svg class="gauge-arc-border-svg" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
					<path class="gauge-arc-border-outer" fill="none"></path>
					<path class="gauge-arc-border-inner" fill="none"></path>
					<path class="gauge-arc-border-end-left" fill="none"></path>
					<path class="gauge-arc-border-end-right" fill="none"></path>
				</svg>
				<div class="gauge-endcap gauge-endcap-left" hidden><div class="gauge-endcap-face"></div></div>
				<div class="gauge-endcap gauge-endcap-right" hidden><div class="gauge-endcap-face"></div></div>
			</div>
		</div>
		<div class="gauge-arc-hollow" hidden>
			<div class="gauge-arc-slot is-left"></div>
			<div class="gauge-arc-copy"></div>
			<div class="gauge-arc-slot is-right"></div>
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
