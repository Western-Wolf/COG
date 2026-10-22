// COG overlay — Suppressor gizmo (editor-only chrome; HUD soft-hide lists)
// Classic script; shares globals with _Core.js.

const DEFAULT_SUPPRESSOR_SIZE = 100;

/** Harvestable [tag, en-CA] — Suppressions / Suppressor friendly names (by alias value). */
const HUD_ALIAS_LABEL_TAGS = {
	"hud.health": ["cog-hud-alias-health", "Health bar"],
	"hud.stamina": ["cog-hud-alias-stamina", "Stamina bar"],
	"hud.magicka": ["cog-hud-alias-magicka", "Magicka bar"],
	"hud.ammo": ["cog-hud-alias-ammo", "Ammo / arrows"],
	"hud.oxygen": ["cog-hud-alias-oxygen", "Oxygen Meter 2"],
	"hud.casting": ["cog-hud-alias-casting", "Casting Bar (whole menu)"],
	"hud.charge": ["cog-hud-alias-charge", "Right / two-hand charge"],
	"hud.leftcharge": ["cog-hud-alias-leftcharge", "Left-hand charge"],
	"hud.compass": ["cog-hud-alias-compass", "Compass / shout meter"],
	"hud.enemyhealth": ["cog-hud-alias-enemy-health", "Enemy health"],
	"hud.stealth": ["cog-hud-alias-stealth", "Stealth eye"],
	"hud.crosshair": ["cog-hud-alias-crosshair", "Crosshair"],
	"hud.activate": ["cog-hud-alias-activate", "Activate / rollover prompt"],
	"hud.subtitles": ["cog-hud-alias-subtitles", "Subtitles"],
	"hud.tutorials": ["cog-hud-alias-tutorials", "Tutorial hints"],
	"hud.questupdates": ["cog-hud-alias-quest-updates", "Quest updates"],
	"hud.notifications": ["cog-hud-alias-notifications", "Notifications (MessagesBlock)"],
	"hud.inventory": ["cog-hud-alias-inventory", "Inventory (TrueHUD Recent Loot)"],
	"hud.currentlocation": ["cog-hud-alias-current-location", "Current location (LocationLockBase)"],
	"hud.activeeffects": ["cog-hud-alias-active-effects", "SkyUI Active Effects"]
};

const SUPPRESSOR_HUD_KEYS_FALLBACK = [
	{ value: "hud.health", label: HUD_ALIAS_LABEL_TAGS["hud.health"][1] },
	{ value: "hud.stamina", label: HUD_ALIAS_LABEL_TAGS["hud.stamina"][1] },
	{ value: "hud.magicka", label: HUD_ALIAS_LABEL_TAGS["hud.magicka"][1] },
	{ value: "hud.ammo", label: HUD_ALIAS_LABEL_TAGS["hud.ammo"][1] },
	{ value: "hud.oxygen", label: HUD_ALIAS_LABEL_TAGS["hud.oxygen"][1] },
	{ value: "hud.casting", label: HUD_ALIAS_LABEL_TAGS["hud.casting"][1] },
	{ value: "hud.charge", label: HUD_ALIAS_LABEL_TAGS["hud.charge"][1] },
	{ value: "hud.leftcharge", label: HUD_ALIAS_LABEL_TAGS["hud.leftcharge"][1] },
	{ value: "hud.compass", label: HUD_ALIAS_LABEL_TAGS["hud.compass"][1] },
	{ value: "hud.enemyHealth", label: HUD_ALIAS_LABEL_TAGS["hud.enemyhealth"][1] },
	{ value: "hud.stealth", label: HUD_ALIAS_LABEL_TAGS["hud.stealth"][1] },
	{ value: "hud.crosshair", label: HUD_ALIAS_LABEL_TAGS["hud.crosshair"][1] },
	{ value: "hud.activate", label: HUD_ALIAS_LABEL_TAGS["hud.activate"][1] },
	{ value: "hud.subtitles", label: HUD_ALIAS_LABEL_TAGS["hud.subtitles"][1] },
	{ value: "hud.tutorials", label: HUD_ALIAS_LABEL_TAGS["hud.tutorials"][1] },
	{ value: "hud.questUpdates", label: HUD_ALIAS_LABEL_TAGS["hud.questupdates"][1] },
	{ value: "hud.notifications", label: HUD_ALIAS_LABEL_TAGS["hud.notifications"][1] },
	{ value: "hud.inventory", label: HUD_ALIAS_LABEL_TAGS["hud.inventory"][1] },
	{ value: "hud.currentLocation", label: HUD_ALIAS_LABEL_TAGS["hud.currentlocation"][1] },
	{ value: "hud.activeEffects", label: HUD_ALIAS_LABEL_TAGS["hud.activeeffects"][1] }
];

