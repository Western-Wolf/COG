// COG overlay - Groups (type-level: all groups)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

const DEFAULT_GROUP_ID = "default";

const DEFAULT_GEAR_SIZE = 50;

const DEFAULT_SPACING = 25;

let openGroupId = DEFAULT_GROUP_ID;

function defaultGroupSettings() {
	return {
		displayName: "",
		showLabel: false,
		showIcon: true,
		showNumber: true,
		barTrough: true,
		fillFromHidden: "",
		numberFormat: "barPercent",
		useGroupColors: false,
		iconColor: "",
		barColor: "",
		borderColor: "",
		neutralIconMode: "white",
		gearSize: DEFAULT_GEAR_SIZE,
		spacing: DEFAULT_SPACING,
		stack: "below",
		exemptFromGroupColors: {},
		gearIds: []
	};
}

function normalizeExemptFromGroupColors(raw) {
	const out = {};
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return out;
	}
	for (const [id, v] of Object.entries(raw)) {
		if (v === true && id) {
			out[id] = true;
		}
	}
	return out;
}

function gearExemptFromGroupColors(group, gearId) {
	if (!group || !gearId) {
		return false;
	}
	const map = ensureGroupSettings(group).exemptFromGroupColors;
	return !!(map && map[gearId] === true);
}

function setGearExemptFromGroupColors(group, gearId, exempt) {
	if (!group || !gearId) {
		return;
	}
	ensureGroupLine(group);
	const settings = ensureGroupSettings(group);
	const map = normalizeExemptFromGroupColors(settings.exemptFromGroupColors);
	if (exempt) {
		map[gearId] = true;
	} else {
		delete map[gearId];
	}
	settings.exemptFromGroupColors = map;
}

/** Group line / title keys nested under settings (also accepted flat on patch). */
const GROUP_LINE_SETTINGS_KEYS = new Set(["displayName", "gearSize", "spacing", "stack", "gearIds"]);

const NEUTRAL_ICON_MODES = ["white", "bar", "border", "icon0", "icon50", "icon100"];

const FILL_FROM_HIDDEN_MODES = ["", "alpha", "up", "down", "alphaUp", "alphaDown"];

/** Unfilled icon opacity for Alpha & Up / Alpha & Down — matches gear bar trough. */
const FILL_FROM_HIDDEN_TROUGH_ALPHA = 0.55;

const FILL_FROM_HIDDEN_GREY = "#9a9a9a";

function normalizeNeutralIconMode(value) {
	const mode = String(value || "").toLowerCase();
	return NEUTRAL_ICON_MODES.includes(mode) ? mode : "white";
}

function normalizeFillFromHidden(value) {
	const raw = String(value || "").trim();
	const lower = raw.toLowerCase();
	if (lower === "alphaup") {
		return "alphaUp";
	}
	if (lower === "alphadown") {
		return "alphaDown";
	}
	if (FILL_FROM_HIDDEN_MODES.includes(raw)) {
		return raw;
	}
	if (FILL_FROM_HIDDEN_MODES.includes(lower)) {
		return lower;
	}
	return "";
}

function normalizeStack(value) {
	const v = String(value || "").toLowerCase();
	if (v === "left" || v === "right" || v === "above" || v === "below") {
		return v;
	}
	if (v === "top") {
		return "above";
	}
	if (v === "bottom") {
		return "below";
	}
	return "below";
}

function normalizeNumberFormat(styleOrValue) {
	const raw =
		typeof styleOrValue === "string"
			? String(styleOrValue || "").trim()
			: String((styleOrValue && styleOrValue.numberFormat) || "").trim();
	return NUMBER_FORMATS.includes(raw) ? raw : "barPercent";
}

function usesRatio(src) {
	return src && (src.type === "percent" || src.type === "timer");
}

