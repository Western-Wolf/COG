// COG overlay - Frame gauge type (loads after _Gears.js).

const FRAME_TIMER_SNAP_MS = 140;
const FRAME_FADE_BLEND_PCT = 6;

function frameEffectiveBorderColor(gauge) {
	// Blank = transparent (user cleared).
	return optionalHex(gaugeSettings(gauge).frameBorderColor) || "";
}

function frameEffectiveFillColor(gauge) {
	return optionalHex(gaugeSettings(gauge).frameFillColor) || "";
}

function frameEffectiveFadeColor(gauge) {
	return optionalHex(gaugeSettings(gauge).pictureFade) || frameDefaultPictureFade();
}

/** Border rim inset in px (legacy plate inset; also drives rim scale). */
function frameBorderInsetPx(borderInset) {
	return Math.max(0, Number(borderInset) || 0);
}

/**
 * Visual focus of a frame shape within its bounding box (0–1).
 * Apex-up triangles have centroid at 2/3 height — bbox center sits too high.
 */
function frameShapeFocus(gauge) {
	const path = String(gaugeSettings(gauge).frameShape || "").toLowerCase();
	if (path.includes("triangle")) {
		return { x: 0.5, y: 2 / 3 };
	}
	return { x: 0.5, y: 0.5 };
}

/** Inner plate scale (0–1) so a uniform shrink about the shape focus keeps rim width even. */
function frameRimScale(gauge, rimPx) {
	const w = Math.max(1, Math.round(gauge.display.width));
	const h = Math.max(1, Math.round(gauge.display.height));
	const m = Math.min(w, h);
	const rim = Math.max(0, Math.min(frameBorderInsetPx(rimPx), m / 2));
	return Math.max(0, (m - 2 * rim) / m);
}

function frameFocusCss(focus) {
	return `${(focus.x * 100).toFixed(4)}% ${(focus.y * 100).toFixed(4)}%`;
}

/** Inner plate mask: same shape, uniformly scaled about the visual focus (even rim). */
function applyFrameInnerMask(node, href, gauge, rimPx) {
	if (!node) {
		return;
	}
	if (!href) {
		node.style.webkitMaskImage = "";
		node.style.maskImage = "";
		node.style.webkitMaskComposite = "";
		node.style.maskComposite = "";
		return;
	}
	const focus = frameShapeFocus(gauge);
	const scale = frameRimScale(gauge, rimPx);
	const inner = `${(scale * 100).toFixed(4)}%`;
	const pos = frameFocusCss(focus);
	const url = `url("${href}")`;
	node.style.webkitMaskImage = url;
	node.style.maskImage = url;
	node.style.webkitMaskRepeat = "no-repeat";
	node.style.maskRepeat = "no-repeat";
	node.style.webkitMaskSize = `${inner} ${inner}`;
	node.style.maskSize = `${inner} ${inner}`;
	node.style.webkitMaskPosition = pos;
	node.style.maskPosition = pos;
	node.style.webkitMaskComposite = "";
	node.style.maskComposite = "";
}

/** Inside Size as a 0.05–1 scale factor for picture/gear content. */
function frameInsideScale(gauge) {
	const pct = Math.max(5, Math.min(100, Number(gaugeSettings(gauge).insideSize) || 65));
	return pct / 100;
}

/** Gear content inset: border rim + Inside Size shrink (centered on shape focus). */
function frameContentInsetPx(gauge, borderInset) {
	const w = Math.max(1, Math.round(gauge.display.width));
	const h = Math.max(1, Math.round(gauge.display.height));
	const rim = frameBorderInsetPx(borderInset);
	const inner = Math.max(0, Math.min(w, h) - rim * 2);
	const shrink = (inner * (1 - frameInsideScale(gauge))) / 2;
	return Math.max(0, rim + shrink);
}

function applyFrameContentInset(el, gauge, borderInset) {
	const content = el && el.querySelector(".gauge-frame-content");
	if (!content) {
		return frameContentInsetPx(gauge, borderInset);
	}
	const inset = frameContentInsetPx(gauge, borderInset);
	const focus = frameShapeFocus(gauge);
	// Keep a rectangular safe box, then shift so its center meets the shape focus.
	content.style.inset = `${inset}px`;
	const plateH = Math.max(1, Math.round(gauge.display.height) - inset * 2);
	const plateW = Math.max(1, Math.round(gauge.display.width) - inset * 2);
	const dx = (focus.x - 0.5) * plateW;
	const dy = (focus.y - 0.5) * plateH;
	content.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
	return inset;
}

/** Picture sits full-bleed; Inside Size scales about the shape focus; clipped by inner plate. */
function applyFramePictureLayout(el, gauge, borderInset) {
	const rim = frameBorderInsetPx(borderInset);
	if (el) {
		el.style.setProperty("--frame-plate-inset", "0px");
	}
	const content = el && el.querySelector(".gauge-frame-content");
	const rot = el && el.querySelector(".gauge-frame-picture-rot");
	const focus = frameShapeFocus(gauge);
	const focusCss = frameFocusCss(focus);
	if (content) {
		content.style.inset = "0px";
		content.style.transform = "";
	}
	const deg = Number(gaugeSettings(gauge).pictureRotation) || 0;
	const scale = frameInsideScale(gauge);
	if (rot) {
		// Full plate box + scale/rotate about the shape focus (no translate+scale bias).
		rot.style.left = "0";
		rot.style.top = "0";
		rot.style.right = "0";
		rot.style.bottom = "0";
		rot.style.width = "auto";
		rot.style.height = "auto";
		rot.style.transformOrigin = focusCss;
		rot.style.transform = `rotate(${deg}deg) scale(${scale})`;
	}
	return rim;
}

