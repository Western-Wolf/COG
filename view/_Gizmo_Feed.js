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
const DEFAULT_FEED_QUEST_STATUS_ICON = "Scribe/scroll.svg";
const DEFAULT_FEED_QUEST_OBJECTIVE_ICON = "Scribe/list.svg";
const DEFAULT_FEED_ICON_PLACEMENT = "left";

/** Canonical Feed source ids (builtins). */
const FEED_SOURCE_NOTIFICATIONS = "cog-notifications";
const FEED_SOURCE_INVENTORY = "cog-inventory";
const FEED_SOURCE_LOCATION = "cog-location";
const FEED_SOURCE_SKILLS = "cog-skills";
const FEED_SOURCE_QUESTS = "cog-quests";
const FEED_SOURCE_EFFECTS = "cog-effects";

const FEED_SOURCE_LEGACY_ALIAS = {
	"cog-feednotifications": FEED_SOURCE_NOTIFICATIONS,
	"cog-feedinventory": FEED_SOURCE_INVENTORY,
	"cog-feedlocation": FEED_SOURCE_LOCATION,
	"cog-feedskills": FEED_SOURCE_SKILLS,
	"cog-feedquests": FEED_SOURCE_QUESTS,
	"cog-feedeffects": FEED_SOURCE_EFFECTS,
	general: FEED_SOURCE_NOTIFICATIONS,
	empty: FEED_SOURCE_NOTIFICATIONS
};

const FEED_SOURCE_LEGACY_SHOW = {
	[FEED_SOURCE_NOTIFICATIONS]: "showNotifications",
	[FEED_SOURCE_INVENTORY]: "showInventory",
	[FEED_SOURCE_LOCATION]: "showLocation",
	[FEED_SOURCE_SKILLS]: "showSkills",
	[FEED_SOURCE_QUESTS]: "showQuests",
	[FEED_SOURCE_EFFECTS]: "showActiveEffects"
};

/** Mod / generic Notify lines keyed by canonical source id. */
const feedSourceLineBuffers = new Map();

/** Builtin catalog fallback when C++ catalog has not arrived yet (checkboxes still work). */
const FEED_BUILTIN_SOURCE_FALLBACK = [
	{
		id: FEED_SOURCE_EFFECTS,
		sourceMod: "COG",
		displayName: "Active Effects",
		hudSuppress: ["hud.activeEffects"],
		colourVars: ["effectsColor"],
		settingsHtml: ""
	},
	{
		id: FEED_SOURCE_INVENTORY,
		sourceMod: "COG",
		displayName: "Inventory",
		hudSuppress: ["hud.inventory"],
		colourVars: ["addColor", "removeColor", "stolenColor"],
		settingsHtml: ""
	},
	{
		id: FEED_SOURCE_LOCATION,
		sourceMod: "COG",
		displayName: "Location",
		hudSuppress: ["hud.currentLocation"],
		colourVars: ["locationDiscoveryColor", "currentLocationColor"],
		settingsHtml: ""
	},
	{
		id: FEED_SOURCE_NOTIFICATIONS,
		sourceMod: "COG",
		displayName: "Notifications",
		hudSuppress: ["hud.notifications"],
		colourVars: ["textColor"],
		settingsHtml: ""
	},
	{
		id: FEED_SOURCE_SKILLS,
		sourceMod: "COG",
		displayName: "Skills",
		hudSuppress: [],
		colourVars: ["skillProgressColor", "levelProgressColor"],
		settingsHtml: ""
	},
	{
		id: FEED_SOURCE_QUESTS,
		sourceMod: "COG",
		displayName: "Quests",
		hudSuppress: [],
		colourVars: ["questStatusColor", "questObjectiveColor"],
		settingsHtml: ""
	}
];

window.CogFeedSourceCatalog = window.CogFeedSourceCatalog || [];

/** Merged catalog for Sources UI / suppress / paint extras (prefers live C++ catalog). */
window.CogFeedSourceCatalogResolved = function CogFeedSourceCatalogResolved() {
	const live = window.CogFeedSourceCatalog;
	if (Array.isArray(live) && live.length) {
		return live.slice();
	}
	if (typeof snapshot !== "undefined" && Array.isArray(snapshot.feedSources) && snapshot.feedSources.length) {
		return snapshot.feedSources.slice();
	}
	return FEED_BUILTIN_SOURCE_FALLBACK.slice();
};

window.CogFeedSourceStorage = function CogFeedSourceStorage(sourceId) {
	const id = String(sourceId || "").trim();
	if (!id) {
		return "";
	}
	const base =
		typeof window.CogFeedStoragePath === "function"
			? window.CogFeedStoragePath()
			: "gizmoTypes/cog-feed";
	return `${base}/sources/${id}`;
};

function feedCanonicalSourceId(raw) {
	const s = String(raw == null ? "" : raw).trim();
	if (!s) {
		return "";
	}
	const lower = s.toLowerCase();
	if (Object.prototype.hasOwnProperty.call(FEED_SOURCE_LEGACY_ALIAS, lower)) {
		return FEED_SOURCE_LEGACY_ALIAS[lower];
	}
	if (
		lower === FEED_SOURCE_NOTIFICATIONS ||
		lower === FEED_SOURCE_INVENTORY ||
		lower === FEED_SOURCE_LOCATION ||
		lower === FEED_SOURCE_SKILLS ||
		lower === FEED_SOURCE_QUESTS ||
		lower === FEED_SOURCE_EFFECTS
	) {
		return lower;
	}
	return s;
}

