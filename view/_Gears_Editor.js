// COG overlay - Gears tab editor (pickers, forms, inventory gears)
// Classic script; shares globals with _Gears.js.

let pickerIndex = 0;
let gearFilterQ = "";
let gearFilterType = "";
let gearFilterCategory = "";
let pickerGroupId = "";
let pickerRoot = null;
let editGearId = "";
let openInventoryGearId = "";
let openGearsTabAcc = "edit";

function typeLabel(type) {
	if (type === "percent") {
		return typeof t === "function" ? t("cog-percent", "Percent") : "Percent";
	}
	if (type === "count") {
		return typeof t === "function" ? t("cog-count", "Count") : "Count";
	}
	if (type === "timer") {
		return typeof t === "function" ? t("cog-timer", "Timer") : "Timer";
	}
	return type || "?";
}

function translateCategoryLabel(category) {
	const cat = String(category || "").trim();
	if (!cat || cat === "—") {
		return cat || "—";
	}
	return typeof tName === "function" ? tName(cat) : cat;
}

function sourceMeta(src) {
	const category = translateCategoryLabel((src && src.category) || "—");
	const type = typeLabel(src && src.type);
	return `${category} · ${type} · ${formatValue(src)}`;
}

function uniqueCategories() {
	const set = new Set();
	for (const src of snapshot.sources || []) {
		if (!isPickableGearSource(src)) {
			continue;
		}
		if (src.category) {
			set.add(src.category);
		}
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

/** Rebuild every category filter from live sources; keep selection when still valid. */
function refreshCategorySelects(root) {
	const scope = root || document;
	for (const catSel of scope.querySelectorAll(".filter-category, #filter-category")) {
		const prev = catSel.value;
		while (catSel.options.length > 1) {
			catSel.remove(1);
		}
		for (const cat of uniqueCategories()) {
			const opt = document.createElement("option");
			opt.value = cat;
			opt.textContent = translateCategoryLabel(cat);
			catSel.appendChild(opt);
		}
		const stillThere = [...catSel.options].some((o) => o.value === prev);
		catSel.value = stillThere ? prev : "";
		if (!stillThere && gearFilterCategory === prev) {
			gearFilterCategory = "";
		}
		catSel.dispatchEvent(new Event("cog:options"));
	}
}

function sourceMatchesFilters(src) {
	if (!src) {
		return false;
	}
	if (gearFilterType && src.type !== gearFilterType) {
		return false;
	}
	if (gearFilterCategory && (src.category || "") !== gearFilterCategory) {
		return false;
	}
	const q = (gearFilterQ || "").trim().toLowerCase();
	if (!q) {
		return true;
	}
	const gear = gearBySource(src.sourceMod, src.varName);
	const display = appearanceOf(gear, src).displayName || src.displayName || "";
	const hay = `${display} ${src.varName || ""} ${src.sourceMod || ""} ${src.category || ""} ${src.type || ""} ${typeLabel(src.type)}`.toLowerCase();
	return hay.includes(q);
}

function filteredPickerSources() {
	return sourcesNotInGroup(pickerGroupId).filter((src) => isPickableGearSource(src) && sourceMatchesFilters(src));
}

function gearMatchesFilters(gear) {
	const src = sourceFor(gear.sourceMod, gear.varName);
	const look = appearanceOf(gear, src);
	const probe = src
		? { ...src, displayName: look.displayName || src.displayName }
		: {
				sourceMod: gear.sourceMod,
				varName: gear.varName,
				displayName: look.displayName || gear.varName,
				category: "",
				type: ""
			};
	return sourceMatchesFilters(probe);
}

function filteredEditGears() {
	return [...(snapshot.gears || [])]
		.filter((gear) => !isInventoryGear(gear) && gearMatchesFilters(gear))
		.sort((a, b) => {
			const an = appearanceOf(a, sourceFor(a.sourceMod, a.varName)).displayName || a.varName || "";
			const bn = appearanceOf(b, sourceFor(b.sourceMod, b.varName)).displayName || b.varName || "";
			return an.localeCompare(bn) || String(a.id).localeCompare(String(b.id));
		});
}

function fillEditGearPicker() {
	const body = document.getElementById("tab-body");
	if (!body || activeTab !== "gears") {
		return;
	}
	const picker = body.querySelector(".gear-edit-picker");
	const list = picker && picker.querySelector(".picker-list");
	const filter = picker && picker.querySelector(".picker-filter");
	if (!list || !filter) {
		return;
	}
	refreshCategorySelects(picker);
	syncEditPickerMode(picker);
	gearFilterQ = filter.value || "";
	const options = filteredEditGears();
	list.innerHTML = "";
	if (!options.length) {
		const empty = document.createElement("li");
		empty.className = "empty";
		if ((snapshot.gears || []).length) {
			if (typeof setTranslatedText === "function") {
				setTranslatedText(empty, "cog-no-matches", "No matches.");
			} else {
				empty.textContent = "No matches.";
			}
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-no-gears-registered", "No gears registered yet.");
		} else {
			empty.textContent = "No gears registered yet.";
		}
		list.appendChild(empty);
		return;
	}
	if (editGearId && options.some((g) => g.id === editGearId)) {
		pickerIndex = options.findIndex((g) => g.id === editGearId);
	} else {
		pickerIndex = Math.max(0, Math.min(pickerIndex, options.length - 1));
	}
	options.forEach((gear, i) => {
		const src = sourceFor(gear.sourceMod, gear.varName);
		const li = document.createElement("li");
		if (i === pickerIndex || gear.id === editGearId) {
			li.className = "is-active";
		}
		li.innerHTML = `<span class="opt-title"></span><span class="opt-meta"></span>`;
		li.querySelector(".opt-title").textContent = sourceTitle(src, gear.varName, gear);
		const placed = effectiveGroupId(gear);
		const bits = [translateCategoryLabel((src && src.category) || "—"), typeLabel(src && src.type)];
		if (placed) {
			const groupName = groupDisplayName(placed);
			bits.push(
				typeof tf === "function" ? tf("cog-in-group", "in {group}", { group: groupName }) : `in ${groupName}`
			);
		} else {
			bits.push(typeof t === "function" ? t("cog-unplaced", "Unplaced") : "Unplaced");
		}
		li.querySelector(".opt-meta").textContent = bits.join(" · ");
		li.addEventListener("mousedown", (ev) => {
			ev.preventDefault();
			selectEditGear(gear.id);
		});
		list.appendChild(li);
	});
}

function syncEditPickerMode(picker) {
	const root = picker || (document.getElementById("tab-body") && document.getElementById("tab-body").querySelector(".gear-edit-picker"));
	if (!root) {
		return;
	}
	const browsing = root.dataset.browsing === "1";
	root.classList.toggle("has-selection", !!editGearId && !browsing);
}

function beginEditPickerBrowse(picker) {
	if (!picker) {
		return;
	}
	picker.dataset.browsing = "1";
	syncEditPickerMode(picker);
	fillEditGearPicker();
}

function endEditPickerBrowse(picker) {
	if (!picker) {
		return;
	}
	delete picker.dataset.browsing;
	syncEditPickerMode(picker);
}

function selectEditGear(id) {
	const body = document.getElementById("tab-body");
	const picker = body && body.querySelector(".gear-edit-picker");
	endEditPickerBrowse(picker);
	if (editGearId === id) {
		fillEditGearPicker();
		return;
	}
	editGearId = id || "";
	renderEditor(true);
}

function renderEditGearForm(host, selectedGearId = editGearId, options = {}) {
	const { skipPickerRefresh = false } = options;
	host.innerHTML = "";
	if (!selectedGearId) {
		const hint = document.createElement("p");
		hint.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(hint, "cog-select-gear-to-edit", "Select a gear above to edit its appearance.");
		} else {
			hint.textContent = "Select a gear above to edit its appearance.";
		}
		host.appendChild(hint);
		return;
	}
	const gear = gearFor(selectedGearId);
	if (!gear) {
		if (selectedGearId === editGearId) {
			editGearId = "";
		}
		const hint = document.createElement("p");
		hint.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(hint, "cog-gear-unavailable", "That gear is no longer available. Pick another from the list.");
		} else {
			hint.textContent = "That gear is no longer available. Pick another from the list.";
		}
		host.appendChild(hint);
		return;
	}
	ensureGearAppearance(gear);
	const src = sourceFor(gear.sourceMod, gear.varName);
	const look = gear.settings;
	const placed = effectiveGroupId(gear);
	const form = document.createElement("div");
	form.className = "gear-edit-form";
	form.dataset.id = gear.id;
	form.innerHTML = `
		<p class="lede" data-role="heading"></p>
		<div class="gear-edit-identity">
			<label class="pos-field grow"><span>Display name</span><input type="text" data-role="displayName" spellcheck="false"></label>
		</div>
		<div data-role="iconSlot"></div>
		<div class="color-row" data-role="colors"></div>
		<div class="hide-at-row" data-role="hideAtRow">
			<label class="pos-field compact hide-at-op"><span>Hide when</span>
				<select data-role="hideAtOp">
					<option value="">Off</option>
					<option value="<">Below</option>
					<option value=">">Above</option>
				</select>
			</label>
			<label class="pos-field compact hide-at-pct"><span data-role="hideAtThresholdLabel">Threshold</span>
				<input type="number" data-role="hideAtPct" min="0" step="any" inputmode="decimal">
			</label>
		</div>
		<div class="hide-at-row" data-role="hudSuppressRow">
			<label class="pos-field compact hide-at-op"><span>HUD Suppression</span>
				<select data-role="hudHideDuplicate">
					<option value="0">Off</option>
					<option value="1">On</option>
				</select>
			</label>
			<label class="pos-field compact hud-suppress-target"><span>HUD Target</span>
				<input type="text" data-role="hudLinkedElement" spellcheck="false" placeholder="hud.casting">
			</label>
		</div>
		<div class="toolbar">
			<button type="button" class="action" data-role="reset">Reset to defaults</button>
		</div>
		<p class="lede" data-role="meta"></p>`;
	const placeLabel = placed
		? groupDisplayName(placed)
		: typeof t === "function"
			? t("cog-unplaced", "Unplaced")
			: "Unplaced";
	form.querySelector('[data-role="heading"]').textContent = `${sourceTitle(src, gear.varName, gear)} · ${placeLabel}`;
	const metaEl = form.querySelector('[data-role="meta"]');
	if (src) {
		const metaVars = { mod: gear.sourceMod, name: gear.varName, meta: sourceMeta(src) };
		if (typeof setTranslatedText === "function") {
			setTranslatedText(metaEl, "cog-gear-meta-mod", "Mod {mod} · {name} · {meta}", metaVars);
		} else {
			metaEl.textContent = `Mod ${gear.sourceMod} · ${gear.varName} · ${sourceMeta(src)}`;
		}
	} else {
		const metaVars = { mod: gear.sourceMod, name: gear.varName };
		if (typeof setTranslatedText === "function") {
			setTranslatedText(
				metaEl,
				"cog-gear-meta-unregistered",
				"Mod {mod} · {name} · (source not registered this session)",
				metaVars
			);
		} else {
			metaEl.textContent = `Mod ${gear.sourceMod} · ${gear.varName} · (source not registered this session)`;
		}
	}
	const displayInput = form.querySelector('[data-role="displayName"]');
	const hideOpSel = form.querySelector('[data-role="hideAtOp"]');
	const hidePctInput = form.querySelector('[data-role="hideAtPct"]');
	const hideRow = form.querySelector('[data-role="hideAtRow"]');
	const hideLabel = form.querySelector('[data-role="hideAtThresholdLabel"]');
	tagFieldLabel(form.querySelector(".gear-edit-identity .pos-field"), "cog-display-name", "Display name");
	tagFieldLabel(form.querySelector(".hide-at-op"), "cog-hide-when", "Hide when");
	tagSelectOptions(hideOpSel, {
		"": ["cog-off", "Off"],
		"<": ["cog-below", "Below"],
		">": ["cog-above", "Above"]
	});
	tagFieldLabel(form.querySelector(".hide-at-pct"), "cog-threshold", "Threshold");
	tagFieldLabel(form.querySelector('[data-role="hudSuppressRow"] .hide-at-op'), "cog-hud-suppression", "HUD Suppression");
	tagSelectOptions(form.querySelector('[data-role="hudHideDuplicate"]'), {
		"0": ["cog-off", "Off"],
		"1": ["cog-on", "On"]
	});
	tagFieldLabel(form.querySelector(".hud-suppress-target"), "cog-hud-target", "HUD Target");
	const hudLinkInputEarly = form.querySelector('[data-role="hudLinkedElement"]');
	if (typeof setTranslatedPlaceholder === "function") {
		setTranslatedPlaceholder(hudLinkInputEarly, "cog-hud-target-placeholder", "hud.casting");
	}
	const resetBtn = form.querySelector('[data-role="reset"]');
	if (typeof setTranslatedText === "function") {
		setTranslatedText(resetBtn, "cog-reset-to-defaults", "Reset to defaults");
	}
	displayInput.value = look.displayName || "";
	const hideType = (src && src.type) || "";
	const hideAbsolute = hideType === "count" || hideType === "timer";
	if (hideLabel) {
		if (typeof setTranslatedText === "function") {
			setTranslatedText(hideLabel, "cog-threshold", "Threshold");
		} else {
			hideLabel.textContent = "Threshold";
		}
	}
	if (hideAbsolute) {
		hidePctInput.removeAttribute("max");
		hidePctInput.step = "any";
	} else {
		hidePctInput.max = "100";
		hidePctInput.step = "0.001";
	}
	if (hideType === "timer") {
		wrapInputAffix(hidePctInput, { suffix: "s" });
	} else if (!hideAbsolute) {
		wrapInputAffix(hidePctInput, { suffix: "%" });
	}
	const hideParts = hideAtEditorParts(look.hideAt || "", hideType);
	hideOpSel.value = hideParts.op;
	hidePctInput.value = hideParts.value;
	hidePctInput.disabled = !hideParts.op;
	if (hideRow) {
		if (hideType === "count") {
			hideRow.appendChild(
				makeInfoTip(
					"Hide this gear when its count is below or above the threshold (any number). Example: Below 1 hides when empty.",
					"cog-gear-hide-tip-count"
				)
			);
		} else if (hideType === "timer") {
			hideRow.appendChild(
				makeInfoTip(
					"Hide this gear when remaining time (seconds) is below or above the threshold. Group Fill from Hidden can soften the reveal.",
					"cog-gear-hide-tip-timer"
				)
			);
		} else {
			hideRow.appendChild(
				makeInfoTip(
					"Hide this gear when its meter is below or above the threshold (0–100%). Group Fill from Hidden can soften the reveal.",
					"cog-gear-hide-tip-percent"
				)
			);
		}
	}
	const hudDupSel = form.querySelector('[data-role="hudHideDuplicate"]');
	const hudLinkInput = hudLinkInputEarly;
	const hudRow = form.querySelector('[data-role="hudSuppressRow"]');
	hudDupSel.value = look.hudHideDuplicate ? "1" : "0";
	hudLinkInput.value = String(look.hudLinkedElement || "");
	hudLinkInput.disabled = !look.hudHideDuplicate;
	if (hudRow) {
		hudRow.appendChild(
			makeInfoTip(
				"While this gear is exposed (shown on a visible group or bound to a visible gauge), soft-hide the HUD target. Use an alias (e.g. hud.casting) or a raw menu/path (e.g. HUD Menu|HUDMovieBaseInstance.Health).",
				"cog-gear-hud-suppress-tip"
			)
		);
	}
	const commitHudSuppress = () => {
		const on = hudDupSel.value === "1";
		hudLinkInput.disabled = !on;
		patchGearSettings(gear.id, {
			hudHideDuplicate: on,
			hudLinkedElement: String(hudLinkInput.value || "").trim()
		});
	};
	hudDupSel.addEventListener("change", () => commitHudSuppress());
	hudLinkInput.addEventListener("change", () => commitHudSuppress());
	hudLinkInput.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			hudLinkInput.blur();
		}
	});
	const iconSlot = form.querySelector('[data-role="iconSlot"]');
	iconSlot.classList.add("color-ramp-stack");
	const rampAxis = hideType === "count" ? "count" : "percent";
	const rampOpts = { axis: rampAxis };
	const iconRamp = makeIconRampEditor(
		"Icon",
		look.icon || "",
		FALLBACK_ICON_REL,
		(ramp) => {
			patchGearSettings(gear.id, { icon: ramp });
		},
		rampOpts
	);
	const iconHeading = iconRamp.querySelector(".color-ramp-heading");
	const iconHint = iconRamp.querySelector(".color-ramp-hint");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(iconHeading, "cog-icon", "Icon");
		if (rampAxis === "count") {
			setTranslatedText(
				iconHint,
				"cog-icon-ramp-hint-count",
				"Each stop switches the icon at that value. Icons do not fade between stops. Counts may go past 100."
			);
		} else {
			setTranslatedText(
				iconHint,
				"cog-icon-ramp-hint",
				"Each stop switches the icon at that percentage. Icons do not fade between stops."
			);
		}
	}
	iconSlot.appendChild(iconRamp);
	const colors = form.querySelector('[data-role="colors"]');
	colors.classList.add("color-ramp-stack");
	const tagColorRamp = (editor, headingTag, headingFallback) => {
		const heading = editor.querySelector(".color-ramp-heading");
		const hint = editor.querySelector(".color-ramp-hint");
		if (typeof setTranslatedText === "function") {
			setTranslatedText(heading, headingTag, headingFallback);
			if (rampAxis === "count") {
				setTranslatedText(
					hint,
					"cog-color-ramp-hint-count",
					"Empty inherits the backup. Multiple stops fade between values (counts may go past 100)."
				);
			} else {
				setTranslatedText(
					hint,
					"cog-color-ramp-hint",
					"Empty inherits the backup. Multiple stops fade between percentages."
				);
			}
		}
		return editor;
	};
	colors.appendChild(
		tagColorRamp(
			makeColorRampEditor(
				"Icon colours",
				look.iconColor,
				themeIconColor(),
				(ramp, live) => {
					patchGearSettings(gear.id, { iconColor: ramp }, live);
				},
				rampOpts
			),
			"cog-icon-colours",
			"Icon colours"
		)
	);
	colors.appendChild(
		tagColorRamp(
			makeColorRampEditor(
				"Bar colours",
				look.barColor,
				themeFill(),
				(ramp, live) => {
					patchGearSettings(gear.id, { barColor: ramp }, live);
				},
				rampOpts
			),
			"cog-bar-colours",
			"Bar colours"
		)
	);
	const commitText = (key, el) => {
		patchGearSettings(gear.id, { [key]: el.value.trim() });
		const nextPlaced = effectiveGroupId(gear);
		const nextPlaceLabel = nextPlaced
			? groupDisplayName(nextPlaced)
			: typeof t === "function"
				? t("cog-unplaced", "Unplaced")
				: "Unplaced";
		form.querySelector('[data-role="heading"]').textContent = `${sourceTitle(sourceFor(gear.sourceMod, gear.varName), gear.varName, gear)} · ${nextPlaceLabel}`;
		if (key === "displayName") {
			refreshInventoryGearChrome(gear.id);
		}
		if (!skipPickerRefresh) {
			fillEditGearPicker();
		}
	};
	const commitHideAt = () => {
		const op = hideOpSel.value;
		hidePctInput.disabled = !op;
		if (!op) {
			hidePctInput.value = "";
			patchGearSettings(gear.id, { hideAt: "" });
			return;
		}
		let n = Number(hidePctInput.value);
		if (!Number.isFinite(n) || n < 0) {
			n = 0;
		}
		if (!hideAbsolute) {
			n = quantizePct(Math.max(0, Math.min(100, n)));
			hidePctInput.value = fmtPct(n);
		} else {
			n = Math.round(n * 1000) / 1000;
			hidePctInput.value = String(n);
		}
		patchGearSettings(gear.id, { hideAt: hideAtFromEditor(op, n, hideType) });
	};
	displayInput.addEventListener("input", () => commitText("displayName", displayInput));
	displayInput.addEventListener("change", () => commitText("displayName", displayInput));
	displayInput.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			displayInput.blur();
		}
	});
	hideOpSel.addEventListener("change", () => commitHideAt());
	hidePctInput.addEventListener("input", () => {
		const op = hideOpSel.value;
		if (!op) {
			return;
		}
		const n = Number(hidePctInput.value);
		if (!Number.isFinite(n) || n < 0) {
			return;
		}
		const clamped = hideAbsolute ? n : Math.max(0, Math.min(100, n));
		patchGearSettings(gear.id, { hideAt: hideAtFromEditor(op, clamped, hideType) });
	});
	hidePctInput.addEventListener("change", () => commitHideAt());
	hidePctInput.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			hidePctInput.blur();
		}
	});
	form.querySelector('[data-role="reset"]').addEventListener("click", () => resetGearSettings(gear.id));
	host.appendChild(form);
	enhanceSelects(form);
}

