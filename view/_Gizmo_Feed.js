// COG overlay — Feed gizmo (notifications + inventory, one stack)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

const DEFAULT_FEED_WIDTH = 400;
const DEFAULT_FEED_HEIGHT = 400;
const DEFAULT_FEED_MAX = 15;
const DEFAULT_FEED_STACK_ORIGIN = "top";
const DEFAULT_FEED_TEXT_ALIGN = "left";
const DEFAULT_FEED_DURATION_MS = 5000;
const DEFAULT_FEED_FADE_MS = 1000;
const DEFAULT_FEED_BACKDROP_COLOR = "#000000";
const DEFAULT_FEED_BACKDROP_OPACITY = 35;
const DEFAULT_FEED_BACKDROP_DIRECTION = "down";
const DEFAULT_FEED_NOTIFICATION_ICON = "Actions/speak.svg";
const DEFAULT_FEED_INVENTORY_ICON = "Treasure/bag.svg";
const DEFAULT_FEED_LOCATION_DISCOVERY_ICON = "Camping/map.svg";
const DEFAULT_FEED_CURRENT_LOCATION_ICON = "Camping/compass.svg";
const DEFAULT_FEED_EFFECT_ICON = "Magic/sparkles.svg";
const DEFAULT_FEED_PROGRESS_BAR_WIDTH = 20;
const DEFAULT_FEED_NUMBER_FORMAT = "barTotal";
const DEFAULT_FEED_SKILL_ICON = "Scribe/book-open.svg";
const DEFAULT_FEED_LEVEL_ICON = "Celestial/star.svg";
const DEFAULT_FEED_ICON_PLACEMENT = "left";

function normalizeStackOrigin(value) {
	return String(value || "").toLowerCase() === "top" ? "top" : "bottom";
}

function normalizeFeedBackdropDirection(value) {
	const v = String(value || "").toLowerCase();
	if (v === "down") {
		return "down";
	}
	if (v === "center") {
		return "center";
	}
	return "up";
}

function feedBackdropEdgeMask(textAlign) {
	const align = normalizeClockTextAlign(textAlign || "left");
	if (align === "right") {
		return "linear-gradient(to right, transparent 0%, #000 10%, #000 100%)";
	}
	if (align === "center") {
		return "linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%)";
	}
	return "linear-gradient(to right, #000 0%, #000 90%, transparent 100%)";
}

function feedBackdropGradient(color, opacityPct, direction) {
	const alpha = Math.max(0, Math.min(100, Number(opacityPct) || 0)) / 100;
	if (alpha <= 0) {
		return "none";
	}
	const hex = normalizeHexColor(color, DEFAULT_FEED_BACKDROP_COLOR);
	const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
	const solid = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
	const clear = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`;
	const dir = normalizeFeedBackdropDirection(direction);
	if (dir === "down") {
		return `linear-gradient(to bottom, ${solid}, ${clear})`;
	}
	if (dir === "up") {
		return `linear-gradient(to top, ${solid}, ${clear})`;
	}
	return `linear-gradient(to bottom, ${solid}, ${clear} 50%, ${solid})`;
}

/**
 * Paint notification/location text with Scaleform-style <b>/<i>/<u> (left intact by C++).
 * Never assigns untrusted HTML via innerHTML — only createElement / createTextNode.
 */
function setNotificationRichText(el, text, baseColor) {
	if (!el) {
		return;
	}
	el.style.color = baseColor || "";
	const raw = String(text == null ? "" : text);
	el.replaceChildren();
	if (!raw) {
		return;
	}
	const root = el;
	const stack = [root];
	let i = 0;
	const flushText = (from, to) => {
		if (to <= from) {
			return;
		}
		stack[stack.length - 1].appendChild(document.createTextNode(raw.slice(from, to)));
	};
	while (i < raw.length) {
		const lt = raw.indexOf("<", i);
		if (lt < 0) {
			flushText(i, raw.length);
			break;
		}
		flushText(i, lt);
		const gt = raw.indexOf(">", lt + 1);
		if (gt < 0) {
			flushText(lt, raw.length);
			break;
		}
		let body = raw.slice(lt + 1, gt).trim();
		let closing = false;
		if (body.startsWith("/")) {
			closing = true;
			body = body.slice(1).trim();
		}
		const nameMatch = /^([a-zA-Z]+)/.exec(body);
		const name = nameMatch ? nameMatch[1].toLowerCase() : "";
		if (name === "b" || name === "i" || name === "u") {
			if (closing) {
				if (stack.length > 1 && stack[stack.length - 1].tagName === name.toUpperCase()) {
					stack.pop();
				}
			} else {
				const node = document.createElement(name);
				stack[stack.length - 1].appendChild(node);
				stack.push(node);
			}
		}
		// Unknown tags: skip (C++ should already have stripped them).
		i = gt + 1;
	}
}

function applyFeedBackdropStyle(el, color, opacityPct, direction, textAlign) {
	// Same fingerprint pattern as effectLayout / layoutKey — skip style writes when unchanged.
	const align = normalizeClockTextAlign(textAlign || "left");
	const dir = normalizeFeedBackdropDirection(direction);
	const opacity = Math.max(0, Math.min(100, Number(opacityPct) || 0));
	const hex = normalizeHexColor(color, DEFAULT_FEED_BACKDROP_COLOR);
	const key = `${hex}|${opacity}|${dir}|${align}`;
	if (el.dataset.backdropKey === key) {
		return;
	}
	el.dataset.backdropKey = key;
	const bg = feedBackdropGradient(hex, opacity, dir);
	el.style.background = bg;
	if (!bg || bg === "none") {
		el.style.maskImage = "";
		el.style.webkitMaskImage = "";
		return;
	}
	const mask = feedBackdropEdgeMask(align);
	el.style.maskImage = mask;
	el.style.webkitMaskImage = mask;
	el.style.maskSize = "100% 100%";
	el.style.webkitMaskSize = "100% 100%";
}

function normalizeFeedIconPlacement(value) {
	return String(value || "").toLowerCase() === "right" ? "right" : "left";
}

function normalizeFeedIcon(value, fallback) {
	const iconPath = normalizeIconRelPath(value);
	if (!iconPath) {
		return fallback;
	}
	return iconPath;
}

function normalizeFeedNotificationIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_NOTIFICATION_ICON);
}

function normalizeFeedInventoryIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_INVENTORY_ICON);
}

function normalizeFeedLocationDiscoveryIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_LOCATION_DISCOVERY_ICON);
}

function normalizeFeedCurrentLocationIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_CURRENT_LOCATION_ICON);
}

function normalizeFeedSkillIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_SKILL_ICON);
}

function normalizeFeedLevelIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_LEVEL_ICON);
}

function normalizeFeedEffectIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_EFFECT_ICON);
}

function normalizeSkillKind(value) {
	return String(value || "").toLowerCase() === "level" ? "level" : "skill";
}

function normalizeLocationKind(value) {
	return String(value || "").toLowerCase() === "current" ? "current" : "discovery";
}

function defaultFeedGizmo(n) {
	const settings = {
		fontSize: DEFAULT_GIZMO_FONT_SIZE,
		textAlign: DEFAULT_FEED_TEXT_ALIGN,
		iconPlacement: DEFAULT_FEED_ICON_PLACEMENT,
		textColor: DEFAULT_GIZMO_GOLD,
		addColor: DEFAULT_GIZMO_GOLD,
		removeColor: DEFAULT_GIZMO_GOLD,
		stolenColor: DEFAULT_GIZMO_GOLD,
		maxVisible: DEFAULT_FEED_MAX,
		stackOrigin: DEFAULT_FEED_STACK_ORIGIN,
		durationMs: DEFAULT_FEED_DURATION_MS,
		fadeMs: DEFAULT_FEED_FADE_MS,
		showNotifications: false,
		showInventory: false,
		showLocation: false,
		showActiveEffects: false,
		showSkills: false,
		effectsMinSec: 1,
		effectsMaxSec: 180,
		showEffectIcons: true,
		showEffectText: true,
		showEffectTimer: true,
		progressBarWidth: DEFAULT_FEED_PROGRESS_BAR_WIDTH,
		numberFormat: DEFAULT_FEED_NUMBER_FORMAT,
		barColor: typeof defaultFillColor === "function" ? defaultFillColor() : "#c4a35a",
		effectIcon: DEFAULT_FEED_EFFECT_ICON,
		effectsColor: DEFAULT_GIZMO_GOLD,
		suppressTransformEffects: true,
		showNotificationIcons: true,
		showInventoryIcons: true,
		showLocationIcons: true,
		showSkillIcons: true,
		notificationIcon: DEFAULT_FEED_NOTIFICATION_ICON,
		allowModNotificationIcon: true,
		allowModNotificationColor: true,
		suppressInventory: true,
		showLocationDiscovery: true,
		showCurrentLocation: true,
		locationDiscoveryIcon: DEFAULT_FEED_LOCATION_DISCOVERY_ICON,
		currentLocationIcon: DEFAULT_FEED_CURRENT_LOCATION_ICON,
		locationDiscoveryColor: DEFAULT_GIZMO_GOLD,
		currentLocationColor: DEFAULT_GIZMO_GOLD,
		skillIcon: DEFAULT_FEED_SKILL_ICON,
		levelIcon: DEFAULT_FEED_LEVEL_ICON,
		skillsColor: DEFAULT_GIZMO_GOLD,
		showLevelProgress: true,
		backdropColor: DEFAULT_FEED_BACKDROP_COLOR,
		backdropOpacity: DEFAULT_FEED_BACKDROP_OPACITY,
		backdropDirection: DEFAULT_FEED_BACKDROP_DIRECTION,
		icon: DEFAULT_FEED_INVENTORY_ICON
	};
	return {
		id: `gizmo_${Date.now().toString(36)}`,
		name: `Feed ${n}`,
		type: "cog-feed",
		visibility: "ui",
		x: DEFAULT_HUD_X,
		y: Math.min(0.92, DEFAULT_HUD_Y + 0.08),
		posAnchor: "tlc",
		rotation: 0,
		width: DEFAULT_FEED_WIDTH,
		height: DEFAULT_FEED_HEIGHT,
		settings,
		settingsJson: JSON.stringify(settings)
	};
}

function ensureFeedGizmo(gizmo) {
	const s = ensureGizmoSettings(gizmo);
	gizmo.x = Number.isFinite(Number(gizmo.x)) ? Number(gizmo.x) : DEFAULT_HUD_X;
	gizmo.y = Number.isFinite(Number(gizmo.y)) ? Number(gizmo.y) : DEFAULT_HUD_Y;
	gizmo.rotation = Number(gizmo.rotation) || 0;
	gizmo.width = Math.max(MIN_GIZMO_WIDTH, Number(gizmo.width) || DEFAULT_FEED_WIDTH);
	gizmo.height = Math.max(MIN_GIZMO_HEIGHT, Number(gizmo.height) || DEFAULT_FEED_HEIGHT);
	s.fontSize = Math.max(0, Number(s.fontSize) || DEFAULT_GIZMO_FONT_SIZE);
	s.textAlign = normalizeClockTextAlign(s.textAlign || DEFAULT_FEED_TEXT_ALIGN);
	s.iconPlacement = normalizeFeedIconPlacement(s.iconPlacement || DEFAULT_FEED_ICON_PLACEMENT);
	s.textColor = optionalHex(s.textColor);
	s.addColor = optionalHex(s.addColor);
	s.removeColor = optionalHex(s.removeColor);
	s.stolenColor = optionalHex(s.stolenColor);
	s.maxVisible = Math.max(1, Math.min(20, Math.round(Number(s.maxVisible) || DEFAULT_FEED_MAX)));
	s.stackOrigin = normalizeStackOrigin(s.stackOrigin || DEFAULT_FEED_STACK_ORIGIN);
	s.durationMs = Math.max(500, Math.min(60000, Number(s.durationMs) || DEFAULT_FEED_DURATION_MS));
	s.fadeMs = Math.max(0, Math.min(2000, Number(s.fadeMs) || DEFAULT_FEED_FADE_MS));
	s.showNotifications = s.showNotifications === true || s.showNotifications === "true";
	s.showInventory = s.showInventory === true || s.showInventory === "true";
	s.showLocation = s.showLocation === true || s.showLocation === "true";
	s.showActiveEffects = s.showActiveEffects === true || s.showActiveEffects === "true";
	s.showSkills = s.showSkills === true || s.showSkills === "true";
	s.effectsMinSec = Number(s.effectsMinSec);
	if (!Number.isFinite(s.effectsMinSec)) {
		s.effectsMinSec = 1;
	}
	s.effectsMinSec = Math.max(0, Math.min(600, s.effectsMinSec));
	s.effectsMaxSec = Number(s.effectsMaxSec);
	if (!Number.isFinite(s.effectsMaxSec)) {
		s.effectsMaxSec = 180;
	}
	s.effectsMaxSec = Math.max(0, Math.min(3600, s.effectsMaxSec));
	if (s.effectsMaxSec > 0 && s.effectsMinSec > s.effectsMaxSec) {
		s.effectsMinSec = s.effectsMaxSec;
	}
	s.showEffectIcons = s.showEffectIcons !== false;
	s.showEffectText = s.showEffectText !== false;
	s.showEffectTimer = s.showEffectTimer !== false;
	s.numberFormat = normalizeFeedNumberFormat(s.numberFormat);
	s.progressBarWidth = feedProgressBarWidth(s);
	s.barColor = optionalHex(s.barColor);
	s.effectIcon = normalizeFeedEffectIcon(s.effectIcon);
	s.effectsColor = optionalHex(s.effectsColor);
	s.suppressTransformEffects = s.suppressTransformEffects !== false;
	if (!s.showEffectIcons && !s.showEffectText && !s.showEffectTimer) {
		s.showEffectText = true;
	}
	s.showNotificationIcons = s.showNotificationIcons !== false;
	s.showInventoryIcons = s.showInventoryIcons !== false;
	s.showLocationIcons = s.showLocationIcons !== false;
	s.showSkillIcons = s.showSkillIcons !== false;
	s.notificationIcon = normalizeFeedNotificationIcon(s.notificationIcon);
	s.allowModNotificationIcon = s.allowModNotificationIcon !== false;
	s.allowModNotificationColor = s.allowModNotificationColor !== false;
	s.suppressInventory = s.suppressInventory !== false;
	s.showLocationDiscovery = s.showLocationDiscovery !== false;
	s.showCurrentLocation = s.showCurrentLocation !== false;
	s.locationDiscoveryIcon = normalizeFeedLocationDiscoveryIcon(s.locationDiscoveryIcon);
	s.currentLocationIcon = normalizeFeedCurrentLocationIcon(s.currentLocationIcon);
	s.locationDiscoveryColor = optionalHex(s.locationDiscoveryColor);
	s.currentLocationColor = optionalHex(s.currentLocationColor);
	s.skillIcon = normalizeFeedSkillIcon(s.skillIcon);
	s.levelIcon = normalizeFeedLevelIcon(s.levelIcon);
	s.skillsColor = optionalHex(s.skillsColor);
	s.showLevelProgress = s.showLevelProgress !== false;
	s.backdropColor = optionalHex(s.backdropColor);
	s.backdropOpacity = Math.max(
		0,
		Math.min(
			100,
			Number.isFinite(Number(s.backdropOpacity)) ? Number(s.backdropOpacity) : DEFAULT_FEED_BACKDROP_OPACITY
		)
	);
	s.backdropDirection = normalizeFeedBackdropDirection(s.backdropDirection || DEFAULT_FEED_BACKDROP_DIRECTION);
	s.icon = normalizeFeedInventoryIcon(s.icon);
	gizmo.posAnchor = "tlc";
	gizmo.type = "cog-feed";
	// Missing visibility → type default (cog-feed→ui), not a hard-coded coerce of "hud".
	gizmo.visibility = coalesceGizmoVisibility(gizmo, "cog-feed");
	gizmo.settings = s;
	gizmo.settingsJson = JSON.stringify(s);
	return gizmo;
}

function addFeedGizmo() {
	placeNewGizmo(defaultFeedGizmo(nextGizmoTypeIndex("cog-feed")));
}

/** Shared message histories for all feed gizmos. */
let notificationFeedLines = [];
let notificationFeedSeq = 1;
let inventoryFeedLines = [];
let inventoryFeedSeq = 1;
let locationFeedLines = [];
let locationFeedSeq = 1;
let skillFeedLines = [];
let skillFeedSeq = 1;
/** Live character level progress for Skills section (sticky line). */
let levelProgressLive = null;
/** Timed active effects: live map + fading leftovers after expiry. */
let activeEffectLive = new Map();
let activeEffectFading = new Map();

function normalizeFeedNumberFormat(value) {
	const raw = String(value || "").trim();
	return NUMBER_FORMATS.includes(raw) ? raw : DEFAULT_FEED_NUMBER_FORMAT;
}

function formatEffectRemaining(seconds) {
	const s = Math.max(0, Math.floor(Number(seconds) || 0));
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${String(r).padStart(2, "0")}`;
}