function applyCenteredMask(node, href, size, focus) {
	if (!node) {
		return;
	}
	if (!href) {
		node.style.webkitMaskImage = "";
		node.style.maskImage = "";
		return;
	}
	const pos = focus ? frameFocusCss(focus) : "center center";
	node.style.webkitMaskImage = `url("${href}")`;
	node.style.maskImage = `url("${href}")`;
	node.style.webkitMaskRepeat = "no-repeat";
	node.style.maskRepeat = "no-repeat";
	node.style.webkitMaskPosition = pos;
	node.style.maskPosition = pos;
	node.style.webkitMaskSize = size;
	node.style.maskSize = size;
}

function frameShapeHref(gauge) {
	return resolveIconHref(String(gaugeSettings(gauge).frameShape || "").trim() || defaultFrameShapePath());
}

function framePictureHref(gauge) {
	const path = String(gaugeSettings(gauge).pictureIcon || "").trim() || defaultPictureIconPath();
	return resolveIconHref(path);
}

function buildGaugeFrameEl(gauge, preview) {
	const el = document.createElement("div");
	el.className = "hud-gauge hud-gauge-frame";
	el.dataset.gaugeShape = gaugeHudShape(gauge);
	el.dataset.id = gauge.id;
	el.innerHTML = `
		<div class="gauge-frame-chrome">
			<div class="gauge-frame-border"></div>
			<div class="gauge-frame-fill"></div>
		</div>
		<div class="gauge-frame-content">
			<div class="gauge-frame-gear" hidden></div>
			<div class="gauge-frame-picture" hidden>
				<div class="gauge-frame-picture-rot">
					<div class="gauge-frame-pic-layer is-empty"></div>
					<div class="gauge-frame-pic-layer is-progress"></div>
				</div>
			</div>
		</div>
		<div class="gauge-frame-handle-layer"></div>`;
	layoutHudGauge(el, gauge);
	paintGaugeFrame(el, gauge);
	if (preview) {
		attachGaugeHandles(el, gauge);
	}
	return el;
}

function paintGaugeFrameChrome(el, gauge) {
	const chrome = el.querySelector(".gauge-frame-chrome");
	const border = el.querySelector(".gauge-frame-border");
	const fill = el.querySelector(".gauge-frame-fill");
	if (!chrome || !border || !fill) {
		return { inset: 0 };
	}
	const href = frameShapeHref(gauge);
	const w = Math.max(1, Math.round(gauge.display.width));
	const h = Math.max(1, Math.round(gauge.display.height));
	const rim = Math.max(0, (Math.min(w, h) * (Number(gaugeSettings(gauge).frameBorderThickness) || 0)) / 100);
	const inset = Math.min(rim, Math.min(w, h) / 2);
	el.style.setProperty("--frame-plate-inset", "0px");
	el.style.setProperty("--gauge-frame-rot", `${gauge.display.rotation || 0}deg`);
	const borderColor = frameEffectiveBorderColor(gauge);
	const fillColor = frameEffectiveFillColor(gauge);
	// Outer silhouette (border colour) fills the gauge box.
	if (borderColor) {
		paintMaskedFace(border, "gauge-frame-border-face", { color: borderColor, href });
	} else {
		paintMaskedFace(border, "gauge-frame-border-face", { clear: true });
	}
	// Fill is the same shape, scaled about the visual focus — keeps rim width even on triangles.
	fill.style.inset = "0px";
	if (fillColor) {
		const face = paintMaskedFace(fill, "gauge-frame-fill-face", { color: fillColor, href });
		applyFrameInnerMask(face, href, gauge, inset);
	} else {
		paintMaskedFace(fill, "gauge-frame-fill-face", { clear: true });
	}
	return { inset };
}

function framePictureProgress(el, src) {
	if (!src) {
		return { fillPct: 0, kind: "none" };
	}
	if (src.type === "count") {
		return { fillPct: 100, kind: "static" };
	}
	if (src.type === "timer") {
		const active = Number(src.current) > 0;
		const was = el.dataset.frameTimerActive === "1";
		if (active && !was) {
			el.dataset.frameTimerSnapUntil = String(Date.now() + FRAME_TIMER_SNAP_MS);
		}
		el.dataset.frameTimerActive = active ? "1" : "0";
		if (!active) {
			return { fillPct: 0, kind: "timer" };
		}
		const snapUntil = Number(el.dataset.frameTimerSnapUntil) || 0;
		if (Date.now() < snapUntil) {
			return { fillPct: 100, kind: "timer" };
		}
		return { fillPct: barPercent(src), kind: "timer" };
	}
	if (src.type === "percent") {
		return { fillPct: barPercent(src), kind: "percent" };
	}
	return { fillPct: barPercent(src), kind: "other" };
}

