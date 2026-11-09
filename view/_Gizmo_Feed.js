// COG overlay — Feed gizmo (notifications + inventory, one stack)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

const DEFAULT_FEED_WIDTH = 400;
const DEFAULT_FEED_HEIGHT = 400;
const DEFAULT_FEED_MAX = 15;
const DEFAULT_FEED_STACK_ORIGIN = "top";
const DEFAULT_FEED_TEXT_ALIGN = "left";
const DEFAULT_FEED_DURATION = 5;
const DEFAULT_FEED_FADE = 1;
const DEFAULT_FEED_DURATION_MS = DEFAULT_FEED_DURATION * 1000;
const DEFAULT_FEED_FADE_MS = DEFAULT_FEED_FADE * 1000;

/** Stored seconds → ms for timers. */
function feedHoldMs(settings) {
	const sec = Number(settings && settings.duration);
	return (Number.isFinite(sec) ? sec : DEFAULT_FEED_DURATION) * 1000;
}

function feedFadeMs(settings) {
	const sec = Number(settings && settings.fade);
	return (Number.isFinite(sec) ? sec : DEFAULT_FEED_FADE) * 1000;
}

/** Migration Code for Transition from v1.11 or earlier to v1.2: durationMs/fadeMs → seconds. */
function migrateFeedMsSetting(rawMs) {
	const n = Number(rawMs);
	if (!Number.isFinite(n)) {
		return null;
	}
	// Values that look like milliseconds (>= 100) convert; smaller values already seconds.
	return n >= 100 ? n / 1000 : n;
}
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
		duration: DEFAULT_FEED_DURATION,
		fade: DEFAULT_FEED_FADE,
		showNotifications: false,
		showInventory: false,
		showLocation: false,
		showActiveEffects: false,
		showSkills: false,
		timerMinSec: 1,
		timerMaxSec: 180,
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
		showSkillProgress: true,
		showLevelProgress: true,
		skillProgressIcon: DEFAULT_FEED_SKILL_ICON,
		levelProgressIcon: DEFAULT_FEED_LEVEL_ICON,
		skillProgressColor: DEFAULT_GIZMO_GOLD,
		levelProgressColor: DEFAULT_GIZMO_GOLD,
		backdropColor: DEFAULT_FEED_BACKDROP_COLOR,
		backdropOpacity: DEFAULT_FEED_BACKDROP_OPACITY,
		backdropDirection: DEFAULT_FEED_BACKDROP_DIRECTION,
		icon: DEFAULT_FEED_INVENTORY_ICON
	};
	settings.displayName =
		typeof formatStockName === "function"
			? formatStockName("Feed {num}", { num: n })
			: `Feed ${n}`;
	return {
		id: `gizmo_${Date.now().toString(36)}`,
		typeId: "cog-feed",
		visibility: "ui",
		hudSuppress: [],
		display: {
			x: DEFAULT_HUD_X,
			y: Math.min(0.92, DEFAULT_HUD_Y + 0.08),
			rotation: 0,
			width: DEFAULT_FEED_WIDTH,
			height: DEFAULT_FEED_HEIGHT,
			maxAlpha: 100
		},
		settings,
		settingsJson: JSON.stringify(settings)
	};
}

/** Soft-hide aliases derived from Feed section / nested toggles (root hudSuppress). */
function feedHudSuppressKeysFromSettings(s) {
	const keys = [];
	if (!s || typeof s !== "object") {
		return keys;
	}
	if (s.showNotifications === true || s.showNotifications === "true") {
		keys.push("hud.notifications");
	}
	if (s.showInventory === true || s.showInventory === "true") {
		keys.push("hud.inventory");
	}
	if (
		(s.showLocation === true || s.showLocation === "true") &&
		s.showCurrentLocation !== false &&
		s.showCurrentLocation !== "false"
	) {
		keys.push("hud.currentLocation");
	}
	if (s.showActiveEffects === true || s.showActiveEffects === "true") {
		keys.push("hud.activeEffects");
	}
	if (s.showSkills === true || s.showSkills === "true") {
		keys.push("hud.questUpdates");
	}
	return typeof normalizeGizmoHudSuppressList === "function"
		? normalizeGizmoHudSuppressList(keys)
		: keys;
}