function formatFeedEffectValue(line, asTotal) {
	if (asTotal) {
		return formatEffectRemaining(line && line.remaining);
	}
	return `${Math.round(Number(line && line.percent) || 0)}%`;
}

function formatFeedLevelProgressValue(line, asTotal) {
	if (asTotal) {
		const xp = Math.round(Number(line && line.xp) || 0);
		const thr = Math.max(1, Math.round(Number(line && line.threshold) || 1));
		return `${xp}/${thr}`;
	}
	return `${Math.round(Number(line && line.percent) || 0)}%`;
}

function feedProgressBarWidth(settings) {
	const s = settings || {};
	const raw = Number(s.progressBarWidth) || DEFAULT_FEED_PROGRESS_BAR_WIDTH;
	return Math.max(5, Math.min(100, raw));
}

function effectPassesTimeWindow(effect, gizmo, opts) {
	const fading = !!(opts && opts.fading);
	let minS = Number(gizmo && gizmo.settings.effectsMinSec);
	if (!Number.isFinite(minS)) {
		minS = 1;
	}
	let maxS = Number(gizmo && gizmo.settings.effectsMaxSec);
	if (!Number.isFinite(maxS)) {
		maxS = 0;
	}
	const duration = Number(effect && effect.duration);
	// Short-lived effects (e.g. bleed FX) should never appear — including as a 0s fade.
	if (minS > 0 && Number.isFinite(duration) && duration > 0 && duration < minS) {
		return false;
	}
	if (fading) {
		return true;
	}
	const remaining = Number(effect && effect.remaining);
	if (!Number.isFinite(remaining)) {
		return false;
	}
	if (minS > 0 && remaining < minS) {
		return false;
	}
	if (maxS > 0 && remaining > maxS) {
		return false;
	}
	return true;
}

window.applyActiveEffects = (jsonStr) => {
	try {
		const now = performance.now();
		const list = typeof jsonStr === "string" ? JSON.parse(jsonStr || "[]") : jsonStr;
		const next = new Map();
		if (Array.isArray(list)) {
			for (const raw of list) {
				if (!raw || raw.id == null) {
					continue;
				}
				const id = String(raw.id);
				const duration = Number(raw.duration) || 0;
				const elapsed = Number(raw.elapsed) || 0;
				const remaining =
					Number.isFinite(Number(raw.remaining)) ? Number(raw.remaining) : duration - elapsed;
				const percent = Number.isFinite(Number(raw.percent))
					? Number(raw.percent)
					: duration > 0
						? Math.max(0, Math.min(100, (remaining / duration) * 100))
						: 0;
				next.set(id, {
					id,
					name: String(raw.name || "Effect"),
					duration,
					elapsed,
					remaining,
					percent,
					icon: normalizeIconRelPath(raw.icon) || "",
					transform: raw.transform === true,
					seenAt: now
				});
				activeEffectFading.delete(id);
			}
		}
		for (const [id, prev] of activeEffectLive) {
			if (!next.has(id) && !activeEffectFading.has(id)) {
				activeEffectFading.set(id, { ...prev, removedAt: now });
			}
		}
		activeEffectLive = next;
		const fadeCap = 4000;
		for (const [id, entry] of [...activeEffectFading]) {
			if (now - entry.removedAt > fadeCap) {
				activeEffectFading.delete(id);
			}
		}
		paintAllFeeds();
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("applyActiveEffects", e);
		} else {
			console.error("applyActiveEffects", e);
		}
	}
};

const NOTIFICATION_FEED_PREVIEW_DEMO_COLOR = "#c4a35a";
const NOTIFICATION_FEED_PREVIEW_DEMO_ICON = "Actions/shout.svg";

function notificationFeedPreviewSamples(gizmo) {
	const allowIcon = gizmo.settings.allowModNotificationIcon !== false;
	const allowColor = gizmo.settings.allowModNotificationColor !== false;
	const showIcons = gizmo.settings.showNotificationIcons === true;

	const samples = [
		{ text: "Something happened.", color: "", icon: "" },
		{ text: "A second notice fades soon.", color: "", icon: "" }
	];

	let showcaseColor = "";
	let showcaseIcon = "";
	let text = "Using feed defaults.";
	if (allowColor && allowIcon && showIcons) {
		showcaseColor = NOTIFICATION_FEED_PREVIEW_DEMO_COLOR;
		showcaseIcon = NOTIFICATION_FEED_PREVIEW_DEMO_ICON;
		text = "Mod colour and icon applied.";
	} else if (allowColor && showIcons) {
		showcaseColor = NOTIFICATION_FEED_PREVIEW_DEMO_COLOR;
		text = "Mod colour applied; default icon.";
	} else if (allowColor && allowIcon) {
		showcaseColor = NOTIFICATION_FEED_PREVIEW_DEMO_COLOR;
		showcaseIcon = NOTIFICATION_FEED_PREVIEW_DEMO_ICON;
		text = "Mod colour applied (icons off).";
	} else if (allowColor) {
		showcaseColor = NOTIFICATION_FEED_PREVIEW_DEMO_COLOR;
		text = "Mod colour applied.";
	} else if (allowIcon && showIcons) {
		showcaseIcon = NOTIFICATION_FEED_PREVIEW_DEMO_ICON;
		text = "Mod icon applied; default colour.";
	} else if (allowIcon) {
		showcaseIcon = NOTIFICATION_FEED_PREVIEW_DEMO_ICON;
		text = "Mod icon ready (icons off).";
	} else if (showIcons) {
		text = "Feed defaults with icons on.";
	}

	samples.push({
		text,
		color: showcaseColor,
		icon: showcaseIcon
	});
	return samples;
}

const INVENTORY_FEED_PREVIEW = [
	{ name: "Cabbage", count: 7, added: false, stolen: false, icon: DEFAULT_FEED_INVENTORY_ICON },
	{ name: "Iron Arrow", count: 24, added: true, stolen: false, icon: DEFAULT_FEED_INVENTORY_ICON },
	{ name: "Silver Ring", count: 1, added: true, stolen: true, icon: DEFAULT_FEED_INVENTORY_ICON }
];

const LOCATION_FEED_PREVIEW = [
	{ text: "Whiterun discovered.", kind: "discovery" },
	{ text: "Whiterun", kind: "current" }
];

const ACTIVE_EFFECT_FEED_PREVIEW = [
	{
		id: "preview-e-0",
		name: "Fortify Health",
		duration: 60,
		elapsed: 18,
		remaining: 42,
		percent: 70,
		demo: true
	},
	{
		id: "preview-e-1",
		name: "Restore Magicka",
		duration: 30,
		elapsed: 22,
		remaining: 8,
		percent: 26.7,
		demo: true
	}
];

const SKILL_FEED_PREVIEW = [
	{
		id: "preview-s-0",
		text: "One-Handed increased to 42",
		kind: "skill",
		icon: "",
		skillName: "One-Handed",
		demo: true
	},
	{
		id: "preview-s-1",
		text: "Level Up",
		kind: "level",
		icon: "",
		skillName: "",
		demo: true
	}
];

function feedGizmoMaxDuration() {
	const fallback = DEFAULT_FEED_DURATION_MS + DEFAULT_FEED_FADE_MS * 2;
	let max = fallback;
	for (const z of snapshot.gizmos || []) {
		if (normalizeGizmoType(z.type) !== "cog-feed") {
			continue;
		}
		// Settings are normalized on load / editor patch — do not ensure on the prune path.
		const hold = Number(z.settings?.durationMs);
		const fade = Number(z.settings?.fadeMs);
		const life =
			(Number.isFinite(hold) ? hold : DEFAULT_FEED_DURATION_MS) +
			(Number.isFinite(fade) ? fade : DEFAULT_FEED_FADE_MS) * 2 +
			500;
		if (Number.isFinite(life) && life > max) {
			max = life;
		}
	}
	return max;
}