function ensureGroupSettings(group) {
	const gid = (group && group.id) || "?";
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy group options bag "style" becomes "settings" (never written back on save).
	let bag =
		group.settings && typeof group.settings === "object" && !Array.isArray(group.settings)
			? group.settings
			: null;
	if (!bag && group.style && typeof group.style === "object" && !Array.isArray(group.style)) {
		bag = group.style;
		noteMigration(`group ${gid} style → settings`);
	}
	bag = bag || {};
	delete group.style;
	const knownSettings = new Set([
		"displayName",
		"showLabel",
		"showIcon",
		"showNumber",
		"barTrough",
		"fillFromHidden",
		"numberFormat",
		"useGroupColors",
		"iconColor",
		"barColor",
		"borderColor",
		"neutralIconMode",
		"gearSize",
		"spacing",
		"stack",
		"exemptFromGroupColors",
		"gearIds"
	]);
	stripUnknownKeys(bag, knownSettings, "group.settings", {
		id: gid,
		legacySet: ["startColor", "endColor"],
		deleteUnknown: false
	});
	noteMigrationIf(
		(Object.prototype.hasOwnProperty.call(bag, "startColor") ||
			Object.prototype.hasOwnProperty.call(bag, "endColor")) &&
			!String(bag.iconColor || "").trim(),
		`group ${gid} startColor/endColor → iconColor`
	);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy root displayName (and older title key name) move under nested settings.displayName (never written on root again).
	// Prefer settings.displayName; else root displayName; else legacy root name.
	let displayName = "";
	if (Object.prototype.hasOwnProperty.call(bag, "displayName") && String(bag.displayName || "").trim()) {
		displayName = String(bag.displayName).trim();
	} else if (String(group.displayName || "").trim()) {
		displayName = String(group.displayName).trim();
		noteMigration(`group ${gid} root displayName → settings.displayName`);
	} else if (String(group.name || "").trim()) {
		displayName = String(group.name).trim();
		noteMigration(`group ${gid} root name → settings.displayName`);
	}
	delete group.displayName;
	delete group.name;
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat group line keys gearSize/spacing/stack move under nested "settings" (never written back flat on save).
	// Prefer settings.*; if missing, fall back to flat root keys.
	const gearSizeRaw = Object.prototype.hasOwnProperty.call(bag, "gearSize") ? bag.gearSize : group.gearSize;
	const spacingRaw = Object.prototype.hasOwnProperty.call(bag, "spacing") ? bag.spacing : group.spacing;
	const stackRaw = Object.prototype.hasOwnProperty.call(bag, "stack") ? bag.stack : group.stack;
	noteMigrationIf(
		!Object.prototype.hasOwnProperty.call(bag, "gearSize") && group.gearSize != null,
		`group ${gid} root gearSize → settings.gearSize`
	);
	noteMigrationIf(
		!Object.prototype.hasOwnProperty.call(bag, "spacing") && group.spacing != null,
		`group ${gid} root spacing → settings.spacing`
	);
	noteMigrationIf(
		!Object.prototype.hasOwnProperty.call(bag, "stack") && group.stack != null,
		`group ${gid} root stack → settings.stack`
	);
	delete group.gearSize;
	delete group.spacing;
	delete group.stack;
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy root gearIds move under nested settings.gearIds (never written on root again).
	// Prefer settings.gearIds; else root gearIds.
	let gearIds = [];
	if (Array.isArray(bag.gearIds)) {
		gearIds = bag.gearIds.slice();
	} else if (Array.isArray(group.gearIds)) {
		gearIds = group.gearIds.slice();
		noteMigration(`group ${gid} root gearIds → settings.gearIds`);
	}
	delete group.gearIds;
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Builtin Vampiric Hunger gear id COG_Builtin_Bloodlust → COG_Builtin_VampiricHunger in gearIds / exempt.
	const oldBloodlustId =
		typeof gearIdFor === "function" ? gearIdFor("COG.Builtin", "Bloodlust") : "COG_Builtin_Bloodlust";
	const newVampiricId =
		typeof gearIdFor === "function" ? gearIdFor("COG.Builtin", "VampiricHunger") : "COG_Builtin_VampiricHunger";
	let remappedBloodlust = false;
	gearIds = gearIds.map((id) => {
		if (String(id || "").toLowerCase() === oldBloodlustId.toLowerCase()) {
			remappedBloodlust = true;
			return newVampiricId;
		}
		return id;
	});
	let exempt = normalizeExemptFromGroupColors(bag.exemptFromGroupColors);
	if (exempt && typeof exempt === "object") {
		const next = {};
		for (const [id, on] of Object.entries(exempt)) {
			if (String(id || "").toLowerCase() === oldBloodlustId.toLowerCase()) {
				next[newVampiricId] = on;
				remappedBloodlust = true;
			} else {
				next[id] = on;
			}
		}
		exempt = next;
	}
	if (remappedBloodlust) {
		noteMigration(`group ${gid} COG_Builtin_Bloodlust → COG_Builtin_VampiricHunger`);
	}
	group.settings = {
		displayName,
		showLabel: bag.showLabel === true,
		showIcon: bag.showIcon !== false,
		showNumber: bag.showNumber !== false,
		barTrough: bag.barTrough === true,
		fillFromHidden: normalizeFillFromHidden(bag.fillFromHidden),
		numberFormat: normalizeNumberFormat(bag),
		useGroupColors: bag.useGroupColors === true,
		iconColor: normalizeColorRampValue(bag.iconColor, bag.startColor, bag.endColor),
		barColor: normalizeColorRampValue(bag.barColor, "", ""),
		borderColor: String(bag.borderColor || ""),
		neutralIconMode: normalizeNeutralIconMode(bag.neutralIconMode),
		gearSize: gearSizeRaw,
		spacing: spacingRaw,
		stack: stackRaw,
		exemptFromGroupColors: exempt,
		gearIds
	};
	return group.settings;
}

function ensureGroup(group) {
	if (!group) {
		return;
	}
	ensureGroupSettings(group);
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy root bool "visible" → visibility none|hud|ui (never kept as bool).
	if (typeof ensureEntityVisibility === "function") {
		ensureEntityVisibility(group);
	} else {
		group.visibility = group.visibility == null ? "hud" : group.visibility;
		delete group.visible;
	}
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation move under nested "position" (never written back flat on save).
	migrateEntityPosition(group, { x: DEFAULT_HUD_X, y: DEFAULT_HUD_Y, rotation: 0 });
}

function ensureGroupLine(group) {
	ensureGroup(group);
	const settings = ensureGroupSettings(group);
	if (group.position.rotation == null) {
		group.position.rotation = 0;
	}
	const size = Number(settings.gearSize);
	if (!Number.isFinite(size) || size <= 1) {
		settings.gearSize = DEFAULT_GEAR_SIZE;
	}
	const gap = Number(settings.spacing);
	if (!Number.isFinite(gap) || gap < 0 || (gap > 0 && gap <= 1)) {
		settings.spacing = DEFAULT_SPACING;
	}
	settings.stack = normalizeStack(settings.stack);
	if (!Array.isArray(settings.gearIds)) {
		settings.gearIds = [];
	}
}

function groupFor(id) {
	return snapshot.groups.find((g) => g.id === id);
}

function groupIdForGear(gear) {
	if (!gear) {
		return "";
	}
	for (const group of snapshot.groups || []) {
		ensureGroupLine(group);
		if (ensureGroupSettings(group).gearIds.includes(gear.id)) {
			return group.id;
		}
	}
	return "";
}

function removeGearFromAllGroups(gearId) {
	for (const group of snapshot.groups || []) {
		ensureGroupLine(group);
		const settings = ensureGroupSettings(group);
		settings.gearIds = settings.gearIds.filter((id) => id !== gearId);
		const map = settings.exemptFromGroupColors;
		if (map && Object.prototype.hasOwnProperty.call(map, gearId)) {
			delete map[gearId];
		}
	}
}

function addGearToGroup(gearId, groupId) {
	if (!gearId || !groupId) {
		return;
	}
	removeGearFromAllGroups(gearId);
	const group = groupFor(groupId);
	if (!group) {
		return;
	}
	ensureGroupLine(group);
	const settings = ensureGroupSettings(group);
	if (!settings.gearIds.includes(gearId)) {
		settings.gearIds.push(gearId);
	}
}

function pruneGroupMembership() {
	const gears = snapshot.gears || [];
	// Empty gear list would wipe every group's membership — refuse (bad/partial snapshot).
	if (!gears.length) {
		return;
	}
	const known = new Set(gears.map((g) => g.id));
	const placed = new Set();
	for (const group of snapshot.groups || []) {
		ensureGroupLine(group);
		const settings = ensureGroupSettings(group);
		settings.gearIds = settings.gearIds.filter((id) => {
			if (!known.has(id) || placed.has(id)) {
				return false;
			}
			placed.add(id);
			return true;
		});
		const members = new Set(settings.gearIds);
		const map = settings.exemptFromGroupColors;
		for (const id of Object.keys(map || {})) {
			if (!members.has(id)) {
				delete map[id];
			}
		}
	}
}

