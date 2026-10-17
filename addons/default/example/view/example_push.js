// COG Example API — Example (Push Updated) gizmo view script
//
// Deployed as PrismaUI/views/Example/example_push.js and registered from Papyrus via
// RegisterGizmo(..., viewScript = "Example/example_push.js", ...).
// Same classic-script globals as example.js (gear-updated peer).
//
// Live data path: gizmo.livePayload from Papyrus UpdateGizmo(receipt, json).

(function () {

	const TYPE_ID = "xmp-pushupdated";

	const ICON_REL = "assets/imports/icons/COG_Example/example.svg";
	const DEFAULT_ZERO = "#DF2020";
	const DEFAULT_TEN = "#20DF20";
	const FACE_CLASS = "example-pushupdated-face";

	function readSettings(gizmo) {
		const raw = gizmo && gizmo.settings;
		if (raw && typeof raw === "object") {
			return raw;
		}
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
	 * Live countdown from UpdateGizmo payload: {"remaining": N}.
	 * Accepts object livePayload or a JSON string on livePayloadJson.
	 */
	function exampleCount(gizmo) {
		let live = gizmo && gizmo.livePayload;
		if (live == null && gizmo && typeof gizmo.livePayloadJson === "string" && gizmo.livePayloadJson.trim()) {
			try {
				live = JSON.parse(gizmo.livePayloadJson);
			} catch (e) {
				live = null;
			}
		}
		if (typeof live === "string" && live.trim()) {
			try {
				live = JSON.parse(live);
			} catch (e) {
				live = null;
			}
		}
		const n = Number(live && live.remaining);
		return Number.isFinite(n) ? n : 0;
	}

	function tintForCount(settings, count) {
		const zero = (settings && settings.zeroColor) || DEFAULT_ZERO;
		const ten = (settings && settings.tenColor) || DEFAULT_TEN;
		const t = Math.max(0, Math.min(1, count / 10));
		if (typeof mixHex === "function") {
			return mixHex(zero, ten, t) || ten;
		}
		return t >= 0.5 ? ten : zero;
	}

	function ensureHost(host) {
		if (!host) {
			return null;
		}
		host.classList.remove("is-placeholder");
		host.dataset.placeholder = "";
		let icon = host.querySelector(".example-pushupdated-icon");
		if (!icon) {
			host.textContent = "";
			icon = document.createElement("div");
			icon.className = "example-pushupdated-icon";
			icon.style.cssText =
				"position:relative;width:100%;height:100%;box-sizing:border-box;";
			host.appendChild(icon);
		}
		return icon;
	}

	function paint(host, gizmo) {
		const icon = ensureHost(host);
		if (!icon || typeof paintMaskedFace !== "function" || typeof resolveIconHref !== "function") {
			return;
		}
		const settings = readSettings(gizmo);
		const count = exampleCount(gizmo);
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

	window.CogRegisterGizmoRenderer(TYPE_ID, {
		mount(host, gizmo) {
			paint(host, gizmo);
		},
		update(host, gizmo) {
			paint(host, gizmo);
		},
		unmount(host) {
			if (host) {
				host.textContent = "";
				host.classList.remove("is-placeholder");
			}
		}
	});

})();