function pruneFeedLineRing(lines, now) {
	const maxDuration = feedGizmoMaxDuration();
	const next = lines.filter((line) => now - line.addedAt < maxDuration + 2000);
	while (next.length > 64) {
		next.shift();
	}
	return next;
}

function enqueueNotificationFeedLine(text, color, id, icon, opts) {
	const now = performance.now();
	const entry = {
		id: id != null ? Number(id) : notificationFeedSeq++,
		text: String(text || "").trim(),
		color: optionalHex(color) || "",
		icon: normalizeIconRelPath(icon) || "",
		addedAt: now
	};
	if (!entry.text) {
		return;
	}
	notificationFeedLines.push(entry);
	notificationFeedLines = pruneFeedLineRing(notificationFeedLines, now);
	if (!opts || opts.paint !== false) {
		paintAllFeeds();
	}
}

function formatInventoryChangeText(count, added) {
	const n = Math.abs(Math.round(Number(count) || 0));
	return added ? `(+${n})` : `(-${n})`;
}

function enqueueInventoryFeedLine(name, count, added, icon, id, stolen, opts) {
	const now = performance.now();
	const entry = {
		id: id != null ? Number(id) : inventoryFeedSeq++,
		name: String(name || "").trim(),
		count: Math.abs(Math.round(Number(count) || 0)),
		added: added !== false,
		stolen: added !== false && stolen === true,
		icon: normalizeIconRelPath(icon) || "",
		addedAt: now
	};
	if (!entry.name) {
		return;
	}
	inventoryFeedLines.push(entry);
	inventoryFeedLines = pruneFeedLineRing(inventoryFeedLines, now);
	if (!opts || opts.paint !== false) {
		paintAllFeeds();
	}
}

function enqueueLocationFeedLine(text, kind, id, icon, opts) {
	const now = performance.now();
	const entry = {
		id: id != null ? Number(id) : locationFeedSeq++,
		text: String(text || "").trim(),
		kind: normalizeLocationKind(kind),
		icon: normalizeIconRelPath(icon) || "",
		addedAt: now
	};
	if (!entry.text) {
		return;
	}
	locationFeedLines.push(entry);
	locationFeedLines = pruneFeedLineRing(locationFeedLines, now);
	if (!opts || opts.paint !== false) {
		paintAllFeeds();
	}
}

function enqueueSkillFeedLine(text, kind, icon, skillName, id, opts) {
	const now = performance.now();
	const entry = {
		id: id != null ? Number(id) : skillFeedSeq++,
		text: String(text || "").trim(),
		kind: normalizeSkillKind(kind),
		icon: normalizeIconRelPath(icon) || "",
		skillName: String(skillName || "").trim(),
		addedAt: now
	};
	if (!entry.text) {
		return;
	}
	skillFeedLines.push(entry);
	skillFeedLines = pruneFeedLineRing(skillFeedLines, now);
	if (!opts || opts.paint !== false) {
		paintAllFeeds();
	}
}

window.applyLevelProgress = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr || "{}") : jsonStr;
		if (!incoming || typeof incoming !== "object") {
			levelProgressLive = null;
			paintAllFeeds();
			return;
		}
		const level = Math.max(1, Math.round(Number(incoming.level) || 1));
		const xp = Number(incoming.xp);
		const threshold = Number(incoming.threshold);
		let progress = Number(incoming.progress);
		if (!Number.isFinite(progress)) {
			progress =
				Number.isFinite(xp) && Number.isFinite(threshold) && threshold > 0 ? xp / threshold : 0;
		}
		progress = Math.max(0, Math.min(1, progress));
		levelProgressLive = {
			level,
			xp: Number.isFinite(xp) ? xp : 0,
			threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 1,
			progress,
			percent: progress * 100
		};
		paintAllFeeds();
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("applyLevelProgress", e);
		} else {
			console.error("applyLevelProgress", e);
		}
	}
};

window.applyFeedEvents = (jsonStr) => {
	try {
		const list = typeof jsonStr === "string" ? JSON.parse(jsonStr || "[]") : jsonStr;
		const noPaint = { paint: false };
		if (Array.isArray(list)) {
			for (const incoming of list) {
				if (!incoming || typeof incoming !== "object") {
					continue;
				}
				const channel = String(incoming.channel || "").toLowerCase();
				if (channel === "notification") {
					enqueueNotificationFeedLine(
						incoming.text,
						incoming.color,
						incoming.id,
						incoming.icon,
						noPaint
					);
				} else if (channel === "inventory") {
					enqueueInventoryFeedLine(
						incoming.name,
						incoming.count,
						incoming.added,
						incoming.icon,
						incoming.id,
						incoming.stolen,
						noPaint
					);
				} else if (channel === "location") {
					enqueueLocationFeedLine(
						incoming.text,
						incoming.kind,
						incoming.id,
						incoming.icon,
						noPaint
					);
				} else if (channel === "skill" || channel === "skills") {
					enqueueSkillFeedLine(
						incoming.text,
						incoming.kind,
						incoming.icon,
						incoming.skillName,
						incoming.id,
						noPaint
					);
				}
			}
		}
		paintAllFeeds();
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("applyFeedEvents", e);
		} else {
			console.error("applyFeedEvents", e);
		}
	}
};

window.pushNotification = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		if (!incoming || typeof incoming !== "object") {
			return;
		}
		enqueueNotificationFeedLine(incoming.text, incoming.color, incoming.id, incoming.icon);
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("pushNotification", e);
		} else {
			console.error("pushNotification", e);
		}
	}
};

window.pushInventory = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		if (!incoming || typeof incoming !== "object") {
			return;
		}
		enqueueInventoryFeedLine(
			incoming.name,
			incoming.count,
			incoming.added,
			incoming.icon,
			incoming.id,
			incoming.stolen
		);
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("pushInventory", e);
		} else {
			console.error("pushInventory", e);
		}
	}
};

window.pushLocation = (jsonStr) => {
	try {
		const incoming = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
		if (!incoming || typeof incoming !== "object") {
			return;
		}
		enqueueLocationFeedLine(incoming.text, incoming.kind, incoming.id, incoming.icon);
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("pushLocation", e);
		} else {
			console.error("pushLocation", e);
		}
	}
};

function feedLineOpacity(line, gizmo, now) {
	const fadeMs = Number(gizmo.settings && gizmo.settings.fadeMs);
	const holdMs = Number(gizmo.settings && gizmo.settings.durationMs);
	const fade = Math.max(1, Number.isFinite(fadeMs) ? fadeMs : DEFAULT_FEED_FADE_MS);
	const hold = Number.isFinite(holdMs) ? holdMs : DEFAULT_FEED_DURATION_MS;
	if (line.kind === "effect") {
		if (line.active) {
			return 1;
		}
		const age = now - (line.removedAt || now);
		if (age >= fade) {
			return 0;
		}
		return 1 - age / fade;
	}
	const age = now - line.addedAt;
	if (age < fade) {
		return age / fade;
	}
	if (age < fade + hold) {
		return 1;
	}
	const outAge = age - fade - hold;
	if (outAge >= fade) {
		return 0;
	}
	return 1 - outAge / fade;
}

function feedVisibleLines(gizmo, now, preview) {
	// Settings are ensured on load / editor patch — paint trust them (B2).
	const fadeMs = Number(gizmo.settings && gizmo.settings.fadeMs);
	const holdMs = Number(gizmo.settings && gizmo.settings.durationMs);
	const fade = Number.isFinite(fadeMs) ? fadeMs : DEFAULT_FEED_FADE_MS;
	const hold = Number.isFinite(holdMs) ? holdMs : DEFAULT_FEED_DURATION_MS;
	const life = hold + fade * 2;
	const editorOpen = preview || document.body.classList.contains("is-focused");
	const holdAge = fade + Math.min(250, Math.max(0, hold * 0.25));
	const merged = [];


	if (gizmo.settings.showNotifications) {
		let source = notificationFeedLines;
		if (editorOpen) {
			const aliveReal = notificationFeedLines.filter((line) => now - line.addedAt < life);
			if (!aliveReal.length) {
				source = notificationFeedPreviewSamples(gizmo).map((sample, i) => ({
					id: `preview-n-${i}`,
					text: sample.text,
					color: sample.color,
					icon: sample.icon || "",
					demo: true,
					addedAt: now - holdAge - i
				}));
			} else {
				source = aliveReal;
			}
		}
		for (const line of source) {
			if (!line.demo && now - line.addedAt >= life) {
				continue;
			}
			merged.push({
				kind: "notification",
				key: `n-${line.id}`,
				id: line.id,
				text: line.text,
				color: line.color,
				icon: line.icon || "",
				demo: line.demo === true,
				addedAt: line.addedAt
			});
		}
	}


	if (gizmo.settings.showInventory) {
		let source = inventoryFeedLines;
		if (editorOpen) {
			const aliveReal = inventoryFeedLines.filter((line) => now - line.addedAt < life);
			if (!aliveReal.length) {
				source = INVENTORY_FEED_PREVIEW.map((sample, i) => ({
					id: `preview-i-${i}`,
					name: sample.name,
					count: sample.count,
					added: sample.added,
					stolen: sample.stolen === true,
					icon: sample.icon,
					demo: true,
					addedAt: now - holdAge - i
				}));
			} else {
				source = aliveReal;
			}
		}
		for (const line of source) {
			if (!line.demo && now - line.addedAt >= life) {
				continue;
			}
			merged.push({
				kind: "inventory",
				key: `i-${line.id}`,
				id: line.id,
				name: line.name,
				count: line.count,
				added: line.added,
				stolen: line.stolen === true,
				icon: line.icon || "",
				demo: line.demo === true,
				addedAt: line.addedAt
			});
		}
	}


	if (gizmo.settings.showLocation) {
		let source = locationFeedLines;
		if (editorOpen) {
			const aliveReal = locationFeedLines.filter((line) => now - line.addedAt < life);
			if (!aliveReal.length) {
				source = LOCATION_FEED_PREVIEW.filter((sample) => {
					if (sample.kind === "discovery") {
						return gizmo.settings.showLocationDiscovery !== false;
					}
					return gizmo.settings.showCurrentLocation !== false;
				}).map((sample, i) => ({
					id: `preview-l-${i}`,
					text: sample.text,
					kind: sample.kind,
					demo: true,
					addedAt: now - holdAge - i
				}));
			} else {
				source = aliveReal;
			}
		}
		for (const line of source) {
			if (!line.demo && now - line.addedAt >= life) {
				continue;
			}
			const locKind = normalizeLocationKind(line.kind);
			if (locKind === "discovery" && gizmo.settings.showLocationDiscovery === false) {
				continue;
			}
			if (locKind === "current" && gizmo.settings.showCurrentLocation === false) {
				continue;
			}
			merged.push({
				kind: "location",
				key: `l-${line.id}`,
				id: line.id,
				text: line.text,
				locationKind: locKind,
				icon: line.icon || "",
				demo: line.demo === true,
				addedAt: line.addedAt
			});
		}
	}


	if (gizmo.settings.showActiveEffects) {
		const effectFade = Math.max(1, fade);
		const pushEffect = (effect, active) => {
			const isDemo = effect && effect.demo === true;
			// Editor demos ignore min/max window and transform suppress so the section
			// stays visible while tuning filters with the menu open.
			if (!isDemo) {
				if (!effectPassesTimeWindow(effect, gizmo, { fading: !active })) {
					return;
				}
				if (gizmo.settings.suppressTransformEffects !== false && effect.transform) {
					return;
				}
			}
			const remaining = Number(effect.remaining) || 0;
			merged.push({
				kind: "effect",
				key: `e-${effect.id}`,
				id: effect.id,
				name: effect.name || "Effect",
				duration: effect.duration,
				elapsed: effect.elapsed,
				remaining,
				percent: Number(effect.percent) || 0,
				icon: normalizeIconRelPath(effect.icon) || "",
				transform: effect.transform === true,
				active,
				demo: isDemo,
				removedAt: active ? 0 : effect.removedAt,
				addedAt: now - Math.max(0, remaining) * 1000
			});
		};
		let liveSource = [...activeEffectLive.values()];
		let usingDemos = false;
		if (editorOpen) {
			// C++ may push short/transform effects that all fail the display filters.
			// Treat "nothing displayable" like empty so editor demos stick (GOG-heavy saves).
			const displayable = liveSource.filter((e) => {
				if (gizmo.settings.suppressTransformEffects !== false && e.transform) {
					return false;
				}
				return effectPassesTimeWindow(e, gizmo);
			});
			if (!displayable.length) {
				liveSource = ACTIVE_EFFECT_FEED_PREVIEW;
				usingDemos = true;
			} else {
				liveSource = displayable;
			}
		}
		for (const effect of liveSource) {
			pushEffect(effect, true);
		}
		// Do not mix fading leftovers with demos (ghost bars beside Fortify/Restore).
		if (!usingDemos) {
			for (const effect of activeEffectFading.values()) {
				if (now - effect.removedAt >= effectFade) {
					continue;
				}
				pushEffect(effect, false);
			}
		}
	}

	if (gizmo.settings.showSkills) {
		let source = skillFeedLines;
		if (editorOpen) {
			const aliveReal = skillFeedLines.filter((line) => now - line.addedAt < life);
			if (!aliveReal.length) {
				source = SKILL_FEED_PREVIEW.map((sample, i) => ({
					...sample,
					demo: true,
					addedAt: now - holdAge - i
				}));
			} else {
				source = aliveReal;
			}
		}
		for (const line of source) {
			if (!line.demo && now - line.addedAt >= life) {
				continue;
			}
			merged.push({
				kind: "skill",
				key: `s-${line.id}`,
				id: line.id,
				text: line.text,
				skillKind: normalizeSkillKind(line.kind),
				icon: line.icon || "",
				skillName: line.skillName || "",
				demo: line.demo === true,
				addedAt: line.addedAt
			});
		}
	}

	merged.sort((a, b) => a.addedAt - b.addedAt || String(a.key).localeCompare(String(b.key)));

	// Level progress is a normal line: insert beside the newest skill, then apply maxVisible.
	if (gizmo.settings.showSkills && gizmo.settings.showLevelProgress !== false) {
		let newestSkillIdx = -1;
		let newestAt = -Infinity;
		for (let i = 0; i < merged.length; i++) {
			if (merged[i].kind === "skill" && merged[i].addedAt >= newestAt) {
				newestAt = merged[i].addedAt;
				newestSkillIdx = i;
			}
		}
		if (newestSkillIdx >= 0) {
			let progress = levelProgressLive;
			if (editorOpen && !progress) {
				progress = { level: 12, xp: 45, threshold: 100, progress: 0.45, percent: 45 };
			}
			if (!progress) {
				progress = { level: 1, xp: 0, threshold: 1, progress: 0, percent: 0 };
			}
			const skillLine = merged[newestSkillIdx];
			merged.splice(newestSkillIdx + 1, 0, {
				kind: "level-progress",
				key: "level-progress",
				id: "level-progress",
				name: `Level ${progress.level}`,
				percent: Number(progress.percent) || progress.progress * 100 || 0,
				progress: Number(progress.progress) || 0,
				xp: Number(progress.xp) || 0,
				threshold: Number(progress.threshold) || 1,
				demo: skillLine.demo === true || (editorOpen && !levelProgressLive),
				addedAt: skillLine.addedAt
			});
		}
	}

	const max = gizmo.settings.maxVisible;
	const stack = normalizeStackOrigin(gizmo.settings.stackOrigin);
	const slice = merged.slice(-max);
	return stack === "bottom" ? slice : slice.slice().reverse();
}

