// COG overlay - Meter shared (chrome, overlays, label/icon/count, editor).
// Loads after _Gauges.js core; before _Gauges_Meter_Bar / _Gauges_Meter_Arc.
// Mask helpers (ensureMaskedFace / paintMaskedFace) live in _UI.js — shared with gears & gizmos.

function paintGaugeEndCaps(gauge, { capL, capR, capH, capW, capShift, borderColor, arc = false, band = 0, contactIn = 0 }) {
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
				paintMaskedFace(node, "gauge-endcap-face", { clear: true });
				return;
			}
			node.hidden = false;
			node.style.width = `${capW}px`;
			node.style.height = `${capH}px`;
			node.style.background = "";
			node.style.webkitMaskImage = "";
			node.style.maskImage = "";
			paintMaskedFace(node, "gauge-endcap-face", { color: borderColor, href: capHref });
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
			paintMaskedFace(node, "gauge-endcap-face", { clear: true });
			return;
		}
		node.hidden = false;
		node.style.width = `${capW}px`;
		node.style.height = `${capH}px`;
		node.style.background = "";
		node.style.webkitMaskImage = "";
		node.style.maskImage = "";
		paintMaskedFace(node, "gauge-endcap-face", { color: borderColor, href: capHref });
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

function ensureGaugeChrome(host, parts = {}) {
	if (!host) {
		return null;
	}
	let chrome = null;
	for (const child of host.children) {
		if (child.classList && child.classList.contains("gauge-chrome")) {
			chrome = child;
			break;
		}
	}
	if (!chrome) {
		chrome = document.createElement("div");
		chrome.className = "gauge-chrome";
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

function gaugeLabelPaint(gauge, src, gear) {
	const mode = normalizeLabelColorMode(gauge.labelColorMode);
	if (mode === "border") {
		return gaugeBorderColor(gauge);
	}
	if (mode === "bar") {
		return src ? sourceBarColor(src, gear, null) : themeFill();
	}
	if (mode === "icon") {
		const paint = src ? sourceIconPaint(src, gear, null) : "";
		return paint || themeIconStart();
	}
	return "";
}

function gaugeIconPaint(gauge, src, gear) {
	const mode = normalizeIconColorMode(gauge.iconColorMode);
	if (mode === "border") {
		return gaugeBorderColor(gauge);
	}
	if (mode === "bar") {
		return src ? sourceBarColor(src, gear, null) : themeFill();
	}
	if (mode === "label") {
		const paint = gaugeLabelPaint(gauge, src, gear);
		return paint || themeIconStart();
	}
	return src ? sourceIconPaint(src, gear, null) : "";
}

function gaugeOverlayStacked(gauge) {
	const icon = normalizeGaugePlacement(gauge.showIcon);
	const title = normalizeGaugePlacement(gauge.showLabel);
	return icon !== "none" && title !== "none" && icon === title;
}

/** Which arc overlays share one placement slot (config + content). */

function gaugeFontSizePx(gauge, iconSize) {
	ensureGauge(gauge);
	const autoBase = Math.max(1, Number(iconSize) || Number(gauge && gauge.height) || DEFAULT_GAUGE_HEIGHT);
	if (Number(gauge.fontSize) > 0) {
		return Math.max(6, Math.round(Number(gauge.fontSize)));
	}
	return Math.max(9, Math.round(autoBase * 0.5 * AUTO_FONT_SIZE_SCALE));
}

function gaugeLabelPreferredPx(iconSize, gauge = null) {
	return gaugeFontSizePx(gauge || {}, iconSize);
}

function gaugeLabelLineBoxPx(fontPx) {
	return Math.ceil(Math.max(6, fontPx) * 1.05);
}

function gaugeCountVisible(gauge) {
	return normalizeGaugePlacement(gauge.showNumber) !== "none";
}

/** Number placement from showNumber only (independent of title). */

/** Number placement from showNumber only (independent of title). */
function gaugeCountPlacement(gauge) {
	if (!gaugeCountVisible(gauge)) {
		return "none";
	}
	return normalizeGaugePlacement(gauge.showNumber);
}

/** Left/right on arcs share one hollow between endcaps. */

/** Title and count occupy the same placement slot (stack count below title). */
function gaugeTitleCountShareSpace(gauge, arcLayout = null) {
	if (!gaugeCountVisible(gauge)) {
		return false;
	}
	const title = normalizeGaugePlacement(gauge.showLabel);
	if (title === "none") {
		return false;
	}
	if (arcLayout && gaugeTitleCountShareArcHollow(gauge)) {
		return true;
	}
	return normalizeGaugePlacement(gauge.showNumber) === title;
}

function gaugeOverlayCountStack(gauge, iconSize, iconGap, labelSize, arcLayout = null) {
	if (!gaugeCountVisible(gauge)) {
		return 0;
	}
	const placement = gaugeCountPlacement(gauge);
	const icon = normalizeGaugePlacement(gauge.showIcon);
	const title = normalizeGaugePlacement(gauge.showLabel);
	let offset = 0;
	if (icon !== "none" && icon === placement) {
		offset += iconSize + iconGap;
	}
	const titleSharesCount =
		title !== "none" &&
		(title === placement || (arcLayout && gaugeTitleCountShareArcHollow(gauge)));
	if (titleSharesCount) {
		offset += labelSize + Math.max(2, Math.round(iconGap * 0.5));
	}
	return offset;
}

function formatGaugeCountValue(gauge, src) {
	if (!src) {
		return "";
	}
	const asPercent = !!gauge.numberAsPercent;
	if (asPercent && (src.type === "percent" || src.type === "timer")) {
		return formatValue(src, false);
	}
	return formatValue(src, true);
}

function gaugeCountPaint(gauge, src, gear) {
	const mode = normalizeLabelColorMode(gauge.numberColorMode);
	if (mode === "border") {
		return gaugeBorderColor(gauge);
	}
	if (mode === "bar") {
		return src ? sourceBarColor(src, gear, null) : themeFill();
	}
	if (mode === "icon") {
		const paint = src ? sourceIconPaint(src, gear, null) : "";
		return paint || themeIconStart();
	}
	return "";
}

function gaugeLabelTextAlign(placement, arcLayout) {
	if (placement === "up" || placement === "down" || placement === "centered") {
		return "center";
	}
	if (placement === "left") {
		// Bars: inverse align so text flows away from the meter.
		// Arcs: align to the chosen side; text fills the shared hollow.
		return arcLayout ? "left" : "right";
	}
	if (placement === "right") {
		return arcLayout ? "right" : "left";
	}
	return "";
}

/** Arc left/right/centered share one hollow between the endcaps. */

function clearGaugeOverlayAbsolute(node) {
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

/** Overlay is owned by a cardinal zone container (not the gauge root). */
function isGaugeOverlayZoneHost(parent) {
	if (!parent) {
		return false;
	}
	return parent.classList.contains("gauge-bar-center") || parent.classList.contains("gauge-bar-zone");
}

function isGaugeArcHollowHost(parent) {
	if (!parent) {
		return false;
	}
	return (
		parent.classList.contains("gauge-arc-hollow") ||
		parent.classList.contains("gauge-arc-copy") ||
		parent.classList.contains("gauge-arc-slot")
	);
}

function releaseOverlayFromArcHollow(el, node) {
	if (!node || !isGaugeArcHollowHost(node.parentElement)) {
		return;
	}
	clearGaugeOverlayAbsolute(node);
	el.appendChild(node);
}

function releaseOverlayToGaugeRoot(el, node) {
	if (!node || node.parentElement === el || isGaugeOverlayZoneHost(node.parentElement)) {
		return;
	}
	clearGaugeOverlayAbsolute(node);
	el.appendChild(node);
}

function gaugeOverlayRegion(gauge, role) {
	if (role === "icon") {
		return normalizeGaugePlacement(gauge.showIcon);
	}
	if (role === "label") {
		return normalizeGaugePlacement(gauge.showLabel);
	}
	if (role === "count") {
		return gaugeCountVisible(gauge) ? normalizeGaugePlacement(gauge.showNumber) : "none";
	}
	return "none";
}

/** Overlay assigned to a bar map region and has content to show. */

/** Available box for a gauge label; used for sizing + font fit. */
function gaugeLabelBounds(placement, opts) {
	const {
		iconSize,
		iconGap,
		iconOffset,
		stacked,
		arcLayout,
		barWidth,
		barHeight,
		iconPlacement = "none",
		gauge = null,
		src = null,
		gear = null
	} = opts;
	const labelSize = gauge ? gaugeFontSizePx(gauge, iconSize) : Math.max(9, Math.round(iconSize * 0.5 * AUTO_FONT_SIZE_SCALE));
	const stackExtra = stacked ? iconSize + iconGap : 0;
	if (arcLayout) {
		const arcGeom = arcLayout.arcGeom;
		const { W, layoutH, span } = gaugeArcHollowMetrics(arcLayout, iconSize, iconGap, arcGeom);
		const outerH = Math.max(16, iconGap + iconSize + stackExtra);
		if (placement === "left" || placement === "right") {
			const slotPad = Math.max(4, Math.round(iconSize * 0.15));
			const iconInHollow = iconPlacement === "left" || iconPlacement === "right";
			const leftW = iconInHollow && iconPlacement === "left" ? iconSize + slotPad : slotPad;
			const rightW = iconInHollow && iconPlacement === "right" ? iconSize + slotPad : slotPad;
			return {
				maxWidth: Math.max(24, span - leftW - rightW),
				maxHeight: Math.max(16, layoutH - iconGap)
			};
		}
		if (placement === "up" || placement === "down") {
			const stackH =
				placement === "up" && gauge && src
					? gaugeArcOverlayStackHeight(gauge, src, gear, "up", iconSize, iconGap, labelSize)
					: outerH;
			return { maxWidth: Math.max(24, W - iconGap * 2), maxHeight: Math.max(16, stackH) };
		}
		if (placement === "centered") {
			const stackH =
				gauge && src
					? gaugeArcCenteredStackHeight(gauge, src, gear, iconSize, iconGap, labelSize)
					: iconSize + stackExtra + iconGap;
			return {
				maxWidth: Math.max(24, Math.round(W * 0.55)),
				maxHeight: Math.max(16, stackH)
			};
		}
		return { maxWidth: 0, maxHeight: 0 };
	}
	// Bar: side labels sit outside the endcap tip and may extend freely outward.
	if (placement === "left" || placement === "right") {
		const sideRoom = Math.max(48, Math.round((Number(barWidth) || 120) * 0.55));
		return {
			maxWidth: sideRoom,
			maxHeight: Math.max(8, Number(barHeight) || iconSize)
		};
	}
	if (placement === "up" || placement === "down") {
		const stackH =
			gauge && src && gaugeBarZoneActive(gauge, src, gear, placement)
				? gaugeArcOverlayStackHeight(gauge, src, gear, placement, iconSize, iconGap, labelSize)
				: Math.max(16, iconGap + iconSize + stackExtra);
		return {
			maxWidth: Math.max(24, Number(barWidth) || 0),
			maxHeight: Math.max(16, stackH)
		};
	}
	if (placement === "centered") {
		const stackH =
			gauge && src && gaugeBarZoneActive(gauge, src, gear, "centered")
				? iconSize
				: iconSize + stackExtra + iconGap;
		return {
			maxWidth: Math.max(24, Number(barWidth) || 0),
			maxHeight: Math.max(16, stackH)
		};
	}
	return { maxWidth: 0, maxHeight: 0 };
}

function applyGaugeOverlayPlacement(node, placement, role, opts) {
	const {
		rot,
		iconSize,
		iconGap,
		iconOffset,
		arcLayout,
		stacked,
		labelWidth = 0,
		iconPlacement = "none",
		countStack = 0,
		sharesTitleSpace = false
	} = opts;
	const upright = `rotate(${-rot}deg)`;
	// Outward stacking only for up/down/centered. Arc left/right share one hollow.
	const labelStackExtra =
		role === "label" && stacked && placement !== "left" && placement !== "right"
			? iconSize + iconGap
			: 0;
	const countSharesTitle = role === "count" && sharesTitleSpace;
	const titleStackExtra = stacked ? iconSize + iconGap : 0;
	node.style.textAlign =
		role === "label" || role === "count" ? gaugeLabelTextAlign(placement, !!arcLayout) : "";
	node.style.bottom = "auto";
	node.style.right = "auto";
	node.style.left = "auto";
	node.style.top = "auto";
	node.style.width = "";
	node.style.transform = "";
	node.style.transformOrigin = "";

	if (arcLayout) {
		const arcGeom = arcLayout.arcGeom;
		const { layoutH, inset, span } = gaugeArcHollowMetrics(arcLayout, iconSize, iconGap, arcGeom);
		if (placement === "left" || placement === "right") {
			node.style.top = "auto";
			node.style.bottom = "0";
			if (role === "icon") {
				if (placement === "left") {
					node.style.left = `${inset}px`;
					node.style.transform = upright;
				} else {
					node.style.right = `${inset}px`;
					node.style.transform = upright;
				}
				return;
			}
			if (role === "count") {
				return;
			}
			// Label fills the shared hollow; reserve space when an icon is also in it.
			const iconInHollow = iconPlacement === "left" || iconPlacement === "right";
			const reserved = iconInHollow ? iconSize + iconGap : 0;
			const w = Math.max(24, labelWidth || span - reserved);
			node.style.width = `${w}px`;
			if (placement === "left") {
				const start = inset + (iconPlacement === "left" ? iconSize + iconGap : 0);
				node.style.left = `${start}px`;
				node.style.transform = upright;
			} else {
				const end = inset + (iconPlacement === "right" ? iconSize + iconGap : 0);
				node.style.right = `${end}px`;
				node.style.transform = upright;
			}
			return;
		}
		if (placement === "centered") {
			const labelSize = opts.labelSize || gaugeFontSizePx(opts.gauge, iconSize);
			if ((role === "label" || role === "count") && labelWidth > 0) {
				node.style.width = `${labelWidth}px`;
			}
			node.style.left = "50%";
			if (opts.gauge) {
				const { src, gear } = gaugeLinked(opts.gauge);
				const tops = gaugeArcCenteredLayout(
					opts.gauge,
					src,
					gear,
					layoutH,
					iconSize,
					iconGap,
					labelSize
				);
				if (role === "icon" && tops.iconTop != null) {
					node.style.top = `${tops.iconTop}px`;
					node.style.transform = `translateX(-50%) ${upright}`;
					return;
				}
				if (role === "count" && tops.countTop != null) {
					node.style.top = `${tops.countTop}px`;
					node.style.transform = `translateX(-50%) ${upright}`;
					return;
				}
				if (role === "label" && tops.titleTop != null) {
					node.style.top = `${tops.titleTop}px`;
					node.style.transform = `translateX(-50%) ${upright}`;
					return;
				}
			}
			if (role === "label" && stacked) {
				// Text above icon when both are centered.
				node.style.top = `${layoutH - iconSize - iconGap}px`;
				node.style.transform = `translate(-50%, -100%) ${upright}`;
			} else if (role === "label") {
				node.style.top = `${layoutH - iconSize}px`;
				node.style.transform = `translateX(-50%) ${upright}`;
			} else if (role === "count" && countSharesTitle) {
				node.style.top = stacked
					? `${layoutH - iconSize - iconGap}px`
					: `${layoutH - iconSize}px`;
				node.style.transform = `translateX(-50%) ${upright}`;
			} else if (role === "count") {
				node.style.top = `${layoutH - iconSize}px`;
				node.style.transform = `translateX(-50%) ${upright}`;
			} else {
				node.style.top = `${layoutH - iconSize}px`;
				node.style.transform = `translateX(-50%) ${upright}`;
			}
			return;
		}
		if ((role === "label" || role === "count") && labelWidth > 0) {
			node.style.width = `${labelWidth}px`;
		}
		if (placement === "up") {
			const labelSize = opts.labelSize || gaugeFontSizePx(opts.gauge, iconSize);
			if ((role === "label" || role === "count") && labelWidth > 0) {
				node.style.width = `${labelWidth}px`;
			}
			node.style.left = "50%";
			if (opts.gauge) {
				const { src, gear } = gaugeLinked(opts.gauge);
				const tops = gaugeArcOverlayStackLayout(
					opts.gauge,
					src,
					gear,
					"up",
					layoutH,
					iconSize,
					iconGap,
					labelSize
				);
				if (role === "icon" && tops.iconTop != null) {
					node.style.top = `${tops.iconTop}px`;
					node.style.transform = `translateX(-50%) ${upright}`;
					return;
				}
				if (role === "count" && tops.countTop != null) {
					node.style.top = `${tops.countTop}px`;
					node.style.transform = `translateX(-50%) ${upright}`;
					return;
				}
				if (role === "label" && tops.titleTop != null) {
					node.style.top = `${tops.titleTop}px`;
					node.style.transform = `translateX(-50%) ${upright}`;
					return;
				}
			}
			if (role === "label") {
				node.style.top = `${-iconGap - labelStackExtra}px`;
				node.style.transform = `translate(-50%, -100%) ${upright}`;
			} else if (role === "count" && countSharesTitle) {
				node.style.top = `${-iconGap - titleStackExtra}px`;
				node.style.transform = `translateX(-50%) ${upright}`;
			} else if (role === "count") {
				node.style.top = `${-iconGap}px`;
				node.style.transform = `translate(-50%, -100%) ${upright}`;
			} else {
				node.style.top = `${-iconGap - iconSize - labelStackExtra}px`;
				node.style.transform = `translateX(-50%) ${upright}`;
			}
			return;
		}
		node.style.left = "50%";
		if (role === "count") {
			node.style.top = `${layoutH + iconGap + countStack}px`;
			node.style.transform = `translateX(-50%) ${upright}`;
		} else {
			node.style.top = `${layoutH + iconGap + labelStackExtra}px`;
			node.style.transform = `translateX(-50%) ${upright}`;
		}
		return;
	}

	// Bar icons: slot just outside the endcap tip.
	if (role === "icon" && (placement === "left" || placement === "right")) {
		const iconPos = iconOffset - iconGap - iconSize;
		if (placement === "left") {
			node.style.left = `${iconPos}px`;
			node.style.top = "50%";
			node.style.transform = `translateY(-50%) ${upright}`;
		} else {
			node.style.right = `${iconPos}px`;
			node.style.top = "50%";
			node.style.transform = `translateY(-50%) ${upright}`;
		}
		return;
	}

	// Bar labels on the sides: pin the inner edge to the endcap tip (or outside a
	// same-side icon), give an explicit width, and inverse-align so text flows away.
	if (role === "label" && (placement === "left" || placement === "right")) {
		const tip = Math.min(0, Number(iconOffset) || 0);
		const barStack = stacked ? iconSize + iconGap : 0;
		const inner = tip - iconGap - barStack;
		const w = Math.max(24, labelWidth || 48);
		node.style.width = `${w}px`;
		node.style.top = "50%";
		if (placement === "left") {
			node.style.left = `${inner - w}px`;
			node.style.transform = `translateY(-50%) ${upright}`;
		} else {
			node.style.right = `${inner - w}px`;
			node.style.transform = `translateY(-50%) ${upright}`;
		}
		return;
	}
	if (role === "count" && (placement === "left" || placement === "right")) {
		return;
	}

	if (placement === "centered") {
		if ((role === "label" || role === "count") && labelWidth > 0) {
			node.style.width = `${labelWidth}px`;
		}
		node.style.left = "50%";
		node.style.top = "50%";
		if (role === "label" && stacked) {
			// Text above icon when both are centered.
			node.style.transform = `translate(-50%, calc(-50% - ${iconSize / 2 + iconGap}px)) translateY(-100%) ${upright}`;
		} else if (role === "count" && countSharesTitle) {
			node.style.transform = stacked
				? `translate(-50%, calc(-50% - ${iconSize / 2 + iconGap}px)) ${upright}`
				: `translate(-50%, calc(-50% - ${iconSize / 2}px)) ${upright}`;
		} else {
			node.style.transform = `translate(-50%, -50%) ${upright}`;
		}
		return;
	}
	if ((role === "label" || role === "count") && labelWidth > 0) {
		node.style.width = `${labelWidth}px`;
	}
	const barStack = role === "label" && stacked ? iconSize + iconGap : 0;
	if (placement === "up") {
		node.style.left = "50%";
		if (role === "label") {
			node.style.top = `${-iconGap - barStack}px`;
			node.style.transform = `translate(-50%, -100%) ${upright}`;
		} else if (role === "count" && countSharesTitle) {
			node.style.top = `${-iconGap - titleStackExtra}px`;
			node.style.transform = `translateX(-50%) ${upright}`;
		} else if (role === "count") {
			node.style.top = `${-iconGap}px`;
			node.style.transform = `translate(-50%, -100%) ${upright}`;
		} else {
			node.style.top = `${-iconGap - iconSize}px`;
			node.style.transform = `translateX(-50%) ${upright}`;
		}
		return;
	}
	node.style.left = "50%";
	// iconSize is the bar band height; sit just below the bar (and below a down icon if stacked).
	if (role === "count") {
		node.style.top = `${iconSize + iconGap + countStack}px`;
		node.style.transform = `translateX(-50%) ${upright}`;
	} else {
		node.style.top = `${iconSize + iconGap + barStack}px`;
		node.style.transform = `translateX(-50%) ${upright}`;
	}
}

function paintGaugeGearIcon(el, gauge, { iconSize, iconOffset = 0, arcLayout = null }) {
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	const iconEl = el.querySelector(".gauge-gear-icon");
	const show = normalizeGaugePlacement(gauge.showIcon);
	const rot = Number(gauge.rotation) || 0;
	if (!iconEl) {
		return;
	}
	const href = src ? sourceIconPath(src, gear) : "";
	const paint = gaugeIconPaint(gauge, src, gear);
	if (!href || show === "none") {
		iconEl.hidden = true;
		return;
	}
	iconEl.hidden = false;
	iconEl.style.width = `${iconSize}px`;
	iconEl.style.height = `${iconSize}px`;
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const stacked = gaugeOverlayStacked(gauge);
	const labelSize = gaugeFontSizePx(gauge, iconSize);
	const useArcHollow = !!(
		arcLayout && (show === "left" || show === "right" || show === "centered")
	);
	const useBarZone = !arcLayout && barOverlayUsesZoneLayout(gauge, src, gear, show);
	const useArcZone =
		!!(
			arcLayout &&
			barOverlayUsesZoneLayout(gauge, src, gear, show) &&
			show !== "left" &&
			show !== "right" &&
			show !== "centered"
		);
	if (useArcHollow || useBarZone || useArcZone) {
		clearGaugeOverlayAbsolute(iconEl);
		iconEl.style.width = `${iconSize}px`;
		iconEl.style.height = `${iconSize}px`;
		if (show === "centered" || show === "up" || show === "down") {
			iconEl.style.transform = "";
		} else if (useArcHollow) {
			iconEl.style.transform = "";
		} else {
			iconEl.style.transform = "";
		}
	} else {
		applyGaugeOverlayPlacement(iconEl, show, "icon", {
			rot,
			iconSize,
			labelSize,
			iconGap,
			iconOffset,
			arcLayout,
			stacked,
			gauge
		});
	}
	iconEl.classList.toggle("is-painted", !!paint);
	if (paint) {
		iconEl.style.background = "";
		iconEl.style.webkitMaskImage = "";
		iconEl.style.maskImage = "";
		paintMaskedFace(iconEl, "gauge-gear-icon-face", { color: paint, href });
		const img = iconEl.querySelector("img");
		if (img) {
			img.hidden = true;
			img.src = href;
		}
	} else {
		iconEl.style.background = "";
		iconEl.style.webkitMaskImage = "";
		iconEl.style.maskImage = "";
		paintMaskedFace(iconEl, "gauge-gear-icon-face", { clear: true });
		let img = iconEl.querySelector("img");
		if (!img) {
			img = document.createElement("img");
			img.alt = "";
			iconEl.appendChild(img);
		}
		img.hidden = false;
		img.src = href;
	}
}

function paintGaugeLabel(el, gauge, { iconSize, iconOffset = 0, arcLayout = null, barWidth = 0, barHeight = 0 }) {
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	const labelEl = el.querySelector(".gauge-gear-label");
	const show = normalizeGaugePlacement(gauge.showLabel);
	const rot = Number(gauge.rotation) || 0;
	if (!labelEl) {
		return;
	}
	if (show === "none" || !src) {
		labelEl.hidden = true;
		return;
	}
	const text = sourceTitle(src, gear && gear.name, gear);
	if (!text) {
		labelEl.hidden = true;
		return;
	}
	labelEl.hidden = false;
	labelEl.textContent = text;
	const labelSize = gaugeFontSizePx(gauge, iconSize);
	labelEl.style.fontSize = `${labelSize}px`;
	labelEl.style.lineHeight = "1.05";
	labelEl.style.whiteSpace = "normal";
	labelEl.style.overflowWrap = "break-word";
	labelEl.style.wordBreak = "normal";
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const stacked = gaugeOverlayStacked(gauge);
	const iconPlacement = normalizeGaugePlacement(gauge.showIcon);
	const useArcHollow = !!(
		arcLayout && (show === "left" || show === "right" || show === "centered")
	);
	const useBarZone = !arcLayout && barOverlayUsesZoneLayout(gauge, src, gear, show);
	const useArcZone =
		!!(
			arcLayout &&
			barOverlayUsesZoneLayout(gauge, src, gear, show) &&
			show !== "left" &&
			show !== "right" &&
			show !== "centered"
		);
	const paint = gaugeLabelPaint(gauge, src, gear);
	labelEl.classList.toggle("is-default-color", !paint);
	if (paint) {
		labelEl.style.color = paint;
	} else {
		labelEl.style.color = "";
	}
	if (useArcHollow || useBarZone || useArcZone) {
		clearGaugeOverlayAbsolute(labelEl);
		labelEl.style.fontSize = `${labelSize}px`;
		labelEl.dataset.labelSize = String(labelSize);
		return;
	}
	const bounds = gaugeLabelBounds(show, {
		iconSize,
		iconGap,
		iconOffset,
		stacked,
		arcLayout,
		barWidth: barWidth || Number(gauge.width) || 0,
		barHeight: barHeight || Number(gauge.height) || 0,
		iconPlacement,
		gauge,
		src,
		gear
	});
	const labelWidth = Math.max(0, bounds.maxWidth || 0);
	applyGaugeOverlayPlacement(labelEl, show, "label", {
		rot,
		iconSize,
		labelSize,
		iconGap,
		iconOffset,
		arcLayout,
		stacked,
		labelWidth,
		iconPlacement,
		gauge
	});
	if (labelWidth > 0) {
		labelEl.style.maxWidth = `${labelWidth}px`;
	} else {
		labelEl.style.maxWidth = "";
	}
	if (bounds.maxHeight > 0) {
		labelEl.style.maxHeight = `${bounds.maxHeight}px`;
		labelEl.style.overflow = "hidden";
	} else {
		labelEl.style.maxHeight = "";
		labelEl.style.overflow = "";
	}
	fitLabelFont(labelEl, labelWidth, labelSize);
}

function ensureGaugeCountEl(el) {
	let countEl = el.querySelector(".gauge-gear-count");
	if (!countEl) {
		countEl = document.createElement("span");
		countEl.className = "gauge-gear-count gear-value";
		countEl.hidden = true;
		el.appendChild(countEl);
	}
	return countEl;
}

function paintGaugeCount(el, gauge, { iconSize, iconOffset = 0, arcLayout = null, barWidth = 0, barHeight = 0 }) {
	ensureGauge(gauge);
	const { src, gear } = gaugeLinked(gauge);
	const countEl = ensureGaugeCountEl(el);
	const show = gaugeCountPlacement(gauge);
	const rot = Number(gauge.rotation) || 0;
	if (!gaugeCountVisible(gauge) || show === "none") {
		countEl.hidden = true;
		return;
	}
	if (!src) {
		countEl.hidden = true;
		return;
	}
	const text = formatGaugeCountValue(gauge, src);
	if (!text) {
		countEl.hidden = true;
		return;
	}
	countEl.hidden = false;
	countEl.textContent = text;
	const labelSize = gaugeFontSizePx(gauge, iconSize);
	countEl.style.fontSize = `${labelSize}px`;
	countEl.style.lineHeight = "1.05";
	countEl.style.whiteSpace = "normal";
	countEl.style.overflowWrap = "break-word";
	countEl.style.wordBreak = "normal";
	const iconGap = Math.max(2, Math.round(iconSize * 0.1));
	const stacked = gaugeOverlayStacked(gauge);
	const iconPlacement = normalizeGaugePlacement(gauge.showIcon);
	const sharesTitleSpace = gaugeTitleCountShareSpace(gauge, arcLayout);
	const useArcHollow = !!(
		arcLayout && (show === "left" || show === "right" || show === "centered")
	);
	const useBarZone = !arcLayout && barOverlayUsesZoneLayout(gauge, src, gear, show);
	const useArcZone =
		!!(
			arcLayout &&
			barOverlayUsesZoneLayout(gauge, src, gear, show) &&
			show !== "left" &&
			show !== "right" &&
			show !== "centered"
		);
	const paint = gaugeCountPaint(gauge, src, gear);
	countEl.classList.toggle("is-default-color", !paint);
	if (paint) {
		countEl.style.color = paint;
	} else {
		countEl.style.color = "";
	}
	if (useArcHollow || useBarZone || useArcZone) {
		clearGaugeOverlayAbsolute(countEl);
		countEl.style.fontSize = `${labelSize}px`;
		countEl.dataset.labelSize = String(labelSize);
		return;
	}
	const countStack = gaugeOverlayCountStack(gauge, iconSize, iconGap, labelSize, arcLayout);
	const bounds = gaugeLabelBounds(show, {
		iconSize,
		iconGap,
		iconOffset,
		stacked,
		arcLayout,
		barWidth: barWidth || Number(gauge.width) || 0,
		barHeight: barHeight || Number(gauge.height) || 0,
		iconPlacement,
		gauge,
		src,
		gear
	});
	const fitWidth = Math.max(0, bounds.maxWidth || 0);
	applyGaugeOverlayPlacement(countEl, show, "count", {
		rot,
		iconSize,
		labelSize,
		iconGap,
		iconOffset,
		arcLayout,
		stacked,
		labelWidth: fitWidth,
		iconPlacement,
		countStack,
		sharesTitleSpace,
		gauge
	});
	if (fitWidth > 0) {
		countEl.style.maxWidth = `${fitWidth}px`;
	} else {
		countEl.style.maxWidth = "";
	}
	if (bounds.maxHeight > 0) {
		countEl.style.maxHeight = `${bounds.maxHeight}px`;
		countEl.style.overflow = "hidden";
	} else {
		countEl.style.maxHeight = "";
		countEl.style.overflow = "";
	}
	fitLabelFont(countEl, fitWidth, labelSize);
}

function bindExclusiveGauge(details) {
	details.addEventListener("toggle", () => {
		if (selectionSyncLock) {
			return;
		}
		if (!details.open) {
			if (details.classList.contains("is-renaming")) {
				details.open = true;
				return;
			}
			if (openGaugeId === details.dataset.gaugeId || activeGaugeId === details.dataset.gaugeId) {
				selectEditorItem("", "");
			}
			return;
		}
		selectEditorItem("gauge", details.dataset.gaugeId || "");
	});
}

function fillGaugeEditor(panel, gauge) {
	ensureGauge(gauge);
	const gid = gauge.id;
	const live = () => gaugeFor(gid) || gauge;

	const topRow = document.createElement("div");
	topRow.className = "style-row";

	const typeField = document.createElement("label");
	typeField.className = "pos-field compact";
	typeField.innerHTML = `<span>Type</span><select data-role="type"></select>`;
	const typeSel = typeField.querySelector("select");
	for (const opt of [
		{ value: "meter", label: "Meter" },
		{ value: "frame", label: "Frame" }
	]) {
		const o = document.createElement("option");
		o.value = opt.value;
		o.textContent = opt.label;
		typeSel.appendChild(o);
	}
	typeSel.value = normalizeGaugeType(gauge.type);
	typeSel.addEventListener("change", () => {
		const nextType = normalizeGaugeType(typeSel.value);
		const patch = { type: nextType };
		if (nextType === "frame") {
			const cur = live();
			if (Math.round(cur.width) === DEFAULT_GAUGE_WIDTH && Math.round(cur.height) === DEFAULT_GAUGE_HEIGHT) {
				patch.width = 120;
				patch.height = 120;
			}
			if (!cur.pictureIcon) {
				patch.pictureIcon = defaultPictureIconPath();
			}
			if (!cur.frameShape) {
				patch.frameShape = defaultFrameShapePath();
			}
			// Seed stock backup defaults (copied hex, not live-linked to General).
			if (!optionalHex(cur.frameFillColor)) {
				patch.frameFillColor = frameDefaultFillColor();
			}
			if (!optionalHex(cur.frameBorderColor)) {
				patch.frameBorderColor = frameDefaultBorderColor();
			}
			if (!optionalHex(cur.pictureFade)) {
				patch.pictureFade = frameDefaultPictureFade();
			}
			// Frames default to always-visible; meter gauges seed false in defaultGauge.
			patch.alwaysVisible = true;
			// Gear-mode chrome: Title / Icon / Number on (group-like bar format + trough).
			patch.showLabel = "top";
			patch.showIcon = "middle";
			patch.showNumber = "bottom";
			patch.numberFormat = "barPercent";
			patch.barTrough = true;
		}
		patchGauge(gid, patch);
		renderEditor(true);
	});
	topRow.appendChild(typeField);

	const isFrame = normalizeGaugeType(gauge.type) === "frame";

	const gearField = document.createElement("label");
	gearField.className = "pos-field compact wide";
	gearField.innerHTML = `<span>Gear</span><select data-role="gear"></select>`;
	const gearSel = gearField.querySelector("select");
	const none = document.createElement("option");
	none.value = "";
	none.textContent = "None";
	gearSel.appendChild(none);
	const sources = (snapshot.sources || []).slice().sort((a, b) => {
		const at = sourceTitle(a, a.name);
		const bt = sourceTitle(b, b.name);
		return at.localeCompare(bt);
	});
	for (const src of sources) {
		if (!isPickableGearSource(src)) {
			continue;
		}
		const o = document.createElement("option");
		o.value = `${src.mod}\t${src.name}`;
		o.textContent = `${sourceTitle(src, src.name)} (${src.mod})`;
		gearSel.appendChild(o);
	}
	gearSel.value = gauge.gearMod && gauge.gearName ? `${gauge.gearMod}\t${gauge.gearName}` : "";
	gearSel.addEventListener("change", () => {
		const parts = String(gearSel.value || "").split("\t");
		patchGauge(gid, { gearMod: parts[0] || "", gearName: parts[1] || "" });
	});
	topRow.appendChild(gearField);

	const alwaysVis = document.createElement("label");
	alwaysVis.className = "pos-field compact mid";
	alwaysVis.innerHTML = `<span>Always Visible</span><input type="checkbox" data-role="alwaysVisible">`;
	const alwaysBox = alwaysVis.querySelector("input");
	alwaysBox.checked = !!gauge.alwaysVisible;
	alwaysBox.addEventListener("change", () => {
		patchGauge(gid, { alwaysVisible: alwaysBox.checked });
	});
	topRow.appendChild(alwaysVis);
	panel.appendChild(topRow);

	const pos = document.createElement("div");
	pos.className = "pos-row";
	pos.innerHTML = `
		<label class="pos-field"><span>X %</span><input type="number" min="0" max="100" step="0.1" data-role="x"></label>
		<label class="pos-field"><span>Y %</span><input type="number" min="0" max="100" step="0.1" data-role="y"></label>
		<label class="pos-field"><span>${isFrame ? "Frame Rotation°" : "Rotation°"}</span><input type="number" min="-180" max="180" step="0.1" data-role="rotation"></label>
		<label class="pos-field"><span>Width</span><input type="number" min="8" max="2000" step="1" data-role="width"></label>
		<label class="pos-field"><span>Height</span><input type="number" min="4" max="512" step="1" data-role="height"></label>`;
	panel.appendChild(pos);
	const xInput = pos.querySelector('[data-role="x"]');
	const yInput = pos.querySelector('[data-role="y"]');
	const rotInput = pos.querySelector('[data-role="rotation"]');
	const wInput = pos.querySelector('[data-role="width"]');
	const hInput = pos.querySelector('[data-role="height"]');
	const gaugeEditorBox = () => {
		const g = live();
		const iconSize =
			normalizeGaugeShape(g.shape) === "arc"
				? Math.max(MIN_GAUGE_HEIGHT, Math.round(g.height))
				: Math.round(g.height);
		return gaugeLayoutBox(g, iconSize);
	};
	const editorPos = hudItemEditorPosPct(gauge, gaugeEditorBox().w, gaugeEditorBox().h);
	xInput.value = fmtPct(editorPos.x);
	yInput.value = fmtPct(editorPos.y);
	rotInput.value = (Number(gauge.rotation) || 0).toFixed(1);
	wInput.value = String(Math.round(gauge.width));
	hInput.value = String(Math.round(gauge.height));
	bindNumberField(xInput, {
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === "." || raw === "-") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? clampPct(v, 0, 100) / 100 : null;
		},
		apply: (v) => {
			const g = live();
			const box = gaugeEditorBox();
			const cur = hudItemEditorPosPct(g, box.w, box.h);
			patchGauge(gid, hudItemEditorPosPatch(g, box.w, box.h, v * 100, cur.y));
		},
		format: (v) => fmtPct(v * 100),
		current: () => {
			const g = live();
			const box = gaugeEditorBox();
			return hudItemEditorPosPct(g, box.w, box.h).x / 100;
		}
	});
	bindNumberField(yInput, {
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === "." || raw === "-") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? clampPct(v, 0, 100) / 100 : null;
		},
		apply: (v) => {
			const g = live();
			const box = gaugeEditorBox();
			const cur = hudItemEditorPosPct(g, box.w, box.h);
			patchGauge(gid, hudItemEditorPosPatch(g, box.w, box.h, cur.x, v * 100));
		},
		format: (v) => fmtPct(v * 100),
		current: () => {
			const g = live();
			const box = gaugeEditorBox();
			return hudItemEditorPosPct(g, box.w, box.h).y / 100;
		}
	});
	bindNumberField(rotInput, {
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === "-" || raw === "." || raw === "-.") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? v : null;
		},
		apply: (v) => {
			const g = live();
			patchGauge(gid, { rotation: v });
			const box = gaugeEditorBox();
			clampHudItemToScreen(g, box.w, box.h);
			patchGauge(gid, { x: g.x, y: g.y });
		},
		format: (v) => (Number(v) || 0).toFixed(1),
		current: () => live().rotation || 0
	});
	bindNumberField(wInput, {
		parse: (raw) => (String(raw).trim() === "" ? null : Math.max(MIN_GAUGE_WIDTH, Math.min(2000, Number(raw) || 0))),
		apply: (v) => patchGauge(gid, { width: v }),
		format: (v) => String(Math.round(v)),
		current: () => live().width
	});
	bindNumberField(hInput, {
		parse: (raw) => (String(raw).trim() === "" ? null : Math.max(MIN_GAUGE_HEIGHT, Math.min(512, Number(raw) || 0))),
		apply: (v) => patchGauge(gid, { height: v }),
		format: (v) => String(Math.round(v)),
		current: () => live().height
	});

	if (isFrame) {
		if (typeof fillGaugeFrameEditor === "function") {
			fillGaugeFrameEditor(panel, gauge, gid, live);
		}
		return;
	}

	appendEditorRule(panel);
	const meterLede = document.createElement("p");
	meterLede.className = "lede";
	meterLede.textContent = "Meter Settings";
	panel.appendChild(meterLede);

	const shapeRow = document.createElement("div");
	shapeRow.className = "style-row";
	const shapeField = document.createElement("label");
	shapeField.className = "pos-field compact";
	shapeField.innerHTML = `<span>Shape</span><select data-role="shape">
		<option value="bar">Bar</option>
		<option value="arc">Arc</option>
	</select>`;
	const shapeSel = shapeField.querySelector("select");
	shapeSel.value = normalizeGaugeShape(gauge.shape);
	shapeSel.addEventListener("change", () => {
		patchGauge(gid, { shape: normalizeGaugeShape(shapeSel.value) });
		renderEditor(true);
	});
	shapeRow.appendChild(shapeField);
	panel.appendChild(shapeRow);

	const iconRow = document.createElement("div");
	iconRow.className = "style-row gauge-overlay-row";
	const iconPos = document.createElement("label");
	iconPos.className = "pos-field compact mid";
	iconPos.innerHTML = `<span>Show Icon</span><select data-role="showIcon">${gaugePlacementSelectHtml(gauge.showIcon)}</select>`;
	iconPos.querySelector("select").addEventListener("change", (ev) => {
		patchGauge(gid, { showIcon: normalizeGaugePlacement(ev.target.value) });
	});
	iconRow.appendChild(iconPos);
	const iconColor = document.createElement("label");
	iconColor.className = "pos-field compact mid";
	iconColor.innerHTML = `<span>Icon Colour</span><select data-role="iconColorMode">
		<option value="border">Use Border Colour</option>
		<option value="keep">Keep Icon Colours</option>
		<option value="bar">Use Bar Colour</option>
		<option value="label">Use Title Colour</option>
	</select>`;
	iconColor.querySelector("select").value = normalizeIconColorMode(gauge.iconColorMode);
	iconColor.querySelector("select").addEventListener("change", (ev) => {
		patchGauge(gid, { iconColorMode: normalizeIconColorMode(ev.target.value) });
	});
	iconRow.appendChild(iconColor);
	panel.appendChild(iconRow);

	const titleRow = document.createElement("div");
	titleRow.className = "style-row gauge-overlay-row";
	const titlePos = document.createElement("label");
	titlePos.className = "pos-field compact mid";
	titlePos.innerHTML = `<span>Show Title</span><select data-role="showLabel">${gaugePlacementSelectHtml(gauge.showLabel)}</select>`;
	titlePos.querySelector("select").addEventListener("change", (ev) => {
		patchGauge(gid, { showLabel: normalizeGaugePlacement(ev.target.value) });
	});
	titleRow.appendChild(titlePos);
	const titleColor = document.createElement("label");
	titleColor.className = "pos-field compact mid";
	titleColor.innerHTML = `<span>Title Colour</span><select data-role="labelColorMode">
		<option value="border">Use Border Colour</option>
		<option value="keep">Keep Title Colour</option>
		<option value="bar">Use Bar Colour</option>
		<option value="icon">Use Icon Colours</option>
	</select>`;
	titleColor.querySelector("select").value = normalizeLabelColorMode(gauge.labelColorMode);
	titleColor.querySelector("select").addEventListener("change", (ev) => {
		patchGauge(gid, { labelColorMode: normalizeLabelColorMode(ev.target.value) });
	});
	titleRow.appendChild(titleColor);
	panel.appendChild(titleRow);

	const countRow = document.createElement("div");
	countRow.className = "style-row gauge-overlay-row";
	const countPos = document.createElement("label");
	countPos.className = "pos-field compact mid";
	countPos.innerHTML = `<span>Show Number</span><select data-role="showNumber">${gaugePlacementSelectHtml(gauge.showNumber)}</select>`;
	countPos.querySelector("select").addEventListener("change", (ev) => {
		patchGauge(gid, { showNumber: normalizeGaugePlacement(ev.target.value) });
	});
	countRow.appendChild(countPos);
	const countColor = document.createElement("label");
	countColor.className = "pos-field compact mid";
	countColor.innerHTML = `<span>Number Colour</span><select data-role="numberColorMode">
		<option value="border">Use Border Colour</option>
		<option value="keep">Keep Number Colour</option>
		<option value="bar">Use Bar Colour</option>
		<option value="icon">Use Icon Colours</option>
	</select>`;
	countColor.querySelector("select").value = normalizeLabelColorMode(gauge.numberColorMode);
	countColor.querySelector("select").addEventListener("change", (ev) => {
		patchGauge(gid, { numberColorMode: normalizeLabelColorMode(ev.target.value) });
	});
	countRow.appendChild(countColor);
	const countPct = document.createElement("label");
	countPct.className = "pos-field compact gauge-count-pct";
	countPct.innerHTML = `<span>Show Number as Percentage</span><input type="checkbox" data-role="numberAsPercent">`;
	const countPctInput = countPct.querySelector("input");
	countPctInput.checked = gauge.numberAsPercent === true;
	countPctInput.addEventListener("change", () => {
		patchGauge(gid, { numberAsPercent: countPctInput.checked });
	});
	countRow.appendChild(countPct);
	panel.appendChild(countRow);

	const meterShape = normalizeGaugeShape(gauge.shape);
	if (normalizeGaugeType(gauge.type) === "meter" && (meterShape === "bar" || meterShape === "arc")) {
		appendEditorRule(panel);
		const shapeLede = document.createElement("p");
		shapeLede.className = "lede";
		shapeLede.textContent = meterShape === "arc" ? "Arc Shape Settings" : "Bar Shape Settings";
		panel.appendChild(shapeLede);
		if (meterShape === "arc") {
			const arcHint = document.createElement("p");
			arcHint.className = "hint";
			arcHint.textContent = "Width is the arc diameter; Height is band thickness (same as a flat bar).";
			panel.appendChild(arcHint);
		}

		const rowA = document.createElement("div");
		rowA.className = "style-row";
		const borderColor = makeOptionalColorField(
			"Border Colour",
			gauge.borderColor,
			themeBorder(),
			(hex, live) => patchGauge(gid, { borderColor: hex }, false, live)
		);
		borderColor.classList.add("compact");
		rowA.appendChild(borderColor);

		const thick = document.createElement("label");
		thick.className = "pos-field compact mid border-thickness-field";
		thick.innerHTML = `<span>Border Thickness %</span><input type="number" min="0" max="50" step="0.5" data-role="borderThickness">`;
		const thickInput = thick.querySelector("input");
		thickInput.value = fmtDec(gauge.borderThickness, 1);
		bindNumberField(thickInput, {
			parse: (raw) => (String(raw).trim() === "" ? null : Math.max(0, Math.min(50, Number(raw) || 0))),
			apply: (v) => patchGauge(gid, { borderThickness: v }),
			decimals: 1,
			current: () => live().borderThickness
		});
		rowA.appendChild(thick);

		const endMode = document.createElement("label");
		endMode.className = "pos-field compact mid";
		endMode.innerHTML = `<span>Ends</span><select data-role="endCapMode">
			<option value="border">Extend Border</option>
			<option value="endcap">Use Endcap</option>
		</select>`;
		const endModeSel = endMode.querySelector("select");
		endModeSel.value = normalizeEndCapMode(gauge.endCapMode, gauge.endCap);
		rowA.appendChild(endMode);
		endModeSel.addEventListener("change", () => {
			const mode = normalizeEndCapMode(endModeSel.value, gauge.endCap) || "border";
			const patch = { endCapMode: mode };
			if (mode === "endcap" && !migrateEndCapPath(live().endCap)) {
				patch.endCap = defaultEndCapArtPath();
			}
			patchGauge(gid, patch);
			// Rebuild editor so art fields / picker section match mode.
			renderEditor(true);
		});
		panel.appendChild(rowA);

		const endModeNow = endModeSel.value;
		const showEndArt = endModeNow === "endcap";
		if (showEndArt) {
			const endArtRow = document.createElement("div");
			endArtRow.className = "style-row endcap-row";
			const endCaps = makeIconControl({
				label: "Endcap",
				value: gauge.endCap,
				folder: "Endcaps",
				endArtPicker: true,
				clearLabel: "Clear endcap",
				showName: true,
				onCommit: (path) => patchGauge(gid, { endCap: path || defaultEndCapArtPath() })
			});
			endCaps.classList.add("compact");
			endCaps.dataset.role = "endCapArt";
			endArtRow.appendChild(endCaps);

			const overlap = document.createElement("label");
			overlap.className = "pos-field compact mid overlap-cap-field";
			overlap.dataset.role = "endCapOverlapWrap";
			overlap.innerHTML = `<span>Overlap %</span><input type="number" min="0" max="45" step="0.5" data-role="endCapOverlap">`;
			const overlapInput = overlap.querySelector("input");
			overlapInput.value = fmtDec(gauge.endCapOverlap, 1);
			bindNumberField(overlapInput, {
				parse: (raw) => (String(raw).trim() === "" ? null : Math.max(0, Math.min(45, Number(raw) || 0))),
				apply: (v) => patchGauge(gid, { endCapOverlap: v }),
				decimals: 1,
				current: () => live().endCapOverlap
			});
			endArtRow.appendChild(overlap);
			panel.appendChild(endArtRow);
		}

		const rowC = document.createElement("div");
		rowC.className = "style-row";
		const trough = document.createElement("label");
		trough.className = "pos-field compact mid";
		trough.innerHTML = `<span>Trough Opacity %</span><input type="number" min="0" max="100" step="1" data-role="troughOpacity">`;
		const troughInput = trough.querySelector("input");
		troughInput.value = fmtDec(gauge.troughOpacity, 0);
		bindNumberField(troughInput, {
			parse: (raw) => (String(raw).trim() === "" ? null : Math.max(0, Math.min(100, Number(raw) || 0))),
			apply: (v) => patchGauge(gid, { troughOpacity: v }),
			decimals: 0,
			current: () => live().troughOpacity
		});
		rowC.appendChild(trough);

		const fillDir = document.createElement("label");
		fillDir.className = "pos-field compact mid";
		fillDir.innerHTML = `<span>Fill Direction</span><select data-role="fillDirection">
			<option value="left">From Left</option>
			<option value="right">From Right</option>
			<option value="center">From Center</option>
		</select>`;
		fillDir.querySelector("select").value = normalizeFillDirection(gauge.fillDirection);
		fillDir.querySelector("select").addEventListener("change", (ev) => {
			patchGauge(gid, { fillDirection: normalizeFillDirection(ev.target.value) });
		});
		rowC.appendChild(fillDir);
		panel.appendChild(rowC);
	}
}