function applyGearCardFilters() {
	fillEditGearPicker();
}

function closePicker() {
	if (pickerRoot) {
		const picker = pickerRoot.querySelector(".group-picker");
		if (picker) {
			picker.hidden = true;
		}
	}
	pickerIndex = 0;
	pickerGroupId = "";
	pickerRoot = null;
}

function openPicker(root, groupId) {
	closePicker();
	const picker = root.querySelector(".group-picker");
	const filter = root.querySelector(".picker-filter");
	if (!picker || !filter) {
		return;
	}
	pickerRoot = root;
	pickerGroupId = groupId;
	picker.hidden = false;
	pickerIndex = 0;
	fillPicker();
	filter.focus();
}

function fillPicker() {
	if (!pickerRoot) {
		return;
	}
	refreshCategorySelects(pickerRoot);
	const list = pickerRoot.querySelector(".picker-list");
	const filter = pickerRoot.querySelector(".picker-filter");
	if (!list || !filter) {
		return;
	}
	gearFilterQ = filter.value || "";
	const options = filteredPickerSources();
	list.innerHTML = "";
	if (!options.length) {
		const empty = document.createElement("li");
		empty.className = "empty";
		if (sourcesNotInGroup(pickerGroupId).length) {
			if (typeof setTranslatedText === "function") {
				setTranslatedText(empty, "cog-no-matches", "No matches.");
			} else {
				empty.textContent = "No matches.";
			}
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-all-sources-in-group", "All sources are already in this group.");
		} else {
			empty.textContent = "All sources are already in this group.";
		}
		list.appendChild(empty);
		return;
	}
	pickerIndex = Math.max(0, Math.min(pickerIndex, options.length - 1));
	options.forEach((src, i) => {
		const li = document.createElement("li");
		if (i === pickerIndex) {
			li.className = "is-active";
		}
		li.innerHTML = `<span class="opt-title"></span><span class="opt-meta"></span>`;
		li.querySelector(".opt-title").textContent = sourceTitle(src, src.varName, gearBySource(src.sourceMod, src.varName));
		const placed = gearBySource(src.sourceMod, src.varName);
		const bits = [translateCategoryLabel(src.category || "—"), typeLabel(src.type)];
		if (placed) {
			const groupName = groupDisplayName(effectiveGroupId(placed));
			bits.push(
				typeof tf === "function" ? tf("cog-in-group", "in {group}", { group: groupName }) : `in ${groupName}`
			);
		}
		li.querySelector(".opt-meta").textContent = bits.join(" · ");
		const targetGroupId = pickerGroupId;
		li.dataset.groupId = targetGroupId || "";
		li.addEventListener("mousedown", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			addGear(src, li.dataset.groupId || targetGroupId);
		});
		list.appendChild(li);
	});
}