function ensureDefaultGroup() {
	if (!Array.isArray(snapshot.groups)) {
		snapshot.groups = [];
	}
	if (!snapshot.groups.some((g) => g.id === DEFAULT_GROUP_ID)) {
		const settings = defaultGroupSettings();
		settings.displayName = "Default Group";
		snapshot.groups.unshift({
			id: DEFAULT_GROUP_ID,
			locked: true,
			visibility: snapshot.general && snapshot.general.showDefaultGroup ? "hud" : "none",
			position: { x: DEFAULT_HUD_X, y: DEFAULT_HUD_Y, rotation: 0 },
			settings
		});
	}
	const defaultGroup = snapshot.groups.find((g) => g.id === DEFAULT_GROUP_ID);
	defaultGroup.locked = true;
	ensureGroupSettings(defaultGroup).displayName = "Default Group";
	defaultGroup.visibility = snapshot.general && snapshot.general.showDefaultGroup ? "hud" : "none";
	delete defaultGroup.visible;
}

function normalizeGroupsSnapshot() {
	ensureDefaultGroup();
	for (const group of snapshot.groups) {
		ensureGroup(group);
		ensureGroupSettings(group);
		ensureGroupLine(group);
	}
	pruneGroupMembership();
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy gear-root exemptFromGroupColors moves onto the owning group's settings.exemptFromGroupColors[gearId]
	// (never written on the gear again). Legacy gear-root enabled is ignored.
	for (const gear of snapshot.gears || []) {
		const gearLabel = (gear && (gear.id || gear.varName)) || "?";
		if (gear && Object.prototype.hasOwnProperty.call(gear, "enabled")) {
			noteMigration(`gear ${gearLabel} ignored legacy root enabled`);
			delete gear.enabled;
		}
		if (!gear || !gear.exemptFromGroupColors) {
			if (gear) {
				delete gear.exemptFromGroupColors;
			}
			continue;
		}
		const gid = groupIdForGear(gear);
		const group = gid ? groupFor(gid) : null;
		if (group) {
			setGearExemptFromGroupColors(group, gear.id, true);
			noteMigration(`gear ${gearLabel} exemptFromGroupColors → group ${group.id}`);
		}
		delete gear.exemptFromGroupColors;
	}
}

function effectiveGroupId(gear) {
	return groupIdForGear(gear);
}

function gearsInGroup(groupId) {
	const group = groupFor(groupId);
	if (!group) {
		return [];
	}
	ensureGroupLine(group);
	return ensureGroupSettings(group).gearIds.map((id) => gearFor(id)).filter((g) => g);
}

/** Effective none|hud|ui for mount (Default Group follows General checkbox). */
function groupVisibility(group) {
	if (!group) {
		return "none";
	}
	if (group.id === DEFAULT_GROUP_ID) {
		return snapshot.general && snapshot.general.showDefaultGroup ? "hud" : "none";
	}
	return typeof normalizeVisibility === "function"
		? normalizeVisibility(group.visibility)
		: "hud";
}

function isGroupVisible(group) {
	return groupVisibility(group) !== "none";
}

function pixelSize(group) {
	const v = Number(ensureGroupSettings(group).gearSize);
	if (!Number.isFinite(v) || v <= 1) {
		return 20;
	}
	return Math.max(4, Math.round(v));
}

function pixelSpacing(group) {
	const v = Number(ensureGroupSettings(group).spacing);
	if (!Number.isFinite(v) || v < 0) {
		return 10;
	}
	return Math.round(v);
}

function hudMembers(group, preview) {
	return gearsInGroup(group.id).filter((gear) => {
		const src = sourceFor(gear.sourceMod, gear.varName);
		if (!src) {
			return false;
		}
		if (isHudHidden(src, gear, group) && !preview) {
			return false;
		}
		return true;
	});
}

function groupLengthPx(group, count) {
	const size = pixelSize(group);
	const gap = pixelSpacing(group);
	const n = Math.max(0, count);
	if (n <= 0) {
		return size;
	}
	return n * size + (n - 1) * gap;
}

function groupMetrics(group, count) {
	const sizePx = pixelSize(group);
	return {
		lengthPx: groupLengthPx(group, count),
		sizePx,
		gapPx: pixelSpacing(group),
		rot: Number(group.position.rotation) || 0
	};
}

function hudGroupSelector(id) {
	return `.hud-group[data-id="${cssAttr(id)}"]`;
}