function feedRouteSourceId(raw) {
	const canon = feedCanonicalSourceId(raw);
	if (!canon) {
		return FEED_SOURCE_NOTIFICATIONS;
	}
	const catalog = window.CogFeedSourceCatalog || [];
	if (catalog.some((e) => e && e.id === canon)) {
		return canon;
	}
	if (
		canon === FEED_SOURCE_NOTIFICATIONS ||
		canon === FEED_SOURCE_INVENTORY ||
		canon === FEED_SOURCE_LOCATION ||
		canon === FEED_SOURCE_SKILLS ||
		canon === FEED_SOURCE_QUESTS ||
		canon === FEED_SOURCE_EFFECTS
	) {
		return canon;
	}
	return FEED_SOURCE_NOTIFICATIONS;
}

function feedSourceBag(settings, sourceId) {
	const s = settings && typeof settings === "object" ? settings : {};
	if (!s.sources || typeof s.sources !== "object") {
		s.sources = {};
	}
	if (!s.sources[sourceId] || typeof s.sources[sourceId] !== "object") {
		s.sources[sourceId] = {};
	}
	return s.sources[sourceId];
}

function feedTruthyFlag(value) {
	return value === true || value === "true" || value === 1 || value === "1";
}

function feedSourceEnabled(settings, sourceId) {
	const id = feedCanonicalSourceId(sourceId) || sourceId;
	const s = settings || {};
	const block = s.sources && s.sources[id];
	if (block && typeof block === "object" && Object.prototype.hasOwnProperty.call(block, "enabled")) {
		return feedTruthyFlag(block.enabled);
	}
	const legacy = FEED_SOURCE_LEGACY_SHOW[id];
	if (legacy) {
		return feedTruthyFlag(s[legacy]);
	}
	return false;
}

function feedSourceField(settings, sourceId, key, fallback) {
	const id = feedCanonicalSourceId(sourceId) || sourceId;
	const s = settings || {};
	const block = s.sources && s.sources[id];
	if (block && typeof block === "object" && Object.prototype.hasOwnProperty.call(block, key)) {
		const v = block[key];
		return v == null ? fallback : v;
	}
	if (Object.prototype.hasOwnProperty.call(s, key)) {
		const v = s[key];
		return v == null ? fallback : v;
	}
	return fallback;
}

function feedSourceFieldBool(settings, sourceId, key, fallback) {
	const v = feedSourceField(settings, sourceId, key, fallback);
	if (v === true || v === "true") {
		return true;
	}
	if (v === false || v === "false") {
		return false;
	}
	return !!fallback;
}

function defaultFeedSourceBlocks() {
	return {
		[FEED_SOURCE_NOTIFICATIONS]: {
			enabled: false,
			textColor: DEFAULT_GIZMO_GOLD,
			notificationIcon: DEFAULT_FEED_NOTIFICATION_ICON,
			showNotificationIcons: true,
			allowModNotificationIcon: true,
			allowModNotificationColor: true,
			suppressInventory: true
		},
		[FEED_SOURCE_INVENTORY]: {
			enabled: false,
			addColor: DEFAULT_GIZMO_GOLD,
			removeColor: DEFAULT_GIZMO_GOLD,
			stolenColor: DEFAULT_GIZMO_GOLD,
			icon: DEFAULT_FEED_INVENTORY_ICON,
			showInventoryIcons: true
		},
		[FEED_SOURCE_LOCATION]: {
			enabled: false,
			showLocationDiscovery: true,
			showCurrentLocation: true,
			locationDiscoveryIcon: DEFAULT_FEED_LOCATION_DISCOVERY_ICON,
			currentLocationIcon: DEFAULT_FEED_CURRENT_LOCATION_ICON,
			locationDiscoveryColor: DEFAULT_GIZMO_GOLD,
			currentLocationColor: DEFAULT_GIZMO_GOLD,
			showLocationIcons: true
		},
		[FEED_SOURCE_SKILLS]: {
			enabled: false,
			showSkillProgress: true,
			showLevelProgress: true,
			skillProgressIcon: DEFAULT_FEED_SKILL_ICON,
			levelProgressIcon: DEFAULT_FEED_LEVEL_ICON,
			skillProgressColor: DEFAULT_GIZMO_GOLD,
			levelProgressColor: DEFAULT_GIZMO_GOLD,
			showSkillIcons: true
		},
		[FEED_SOURCE_QUESTS]: {
			enabled: false,
			showQuestStatus: true,
			showQuestObjectives: true,
			questStatusIcon: DEFAULT_FEED_QUEST_STATUS_ICON,
			questObjectiveIcon: DEFAULT_FEED_QUEST_OBJECTIVE_ICON,
			questStatusColor: DEFAULT_GIZMO_GOLD,
			questObjectiveColor: DEFAULT_GIZMO_GOLD,
			showQuestIcons: true
		},
		[FEED_SOURCE_EFFECTS]: {
			enabled: false,
			effectsColor: DEFAULT_GIZMO_GOLD,
			effectIcon: DEFAULT_FEED_EFFECT_ICON,
			showEffectIcons: true,
			showEffectText: true,
			showEffectTimer: true,
			suppressTransformEffects: true
		}
	};
}

/** hudSuppress alias → builtin source id (recover enables after a bad flat→nested pass). */
const FEED_SUPPRESS_ALIAS_TO_SOURCE = {
	"hud.notifications": FEED_SOURCE_NOTIFICATIONS,
	"hud.inventory": FEED_SOURCE_INVENTORY,
	"hud.currentLocation": FEED_SOURCE_LOCATION,
	"hud.questUpdates": FEED_SOURCE_SKILLS,
	"hud.activeEffects": FEED_SOURCE_EFFECTS
};