function addGear(src, groupId) {
	const target = groupId || DEFAULT_GROUP_ID;
	if (!groupFor(target)) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError("addGear", new Error(`Unknown group id '${target}'`));
		}
		return;
	}
	const existing = gearBySource(src.sourceMod, src.varName);
	const gearId = gearIdFor(src.sourceMod, src.varName);
	if (!existing) {
		const look = {
			displayName: src.displayName || src.varName || "",
			icon: normalizeIconRampValue(src.icon),
			iconColor: normalizeColorRampValue(src.iconColor, src.startColor, src.endColor),
			barColor: normalizeColorRampValue(src.barColor, "", ""),
			hideAt: src.hideAt || "",
			hudLinkedElement: src.hudLinkedElement || "",
			hudHideDuplicate: !!src.hudHideDuplicate
		};
		snapshot.gears.push({
			id: gearId,
			sourceMod: src.sourceMod,
			varName: src.varName,
			defaults: { ...look },
			settings: { ...look }
		});
		addGearToGroup(gearId, target);
		scheduleSave();
	} else if (effectiveGroupId(existing) === target) {
		closePicker();
		return;
	} else {
		addGearToGroup(existing.id, target);
		scheduleSave();
	}
	closePicker();
	renderGears();
	renderEditor(true);
}

