// COG overlay — Shout Meter gizmo
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

const DEFAULT_GIZMO_SHOUT_WIDTH = 220;
const DEFAULT_GIZMO_SHOUT_HEIGHT = 48;

const DEFAULT_SHOUT_PRIMARY = "#ffffff";
const DEFAULT_SHOUT_SECONDARY = "#5ba4f9";
const DEFAULT_TROUGH_OPACITY = 20;
const SHOUT_METER_PREVIEW_FILL = 0.7;

const SHOUT_METER_PREVIEW = {
	equipped: true,
	shoutName: "Unrelenting Force",
	remaining: 45 * SHOUT_METER_PREVIEW_FILL,
	maximum: 45,
	shoutLevel: -1,
	shouting: false,
	words: [
		{ index: 0, fontText: "FUS", translation: "Force", editor: "Fus", known: true, unlocked: true },
		{ index: 1, fontText: "RO", translation: "Balance", editor: "Ro", known: true, unlocked: true },
		{ index: 2, fontText: "D4", translation: "Push", editor: "Dah", known: true, unlocked: true }
	]
};

function shoutMeterPreviewState(live) {
	if (live && live.equipped) {
		const maximum = Number(live.maximum) > 0 ? Number(live.maximum) : 45;
		return {
			...live,
			remaining: maximum * SHOUT_METER_PREVIEW_FILL,
			maximum,
			shouting: false
		};
	}
	return SHOUT_METER_PREVIEW;
}

function normalizeShoutDrainOrigin(value) {
	const v = String(value || "").toLowerCase();
	if (v === "left") {
		return "left";
	}
	if (v === "right") {
		return "right";
	}
	return "center";
}

function normalizeShoutWordsMode(value) {
	const v = String(value || "").toLowerCase();
	if (v === "known") {
		return "known";
	}
	if (v === "all") {
		return "all";
	}
	return "unlocked";
}

function defaultShoutMeterGizmo(n) {
	const settings = {
		fontSize: 0,
		textAlign: "center",
		drainOrigin: "center",
		wordsMode: "unlocked",
		primaryColor: DEFAULT_SHOUT_PRIMARY,
		secondaryColor: DEFAULT_SHOUT_SECONDARY,
		troughOpacity: DEFAULT_TROUGH_OPACITY
	};
	settings.displayName =
		typeof formatStockName === "function"
			? formatStockName("Shout Meter {num}", { num: n })
			: `Shout Meter ${n}`;
	return {
		id: `gizmo_${Date.now().toString(36)}`,
		typeId: "cog-shout-meter",
		visibility: "hud",
		hudSuppress: ["hud.casting"],
		display: {
			x: DEFAULT_HUD_X,
			y: DEFAULT_HUD_Y,
			rotation: 0,
			width: DEFAULT_GIZMO_SHOUT_WIDTH,
			height: DEFAULT_GIZMO_SHOUT_HEIGHT,
			maxAlpha: 100
		},
		settings,
		settingsJson: JSON.stringify(settings)
	};
}
function ensureShoutMeterGizmo(gizmo) {
	ensureGizmoDisplayName(gizmo);
	const s = ensureGizmoSettings(gizmo);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation/width/height move under nested "display" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	migrateEntityDisplay(gizmo, {
		sized: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: DEFAULT_GIZMO_SHOUT_WIDTH,
		height: DEFAULT_GIZMO_SHOUT_HEIGHT,
		minW: MIN_GIZMO_WIDTH,
		minH: MIN_GIZMO_HEIGHT
	});
	s.fontSize = Math.max(0, Number(s.fontSize) || 0);
	s.textAlign = normalizeClockTextAlign(s.textAlign);
	s.drainOrigin = normalizeShoutDrainOrigin(s.drainOrigin);
	s.wordsMode = normalizeShoutWordsMode(s.wordsMode);
	s.primaryColor = optionalHex(s.primaryColor) || DEFAULT_SHOUT_PRIMARY;
	s.secondaryColor = optionalHex(s.secondaryColor) || DEFAULT_SHOUT_SECONDARY;
	{
		const n = Number(s.troughOpacity);
		s.troughOpacity = quantizePct(
			Math.max(0, Math.min(100, Number.isFinite(n) ? n : DEFAULT_TROUGH_OPACITY))
		);
	}
	gizmo.visibility = coalesceGizmoVisibility(gizmo, "cog-shout-meter");
	// Sticky seed — soft-hide casting while play-active (same as pre-hudSuppress shout branch).
	{
		const list =
			typeof normalizeGizmoHudSuppressList === "function"
				? normalizeGizmoHudSuppressList(gizmo.hudSuppress)
				: Array.isArray(gizmo.hudSuppress)
					? gizmo.hudSuppress.slice()
					: [];
		if (!list.some((k) => String(k).toLowerCase() === "hud.casting")) {
			list.push("hud.casting");
		}
		gizmo.hudSuppress = list;
	}
	gizmo.settings = s;
	gizmo.settingsJson = JSON.stringify(s);
	return gizmo;
}