function ensureFeedGizmo(gizmo) {
	ensureGizmoDisplayName(gizmo);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// skillsColor/skillIcon/levelIcon → skillProgress* + levelProgress* (split like Location).
	// Must run before mergeSettingsFromTypeSchema fills the new keys with defaults.
	{
		const raw = parseGizmoSettingsObject(gizmo);
		let migrated = false;
		if (raw.skillsColor != null && String(raw.skillsColor).trim() !== "") {
			raw.skillProgressColor = raw.skillsColor;
			raw.levelProgressColor = raw.skillsColor;
			migrated = true;
		}
		if (raw.skillIcon != null && String(raw.skillIcon).trim() !== "") {
			raw.skillProgressIcon = raw.skillIcon;
			migrated = true;
		}
		if (raw.levelIcon != null && String(raw.levelIcon).trim() !== "") {
			raw.levelProgressIcon = raw.levelIcon;
			migrated = true;
		}
		if (Object.prototype.hasOwnProperty.call(raw, "skillsColor") ||
			Object.prototype.hasOwnProperty.call(raw, "skillIcon") ||
			Object.prototype.hasOwnProperty.call(raw, "levelIcon")) {
			delete raw.skillsColor;
			delete raw.skillIcon;
			delete raw.levelIcon;
			migrated = true;
		}
		if (migrated) {
			gizmo.settings = raw;
			gizmo.settingsJson = JSON.stringify(raw);
		}
	}
	const s = ensureGizmoSettings(gizmo);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation/width/height move under nested "display" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	migrateEntityDisplay(gizmo, {
		sized: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: DEFAULT_FEED_WIDTH,
		height: DEFAULT_FEED_HEIGHT,
		minW: MIN_GIZMO_WIDTH,
		minH: MIN_GIZMO_HEIGHT
	});
	s.fontSize = Math.max(0, Number(s.fontSize) || DEFAULT_GIZMO_FONT_SIZE);
	s.textAlign = normalizeClockTextAlign(s.textAlign || DEFAULT_FEED_TEXT_ALIGN);
	s.iconPlacement = normalizeFeedIconPlacement(s.iconPlacement || DEFAULT_FEED_ICON_PLACEMENT);
	s.textColor = optionalHex(s.textColor);
	s.addColor = optionalHex(s.addColor);
	s.removeColor = optionalHex(s.removeColor);
	s.stolenColor = optionalHex(s.stolenColor);
	s.maxVisible = Math.max(1, Math.min(20, Math.round(Number(s.maxVisible) || DEFAULT_FEED_MAX)));
	s.stackOrigin = normalizeStackOrigin(s.stackOrigin || DEFAULT_FEED_STACK_ORIGIN);
	// Migration Code for Transition from v1.11 or earlier to v1.2: durationMs/fadeMs → duration/fade (seconds).
	if (Object.prototype.hasOwnProperty.call(s, "durationMs")) {
		const migrated = migrateFeedMsSetting(s.durationMs);
		if (migrated != null && (s.duration == null || s.duration === "")) {
			s.duration = migrated;
		}
		delete s.durationMs;
	}
	if (Object.prototype.hasOwnProperty.call(s, "fadeMs")) {
		const migrated = migrateFeedMsSetting(s.fadeMs);
		if (migrated != null && (s.fade == null || s.fade === "")) {
			s.fade = migrated;
		}
		delete s.fadeMs;
	}
	s.duration = Math.max(0.5, Math.min(60, Number(s.duration) || DEFAULT_FEED_DURATION));
	{
		const n = Number(s.fade);
		s.fade = Math.max(0, Math.min(2, Number.isFinite(n) ? n : DEFAULT_FEED_FADE));
	}
	s.showNotifications = s.showNotifications === true || s.showNotifications === "true";
	s.showInventory = s.showInventory === true || s.showInventory === "true";
	s.showLocation = s.showLocation === true || s.showLocation === "true";
	s.showActiveEffects = s.showActiveEffects === true || s.showActiveEffects === "true";
	s.showSkills = s.showSkills === true || s.showSkills === "true";
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// effectsMinSec/effectsMaxSec → timerMinSec/timerMaxSec (shared Progress Bar window).
	if (Object.prototype.hasOwnProperty.call(s, "effectsMinSec")) {
		const legacyMin = Number(s.effectsMinSec);
		if (Number.isFinite(legacyMin)) {
			s.timerMinSec = legacyMin;
		}
		delete s.effectsMinSec;
	}
	if (Object.prototype.hasOwnProperty.call(s, "effectsMaxSec")) {
		const legacyMax = Number(s.effectsMaxSec);
		if (Number.isFinite(legacyMax)) {
			s.timerMaxSec = legacyMax;
		}
		delete s.effectsMaxSec;
	}
	s.timerMinSec = Number(s.timerMinSec);
	if (!Number.isFinite(s.timerMinSec)) {
		s.timerMinSec = 1;
	}
	s.timerMinSec = Math.max(0, Math.min(600, s.timerMinSec));
	s.timerMaxSec = Number(s.timerMaxSec);
	if (!Number.isFinite(s.timerMaxSec)) {
		s.timerMaxSec = 180;
	}
	s.timerMaxSec = Math.max(0, Math.min(3600, s.timerMaxSec));
	if (s.timerMaxSec > 0 && s.timerMinSec > s.timerMaxSec) {
		s.timerMinSec = s.timerMaxSec;
	}
	s.showEffectIcons = s.showEffectIcons !== false;
	s.showEffectText = s.showEffectText !== false;
	s.showEffectTimer = s.showEffectTimer !== false;
	s.numberFormat = normalizeNumberFormat(s.numberFormat, DEFAULT_FEED_NUMBER_FORMAT);
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
	s.showSkillProgress = s.showSkillProgress !== false;
	s.showLevelProgress = s.showLevelProgress !== false;
	s.skillProgressIcon = normalizeFeedSkillIcon(s.skillProgressIcon);
	s.levelProgressIcon = normalizeFeedLevelIcon(s.levelProgressIcon);
	s.skillProgressColor = optionalHex(s.skillProgressColor);
	s.levelProgressColor = optionalHex(s.levelProgressColor);
	s.backdropColor = optionalHex(s.backdropColor);
	s.backdropOpacity = quantizePct(
		Math.max(
			0,
			Math.min(
				100,
				Number.isFinite(Number(s.backdropOpacity)) ? Number(s.backdropOpacity) : DEFAULT_FEED_BACKDROP_OPACITY
			)
		)
	);
	s.backdropDirection = normalizeFeedBackdropDirection(s.backdropDirection || DEFAULT_FEED_BACKDROP_DIRECTION);
	s.icon = normalizeFeedInventoryIcon(s.icon);
	gizmo.typeId = "cog-feed";
	// Missing visibility → type default (cog-feed→ui), not a hard-coded coerce of "hud".
	gizmo.visibility = coalesceGizmoVisibility(gizmo, "cog-feed");
	gizmo.hudSuppress = feedHudSuppressKeysFromSettings(s);
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
/** Live character level progress for Skills section (values from Notify meter). */
let levelProgressLive = null;
/** When the meter last received an update — used to flash it without a skill toast. */
let levelProgressPulseAt = 0;
/** Timed active effects: live map + fading leftovers after expiry. */
let activeEffectLive = new Map();
let activeEffectFading = new Map();

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
	return quantizePct(Math.max(5, Math.min(100, raw)));
}