function removeGear(id) {
	removeGearFromAllGroups(id);
	scheduleSave();
	renderGears();
	renderEditor(true);
}

function patchGear(id, patch) {
	const gear = gearFor(id);
	if (!gear) {
		return;
	}
	Object.assign(gear, patch);
	ensureGearAppearance(gear);
	scheduleSave();
	if (!drag) {
		renderGears();
	}
}

function patchGearSettings(id, patch, live) {
	const gear = gearFor(id);
	if (!gear) {
		return;
	}
	ensureGearAppearance(gear);
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
		if (gear.settings[key] !== value) {
			changed = true;
			break;
		}
	}
	if (!changed) {
		if (live === false) {
			scheduleSave(true);
		}
		return;
	}
	Object.assign(gear.settings, patch);
	const group = groupFor(effectiveGroupId(gear));
	if (live === true) {
		if (group) {
			syncHudGroup(group);
		}
		return;
	}
	scheduleSave(true);
	if (live === false) {
		if (group) {
			syncHudGroup(group);
		}
		return;
	}
	if (!drag) {
		renderGears();
	}
}

function resetGearSettings(id) {
	const gear = gearFor(id);
	if (!gear) {
		return;
	}
	ensureGearAppearance(gear);
	const src = sourceFor(gear.sourceMod, gear.varName);
	if (src) {
		// Live registration is the source of truth for defaults (disk may be stale
		// until the next Register after a Papyrus display/mapping fix).
		gear.defaults = {
			displayName: src.displayName || src.varName || "",
			icon: normalizeIconRampValue(src.icon),
			iconColor: normalizeColorRampValue(src.iconColor, src.startColor, src.endColor),
			barColor: normalizeColorRampValue(src.barColor, "", ""),
			hideAt: src.hideAt || "",
			hudLinkedElement: src.hudLinkedElement || "",
			hudHideDuplicate: !!src.hudHideDuplicate
		};
	}
	gear.settings = { ...gear.defaults };
	// After Reset, localize stock settings.displayName into the active UI language.
	const key = gear.defaults.displayName;
	if (key && typeof localizeStockName === "function") {
		const lang =
			(snapshot.general && snapshot.general.language) ||
			(typeof COG_FALLBACK_LANG !== "undefined" ? COG_FALLBACK_LANG : "en-CA");
		gear.settings.displayName = localizeStockName(
			gear.settings.displayName,
			key,
			lang,
			typeof COG_FALLBACK_LANG !== "undefined" ? COG_FALLBACK_LANG : "en-CA",
			{ defaultsDisplayName: gear.defaults.displayName }
		);
	}
	scheduleSave(true);
	renderGears();
	renderEditor(true);
}

