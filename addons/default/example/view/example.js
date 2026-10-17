// COG Example API — Example (Gear Updated) gizmo view script
//
// Deployed as PrismaUI/views/Example/example.js and registered from Papyrus via
// RegisterGizmo(..., viewScript = "Example/example.js", ...).
// COG loads this as ../Example/example.js from the overlay, so it shares the same
// classic-script globals as the HUD (_Core.js, _UI.js, _Gauges_Meter.js, …):
//   CogRegisterGizmoRenderer, snapshot, sourceFor, resolveIconHref, paintMaskedFace, mixHex.
//
// Contract: call CogRegisterGizmoRenderer(typeId, { mount, update, unmount }).
// COG owns the outer gizmo box (position, size, rotation, visibility). This script
// only paints inside the .gizmo-custom-host element.
//
// Live data path: sourceFor + Papyrus UpdateCount (gear-backed).

(function () {

	// Must match RegisterGizmo typeId / Papyrus sourceMod + count varName.
	const TYPE_ID = "xmp-gearupdated";
	const SOURCE_MOD = "COG_Example";
	const COUNT_VAR = "count";

	// After COG_API.ImportIcon, the file lives under assets/imports/icons/.
	// Short form for Register/Notify: "COG_Example/example.svg".
	const ICON_REL = "assets/imports/icons/COG_Example/example.svg";
	// Schema defaults from RegisterGizmo settingsSchemaJson (zeroColour / tenColour).
	const DEFAULT_ZERO = "#DF2020";
	const DEFAULT_TEN = "#20DF20";
	const FACE_CLASS = "example-gearupdated-face";

	/** Per-instance settings from the editor (schema keys: zeroColor, tenColor). */
	function readSettings(gizmo) {
		const raw = gizmo && gizmo.settings;
		if (raw && typeof raw === "object") {
			return raw;
		}
		// Fallback when only the serialized JSON string is present on the object.
		if (typeof gizmo.settingsJson === "string" && gizmo.settingsJson.trim()) {
			try {
				const parsed = JSON.parse(gizmo.settingsJson);
				return parsed && typeof parsed === "object" ? parsed : {};
			} catch (e) {
				return {};
			}
		}
		return {};
	}

	/**
	 * Live countdown value from the Example Count gear (Papyrus UpdateCount).
	 * This demo reads the shared source from snapshot via sourceFor(mod, varName).
	 * src.value is the count integer for type "count".
	 */
	function exampleCount() {
		if (typeof sourceFor !== "function") {
			return 0;
		}
		const src = sourceFor(SOURCE_MOD, COUNT_VAR);
		const n = Number(src && src.value);
		return Number.isFinite(n) ? n : 0;
	}

	/**
	 * Move from Zero colour → Ten colour by count/10 (0 → zeroColor, 10 → tenColor).
	 * mixHex is a COG overlay helper (same loop gears use for icon gradients).
	 */
	function tintForCount(settings, count) {
		const zero = (settings && settings.zeroColor) || DEFAULT_ZERO;
		const ten = (settings && settings.tenColor) || DEFAULT_TEN;
		const t = Math.max(0, Math.min(1, count / 10));
		if (typeof mixHex === "function") {
			return mixHex(zero, ten, t) || ten;
		}
		return t >= 0.5 ? ten : zero;
	}

	/** One full-bleed icon plate inside the custom host (clears COG's placeholder text). */
	function ensureHost(host) {
		if (!host) {
			return null;
		}
		host.classList.remove("is-placeholder");
		host.dataset.placeholder = "";
		let icon = host.querySelector(".example-gearupdated-icon");
		if (!icon) {
			// Clear placeholder text only when first building — wiping every update
			// remounts the mask face and causes flicker on live UpdateCount ticks.
			host.textContent = "";
			icon = document.createElement("div");
			icon.className = "example-gearupdated-icon";
			icon.style.cssText =
				"position:relative;width:100%;height:100%;box-sizing:border-box;";
			host.appendChild(icon);
		}
		return icon;
	}

	/**
	 * Paint the example icon tinted by the live count.
	 * resolveIconHref: maps a relative icon path to assets/icons/ or assets/imports/icons/.
	 * paintMaskedFace: CSS-mask the SVG and fill with `color` (same path as gear icons).
	 */
	function paint(host, gizmo) {
		const icon = ensureHost(host);
		if (!icon || typeof paintMaskedFace !== "function" || typeof resolveIconHref !== "function") {
			return;
		}
		const settings = readSettings(gizmo);
		const count = exampleCount();
		const color = tintForCount(settings, count);
		const href = resolveIconHref(ICON_REL);
		paintMaskedFace(icon, FACE_CLASS, { color, href });
		const face = icon.querySelector("." + FACE_CLASS);
		if (face) {
			face.style.position = "absolute";
			face.style.inset = "0";
			face.style.boxSizing = "border-box";
			face.style.webkitMaskRepeat = "no-repeat";
			face.style.maskRepeat = "no-repeat";
			face.style.webkitMaskPosition = "center";
			face.style.maskPosition = "center";
			face.style.webkitMaskSize = "contain";
			face.style.maskSize = "contain";
			face.style.pointerEvents = "none";
		}
	}

	if (typeof window.CogRegisterGizmoRenderer !== "function") {
		console.error("COG Example: CogRegisterGizmoRenderer missing");
		return;
	}

	// Register this typeId with COG. Called once when the script loads; COG then
	// invokes mount/update/unmount for each placed instance of xmp-gearupdated.
	window.CogRegisterGizmoRenderer(TYPE_ID, {
		// First build of the DOM under host for a new (or rebuilt) gizmo element.
		mount(host, gizmo) {
			paint(host, gizmo);
		},
		// Every HUD refresh: re-read settings + live count and retint the icon.
		update(host, gizmo) {
			paint(host, gizmo);
		},
		// Gizmo removed or type remounted — clear our DOM.
		unmount(host) {
			if (host) {
				host.textContent = "";
				host.classList.remove("is-placeholder");
			}
		}
	});

})();