function hudAliasLabelEntry(value) {
	const fold = String(value || "")
		.trim()
		.toLowerCase();
	return fold ? HUD_ALIAS_LABEL_TAGS[fold] || null : null;
}

function translateHudAliasLabel(value, fallback) {
	const entry = hudAliasLabelEntry(value);
	const fb = fallback != null && String(fallback).trim() ? String(fallback) : entry ? entry[1] : String(value || "");
	if (entry && typeof t === "function") {
		return t(entry[0], entry[1]);
	}
	return fb;
}

function suppressorHudKeys() {
	const fromSnap = Array.isArray(snapshot.suppressionAliases) ? snapshot.suppressionAliases : [];
	const out = [];
	for (const item of fromSnap) {
		const value = String(item && item.value != null ? item.value : "").trim();
		if (!value) {
			continue;
		}
		out.push({
			value,
			label: translateHudAliasLabel(value, item.label || value)
		});
	}
	return out.length ? out : SUPPRESSOR_HUD_KEYS_FALLBACK.map((item) => ({
		value: item.value,
		label: translateHudAliasLabel(item.value, item.label)
	}));
}

window.translateHudAliasLabel = translateHudAliasLabel;
window.hudAliasLabelEntry = hudAliasLabelEntry;

function normalizeSuppressorKeyList(raw) {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out = [];
	const seen = new Set();
	for (const item of raw) {
		const key = String(item == null ? "" : item).trim();
		if (!key) {
			out.push("");
			continue;
		}
		const fold = key.toLowerCase();
		if (seen.has(fold)) {
			continue;
		}
		seen.add(fold);
		out.push(key);
	}
	return out;
}

function defaultSuppressorGizmo(n) {
	const settings = {
		alwaysHide: [],
		neverHide: []
	};
	settings.displayName =
		typeof formatStockName === "function"
			? formatStockName("Suppressor {num}", { num: n })
			: `Suppressor ${n}`;
	return {
		id: `gizmo_${Date.now().toString(36)}`,
		typeId: "cog-suppressor",
		visibility: "none",
		position: {
			x: DEFAULT_HUD_X,
			y: DEFAULT_HUD_Y,
			rotation: 0,
			width: DEFAULT_SUPPRESSOR_SIZE,
			height: DEFAULT_SUPPRESSOR_SIZE
		},
		settings,
		settingsJson: JSON.stringify(settings)
	};
}

function ensureSuppressorGizmo(gizmo) {
	ensureGizmoDisplayName(gizmo);
	const s = ensureGizmoSettings(gizmo);
	gizmo.typeId = "cog-suppressor";
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation/width/height move under nested "position" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	migrateEntityPosition(gizmo, {
		sized: true,
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		rotation: 0,
		width: DEFAULT_SUPPRESSOR_SIZE,
		height: DEFAULT_SUPPRESSOR_SIZE,
		minW: MIN_GIZMO_WIDTH,
		minH: MIN_GIZMO_HEIGHT
	});
	s.alwaysHide = normalizeSuppressorKeyList(s.alwaysHide);
	s.neverHide = normalizeSuppressorKeyList(s.neverHide);
	// Editor marker only — never exposed in HUD / menus.
	gizmo.visibility = "none";
	gizmo.settings = s;
	gizmo.settingsJson = JSON.stringify(s);
	return gizmo;
}