function bindGearFilters(root) {
	const scope = root || document;
	const isEditPicker =
		!!(scope.classList && scope.classList.contains("gear-edit-picker")) ||
		!!(scope.querySelector && scope.querySelector(".gear-edit-picker"));
	const filter = scope.querySelector(".picker-filter") || scope.querySelector("#picker-filter");
	const typeSel = scope.querySelector("#filter-type") || scope.querySelector(".filter-type");
	const catSel = scope.querySelector("#filter-category") || scope.querySelector(".filter-category");
	const refresh = () => {
		if (isEditPicker) {
			fillEditGearPicker();
		} else {
			fillPicker();
		}
	};
	if (filter) {
		filter.value = gearFilterQ;
		filter.addEventListener("focus", () => {
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			}
		});
		filter.addEventListener("input", () => {
			gearFilterQ = filter.value || "";
			pickerIndex = 0;
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			} else {
				refresh();
			}
		});
		filter.addEventListener("keydown", (ev) => {
			if (isEditPicker) {
				const picker = scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker");
				beginEditPickerBrowse(picker);
				const options = filteredEditGears();
				if (ev.key === "ArrowDown") {
					ev.preventDefault();
					pickerIndex = Math.min(options.length - 1, pickerIndex + 1);
					fillEditGearPicker();
				} else if (ev.key === "ArrowUp") {
					ev.preventDefault();
					pickerIndex = Math.max(0, pickerIndex - 1);
					fillEditGearPicker();
				} else if (ev.key === "Enter") {
					ev.preventDefault();
					if (options[pickerIndex]) {
						selectEditGear(options[pickerIndex].id);
					}
				} else if (ev.key === "Escape") {
					ev.preventDefault();
					endEditPickerBrowse(picker);
					filter.blur();
				}
				return;
			}
			const options = filteredPickerSources();
			if (ev.key === "ArrowDown") {
				ev.preventDefault();
				pickerIndex = Math.min(options.length - 1, pickerIndex + 1);
				fillPicker();
			} else if (ev.key === "ArrowUp") {
				ev.preventDefault();
				pickerIndex = Math.max(0, pickerIndex - 1);
				fillPicker();
			} else if (ev.key === "Enter") {
				ev.preventDefault();
				if (options[pickerIndex] && pickerGroupId) {
					addGear(options[pickerIndex], pickerGroupId);
				}
			} else if (ev.key === "Escape") {
				ev.preventDefault();
				closePicker();
			}
		});
	}
	if (typeSel) {
		typeSel.value = gearFilterType;
		typeSel.addEventListener("change", () => {
			gearFilterType = typeSel.value || "";
			pickerIndex = 0;
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			} else {
				refresh();
			}
		});
	}
	if (catSel) {
		catSel.value = gearFilterCategory;
		catSel.addEventListener("change", () => {
			gearFilterCategory = catSel.value || "";
			pickerIndex = 0;
			if (isEditPicker) {
				beginEditPickerBrowse(scope.classList.contains("gear-edit-picker") ? scope : scope.querySelector(".gear-edit-picker"));
			} else {
				refresh();
			}
		});
	}
}