function framePictureFrontierGradient(direction, fillPct, empty, full, fade, focus) {
	const p = Math.max(0, Math.min(100, Number(fillPct) || 0));
	const blend = FRAME_FADE_BLEND_PCT * 1.35;
	const clampStop = (v) => Math.max(0, Math.min(100, v));
	const at = focus ? frameFocusCss(focus) : "center";
	const edge = (stop) => {
		const a = clampStop(stop - blend);
		const mid = clampStop(stop);
		const b = clampStop(stop + blend);
		return { a, mid, b };
	};
	if (direction === "left") {
		const e = edge(p);
		return `linear-gradient(to right, ${full} 0%, ${full} ${e.a}%, ${fade} ${e.mid}%, ${empty} ${e.b}%, ${empty} 100%)`;
	}
	if (direction === "right") {
		const e = edge(100 - p);
		return `linear-gradient(to right, ${empty} 0%, ${empty} ${e.a}%, ${fade} ${e.mid}%, ${full} ${e.b}%, ${full} 100%)`;
	}
	if (direction === "up") {
		const e = edge(p);
		return `linear-gradient(to top, ${full} 0%, ${full} ${e.a}%, ${fade} ${e.mid}%, ${empty} ${e.b}%, ${empty} 100%)`;
	}
	if (direction === "down") {
		const e = edge(p);
		return `linear-gradient(to bottom, ${full} 0%, ${full} ${e.a}%, ${fade} ${e.mid}%, ${empty} ${e.b}%, ${empty} 100%)`;
	}
	if (direction === "in") {
		const e = edge(100 - p);
		return `radial-gradient(circle at ${at}, ${empty} 0%, ${empty} ${e.a}%, ${fade} ${e.mid}%, ${full} ${e.b}%, ${full} 100%)`;
	}
	const e = edge(p);
	return `radial-gradient(circle at ${at}, ${full} 0%, ${full} ${e.a}%, ${fade} ${e.mid}%, ${empty} ${e.b}%, ${empty} 100%)`;
}

function paintGaugeFramePicture(el, gauge, src, inset) {
	const host = el.querySelector(".gauge-frame-picture");
	const rot = el.querySelector(".gauge-frame-picture-rot");
	const emptyLayer = el.querySelector(".gauge-frame-pic-layer.is-empty");
	const progressLayer = el.querySelector(".gauge-frame-pic-layer.is-progress");
	if (!host || !rot || !emptyLayer || !progressLayer) {
		return;
	}
	host.hidden = false;
	const gearHost = el.querySelector(".gauge-frame-gear");
	if (gearHost) {
		gearHost.hidden = true;
		gearHost.innerHTML = "";
		delete gearHost.dataset.frameGearSig;
	}
	applyFramePictureLayout(el, gauge, inset);
	const shapeHref = frameShapeHref(gauge);
	const focus = frameShapeFocus(gauge);
	// Clip picture to the inner plate (same mask as fill), not the outer bezel.
	applyFrameInnerMask(host, shapeHref, gauge, inset);
	const picHref = framePictureHref(gauge);
	const empty = optionalHex(gaugeSettings(gauge).pictureEmpty) || "#000000";
	const full = optionalHex(gaugeSettings(gauge).pictureFull) || "#ffffff";
	const fade = frameEffectiveFadeColor(gauge);
	const { fillPct } = framePictureProgress(el, src);
	const direction = normalizePictureDirection(gaugeSettings(gauge).pictureDirection);
	paintMaskedFace(emptyLayer, "gauge-frame-pic-face", { color: empty, href: picHref });
	const emptyFace = emptyLayer.querySelector(".gauge-frame-pic-face");
	if (emptyFace) {
		applyCenteredMask(emptyFace, picHref, "contain", focus);
	}
	const grad = framePictureFrontierGradient(direction, fillPct, empty, full, fade, focus);
	progressLayer.classList.add("is-progress");
	progressLayer.style.background = grad;
	applyCenteredMask(progressLayer, picHref, "contain", focus);
	progressLayer.style.filter = `drop-shadow(0 0 4px ${fade})`;
}

function frameGearStructureSig(gauge, src, gear, inset) {
	const iconSlot = normalizeFrameSlot(gaugeSettings(gauge).showIcon);
	const titleSlot = normalizeFrameSlot(gaugeSettings(gauge).showLabel);
	const numberSlot = normalizeFrameSlot(gaugeSettings(gauge).showNumber);
	const fmt =
		normalizeNumberFormat(gaugeSettings(gauge).numberFormat, "barPercent");
	const isRatio = !!(src && typeof usesRatio === "function" && usesRatio(src));
	const showBar =
		numberSlot !== "none" &&
		isRatio &&
		typeof numberFormatShowsBar === "function" &&
		numberFormatShowsBar(fmt);
	const showValue =
		numberSlot !== "none" &&
		(isRatio ? typeof numberFormatShowsValue === "function" && numberFormatShowsValue(fmt) : true);
	const href = src && typeof sourceIconPath === "function" ? sourceIconPath(src, gear) : "";
	const rim = frameBorderInsetPx(inset);
	return [
		iconSlot,
		titleSlot,
		numberSlot,
		fmt,
		showBar ? 1 : 0,
		showValue ? 1 : 0,
		gaugeSettings(gauge).barTrough === true ? 1 : 0,
		gauge.display.width,
		gauge.display.height,
		gaugeSettings(gauge).fontSize,
		gaugeSettings(gauge).insideSize,
		rim,
		href,
		src ? 1 : 0,
		frameShapeHref(gauge),
		frameFocusCss(frameShapeFocus(gauge))
	].join("|");
}