/** Bump when heal rules change so one-shot recovery can re-run on older bags. */
const FEED_SOURCES_VERSION = 3;

function feedSourcesBagLooksValid(sources) {
	if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
		return false;
	}
	const defaults = defaultFeedSourceBlocks();
	for (const id of Object.keys(defaults)) {
		const block = sources[id];
		if (!block || typeof block !== "object" || Array.isArray(block)) {
			return false;
		}
		if (!Object.prototype.hasOwnProperty.call(block, "enabled")) {
			return false;
		}
	}
	return true;
}

/**
 * Migration / heal: flat show* + colours → settings.sources.<id>.
 * Always rewrites when bag/blocks/flat keys are malformed (not a one-shot flag-only gate).
 */
function migrateFeedFlatSources(s, gizmo) {
	if (!s || typeof s !== "object") {
		return false;
	}
	let migrated = false;
	const movedKeys = [
		"textColor",
		"addColor",
		"removeColor",
		"stolenColor",
		"effectsColor",
		"effectIcon",
		"notificationIcon",
		"icon",
		"showEffectIcons",
		"showEffectText",
		"showEffectTimer",
		"suppressTransformEffects",
		"showNotificationIcons",
		"showInventoryIcons",
		"showLocationIcons",
		"showSkillIcons",
		"allowModNotificationIcon",
		"allowModNotificationColor",
		"suppressInventory",
		"showLocationDiscovery",
		"showCurrentLocation",
		"locationDiscoveryIcon",
		"currentLocationIcon",
		"locationDiscoveryColor",
		"currentLocationColor",
		"showSkillProgress",
		"showLevelProgress",
		"skillProgressIcon",
		"levelProgressIcon",
		"skillProgressColor",
		"levelProgressColor",
		"questStatusIcon",
		"questObjectiveIcon",
		"questStatusColor",
		"questObjectiveColor",
		"showQuestStatus",
		"showQuestObjectives",
		"showQuestIcons"
	];
	const hadNoSourcesBag = !s.sources || typeof s.sources !== "object" || Array.isArray(s.sources);
	const legacyShowPresent = Object.values(FEED_SOURCE_LEGACY_SHOW).some((k) =>
		Object.prototype.hasOwnProperty.call(s, k)
	);
	const legacyFlatPresent = movedKeys.some((k) => Object.prototype.hasOwnProperty.call(s, k));
	const haveVersion = Number(s.feedSourcesVersion);
	const versionOk = Number.isFinite(haveVersion) && haveVersion >= FEED_SOURCES_VERSION;
	const bagOk = !hadNoSourcesBag && feedSourcesBagLooksValid(s.sources);
	const needsHeal = !bagOk || legacyShowPresent || legacyFlatPresent || !versionOk;
	const needsSuppressRecover =
		(!versionOk || s.feedSourcesMigrated === true || s.feedSourcesMigrated === 1) &&
		!legacyShowPresent;
	if (hadNoSourcesBag) {
		s.sources = {};
		migrated = true;
	}
	const defaults = defaultFeedSourceBlocks();
	const catalog =
		typeof window.CogFeedSourceCatalogResolved === "function"
			? window.CogFeedSourceCatalogResolved()
			: Array.isArray(window.CogFeedSourceCatalog)
				? window.CogFeedSourceCatalog
				: [];
	const ids = new Set(Object.keys(defaults));
	for (const entry of catalog) {
		if (entry && entry.id) {
			ids.add(String(entry.id));
		}
	}
	// 1) Ensure every available source block exists (builtins + catalog).
	for (const id of ids) {
		const def = defaults[id] || { enabled: false };
		const prev = s.sources[id] && typeof s.sources[id] === "object" && !Array.isArray(s.sources[id])
			? s.sources[id]
			: null;
		if (!prev) {
			migrated = true;
		}
		const block = { ...def, ...(prev || {}) };
		for (const key of Object.keys(def)) {
			if (key === "enabled") {
				continue;
			}
			if (Object.prototype.hasOwnProperty.call(s, key) && s[key] != null) {
				block[key] = s[key];
				migrated = true;
			}
		}
		if (!Object.prototype.hasOwnProperty.call(block, "enabled")) {
			block.enabled = false;
			migrated = true;
		}
		s.sources[id] = block;
	}
	// 2) Flat show* → nested enabled (legacy shape or heal pass).
	if (needsHeal || legacyShowPresent) {
		for (const [id, showKey] of Object.entries(FEED_SOURCE_LEGACY_SHOW)) {
			if (!Object.prototype.hasOwnProperty.call(s, showKey)) {
				continue;
			}
			const block = feedSourceBag(s, id);
			const next = feedTruthyFlag(s[showKey]);
			if (block.enabled !== next) {
				block.enabled = next;
				migrated = true;
			}
		}
	}
	const anyEnabled = [...ids].some((id) => feedSourceEnabled(s, id));
	// Recover enables from soft-hide list when flat show* were already wiped but bag was bad.
	if (
		needsHeal &&
		needsSuppressRecover &&
		!anyEnabled &&
		gizmo &&
		Array.isArray(gizmo.hudSuppress) &&
		gizmo.hudSuppress.length
	) {
		for (const alias of gizmo.hudSuppress) {
			const sourceId = FEED_SUPPRESS_ALIAS_TO_SOURCE[String(alias || "")];
			if (!sourceId || !s.sources[sourceId]) {
				continue;
			}
			if (!feedTruthyFlag(s.sources[sourceId].enabled)) {
				s.sources[sourceId].enabled = true;
				migrated = true;
			}
		}
	}
	for (const showKey of Object.values(FEED_SOURCE_LEGACY_SHOW)) {
		if (Object.prototype.hasOwnProperty.call(s, showKey)) {
			delete s[showKey];
			migrated = true;
		}
	}
	for (const key of movedKeys) {
		if (Object.prototype.hasOwnProperty.call(s, key)) {
			delete s[key];
			migrated = true;
		}
	}
	if (s.feedSourcesVersion !== FEED_SOURCES_VERSION) {
		s.feedSourcesVersion = FEED_SOURCES_VERSION;
		migrated = true;
	}
	if (Object.prototype.hasOwnProperty.call(s, "feedSourcesMigrated")) {
		delete s.feedSourcesMigrated;
		migrated = true;
	}
	return migrated || needsHeal;
}