function renderGauges(body) {
	const bar = document.createElement("div");
	bar.className = "toolbar";
	const add = document.createElement("button");
	add.type = "button";
	add.className = "action";
	add.textContent = "Add Gauge";
	add.addEventListener("click", addGauge);
	bar.appendChild(add);
	body.appendChild(bar);
	const intro = document.createElement("p");
	intro.className = "lede";
	intro.textContent =
		"A gauge tracks one gear on its own - independent of groups. Open a gauge accordion to raise it above the editor for dragging, rotating, and resizing. Up/Down reorder the list — later gauges draw on top of earlier ones.";
	body.appendChild(intro);

	if (!Array.isArray(snapshot.gauges)) {
		snapshot.gauges = [];
	}
	if (openGaugeId && !snapshot.gauges.some((g) => g.id === openGaugeId)) {
		openGaugeId = snapshot.gauges[0] ? snapshot.gauges[0].id : "";
	}
	if (!snapshot.gauges.length) {
		const empty = document.createElement("p");
		empty.className = "lede";
		empty.textContent = "No gauges yet.";
		body.appendChild(empty);
		return;
	}
	for (const gauge of snapshot.gauges) {
		ensureGauge(gauge);
		const details = document.createElement("details");
		details.className = "accordion gauge-acc";
		details.dataset.gaugeId = gauge.id;
		details.setAttribute("name", "cog-gauges");
		details.open = openGaugeId === gauge.id;
		details.classList.toggle("is-selected", openGaugeId === gauge.id || activeGaugeId === gauge.id);
		details.innerHTML = `
			<summary>
				<span class="group-title"></span>
				<input class="name-field" data-role="name" spellcheck="false" hidden>
				<span class="end"></span>
			</summary>
			<div class="accordion-body" data-role="gaugeBody"></div>`;
		const title = details.querySelector(".group-title");
		const nameInput = details.querySelector('[data-role="name"]');
		title.textContent = gauge.name || "Gauge";
		nameInput.value = gauge.name || "Gauge";
		const end = details.querySelector(".end");
		const edit = document.createElement("button");
		edit.type = "button";
		edit.className = "tiny";
		edit.textContent = "Edit";
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
				const next = nameInput.value.trim() || gauge.name || "Gauge";
				patchGauge(gauge.id, { name: next });
				title.textContent = gaugeFor(gauge.id)?.name || next;
			} else {
				nameInput.value = gauge.name || "Gauge";
			}
		};
		edit.addEventListener("click", () => {
			selectEditorItem("gauge", gauge.id);
			details.classList.add("is-renaming");
			title.hidden = true;
			nameInput.hidden = false;
			nameInput.value = gauge.name || "Gauge";
			parkRenameFieldForEdit(details, nameInput);
			nameInput.focus();
			nameInput.select();
		});
		bindAccordionRenameKeys(nameInput, finishRename);
		stopHeaderToggle(edit);
		nameInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
		nameInput.addEventListener("click", (ev) => ev.stopPropagation());

		const gaugeIndex = snapshot.gauges.findIndex((g) => g.id === gauge.id);
		appendStackOrderButtons(end, {
			upDisabled: gaugeIndex <= 0,
			downDisabled: gaugeIndex < 0 || gaugeIndex >= snapshot.gauges.length - 1,
			onUp: () => moveGaugeInList(gauge.id, -1),
			onDown: () => moveGaugeInList(gauge.id, 1)
		});

		const del = document.createElement("button");
		del.type = "button";
		del.className = "remove";
		del.textContent = "Delete";
		del.addEventListener("click", () => removeGauge(gauge.id));
		end.appendChild(del);
		stopHeaderToggle(del);

		fillGaugeEditor(details.querySelector('[data-role="gaugeBody"]'), gauge);
		bindExclusiveGauge(details);
		body.appendChild(details);
	}
	enhanceSelects(body);
}