function effectPassesTimeWindow(effect, gizmo, opts) {
	const fading = !!(opts && opts.fading);
	let minS = Number(gizmo && gizmo.settings.timerMinSec);
	if (!Number.isFinite(minS)) {
		minS = 1;
	}
	let maxS = Number(gizmo && gizmo.settings.timerMaxSec);
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

function feedExpireReceipt(id) {
	const n = Number(id);
	if (!Number.isFinite(n) || n <= 0) {
		return;
	}
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE(`feedExpire:${Math.round(n)}`);
	}
}

function applyNotifyFeedEvent(incoming, noPaint) {
	const op = String(incoming.op || "upsert").toLowerCase();
	const id = incoming.id != null ? Number(incoming.id) : null;
	const source = String(incoming.source || "general").toLowerCase();
	if (op === "dismiss") {
		if (id != null && activeEffectLive.has(String(id))) {
			const prev = activeEffectLive.get(String(id));
			activeEffectLive.delete(String(id));
			activeEffectFading.set(String(id), { ...prev, removedAt: performance.now() });
			// Meter receipts expire after fade (collectFeedLines), not immediately.
			return;
		}
		if (id != null && levelProgressLive && Number(levelProgressLive.id) === id) {
			levelProgressLive = null;
			levelProgressPulseAt = 0;
		}
		// Non-meter / level-progress: expire as soon as dismissed (no fade map).
		feedExpireReceipt(id);
		return;
	}
	const text = String(incoming.text || "");
	const color = incoming.color;
	const icon = incoming.icon;
	const hasMeter =
		Number.isFinite(Number(incoming.current)) && Number.isFinite(Number(incoming.max));
	const meterType = String(incoming.type || "").toLowerCase();

	if (hasMeter && meterType === "timer") {
		const duration = Number(incoming.max) || 0;
		const remaining = Number(incoming.current) || 0;
		const percent =
			duration > 0 ? Math.max(0, Math.min(100, (remaining / duration) * 100)) : 0;
		const key = String(id);
		activeEffectLive.set(key, {
			id: key,
			name: text || "Effect",
			duration,
			elapsed: Math.max(0, duration - remaining),
			remaining,
			percent,
			icon: normalizeIconRelPath(icon) || "",
			transform: false,
			seenAt: performance.now()
		});
		activeEffectFading.delete(key);
		return;
	}
	if (hasMeter && (source === "cog-feedskills" || source.indexOf("skill") >= 0)) {
		const xp = Number(incoming.current) || 0;
		const threshold = Number(incoming.max) || 1;
		const progress = threshold > 0 ? Math.max(0, Math.min(1, xp / threshold)) : 0;
		// Source owns the label (e.g. "Level 12"); keep a numeric level only for demos / legacy.
		const levelMatch = /^Level\s+(\d+)\s*$/i.exec(text.trim());
		const name = text || "Level";
		const level = levelMatch ? Number(levelMatch[1]) : 1;
		const prev = levelProgressLive;
		const changed =
			!prev ||
			Number(prev.xp) !== xp ||
			Number(prev.threshold) !== threshold ||
			Number(prev.level) !== level ||
			String(prev.name || "") !== name;
		levelProgressLive = {
			id,
			name,
			level,
			xp,
			threshold,
			progress,
			percent: progress * 100,
			icon: normalizeIconRelPath(icon) || ""
		};
		// Flash only when XP/level actually changes. Per-tick identical upserts must not
		// reset pulseAt — that kept addedAt≈now, opacity stuck in fade-in, blank top row.
		if (changed) {
			levelProgressPulseAt = performance.now();
		}
		return;
	}

	if (source === "cog-feedinventory") {
		enqueueInventoryFeedLine(text, 0, true, icon, id, false, {
			...noPaint,
			color: color || ""
		});
		return;
	}
	if (source === "cog-feedlocation") {
		// Icon/colour are fully resolved by the location source; kind only affects demo filters.
		enqueueLocationFeedLine(text, "discovery", id, icon, {
			...noPaint,
			color: color || ""
		});
		return;
	}
	if (source === "cog-feedskills") {
		enqueueSkillFeedLine(text, "skill", icon, "", id, {
			...noPaint,
			color: color || ""
		});
		return;
	}
	enqueueNotificationFeedLine(text, color, id, icon, noPaint);
}