function findHudGroupEl(id, preferredHost) {
	const sel = hudGroupSelector(id);
	if (preferredHost) {
		const here = preferredHost.querySelector(sel);
		if (here) {
			return here;
		}
	}
	const frontRoot = document.getElementById("hud-front");
	const root = document.getElementById("hud");
	for (const host of [frontRoot, root]) {
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

function layoutHudGroup(el, group, count) {
	const n = count == null ? hudMembers(group, document.body.classList.contains("is-focused")).length : count;
	const m = groupMetrics(group, n);
	const left = `${(group.position.x ?? DEFAULT_HUD_X) * 100}%`;
	const top = `${(group.position.y ?? DEFAULT_HUD_Y) * 100}%`;
	const minW = n <= 0 ? `${m.sizePx}px` : "";
	const minH = `${m.sizePx}px`;
	const fontSize = `${Math.max(8, m.sizePx * 0.32)}px`;
	const rot = `${m.rot}deg`;
	const counter = `${-m.rot}deg`;
	const size = `${m.sizePx}px`;
	const gap = `${m.gapPx}px`;
	const sig = `${left}|${top}|${minW}|${minH}|${fontSize}|${rot}|${size}|${gap}|${n}`;
	if (el.dataset.layoutSig === sig) {
		return;
	}
	el.dataset.layoutSig = sig;
	el.style.left = left;
	el.style.top = top;
	el.style.width = "";
	el.style.height = "";
	el.style.minWidth = minW;
	el.style.minHeight = minH;
	el.style.fontSize = fontSize;
	el.style.setProperty("--gear-size", size);
	el.style.setProperty("--gear-gap", gap);
	el.style.setProperty("--group-rot", rot);
	el.style.setProperty("--counter-rot", counter);
	// Prefer CSS vars over inline transform — Ultralight often drops the latter on first paint.
	el.style.transform = "";
}

function syncHudGroup(group) {
	const el = findHudGroupEl(group.id);
	if (el) {
		layoutHudGroup(el, group);
	}
}

function beginGroupDrag(ev, groupId, mode) {
	ev.preventDefault();
	ev.stopPropagation();
	const group = groupFor(groupId);
	if (!group) {
		return;
	}
	const w = window.innerWidth || 1;
	selectEditorItem("group", group.id, { skipHud: true });
	const h = window.innerHeight || 1;
	drag = {
		kind: "group",
		id: group.id,
		mode,
		grabX: ev.clientX / w - (group.position.x ?? DEFAULT_HUD_X),
		grabY: ev.clientY / h - (group.position.y ?? DEFAULT_HUD_Y)
	};
	if (ev.currentTarget && ev.pointerId != null && ev.currentTarget.setPointerCapture) {
		ev.currentTarget.setPointerCapture(ev.pointerId);
	}
}

function onGroupPointerMove(ev) {
	const group = groupFor(drag.id);
	if (!group) {
		return;
	}
	if (drag.mode === "move") {
		group.position.x = clampPct((ev.clientX / window.innerWidth - drag.grabX) * 100, 0, 100) / 100;
		group.position.y = clampPct((ev.clientY / window.innerHeight - drag.grabY) * 100, 0, 100) / 100;
	} else if (drag.mode === "rotate") {
		const sx = (group.position.x ?? DEFAULT_HUD_X) * window.innerWidth;
		const sy = (group.position.y ?? DEFAULT_HUD_Y) * window.innerHeight;
		group.position.rotation = Math.atan2(ev.clientY - sy, ev.clientX - sx) * (180 / Math.PI);
	}
	syncHudGroup(group);
}

function patchGroup(id, patch, skipHud, live) {
	const group = groupFor(id);
	if (!group) {
		return;
	}
	if (group.locked && patch.id && patch.id !== DEFAULT_GROUP_ID) {
		return;
	}
	const settings = ensureGroupSettings(group);
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
		if (key === "settings" && value && typeof value === "object" && !Array.isArray(value)) {
			for (const [sk, sv] of Object.entries(value)) {
				if (settings[sk] !== sv) {
					changed = true;
					settings[sk] = sv;
				}
			}
			continue;
		}
		if (key === "position" && value && typeof value === "object" && !Array.isArray(value)) {
			const pos = entityPosition(group);
			for (const [pk, pv] of Object.entries(value)) {
				if (pos[pk] !== pv) {
					changed = true;
					pos[pk] = pv;
				}
			}
			continue;
		}
		if (GROUP_LINE_SETTINGS_KEYS.has(key)) {
			if (settings[key] !== value) {
				changed = true;
				settings[key] = value;
			}
			continue;
		}
		if (group[key] !== value) {
			changed = true;
			group[key] = value;
		}
	}
	if (!changed) {
		if (live === false) {
			scheduleSave(true);
		}
		return;
	}
	group.settings = settings;
	ensureGroupLine(group);
	if (id === DEFAULT_GROUP_ID) {
		group.locked = true;
		settings.displayName = "Default Group";
		group.visibility = snapshot.general.showDefaultGroup ? "hud" : "none";
		delete group.visible;
	}
	if (live === true) {
		if (!skipHud) {
			syncHudGroup(group);
		}
		return;
	}
	scheduleSave(true);
	if (!skipHud) {
		syncHudGroup(group);
		// live === false: colour commit — this group only (already synced).
		if (live !== false && !drag) {
			renderGears();
		}
	}
	if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
		renderEditor(true);
	}
}

function addGroup() {
	const n = snapshot.groups.filter((g) => g.id !== DEFAULT_GROUP_ID).length + 1;
	const id = `group_${Date.now().toString(36)}`;
	openGroupId = id;
	const settings = defaultGroupSettings();
	settings.displayName =
		typeof formatStockName === "function"
			? formatStockName("Group {num}", { num: n })
			: `Group ${n}`;
	snapshot.groups.push({
		id,
		locked: false,
		visibility: "hud",
		position: { x: DEFAULT_HUD_X, y: DEFAULT_HUD_Y, rotation: 0 },
		settings
	});
	selectEditorItem("group", id);
	renderGears();
	renderEditor(true);
}