function addShoutMeterGizmo() {
	placeNewGizmo(defaultShoutMeterGizmo(nextGizmoTypeIndex("cog-shout-meter")));
}

function shoutMeterLiveState(gizmo) {
	const live = snapshot.shoutMeter;
	const preview = document.body.classList.contains("is-focused");
	if (preview) {
		return shoutMeterPreviewState(live);
	}
	if (live && live.equipped) {
		return live;
	}
	return null;
}

function shoutMeterFontText(word) {
	return String(word && (word.fontText || word.editor) || "").toUpperCase();
}

function shoutColorGlow(hex, alpha) {
	const color = normalizeHexColor(hex, "#ffffff");
	const r = parseInt(color.slice(1, 3), 16);
	const g = parseInt(color.slice(3, 5), 16);
	const b = parseInt(color.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function filterShoutMeterWords(gizmo, words) {
	const mode = normalizeShoutWordsMode(gizmo.settings.wordsMode);
	const list = words || [];
	const filtered = list.filter((word) => {
		if (mode === "all") {
			return true;
		}
		if (mode === "known") {
			return word.known;
		}
		return word.unlocked;
	});
	// Defensive: if unlocked mode yields nothing but known words exist, show known.
	if (mode === "unlocked" && filtered.length === 0) {
		const known = list.filter((word) => word.known);
		if (known.length) {
			return known;
		}
	}
	return filtered;
}

function shoutMeterFadeClipOrigin(origin) {
	const o = normalizeShoutDrainOrigin(origin);
	if (o === "left") {
		return "right";
	}
	if (o === "right") {
		return "left";
	}
	return "center";
}

function applyShoutMeterDrainClip(el, visibleRatio, origin) {
	const visible = Math.max(0, Math.min(1, Number(visibleRatio) || 0));
	const hidden = 1 - visible;
	const userOrigin = normalizeShoutDrainOrigin(origin);
	if (userOrigin === "center") {
		el.style.clipPath = "none";
		return;
	}
	const o = shoutMeterFadeClipOrigin(origin);
	if (o === "right") {
		el.style.clipPath = `inset(0 0 0 ${hidden * 100}%)`;
	} else {
		el.style.clipPath = `inset(0 ${hidden * 100}% 0 0)`;
	}
}

const SHOUT_COOLDOWN_TRAIL = 0.14;
const SHOUT_DRAIN_HOLD_MS = 450;
const SHOUT_DENY_DELAY_MS = 900;

function shoutMeterCooldownBlend(bandPct, centerGapPct) {
	const bandBlend = Math.max(1.5, Math.min(8, bandPct * 0.55));
	if (centerGapPct <= 0) {
		return Math.min(bandBlend, bandPct * 0.4);
	}
	return Math.min(bandBlend, bandPct * 0.45, centerGapPct * 0.28);
}

function shoutMeterGradientStop(pct) {
	return Math.max(0, Math.min(100, pct));
}

function resolveShoutMeterDrainRatio(el, state, cooldown, charging) {
	if (charging) {
		el.dataset.shoutWasCharging = "1";
		delete el.dataset.shoutDrainDisplayed;
		delete el.dataset.shoutDrainHoldUntil;
		return null;
	}
	if (!cooldown) {
		delete el.dataset.shoutWasCharging;
		delete el.dataset.shoutDrainDisplayed;
		delete el.dataset.shoutDrainHoldUntil;
		delete el.dataset.shoutDenyAllowedAfter;
		return null;
	}
	if (el.dataset.shoutWasCharging === "1") {
		el.dataset.shoutWasCharging = "0";
		const denyAfter = Date.now() + SHOUT_DENY_DELAY_MS;
		el.dataset.shoutDrainHoldUntil = String(Date.now() + SHOUT_DRAIN_HOLD_MS);
		el.dataset.shoutDenyAllowedAfter = String(denyAfter);
		el.dataset.shoutDrainDisplayed = "1";
	}
	const holdUntil = Number(el.dataset.shoutDrainHoldUntil) || 0;
	if (Date.now() < holdUntil) {
		el.dataset.shoutDrainDisplayed = "1";
		return 1;
	}
	const actual = state.maximum > 0 ? state.remaining / state.maximum : 0;
	let displayed = Number(el.dataset.shoutDrainDisplayed);
	if (!Number.isFinite(displayed)) {
		displayed = actual;
	} else {
		displayed = Math.min(displayed, actual);
	}
	el.dataset.shoutDrainDisplayed = String(displayed);
	return displayed;
}

function applyShoutMeterCooldownPaint(fillClip, fillLayer, drainRatio, origin) {
	const p = Math.max(0, Math.min(1, Number(drainRatio) || 0));
	applyShoutMeterDrainClip(fillClip, p, origin);
	fillLayer.classList.add("is-cooldown");
	if (p >= 0.999) {
		fillLayer.classList.remove("is-gradient");
		fillLayer.style.removeProperty("--shout-cooldown-gradient");
		return;
	}
	const trail = SHOUT_COOLDOWN_TRAIL;
	const edge = p * 100;
	const tailStart = Math.max(0, (p - trail) * 100);
	const userOrigin = normalizeShoutDrainOrigin(origin);
	let grad;
	if (userOrigin === "center") {
		const drain = 1 - p;
		const troughHalf = drain * 50;
		const trailWing = SHOUT_COOLDOWN_TRAIL * 50;
		const secHalf = Math.min(50, troughHalf + trailWing);
		const leftPrimaryEnd = 50 - secHalf;
		const leftSecEnd = 50 - troughHalf;
		const rightSecStart = 50 + troughHalf;
		const rightPrimaryStart = 50 + secHalf;
		const band = secHalf - troughHalf;
		const centerGap = Math.max(0, rightSecStart - leftSecEnd);
		const blend = shoutMeterCooldownBlend(band, centerGap);
		const lOut = shoutMeterGradientStop(leftPrimaryEnd);
		const lIn = shoutMeterGradientStop(leftSecEnd);
		const rIn = shoutMeterGradientStop(rightSecStart);
		const rOut = shoutMeterGradientStop(rightPrimaryStart);
		grad = `linear-gradient(to right, var(--shout-primary) 0%, var(--shout-primary) ${lOut - blend}%, var(--shout-secondary) ${lOut + blend}%, var(--shout-secondary) ${lIn - blend}%, transparent ${lIn + blend}%, transparent ${rIn - blend}%, var(--shout-secondary) ${rIn + blend}%, var(--shout-secondary) ${rOut - blend}%, var(--shout-primary) ${rOut + blend}%, var(--shout-primary) 100%)`;
	} else {
		const o = shoutMeterFadeClipOrigin(origin);
		const band = trail * 50;
		const blend = shoutMeterCooldownBlend(band, 100);
		if (o === "right") {
			const edgeR = shoutMeterGradientStop(100 - edge);
			const tailR = shoutMeterGradientStop(100 - tailStart);
			grad = `linear-gradient(to right, transparent 0%, transparent ${edgeR - blend}%, var(--shout-secondary) ${edgeR + blend}%, var(--shout-secondary) ${tailR - blend}%, var(--shout-primary) ${tailR + blend}%, var(--shout-primary) 100%)`;
		} else {
			const tail = shoutMeterGradientStop(tailStart);
			const edgeStop = shoutMeterGradientStop(edge);
			grad = `linear-gradient(to right, var(--shout-primary) 0%, var(--shout-primary) ${tail - blend}%, var(--shout-secondary) ${tail + blend}%, var(--shout-secondary) ${edgeStop - blend}%, transparent ${edgeStop + blend}%)`;
		}
	}
	fillLayer.classList.add("is-gradient");
	fillLayer.style.setProperty("--shout-cooldown-gradient", grad);
}

function clearShoutMeterFillPaint(fillLayer) {
	fillLayer.classList.remove("is-gradient", "is-cooldown");
	fillLayer.style.removeProperty("--shout-cooldown-gradient");
}

function triggerShoutMeterDeny(el) {
	const text = el.querySelector(".shout-meter-text");
	if (!text) {
		return;
	}
	text.classList.remove("is-deny-vibrate");
	void text.offsetWidth;
	text.classList.add("is-deny-vibrate");
	const onEnd = (ev) => {
		if (ev.animationName !== "cog-shout-meter-deny") {
			return;
		}
		text.classList.remove("is-deny-vibrate");
		text.removeEventListener("animationend", onEnd);
	};
	text.addEventListener("animationend", onEnd);
}

function layoutHudGizmoShoutMeter(el, gizmo) {
	ensureGizmo(gizmo);
	const box = gizmoLayoutBox(gizmo);
	const css = hudItemLayoutCss(gizmo, box.w, box.h);
	el.style.left = `${css.x * 100}%`;
	el.style.top = `${css.y * 100}%`;
	el.style.width = `${box.w}px`;
	el.style.height = `${box.h}px`;
	el.style.setProperty("--gizmo-rot", `${gizmo.display.rotation || 0}deg`);
	const body = el.querySelector(".shout-meter-body");
	if (body) {
		const align = normalizeClockTextAlign(gizmo.settings.textAlign);
		body.classList.remove("is-align-center", "is-align-left", "is-align-right");
		body.classList.add(`is-align-${align}`);
	}
	const textHost = el.querySelector(".shout-meter-text");
	if (textHost) {
		textHost.style.fontSize = `${gizmoFontSizePx(gizmo)}px`;
	}
	applyHostMaxAlpha(el, gizmo);
}

function paintGizmoShoutMeter(el, gizmo) {
	ensureGizmo(gizmo);
	const preview = document.body.classList.contains("is-focused");
	const state = shoutMeterLiveState(gizmo);
	const show = (state && state.equipped) || preview;
	el.hidden = !show;
	if (!show || !state) {
		return;
	}
	const primary = normalizeHexColor(gizmo.settings.primaryColor, DEFAULT_SHOUT_PRIMARY);
	const secondary = normalizeHexColor(gizmo.settings.secondaryColor, DEFAULT_SHOUT_SECONDARY);
	const troughA = gizmo.settings.troughOpacity / 100;
	el.style.setProperty("--shout-primary", primary);
	el.style.setProperty("--shout-secondary", secondary);
	el.style.setProperty("--shout-trough-a", String(troughA));
	el.style.setProperty("--shout-glow-primary", shoutColorGlow(primary, 0.92));
	el.style.setProperty("--shout-glow-secondary", shoutColorGlow(secondary, 0.72));

	const shoutSig = String(state.shoutEditor || state.shoutName || "");
	if (el.dataset.shoutMeterShout !== shoutSig) {
		el.dataset.shoutMeterShout = shoutSig;
		delete el.dataset.shoutDrainDisplayed;
		delete el.dataset.shoutDrainHoldUntil;
		delete el.dataset.shoutWasCharging;
		delete el.dataset.shoutDenyAllowedAfter;
	}

	const words = filterShoutMeterWords(gizmo, state.words);
	const wordsLayer = el.querySelector(".shout-meter-words");
	const lineLayer = el.querySelector(".shout-meter-line");
	const fillClip = el.querySelector(".shout-meter-fill-clip");
	const fillLayer = el.querySelector(".shout-meter-fill-layer");
	if (!wordsLayer || !lineLayer || !fillClip || !fillLayer) {
		return;
	}

	const lineText = words.map(shoutMeterFontText).join(" ");
	const cooldown = state.remaining > 0 && state.maximum > 0;
	const charging = !cooldown && state.shouting;

	const wasDenied = el.dataset.shoutDenied === "1";
	const isDenied = !!state.shoutDenied;
	el.dataset.shoutDenied = isDenied ? "1" : "0";
	const denyAllowed = Date.now() >= Number(el.dataset.shoutDenyAllowedAfter || 0);
	if (isDenied && !wasDenied && denyAllowed) {
		triggerShoutMeterDeny(el);
	}

	if (charging) {
		el.dataset.shoutWasCharging = "1";
		const filledCount =
			state.shoutLevel >= 0 ? Math.min(words.length, state.shoutLevel + 1) : 0;
		wordsLayer.hidden = false;
		lineLayer.hidden = true;
		fillClip.hidden = true;
		wordsLayer.replaceChildren();
		for (let i = 0; i < words.length; i++) {
			if (i > 0) {
				wordsLayer.appendChild(document.createTextNode(" "));
			}
			const wordEl = document.createElement("span");
			wordEl.className = "shout-word" + (i < filledCount ? " is-filled" : "");
			wordEl.dataset.word = shoutMeterFontText(words[i]);
			wordsLayer.appendChild(wordEl);
		}
		el.classList.remove("is-cooldown");
	} else {
		wordsLayer.hidden = true;
		lineLayer.hidden = false;
		lineLayer.dataset.text = lineText;
		fillLayer.dataset.text = lineText;
		if (cooldown) {
			fillClip.hidden = false;
			const drainRatio = preview
				? SHOUT_METER_PREVIEW_FILL
				: resolveShoutMeterDrainRatio(el, state, cooldown, charging);
			applyShoutMeterCooldownPaint(fillClip, fillLayer, drainRatio, gizmo.settings.drainOrigin);
			el.classList.add("is-cooldown");
		} else {
			resolveShoutMeterDrainRatio(el, state, false, false);
			fillClip.hidden = true;
			clearShoutMeterFillPaint(fillLayer);
			el.classList.remove("is-cooldown");
		}
	}
}

function buildGizmoShoutMeterEl(gizmo, preview) {
	const el = document.createElement("div");
	el.className = "hud-gizmo hud-gizmo-shout-meter";
	el.dataset.id = gizmo.id;
	el.dataset.gizmoType = "cog-shout-meter";
	el.innerHTML = `
		<div class="shout-meter-body is-align-center">
			<div class="shout-meter-text">
				<div class="shout-meter-words" hidden></div>
				<div class="shout-meter-line" data-text="">
					<div class="shout-meter-fill-clip">
						<div class="shout-meter-fill-layer" data-text=""></div>
					</div>
				</div>
			</div>
		</div>`;
	layoutHudGizmoShoutMeter(el, gizmo);
	paintGizmoShoutMeter(el, gizmo);
	if (preview) {
		attachGizmoHandles(el, gizmo);
	}
	return el;
}

window.CogRegisterGizmoRenderer("cog-shout-meter", {
	create() {
		return defaultShoutMeterGizmo(nextGizmoTypeIndex("cog-shout-meter"));
	},
	ensure: ensureShoutMeterGizmo,
	build: buildGizmoShoutMeterEl,
	layout: layoutHudGizmoShoutMeter,
	paint: paintGizmoShoutMeter,
	fontSizePx(gizmo) {
		const s = ensureGizmoSettings(gizmo);
		if (s.fontSize > 0) {
			return Math.round(s.fontSize);
		}
		return Math.max(16, Math.round(gizmo.display.height * 0.72));
	}
});