function rebuildInventoryLineContent(content, showIcons, iconPlacement) {
	content.replaceChildren();
	const place = normalizeFeedIconPlacement(iconPlacement);
	content.dataset.showIcons = showIcons ? "1" : "0";
	content.dataset.iconPlacement = place;

	const appendIcon = () => {
		const host = document.createElement("div");
		host.className = "inventory-line-icon";
		host.dataset.slot = "icon";
		content.appendChild(host);
	};
	const appendNameThenTotal = () => {
		const text = document.createElement("div");
		text.className = "inventory-line-text";
		text.dataset.slot = "text";
		content.appendChild(text);
		const change = document.createElement("div");
		change.className = "inventory-line-change";
		change.dataset.slot = "change";
		content.appendChild(change);
	};

	if (showIcons && place === "left") {
		appendIcon();
	}
	appendNameThenTotal();
	if (showIcons && place === "right") {
		appendIcon();
	}
}

function rebuildNotificationLineContent(row, showIcons, iconPlacement) {
	const backdrop = row.querySelector(".notification-line-backdrop") || document.createElement("div");
	backdrop.className = "notification-line-backdrop";
	row.replaceChildren();
	row.appendChild(backdrop);
	const place = normalizeFeedIconPlacement(iconPlacement);
	row.dataset.showIcons = showIcons ? "1" : "0";
	row.dataset.iconPlacement = place;
	if (showIcons) {
		const content = document.createElement("div");
		content.className = "notification-line-content";
		const icon = document.createElement("div");
		icon.className = "notification-line-icon";
		const text = document.createElement("div");
		text.className = "notification-line-text";
		if (place === "right") {
			content.appendChild(text);
			content.appendChild(icon);
		} else {
			content.appendChild(icon);
			content.appendChild(text);
		}
		row.appendChild(content);
	} else {
		const text = document.createElement("div");
		text.className = "notification-line-text";
		row.appendChild(text);
	}
}

/**
 * Shared DOM for effect / level-progress meter lines.
 * opts.showIcons, opts.showText — chrome visibility
 * opts.enableMeter — when false, skip bar/value entirely (effects honor showEffectTimer)
 * opts.layoutFlags — first three fingerprint slots (preserve prior effect vs level keys)
 */
function rebuildFeedMeterLineContent(row, gizmo, opts) {
	opts = opts || {};
	const showIcons = !!opts.showIcons;
	const showText = opts.showText !== false;
	const enableMeter = opts.enableMeter !== false;
	const numberFormat = normalizeFeedNumberFormat(gizmo.settings.numberFormat);
	const showBar = enableMeter && numberFormatShowsBar(numberFormat);
	const showValue = enableMeter && numberFormatShowsValue(numberFormat);
	const barWidth = feedProgressBarWidth(gizmo.settings);
	const place = normalizeFeedIconPlacement(gizmo.settings.iconPlacement);
	const layoutFlags = Array.isArray(opts.layoutFlags)
		? opts.layoutFlags
		: [showIcons ? "1" : "0", showText ? "1" : "0", enableMeter ? "1" : "0"];

	const backdrop = row.querySelector(".notification-line-backdrop") || document.createElement("div");
	backdrop.className = "notification-line-backdrop";
	row.replaceChildren();
	row.appendChild(backdrop);
	row.dataset.effectLayout = [...layoutFlags, numberFormat, String(barWidth), place].join("|");

	const content = document.createElement("div");
	content.className = "effect-line-content";

	const appendIcon = () => {
		const icon = document.createElement("div");
		icon.className = "notification-line-icon effect-line-icon";
		content.appendChild(icon);
	};
	const appendText = () => {
		const name = document.createElement("div");
		name.className = "notification-line-text effect-line-name";
		content.appendChild(name);
	};
	const appendMeter = () => {
		if (showBar) {
			const bar = document.createElement("div");
			bar.className = "gear-bar has-trough effect-line-bar" + (showValue ? " has-value" : "");
			bar.style.setProperty("--effect-bar-width", `${barWidth}%`);
			const clip = document.createElement("div");
			clip.className = "gear-bar-clip";
			const fill = document.createElement("div");
			fill.className = "gear-bar-fill";
			const sheen = document.createElement("div");
			sheen.className = "gear-bar-sheen";
			fill.appendChild(sheen);
			clip.appendChild(fill);
			bar.appendChild(clip);
			if (showValue) {
				const value = document.createElement("div");
				value.className = "gear-value effect-line-timer";
				bar.appendChild(value);
			}
			content.appendChild(bar);
		} else if (showValue) {
			const value = document.createElement("div");
			value.className = "effect-line-timer";
			content.appendChild(value);
		}
	};

	if (showIcons && place !== "right") {
		appendIcon();
	}
	if (showText) {
		appendText();
	}
	if (enableMeter) {
		appendMeter();
	}
	if (showIcons && place === "right") {
		appendIcon();
	}
	row.appendChild(content);
}

function rebuildEffectLineContent(row, gizmo) {
	const showIcons = gizmo.settings.showEffectIcons === true;
	const showText = gizmo.settings.showEffectText !== false;
	const showTimer = gizmo.settings.showEffectTimer !== false;
	rebuildFeedMeterLineContent(row, gizmo, {
		showIcons,
		showText,
		enableMeter: showTimer,
		layoutFlags: [showIcons ? "1" : "0", showText ? "1" : "0", showTimer ? "1" : "0"]
	});
}

function rebuildLevelProgressLineContent(row, gizmo) {
	const showIcons = gizmo.settings.showSkillIcons === true;
	const numberFormat = normalizeFeedNumberFormat(gizmo.settings.numberFormat);
	const showBar = numberFormatShowsBar(numberFormat);
	rebuildFeedMeterLineContent(row, gizmo, {
		showIcons,
		showText: true,
		enableMeter: true,
		layoutFlags: [showIcons ? "1" : "0", "1", showBar ? "1" : "0"]
	});
}

function layoutGizmoFeed(el, gizmo) {
	// Settings/geometry are ensured on load / editor patch — layout trusts them (B2).
	// Avoid gizmoLayoutBox() here: it calls ensureGizmo and would re-normalize every sync.
	const w = Math.max(MIN_GIZMO_WIDTH, Number(gizmo.width) || DEFAULT_FEED_WIDTH);
	const h = Math.max(MIN_GIZMO_HEIGHT, Number(gizmo.height) || DEFAULT_FEED_HEIGHT);
	const css = hudItemLayoutCss(gizmo, w, h);
	el.style.width = `${w}px`;
	el.style.height = `${h}px`;
	el.style.left = `${css.x * 100}%`;
	el.style.top = `${css.y * 100}%`;
	el.style.transform = `rotate(${Number(gizmo.rotation) || 0}deg)`;
	el.style.transformOrigin = "50% 50%";
	const font = Math.max(8, Math.round((gizmo.settings && gizmo.settings.fontSize) || DEFAULT_GIZMO_FONT_SIZE));
	el.style.setProperty("--feed-font", `${font}px`);
	el.style.setProperty(
		"--feed-default-color",
		normalizeHexColor(gizmo.settings && gizmo.settings.textColor, DEFAULT_GIZMO_GOLD)
	);
	const align = normalizeClockTextAlign((gizmo.settings && gizmo.settings.textAlign) || DEFAULT_FEED_TEXT_ALIGN);
	el.classList.toggle("is-align-left", align === "left");
	el.classList.toggle("is-align-center", align === "center");
	el.classList.toggle("is-align-right", align === "right");
	const stack = normalizeStackOrigin((gizmo.settings && gizmo.settings.stackOrigin) || DEFAULT_FEED_STACK_ORIGIN);
	el.classList.toggle("is-stack-bottom", stack === "bottom");
	el.classList.toggle("is-stack-top", stack !== "bottom");
}