function scheduleFeedSettingsPersist() {
	if (!layoutHydrated || typeof scheduleSave !== "function") {
		return;
	}
	scheduleSave(false);
}

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

function normalizeFeedQuestStatusIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_QUEST_STATUS_ICON);
}

function normalizeFeedQuestObjectiveIcon(value) {
	return normalizeFeedIcon(value, DEFAULT_FEED_QUEST_OBJECTIVE_ICON);
}

function normalizeQuestKind(value) {
	return String(value || "").toLowerCase() === "objective" ? "objective" : "status";
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
		maxVisible: DEFAULT_FEED_MAX,
		stackOrigin: DEFAULT_FEED_STACK_ORIGIN,
		duration: DEFAULT_FEED_DURATION,
		fade: DEFAULT_FEED_FADE,
		timerMinSec: 1,
		timerMaxSec: 180,
		progressBarWidth: DEFAULT_FEED_PROGRESS_BAR_WIDTH,
		numberFormat: DEFAULT_FEED_NUMBER_FORMAT,
		barColor: typeof defaultFillColor === "function" ? defaultFillColor() : "#c4a35a",
		backdropColor: DEFAULT_FEED_BACKDROP_COLOR,
		backdropOpacity: DEFAULT_FEED_BACKDROP_OPACITY,
		backdropDirection: DEFAULT_FEED_BACKDROP_DIRECTION,
		sources: defaultFeedSourceBlocks()
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

/** Soft-hide aliases: union of registered hudSuppress for enabled sources (flat). */
function feedHudSuppressKeysFromSettings(s) {
	const keys = [];
	const seen = Object.create(null);
	const catalog =
		typeof window.CogFeedSourceCatalogResolved === "function"
			? window.CogFeedSourceCatalogResolved()
			: window.CogFeedSourceCatalog || [];
	for (const entry of catalog) {
		if (!entry || !entry.id || !feedSourceEnabled(s, entry.id)) {
			continue;
		}
		const list = Array.isArray(entry.hudSuppress) ? entry.hudSuppress : [];
		for (const alias of list) {
			if (!alias || seen[alias]) {
				continue;
			}
			seen[alias] = true;
			keys.push(alias);
		}
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
	s.numberFormat = normalizeNumberFormat(s.numberFormat, DEFAULT_FEED_NUMBER_FORMAT);
	s.progressBarWidth = feedProgressBarWidth(s);
	s.barColor = optionalHex(s.barColor);
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
	// Nested sources bag (flat show* keys / colours migrate in; hudSuppress recovers enables).
	const sourcesMigrated = migrateFeedFlatSources(s, gizmo);
	{
		const n = feedSourceBag(s, FEED_SOURCE_NOTIFICATIONS);
		n.enabled = feedTruthyFlag(n.enabled);
		n.textColor = optionalHex(n.textColor);
		n.notificationIcon = normalizeFeedNotificationIcon(n.notificationIcon);
		n.showNotificationIcons = n.showNotificationIcons !== false;
		n.allowModNotificationIcon = n.allowModNotificationIcon !== false;
		n.allowModNotificationColor = n.allowModNotificationColor !== false;
		n.suppressInventory = n.suppressInventory !== false;
	}
	{
		const inv = feedSourceBag(s, FEED_SOURCE_INVENTORY);
		inv.enabled = feedTruthyFlag(inv.enabled);
		inv.addColor = optionalHex(inv.addColor);
		inv.removeColor = optionalHex(inv.removeColor);
		inv.stolenColor = optionalHex(inv.stolenColor);
		inv.icon = normalizeFeedInventoryIcon(inv.icon);
		inv.showInventoryIcons = inv.showInventoryIcons !== false;
	}
	{
		const loc = feedSourceBag(s, FEED_SOURCE_LOCATION);
		loc.enabled = feedTruthyFlag(loc.enabled);
		loc.showLocationDiscovery = loc.showLocationDiscovery !== false;
		loc.showCurrentLocation = loc.showCurrentLocation !== false;
		loc.locationDiscoveryIcon = normalizeFeedLocationDiscoveryIcon(loc.locationDiscoveryIcon);
		loc.currentLocationIcon = normalizeFeedCurrentLocationIcon(loc.currentLocationIcon);
		loc.locationDiscoveryColor = optionalHex(loc.locationDiscoveryColor);
		loc.currentLocationColor = optionalHex(loc.currentLocationColor);
		loc.showLocationIcons = loc.showLocationIcons !== false;
	}
	{
		const sk = feedSourceBag(s, FEED_SOURCE_SKILLS);
		sk.enabled = feedTruthyFlag(sk.enabled);
		sk.showSkillProgress = sk.showSkillProgress !== false;
		sk.showLevelProgress = sk.showLevelProgress !== false;
		sk.skillProgressIcon = normalizeFeedSkillIcon(sk.skillProgressIcon);
		sk.levelProgressIcon = normalizeFeedLevelIcon(sk.levelProgressIcon);
		sk.skillProgressColor = optionalHex(sk.skillProgressColor);
		sk.levelProgressColor = optionalHex(sk.levelProgressColor);
		sk.showSkillIcons = sk.showSkillIcons !== false;
	}
	{
		const q = feedSourceBag(s, FEED_SOURCE_QUESTS);
		q.enabled = feedTruthyFlag(q.enabled);
		q.showQuestStatus = q.showQuestStatus !== false;
		q.showQuestObjectives = q.showQuestObjectives !== false;
		q.questStatusIcon = normalizeFeedQuestStatusIcon(q.questStatusIcon);
		q.questObjectiveIcon = normalizeFeedQuestObjectiveIcon(q.questObjectiveIcon);
		q.questStatusColor = optionalHex(q.questStatusColor);
		q.questObjectiveColor = optionalHex(q.questObjectiveColor);
		q.showQuestIcons = q.showQuestIcons !== false;
	}
	{
		const fx = feedSourceBag(s, FEED_SOURCE_EFFECTS);
		fx.enabled = feedTruthyFlag(fx.enabled);
		fx.effectsColor = optionalHex(fx.effectsColor);
		fx.effectIcon = normalizeFeedEffectIcon(fx.effectIcon);
		fx.showEffectIcons = fx.showEffectIcons !== false;
		fx.showEffectText = fx.showEffectText !== false;
		fx.showEffectTimer = fx.showEffectTimer !== false;
		fx.suppressTransformEffects = fx.suppressTransformEffects !== false;
		if (!fx.showEffectIcons && !fx.showEffectText && !fx.showEffectTimer) {
			fx.showEffectText = true;
		}
	}
	// Normalize enabled on any extra (mod) catalog sources pushed above.
	if (s.sources && typeof s.sources === "object") {
		for (const block of Object.values(s.sources)) {
			if (block && typeof block === "object" && Object.prototype.hasOwnProperty.call(block, "enabled")) {
				block.enabled = feedTruthyFlag(block.enabled);
			}
		}
	}
	// Drop leftover flat textColor from pre-migration ensureGizmoSettings merges.
	delete s.textColor;
	delete s.addColor;
	delete s.removeColor;
	delete s.stolenColor;
	delete s.icon;
	gizmo.typeId = "cog-feed";
	// Missing visibility → type default (cog-feed→ui), not a hard-coded coerce of "hud".
	gizmo.visibility = coalesceGizmoVisibility(gizmo, "cog-feed");
	gizmo.hudSuppress = feedHudSuppressKeysFromSettings(s);
	gizmo.settings = s;
	gizmo.settingsJson = JSON.stringify(s);
	if (sourcesMigrated) {
		scheduleFeedSettingsPersist();
	}
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
let questFeedLines = [];
let questFeedSeq = 1;
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
	const sourceRaw = String(incoming.source == null ? "" : incoming.source).trim();
	const source = feedRouteSourceId(sourceRaw);
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
	if (hasMeter && (source === FEED_SOURCE_SKILLS || source.indexOf("skill") >= 0)) {
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

	if (source === FEED_SOURCE_INVENTORY) {
		enqueueInventoryFeedLine(text, 0, true, icon, id, false, {
			...noPaint,
			color: color || ""
		});
		return;
	}
	if (source === FEED_SOURCE_LOCATION) {
		// Icon/colour are fully resolved by the location source; kind only affects demo filters.
		enqueueLocationFeedLine(text, "discovery", id, icon, {
			...noPaint,
			color: color || ""
		});
		return;
	}
	if (source === FEED_SOURCE_SKILLS) {
		enqueueSkillFeedLine(text, "skill", icon, "", id, {
			...noPaint,
			color: color || ""
		});
		return;
	}
	if (source === FEED_SOURCE_QUESTS) {
		// Colour token owner distinguishes status vs objective; default status.
		const questKind =
			String(color || "").indexOf("questObjective") >= 0 ? "objective" : "status";
		enqueueQuestFeedLine(text, questKind, icon, id, {
			...noPaint,
			color: color || ""
		});
		return;
	}
	if (source === FEED_SOURCE_NOTIFICATIONS || source === FEED_SOURCE_EFFECTS) {
		enqueueNotificationFeedLine(text, color, id, icon, noPaint);
		return;
	}
	// Mod / generic registered sources — Notifications-style toast chrome in that source's buffer.
	enqueueGenericSourceFeedLine(source, text, color, id, icon, noPaint);
}

function enqueueGenericSourceFeedLine(sourceId, text, color, id, icon, opts) {
	const now = performance.now();
	const entry = {
		id: id != null ? id : notificationFeedSeq++,
		text: String(text || ""),
		color: color || "",
		icon: normalizeIconRelPath(icon) || "",
		addedAt: now
	};
	let list = feedSourceLineBuffers.get(sourceId);
	if (!list) {
		list = [];
		feedSourceLineBuffers.set(sourceId, list);
	}
	list.push(entry);
	feedSourceLineBuffers.set(sourceId, pruneFeedLineRing(list, now));
	if (!(opts && opts.noPaint) && typeof paintAllGizmos === "function") {
		paintAllGizmos();
	}
}

const NOTIFICATION_FEED_PREVIEW_DEMO_COLOR = "#c4a35a";
const NOTIFICATION_FEED_PREVIEW_DEMO_ICON = "Actions/shout.svg";

function notificationFeedPreviewSamples(gizmo) {
	const allowIcon = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, 'allowModNotificationIcon', true) !== false;
	const allowColor = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, 'allowModNotificationColor', true) !== false;
	const showIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, 'showNotificationIcons', true) !== false;

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

function enqueueQuestFeedLine(text, kind, icon, id, opts) {
	const now = performance.now();
	const entry = {
		id: id != null ? Number(id) : questFeedSeq++,
		text: String(text || "").trim(),
		kind: normalizeQuestKind(kind),
		icon: normalizeIconRelPath(icon) || "",
		color: opts && opts.color ? String(opts.color) : "",
		addedAt: now
	};
	if (!entry.text) {
		return;
	}
	questFeedLines.push(entry);
	questFeedLines = pruneFeedLineRing(questFeedLines, now);
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
				} else if (channel === "quest" || channel === "quests") {
					enqueueQuestFeedLine(
						incoming.text,
						incoming.kind,
						incoming.icon,
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


	if (feedSourceEnabled(gizmo.settings, FEED_SOURCE_NOTIFICATIONS)) {
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


	if (feedSourceEnabled(gizmo.settings, FEED_SOURCE_INVENTORY)) {
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


	if (feedSourceEnabled(gizmo.settings, FEED_SOURCE_LOCATION)) {
		let source = locationFeedLines;
		if (editorOpen) {
			const aliveReal = locationFeedLines.filter((line) => now - line.addedAt < life);
			if (!aliveReal.length) {
				source = LOCATION_FEED_PREVIEW.filter((sample) => {
					if (sample.kind === "discovery") {
						return feedSourceFieldBool(gizmo.settings, FEED_SOURCE_LOCATION, 'showLocationDiscovery', true) !== false;
					}
					return feedSourceFieldBool(gizmo.settings, FEED_SOURCE_LOCATION, 'showCurrentLocation', true) !== false;
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
				if (locKind === "discovery" && feedSourceFieldBool(gizmo.settings, FEED_SOURCE_LOCATION, 'showLocationDiscovery', true) === false) {
					continue;
				}
				if (locKind === "current" && feedSourceFieldBool(gizmo.settings, FEED_SOURCE_LOCATION, 'showCurrentLocation', true) === false) {
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


	if (feedSourceEnabled(gizmo.settings, FEED_SOURCE_EFFECTS)) {
		const effectFade = Math.max(1, fade);
		const pushEffect = (effect, active) => {
			const isDemo = effect && effect.demo === true;
			// Editor demos ignore min/max window and transform suppress so the section
			// stays visible while tuning filters with the menu open.
			if (!isDemo) {
				if (!effectPassesTimeWindow(effect, gizmo, { fading: !active })) {
					return;
				}
				if (feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, 'suppressTransformEffects', true) !== false && effect.transform) {
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
				if (feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, 'suppressTransformEffects', true) !== false && e.transform) {
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

	if (feedSourceEnabled(gizmo.settings, FEED_SOURCE_SKILLS)) {
		const showSkillProg = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_SKILLS, 'showSkillProgress', true) !== false;
		const showLevelProg = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_SKILLS, 'showLevelProgress', true) !== false;
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

	if (feedSourceEnabled(gizmo.settings, FEED_SOURCE_QUESTS)) {
		const showStatus =
			feedSourceFieldBool(gizmo.settings, FEED_SOURCE_QUESTS, "showQuestStatus", true) !== false;
		const showObjectives =
			feedSourceFieldBool(gizmo.settings, FEED_SOURCE_QUESTS, "showQuestObjectives", true) !== false;
		for (const line of questFeedLines) {
			if (now - line.addedAt >= life) {
				continue;
			}
			const questKind = normalizeQuestKind(line.kind);
			if (questKind === "objective" && !showObjectives) {
				continue;
			}
			if (questKind !== "objective" && !showStatus) {
				continue;
			}
			merged.push({
				kind: "quest",
				key: `q-${line.id}`,
				id: line.id,
				text: line.text,
				questKind,
				icon: line.icon || "",
				color: line.color || "",
				addedAt: line.addedAt
			});
		}
	}

	// Mod / generic registered sources — Notifications-style toast chrome.
	{
		const catalog =
			typeof window.CogFeedSourceCatalogResolved === "function"
				? window.CogFeedSourceCatalogResolved()
				: window.CogFeedSourceCatalog || [];
		const builtins = new Set([
			FEED_SOURCE_NOTIFICATIONS,
			FEED_SOURCE_INVENTORY,
			FEED_SOURCE_LOCATION,
			FEED_SOURCE_SKILLS,
			FEED_SOURCE_QUESTS,
			FEED_SOURCE_EFFECTS
		]);
		const extras = catalog
			.filter((e) => e && e.id && !builtins.has(e.id) && feedSourceEnabled(gizmo.settings, e.id))
			.slice()
			.sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id)));
		for (const entry of extras) {
			const list = feedSourceLineBuffers.get(entry.id) || [];
			for (const line of list) {
				if (now - line.addedAt >= life) {
					continue;
				}
				merged.push({
					kind: "notification",
					key: `src-${entry.id}-${line.id}`,
					id: line.id,
					text: line.text,
					color: line.color,
					icon: line.icon || "",
					demo: false,
					addedAt: line.addedAt,
					sourceId: entry.id
				});
			}
		}
	}

	merged.sort((a, b) => a.addedAt - b.addedAt || String(a.key).localeCompare(String(b.key)));

	// Level XP meter is divert-driven (pushed with kSkillIncrease). It rides the newest
	// skill toast's lifetime; with Skill Progress off, pulseAlive still flashes one duration.
	if (
		feedSourceEnabled(gizmo.settings, FEED_SOURCE_SKILLS) &&
		feedSourceFieldBool(gizmo.settings, FEED_SOURCE_SKILLS, 'showLevelProgress', true) !== false
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
	const showIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, "showEffectIcons", true);
	const showText = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, "showEffectText", true);
	const showTimer = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, "showEffectTimer", true);
	rebuildFeedMeterLineContent(row, gizmo, {
		showIcons,
		showText,
		enableMeter: showTimer,
		layoutFlags: [showIcons ? "1" : "0", showText ? "1" : "0", showTimer ? "1" : "0"]
	});
}

function rebuildLevelProgressLineContent(row, gizmo) {
	const showIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_SKILLS, "showSkillIcons", true);
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
		normalizeHexColor(
			feedSourceField(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, "textColor", DEFAULT_GIZMO_GOLD),
			DEFAULT_GIZMO_GOLD
		)
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

/** Legacy bare colour-var names → owning builtin source (migration only). */
const FEED_LEGACY_COLOUR_OWNER = {
	textColor: FEED_SOURCE_NOTIFICATIONS,
	addColor: FEED_SOURCE_INVENTORY,
	removeColor: FEED_SOURCE_INVENTORY,
	stolenColor: FEED_SOURCE_INVENTORY,
	locationDiscoveryColor: FEED_SOURCE_LOCATION,
	currentLocationColor: FEED_SOURCE_LOCATION,
	effectsColor: FEED_SOURCE_EFFECTS,
	skillProgressColor: FEED_SOURCE_SKILLS,
	levelProgressColor: FEED_SOURCE_SKILLS,
	questStatusColor: FEED_SOURCE_QUESTS,
	questObjectiveColor: FEED_SOURCE_QUESTS
};

/** Default colour for a registered mod source (colourVars[0], else textColor). */
function resolveModSourceDefaultColor(gizmo, sourceId, fallback) {
	const id = String(sourceId || "").trim();
	if (!id) {
		return fallback;
	}
	const catalog =
		typeof window.CogFeedSourceCatalogResolved === "function"
			? window.CogFeedSourceCatalogResolved()
			: window.CogFeedSourceCatalog || [];
	const entry = catalog.find((e) => e && e.id === id);
	const vars = entry && Array.isArray(entry.colourVars) ? entry.colourVars : [];
	for (const name of vars) {
		const hex = optionalHex(feedSourceField((gizmo && gizmo.settings) || {}, id, name, ""));
		if (hex) {
			return normalizeHexColor(hex, fallback);
		}
	}
	const text = optionalHex(feedSourceField((gizmo && gizmo.settings) || {}, id, "textColor", ""));
	if (text) {
		return normalizeHexColor(text, fallback);
	}
	return fallback;
}

/** Resolve Notify asColor: #hex or sourceId.varName against instance settings. */
function resolveFeedColorToken(gizmo, token) {
	const raw = String(token == null ? "" : token).trim();
	if (!raw) {
		return "";
	}
	const hex = optionalHex(raw);
	if (hex) {
		return hex;
	}
	const s = (gizmo && gizmo.settings) || {};
	const dot = raw.indexOf(".");
	if (dot > 0) {
		const sourceId = feedCanonicalSourceId(raw.slice(0, dot)) || raw.slice(0, dot);
		const varName = raw.slice(dot + 1);
		if (sourceId && varName) {
			const v = feedSourceField(s, sourceId, varName, "");
			return optionalHex(v) || feedColourVarFallback();
		}
	}
	// Migration: bare legacy names → owning builtin source.
	const owner = FEED_LEGACY_COLOUR_OWNER[raw];
	if (owner) {
		const v = feedSourceField(s, owner, raw, "");
		return optionalHex(v) || feedColourVarFallback();
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
	const notifDefault = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, "textColor", DEFAULT_GIZMO_GOLD),
		DEFAULT_GIZMO_GOLD
	);
	const addPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_INVENTORY, "addColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const removePaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_INVENTORY, "removeColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const stolenPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_INVENTORY, "stolenColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const fallbackInvIcon =
		normalizeIconRelPath(feedSourceField(gizmo.settings, FEED_SOURCE_INVENTORY, "icon", "")) ||
		DEFAULT_FEED_INVENTORY_ICON;
	const fallbackNotifIcon = normalizeFeedNotificationIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, "notificationIcon", DEFAULT_FEED_NOTIFICATION_ICON)
	);
	const discoveryIcon = normalizeFeedLocationDiscoveryIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_LOCATION, "locationDiscoveryIcon", DEFAULT_FEED_LOCATION_DISCOVERY_ICON)
	);
	const currentIcon = normalizeFeedCurrentLocationIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_LOCATION, "currentLocationIcon", DEFAULT_FEED_CURRENT_LOCATION_ICON)
	);
	const discoveryPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_LOCATION, "locationDiscoveryColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const currentPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_LOCATION, "currentLocationColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const showNotifIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, "showNotificationIcons", true);
	const showInvIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_INVENTORY, "showInventoryIcons", true);
	const showLocIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_LOCATION, "showLocationIcons", true);
	const showSkillIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_SKILLS, "showSkillIcons", true);
	const showQuestIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_QUESTS, "showQuestIcons", true);
	const iconPlace = normalizeFeedIconPlacement(gizmo.settings.iconPlacement);
	const showEffectIcons = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, "showEffectIcons", true);
	const showEffectText = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, "showEffectText", true);
	const showEffectTimer = feedSourceFieldBool(gizmo.settings, FEED_SOURCE_EFFECTS, "showEffectTimer", true);
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
	const fallbackEffectIcon = normalizeFeedEffectIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_EFFECTS, "effectIcon", DEFAULT_FEED_EFFECT_ICON)
	);
	const fallbackSkillIcon = normalizeFeedSkillIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_SKILLS, "skillProgressIcon", DEFAULT_FEED_SKILL_ICON)
	);
	const fallbackLevelIcon = normalizeFeedLevelIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_SKILLS, "levelProgressIcon", DEFAULT_FEED_LEVEL_ICON)
	);
	const fallbackQuestStatusIcon = normalizeFeedQuestStatusIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_QUESTS, "questStatusIcon", DEFAULT_FEED_QUEST_STATUS_ICON)
	);
	const fallbackQuestObjectiveIcon = normalizeFeedQuestObjectiveIcon(
		feedSourceField(gizmo.settings, FEED_SOURCE_QUESTS, "questObjectiveIcon", DEFAULT_FEED_QUEST_OBJECTIVE_ICON)
	);
	const effectsPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_EFFECTS, "effectsColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const skillProgressPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_SKILLS, "skillProgressColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const levelProgressPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_SKILLS, "levelProgressColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const questStatusPaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_QUESTS, "questStatusColor", notifDefault),
		DEFAULT_GIZMO_GOLD
	);
	const questObjectivePaint = normalizeHexColor(
		feedSourceField(gizmo.settings, FEED_SOURCE_QUESTS, "questObjectiveColor", notifDefault),
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
			const modSourceId = wantKind === "notification" && line.sourceId ? String(line.sourceId) : "";
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
			let paint = notifDefault;
			if (wantKind === "location") {
				paint =
					resolveFeedColorToken(gizmo, line.color) ||
					(line.locationKind === "current" ? currentPaint : discoveryPaint);
			} else if (modSourceId) {
				// Registered mod source: token / line colour, else that source's colourVars / textColor.
				paint =
					resolveFeedColorToken(gizmo, line.color) ||
					resolveModSourceDefaultColor(gizmo, modSourceId, notifDefault);
			} else if (
				feedSourceFieldBool(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, "allowModNotificationColor", true) !==
					false &&
				line.color
			) {
				paint = resolveFeedColorToken(gizmo, line.color) || notifDefault;
			}
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
					} else if (modSourceId) {
						// Caller asIcon wins; empty → source settings icon / notificationIcon.
						iconRel =
							normalizeIconRelPath(line.icon) ||
							normalizeIconRelPath(feedSourceField(gizmo.settings, modSourceId, "icon", "")) ||
							normalizeIconRelPath(
								feedSourceField(gizmo.settings, modSourceId, "notificationIcon", "")
							) ||
							fallbackNotifIcon;
					} else if (
						feedSourceFieldBool(gizmo.settings, FEED_SOURCE_NOTIFICATIONS, "allowModNotificationIcon", true) !==
							false &&
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
		} else if (wantKind === "skill" || wantKind === "quest") {
			const showIcons = wantKind === "quest" ? showQuestIcons : showSkillIcons;
			const skillKind = wantKind === "skill" ? normalizeSkillKind(line.skillKind) : "";
			const questKind = wantKind === "quest" ? normalizeQuestKind(line.questKind) : "";
			const linePaint =
				resolveFeedColorToken(gizmo, line.color) ||
				(wantKind === "quest"
					? questKind === "objective"
						? questObjectivePaint
						: questStatusPaint
					: skillKind === "level"
						? levelProgressPaint
						: skillProgressPaint);
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
			const textEl = row.querySelector(".notification-line-text");
			if (textEl) {
				textEl.textContent = line.text;
				textEl.style.color = linePaint;
			}
			if (showIcons) {
				const iconHost = row.querySelector(".notification-line-icon");
				if (iconHost) {
					const iconRel =
						normalizeIconRelPath(line.icon) ||
						(wantKind === "quest"
							? questKind === "objective"
								? fallbackQuestObjectiveIcon
								: fallbackQuestStatusIcon
							: skillKind === "level"
								? fallbackLevelIcon
								: fallbackSkillIcon);
					const href = resolveDisplayIconHref(iconRel);
					paintMaskedFace(iconHost, "notification-line-icon-face", {
						color: linePaint,
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
	let needsHudRebuild = false;
	const api = typeof gizmoRendererApi === "function" ? gizmoRendererApi("cog-feed") : null;
	const canRebuild = !!(api && typeof api.build === "function");
	for (const gizmo of snapshot.gizmos || []) {
		if (normalizeGizmoType(gizmo.typeId) !== "cog-feed") {
			continue;
		}
		const el = findHudGizmoEl(gizmo.id);
		if (el && el.querySelector(".feed-stack")) {
			paintGizmoFeed(el, gizmo);
		} else if (el && canRebuild) {
			needsHudRebuild = true;
		}
	}
	if (needsHudRebuild && typeof renderGears === "function" && !drag) {
		renderGears();
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
		"When enabled, this section diverts skill-up and level-up banners from hud.questUpdates (quest updates share that clip and stay visible). Skill Progress and Level Progress only control what appears in this Feed. Level Up Menu is never blocked."
	],
	quests: [
		"cog-feed-quests-hide-note",
		"When enabled, Quest Status and Quest Objectives each divert their banners from hud.questUpdates (shared with skill-ups; no soft-hide). Unticked options leave those banners on the vanilla HUD."
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

/** Defaults for one source block (used when enabling a source in settings). */
window.CogFeedDefaultSourceBlock = function CogFeedDefaultSourceBlock(sourceId) {
	const id = String(sourceId || "");
	const defaults = defaultFeedSourceBlocks();
	return defaults[id] ? { ...defaults[id] } : { enabled: false };
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