function patchGaugeFrameLive(el, gauge, src, gear) {
	ensureGauge(gauge);
	const mode = normalizeGaugeDisplayMode(gaugeSettings(gauge).displayMode);
	const inactive =
		!gaugeSettings(gauge).alwaysVisible &&
		(src ? isHudHidden(src, gear) : !src) &&
		document.body.classList.contains("is-focused");
	el.classList.toggle("is-inactive", inactive);
	if (mode === "picture") {
		const progressLayer = el.querySelector(".gauge-frame-pic-layer.is-progress");
		if (!progressLayer || !src) {
			return;
		}
		const empty = optionalHex(gaugeSettings(gauge).pictureEmpty) || "#000000";
		const full = optionalHex(gaugeSettings(gauge).pictureFull) || "#ffffff";
		const fade = frameEffectiveFadeColor(gauge);
		const { fillPct } = framePictureProgress(el, src);
		const direction = normalizePictureDirection(gaugeSettings(gauge).pictureDirection);
		const focus = frameShapeFocus(gauge);
		progressLayer.style.background = framePictureFrontierGradient(
			direction,
			fillPct,
			empty,
			full,
			fade,
			focus
		);
		progressLayer.style.filter = `drop-shadow(0 0 4px ${fade})`;
		return;
	}
	const host = el.querySelector(".gauge-frame-gear");
	if (!host || !src) {
		return;
	}
	const group = { id: `frame:${gauge.id}`, style: {} };
	const fmt =
		normalizeNumberFormat(gaugeSettings(gauge).numberFormat, "barPercent");
	const isRatio = !!(typeof usesRatio === "function" && usesRatio(src));
	const showTotal =
		isRatio && typeof numberFormatShowsTotal === "function" && numberFormatShowsTotal(fmt);
	const fillEl = host.querySelector(".gear-bar-fill");
	if (fillEl) {
		setBarFill(fillEl, barPercent(src));
		fillEl.style.backgroundColor =
			typeof sourceBarColor === "function" ? sourceBarColor(src, gear, group) : themeFill();
		const trough = host.querySelector(".gear-bar.has-trough .gear-bar-clip");
		if (trough && typeof sourceBorderColor === "function") {
			trough.style.borderColor = sourceBorderColor(src, gear, group);
		}
	}
	for (const value of host.querySelectorAll(".gear-value")) {
		value.textContent = formatValue(src, showTotal);
	}
	const icon = host.querySelector(".gauge-frame-gear-icon");
	if (icon) {
		const href = typeof sourceIconPath === "function" ? sourceIconPath(src, gear) : "";
		const paint =
			(typeof sourceIconPaint === "function" ? sourceIconPaint(src, gear, group) : "") ||
			frameEffectiveBorderColor(gauge) ||
			"#ffffff";
		if (href) {
			paintMaskedFace(icon, "gear-icon-face", { color: paint, href });
		}
	}
	const label = host.querySelector(".gear-label");
	if (label) {
		label.textContent = sourceTitle(src, gear && gear.varName, gear);
	}
}