function removeGroup(id) {
	if (id === DEFAULT_GROUP_ID) {
		return;
	}
	if (openGroupId === id) {
		openGroupId = DEFAULT_GROUP_ID;
	}
	snapshot.groups = snapshot.groups.filter((g) => g.id !== id);
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function groupDisplayName(groupId) {
	const group = groupFor(groupId) || groupFor(DEFAULT_GROUP_ID);
	if (!group) {
		return typeof tName === "function" ? tName("Default Group") : "Default Group";
	}
	const settings = ensureGroupSettings(group);
	// Default Group is locked / uneditable — keep English on disk, translate at display time only
	// (pushStockEntityTitles skips id === "default" on purpose).
	if (group.id === DEFAULT_GROUP_ID) {
		const key = "Default Group";
		if (typeof resolveStockDisplayName === "function") {
			return resolveStockDisplayName(settings.displayName || key, key, {
				defaultsDisplayName: key
			});
		}
		return typeof tName === "function" ? tName(key) : key;
	}
	return settings.displayName || "Default Group";
}

function sourcesNotInGroup(groupId) {
	return (snapshot.sources || []).filter((src) => {
		const gear = gearBySource(src.sourceMod, src.varName);
		return !gear || effectiveGroupId(gear) !== groupId;
	});
}

function bindGroupPicker(card, groupId) {
	const addBtn = card.querySelector(".add-gear");
	if (addBtn) {
		addBtn.addEventListener("click", () => {
			const picker = card.querySelector(".group-picker");
			if (!picker || picker.hidden || pickerRoot !== card) {
				openPicker(card, groupId);
			} else {
				closePicker();
			}
		});
	}
	bindGearFilters(card);
}

function moveGearInGroup(id, dir) {
	const groupId = groupIdForGear(gearFor(id));
	const group = groupFor(groupId);
	if (!group) {
		return;
	}
	ensureGroupLine(group);
	const settings = ensureGroupSettings(group);
	const i = settings.gearIds.indexOf(id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= settings.gearIds.length) {
		return;
	}
	const next = settings.gearIds.slice();
	const tmp = next[i];
	next[i] = next[j];
	next[j] = tmp;
	settings.gearIds = next;
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function renderGroups(body) {
	const bar = document.createElement("div");
	bar.className = "toolbar";
	const add = document.createElement("button");
	add.type = "button";
	add.className = "action";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(add, "cog-add-group", "Add group");
	} else {
		add.textContent = "Add group";
	}
	add.addEventListener("click", addGroup);
	bar.appendChild(add);
	body.appendChild(bar);
	const intro = document.createElement("p");
	intro.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			intro,
			"cog-groups-intro",
			"A group is a line that starts at X/Y. Size is the icon square, or the gear height when icons are off. Title and numbers sit away from the icon; the bar stays next to it. Stack chooses which side of the icon they sit on. Up/Down reorder the list — later groups draw on top of earlier ones."
		);
	} else {
		intro.textContent =
			"A group is a line that starts at X/Y. Size is the icon square, or the gear height when icons are off. Title and numbers sit away from the icon; the bar stays next to it. Stack chooses which side of the icon they sit on. Up/Down reorder the list — later groups draw on top of earlier ones.";
	}
	body.appendChild(intro);
	if (openGroupId && !snapshot.groups.some((g) => g.id === openGroupId)) {
		openGroupId = DEFAULT_GROUP_ID;
	}
	for (const group of snapshot.groups) {
		const members = gearsInGroup(group.id);
		const canRename = group.id !== DEFAULT_GROUP_ID;
		const details = document.createElement("details");
		details.className = "accordion group-acc";
		details.dataset.groupId = group.id;
		details.setAttribute("name", "cog-groups");
		details.open = openGroupId === group.id;
		details.classList.toggle("is-selected", openGroupId === group.id);
		details.innerHTML = `
			<summary>
				<span class="group-title"></span>
				<input class="name-field" data-role="displayName" spellcheck="false" hidden>
				<span class="end"></span>
			</summary>
			<div class="accordion-body">
				<label class="section-label">Group settings</label>
				<div class="pos-row">
					<label class="pos-field"><span>X</span><input type="number" min="0" max="100" step="0.1" data-role="x"></label>
					<label class="pos-field"><span>Y</span><input type="number" min="0" max="100" step="0.1" data-role="y"></label>
					<label class="pos-field"><span>Rotation</span><input type="number" min="-180" max="180" step="1" data-role="rotation"></label>
					<label class="pos-field"><span>Size</span><input type="number" min="4" max="256" step="1" data-role="gearSize"></label>
					<label class="pos-field"><span>Spacing</span><input type="number" min="0" max="256" step="1" data-role="spacing"></label>
				</div>
				<div class="style-row">
					<label class="pos-field compact"><span>Stack</span>
						<select data-role="stack">
							<option value="right">Right of icon</option>
							<option value="left">Left of icon</option>
							<option value="above">Above icon</option>
							<option value="below">Below icon</option>
						</select>
					</label>
					<label class="pos-field compact wide"><span>Number Format</span>
						<select data-role="numberFormat">
							<option value="bar">Show bar</option>
							<option value="barPercent">Show bar and percentage</option>
							<option value="barTotal">Show bar and total</option>
							<option value="percent">Show percentage</option>
							<option value="total">Show total</option>
						</select>
					</label>
					<label class="pos-field compact wide" data-role="fillFromHiddenRow">
						<span class="field-title-row" data-role="fillFromHiddenTitle"><span>Fill from Hidden</span></span>
						<select data-role="fillFromHidden">
							<option value="">Off</option>
							<option value="alpha">Alpha</option>
							<option value="up">Up</option>
							<option value="down">Down</option>
							<option value="alphaUp">Alpha &amp; Up</option>
							<option value="alphaDown">Alpha &amp; Down</option>
						</select>
					</label>
					<label><input type="checkbox" data-role="showLabel"> <span>Title</span></label>
					<label><input type="checkbox" data-role="showIcon"> <span>Icon</span></label>
					<label><input type="checkbox" data-role="showNumber"> <span>Show Number</span></label>
					<label><input type="checkbox" data-role="barTrough"> <span>Bar trough</span></label>
					<label class="check-row" data-role="useGroupColorsRow"><input type="checkbox" data-role="useGroupColors"> <span>Use group colours</span></label>
				</div>
				<div class="group-color-section" data-role="groupColors" hidden>
					<div class="color-row" data-role="groupColorFields"></div>
				</div>
				<hr class="editor-rule">
				<details class="accordion nested-acc" open>
					<summary>Gears (${members.length})</summary>
					<div class="accordion-body">
						<div class="toolbar group-add">
							<button type="button" class="action add-gear">Add gear</button>
						</div>
						<div class="group-picker" hidden>
							<div class="picker-filters">
								<label class="pos-field"><span>Type</span>
									<select class="filter-type">
										<option value="">All types</option>
										<option value="percent">Percent</option>
										<option value="count">Count</option>
										<option value="timer">Timer</option>
									</select>
								</label>
								<label class="pos-field"><span>Category</span>
									<select class="filter-category">
										<option value="">All categories</option>
									</select>
								</label>
							</div>
							<input class="picker-filter" type="text" placeholder="Filter by name…" autocomplete="off" spellcheck="false">
							<ul class="picker-list"></ul>
						</div>
						<div class="gear-list"></div>
					</div>
				</details>
			</div>`;
		const title = details.querySelector(".group-title");
		const nameInput = details.querySelector('[data-role="displayName"]');
		const groupSettings = ensureGroupSettings(group);
		nameInput.value = groupSettings.displayName || "";
		const end = details.querySelector(".end");
		title.textContent = groupDisplayName(group.id);
		if (canRename) {
			const edit = document.createElement("button");
			edit.type = "button";
			edit.className = "tiny";
			if (typeof setTranslatedText === "function") {
				setTranslatedText(edit, "cog-edit", "Edit");
			} else {
				edit.textContent = "Edit";
			}
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
					const next = nameInput.value.trim() || ensureGroupSettings(group).displayName;
					patchGroup(group.id, { displayName: next });
					title.textContent = groupDisplayName(group.id);
				} else {
					nameInput.value = ensureGroupSettings(group).displayName || "";
				}
			};
			edit.addEventListener("click", () => {
				selectEditorItem("group", group.id);
				details.classList.add("is-renaming");
				title.hidden = true;
				nameInput.hidden = false;
				nameInput.value = ensureGroupSettings(group).displayName || "";
				parkRenameFieldForEdit(details, nameInput);
				nameInput.focus();
				nameInput.select();
			});
			bindAccordionRenameKeys(nameInput, finishRename);
			stopHeaderToggle(edit);
			nameInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
			nameInput.addEventListener("click", (ev) => ev.stopPropagation());
		}
		if (group.id !== DEFAULT_GROUP_ID) {
			const groupIndex = snapshot.groups.findIndex((g) => g.id === group.id);
			appendStackOrderButtons(end, {
				upDisabled: groupIndex <= 1,
				downDisabled: groupIndex < 0 || groupIndex >= snapshot.groups.length - 1,
				onUp: () => moveGroupInList(group.id, -1),
				onDown: () => moveGroupInList(group.id, 1)
			});
		}
		if (group.locked || group.id === DEFAULT_GROUP_ID) {
			const note = document.createElement("span");
			note.className = "locked-note";
			if (typeof setTranslatedText === "function") {
				setTranslatedText(note, "cog-cannot-delete", "Cannot delete");
			} else {
				note.textContent = "Cannot delete";
			}
			end.appendChild(note);
		} else {
			const del = document.createElement("button");
			del.type = "button";
			del.className = "remove";
			if (typeof setTranslatedText === "function") {
				setTranslatedText(del, "cog-delete", "Delete");
			} else {
				del.textContent = "Delete";
			}
			del.addEventListener("click", () => removeGroup(group.id));
			end.appendChild(del);
			stopHeaderToggle(del);
		}
		const sectionLabel = details.querySelector(".section-label");
		if (typeof setTranslatedText === "function") {
			setTranslatedText(sectionLabel, "cog-group-settings", "Group settings");
		}
		// X/Y are single letters — leave untagged.

		tagFieldLabel(details.querySelector('[data-role="rotation"]')?.closest("label"), "cog-rotation", "Rotation");
		tagFieldLabel(details.querySelector('[data-role="gearSize"]')?.closest("label"), "cog-size", "Size");
		tagFieldLabel(details.querySelector('[data-role="spacing"]')?.closest("label"), "cog-spacing", "Spacing");
		const stackField = details.querySelector('[data-role="stack"]')?.closest("label");
		tagFieldLabel(stackField, "cog-stack", "Stack");
		tagSelectOptions(details.querySelector('[data-role="stack"]'), {
			right: ["cog-right-of-icon", "Right of icon"],
			left: ["cog-left-of-icon", "Left of icon"],
			above: ["cog-above-icon", "Above icon"],
			below: ["cog-below-icon", "Below icon"]
		});
		const numberFormatField = details.querySelector('[data-role="numberFormat"]')?.closest("label");
		tagFieldLabel(numberFormatField, "cog-number-format", "Number Format");
		tagSelectOptions(details.querySelector('[data-role="numberFormat"]'), {
			bar: ["cog-number-format-bar", "Show bar"],
			barPercent: ["cog-number-format-bar-percent", "Show bar and percentage"],
			barTotal: ["cog-group-number-format-bar-total", "Show bar and total"],
			percent: ["cog-number-format-percent", "Show percentage"],
			total: ["cog-group-number-format-total", "Show total"]
		});
		const fillTitle = details.querySelector('[data-role="fillFromHiddenTitle"]');
		const fillTitleLabel = fillTitle && fillTitle.querySelector(":scope > span");
		if (typeof setTranslatedText === "function") {
			setTranslatedText(fillTitleLabel, "cog-fill-from-hidden", "Fill from Hidden");
		}
		tagSelectOptions(details.querySelector('[data-role="fillFromHidden"]'), {
			"": ["cog-off", "Off"],
			alpha: ["cog-alpha", "Alpha"],
			up: ["cog-up", "Up"],
			down: ["cog-down", "Down"],
			alphaUp: ["cog-alpha-up", "Alpha & Up"],
			alphaDown: ["cog-alpha-down", "Alpha & Down"]
		});
		const tagCheckSpan = (role, tag, fallback) => {
			const input = details.querySelector(`[data-role="${role}"]`);
			const span = input && input.parentElement && input.parentElement.querySelector(":scope > span");
			if (typeof setTranslatedText === "function") {
				setTranslatedText(span, tag, fallback);
			} else if (span) {
				span.textContent = fallback;
			}
		};
		tagCheckSpan("showLabel", "cog-title", "Title");
		tagCheckSpan("showIcon", "cog-icon", "Icon");
		tagCheckSpan("showNumber", "cog-show-number", "Show Number");
		tagCheckSpan("barTrough", "cog-bar-trough", "Bar trough");
		tagCheckSpan("useGroupColors", "cog-use-group-colours", "Use group colours");
		const gearsSummary = details.querySelector(".nested-acc > summary");
		const gearsCountVars = { count: members.length };
		if (typeof setTranslatedText === "function") {
			setTranslatedText(gearsSummary, "cog-gears-count", "Gears ({count})");
			gearsSummary.setAttribute("data-translation-vars", JSON.stringify(gearsCountVars));
			gearsSummary.textContent =
				typeof tf === "function"
					? tf("cog-gears-count", "Gears ({count})", gearsCountVars)
					: `Gears (${members.length})`;
		} else if (gearsSummary) {
			gearsSummary.textContent = `Gears (${members.length})`;
		}
		const addGearBtn = details.querySelector(".add-gear");
		if (typeof setTranslatedText === "function") {
			setTranslatedText(addGearBtn, "cog-add-gear", "Add gear");
		}
		tagFieldLabel(details.querySelector(".filter-type")?.closest("label"), "cog-type", "Type");
		tagSelectOptions(details.querySelector(".filter-type"), {
			"": ["cog-all-types", "All types"],
			percent: ["cog-percent", "Percent"],
			count: ["cog-count", "Count"],
			timer: ["cog-timer", "Timer"]
		});
		tagFieldLabel(details.querySelector(".filter-category")?.closest("label"), "cog-category", "Category");
		tagSelectOptions(details.querySelector(".filter-category"), {
			"": ["cog-all-categories", "All categories"]
		});
		const pickerFilter = details.querySelector(".picker-filter");
		if (typeof setTranslatedPlaceholder === "function") {
			setTranslatedPlaceholder(pickerFilter, "cog-filter-by-name", "Filter by name…");
		}
		bindExclusiveGroup(details);
		bindNumberField(details.querySelector('[data-role="x"]'), {
			suffix: "%",
			parse: (raw) => {
				if (String(raw).trim() === "" || raw === "." || raw === "-") {
					return null;
				}
				const v = Number(raw);
				return Number.isFinite(v) ? clampPct(v, 0, 100) / 100 : null;
			},
			apply: (v) => patchGroup(group.id, { position: { x: v } }),
			format: (v) => fmtPct(v * 100),
			current: () => groupFor(group.id)?.position?.x ?? DEFAULT_HUD_X
		});
		bindNumberField(details.querySelector('[data-role="y"]'), {
			suffix: "%",
			parse: (raw) => {
				if (String(raw).trim() === "" || raw === "." || raw === "-") {
					return null;
				}
				const v = Number(raw);
				return Number.isFinite(v) ? clampPct(v, 0, 100) / 100 : null;
			},
			apply: (v) => patchGroup(group.id, { position: { y: v } }),
			format: (v) => fmtPct(v * 100),
			current: () => groupFor(group.id)?.position?.y ?? DEFAULT_HUD_Y
		});
		bindNumberField(details.querySelector('[data-role="rotation"]'), {
			suffix: "°",
			parse: (raw) => {
				if (String(raw).trim() === "" || raw === "-" || raw === "." || raw === "-.") {
					return null;
				}
				const v = Number(raw);
				return Number.isFinite(v) ? v : null;
			},
			apply: (v) => patchGroup(group.id, { position: { rotation: v } }),
			format: (v) => (Number(v) || 0).toFixed(1),
			current: () => groupFor(group.id)?.position?.rotation || 0
		});
		bindNumberField(details.querySelector('[data-role="gearSize"]'), {
			suffix: "px",
			parse: (raw) => (String(raw).trim() === "" ? null : clampPx(raw, 4, 256)),
			apply: (v) => patchGroup(group.id, { gearSize: v }),
			decimals: 0,
			current: () => pixelSize(groupFor(group.id) || group)
		});
		bindNumberField(details.querySelector('[data-role="spacing"]'), {
			suffix: "px",
			parse: (raw) => (String(raw).trim() === "" ? null : clampPx(raw, 0, 256)),
			apply: (v) => patchGroup(group.id, { spacing: v }),
			decimals: 0,
			current: () => pixelSpacing(groupFor(group.id) || group)
		});
		const stackSel = details.querySelector('[data-role="stack"]');
		stackSel.value = normalizeStack(ensureGroupSettings(group).stack);
		stackSel.addEventListener("change", () => patchGroup(group.id, { stack: normalizeStack(stackSel.value) }));
		const xInput = details.querySelector('[data-role="x"]');
		const yInput = details.querySelector('[data-role="y"]');
		const rotInput = details.querySelector('[data-role="rotation"]');
		const sizeInput = details.querySelector('[data-role="gearSize"]');
		const gapInput = details.querySelector('[data-role="spacing"]');
		xInput.value = fmtPct((group.position.x ?? DEFAULT_HUD_X) * 100);
		yInput.value = fmtPct((group.position.y ?? DEFAULT_HUD_Y) * 100);
		rotInput.value = (Number(group.position.rotation) || 0).toFixed(1);
		sizeInput.value = String(pixelSize(group));
		gapInput.value = String(pixelSpacing(group));
		const catSel = details.querySelector(".filter-category");
		refreshCategorySelects(details);
		const style = ensureGroupSettings(group);
		const labelBox = details.querySelector('[data-role="showLabel"]');
		const iconBox = details.querySelector('[data-role="showIcon"]');
		const numberBox = details.querySelector('[data-role="showNumber"]');
		const troughBox = details.querySelector('[data-role="barTrough"]');
		const fadeSel = details.querySelector('[data-role="fillFromHidden"]');
		const fadeRow = details.querySelector('[data-role="fillFromHiddenRow"]');
		const modeSel = details.querySelector('[data-role="numberFormat"]');
		const useColorsBox = details.querySelector('[data-role="useGroupColors"]');
		const useColorsRow = details.querySelector('[data-role="useGroupColorsRow"]');
		const colorSection = details.querySelector('[data-role="groupColors"]');
		const colorFields = details.querySelector('[data-role="groupColorFields"]');
		labelBox.checked = style.showLabel;
		iconBox.checked = style.showIcon;
		numberBox.checked = style.showNumber;
		troughBox.checked = style.barTrough;
		fadeSel.value = style.fillFromHidden || "";
		modeSel.value = style.numberFormat;
		useColorsBox.checked = style.useGroupColors;
		colorSection.hidden = !style.useGroupColors;
		if (fadeRow) {
			const fadeTitle = details.querySelector('[data-role="fillFromHiddenTitle"]') || fadeRow;
			fadeTitle.appendChild(
				makeInfoTip(
					"How percent/timer gears with Hide when reveal. Off = hard hide. Alpha fades opacity. Up/Down keep a greyscale icon and fill with colour from the bottom or top (soft seam). Alpha & Up/Down also fade the unfilled area to bar-trough opacity. GIF/WebP fill uses native colours when icon ends are blank. Counts still hard-hide.",
					"cog-group-fill-from-hidden-tip"
				)
			);
		}
		if (useColorsRow) {
			useColorsRow.appendChild(
				makeInfoTip(
					"When on, gears in this group use these colours unless they are exempt. Empty bar/border fields fall back to General. Empty icon ends fall back to General for SVG/PNG; for GIF/WebP, empty keeps native colours. Neutral icon colour applies to count gears on this line.",
					"cog-group-use-colours-tip"
				)
			);
		}
		const currentStyle = () => {
			const live = ensureGroupSettings(groupFor(group.id) || group);
			return { ...live };
		};
		const writeStyle = (patch) => {
			const live = currentStyle();
			const neutralSel = details.querySelector('[data-role="neutralIconMode"]');
			patchGroup(group.id, {
				settings: {
					...live,
					showLabel: labelBox.checked,
					showIcon: iconBox.checked,
					showNumber: numberBox.checked,
					barTrough: troughBox.checked,
					fillFromHidden: normalizeFillFromHidden(fadeSel.value),
					numberFormat: normalizeNumberFormat({ numberFormat: modeSel.value }),
					useGroupColors: useColorsBox.checked,
					neutralIconMode: normalizeNeutralIconMode(neutralSel ? neutralSel.value : live.neutralIconMode),
					...(patch || {})
				}
			});
		};
		labelBox.addEventListener("change", () => writeStyle());
		iconBox.addEventListener("change", () => writeStyle());
		numberBox.addEventListener("change", () => writeStyle());
		troughBox.addEventListener("change", () => writeStyle());
		fadeSel.addEventListener("change", () => writeStyle());
		modeSel.addEventListener("change", () => writeStyle());
		useColorsBox.addEventListener("change", () => {
			colorSection.hidden = !useColorsBox.checked;
			writeStyle();
			renderEditor(true);
		});
		colorFields.classList.add("color-ramp-stack");
		const generalColors = document.createElement("div");
		generalColors.className = "color-ramp-editor";
		const generalHeading = document.createElement("div");
		generalHeading.className = "color-ramp-heading";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(generalHeading, "cog-general-colours", "General Colours");
		} else {
			generalHeading.textContent = "General Colours";
		}
		generalColors.appendChild(generalHeading);
		const generalRow = document.createElement("div");
		generalRow.className = "style-row color-ramp-general-row";
		const borderField = makeGroupColorField("Border", group.id, "borderColor", style.borderColor, themeBorder());
		borderField.classList.add("compact");
		tagFieldLabel(borderField, "cog-border", "Border");
		generalRow.appendChild(borderField);
		const neutralField = makeNeutralIconField(
			makeNeutralIconSelect(style.neutralIconMode, (mode) => {
				writeStyle({ neutralIconMode: mode });
			})
		);
		neutralField.classList.add("compact");
		const neutralLabel = neutralField.firstChild;
		if (neutralLabel && neutralLabel.nodeType === Node.TEXT_NODE) {
			const neutralSpan = document.createElement("span");
			if (typeof setTranslatedText === "function") {
				setTranslatedText(neutralSpan, "cog-neutral-icon-colour", "Neutral icon colour");
			} else {
				neutralSpan.textContent = "Neutral icon colour";
			}
			neutralField.replaceChild(neutralSpan, neutralLabel);
		}
		tagSelectOptions(neutralField.querySelector("select"), {
			white: ["cog-always-white", "Always White"],
			bar: ["cog-bar", "Bar"],
			border: ["cog-border", "Border"],
			icon0: ["cog-icon-0", "Icon 0%"],
			icon50: ["cog-icon-50", "Icon 50%"],
			icon100: ["cog-icon-100", "Icon 100%"]
		});
		generalRow.appendChild(neutralField);
		generalColors.appendChild(generalRow);
		colorFields.appendChild(generalColors);
		const tagColorRamp = (editor, headingTag, headingFallback) => {
			const heading = editor.querySelector(".color-ramp-heading");
			const hint = editor.querySelector(".color-ramp-hint");
			if (typeof setTranslatedText === "function") {
				setTranslatedText(heading, headingTag, headingFallback);
				setTranslatedText(
					hint,
					"cog-color-ramp-hint",
					"Empty inherits the backup. Multiple stops fade between percentages."
				);
			}
			return editor;
		};
		colorFields.appendChild(
			tagColorRamp(
				makeColorRampEditor("Icon colours", style.iconColor, themeIconColor(), (ramp, live) => {
					const liveGroup = groupFor(group.id);
					if (!liveGroup) {
						return;
					}
					patchGroup(
						group.id,
						{ settings: { ...ensureGroupSettings(liveGroup), iconColor: ramp } },
						false,
						live
					);
				}),
				"cog-icon-colours",
				"Icon colours"
			)
		);
		colorFields.appendChild(
			tagColorRamp(
				makeColorRampEditor("Bar colours", style.barColor, themeFill(), (ramp, live) => {
					const liveGroup = groupFor(group.id);
					if (!liveGroup) {
						return;
					}
					patchGroup(
						group.id,
						{ settings: { ...ensureGroupSettings(liveGroup), barColor: ramp } },
						false,
						live
					);
				}),
				"cog-bar-colours",
				"Bar colours"
			)
		);
		enhanceSelects(details);
		const list = details.querySelector(".gear-list");
		if (!members.length) {
			const empty = document.createElement("p");
			empty.className = "lede";
			if (typeof setTranslatedText === "function") {
				setTranslatedText(empty, "cog-no-gears-on-line", "No gears on this line yet.");
			} else {
				empty.textContent = "No gears on this line yet.";
			}
			list.appendChild(empty);
		}
		members.forEach((gear, index) => {
			const src = sourceFor(gear.sourceMod, gear.varName);
			const row = document.createElement("div");
			row.className = "gear-item";
			row.innerHTML = `
				<div class="gear-copy">
					<strong></strong>
					<div class="meta"></div>
				</div>
				<label class="check-row compact gear-exempt"><input type="checkbox" data-role="exempt"> <span>Exempt from group colours</span></label>
				<button type="button" class="tiny" data-role="up">Up</button>
				<button type="button" class="tiny" data-role="down">Down</button>
				<button type="button" class="tiny" data-role="remove">Remove</button>`;
			row.querySelector("strong").textContent = sourceTitle(src, gear.varName, gear);
			row.querySelector(".meta").textContent = sourceMeta(src);
			const exemptBox = row.querySelector('[data-role="exempt"]');
			const exemptSpan = row.querySelector(".gear-exempt > span");
			if (typeof setTranslatedText === "function") {
				setTranslatedText(exemptSpan, "cog-exempt-from-group-colours", "Exempt from group colours");
				setTranslatedText(row.querySelector('[data-role="up"]'), "cog-up", "Up");
				setTranslatedText(row.querySelector('[data-role="down"]'), "cog-down", "Down");
				setTranslatedText(row.querySelector('[data-role="remove"]'), "cog-remove", "Remove");
			}
			exemptBox.checked = gearExemptFromGroupColors(group, gear.id);
			exemptBox.disabled = !style.useGroupColors;
			exemptBox.addEventListener("change", () => {
				const liveGroup = groupFor(group.id) || group;
				setGearExemptFromGroupColors(liveGroup, gear.id, exemptBox.checked);
				patchGroup(group.id, {
					settings: { exemptFromGroupColors: { ...ensureGroupSettings(liveGroup).exemptFromGroupColors } }
				});
			});
			row.querySelector('[data-role="up"]').disabled = index === 0;
			row.querySelector('[data-role="down"]').disabled = index === members.length - 1;
			row.querySelector('[data-role="up"]').addEventListener("click", () => moveGearInGroup(gear.id, -1));
			row.querySelector('[data-role="down"]').addEventListener("click", () => moveGearInGroup(gear.id, 1));
			row.querySelector('[data-role="remove"]').addEventListener("click", () => removeGear(gear.id));
			list.appendChild(row);
		});
		bindGroupPicker(details, group.id);
		body.appendChild(details);
	}
}

function makeGroupColorField(label, groupId, key, value, fallback) {
	return makeOptionalColorField(label, value, fallback, (hex, live) => {
		const group = groupFor(groupId);
		if (!group) {
			return;
		}
		const settings = { ...ensureGroupSettings(group), [key]: hex };
		patchGroup(groupId, { settings }, false, live);
	});
}

function bindExclusiveGroup(details) {
	details.addEventListener("toggle", () => {
		if (selectionSyncLock) {
			return;
		}
		if (!details.open) {
			if (details.classList.contains("is-renaming")) {
				details.open = true;
				return;
			}
			if (openGroupId === details.dataset.groupId) {
				selectEditorItem("", "");
			}
			if (pickerRoot && details.contains(pickerRoot)) {
				closePicker();
			}
			return;
		}
		selectEditorItem("group", details.dataset.groupId || "");
	});
}

