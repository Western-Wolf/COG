// COG overlay — Suppressor gizmo (editor-only chrome; HUD soft-hide lists)
// Classic script; shares globals with _Core.js.

const DEFAULT_SUPPRESSOR_SIZE = 100;

const SUPPRESSOR_HUD_KEYS_FALLBACK = [
	{ value: "hud.health", label: "Health bar" },
	{ value: "hud.stamina", label: "Stamina bar" },
	{ value: "hud.magicka", label: "Magicka bar" },
	{ value: "hud.ammo", label: "Ammo / arrows" },
	{ value: "hud.oxygen", label: "Oxygen Meter 2" },
	{ value: "hud.casting", label: "Casting Bar (whole menu)" },
	{ value: "hud.charge", label: "Right / two-hand charge" },
	{ value: "hud.leftcharge", label: "Left-hand charge" },
	{ value: "hud.compass", label: "Compass / shout meter" },
	{ value: "hud.enemyHealth", label: "Enemy health" },
	{ value: "hud.stealth", label: "Stealth eye" },
	{ value: "hud.crosshair", label: "Crosshair" },
	{ value: "hud.activate", label: "Activate / rollover prompt" },
	{ value: "hud.subtitles", label: "Subtitles" },
	{ value: "hud.tutorials", label: "Tutorial hints" },
	{ value: "hud.questUpdates", label: "Quest updates" },
	{ value: "hud.notifications", label: "Notifications (MessagesBlock)" },
	{ value: "hud.inventory", label: "Inventory (TrueHUD Recent Loot)" },
	{ value: "hud.currentLocation", label: "Current location (LocationLockBase)" },
	{ value: "hud.activeEffects", label: "SkyUI Active Effects" }
];

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
			label: String(item.label || value)
		});
	}
	return out.length ? out : SUPPRESSOR_HUD_KEYS_FALLBACK;
}

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
	return {
		id: `gizmo_${Date.now().toString(36)}`,
		name: `Suppressor ${n}`,
		type: "cog-suppressor",
		visibility: "none",
		x: DEFAULT_HUD_X,
		y: DEFAULT_HUD_Y,
		posAnchor: "tlc",
		rotation: 0,
		width: DEFAULT_SUPPRESSOR_SIZE,
		height: DEFAULT_SUPPRESSOR_SIZE,
		settings,
		settingsJson: JSON.stringify(settings)
	};
}

function ensureSuppressorGizmo(gizmo) {
	const s = ensureGizmoSettings(gizmo);
	gizmo.type = "cog-suppressor";
	gizmo.x = Number.isFinite(Number(gizmo.x)) ? Number(gizmo.x) : DEFAULT_HUD_X;
	gizmo.y = Number.isFinite(Number(gizmo.y)) ? Number(gizmo.y) : DEFAULT_HUD_Y;
	gizmo.rotation = Number(gizmo.rotation) || 0;
	gizmo.width = Math.max(MIN_GIZMO_WIDTH, Number(gizmo.width) || DEFAULT_SUPPRESSOR_SIZE);
	gizmo.height = Math.max(MIN_GIZMO_HEIGHT, Number(gizmo.height) || DEFAULT_SUPPRESSOR_SIZE);
	s.alwaysHide = normalizeSuppressorKeyList(s.alwaysHide);
	s.neverHide = normalizeSuppressorKeyList(s.neverHide);
	gizmo.posAnchor = "tlc";
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
	const css = hudItemLayoutCss(gizmo, gizmo.width, gizmo.height);
	el.style.left = css.x * 100 + "%";
	el.style.top = css.y * 100 + "%";
	el.style.width = gizmo.width + "px";
	el.style.height = gizmo.height + "px";
	el.style.setProperty("--gizmo-rot", (gizmo.rotation || 0) + "deg");
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

function makeSuppressorKeyListEditor(panel, gizmo, listKey, title, hint) {
	const gid = gizmo.id;
	const liveSettings = () => ensureGizmoSettings(gizmoFor(gid) || gizmo);
	const section = document.createElement("div");
	section.className = "suppressor-list-section";
	const heading = document.createElement("p");
	heading.className = "lede section-heading";
	heading.textContent = title;
	section.appendChild(heading);
	if (hint) {
		const tip = document.createElement("p");
		tip.className = "hint";
		tip.textContent = hint;
		section.appendChild(tip);
	}
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
			input.placeholder = "hud.health or Menu|path";
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
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "tiny";
			remove.setAttribute("aria-label", "Remove");
			remove.textContent = "×";
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
	addBtn.textContent = "+ Add";
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
	lede.textContent =
		"Editor marker only (always hidden in-game). Always Hide forces soft-hide; Never Hide exempts a target from COG gear soft-hide and from Always Hide.";
	panel.appendChild(lede);
	appendEditorRule(panel);
	makeSuppressorKeyListEditor(
		panel,
		gizmo,
		"alwaysHide",
		"Always Hide",
		"Hide these HUD targets whenever this Suppressor exists (even if no matching Gear is on screen)."
	);
	appendEditorRule(panel);
	makeSuppressorKeyListEditor(
		panel,
		gizmo,
		"neverHide",
		"Never Hide",
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