function addSuppressorGizmo() {
	placeNewGizmo(defaultSuppressorGizmo(nextGizmoTypeIndex("cog-suppressor")));
}

function buildGizmoSuppressorEl(gizmo, preview) {
	ensureSuppressorGizmo(gizmo);
	const el = document.createElement("div");
	el.className = "hud-gizmo hud-gizmo-suppressor";
	el.dataset.id = gizmo.id;
	el.dataset.gizmoType = "cog-suppressor";
	el.classList.toggle("is-editable", !!preview);
	el.innerHTML = `
		<div class="suppressor-marker" aria-hidden="true">
			<div class="suppressor-marker-face"></div>
		</div>`;
	layoutHudGizmoSuppressor(el, gizmo);
	paintGizmoSuppressor(el, gizmo);
	if (preview) {
		attachGizmoHandles(el, gizmo);
	}
	return el;
}

function layoutHudGizmoSuppressor(el, gizmo) {
	ensureSuppressorGizmo(gizmo);
	const css = hudItemLayoutCss(gizmo, gizmo.position.width, gizmo.position.height);
	el.style.left = css.x * 100 + "%";
	el.style.top = css.y * 100 + "%";
	el.style.width = gizmo.position.width + "px";
	el.style.height = gizmo.position.height + "px";
	el.style.setProperty("--gizmo-rot", (gizmo.position.rotation || 0) + "deg");
}

function paintGizmoSuppressor(el, gizmo) {
	ensureSuppressorGizmo(gizmo);
	const host = el.querySelector(".suppressor-marker");
	if (!host) {
		return;
	}
	paintMaskedFace(host, "suppressor-marker-face", {
		color: "#c44",
		href: resolveDisplayIconHref("Actions/stop.svg")
	});
}

function commitSuppressorKeyRow(gid, listKey, index, rawValue) {
	const live = gizmoFor(gid);
	if (!live) {
		return;
	}
	const settings = ensureGizmoSettings(live);
	const next = normalizeSuppressorKeyList(settings[listKey]).slice();
	while (next.length <= index) {
		next.push("");
	}
	next[index] = String(rawValue || "").trim();
	patchGizmo(gid, { [listKey]: normalizeSuppressorKeyList(next) });
}