function openInventoryGearPicker() {
	// Defer until after the click event finishes (same pattern as editor key rebind).
	setTimeout(() => {
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE("inventoryGear:open");
		}
	}, 0);
}

function removeInventoryGear(gear) {
	if (!gear || !isInventoryGear(gear) || isProtectedInventoryGear(gear)) {
		return;
	}
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE("inventoryGear:remove:" + gear.varName);
	}
	if (openInventoryGearId === gear.id) {
		openInventoryGearId = "";
	}
}

/** Keep inventory accordion title + body lede in sync after display-name edits. */
function refreshInventoryGearChrome(gearId) {
	const gear = gearFor(gearId);
	if (!gear || !isInventoryGear(gear)) {
		return;
	}
	const src = sourceFor(gear.sourceMod, gear.varName);
	const look = appearanceOf(gear, src);
	const fallbackLabel =
		typeof t === "function" ? t("cog-inventory-gear", "Inventory gear") : "Inventory gear";
	const label = look.displayName || gear.varName || fallbackLabel;
	const acc = document.querySelector(`.inventory-gear-acc[data-gear-id="${CSS.escape(gear.id)}"]`);
	if (!acc) {
		return;
	}
	const title = acc.querySelector(".group-title");
	if (title) {
		title.textContent = label;
	}
	const lede = acc.querySelector('[data-role="inventoryGearBody"] > .lede');
	if (lede) {
		lede.textContent = `${label}${src ? ` · ${sourceMeta(src)}` : ""}`;
	}
}

