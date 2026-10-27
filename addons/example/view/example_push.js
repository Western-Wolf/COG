// COG Example API — Example (Push Updated) gizmo view script
//
// Deployed as PrismaUI/views/Example/example_push.js
// Live data: gizmo.livePayload from Papyrus UpdateGizmo(receipt, {"remaining":N}).
// Schema: zeroColor, tenColor, showCount (digit beside icon, same size/colour).

(function () {

	const TYPE_ID = "xmp-pushupdated";
	const ICON_REL = "assets/imports/icons/COG_Example/light-bulb-hollow.png";
	const DEFAULT_ZERO = "#20DF20";
	const DEFAULT_TEN = "#DF2020";
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

	function showCountEnabled(settings) {
		if (!settings || settings.showCount === undefined || settings.showCount === null) {
			return true;
		}
		return (
			settings.showCount === true ||
			settings.showCount === "true" ||
			settings.showCount === 1 ||
			settings.showCount === "1"
		);
	}

	function ensureHost(host) {
		if (!host) {
			return null;
		}
		host.classList.remove("is-placeholder");
		host.dataset.placeholder = "";
		let row = host.querySelector(".example-pushupdated-row");
		if (!row) {
			host.textContent = "";
			row = document.createElement("div");
			row.className = "example-pushupdated-row";
			row.style.cssText =
				"display:flex;flex-direction:row;align-items:center;justify-content:center;" +
				"gap:0.1em;width:100%;height:100%;box-sizing:border-box;padding:4%;" +
				"overflow:hidden;";
			const icon = document.createElement("div");
			icon.className = "example-pushupdated-icon";
			icon.style.cssText =
				"position:relative;flex:0 0 auto;box-sizing:border-box;" +
				"width:0;height:0;overflow:hidden;";
			const countEl = document.createElement("div");
			countEl.className = "example-pushupdated-count";
			countEl.style.cssText =
				"flex:0 0 auto;font-weight:700;line-height:1;user-select:none;pointer-events:none;" +
				"font-variant-numeric:tabular-nums;min-width:2ch;text-align:left;";
			row.appendChild(icon);
			row.appendChild(countEl);
			host.appendChild(row);
		}
		return row;
	}

	function faceSizePx(host, row, withCount) {
		const h = (host && host.clientHeight) || (row && row.clientHeight) || 40;
		const w = (host && host.clientWidth) || (row && row.clientWidth) || h;
		const pad = Math.max(2, Math.round(Math.min(h, w) * 0.08));
		const usableH = Math.max(8, h - pad * 2);
		const usableW = Math.max(8, w - pad * 2);
		if (!withCount) {
			return Math.max(8, Math.floor(Math.min(usableH, usableW)));
		}
		const byW = Math.floor(usableW / 2.25);
		return Math.max(8, Math.min(usableH, byW));
	}

	function paint(host, gizmo) {
		const row = ensureHost(host);
		if (!row || typeof paintMaskedFace !== "function" || typeof resolveIconHref !== "function") {
			return;
		}
		const icon = row.querySelector(".example-pushupdated-icon");
		const countEl = row.querySelector(".example-pushupdated-count");
		if (!icon || !countEl) {
			return;
		}
		const settings = readSettings(gizmo);
		const count = exampleCount(gizmo);
		const color = tintForCount(settings, count);
		const show = showCountEnabled(settings);
		const facePx = faceSizePx(host, row, show);
		icon.style.width = facePx + "px";
		icon.style.height = facePx + "px";
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
		if (show) {
			countEl.style.display = "";
			countEl.textContent = String(count);
			countEl.style.color = color;
			countEl.style.fontSize = facePx + "px";
		} else {
			countEl.style.display = "none";
			countEl.textContent = "";
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