function paintGaugeFrameGear(el, gauge, src, gear, inset) {
	const host = el.querySelector(".gauge-frame-gear");
	const picHost = el.querySelector(".gauge-frame-picture");
	const content = el.querySelector(".gauge-frame-content");
	if (!host) {
		return;
	}
	host.hidden = false;
	if (picHost) {
		picHost.hidden = true;
	}
	// Match picture: full-bleed content + shape clip; Inside Size scales the stack inside the mask.
	if (content) {
		content.style.inset = "0px";
		content.style.transform = "";
	}
	const rim = frameBorderInsetPx(inset);
	const shapeHref = frameShapeHref(gauge);
	const focus = frameShapeFocus(gauge);
	applyFrameInnerMask(host, shapeHref, gauge, inset);
	const iconSlot = normalizeFrameSlot(gaugeSettings(gauge).showIcon);
	const titleSlot = normalizeFrameSlot(gaugeSettings(gauge).showLabel);
	const numberSlot = normalizeFrameSlot(gaugeSettings(gauge).showNumber);
	const fmt =
		normalizeNumberFormat(gaugeSettings(gauge).numberFormat, "barPercent");
	const showIcon = iconSlot !== "none";
	const showLabel = titleSlot !== "none";
	const showNumber = numberSlot !== "none";
	const isRatio = !!(src && typeof usesRatio === "function" && usesRatio(src));
	const showBar =
		showNumber && isRatio && typeof numberFormatShowsBar === "function" && numberFormatShowsBar(fmt);
	const showValue =
		showNumber && (isRatio ? typeof numberFormatShowsValue === "function" && numberFormatShowsValue(fmt) : true);
	const showTotal =
		showNumber && isRatio && typeof numberFormatShowsTotal === "function" && numberFormatShowsTotal(fmt);
	// Fake a minimal group so gear colour helpers keep working.
	const group = { id: `frame:${gauge.id}`, style: {} };
	const style = { barTrough: gaugeSettings(gauge).barTrough === true };
	const willShowIcon = showIcon;
	const willShowNumber = showNumber && (showBar || showValue);
	const willShowLabel = showLabel;
	const slotCount = Math.max(
		1,
		(willShowIcon ? 1 : 0) + (willShowNumber ? 1 : 0) + (willShowLabel ? 1 : 0)
	);
	const plateW = Math.max(8, Math.round(gauge.display.width) - rim * 2);
	const plateH = Math.max(8, Math.round(gauge.display.height) - rim * 2);
	const gapPx = Math.max(2, Math.round(Math.min(plateW, plateH) * 0.03));
	const shareH = Math.max(8, (plateH - gapPx * (slotCount - 1)) / slotCount);
	const alone = slotCount === 1;
	const fill = alone ? 0.92 : 0.88;
	const iconPx = Math.max(16, Math.round(Math.min(shareH, plateW) * fill));
	const fontPx =
		gaugeSettings(gauge).fontSize > 0
			? Math.round(gaugeSettings(gauge).fontSize)
			: Math.max(10, Math.round(shareH * (alone ? 0.28 : 0.4)));
	const barW = Math.max(24, Math.round(plateW * fill));
	const barH = Math.max(
		10,
		Math.round(
			alone && !showValue
				? Math.min(shareH * 0.35, plateW * 0.2)
				: Math.min(shareH * (showBar && showValue ? 0.5 : 0.65), Math.max(fontPx * 1.25, 12))
		)
	);
	const slotOrder = { top: 1, middle: 2, bottom: 3 };
	const structSig = frameGearStructureSig(gauge, src, gear, inset);

	host.style.setProperty("--frame-gear-font", `${fontPx}px`);
	host.style.setProperty("--frame-gear-icon-size", `${iconPx}px`);
	host.style.setProperty("--frame-gear-bar-width", `${barW}px`);
	host.style.setProperty("--frame-gear-bar-height", `${barH}px`);

	if (host.dataset.frameGearSig === structSig && host.querySelector(".gauge-frame-gear-inner")) {
		const inner = host.querySelector(".gauge-frame-gear-inner");
		inner.style.gap = `${gapPx}px`;
		inner.style.transformOrigin = frameFocusCss(focus);
		inner.style.transform = `scale(${frameInsideScale(gauge)})`;
		if (src) {
			patchGaugeFrameLive(el, gauge, src, gear);
			const labelEl = inner.querySelector(".gear-label");
			if (labelEl && typeof fitLabelFont === "function") {
				fitLabelFont(labelEl, Math.max(8, plateW), fontPx);
			}
		}
		return;
	}

	host.dataset.frameGearSig = structSig;
	host.innerHTML = "";
	host.style.gap = "";

	const inner = document.createElement("div");
	inner.className = "gauge-frame-gear-inner";
	inner.style.gap = `${gapPx}px`;
	inner.style.transformOrigin = frameFocusCss(focus);
	inner.style.transform = `scale(${frameInsideScale(gauge)})`;

	if (!src) {
		const empty = document.createElement("div");
		empty.className = "gauge-frame-gear-empty";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-no-gear", "No gear");
		} else {
			empty.textContent = "No gear";
		}
		inner.appendChild(empty);
		host.appendChild(inner);
		return;
	}

	const slots = [];

	if (showIcon) {
		const icon = document.createElement("div");
		icon.className = "gear-icon gauge-frame-gear-icon gauge-frame-gear-slot";
		icon.style.order = String(slotOrder[iconSlot] || 2);
		const href = typeof sourceIconPath === "function" ? sourceIconPath(src, gear) : "";
		const paint =
			(typeof sourceIconPaint === "function" ? sourceIconPaint(src, gear, group) : "") ||
			frameEffectiveBorderColor(gauge) ||
			"#ffffff";
		if (href) {
			const img = document.createElement("img");
			img.src = href;
			img.alt = "";
			icon.appendChild(img);
			icon.classList.add("is-painted");
			paintMaskedFace(icon, "gear-icon-face", { color: paint, href });
			img.hidden = true;
		}
		slots.push(icon);
	}

	if (showNumber && (showBar || showValue)) {
		const numberBlock = document.createElement("div");
		numberBlock.className = "gauge-frame-gear-number gauge-frame-gear-slot";
		numberBlock.style.order = String(slotOrder[numberSlot] || 2);
		if (showBar) {
			const bar = document.createElement("div");
			bar.className = "gear-bar" + (style.barTrough ? " has-trough" : "") + (showValue ? " has-value" : "");
			const clip = document.createElement("div");
			clip.className = "gear-bar-clip";
			if (style.barTrough && typeof sourceBorderColor === "function") {
				clip.style.borderColor = sourceBorderColor(src, gear, group);
			}
			const fillEl = document.createElement("span");
			fillEl.className = "gear-bar-fill";
			const sheen = document.createElement("span");
			sheen.className = "gear-bar-sheen";
			fillEl.appendChild(sheen);
			fillEl.style.backgroundColor =
				typeof sourceBarColor === "function" ? sourceBarColor(src, gear, group) : themeFill();
			clip.appendChild(fillEl);
			bar.appendChild(clip);
			if (showValue) {
				const value = document.createElement("div");
				value.className = "gear-value";
				value.textContent = formatValue(src, showTotal);
				bar.appendChild(value);
			}
			numberBlock.appendChild(bar);
			setBarFill(fillEl, barPercent(src));
		} else if (showValue) {
			const value = document.createElement("div");
			value.className = "gear-value";
			value.textContent = formatValue(src, showTotal);
			numberBlock.appendChild(value);
		}
		slots.push(numberBlock);
	}

	if (showLabel) {
		const label = document.createElement("div");
		label.className = "gear-label gauge-frame-gear-slot";
		label.style.order = String(slotOrder[titleSlot] || 2);
		label.textContent = sourceTitle(src, gear && gear.varName, gear);
		slots.push(label);
	}

	for (const node of slots) {
		inner.appendChild(node);
	}
	host.appendChild(inner);
	const labelEl = inner.querySelector(".gear-label");
	if (labelEl && typeof fitLabelFont === "function") {
		fitLabelFont(labelEl, Math.max(8, plateW), fontPx);
	}
}

