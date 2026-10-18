// COG overlay - Groups (type-level: all groups)
// Classic script; shares globals with _Core.js (this file loads before _Core.js).

const DEFAULT_GROUP_ID = "default";

const DEFAULT_GEAR_SIZE = 50;

const DEFAULT_SPACING = 25;

let openGroupId = DEFAULT_GROUP_ID;

function defaultGroupStyle() {
	return {
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
		neutralIconMode: "white"
	};
}

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

function ensureGroupStyle(group) {
	const style = group.style && typeof group.style === "object" ? group.style : {};
	group.style = {
		showLabel: style.showLabel === true,
		showIcon: style.showIcon !== false,
		showNumber: style.showNumber !== false,
		barTrough: style.barTrough === true,
		fillFromHidden: normalizeFillFromHidden(style.fillFromHidden),
		numberFormat: normalizeNumberFormat(style),
		useGroupColors: style.useGroupColors === true,
		iconColor: normalizeColorRampValue(style.iconColor, style.startColor, style.endColor),
		barColor: normalizeColorRampValue(style.barColor, "", ""),
		borderColor: String(style.borderColor || ""),
		neutralIconMode: normalizeNeutralIconMode(style.neutralIconMode)
	};
	return group.style;
}

function ensureGroupLine(group) {
	if (group.rotation == null) {
		group.rotation = 0;
	}
	const size = Number(group.gearSize);
	if (!Number.isFinite(size) || size <= 1) {
		group.gearSize = DEFAULT_GEAR_SIZE;
	}
	const gap = Number(group.spacing);
	if (!Number.isFinite(gap) || gap < 0 || (gap > 0 && gap <= 1)) {
		group.spacing = DEFAULT_SPACING;
	}
	group.stack = normalizeStack(group.stack);
	if (!Array.isArray(group.gearIds)) {
		group.gearIds = [];
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
		if (group.gearIds.includes(gear.id)) {
			return group.id;
		}
	}
	return "";
}