function makeSuppressorKeyListEditor(panel, gizmo, listKey, titleTag, title, hintTag, hint) {
	const gid = gizmo.id;
	const liveSettings = () => ensureGizmoSettings(gizmoFor(gid) || gizmo);
	const section = document.createElement("div");
	section.className = "suppressor-list-section";
	const heading = document.createElement("p");
	heading.className = "lede section-heading field-title-row";
	const titleSpan = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(titleSpan, titleTag, title);
	} else {
		titleSpan.textContent = title;
	}
	heading.appendChild(titleSpan);
	if (hint) {
		heading.appendChild(makeInfoTip(hint, hintTag));
	}
	section.appendChild(heading);
	const list = document.createElement("div");
	list.className = "suppressor-key-list";
	const datalistId = `suppressor-keys-${listKey}-${gid}`;
	const datalist = document.createElement("datalist");
	datalist.id = datalistId;
	for (const opt of suppressorHudKeys()) {
		const o = document.createElement("option");
		o.value = opt.value;
		o.label = `${opt.label} (${opt.value})`;
		datalist.appendChild(o);
	}
	section.appendChild(datalist);

	const renderRows = () => {
		list.replaceChildren();
		const keys = normalizeSuppressorKeyList(liveSettings()[listKey]);
		keys.forEach((key, index) => {
			const row = document.createElement("div");
			row.className = "style-row suppressor-key-row";
			const field = document.createElement("label");
			field.className = "pos-field compact wide";
			const caption = document.createElement("span");
			caption.textContent = "HUD key";
			const input = document.createElement("input");
			input.type = "text";
			input.setAttribute("list", datalistId);
			if (typeof setTranslatedPlaceholder === "function") {
				setTranslatedPlaceholder(input, "cog-hud-key-placeholder", "hud.health or Menu|path");
			} else {
				input.placeholder = "hud.health or Menu|path";
			}
			input.value = key;
			const applyValue = () => {
				commitSuppressorKeyRow(gid, listKey, index, input.value);
				renderRows();
			};
			input.addEventListener("change", applyValue);
			input.addEventListener("input", () => {
				const v = String(input.value || "").trim().toLowerCase();
				if (suppressorHudKeys().some((k) => k.value === v)) {
					applyValue();
				}
			});
			input.addEventListener("blur", () => {
				const cur = normalizeSuppressorKeyList(liveSettings()[listKey]);
				if (String(input.value || "").trim() !== String(cur[index] || "")) {
					applyValue();
				}
			});
			field.appendChild(caption);
			field.appendChild(input);
			tagFieldLabel(field, "cog-hud-key", "HUD key");
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "tiny";
			remove.textContent = "×";
			if (typeof setTranslatedTitle === "function") {
				setTranslatedTitle(remove, "cog-remove", "Remove");
			} else {
				remove.title = "Remove";
			}
			if (typeof setTranslatedAriaLabel === "function") {
				setTranslatedAriaLabel(remove, "cog-remove", "Remove");
			} else {
				remove.setAttribute("aria-label", "Remove");
			}
			remove.addEventListener("click", () => {
				const next = normalizeSuppressorKeyList(liveSettings()[listKey]).slice();
				next.splice(index, 1);
				patchGizmo(gid, { [listKey]: next });
				renderRows();
			});
			row.appendChild(field);
			row.appendChild(remove);
			list.appendChild(row);
		});
	};
	renderRows();
	section.appendChild(list);

	const addBtn = document.createElement("button");
	addBtn.type = "button";
	addBtn.className = "tiny suppressor-key-add";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(addBtn, "cog-add", "+ Add");
	} else {
		addBtn.textContent = "+ Add";
	}
	addBtn.addEventListener("click", () => {
		const next = normalizeSuppressorKeyList(liveSettings()[listKey]).slice();
		next.push("");
		patchGizmo(gid, { [listKey]: next });
		renderRows();
		const inputs = list.querySelectorAll("input");
		const last = inputs[inputs.length - 1];
		if (last) {
			last.focus();
		}
	});
	section.appendChild(addBtn);
	panel.appendChild(section);
}

function fillSuppressorGizmoEditor(panel, gizmo) {
	ensureSuppressorGizmo(gizmo);
	const lede = document.createElement("p");
	lede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			lede,
			"cog-suppressor-lede",
			"Editor marker only (always hidden in-game). Always Hide forces soft-hide; Never Hide exempts a target from COG gear soft-hide and from Always Hide."
		);
	} else {
		lede.textContent =
			"Editor marker only (always hidden in-game). Always Hide forces soft-hide; Never Hide exempts a target from COG gear soft-hide and from Always Hide.";
	}
	panel.appendChild(lede);
	appendEditorRule(panel);
	makeSuppressorKeyListEditor(
		panel,
		gizmo,
		"alwaysHide",
		"cog-always-hide",
		"Always Hide",
		"cog-always-hide-hint",
		"Hide these HUD targets whenever this Suppressor exists (even if no matching Gear is on screen)."
	);
	appendEditorRule(panel);
	makeSuppressorKeyListEditor(
		panel,
		gizmo,
		"neverHide",
		"cog-never-hide",
		"Never Hide",
		"cog-never-hide-hint",
		"Keep these visible — wins over gear soft-hide and Always Hide."
	);
}

window.CogRegisterGizmoRenderer("cog-suppressor", {
	create() {
		return defaultSuppressorGizmo(nextGizmoTypeIndex("cog-suppressor"));
	},
	ensure: ensureSuppressorGizmo,
	build: buildGizmoSuppressorEl,
	layout: layoutHudGizmoSuppressor,
	paint: paintGizmoSuppressor,
	fillEditor: fillSuppressorGizmoEditor
});