function paintGaugeFrame(el, gauge) {
	ensureGauge(gauge);
	const { inset } = paintGaugeFrameChrome(el, gauge);
	const { src, gear } = gaugeLinked(gauge);
	const mode = normalizeGaugeDisplayMode(gaugeSettings(gauge).displayMode);
	if (mode === "picture") {
		paintGaugeFramePicture(el, gauge, src, inset);
	} else {
		paintGaugeFrameGear(el, gauge, src, gear, inset);
	}
	const inactive =
		!gaugeSettings(gauge).alwaysVisible &&
		(src ? isHudHidden(src, gear) : !src) &&
		document.body.classList.contains("is-focused");
	el.classList.toggle("is-inactive", inactive);
}

function fillGaugeFrameEditor(panel, gauge, gid, live) {
	appendEditorRule(panel);
	const lede = document.createElement("p");
	lede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(lede, "cog-frame-settings", "Frame settings");
	} else {
		lede.textContent = "Frame settings";
	}
	panel.appendChild(lede);
	const hint = document.createElement("p");
	hint.className = "hint";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			hint,
			"cog-frame-settings-hint",
			"Rotation turns the frame bezel only. Gear and picture content stay upright."
		);
	} else {
		hint.textContent = "Rotation turns the frame bezel only. Gear and picture content stay upright.";
	}
	panel.appendChild(hint);

	const modeRow = document.createElement("div");
	modeRow.className = "style-row";
	const shapeCtrl = makeIconControl({
		label: "Shape",
		value: gaugeSettings(gauge).frameShape || defaultFrameShapePath(),
			folder: "Frames",
		clearLabel: typeof t === "function" ? t("cog-reset-shape", "Reset shape") : "Reset shape",
		showName: true,
		onCommit: (path) => patchGauge(gid, { frameShape: path || defaultFrameShapePath() })
	});
	shapeCtrl.classList.add("compact");
	tagFieldLabel(shapeCtrl, "cog-shape", "Shape");
	modeRow.appendChild(shapeCtrl);

	const modeField = document.createElement("label");
	modeField.className = "pos-field compact mid";
	modeField.innerHTML = `<span>Display Mode</span><select data-role="displayMode">
		<option value="gear">Gear</option>
		<option value="picture">Picture</option>
	</select>`;
	tagFieldLabel(modeField, "cog-display-mode", "Display Mode");
	const modeSel = modeField.querySelector("select");
	tagSelectOptions(modeSel, {
		gear: ["cog-gear", "Gear"],
		picture: ["cog-picture", "Picture"]
	});
	modeSel.value = normalizeGaugeDisplayMode(gaugeSettings(gauge).displayMode);
	modeSel.addEventListener("change", () => {
		patchGauge(gid, { displayMode: normalizeGaugeDisplayMode(modeSel.value) });
		renderEditor(true);
	});
	modeRow.appendChild(modeField);
	panel.appendChild(modeRow);

	const rowA = document.createElement("div");
	rowA.className = "style-row";

	const fillColor = makeOptionalColorField(
		"Frame Fill",
		gaugeSettings(gauge).frameFillColor,
		"",
		(hex, live) => patchGauge(gid, { frameFillColor: hex }, false, live)
	);
	fillColor.classList.add("compact");
	tagFieldLabel(fillColor, "cog-frame-fill", "Frame Fill");
	rowA.appendChild(fillColor);

	const borderColor = makeOptionalColorField(
		"Frame Border",
		gaugeSettings(gauge).frameBorderColor,
		"",
		(hex, live) => patchGauge(gid, { frameBorderColor: hex }, false, live)
	);
	borderColor.classList.add("compact");
	tagFieldLabel(borderColor, "cog-frame-border", "Frame Border");
	rowA.appendChild(borderColor);

	const thick = document.createElement("label");
	thick.className = "pos-field compact mid";
	thick.innerHTML = `<span>Border Thickness</span><input type="number" min="0" max="50" step="0.001" data-role="frameBorderThickness">`;
	tagFieldLabel(thick, "cog-border-thickness", "Border Thickness");
	const thickInput = thick.querySelector("input");
	thickInput.value = fmtPct(gaugeSettings(gauge).frameBorderThickness);
	bindNumberField(thickInput, {
		suffix: "%",
		parse: (raw) => (String(raw).trim() === "" ? null : Math.max(0, Math.min(50, Number(raw) || 0))),
		apply: (v) => patchGauge(gid, { frameBorderThickness: v }),
		current: () => gaugeSettings(live()).frameBorderThickness
	});
	rowA.appendChild(thick);

	const inside = document.createElement("label");
	inside.className = "pos-field compact narrow";
	inside.innerHTML = `<span>Inside Size</span><input type="number" min="5" max="100" step="0.001" data-role="insideSize">`;
	tagFieldLabel(inside, "cog-inside-size", "Inside Size");
	const insideInput = inside.querySelector("input");
	insideInput.value = fmtPct(gaugeSettings(gauge).insideSize);
	bindNumberField(insideInput, {
		suffix: "%",
		parse: (raw) => (String(raw).trim() === "" ? null : Math.max(5, Math.min(100, Number(raw) || 0))),
		apply: (v) => patchGauge(gid, { insideSize: v }),
		current: () => gaugeSettings(live()).insideSize
	});
	rowA.appendChild(inside);
	panel.appendChild(rowA);

	const mode = normalizeGaugeDisplayMode(gaugeSettings(gauge).displayMode);
	appendEditorRule(panel);
	if (mode === "picture") {
		const picLede = document.createElement("p");
		picLede.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(picLede, "cog-picture-mode", "Picture mode");
		} else {
			picLede.textContent = "Picture mode";
		}
		panel.appendChild(picLede);

		const picRow = document.createElement("div");
		picRow.className = "style-row";
		const picCtrl = makeIconControl({
			label: "Picture",
			value: gaugeSettings(gauge).pictureIcon || defaultPictureIconPath(),
			folder: "Pictures",
			clearLabel:
				typeof t === "function" ? t("cog-reset-picture", "Reset picture") : "Reset picture",
			showName: true,
			onCommit: (path) => patchGauge(gid, { pictureIcon: path || defaultPictureIconPath() })
		});
		picCtrl.classList.add("compact");
		tagFieldLabel(picCtrl, "cog-picture", "Picture");
		picRow.appendChild(picCtrl);

		const dirField = document.createElement("div");
		dirField.className = "pos-field compact mid";
		const dirTitle = document.createElement("span");
		dirTitle.className = "field-title-row";
		const dirLabel = document.createElement("span");
		if (typeof setTranslatedText === "function") {
			setTranslatedText(dirLabel, "cog-fill-direction", "Fill Direction");
		} else {
			dirLabel.textContent = "Fill Direction";
		}
		dirTitle.appendChild(dirLabel);
		const dirTip = makeInfoTip(
			"Note: Timers fill before emptying, so direction will appear reversed.",
			"cog-picture-fill-direction-tip"
		);
		dirTitle.appendChild(dirTip);
		dirField.appendChild(dirTitle);
		const dirSel = document.createElement("select");
		dirSel.dataset.role = "pictureDirection";
		dirSel.innerHTML = `
			<option value="out">Out</option>
			<option value="in">In</option>
			<option value="up">Up</option>
			<option value="down">Down</option>
			<option value="left">Left</option>
			<option value="right">Right</option>`;
		tagSelectOptions(dirSel, {
			out: ["cog-out", "Out"],
			in: ["cog-in", "In"],
			up: ["cog-up", "Up"],
			down: ["cog-down", "Down"],
			left: ["cog-left", "Left"],
			right: ["cog-right", "Right"]
		});
		dirSel.value = normalizePictureDirection(gaugeSettings(gauge).pictureDirection);
		dirSel.addEventListener("change", () => {
			patchGauge(gid, { pictureDirection: normalizePictureDirection(dirSel.value) });
		});
		dirField.appendChild(dirSel);
		picRow.appendChild(dirField);

		const picRot = document.createElement("label");
		picRot.className = "pos-field compact mid";
		picRot.innerHTML = `<span>Picture Rotation</span><input type="number" min="-180" max="180" step="0.1" data-role="pictureRotation">`;
		tagFieldLabel(picRot, "cog-picture-rotation", "Picture Rotation");
		const picRotInput = picRot.querySelector("input");
		picRotInput.value = (Number(gaugeSettings(gauge).pictureRotation) || 0).toFixed(1);
		bindNumberField(picRotInput, {
			suffix: "°",
			parse: (raw) => {
				if (String(raw).trim() === "" || raw === "-" || raw === "." || raw === "-.") {
					return null;
				}
				const v = Number(raw);
				return Number.isFinite(v) ? v : null;
			},
			apply: (v) => patchGauge(gid, { pictureRotation: v }),
			format: (v) => (Number(v) || 0).toFixed(1),
			current: () => gaugeSettings(live()).pictureRotation || 0
		});
		picRow.appendChild(picRot);
		panel.appendChild(picRow);

		const colorRow = document.createElement("div");
		colorRow.className = "style-row";
		const emptyColor = makeOptionalColorField(
			"Empty",
			gaugeSettings(gauge).pictureEmpty === "#000000" ? "" : gaugeSettings(gauge).pictureEmpty,
			"#000000",
			(hex, live) => patchGauge(gid, { pictureEmpty: hex || "#000000" }, false, live)
		);
		emptyColor.classList.add("compact");
		tagFieldLabel(emptyColor, "cog-empty", "Empty");
		colorRow.appendChild(emptyColor);
		const fullColor = makeOptionalColorField(
			"Full",
			gaugeSettings(gauge).pictureFull === "#ffffff" ? "" : gaugeSettings(gauge).pictureFull,
			"#ffffff",
			(hex, live) => patchGauge(gid, { pictureFull: hex || "#ffffff" }, false, live)
		);
		fullColor.classList.add("compact");
		tagFieldLabel(fullColor, "cog-full", "Full");
		colorRow.appendChild(fullColor);
		const fadeColor = makeOptionalColorField(
			"Fade",
			optionalHex(gaugeSettings(gauge).pictureFade) === frameDefaultPictureFade() ? "" : gaugeSettings(gauge).pictureFade,
			frameDefaultPictureFade(),
			(hex, live) => patchGauge(gid, { pictureFade: hex || frameDefaultPictureFade() }, false, live)
		);
		fadeColor.classList.add("compact");
		tagFieldLabel(fadeColor, "cog-fade", "Fade");
		colorRow.appendChild(fadeColor);
		panel.appendChild(colorRow);
		return;
	}

	const gearLede = document.createElement("p");
	gearLede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(gearLede, "cog-gear-mode", "Gear mode");
	} else {
		gearLede.textContent = "Gear mode";
	}
	panel.appendChild(gearLede);

	const gearRow = document.createElement("div");
	gearRow.className = "style-row";

	const iconSlot = normalizeFrameSlot(gaugeSettings(gauge).showIcon);
	const titleSlot = normalizeFrameSlot(gaugeSettings(gauge).showLabel);
	const numberSlot = normalizeFrameSlot(gaugeSettings(gauge).showNumber);

	const showIcon = document.createElement("label");
	showIcon.className = "pos-field compact mid";
	showIcon.innerHTML = `<span>Show Icon</span><select data-role="showIcon">${frameSlotSelectHtml(iconSlot, [
		titleSlot,
		numberSlot
	].filter((s) => s !== "none"))}</select>`;
	tagFieldLabel(showIcon, "cog-show-icon", "Show Icon");
	const showIconSel = showIcon.querySelector("select");
	tagFrameSlotOptions(showIconSel);
	showIconSel.value = iconSlot;
	showIconSel.addEventListener("change", (ev) => {
		patchGauge(gid, { showIcon: normalizeFrameSlot(ev.target.value) });
		if (typeof renderEditor === "function") {
			renderEditor(true);
		}
	});
	gearRow.appendChild(showIcon);

	const showLabel = document.createElement("label");
	showLabel.className = "pos-field compact mid";
	showLabel.innerHTML = `<span>Show Title</span><select data-role="showLabel">${frameSlotSelectHtml(titleSlot, [
		iconSlot,
		numberSlot
	].filter((s) => s !== "none"))}</select>`;
	tagFieldLabel(showLabel, "cog-show-title", "Show Title");
	const showLabelSel = showLabel.querySelector("select");
	tagFrameSlotOptions(showLabelSel);
	showLabelSel.value = titleSlot;
	showLabelSel.addEventListener("change", (ev) => {
		patchGauge(gid, { showLabel: normalizeFrameSlot(ev.target.value) });
		if (typeof renderEditor === "function") {
			renderEditor(true);
		}
	});
	gearRow.appendChild(showLabel);

	const showNumber = document.createElement("label");
	showNumber.className = "pos-field compact mid";
	showNumber.innerHTML = `<span>Show Number</span><select data-role="showNumber">${frameSlotSelectHtml(numberSlot, [
		iconSlot,
		titleSlot
	].filter((s) => s !== "none"))}</select>`;
	tagFieldLabel(showNumber, "cog-show-number", "Show Number");
	const showNumberSel = showNumber.querySelector("select");
	tagFrameSlotOptions(showNumberSel);
	showNumberSel.value = numberSlot;
	showNumberSel.addEventListener("change", (ev) => {
		patchGauge(gid, { showNumber: normalizeFrameSlot(ev.target.value) });
		if (typeof renderEditor === "function") {
			renderEditor(true);
		}
	});
	gearRow.appendChild(showNumber);

	const numberFormatField = document.createElement("label");
	numberFormatField.className = "pos-field compact wide";
	numberFormatField.innerHTML = `<span>Number Format</span><select data-role="numberFormat">
		<option value="bar">Bar</option>
		<option value="barPercent">Bar and percentage</option>
		<option value="barTotal">Bar and total</option>
		<option value="percent">Percentage</option>
		<option value="total">Total</option>
	</select>`;
	tagFieldLabel(numberFormatField, "cog-number-format", "Number Format");
	const numberFormatSel = numberFormatField.querySelector("select");
	tagSelectOptions(numberFormatSel, {
		bar: ["cog-bar", "Bar"],
		barPercent: ["cog-bar-and-percentage", "Bar and percentage"],
		barTotal: ["cog-bar-and-total", "Bar and total"],
		percent: ["cog-percentage", "Percentage"],
		total: ["cog-total", "Total"]
	});
	numberFormatSel.value = normalizeNumberFormat(gaugeSettings(gauge).numberFormat, "barPercent");
	numberFormatSel.addEventListener("change", (ev) => {
		patchGauge(gid, { numberFormat: normalizeNumberFormat(ev.target.value, "barPercent") });
	});
	gearRow.appendChild(numberFormatField);

	const trough = document.createElement("label");
	trough.className = "pos-field compact mid";
	trough.innerHTML = `<span>Bar trough</span><input type="checkbox" data-role="barTrough">`;
	tagFieldLabel(trough, "cog-bar-trough", "Bar trough");
	const troughBox = trough.querySelector("input");
	troughBox.checked = gaugeSettings(gauge).barTrough === true;
	troughBox.addEventListener("change", () => {
		patchGauge(gid, { barTrough: troughBox.checked });
	});
	gearRow.appendChild(trough);
	panel.appendChild(gearRow);
}