function paintGizmoFeed(el, gizmo) {
	// Settings are ensured on load / editor patch — paint trusts them (B2).
	const stack = el.querySelector(".feed-stack");
	if (!stack) {
		return;
	}
	const now = performance.now();
	const preview = document.body.classList.contains("is-focused");
	const lines = feedVisibleLines(gizmo, now, preview);
	const notifDefault = normalizeHexColor(gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
	const addPaint = normalizeHexColor(gizmo.settings.addColor || gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
	const removePaint = normalizeHexColor(gizmo.settings.removeColor || gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
	const stolenPaint = normalizeHexColor(gizmo.settings.stolenColor || gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
	const fallbackInvIcon = normalizeIconRelPath(gizmo.settings.icon) || DEFAULT_FEED_INVENTORY_ICON;
	const fallbackNotifIcon = normalizeFeedNotificationIcon(gizmo.settings.notificationIcon);
	const discoveryIcon = normalizeFeedLocationDiscoveryIcon(gizmo.settings.locationDiscoveryIcon);
	const currentIcon = normalizeFeedCurrentLocationIcon(gizmo.settings.currentLocationIcon);
	const discoveryPaint = normalizeHexColor(
		gizmo.settings.locationDiscoveryColor || gizmo.settings.textColor,
		DEFAULT_GIZMO_GOLD
	);
	const currentPaint = normalizeHexColor(
		gizmo.settings.currentLocationColor || gizmo.settings.textColor,
		DEFAULT_GIZMO_GOLD
	);
	const showNotifIcons = gizmo.settings.showNotificationIcons === true;
	const showInvIcons = gizmo.settings.showInventoryIcons === true;
	const showLocIcons = gizmo.settings.showLocationIcons === true;
	const showSkillIcons = gizmo.settings.showSkillIcons === true;
	const iconPlace = normalizeFeedIconPlacement(gizmo.settings.iconPlacement);
	const showEffectIcons = gizmo.settings.showEffectIcons === true;
	const showEffectText = gizmo.settings.showEffectText !== false;
	const showEffectTimer = gizmo.settings.showEffectTimer !== false;
	const numberFormat = normalizeFeedNumberFormat(gizmo.settings.numberFormat);
	const progressBarWidth = feedProgressBarWidth(gizmo.settings);
	const showProgressBar = numberFormatShowsBar(numberFormat);
	const showProgressTotal = numberFormatShowsTotal(numberFormat);
	const effectLayoutKey = [
		showEffectIcons ? "1" : "0",
		showEffectText ? "1" : "0",
		showEffectTimer ? "1" : "0",
		numberFormat,
		String(progressBarWidth),
		iconPlace
	].join("|");
	const progressLayoutKey = [
		showSkillIcons ? "1" : "0",
		"1",
		showProgressBar ? "1" : "0",
		numberFormat,
		String(progressBarWidth),
		iconPlace
	].join("|");
	const fallbackEffectIcon = normalizeFeedEffectIcon(gizmo.settings.effectIcon);
	const fallbackSkillIcon = normalizeFeedSkillIcon(gizmo.settings.skillIcon);
	const fallbackLevelIcon = normalizeFeedLevelIcon(gizmo.settings.levelIcon);
	const effectsPaint = normalizeHexColor(gizmo.settings.effectsColor || gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
	const skillsPaint = normalizeHexColor(gizmo.settings.skillsColor || gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
	const fillColor = normalizeHexColor(
		optionalHex(gizmo.settings.barColor) ||
			(snapshot.general && snapshot.general.fillColor) ||
			"",
		typeof defaultFillColor === "function" ? defaultFillColor() : DEFAULT_GIZMO_GOLD
	);
	const existing = new Map();
	for (const child of [...stack.children]) {
		existing.set(String(child.dataset.lineId), child);
	}
	const keep = new Set();
	for (const line of lines) {
		const key = String(line.key);
		keep.add(key);
		let row = existing.get(key);
		const wantKind = line.kind;
		if (row && row.dataset.lineKind !== wantKind) {
			row.remove();
			existing.delete(key);
			row = null;
		}
		if (wantKind === "notification" || wantKind === "location") {
			const showIcons = wantKind === "location" ? showLocIcons : showNotifIcons;
			const needsRebuild =
				!row ||
				row.dataset.showIcons !== (showIcons ? "1" : "0") ||
				row.dataset.iconPlacement !== iconPlace;
			if (row && needsRebuild) {
				rebuildNotificationLineContent(row, showIcons, iconPlace);
			}
			if (!row) {
				row = document.createElement("div");
				row.className = "notification-line";
				row.dataset.lineId = key;
				row.dataset.lineKind = wantKind;
				rebuildNotificationLineContent(row, showIcons, iconPlace);
				stack.appendChild(row);
			}
			const paint =
				wantKind === "location"
					? line.locationKind === "current"
						? currentPaint
						: discoveryPaint
					: gizmo.settings.allowModNotificationColor !== false && line.color
						? line.color
						: notifDefault;
			const textEl = row.querySelector(".notification-line-text");
			if (textEl) {
				setNotificationRichText(textEl, line.text, paint);
			}
			if (showIcons) {
				const iconHost = row.querySelector(".notification-line-icon");
				if (iconHost) {
					let iconRel = fallbackNotifIcon;
					if (wantKind === "location") {
						iconRel =
							normalizeIconRelPath(line.icon) ||
							(line.locationKind === "current" ? currentIcon : discoveryIcon);
					} else if (
						gizmo.settings.allowModNotificationIcon !== false &&
						normalizeIconRelPath(line.icon)
					) {
						iconRel = normalizeIconRelPath(line.icon);
					}
					const href = resolveDisplayIconHref(iconRel);
					paintMaskedFace(iconHost, "notification-line-icon-face", { color: paint, href });
				}
			}
			const backdropEl = row.querySelector(".notification-line-backdrop");
			if (backdropEl) {
				applyFeedBackdropStyle(
					backdropEl,
					gizmo.settings.backdropColor,
					gizmo.settings.backdropOpacity,
					gizmo.settings.backdropDirection,
					gizmo.settings.textAlign
				);
			}
		} else if (wantKind === "skill") {
			const showIcons = showSkillIcons;
			const needsRebuild =
				!row ||
				row.dataset.showIcons !== (showIcons ? "1" : "0") ||
				row.dataset.iconPlacement !== iconPlace;
			if (row && needsRebuild) {
				rebuildNotificationLineContent(row, showIcons, iconPlace);
			}
			if (!row) {
				row = document.createElement("div");
				row.className = "notification-line";
				row.dataset.lineId = key;
				row.dataset.lineKind = "skill";
				rebuildNotificationLineContent(row, showIcons, iconPlace);
				stack.appendChild(row);
			}
			const textEl = row.querySelector(".notification-line-text");
			if (textEl) {
				textEl.textContent = line.text;
				textEl.style.color = skillsPaint;
			}
			if (showIcons) {
				const iconHost = row.querySelector(".notification-line-icon");
				if (iconHost) {
					const skillKind = normalizeSkillKind(line.skillKind);
					const iconRel =
						skillKind === "level"
							? fallbackLevelIcon
							: normalizeIconRelPath(line.icon) || fallbackSkillIcon;
					const href = resolveDisplayIconHref(iconRel);
					paintMaskedFace(iconHost, "notification-line-icon-face", {
						color: skillsPaint,
						href
					});
				}
			}
			const backdropEl = row.querySelector(".notification-line-backdrop");
			if (backdropEl) {
				applyFeedBackdropStyle(
					backdropEl,
					gizmo.settings.backdropColor,
					gizmo.settings.backdropOpacity,
					gizmo.settings.backdropDirection,
					gizmo.settings.textAlign
				);
			}
		} else if (wantKind === "level-progress") {
			if (!row || row.dataset.effectLayout !== progressLayoutKey) {
				if (row) {
					rebuildLevelProgressLineContent(row, gizmo);
				} else {
					row = document.createElement("div");
					row.className = "notification-line effect-line";
					row.dataset.lineId = key;
					row.dataset.lineKind = "level-progress";
					rebuildLevelProgressLineContent(row, gizmo);
					stack.appendChild(row);
				}
			}
			const nameEl = row.querySelector(".effect-line-name");
			if (nameEl) {
				nameEl.textContent = line.name || "Level";
				nameEl.style.color = skillsPaint;
			}
			if (showSkillIcons) {
				const iconHost = row.querySelector(".effect-line-icon");
				if (iconHost) {
					const href = resolveDisplayIconHref(fallbackLevelIcon);
					paintMaskedFace(iconHost, "notification-line-icon-face", {
						color: skillsPaint,
						href
					});
				}
			}
			const bar = row.querySelector(".effect-line-bar");
			if (bar) {
				const fill = bar.querySelector(".gear-bar-fill");
				const pct = Math.max(0, Math.min(100, Number(line.percent) || 0));
				if (fill) {
					fill.style.width = `${pct}%`;
					fill.style.background = fillColor;
				}
				bar.style.setProperty("--effect-bar-width", `${progressBarWidth}%`);
				bar.style.setProperty("--cog-fill", fillColor);
				bar.style.setProperty("--cog-border", skillsPaint);
			}
			const timerEl = row.querySelector(".effect-line-timer");
			if (timerEl) {
				timerEl.textContent = formatFeedLevelProgressValue(line, showProgressTotal);
				timerEl.style.color = skillsPaint;
			}
			const backdropEl = row.querySelector(".notification-line-backdrop");
			if (backdropEl) {
				applyFeedBackdropStyle(
					backdropEl,
					gizmo.settings.backdropColor,
					gizmo.settings.backdropOpacity,
					gizmo.settings.backdropDirection,
					gizmo.settings.textAlign
				);
			}
		} else if (wantKind === "effect") {
			if (!row || row.dataset.effectLayout !== effectLayoutKey) {
				if (row) {
					rebuildEffectLineContent(row, gizmo);
				} else {
					row = document.createElement("div");
					row.className = "notification-line effect-line";
					row.dataset.lineId = key;
					row.dataset.lineKind = "effect";
					rebuildEffectLineContent(row, gizmo);
					stack.appendChild(row);
				}
			}
			const nameEl = row.querySelector(".effect-line-name");
			if (nameEl) {
				nameEl.textContent = line.name || "Effect";
				nameEl.style.color = effectsPaint;
			}
			if (showEffectIcons) {
				const iconHost = row.querySelector(".effect-line-icon");
				if (iconHost) {
					const iconRel =
						normalizeIconRelPath(line.icon) || fallbackEffectIcon || DEFAULT_FEED_EFFECT_ICON;
					const href = resolveDisplayIconHref(iconRel);
					paintMaskedFace(iconHost, "notification-line-icon-face", {
						color: effectsPaint,
						href
					});
				}
			}
			const fill = row.querySelector(".gear-bar-fill");
			if (fill) {
				const pct = Math.max(0, Math.min(100, Number(line.percent) || 0));
				fill.style.width = `${pct}%`;
				fill.style.backgroundColor = fillColor;
			}
			const bar = row.querySelector(".effect-line-bar");
			if (bar) {
				bar.style.setProperty("--cog-fill", fillColor);
				bar.style.setProperty("--cog-border", effectsPaint);
				bar.style.setProperty("--effect-bar-width", `${progressBarWidth}%`);
			}
			const timerEl = row.querySelector(".effect-line-timer");
			if (timerEl) {
				timerEl.textContent = formatFeedEffectValue(line, showProgressTotal);
				timerEl.style.color = effectsPaint;
			}
			const backdropEl = row.querySelector(".notification-line-backdrop");
			if (backdropEl) {
				applyFeedBackdropStyle(
					backdropEl,
					gizmo.settings.backdropColor,
					gizmo.settings.backdropOpacity,
					gizmo.settings.backdropDirection,
					gizmo.settings.textAlign
				);
			}
		} else {
			if (row && !row.querySelector(".inventory-line-content")) {
				row.remove();
				existing.delete(key);
				row = null;
			}
			if (!row) {
				row = document.createElement("div");
				row.className = "inventory-line";
				row.dataset.lineId = key;
				row.dataset.lineKind = "inventory";
				const backdrop = document.createElement("div");
				backdrop.className = "inventory-line-backdrop";
				const content = document.createElement("div");
				content.className = "inventory-line-content";
				row.appendChild(backdrop);
				row.appendChild(content);
				rebuildInventoryLineContent(content, showInvIcons, iconPlace);
				stack.appendChild(row);
			}
			const contentEl = row.querySelector(".inventory-line-content");
			const backdropEl = row.querySelector(".inventory-line-backdrop");
			const layoutKey = `${showInvIcons ? "1" : "0"}|${iconPlace}`;
			if (contentEl && contentEl.dataset.layoutKey !== layoutKey) {
				rebuildInventoryLineContent(contentEl, showInvIcons, iconPlace);
				contentEl.dataset.layoutKey = layoutKey;
			}
			if (contentEl) {
				const iconRel = normalizeIconRelPath(line.icon) || fallbackInvIcon;
				const href = resolveDisplayIconHref(iconRel);
				const changeText = formatInventoryChangeText(line.count, line.added);
				const paint = !line.added ? removePaint : line.stolen ? stolenPaint : addPaint;
				for (const child of contentEl.children) {
					const slot = child.dataset.slot;
					if (slot === "icon") {
						paintMaskedFace(child, "inventory-line-icon-face", { color: paint, href });
					} else if (slot === "change") {
						child.textContent = changeText;
						child.style.color = paint;
					} else if (slot === "text") {
						child.textContent = line.name;
						child.style.color = paint;
					}
				}
			}
			if (backdropEl) {
				applyFeedBackdropStyle(
					backdropEl,
					gizmo.settings.backdropColor,
					gizmo.settings.backdropOpacity,
					gizmo.settings.backdropDirection,
					gizmo.settings.textAlign
				);
			}
		}
		row.style.opacity = String(feedLineOpacity(line, gizmo, now));
	}
	for (const [key, child] of existing) {
		if (!keep.has(key)) {
			child.remove();
		}
	}
	const orderIds = lines.map((l) => String(l.key));
	for (let i = 0; i < orderIds.length; i++) {
		const child = existing.get(orderIds[i]);
		if (child && stack.children[i] !== child) {
			stack.insertBefore(child, stack.children[i] || null);
		}
	}
}

function paintAllFeedsNow() {
	for (const gizmo of snapshot.gizmos || []) {
		if (normalizeGizmoType(gizmo.type) !== "cog-feed") {
			continue;
		}
		const el = findHudGizmoEl(gizmo.id);
		if (el) {
			paintGizmoFeed(el, gizmo);
		}
	}
}

/** Coalesce Feed paints to one browser frame (B4) — state updates stay immediate. */
let feedPaintRaf = 0;
function paintAllFeeds() {
	if (feedPaintRaf) {
		return;
	}
	const schedule =
		typeof requestAnimationFrame === "function"
			? (cb) => requestAnimationFrame(cb)
			: (cb) => setTimeout(cb, 16);
	feedPaintRaf = schedule(() => {
		feedPaintRaf = 0;
		paintAllFeedsNow();
	});
}

function tickHudFeeds() {
	paintAllFeeds();
}

function buildGizmoFeedEl(gizmo, preview) {
	const el = document.createElement("div");
	el.className = "hud-gizmo hud-gizmo-feed";
	el.dataset.id = gizmo.id;
	el.dataset.gizmoType = "cog-feed";
	el.innerHTML = `<div class="feed-stack"></div>`;
	layoutGizmoFeed(el, gizmo);
	paintGizmoFeed(el, gizmo);
	if (preview) {
		attachGizmoHandles(el, gizmo);
	}
	return el;
}

function appendFeedSectionNotes(section, hideTargets, iconFolder, opts) {
	const hideLine = document.createElement("p");
	hideLine.className = "hint feed-section-note";
	hideLine.textContent =
		opts && opts.hideNote
			? opts.hideNote
			: `When enabled, this section hides ${hideTargets}.`;
	section.appendChild(hideLine);
	const iconLine = document.createElement("p");
	iconLine.className = "hint feed-section-note";
	let iconText = `Rules controlling icons can be found in ${iconFolder}.`;
	if (opts && opts.notificationsApi) {
		iconText = `Rules controlling icons can be found in ${iconFolder}, or overwritten by the Notifications API.`;
	}
	iconLine.textContent = iconText;
	section.appendChild(iconLine);
}

function fillFeedGizmoEditor(panel, gizmo) {
	const gid = gizmo.id;
	const live = () => gizmoFor(gid) || gizmo;

	const intro = document.createElement("p");
	intro.className = "hint";
	intro.textContent =
		"Combined notification and inventory message feed. Add as many sections as you like, or split sections into multiple feeds.";
	panel.appendChild(intro);

	appendEditorRule(panel);
	appendGizmoVisibilityEditor(panel, gizmo);
	appendEditorRule(panel);
	const textSection = document.createElement("div");
	textSection.className = "gizmo-text-settings";
	const textLede = document.createElement("p");
	textLede.className = "lede";
	textLede.textContent = "Text Settings";
	textSection.appendChild(textLede);

	const textRow = document.createElement("div");
	textRow.className = "style-row feed-text-main-row";
	const alignField = document.createElement("label");
	alignField.className = "pos-field compact";
	alignField.innerHTML = `<span>Align</span><select data-role="textAlign">
		<option value="left">Left</option>
		<option value="center">Center</option>
		<option value="right">Right</option>
	</select>`;
	const alignSel = alignField.querySelector("select");
	alignSel.value = normalizeClockTextAlign(gizmo.settings.textAlign || DEFAULT_FEED_TEXT_ALIGN);
	alignSel.addEventListener("change", () => {
		patchGizmo(gid, { textAlign: normalizeClockTextAlign(alignSel.value) });
	});
	textRow.appendChild(alignField);

	const iconPlaceField = document.createElement("label");
	iconPlaceField.className = "pos-field compact";
	iconPlaceField.innerHTML = `<span>Icons</span><select data-role="iconPlacement">
		<option value="left">Left</option>
		<option value="right">Right</option>
	</select>`;
	const iconPlaceSel = iconPlaceField.querySelector("select");
	iconPlaceSel.value = normalizeFeedIconPlacement(gizmo.settings.iconPlacement || DEFAULT_FEED_ICON_PLACEMENT);
	iconPlaceSel.addEventListener("change", () => {
		patchGizmo(gid, { iconPlacement: normalizeFeedIconPlacement(iconPlaceSel.value) });
	});
	textRow.appendChild(iconPlaceField);

	const fontField = document.createElement("label");
	fontField.className = "pos-field compact narrow";
	fontField.innerHTML = `<span>Font</span><input type="text" data-role="fontSize" inputmode="numeric" placeholder="18">`;
	const fontInput = fontField.querySelector("input");
	fontInput.value = gizmo.settings.fontSize > 0 ? String(Math.round(gizmo.settings.fontSize)) : "";
	bindNumberField(fontInput, {
		suffix: "px",
		parse: (raw) => {
			if (String(raw).trim() === "") {
				return DEFAULT_GIZMO_FONT_SIZE;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? Math.max(0, Math.min(128, v)) : null;
		},
		apply: (v) => patchGizmo(gid, { fontSize: v }),
		format: (v) => (v > 0 ? String(Math.round(v)) : ""),
		current: () => live().settings.fontSize || DEFAULT_GIZMO_FONT_SIZE
	});
	textRow.appendChild(fontField);

	const maxField = document.createElement("label");
	maxField.className = "pos-field compact narrow";
	maxField.innerHTML = `<span>Max</span><input type="number" min="1" max="20" step="1" data-role="maxVisible">`;
	const maxInput = maxField.querySelector("input");
	maxInput.value = String(gizmo.settings.maxVisible);
	bindNumberField(maxInput, {
		parse: (raw) => Math.max(1, Math.min(20, Math.round(Number(raw) || DEFAULT_FEED_MAX))),
		apply: (v) => patchGizmo(gid, { maxVisible: v }),
		format: (v) => String(Math.round(v)),
		current: () => live().settings.maxVisible
	});
	textRow.appendChild(maxField);
	textSection.appendChild(textRow);

	const timingRow = document.createElement("div");
	timingRow.className = "style-row";
	const stackField = document.createElement("label");
	stackField.className = "pos-field compact";
	stackField.innerHTML = `<span>Add from</span><select data-role="stackOrigin">
		<option value="bottom">Bottom</option>
		<option value="top">Top</option>
	</select>`;
	const stackSel = stackField.querySelector("select");
	stackSel.value = normalizeStackOrigin(gizmo.settings.stackOrigin);
	stackSel.addEventListener("change", () => {
		patchGizmo(gid, { stackOrigin: normalizeStackOrigin(stackSel.value) });
	});
	timingRow.appendChild(stackField);

	const durField = document.createElement("label");
	durField.className = "pos-field compact";
	durField.innerHTML = `<span>Persist</span><input type="text" data-role="durationSec" inputmode="decimal">`;
	const durInput = durField.querySelector("input");
	durInput.value = (gizmo.settings.durationMs / 1000).toFixed(3);
	bindNumberField(durInput, {
		suffix: "s",
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === ".") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? Math.max(0.5, Math.min(60, v)) * 1000 : null;
		},
		apply: (v) => patchGizmo(gid, { durationMs: v }),
		format: (v) => (Number(v) / 1000).toFixed(3),
		current: () => live().settings.durationMs
	});
	timingRow.appendChild(durField);

	const fadeField = document.createElement("label");
	fadeField.className = "pos-field compact";
	fadeField.innerHTML = `<span>Fade</span><input type="text" data-role="fadeSec" inputmode="decimal">`;
	const fadeInput = fadeField.querySelector("input");
	fadeInput.value = (gizmo.settings.fadeMs / 1000).toFixed(3);
	bindNumberField(fadeInput, {
		suffix: "s",
		parse: (raw) => {
			if (String(raw).trim() === "" || raw === ".") {
				return null;
			}
			const v = Number(raw);
			return Number.isFinite(v) ? Math.max(0, Math.min(2, v)) * 1000 : null;
		},
		apply: (v) => patchGizmo(gid, { fadeMs: v }),
		format: (v) => (Number(v) / 1000).toFixed(3),
		current: () => live().settings.fadeMs
	});
	timingRow.appendChild(fadeField);
	textSection.appendChild(timingRow);

	appendEditorRule(textSection);
	const fadeLede = document.createElement("p");
	fadeLede.className = "lede";
	fadeLede.textContent = "Backdrop Fade";
	textSection.appendChild(fadeLede);
	const fadeHint = document.createElement("p");
	fadeHint.className = "hint";
	fadeHint.textContent =
		"Soft gradient behind each message. Setting opacity to0 disables.";
	textSection.appendChild(fadeHint);

	const backdropRow = document.createElement("div");
	backdropRow.className = "style-row";
	const backdropColor = makeOptionalColorField(
		"Fade colour",
		gizmo.settings.backdropColor,
		DEFAULT_FEED_BACKDROP_COLOR,
		(hex, live) => patchGizmo(gid, { backdropColor: hex }, false, live)
	);
	backdropColor.classList.add("compact");
	backdropRow.appendChild(backdropColor);

	const opacityField = document.createElement("label");
	opacityField.className = "pos-field compact";
	opacityField.innerHTML = `<span>Opacity</span><input type="number" min="0" max="100" step="1" data-role="backdropOpacity">`;
	const opacityInput = opacityField.querySelector("input");
	opacityInput.value = String(gizmo.settings.backdropOpacity);
	bindNumberField(opacityInput, {
		suffix: "%",
		parse: (raw) => Math.max(0, Math.min(100, Math.round(Number(raw)))),
		apply: (v) => patchGizmo(gid, { backdropOpacity: v }),
		format: (v) => String(Math.round(v)),
		current: () => live().settings.backdropOpacity
	});
	backdropRow.appendChild(opacityField);

	const dirField = document.createElement("label");
	dirField.className = "pos-field compact";
	dirField.innerHTML = `<span>Direction</span><select data-role="backdropDirection">
		<option value="up">Up</option>
		<option value="down">Down</option>
		<option value="center">Center</option>
	</select>`;
	const dirSel = dirField.querySelector("select");
	dirSel.value = normalizeFeedBackdropDirection(gizmo.settings.backdropDirection);
	dirSel.addEventListener("change", () => {
		patchGizmo(gid, { backdropDirection: normalizeFeedBackdropDirection(dirSel.value) });
	});
	backdropRow.appendChild(dirField);
	textSection.appendChild(backdropRow);
	panel.appendChild(textSection);

	appendEditorRule(panel);
	const progressSection = document.createElement("div");
	progressSection.className = "gizmo-text-settings";
	const progressLede = document.createElement("p");
	progressLede.className = "lede";
	progressLede.textContent = "Progress Bar";
	progressSection.appendChild(progressLede);
	const progressHint = document.createElement("p");
	progressHint.className = "hint";
	progressHint.textContent =
		"Shared bar colour, width, and number format for Active Effects timers and Skills Level Progress.";
	progressSection.appendChild(progressHint);
	const progressRow = document.createElement("div");
	progressRow.className = "style-row";
	const barColorField = makeOptionalColorField(
		"Bar Colour",
		gizmo.settings.barColor,
		typeof defaultFillColor === "function" ? defaultFillColor() : "#c4a35a",
		(hex, live) => patchGizmo(gid, { barColor: hex }, false, live)
	);
	barColorField.classList.add("compact");
	progressRow.appendChild(barColorField);
	const barWidthField = document.createElement("label");
	barWidthField.className = "pos-field compact";
	barWidthField.innerHTML = `<span>Bar Width</span><input type="number" min="5" max="100" step="1" data-role="progressBarWidth">`;
	const barWidthInput = barWidthField.querySelector("input");
	barWidthInput.value = fmtDec(gizmo.settings.progressBarWidth, 0);
	bindNumberField(barWidthInput, {
		suffix: "%",
		parse: (raw) =>
			String(raw).trim() === ""
				? null
				: Math.max(5, Math.min(100, Number(raw) || DEFAULT_FEED_PROGRESS_BAR_WIDTH)),
		apply: (v) => patchGizmo(gid, { progressBarWidth: v }),
		decimals: 0,
		current: () => feedProgressBarWidth((gizmoFor(gid) || gizmo).settings)
	});
	progressRow.appendChild(barWidthField);
	const numberFormatField = document.createElement("label");
	numberFormatField.className = "pos-field compact wide";
	numberFormatField.innerHTML = `<span>Number Format</span><select data-role="numberFormat">
		<option value="bar">Show bar</option>
		<option value="barPercent">Show bar and percentage</option>
		<option value="barTotal">Show bar and value</option>
		<option value="percent">Show percentage</option>
		<option value="total">Show value</option>
	</select>`;
	const numberFormatSel = numberFormatField.querySelector("select");
	numberFormatSel.value = normalizeFeedNumberFormat(gizmo.settings.numberFormat);
	numberFormatSel.addEventListener("change", () => {
		patchGizmo(gid, { numberFormat: normalizeFeedNumberFormat(numberFormatSel.value) });
	});
	progressRow.appendChild(numberFormatField);
	progressSection.appendChild(progressRow);
	panel.appendChild(progressSection);

	appendEditorRule(panel);
	const sourcesSection = document.createElement("div");
	sourcesSection.className = "gizmo-text-settings";
	const sourcesLede = document.createElement("p");
	sourcesLede.className = "lede";
	sourcesLede.textContent = "Sources";
	sourcesSection.appendChild(sourcesLede);

	const sourcesRow = document.createElement("div");
	sourcesRow.className = "style-row";
	const notifField = document.createElement("label");
	notifField.className = "check-row compact";
	notifField.innerHTML = `<input type="checkbox" data-role="showNotifications"> Notifications`;
	const notifInput = notifField.querySelector("input");
	notifInput.checked = gizmo.settings.showNotifications === true;
	const invField = document.createElement("label");
	invField.className = "check-row compact";
	invField.innerHTML = `<input type="checkbox" data-role="showInventory"> Inventory`;
	const invInput = invField.querySelector("input");
	invInput.checked = gizmo.settings.showInventory === true;
	const locField = document.createElement("label");
	locField.className = "check-row compact";
	locField.innerHTML = `<input type="checkbox" data-role="showLocation"> Location`;
	const locInput = locField.querySelector("input");
	locInput.checked = gizmo.settings.showLocation === true;
	const fxField = document.createElement("label");
	fxField.className = "check-row compact";
	fxField.innerHTML = `<input type="checkbox" data-role="showActiveEffects"> Active Effects`;
	const fxInput = fxField.querySelector("input");
	fxInput.checked = gizmo.settings.showActiveEffects === true;
	const skillsField = document.createElement("label");
	skillsField.className = "check-row compact";
	skillsField.innerHTML = `<input type="checkbox" data-role="showSkills"> Skills`;
	const skillsInput = skillsField.querySelector("input");
	skillsInput.checked = gizmo.settings.showSkills === true;
	const syncSources = () => {
		patchGizmo(gid, {
			showNotifications: notifInput.checked,
			showInventory: invInput.checked,
			showLocation: locInput.checked,
			showActiveEffects: fxInput.checked,
			showSkills: skillsInput.checked
		});
		renderEditor(true);
	};
	notifInput.addEventListener("change", syncSources);
	invInput.addEventListener("change", syncSources);
	locInput.addEventListener("change", syncSources);
	fxInput.addEventListener("change", syncSources);
	skillsInput.addEventListener("change", syncSources);
	sourcesRow.appendChild(fxField);
	sourcesRow.appendChild(invField);
	sourcesRow.appendChild(locField);
	sourcesRow.appendChild(notifField);
	sourcesRow.appendChild(skillsField);
	sourcesSection.appendChild(sourcesRow);

	if (
		!gizmo.settings.showNotifications &&
		!gizmo.settings.showInventory &&
		!gizmo.settings.showLocation &&
		!gizmo.settings.showActiveEffects &&
		!gizmo.settings.showSkills
	) {
		const noneHint = document.createElement("p");
		noneHint.className = "hint";
		noneHint.textContent = "Please add at least one source.";
		sourcesSection.appendChild(noneHint);
	}
	panel.appendChild(sourcesSection);

	if (gizmo.settings.showActiveEffects) {
		appendEditorRule(panel);
		const fxSection = document.createElement("div");
		fxSection.className = "gizmo-text-settings";
		const fxLede = document.createElement("p");
		fxLede.className = "lede";
		fxLede.textContent = "Active Effects";
		fxSection.appendChild(fxLede);
		const fxHint = document.createElement("p");
		fxHint.className = "hint";
		fxHint.textContent =
			"Timed player effects only. They stay until the timer ends, then fade. You can filter by minimum and maximum remaining time.";
		fxSection.appendChild(fxHint);

		const fxRow = document.createElement("div");
		fxRow.className = "style-row";
		const fxColor = makeOptionalColorField(
			"Text Colour",
			gizmo.settings.effectsColor,
			optionalHex(gizmo.settings.textColor) || DEFAULT_GIZMO_GOLD,
			(hex, live) => patchGizmo(gid, { effectsColor: hex }, false, live)
		);
		fxColor.classList.add("compact");
		fxRow.appendChild(fxColor);
		const minField = document.createElement("label");
		minField.className = "pos-field compact effects-remaining";
		minField.innerHTML = `<span>Min remaining</span><input type="number" min="0" max="600" step="1" data-role="effectsMinSec">`;
		const minInput = minField.querySelector("input");
		minInput.value = fmtDec(gizmo.settings.effectsMinSec, 0);
		bindNumberField(minInput, {
			suffix: "s",
			parse: (raw) => (String(raw).trim() === "" ? 1 : Math.max(0, Math.min(600, Number(raw) || 0))),
			apply: (v) => patchGizmo(gid, { effectsMinSec: v == null ? 1 : v }),
			decimals: 0,
			current: () => (gizmoFor(gid) || gizmo).settings.effectsMinSec
		});
		const maxField = document.createElement("label");
		maxField.className = "pos-field compact effects-remaining";
		maxField.innerHTML = `<span>Max remaining</span><input type="number" min="0" max="3600" step="10" data-role="effectsMaxSec">`;
		const maxInput = maxField.querySelector("input");
		maxInput.value = fmtDec(gizmo.settings.effectsMaxSec, 0);
		bindNumberField(maxInput, {
			suffix: "s",
			parse: (raw) => (String(raw).trim() === "" ? null : Math.max(0, Math.min(3600, Number(raw) || 0))),
			apply: (v) => patchGizmo(gid, { effectsMaxSec: v }),
			decimals: 0,
			current: () => (gizmoFor(gid) || gizmo).settings.effectsMaxSec
		});
		fxRow.appendChild(minField);
		fxRow.appendChild(maxField);
		fxSection.appendChild(fxRow);

		const togglesRow = document.createElement("div");
		togglesRow.className = "style-row";
		const makeFxCheck = (role, label, checked, patchKey) => {
			const field = document.createElement("label");
			field.className = "check-row compact";
			field.innerHTML = `<input type="checkbox" data-role="${role}"> ${label}`;
			const input = field.querySelector("input");
			input.checked = checked;
			input.addEventListener("change", () => {
				patchGizmo(gid, { [patchKey]: input.checked });
				renderEditor(true);
			});
			return field;
		};
		togglesRow.appendChild(
			makeFxCheck("showEffectText", "Show text", gizmo.settings.showEffectText !== false, "showEffectText")
		);
		togglesRow.appendChild(
			makeFxCheck("showEffectTimer", "Show timer", gizmo.settings.showEffectTimer !== false, "showEffectTimer")
		);
		togglesRow.appendChild(
			makeFxCheck("showEffectIcons", "Show Icons", gizmo.settings.showEffectIcons === true, "showEffectIcons")
		);
		fxSection.appendChild(togglesRow);

		const transformRow = document.createElement("div");
		transformRow.className = "style-row";
		transformRow.appendChild(
			makeFxCheck(
				"suppressTransformEffects",
				"Suppress Werewolf/Vampire transformation effects",
				gizmo.settings.suppressTransformEffects !== false,
				"suppressTransformEffects"
			)
		);
		fxSection.appendChild(transformRow);

		const iconRow = document.createElement("div");
		iconRow.className = "style-row feed-effects-controls";
		iconRow.appendChild(
			makeIconControl({
				label: "Default Icon",
				value: gizmo.settings.effectIcon || DEFAULT_FEED_EFFECT_ICON,
				showName: true,
				clearLabel: "Use default",
				onCommit: (icon) => {
					patchGizmo(gid, {
						effectIcon: normalizeFeedEffectIcon(icon || DEFAULT_FEED_EFFECT_ICON)
					});
				}
			})
		);
		fxSection.appendChild(iconRow);

		appendFeedSectionNotes(fxSection, "hud.activeEffects", "gizmos/feed/effects/");
		panel.appendChild(fxSection);
	}


	if (gizmo.settings.showInventory) {
		appendEditorRule(panel);
		const invDefaults = document.createElement("div");
		invDefaults.className = "gizmo-text-settings";
		const invDefaultsLede = document.createElement("p");
		invDefaultsLede.className = "lede";
		invDefaultsLede.textContent = "Inventory";
		invDefaults.appendChild(invDefaultsLede);

		const colorRow = document.createElement("div");
		colorRow.className = "style-row";
		const addColor = makeOptionalColorField(
			"Add",
			gizmo.settings.addColor,
			optionalHex(gizmo.settings.textColor) || DEFAULT_GIZMO_GOLD,
			(hex, live) => patchGizmo(gid, { addColor: hex }, false, live)
		);
		addColor.classList.add("compact");
		colorRow.appendChild(addColor);
		const removeColor = makeOptionalColorField(
			"Remove",
			gizmo.settings.removeColor,
			optionalHex(gizmo.settings.textColor) || DEFAULT_GIZMO_GOLD,
			(hex, live) => patchGizmo(gid, { removeColor: hex }, false, live)
		);
		removeColor.classList.add("compact");
		colorRow.appendChild(removeColor);
		const stolenColor = makeOptionalColorField(
			"Stolen",
			gizmo.settings.stolenColor,
			optionalHex(gizmo.settings.textColor) || DEFAULT_GIZMO_GOLD,
			(hex, live) => patchGizmo(gid, { stolenColor: hex }, false, live)
		);
		stolenColor.classList.add("compact");
		colorRow.appendChild(stolenColor);
		invDefaults.appendChild(colorRow);

		const iconRow = document.createElement("div");
		iconRow.className = "style-row";
		const invIcon = makeIconControl({
			label: "Default Icon",
			value: gizmo.settings.icon || DEFAULT_FEED_INVENTORY_ICON,
			showName: true,
			clearLabel: "Use default",
			onCommit: (icon) => {
				patchGizmo(gid, { icon: normalizeFeedInventoryIcon(icon || DEFAULT_FEED_INVENTORY_ICON) });
			}
		});
		iconRow.appendChild(invIcon);
		const invIconsField = document.createElement("label");
		invIconsField.className = "check-row compact";
		invIconsField.innerHTML = `<input type="checkbox" data-role="showInventoryIcons"> Show Icons`;
		const invIconsInput = invIconsField.querySelector("input");
		invIconsInput.checked = gizmo.settings.showInventoryIcons === true;
		invIconsInput.addEventListener("change", () => {
			patchGizmo(gid, { showInventoryIcons: invIconsInput.checked });
		});
		iconRow.appendChild(invIconsField);
		invDefaults.appendChild(iconRow);
		appendFeedSectionNotes(invDefaults, "", "gizmos/feed/inventory/", {
			hideNote:
				"When enabled, this section tracks inventory changes, soft-hides hud.inventory (TrueHUD Recent Loot), and diverts inventory-style notifications from hud.notifications."
		});
		panel.appendChild(invDefaults);
	}


	if (gizmo.settings.showLocation) {
		appendEditorRule(panel);
		const locDefaults = document.createElement("div");
		locDefaults.className = "gizmo-text-settings";
		const locLede = document.createElement("p");
		locLede.className = "lede";
		locLede.textContent = "Location";
		locDefaults.appendChild(locLede);

		const makeLocationIconRow = (colorValue, colorFallback, iconValue, normalizeIcon, patchColor, patchIcon) => {
			const row = document.createElement("div");
			row.className = "style-row feed-location-row is-nested";
			const color = makeOptionalColorField(
				"Colour",
				colorValue,
				colorFallback || DEFAULT_GIZMO_GOLD,
				(hex, live) => patchGizmo(gid, { [patchColor]: hex }, false, live)
			);
			color.classList.add("compact");
			row.appendChild(color);
			const iconCtrl = makeIconControl({
				label: "Icon",
				value: iconValue,
				showName: true,
				clearLabel: "Use default",
				onCommit: (icon) => {
					patchGizmo(gid, { [patchIcon]: normalizeIcon(icon) });
				}
			});
			row.appendChild(iconCtrl);
			return row;
		};

		const appendLocationType = (
			role,
			label,
			checked,
			patchCheck,
			colorValue,
			colorFallback,
			iconValue,
			normalizeIcon,
			patchColor,
			patchIcon
		) => {
			const block = document.createElement("div");
			block.className = "feed-location-type";
			const field = document.createElement("label");
			field.className = "check-row compact";
			const input = document.createElement("input");
			input.type = "checkbox";
			input.dataset.role = role;
			input.checked = checked;
			field.appendChild(input);
			field.appendChild(document.createTextNode(` ${label}`));
			input.addEventListener("change", () => {
				patchGizmo(gid, { [patchCheck]: input.checked });
				renderEditor(true);
			});
			block.appendChild(field);
			if (checked) {
				block.appendChild(
					makeLocationIconRow(
						colorValue,
						colorFallback,
						iconValue,
						normalizeIcon,
						patchColor,
						patchIcon
					)
				);
			}
			locDefaults.appendChild(block);
		};

		const locColorFallback =
			optionalHex(gizmo.settings.textColor) || DEFAULT_GIZMO_GOLD;
		appendLocationType(
			"showLocationDiscovery",
			"Location Discovery",
			gizmo.settings.showLocationDiscovery !== false,
			"showLocationDiscovery",
			gizmo.settings.locationDiscoveryColor,
			locColorFallback,
			gizmo.settings.locationDiscoveryIcon || DEFAULT_FEED_LOCATION_DISCOVERY_ICON,
			normalizeFeedLocationDiscoveryIcon,
			"locationDiscoveryColor",
			"locationDiscoveryIcon"
		);
		appendLocationType(
			"showCurrentLocation",
			"Current Location",
			gizmo.settings.showCurrentLocation !== false,
			"showCurrentLocation",
			gizmo.settings.currentLocationColor,
			locColorFallback,
			gizmo.settings.currentLocationIcon || DEFAULT_FEED_CURRENT_LOCATION_ICON,
			normalizeFeedCurrentLocationIcon,
			"currentLocationColor",
			"currentLocationIcon"
		);

		const locIconsField = document.createElement("label");
		locIconsField.className = "check-row compact";
		locIconsField.innerHTML = `<input type="checkbox" data-role="showLocationIcons"> Show Icons`;
		const locIconsInput = locIconsField.querySelector("input");
		locIconsInput.checked = gizmo.settings.showLocationIcons === true;
		locIconsInput.addEventListener("change", () => {
			patchGizmo(gid, { showLocationIcons: locIconsInput.checked });
			renderEditor(true);
		});
		locDefaults.appendChild(locIconsField);
		const locNoteParts = [];
		if (gizmo.settings.showCurrentLocation !== false) {
			locNoteParts.push("hides hud.currentLocation");
		}
		if (gizmo.settings.showLocationDiscovery !== false) {
			locNoteParts.push("diverts location discovery from hud.questUpdates");
		}
		const locHideNote =
			locNoteParts.length > 0
				? `When enabled, this section ${locNoteParts.join(" and ")}.`
				: "When enabled, this section hides hud.currentLocation and diverts location discovery from hud.questUpdates.";
		appendFeedSectionNotes(locDefaults, "", "gizmos/feed/location/", { hideNote: locHideNote });
		panel.appendChild(locDefaults);
	}

	if (gizmo.settings.showSkills) {
		appendEditorRule(panel);
		const skillsSection = document.createElement("div");
		skillsSection.className = "gizmo-text-settings";
		const skillsLede = document.createElement("p");
		skillsLede.className = "lede";
		skillsLede.textContent = "Skills";
		skillsSection.appendChild(skillsLede);
		const skillsHint = document.createElement("p");
		skillsHint.className = "hint";
		skillsHint.textContent = "Level Up Menu is never blocked.";
		skillsSection.appendChild(skillsHint);

		const iconRow = document.createElement("div");
		iconRow.className = "style-row";
		const skillsColor = makeOptionalColorField(
			"Text Colour",
			gizmo.settings.skillsColor,
			optionalHex(gizmo.settings.textColor) || DEFAULT_GIZMO_GOLD,
			(hex, live) => patchGizmo(gid, { skillsColor: hex }, false, live)
		);
		skillsColor.classList.add("compact");
		iconRow.appendChild(skillsColor);
		const skillIconCtrl = makeIconControl({
			label: "Default Skill Icon",
			value: gizmo.settings.skillIcon || DEFAULT_FEED_SKILL_ICON,
			showName: true,
			clearLabel: "Use default",
			onCommit: (icon) => {
				patchGizmo(gid, { skillIcon: normalizeFeedSkillIcon(icon || DEFAULT_FEED_SKILL_ICON) });
			}
		});
		iconRow.appendChild(skillIconCtrl);
		const levelIconCtrl = makeIconControl({
			label: "Default Level Icon",
			value: gizmo.settings.levelIcon || DEFAULT_FEED_LEVEL_ICON,
			showName: true,
			clearLabel: "Use default",
			onCommit: (icon) => {
				patchGizmo(gid, { levelIcon: normalizeFeedLevelIcon(icon || DEFAULT_FEED_LEVEL_ICON) });
			}
		});
		iconRow.appendChild(levelIconCtrl);
		skillsSection.appendChild(iconRow);

		const togglesRow = document.createElement("div");
		togglesRow.className = "style-row";
		const iconsField = document.createElement("label");
		iconsField.className = "check-row compact";
		iconsField.innerHTML = `<input type="checkbox" data-role="showSkillIcons"> Show Icons`;
		const iconsInput = iconsField.querySelector("input");
		iconsInput.checked = gizmo.settings.showSkillIcons === true;
		iconsInput.addEventListener("change", () => {
			patchGizmo(gid, { showSkillIcons: iconsInput.checked });
			renderEditor(true);
		});
		togglesRow.appendChild(iconsField);
		const progressField = document.createElement("label");
		progressField.className = "check-row compact";
		progressField.innerHTML = `<input type="checkbox" data-role="showLevelProgress"> Level Progress`;
		const progressInput = progressField.querySelector("input");
		progressInput.checked = gizmo.settings.showLevelProgress !== false;
		progressInput.addEventListener("change", () => {
			patchGizmo(gid, { showLevelProgress: progressInput.checked });
			renderEditor(true);
		});
		togglesRow.appendChild(progressField);
		skillsSection.appendChild(togglesRow);
		appendFeedSectionNotes(skillsSection, "", "gizmos/feed/skills/", {
			hideNote:
				"When enabled, this section diverts skill / level-up banners from hud.questUpdates."
		});
		panel.appendChild(skillsSection);
	}

	if (gizmo.settings.showNotifications) {
		appendEditorRule(panel);
		const notifSection = document.createElement("div");
		notifSection.className = "gizmo-text-settings";
		const notifLede = document.createElement("p");
		notifLede.className = "lede";
		notifLede.textContent = "Notifications";
		notifSection.appendChild(notifLede);

		const defaultsRow = document.createElement("div");
		defaultsRow.className = "style-row";
		const textColor = makeOptionalColorField(
			"Colour",
			gizmo.settings.textColor,
			DEFAULT_GIZMO_GOLD,
			(hex, live) => patchGizmo(gid, { textColor: hex }, false, live)
		);
		textColor.classList.add("compact");
		defaultsRow.appendChild(textColor);

		const notifIcon = makeIconControl({
			label: "Icon",
			value: gizmo.settings.notificationIcon || DEFAULT_FEED_NOTIFICATION_ICON,
			showName: true,
			clearLabel: "Use default",
			onCommit: (icon) => {
				patchGizmo(gid, {
					notificationIcon: normalizeFeedNotificationIcon(icon || DEFAULT_FEED_NOTIFICATION_ICON)
				});
			}
		});
		defaultsRow.appendChild(notifIcon);

		const iconsField = document.createElement("label");
		iconsField.className = "check-row compact";
		iconsField.innerHTML = `<input type="checkbox" data-role="showNotificationIcons"> Show icons`;
		const iconsInput = iconsField.querySelector("input");
		iconsInput.checked = gizmo.settings.showNotificationIcons === true;
		iconsInput.addEventListener("change", () => {
			patchGizmo(gid, { showNotificationIcons: iconsInput.checked });
		});
		defaultsRow.appendChild(iconsField);
		notifSection.appendChild(defaultsRow);

		if (!gizmo.settings.showInventory) {
			const suppressRow = document.createElement("div");
			suppressRow.className = "style-row";
			const suppressField = document.createElement("label");
			suppressField.className = "check-row compact";
			const suppressInput = document.createElement("input");
			suppressInput.type = "checkbox";
			suppressInput.dataset.role = "suppressInventory";
			suppressInput.checked = gizmo.settings.suppressInventory !== false;
			const suppressTitle = document.createElement("span");
			suppressTitle.className = "field-title-row";
			suppressTitle.appendChild(document.createTextNode("Suppress inventory"));
			suppressTitle.appendChild(
				makeInfoTip(
					"When on, inventory-style notification toasts are suppressed (not shown on the vanilla HUD or in this Notifications feed) while Notifications are active. Many activators and containers fire those even when you are not looting — leave this on unless you want them on the vanilla HUD. The Inventory section tracks real item changes separately."
				)
			);
			suppressField.appendChild(suppressInput);
			suppressField.appendChild(suppressTitle);
			suppressInput.addEventListener("change", () => {
				patchGizmo(gid, { suppressInventory: suppressInput.checked });
			});
			suppressRow.appendChild(suppressField);
			notifSection.appendChild(suppressRow);
		}

		const makeOverrideCheck = (role, label, checked, infoText, patchKey) => {
			const row = document.createElement("div");
			row.className = "style-row";
			const field = document.createElement("label");
			field.className = "check-row compact";
			const input = document.createElement("input");
			input.type = "checkbox";
			input.dataset.role = role;
			input.checked = checked;
			const title = document.createElement("span");
			title.className = "field-title-row";
			title.appendChild(document.createTextNode(label));
			title.appendChild(makeInfoTip(infoText));
			field.appendChild(input);
			field.appendChild(title);
			input.addEventListener("change", () => {
				patchGizmo(gid, { [patchKey]: input.checked });
			});
			row.appendChild(field);
			return row;
		};

		notifSection.appendChild(
			makeOverrideCheck(
				"allowModNotificationIcon",
				"Allow Mods to Choose Icon",
				gizmo.settings.allowModNotificationIcon !== false,
				"When on, mods can use COG_API.Notify to supply a per-message icon path under assets/icons/. When off, every message uses the Notifications icon (if Show icons is on).",
				"allowModNotificationIcon"
			)
		);
		notifSection.appendChild(
			makeOverrideCheck(
				"allowModNotificationColor",
				"Allow Mods to Choose Colour",
				gizmo.settings.allowModNotificationColor !== false,
				"When on, message colour can come from SkyUILib (for compatibility) or COG_API.Notify. When off, every message uses the Notifications colour.",
				"allowModNotificationColor"
			)
		);
		appendFeedSectionNotes(notifSection, "hud.notifications", "gizmos/feed/notifications/", {
			notificationsApi: true
		});
		panel.appendChild(notifSection);
	}


}

window.CogRegisterGizmoRenderer("cog-feed", {
	create() {
		return defaultFeedGizmo(nextGizmoTypeIndex("cog-feed"));
	},
	ensure: ensureFeedGizmo,
	build: buildGizmoFeedEl,
	layout: layoutGizmoFeed,
	paint: paintGizmoFeed,
	fillEditor: fillFeedGizmoEditor
});