const NOTIFICATION_FEED_PREVIEW_DEMO_COLOR = "#c4a35a";
const NOTIFICATION_FEED_PREVIEW_DEMO_ICON = "Actions/shout.svg";

function notificationFeedPreviewSamples(gizmo) {
	const allowIcon = gizmo.settings.allowModNotificationIcon !== false;
	const allowColor = gizmo.settings.allowModNotificationColor !== false;
	const showIcons = gizmo.settings.showNotificationIcons !== false;

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
		if (normalizeGizmoType(z.typeId) !== "cog-feed") {
			continue;
		}
		// Settings are normalized on load / editor patch — do not ensure on the prune path.
		const hold = feedHoldMs(z.settings);
		const fade = feedFadeMs(z.settings);
		const life = hold + fade * 2 + 500;
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
	if (n <= 0) {
		return "";
	}
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
		color: opts && opts.color ? String(opts.color) : "",
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
		color: opts && opts.color ? String(opts.color) : "",
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
		color: opts && opts.color ? String(opts.color) : "",
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
				if (channel === "notify") {
					applyNotifyFeedEvent(incoming, noPaint);
				} else if (channel === "notification") {
					enqueueNotificationFeedLine(
						incoming.text,
						incoming.color,
						incoming.id,
						incoming.icon,
						noPaint
					);
				} else if (channel === "inventory") {
					enqueueInventoryFeedLine(
						// C++ InventoryFeed JSON uses "name" (item display); accept legacy varName.
						incoming.name || incoming.varName,
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
			// C++ InventoryFeed JSON uses "name" (item display); accept legacy varName.
			incoming.name || incoming.varName,
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
	const fade = Math.max(1, feedFadeMs(gizmo.settings));
	const hold = feedHoldMs(gizmo.settings);
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
	const fade = feedFadeMs(gizmo.settings);
	const hold = feedHoldMs(gizmo.settings);
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
				color: line.color || "",
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
			// Live lines are gated in C++ before Notify; kind on the toast may be omitted.
			// Demo previews still honour discovery / current checkboxes.
			if (line.demo) {
				if (locKind === "discovery" && gizmo.settings.showLocationDiscovery === false) {
					continue;
				}
				if (locKind === "current" && gizmo.settings.showCurrentLocation === false) {
					continue;
				}
			}
			merged.push({
				kind: "location",
				key: `l-${line.id}`,
				id: line.id,
				text: line.text,
				locationKind: locKind,
				icon: line.icon || "",
				color: line.color || "",
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
			for (const [fid, effect] of [...activeEffectFading]) {
				if (now - effect.removedAt >= effectFade) {
					activeEffectFading.delete(fid);
					feedExpireReceipt(effect.id != null ? effect.id : fid);
					continue;
				}
				pushEffect(effect, false);
			}
		}
	}

	if (gizmo.settings.showSkills) {
		const showSkillProg = gizmo.settings.showSkillProgress !== false;
		const showLevelProg = gizmo.settings.showLevelProgress !== false;
		let source = skillFeedLines;
		if (editorOpen) {
			const aliveReal = skillFeedLines.filter((line) => now - line.addedAt < life);
			if (!aliveReal.length) {
				source = SKILL_FEED_PREVIEW.filter((sample) => {
					if (normalizeSkillKind(sample.kind) === "level") {
						return showLevelProg;
					}
					return showSkillProg;
				}).map((sample, i) => ({
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
			const skillKind = normalizeSkillKind(line.kind);
			// Live lines are gated in C++ before Notify; kind may be omitted on Notify path.
			// Demo previews still honour skill / level progress checkboxes.
			if (line.demo) {
				if (skillKind === "level" && !showLevelProg) {
					continue;
				}
				if (skillKind !== "level" && !showSkillProg) {
					continue;
				}
			}
			merged.push({
				kind: "skill",
				key: `s-${line.id}`,
				id: line.id,
				text: line.text,
				skillKind,
				icon: line.icon || "",
				color: line.color || "",
				skillName: line.skillName || "",
				demo: line.demo === true,
				addedAt: line.addedAt
			});
		}
	}

	merged.sort((a, b) => a.addedAt - b.addedAt || String(a.key).localeCompare(String(b.key)));

	// Level XP meter is divert-driven (pushed with kSkillIncrease). It rides the newest
	// skill toast's lifetime; with Skill Progress off, pulseAlive still flashes one duration.
	if (
		gizmo.settings.showSkills &&
		gizmo.settings.showLevelProgress !== false
	) {
		let newestSkillIdx = -1;
		let newestAt = -Infinity;
		for (let i = 0; i < merged.length; i++) {
			if (merged[i].kind === "skill" && merged[i].addedAt >= newestAt) {
				newestAt = merged[i].addedAt;
				newestSkillIdx = i;
			}
		}
		const pulseAlive =
			levelProgressLive &&
			levelProgressPulseAt > 0 &&
			now - levelProgressPulseAt < life;
		let progress = levelProgressLive;
		if (editorOpen && !progress) {
			progress = { name: "Level 12", level: 12, xp: 45, threshold: 100, progress: 0.45, percent: 45 };
		}
		// Live meter only when C++ pushed one (or editor demo). Never invent Level 1 / 0%.
		if (progress && (newestSkillIdx >= 0 || pulseAlive || editorOpen)) {
			const skillLine = newestSkillIdx >= 0 ? merged[newestSkillIdx] : null;
			// Piggyback skill toast lifetime; pulse flash uses fixed pulseAt; editor demo mid-hold.
			let addedAt = now - holdAge;
			if (skillLine) {
				addedAt = skillLine.addedAt;
			} else if (pulseAlive) {
				addedAt = levelProgressPulseAt;
			}
			const entry = {
				kind: "level-progress",
				key: "level-progress",
				id: "level-progress",
				name: progress.name || `Level ${progress.level}`,
				percent: Number(progress.percent) || progress.progress * 100 || 0,
				progress: Number(progress.progress) || 0,
				xp: Number(progress.xp) || 0,
				threshold: Number(progress.threshold) || 1,
				icon: progress.icon || "",
				demo: (skillLine && skillLine.demo === true) || (editorOpen && !levelProgressLive),
				addedAt
			};
			if (newestSkillIdx >= 0) {
				merged.splice(newestSkillIdx + 1, 0, entry);
			} else {
				merged.push(entry);
			}
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
	const numberFormat = normalizeNumberFormat(gizmo.settings.numberFormat, DEFAULT_FEED_NUMBER_FORMAT);
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
	const showIcons = gizmo.settings.showSkillIcons !== false;
	const numberFormat = normalizeNumberFormat(gizmo.settings.numberFormat, DEFAULT_FEED_NUMBER_FORMAT);
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
	const w = Math.max(MIN_GIZMO_WIDTH, Number(gizmo.display.width) || DEFAULT_FEED_WIDTH);
	const h = Math.max(MIN_GIZMO_HEIGHT, Number(gizmo.display.height) || DEFAULT_FEED_HEIGHT);
	const css = hudItemLayoutCss(gizmo, w, h);
	el.style.width = `${w}px`;
	el.style.height = `${h}px`;
	el.style.left = `${css.x * 100}%`;
	el.style.top = `${css.y * 100}%`;
	el.style.transform = `rotate(${Number(gizmo.display.rotation) || 0}deg)`;
	el.style.transformOrigin = "50% 50%";
	applyHostMaxAlpha(el, gizmo);
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

/** General backup border — unrecognized Notify colour-var names fall back here. */
function feedColourVarFallback() {
	if (typeof themeBorder === "function") {
		return themeBorder();
	}
	return typeof defaultBorderColor === "function" ? defaultBorderColor() : DEFAULT_GIZMO_GOLD;
}

/**
 * Section-gated colour-var registry for one Feed instance.
 * Builtin Notify passes these names; each Feed resolves to its own hex.
 */
function feedColourVarsForGizmo(gizmo) {
	const s = (gizmo && gizmo.settings) || {};
	const vars = Object.create(null);
	if (s.showNotifications) {
		vars.textColor = optionalHex(s.textColor);
	}
	if (s.showInventory) {
		vars.addColor = optionalHex(s.addColor);
		vars.removeColor = optionalHex(s.removeColor);
		vars.stolenColor = optionalHex(s.stolenColor);
	}
	if (s.showLocation) {
		if (s.showLocationDiscovery !== false) {
			vars.locationDiscoveryColor = optionalHex(s.locationDiscoveryColor);
		}
		if (s.showCurrentLocation !== false) {
			vars.currentLocationColor = optionalHex(s.currentLocationColor);
		}
	}
	if (s.showActiveEffects) {
		vars.effectsColor = optionalHex(s.effectsColor);
	}
	if (s.showSkills) {
		if (s.showSkillProgress !== false) {
			vars.skillProgressColor = optionalHex(s.skillProgressColor);
		}
		if (s.showLevelProgress !== false) {
			vars.levelProgressColor = optionalHex(s.levelProgressColor);
		}
	}
	return vars;
}

/** Resolve Notify asColor: hex pass-through, registered var → settings hex, else backup border. */
function resolveFeedColorToken(gizmo, token) {
	const raw = String(token == null ? "" : token).trim();
	if (!raw) {
		return "";
	}
	const hex = optionalHex(raw);
	if (hex) {
		return hex;
	}
	const vars = feedColourVarsForGizmo(gizmo);
	if (Object.prototype.hasOwnProperty.call(vars, raw)) {
		return vars[raw] || feedColourVarFallback();
	}
	return feedColourVarFallback();
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
	const showNotifIcons = gizmo.settings.showNotificationIcons !== false;
	const showInvIcons = gizmo.settings.showInventoryIcons !== false;
	const showLocIcons = gizmo.settings.showLocationIcons !== false;
	const showSkillIcons = gizmo.settings.showSkillIcons !== false;
	const iconPlace = normalizeFeedIconPlacement(gizmo.settings.iconPlacement);
	const showEffectIcons = gizmo.settings.showEffectIcons === true;
	const showEffectText = gizmo.settings.showEffectText !== false;
	const showEffectTimer = gizmo.settings.showEffectTimer !== false;
	const numberFormat = normalizeNumberFormat(gizmo.settings.numberFormat, DEFAULT_FEED_NUMBER_FORMAT);
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
	const fallbackSkillIcon = normalizeFeedSkillIcon(gizmo.settings.skillProgressIcon);
	const fallbackLevelIcon = normalizeFeedLevelIcon(gizmo.settings.levelProgressIcon);
	const effectsPaint = normalizeHexColor(gizmo.settings.effectsColor || gizmo.settings.textColor, DEFAULT_GIZMO_GOLD);
	const skillProgressPaint = normalizeHexColor(
		gizmo.settings.skillProgressColor || gizmo.settings.textColor,
		DEFAULT_GIZMO_GOLD
	);
	const levelProgressPaint = normalizeHexColor(
		gizmo.settings.levelProgressColor || gizmo.settings.textColor,
		DEFAULT_GIZMO_GOLD
	);
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
					? resolveFeedColorToken(gizmo, line.color) ||
						(line.locationKind === "current" ? currentPaint : discoveryPaint)
					: gizmo.settings.allowModNotificationColor !== false && line.color
						? resolveFeedColorToken(gizmo, line.color) || notifDefault
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
			const skillKind = normalizeSkillKind(line.skillKind);
			const skillsPaint =
				resolveFeedColorToken(gizmo, line.color) ||
				(skillKind === "level" ? levelProgressPaint : skillProgressPaint);
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
					const iconRel =
						normalizeIconRelPath(line.icon) ||
						(skillKind === "level" ? fallbackLevelIcon : fallbackSkillIcon);
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
				nameEl.style.color = levelProgressPaint;
			}
			if (showSkillIcons) {
				const iconHost = row.querySelector(".effect-line-icon");
				if (iconHost) {
					const href = resolveDisplayIconHref(
						normalizeIconRelPath(line.icon) || fallbackLevelIcon
					);
					paintMaskedFace(iconHost, "notification-line-icon-face", {
						color: levelProgressPaint,
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
				bar.style.setProperty("--cog-border", levelProgressPaint);
			}
			const timerEl = row.querySelector(".effect-line-timer");
			if (timerEl) {
				timerEl.textContent = formatFeedLevelProgressValue(line, showProgressTotal);
				timerEl.style.color = levelProgressPaint;
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
			const effectPaint = resolveFeedColorToken(gizmo, line.color) || effectsPaint;
			const nameEl = row.querySelector(".effect-line-name");
			if (nameEl) {
				nameEl.textContent = line.name || "Effect";
				nameEl.style.color = effectPaint;
			}
			if (showEffectIcons) {
				const iconHost = row.querySelector(".effect-line-icon");
				if (iconHost) {
					const iconRel =
						normalizeIconRelPath(line.icon) || fallbackEffectIcon || DEFAULT_FEED_EFFECT_ICON;
					const href = resolveDisplayIconHref(iconRel);
					paintMaskedFace(iconHost, "notification-line-icon-face", {
						color: effectPaint,
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
				bar.style.setProperty("--cog-border", effectPaint);
				bar.style.setProperty("--effect-bar-width", `${progressBarWidth}%`);
			}
			const timerEl = row.querySelector(".effect-line-timer");
			if (timerEl) {
				timerEl.textContent = formatFeedEffectValue(line, showProgressTotal);
				timerEl.style.color = effectPaint;
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
				const paint =
					resolveFeedColorToken(gizmo, line.color) ||
					(!line.added ? removePaint : line.stolen ? stolenPaint : addPaint);
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
		// Relative only — parent gizmo content already applies × maxAlpha via CSS.
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
		if (normalizeGizmoType(gizmo.typeId) !== "cog-feed") {
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

const FEED_TYPE_ID = "cog-feed";

/** Harvestable [tag, en-CA] — section “When enabled…” notes + icon-rules footers. */
const FEED_SECTION_HIDE_NOTES = {
	default: ["cog-feed-section-hides", "When enabled, this section hides {targets}."],
	inventory: [
		"cog-feed-inventory-hide-note",
		"When enabled, this section tracks inventory changes, soft-hides hud.inventory (TrueHUD Recent Loot), and diverts inventory-style notifications from hud.notifications."
	],
	locationBoth: [
		"cog-feed-location-hide-note-both",
		"When enabled, this section hides hud.currentLocation and diverts location discovery from hud.questUpdates."
	],
	locationCurrent: [
		"cog-feed-location-hide-note-current",
		"When enabled, this section hides hud.currentLocation."
	],
	locationDiscovery: [
		"cog-feed-location-hide-note-discovery",
		"When enabled, this section diverts location discovery from hud.questUpdates."
	],
	skills: [
		"cog-feed-skills-hide-note",
		"When enabled, this section soft-hides hud.questUpdates (skill-up and level-up banners share that clip). Skill Progress and Level Progress only control what appears in this Feed. Level Up Menu is never blocked."
	]
};
const FEED_SECTION_ICON_NOTES = {
	default: ["cog-feed-icon-rules", "Rules controlling icons can be found in {folder}."],
	notificationsApi: [
		"cog-feed-icon-rules-notifications-api",
		"Rules controlling icons can be found in {folder}, or overwritten by the Notifications API."
	]
};

function appendFeedSectionNotes(section, hideTargets, iconFolder, opts) {
	opts = opts || {};
	const hideLine = document.createElement("p");
	hideLine.className = "hint feed-section-note";
	const hideEntry = opts.hideEntry || FEED_SECTION_HIDE_NOTES.default;
	const hideTag = hideEntry[0];
	const hideFallback = hideEntry[1];
	const hideVars = opts.hideVars || (hideTag === "cog-feed-section-hides" ? { targets: hideTargets } : null);
	if (hideTag && typeof setTranslatedText === "function") {
		setTranslatedText(hideLine, hideTag, hideFallback, hideVars || undefined, FEED_TYPE_ID);
	} else if (hideTag && hideVars && typeof tf === "function") {
		hideLine.textContent = tf(hideTag, hideFallback, hideVars, FEED_TYPE_ID);
	} else {
		hideLine.textContent = hideVars
			? hideFallback.replace("{targets}", String(hideTargets || ""))
			: hideFallback;
	}
	section.appendChild(hideLine);
	const iconLine = document.createElement("p");
	iconLine.className = "hint feed-section-note";
	const iconEntry = opts.notificationsApi
		? FEED_SECTION_ICON_NOTES.notificationsApi
		: FEED_SECTION_ICON_NOTES.default;
	const iconTag = iconEntry[0];
	const iconFallback = iconEntry[1];
	const iconVars = { folder: iconFolder };
	if (typeof setTranslatedText === "function") {
		setTranslatedText(iconLine, iconTag, iconFallback, iconVars, FEED_TYPE_ID);
	} else {
		iconLine.textContent = iconFallback.replace("{folder}", iconFolder);
	}
	section.appendChild(iconLine);
}

window.CogAppendFeedSectionNotes = function CogAppendFeedSectionNotes(host, hideTargets, iconFolder, opts) {
	if (!host) {
		return;
	}
	host.replaceChildren();
	appendFeedSectionNotes(host, hideTargets, iconFolder, opts || {});
};

window.CogFeedHideNoteEntry = function CogFeedHideNoteEntry(name) {
	return FEED_SECTION_HIDE_NOTES[name] || FEED_SECTION_HIDE_NOTES.default;
};

window.CogFeedStoragePath = function CogFeedStoragePath() {
	return typeof CogGizmoStorage === "function" ? CogGizmoStorage("cog-feed") : "gizmoTypes/cog-feed";
};

window.CogRegisterGizmoRenderer("cog-feed", {
	create() {
		return defaultFeedGizmo(nextGizmoTypeIndex("cog-feed"));
	},
	ensure: ensureFeedGizmo,
	build: buildGizmoFeedEl,
	layout: layoutGizmoFeed,
	paint: paintGizmoFeed
});