function renderInventoryGearEditor(host, gear) {
	const src = sourceFor(gear.sourceMod, gear.varName);
	const look = appearanceOf(gear, src);
	const title = document.createElement("p");
	title.className = "lede";
	const invFallback =
		typeof t === "function" ? t("cog-inventory-gear", "Inventory gear") : "Inventory gear";
	title.textContent = `${look.displayName || gear.varName || invFallback}${src ? ` · ${sourceMeta(src)}` : ""}`;
	host.appendChild(title);
	const formHost = document.createElement("div");
	formHost.className = "gear-edit-host";
	host.appendChild(formHost);
	renderEditGearForm(formHost, gear.id, { skipPickerRefresh: true });
}

function bindExclusiveGearsTab(details) {
	details.addEventListener("toggle", () => {
		if (!details.open) {
			if (openGearsTabAcc === details.dataset.gearsTab) {
				openGearsTabAcc = "";
			}
			return;
		}
		openGearsTabAcc = details.dataset.gearsTab || "";
		const root = details.parentElement;
		if (root) {
			for (const other of root.querySelectorAll("details.gears-tab-acc")) {
				if (other !== details) {
					other.open = false;
				}
			}
		}
	});
}

function renderGearsTab(body) {
	if (editGearId && !gearFor(editGearId)) {
		editGearId = "";
	}
	const edit = document.createElement("details");
	edit.className = "accordion gears-tab-acc";
	edit.dataset.gearsTab = "edit";
	edit.open = openGearsTabAcc === "edit" || !openGearsTabAcc;
	edit.innerHTML = `<summary>Registered Gears</summary><div class="accordion-body"></div>`;
	const editBody = edit.querySelector(".accordion-body");
	const editSummary = edit.querySelector("summary");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(editSummary, "cog-registered-gears", "Registered Gears");
	}
	const lede = document.createElement("p");
	lede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			lede,
			"cog-registered-gears-lede",
			"Search for a registered tracker to change its appearance. Changes update the HUD live. Placement still comes from the Groups tab."
		);
	} else {
		lede.textContent =
			"Search for a registered tracker to change its appearance. Changes update the HUD live. Placement still comes from the Groups tab.";
	}
	editBody.appendChild(lede);

	const picker = document.createElement("div");
	picker.className = "group-picker gear-edit-picker";
	picker.innerHTML = `
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
		<ul class="picker-list"></ul>`;
	tagFieldLabel(picker.querySelector(".filter-type")?.closest("label"), "cog-type", "Type");
	tagSelectOptions(picker.querySelector(".filter-type"), {
		"": ["cog-all-types", "All types"],
		percent: ["cog-percent", "Percent"],
		count: ["cog-count", "Count"],
		timer: ["cog-timer", "Timer"]
	});
	tagFieldLabel(picker.querySelector(".filter-category")?.closest("label"), "cog-category", "Category");
	tagSelectOptions(picker.querySelector(".filter-category"), {
		"": ["cog-all-categories", "All categories"]
	});
	const pickerFilter = picker.querySelector(".picker-filter");
	if (typeof setTranslatedPlaceholder === "function") {
		setTranslatedPlaceholder(pickerFilter, "cog-filter-by-name", "Filter by name…");
	}
	refreshCategorySelects(picker);
	editBody.appendChild(picker);
	bindGearFilters(picker);
	enhanceSelects(picker);
	fillEditGearPicker();

	appendEditorRule(editBody);

	const formHost = document.createElement("div");
	formHost.className = "gear-edit-host";
	editBody.appendChild(formHost);
	renderEditGearForm(formHost);

	body.appendChild(edit);
	bindExclusiveGearsTab(edit);

	const create = document.createElement("details");
	create.className = "accordion gears-tab-acc";
	create.dataset.gearsTab = "create";
	create.open = openGearsTabAcc === "create";
	create.innerHTML = `<summary>Inventory Gears</summary><div class="accordion-body"></div>`;
	const createBody = create.querySelector(".accordion-body");
	const createSummary = create.querySelector("summary");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(createSummary, "cog-inventory-gears", "Inventory Gears");
	}
	const createLede = document.createElement("p");
	createLede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			createLede,
			"cog-inventory-gears-lede",
			"Track item counts from your inventory. Add items from your inventory into the temporary container; each new item becomes its own gear and is returned to your inventory when you close the container. These gears live here—not in Registered Gears above—but you can hook them to groups, gauges, and gizmos."
		);
	} else {
		createLede.textContent =
			"Track item counts from your inventory. Add items from your inventory into the temporary container; each new item becomes its own gear and is returned to your inventory when you close the container. These gears live here—not in Registered Gears above—but you can hook them to groups, gauges, and gizmos.";
	}
	createBody.appendChild(createLede);

	const bar = document.createElement("div");
	bar.className = "toolbar";
	const addBtn = document.createElement("button");
	addBtn.type = "button";
	addBtn.className = "action";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(addBtn, "cog-add-item-from-inventory", "Add Item from Inventory");
	} else {
		addBtn.textContent = "Add Item from Inventory";
	}
	addBtn.addEventListener("click", () => openInventoryGearPicker());
	bar.appendChild(addBtn);
	createBody.appendChild(bar);

	const gears = inventoryGears();
	if (openInventoryGearId && !gears.some((g) => g.id === openInventoryGearId)) {
		openInventoryGearId = gears[0] ? gears[0].id : "";
	}
	if (!gears.length) {
		const empty = document.createElement("p");
		empty.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(empty, "cog-no-inventory-gears", "No inventory gears yet.");
		} else {
			empty.textContent = "No inventory gears yet.";
		}
		createBody.appendChild(empty);
	} else {
		for (const gear of gears) {
			ensureGearAppearance(gear);
			const src = sourceFor(gear.sourceMod, gear.varName);
			const look = appearanceOf(gear, src);
			const details = document.createElement("details");
			details.className = "accordion inventory-gear-acc";
			details.dataset.gearId = gear.id;
			details.setAttribute("name", "cog-inventory-gears");
			details.open = openInventoryGearId === gear.id;
			details.innerHTML = `
				<summary>
					<span class="group-title"></span>
					<span class="end"></span>
				</summary>
				<div class="accordion-body" data-role="inventoryGearBody"></div>`;
			const title = details.querySelector(".group-title");
			const invFallback =
				typeof t === "function" ? t("cog-inventory-gear", "Inventory gear") : "Inventory gear";
			title.textContent = look.displayName || gear.varName || invFallback;
			const end = details.querySelector(".end");
			if (isProtectedInventoryGear(gear)) {
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
				del.addEventListener("click", () => removeInventoryGear(gear));
				end.appendChild(del);
				stopHeaderToggle(del);
			}
			renderInventoryGearEditor(details.querySelector('[data-role="inventoryGearBody"]'), gear);
			details.addEventListener("toggle", () => {
				if (details.open) {
					openInventoryGearId = gear.id;
				}
			});
			createBody.appendChild(details);
		}
	}
	body.appendChild(create);
	bindExclusiveGearsTab(create);
}

function makeGearColorField(label, gearId, key, value, fallback) {
	return makeOptionalColorField(label, value, fallback, (hex, live) => patchGearSettings(gearId, { [key]: hex }, live));
}


