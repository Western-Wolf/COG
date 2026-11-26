// COG overlay — Suppressor gizmo (editor-only chrome; HUD soft-hide lists)
// Classic script; shares globals with _Core.js.

const DEFAULT_SUPPRESSOR_SIZE = 100;

/** Fallback alias catalog when snapshot.suppressionAliases is empty (name = stock English key). */
const SUPPRESSOR_HUD_KEYS_FALLBACK = [
	{ value: "cog.health", name: "Health" },
	{ value: "cog.stamina", name: "Stamina" },
	{ value: "cog.magicka", name: "Magicka" },
	{ value: "cog.ammo", name: "Ammo" },
	{ value: "cog.o2", name: "Oxygen" },
	{ value: "cog.casting", name: "Casting Bar" },
	{ value: "cog.charge", name: "Weapon Charge" },
	{ value: "cog.leftcharge", name: "Secondary Weapon Charge" },
	{ value: "cog.compass", name: "Compass" },
	{ value: "cog.enemyHealth", name: "Enemy Health" },
	{ value: "cog.stealth", name: "Stealth" },
	{ value: "cog.crosshair", name: "Crosshair" },
	{ value: "cog.activate", name: "Activate" },
	{ value: "cog.subtitles", name: "Subtitles" },
	{ value: "cog.tutorials", name: "Tutorials" },
	{ value: "cog.questUpdates", name: "Quest Updates" },
	{ value: "cog.notifications", name: "Notifications" },
	{ value: "cog.inventory", name: "Recent Loot" },
	{ value: "cog.currentLocation", name: "Current Location" },
	{ value: "cog.activeEffects", name: "Active Effects" }
];

function aliasDisplayName(itemOrValue, fallbackName) {
	let english = "";
	let value = "";
	if (itemOrValue && typeof itemOrValue === "object") {
		value = String(itemOrValue.value || "").trim();
		english = String(itemOrValue.name || itemOrValue.label || fallbackName || value).trim();
	} else {
		value = String(itemOrValue || "").trim();
		english = String(fallbackName || value).trim();
		const snap = Array.isArray(snapshot.suppressionAliases) ? snapshot.suppressionAliases : [];
		const hit = snap.find((a) => String(a && a.value || "").toLowerCase() === value.toLowerCase());
		if (hit && hit.name) {
			english = String(hit.name).trim();
		} else {
			const fb = SUPPRESSOR_HUD_KEYS_FALLBACK.find((a) => a.value.toLowerCase() === value.toLowerCase());
			if (fb) {
				english = fb.name;
			}
		}
	}
	if (english && typeof tName === "function") {
		return tName(english);
	}
	if (english && typeof resolveStockDisplayName === "function") {
		return resolveStockDisplayName(english, english);
	}
	return english || value || "—";
}

function translateHudAliasLabel(value, fallback) {
	return aliasDisplayName(value, fallback);
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
			name: String(item.name || item.label || value).trim() || value,
			label: aliasDisplayName(item)
		});
	}
	return out.length
		? out
		: SUPPRESSOR_HUD_KEYS_FALLBACK.map((item) => ({
				value: item.value,
				name: item.name,
				label: aliasDisplayName(item)
			}));
}

window.aliasDisplayName = aliasDisplayName;
window.translateHudAliasLabel = translateHudAliasLabel;

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
		visibility: "",
		display: {
			x: DEFAULT_HUD_X,
			y: DEFAULT_HUD_Y,
			rotation: 0,
			width: DEFAULT_SUPPRESSOR_SIZE,
			height: DEFAULT_SUPPRESSOR_SIZE,
			maxAlpha: 100
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
	// Legacy flat placement keys x/y/rotation/width/height move under nested "display" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	migrateEntityDisplay(gizmo, {
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
	gizmo.visibility = "";
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
	const css = hudItemLayoutCss(gizmo, gizmo.display.width, gizmo.display.height);
	el.style.left = css.x * 100 + "%";
	el.style.top = css.y * 100 + "%";
	el.style.width = gizmo.display.width + "px";
	el.style.height = gizmo.display.height + "px";
	el.style.setProperty("--gizmo-rot", (gizmo.display.rotation || 0) + "deg");
	applyHostMaxAlpha(el, gizmo);
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
				setTranslatedPlaceholder(input, "cog-hud-key-placeholder", "cog.health or Menu|path");
			} else {
				input.placeholder = "cog.health or Menu|path";
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

window.CogMountSuppressorKeyList = function CogMountSuppressorKeyList(
	host,
	gid,
	listKey,
	titleTag,
	title,
	hintTag,
	hint
) {
	if (!host) {
		return;
	}
	host.replaceChildren();
	const gizmo = typeof gizmoFor === "function" ? gizmoFor(gid) : null;
	if (!gizmo) {
		return;
	}
	ensureSuppressorGizmo(gizmo);
	makeSuppressorKeyListEditor(host, gizmo, listKey, titleTag, title, hintTag, hint);
};

window.CogRegisterGizmoRenderer("cog-suppressor", {
	create() {
		return defaultSuppressorGizmo(nextGizmoTypeIndex("cog-suppressor"));
	},
	ensure: ensureSuppressorGizmo,
	build: buildGizmoSuppressorEl,
	layout: layoutHudGizmoSuppressor,
	paint: paintGizmoSuppressor
});