function removeGearFromAllGroups(gearId) {
	for (const group of snapshot.groups || []) {
		ensureGroupLine(group);
		group.gearIds = group.gearIds.filter((id) => id !== gearId);
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
	if (!group.gearIds.includes(gearId)) {
		group.gearIds.push(gearId);
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
		group.gearIds = group.gearIds.filter((id) => {
			if (!known.has(id) || placed.has(id)) {
				return false;
			}
			placed.add(id);
			return true;
		});
	}
}

function ensureDefaultGroup() {
	if (!Array.isArray(snapshot.groups)) {
		snapshot.groups = [];
	}
	if (!snapshot.groups.some((g) => g.id === DEFAULT_GROUP_ID)) {
		snapshot.groups.unshift({
			id: DEFAULT_GROUP_ID,
			name: "Default Group",
			locked: true,
			visible: !!(snapshot.general && snapshot.general.showDefaultGroup),
			x: DEFAULT_HUD_X,
			y: DEFAULT_HUD_Y,
			rotation: 0,
			gearSize: DEFAULT_GEAR_SIZE,
			spacing: DEFAULT_SPACING,
			stack: "below",
			style: defaultGroupStyle(),
			gearIds: []
		});
	}
	const defaultGroup = snapshot.groups.find((g) => g.id === DEFAULT_GROUP_ID);
	defaultGroup.locked = true;
	defaultGroup.name = "Default Group";
	defaultGroup.visible = !!(snapshot.general && snapshot.general.showDefaultGroup);
}

function normalizeGroupsSnapshot() {
	ensureDefaultGroup();
	for (const group of snapshot.groups) {
		ensureGroupStyle(group);
		ensureGroupLine(group);
	}
	pruneGroupMembership();
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
	return group.gearIds
		.map((id) => gearFor(id))
		.filter((g) => g && g.enabled !== false);
}

function isGroupVisible(group) {
	if (!group) {
		return false;
	}
	if (group.id === DEFAULT_GROUP_ID) {
		return !!snapshot.general.showDefaultGroup;
	}
	return group.visible !== false;
}

function pixelSize(group) {
	const v = Number(group.gearSize);
	if (!Number.isFinite(v) || v <= 1) {
		return 20;
	}
	return Math.max(4, Math.round(v));
}

function pixelSpacing(group) {
	const v = Number(group.spacing);
	if (!Number.isFinite(v) || v < 0) {
		return 10;
	}
	return Math.round(v);
}

function hudMembers(group, preview) {
	return gearsInGroup(group.id).filter((gear) => {
		const src = sourceFor(gear.mod, gear.name);
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
		rot: Number(group.rotation) || 0
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
	const left = `${(group.x ?? DEFAULT_HUD_X) * 100}%`;
	const top = `${(group.y ?? DEFAULT_HUD_Y) * 100}%`;
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
		grabX: ev.clientX / w - (group.x ?? DEFAULT_HUD_X),
		grabY: ev.clientY / h - (group.y ?? DEFAULT_HUD_Y)
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
		group.x = clampPct((ev.clientX / window.innerWidth - drag.grabX) * 100, 0, 100) / 100;
		group.y = clampPct((ev.clientY / window.innerHeight - drag.grabY) * 100, 0, 100) / 100;
	} else if (drag.mode === "rotate") {
		const sx = (group.x ?? DEFAULT_HUD_X) * window.innerWidth;
		const sy = (group.y ?? DEFAULT_HUD_Y) * window.innerHeight;
		group.rotation = Math.atan2(ev.clientY - sy, ev.clientX - sx) * (180 / Math.PI);
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
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
		if (key === "style") {
			if (JSON.stringify(group.style || {}) !== JSON.stringify(value || {})) {
				changed = true;
			}
		} else if (group[key] !== value) {
			changed = true;
		}
	}
	if (!changed) {
		if (live === false) {
			scheduleSave(true);
		}
		return;
	}
	Object.assign(group, patch);
	if (id === DEFAULT_GROUP_ID) {
		group.locked = true;
		group.name = "Default Group";
		group.visible = snapshot.general.showDefaultGroup;
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
	if (Object.prototype.hasOwnProperty.call(patch, "name")) {
		renderEditor(true);
	}
}

function addGroup() {
	const n = snapshot.groups.filter((g) => g.id !== DEFAULT_GROUP_ID).length + 1;
	const id = `group_${Date.now().toString(36)}`;
	openGroupId = id;
	snapshot.groups.push({
		id,
		name: `Group ${n}`,
		locked: false,
		visible: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		gearSize: DEFAULT_GEAR_SIZE,
		spacing: DEFAULT_SPACING,
		stack: "below",
		style: defaultGroupStyle(),
		gearIds: []
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
	return group ? group.name : "Default Group";
}

function sourcesNotInGroup(groupId) {
	return (snapshot.sources || []).filter((src) => {
		const gear = gearBySource(src.mod, src.name);
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
	const i = group.gearIds.indexOf(id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= group.gearIds.length) {
		return;
	}
	const next = group.gearIds.slice();
	const tmp = next[i];
	next[i] = next[j];
	next[j] = tmp;
	group.gearIds = next;
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
	add.textContent = "Add group";
	add.addEventListener("click", addGroup);
	bar.appendChild(add);
	body.appendChild(bar);
	const intro = document.createElement("p");
	intro.className = "lede";
	intro.textContent = "A group is a line that starts at X/Y. Size is the icon square, or the gear height when icons are off. Title and numbers sit away from the icon; the bar stays next to it. Stack chooses which side of the icon they sit on.";
	intro.textContent =
		"A group is a line that starts at X/Y. Size is the icon square, or the gear height when icons are off. Title and numbers sit away from the icon; the bar stays next to it. Stack chooses which side of the icon they sit on. Up/Down reorder the list — later groups draw on top of earlier ones.";
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
				<input class="name-field" data-role="name" spellcheck="false" hidden>
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
					<label class="pos-field compact">Stack
						<select data-role="stack">
							<option value="right">Right of icon</option>
							<option value="left">Left of icon</option>
							<option value="above">Above icon</option>
							<option value="below">Below icon</option>
						</select>
					</label>
					<label class="pos-field compact wide">Number Format
						<select data-role="numberFormat">
							<option value="bar">Show bar</option>
							<option value="barPercent">Show bar and percentage</option>
							<option value="barTotal">Show bar and total</option>
							<option value="percent">Show percentage</option>
							<option value="total">Show total</option>
						</select>
					</label>
					<label class="pos-field compact wide" data-role="fillFromHiddenRow">
						<span class="field-title-row" data-role="fillFromHiddenTitle">Fill from Hidden</span>
						<select data-role="fillFromHidden">
							<option value="">Off</option>
							<option value="alpha">Alpha</option>
							<option value="up">Up</option>
							<option value="down">Down</option>
							<option value="alphaUp">Alpha &amp; Up</option>
							<option value="alphaDown">Alpha &amp; Down</option>
						</select>
					</label>
					<label><input type="checkbox" data-role="showLabel"> Title</label>
					<label><input type="checkbox" data-role="showIcon"> Icon</label>
					<label><input type="checkbox" data-role="showNumber"> Show Number</label>
					<label><input type="checkbox" data-role="barTrough"> Bar trough</label>
					<label class="check-row" data-role="useGroupColorsRow"><input type="checkbox" data-role="useGroupColors"> Use group colours</label>
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
								<label class="pos-field">Type
									<select class="filter-type">
										<option value="">All types</option>
										<option value="percent">Percent</option>
										<option value="count">Count</option>
										<option value="timer">Timer</option>
									</select>
								</label>
								<label class="pos-field">Category
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
		const nameInput = details.querySelector('[data-role="name"]');
		title.textContent = group.name;
		nameInput.value = group.name;
		const end = details.querySelector(".end");
		if (canRename) {
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
					const next = nameInput.value.trim() || group.name;
					patchGroup(group.id, { name: next });
					title.textContent = group.name;
				} else {
					nameInput.value = group.name;
				}
			};
			edit.addEventListener("click", () => {
				selectEditorItem("group", group.id);
				details.classList.add("is-renaming");
				title.hidden = true;
				nameInput.hidden = false;
				nameInput.value = group.name;
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
			note.textContent = "Cannot delete";
			end.appendChild(note);
		} else {
			const del = document.createElement("button");
			del.type = "button";
			del.className = "remove";
			del.textContent = "Delete";
			del.addEventListener("click", () => removeGroup(group.id));
			end.appendChild(del);
			stopHeaderToggle(del);
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
			apply: (v) => patchGroup(group.id, { x: v }),
			format: (v) => fmtPct(v * 100),
			current: () => groupFor(group.id)?.x ?? DEFAULT_HUD_X
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
			apply: (v) => patchGroup(group.id, { y: v }),
			format: (v) => fmtPct(v * 100),
			current: () => groupFor(group.id)?.y ?? DEFAULT_HUD_Y
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
			apply: (v) => patchGroup(group.id, { rotation: v }),
			format: (v) => (Number(v) || 0).toFixed(1),
			current: () => groupFor(group.id)?.rotation || 0
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
		stackSel.value = normalizeStack(group.stack);
		stackSel.addEventListener("change", () => patchGroup(group.id, { stack: normalizeStack(stackSel.value) }));
		const xInput = details.querySelector('[data-role="x"]');
		const yInput = details.querySelector('[data-role="y"]');
		const rotInput = details.querySelector('[data-role="rotation"]');
		const sizeInput = details.querySelector('[data-role="gearSize"]');
		const gapInput = details.querySelector('[data-role="spacing"]');
		xInput.value = fmtPct((group.x ?? DEFAULT_HUD_X) * 100);
		yInput.value = fmtPct((group.y ?? DEFAULT_HUD_Y) * 100);
		rotInput.value = (Number(group.rotation) || 0).toFixed(1);
		sizeInput.value = String(pixelSize(group));
		gapInput.value = String(pixelSpacing(group));
		const catSel = details.querySelector(".filter-category");
		refreshCategorySelects(details);
		const style = ensureGroupStyle(group);
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
					"How percent/timer gears with Hide when reveal. Off = hard hide. Alpha fades opacity. Up/Down keep a greyscale icon and fill with colour from the bottom or top (soft seam). Alpha & Up/Down also fade the unfilled area to bar-trough opacity. GIF/WebP fill uses native colours when icon ends are blank. Counts still hard-hide."
				)
			);
		}
		if (useColorsRow) {
			useColorsRow.appendChild(
				makeInfoTip(
					"When on, gears in this group use these colours unless they are exempt. Empty bar/border fields fall back to General. Empty icon ends fall back to General for SVG/PNG; for GIF/WebP, empty keeps native colours. Neutral icon colour applies to count gears on this line."
				)
			);
		}
		const currentStyle = () => {
			const live = ensureGroupStyle(groupFor(group.id) || group);
			return { ...live };
		};
		const writeStyle = (patch) => {
			const live = currentStyle();
			const neutralSel = details.querySelector('[data-role="neutralIconMode"]');
			patchGroup(group.id, {
				style: {
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
		generalHeading.textContent = "General Colours";
		generalColors.appendChild(generalHeading);
		const generalRow = document.createElement("div");
		generalRow.className = "style-row color-ramp-general-row";
		const borderField = makeGroupColorField("Border", group.id, "borderColor", style.borderColor, themeBorder());
		borderField.classList.add("compact");
		generalRow.appendChild(borderField);
		const neutralField = makeNeutralIconField(
			makeNeutralIconSelect(style.neutralIconMode, (mode) => {
				writeStyle({ neutralIconMode: mode });
			})
		);
		neutralField.classList.add("compact");
		generalRow.appendChild(neutralField);
		generalColors.appendChild(generalRow);
		colorFields.appendChild(generalColors);
		colorFields.appendChild(
			makeColorRampEditor("Icon colours", style.iconColor, themeIconColor(), (ramp, live) => {
				const liveGroup = groupFor(group.id);
				if (!liveGroup) {
					return;
				}
				patchGroup(
					group.id,
					{ style: { ...ensureGroupStyle(liveGroup), iconColor: ramp } },
					false,
					live
				);
			})
		);
		colorFields.appendChild(
			makeColorRampEditor("Bar colours", style.barColor, themeFill(), (ramp, live) => {
				const liveGroup = groupFor(group.id);
				if (!liveGroup) {
					return;
				}
				patchGroup(
					group.id,
					{ style: { ...ensureGroupStyle(liveGroup), barColor: ramp } },
					false,
					live
				);
			})
		);
		enhanceSelects(details);
		const list = details.querySelector(".gear-list");
		if (!members.length) {
			const empty = document.createElement("p");
			empty.className = "lede";
			empty.textContent = "No gears on this line yet.";
			list.appendChild(empty);
		}
		members.forEach((gear, index) => {
			const src = sourceFor(gear.mod, gear.name);
			const row = document.createElement("div");
			row.className = "gear-item";
			row.innerHTML = `
				<div class="gear-copy">
					<strong></strong>
					<div class="meta"></div>
				</div>
				<label class="check-row compact gear-exempt"><input type="checkbox" data-role="exempt"> Exempt from group colours</label>
				<button type="button" class="tiny" data-role="up">Up</button>
				<button type="button" class="tiny" data-role="down">Down</button>
				<button type="button" class="tiny" data-role="remove">Remove</button>`;
			row.querySelector("strong").textContent = sourceTitle(src, gear.name, gear);
			row.querySelector(".meta").textContent = sourceMeta(src);
			const exemptBox = row.querySelector('[data-role="exempt"]');
			exemptBox.checked = !!gear.exemptFromGroupColors;
			exemptBox.disabled = !style.useGroupColors;
			exemptBox.addEventListener("change", () => {
				patchGear(gear.id, { exemptFromGroupColors: exemptBox.checked });
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
		const style = { ...ensureGroupStyle(group), [key]: hex };
		patchGroup(groupId, { style }, false, live);
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

