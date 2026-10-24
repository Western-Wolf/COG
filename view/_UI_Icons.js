// COG overlay - icon paths, masked paint, catalog, picker, endcaps
// Classic script; shares globals with _UI.js and feature modules.

const ICON_ROOT = "assets/icons/";
const ICON_IMPORT_ROOT = "assets/imports/icons/";
/** Shipped fallback when a gear/feed icon path is empty or missing from the catalog. */
const FALLBACK_ICON_REL = "COG/cog.svg";

/** Hrefs that failed to load; resolveDisplayIconHref / paintMaskedFace use fallback. */
const missingIconHrefSet = new Set();

/** @type {Map<string, string>} path -> "icons" | "imports/icons" */
let iconRootByPath = new Map();
/** @type {Set<string>} lowercase paths known to live under assets/imports/icons/ */
let importedIconPathSet = new Set();

let iconPickerState = null;

function normalizeIconRelPath(raw) {
	return String(raw || "").trim().replace(/\\/g, "/");
}

function stripIconRootPrefixes(rel) {
	let out = normalizeIconRelPath(rel);
	while (out.startsWith("./") || out.startsWith("/")) {
		out = out.replace(/^\.\//, "").replace(/^\//, "");
	}
	if (/^assets\/imports\/icons\//i.test(out)) {
		out = out.slice("assets/imports/icons/".length);
	} else if (/^imports\/icons\//i.test(out)) {
		out = out.slice("imports/icons/".length);
	} else if (/^assets\/icons\//i.test(out)) {
		out = out.slice("assets/icons/".length);
	} else if (/^icons\//i.test(out)) {
		out = out.slice("icons/".length);
	}
	return out;
}

/** Clean a single icon asset path (rejects empty / traversal / .json pack leftovers). */
function normalizeIconAssetPath(raw) {
	let out = stripIconRootPrefixes(raw);
	if (!out || out.includes("..") || out.includes(":")) {
		return "";
	}
	const slash = out.lastIndexOf("/");
	const base = slash >= 0 ? out.slice(slash + 1) : out;
	if (base && base.indexOf(".") < 0) {
		out += ".svg";
	}
	if (/\.json$/i.test(base) || /\.json$/i.test(out)) {
		return "";
	}
	return out;
}

/**
 * Icon stops mirror colour ramps: plain path or JSON [{ pct, path }].
 * Sampling is discrete (hold until next stop) — no lerp between assets.
 */
function parseIconRamp(raw) {
	if (raw == null) {
		return [];
	}
	if (Array.isArray(raw)) {
		const stops = [];
		for (const item of raw) {
			if (typeof item === "string") {
				const path = normalizeIconAssetPath(item);
				if (path) {
					stops.push({ pct: 0, path });
				}
				continue;
			}
			if (!item || typeof item !== "object") {
				continue;
			}
			const path = normalizeIconAssetPath(item.path || item.icon || "");
			if (!path) {
				continue;
			}
			let pct = Number(item.pct != null ? item.pct : item.percent);
			if (!Number.isFinite(pct)) {
				pct = 0;
			}
			pct = Math.max(0, Math.min(100, pct));
			stops.push({ pct, path });
		}
		stops.sort((a, b) => a.pct - b.pct);
		const uniq = [];
		for (const s of stops) {
			if (uniq.length && Math.abs(uniq[uniq.length - 1].pct - s.pct) < 1e-9) {
				uniq[uniq.length - 1] = s;
			} else {
				uniq.push(s);
			}
		}
		return uniq;
	}
	const text = String(raw).trim();
	if (!text) {
		return [];
	}
	if (text.charAt(0) === "[") {
		try {
			return parseIconRamp(JSON.parse(text));
		} catch {
			return [];
		}
	}
	const path = normalizeIconAssetPath(text);
	return path ? [{ pct: 0, path }] : [];
}

function formatIconRamp(stops) {
	const list = parseIconRamp(Array.isArray(stops) ? stops : []);
	if (!list.length) {
		return "";
	}
	if (list.length === 1) {
		return list[0].path;
	}
	return JSON.stringify(list.map((s) => ({ pct: s.pct, path: s.path })));
}

function normalizeIconRampValue(raw) {
	const stops = parseIconRamp(raw);
	return stops.length ? formatIconRamp(stops) : "";
}

/** Active icon path = last stop whose pct ≤ gear percent (holds through 100). */
function pickIconRampFrame(stopsOrRaw, percent) {
	const stops = Array.isArray(stopsOrRaw) ? parseIconRamp(stopsOrRaw) : parseIconRamp(stopsOrRaw);
	if (!stops.length) {
		return "";
	}
	const pct = Math.max(0, Math.min(100, Number(percent) || 0));
	let best = stops[0];
	for (let i = 0; i < stops.length; i += 1) {
		if (stops[i].pct <= pct + 1e-9) {
			best = stops[i];
		} else {
			break;
		}
	}
	return best.path || "";
}

function sourceIconRel(src, gear) {
	const raw = appearanceOf(gear, src).icon;
	const pct =
		typeof barPercent === "function"
			? barPercent(src)
			: Math.max(0, Math.min(100, Number(src && src.value) || 0));
	return pickIconRampFrame(raw, pct);
}

function sourceIconPath(src, gear) {
	return resolveDisplayIconHref(sourceIconRel(src, gear));
}

function iconHrefForRoot(rel, root) {
	return root === "imports/icons" ? ICON_IMPORT_ROOT + rel : ICON_ROOT + rel;
}

function fallbackIconHref() {
	return ICON_ROOT + FALLBACK_ICON_REL;
}

/**
 * Path builder only. Empty / invalid → "". Does not substitute the fallback
 * (callers that mean "show an icon" use resolveDisplayIconHref instead).
 */
function resolveIconHref(raw) {
	let rel = normalizeIconRelPath(raw);
	while (rel.startsWith("./") || rel.startsWith("/")) {
		rel = rel.replace(/^\.\//, "").replace(/^\//, "");
	}
	if (/^assets\/imports\/icons\//i.test(rel)) {
		rel = rel.slice("assets/imports/icons/".length);
		return iconHrefForRoot(rel, "imports/icons");
	}
	if (/^imports\/icons\//i.test(rel)) {
		rel = rel.slice("imports/icons/".length);
		return iconHrefForRoot(rel, "imports/icons");
	}
	if (/^assets\/icons\//i.test(rel)) {
		rel = rel.slice("assets/icons/".length);
	} else if (/^icons\//i.test(rel)) {
		rel = rel.slice("icons/".length);
	}
	if (!rel || rel.includes("..") || rel.includes(":")) {
		return "";
	}
	const base = rel.split("/").pop() || "";
	if (base && !base.includes(".")) {
		rel += ".svg";
	}
	const key = rel.toLowerCase();
	const root = iconRootByPath.get(key);
	if (root) {
		return iconHrefForRoot(rel, root);
	}
	if (importedIconPathSet.has(key)) {
		return ICON_IMPORT_ROOT + rel;
	}
	return ICON_ROOT + rel;
}

/**
 * Shared display resolver for gears, gauges, gizmos, feed, etc.
 * Empty path → COG/cog.svg. Missing files are handled by bindIconImgFallback /
 * paintMaskedFace (load probe). Intentional hide: pass "" to the painter/clear
 * path, or skip calling this and leave the host hidden.
 */
function resolveDisplayIconHref(raw) {
	const trimmed = String(raw || "").trim();
	if (!trimmed) {
		return fallbackIconHref();
	}
	const href = resolveIconHref(trimmed) || fallbackIconHref();
	const fb = fallbackIconHref();
	if (href !== fb && missingIconHrefSet.has(href)) {
		return fb;
	}
	return href;
}

function markIconHrefMissing(href) {
	const key = String(href || "").trim();
	const fb = fallbackIconHref();
	if (key && key !== fb) {
		missingIconHrefSet.add(key);
	}
}

/** If an <img> fails to load, swap to the shipped fallback once. */
function bindIconImgFallback(img) {
	if (!img || img.dataset.cogIconFb === "1") {
		return;
	}
	img.dataset.cogIconFb = "1";
	img.addEventListener(
		"error",
		() => {
			markIconHrefMissing(img.getAttribute("src") || "");
			const fb = fallbackIconHref();
			if (img.getAttribute("src") !== fb) {
				img.src = fb;
			}
		},
		{ once: true }
	);
}

function ensureMaskedFace(host, faceClass) {
	if (!host) {
		return null;
	}
	let face = null;
	for (const child of host.children) {
		if (child.classList && child.classList.contains(faceClass)) {
			face = child;
			break;
		}
	}
	if (!face) {
		face = document.createElement("div");
		face.className = faceClass;
		host.insertBefore(face, host.firstChild);
	}
	return face;
}

/**
 * Shared CSS-mask icon paint. Empty/clear leaves the face hidden (no fallback).
 * Non-empty href that fails to load is replaced with COG/cog.svg.
 * Failed hrefs are remembered so high-frequency painters (clock/feed/suppressor)
 * do not thrash missing URL → cog every tick. After icon-map rebuild clears that
 * cache, faces re-probe instead of sticking on a broken mask with no new probe.
 */
function paintMaskedFace(host, faceClass, { color, href, clear = false } = {}) {
	const face = ensureMaskedFace(host, faceClass);
	if (!face) {
		return null;
	}
	if (clear || !href) {
		face.hidden = true;
		face.style.background = "";
		face.style.webkitMaskImage = "";
		face.style.maskImage = "";
		delete face.dataset.cogPaintHref;
		delete face.dataset.cogPaintColor;
		delete face.dataset.cogProbeHref;
		delete face.dataset.cogMaskOk;
		return face;
	}
	const fb = fallbackIconHref();
	const paint = color || "#ffffff";
	let effective = href;
	if (href !== fb && missingIconHrefSet.has(href)) {
		effective = fb;
	}
	// Skip redundant work when already painted, or a probe for this href is in flight.
	if (
		!face.hidden &&
		face.dataset.cogPaintHref === effective &&
		face.dataset.cogPaintColor === paint &&
		(effective === fb || face.dataset.cogMaskOk === href || face.dataset.cogProbeHref === href)
	) {
		return face;
	}
	// After a prior fallback, keep cog visible while re-checking a previously-missing href
	// (e.g. icon map rebuilt) so high-frequency painters do not flash empty/broken masks.
	const keepFallbackWhileProbe =
		effective !== fb &&
		face.dataset.cogPaintHref === fb &&
		!missingIconHrefSet.has(href);
	face.hidden = false;
	face.style.background = paint;
	face.dataset.cogPaintColor = paint;
	if (keepFallbackWhileProbe) {
		if (face.dataset.cogProbeHref !== href) {
			face.dataset.cogProbeHref = href;
			delete face.dataset.cogMaskOk;
			const probe = new Image();
			probe.onload = () => {
				if (face.dataset.cogProbeHref !== href) {
					return;
				}
				face.dataset.cogMaskOk = href;
				face.style.webkitMaskImage = `url("${href}")`;
				face.style.maskImage = `url("${href}")`;
				face.dataset.cogPaintHref = href;
			};
			probe.onerror = () => {
				markIconHrefMissing(href);
				if (face.dataset.cogProbeHref !== href) {
					return;
				}
				face.dataset.cogPaintHref = fb;
				delete face.dataset.cogMaskOk;
			};
			probe.src = href;
		}
		return face;
	}
	face.style.webkitMaskImage = `url("${effective}")`;
	face.style.maskImage = `url("${effective}")`;
	face.dataset.cogPaintHref = effective;
	if (effective === fb) {
		return face;
	}
	face.dataset.cogProbeHref = href;
	delete face.dataset.cogMaskOk;
	const probe = new Image();
	probe.onload = () => {
		if (face.dataset.cogProbeHref !== href) {
			return;
		}
		face.dataset.cogMaskOk = href;
		face.style.webkitMaskImage = `url("${href}")`;
		face.style.maskImage = `url("${href}")`;
		face.dataset.cogPaintHref = href;
	};
	probe.onerror = () => {
		markIconHrefMissing(href);
		if (face.dataset.cogProbeHref !== href) {
			return;
		}
		face.style.webkitMaskImage = `url("${fb}")`;
		face.style.maskImage = `url("${fb}")`;
		face.dataset.cogPaintHref = fb;
		delete face.dataset.cogMaskOk;
	};
	probe.src = href;
	return face;
}

function rebuildIconRootMap() {
	iconRootByPath = new Map();
	importedIconPathSet = new Set();
	// Keep missingIconHrefSet: clearing it made high-frequency painters (clock)
	// re-apply broken URLs and skip re-probing, so fallback cogs vanished until
	// a full HUD rebuild. Mid-session icon restore still re-probes when a face
	// is already showing the fallback for that href.
	const list = Array.isArray(snapshot.icons) ? snapshot.icons : [];
	for (const item of list) {
		if (!item || !item.path) {
			continue;
		}
		const key = String(item.path).toLowerCase();
		const root = String(item.root || "icons");
		iconRootByPath.set(key, root);
		if (root === "imports/icons") {
			importedIconPathSet.add(key);
		}
	}
	const imported = Array.isArray(snapshot.importedIcons) ? snapshot.importedIcons : [];
	for (const item of imported) {
		const path = String((item && item.path) || item || "")
			.trim()
			.replace(/\\/g, "/");
		if (!path) {
			continue;
		}
		const key = path.toLowerCase();
		importedIconPathSet.add(key);
		if (!iconRootByPath.has(key)) {
			iconRootByPath.set(key, "imports/icons");
		}
	}
}

/** Normalize endcap art paths under Endcaps/. */
function migrateEndCapPath(raw) {
	let rel = normalizeIconRelPath(raw);
	if (!rel) {
		return "";
	}
	while (rel.startsWith("./") || rel.startsWith("/")) {
		rel = rel.replace(/^\.\//, "").replace(/^\//, "");
	}
	if (/^endcaps\//i.test(rel) && !/^Endcaps\//.test(rel)) {
		rel = "Endcaps/" + rel.slice("endcaps/".length);
	} else if (/^assets\/icons\//i.test(rel)) {
		rel = rel.slice("assets/icons/".length);
	} else if (/^icons\//i.test(rel)) {
		rel = rel.slice("icons/".length);
	}
	if (rel.includes("..") || rel.includes(":")) {
		return "";
	}
	if (!rel.includes("/")) {
		if (!rel.includes(".")) {
			rel += ".svg";
		}
		rel = "Endcaps/" + rel;
	} else {
		const base = rel.split("/").pop() || "";
		if (base && !base.includes(".")) {
			rel += ".svg";
		}
	}
	return rel;
}

function normalizeEndCapMode(raw, endCapPath) {
	const m = String(raw || "").trim().toLowerCase();
	if (m === "border") {
		return "border";
	}
	if (m === "endcap") {
		return "endcap";
	}
	return migrateEndCapPath(endCapPath) ? "endcap" : "border";
}

/** End-cap fields live under settings for gauges/gizmos; flat bags (layout helpers) keep them on root. */
function endCapBag(item) {
	if (item && item.settings && typeof item.settings === "object" && !Array.isArray(item.settings)) {
		return item.settings;
	}
	return item || {};
}

function gaugeUsesEndArt(gaugeOrGizmo) {
	const bag = endCapBag(gaugeOrGizmo);
	return normalizeEndCapMode(bag.endCapMode, bag.endCap) === "endcap";
}

function resolveGaugeEndArtHref(gaugeOrGizmo) {
	if (!gaugeUsesEndArt(gaugeOrGizmo)) {
		return "";
	}
	return resolveIconHref(migrateEndCapPath(endCapBag(gaugeOrGizmo).endCap));
}

function resolveEndcapHref(raw) {
	return resolveIconHref(migrateEndCapPath(raw));
}

/** First Endcaps/ icon alphabetically from the live catalog, or "". */
function defaultEndCapArtPath() {
	const paths = iconsInFolder("Endcaps")
		.map((icon) => icon.path)
		.filter(Boolean)
		.sort(compareIconPaths);
	return paths[0] || "";
}

/** Cached end-cap width/height from SVG viewBox (or width/height attrs). */
const endCapAspectCache = new Map();

function parseSvgAspectRatio(svgText) {
	const text = String(svgText || "");
	const vb = text.match(/\bviewBox\s*=\s*["']?\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i);
	if (vb) {
		const w = Math.abs(Number(vb[3]));
		const h = Math.abs(Number(vb[4]));
		if (w > 0 && h > 0) {
			return w / h;
		}
	}
	const width = text.match(/\bwidth\s*=\s*["']?\s*([-\d.]+)/i);
	const height = text.match(/\bheight\s*=\s*["']?\s*([-\d.]+)/i);
	if (width && height) {
		const w = Math.abs(Number(width[1]));
		const h = Math.abs(Number(height[1]));
		if (w > 0 && h > 0) {
			return w / h;
		}
	}
	return 1;
}

function requestEndCapAspect(href) {
	if (!href || endCapAspectCache.has(href)) {
		return;
	}
	endCapAspectCache.set(href, null);
	fetch(href, { cache: "force-cache" })
		.then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
		.then((text) => {
			const aspect = parseSvgAspectRatio(text);
			const prev = endCapAspectCache.get(href);
			endCapAspectCache.set(href, aspect);
			if (prev !== aspect) {
				scheduleEndCapAspectRefresh();
			}
		})
		.catch(() => {
			endCapAspectCache.set(href, 1);
		});
}

let endCapAspectRefreshTimer = null;
function scheduleEndCapAspectRefresh() {
	clearTimeout(endCapAspectRefreshTimer);
	endCapAspectRefreshTimer = setTimeout(() => {
		endCapAspectRefreshTimer = null;
		if (!drag) {
			renderGears();
		}
	}, 0);
}

/** Width/height of an end-cap SVG; loads viewBox asynchronously and defaults to 1 until known. */
function endCapAspectRatio(raw) {
	const href = resolveEndcapHref(raw);
	if (!href) {
		return 1;
	}
	if (endCapAspectCache.has(href)) {
		const cached = endCapAspectCache.get(href);
		return cached == null ? 1 : cached;
	}
	requestEndCapAspect(href);
	return 1;
}

function preloadEndCapAspects() {
	for (const icon of iconsInFolder("Endcaps")) {
		requestEndCapAspect(resolveEndcapHref(icon.path));
	}
}

/**
 * Multi-stop icon ramp editor (gear.icon).
 * Same chrome as colour ramps; assets switch at percentages (no fade).
 */
function makeIconRampEditor(label, value, fallbackPath, onCommit) {
	const wrap = document.createElement("div");
	wrap.className = "color-ramp-editor icon-ramp-editor";
	const heading = document.createElement("div");
	heading.className = "color-ramp-heading";
	heading.textContent = label;
	wrap.appendChild(heading);
	const hint = document.createElement("p");
	hint.className = "lede color-ramp-hint";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			hint,
			"cog-icon-ramp-hint",
			"Each stop switches the icon at that percentage. Icons do not fade between stops."
		);
	} else {
		hint.textContent =
			"Each stop switches the icon at that percentage. Icons do not fade between stops.";
	}
	wrap.appendChild(hint);
	const list = document.createElement("div");
	list.className = "color-ramp-stops";
	wrap.appendChild(list);
	const defaultPath =
		normalizeIconAssetPath(fallbackPath) ||
		normalizeIconAssetPath(typeof FALLBACK_ICON_REL !== "undefined" ? FALLBACK_ICON_REL : "COG/cog.svg") ||
		"COG/cog.svg";
	let stops = parseIconRamp(value);

	const emit = (live) => {
		if (typeof onCommit === "function") {
			onCommit(formatIconRamp(stops), !!live);
		}
	};

	const hasHundredStop = () => stops.some((s) => s.pct >= 100 - 1e-9);
	let addBtn = null;
	let addWrap = null;

	const closeAddCapTip = () => {
		if (!addWrap) {
			return;
		}
		closeInfoTipWrap(addWrap);
	};

	const syncAddBtn = () => {
		if (!addBtn || !addWrap) {
			return;
		}
		const atCap = hasHundredStop();
		addBtn.disabled = atCap;
		addBtn.removeAttribute("title");
		if (typeof setTranslatedAriaLabel === "function") {
			if (atCap) {
				setTranslatedAriaLabel(
					addBtn,
					"cog-cannot-add-icon-stop",
					"Cannot add \u2014 already has a 100% stop"
				);
			} else {
				setTranslatedAriaLabel(addBtn, "cog-add-icon-stop", "Add icon stop");
			}
		} else {
			addBtn.setAttribute(
				"aria-label",
				atCap ? "Cannot add \u2014 already has a 100% stop" : "Add icon stop"
			);
		}
		addWrap.classList.toggle("is-capped", atCap);
		if (!atCap) {
			closeAddCapTip();
		}
	};

	const addStop = () => {
		if (hasHundredStop()) {
			return;
		}
		const lastPct = stops.length ? stops[stops.length - 1].pct : 0;
		const nextPct = stops.length ? Math.min(100, lastPct + 10) : 0;
		const seedPath = stops.length ? stops[stops.length - 1].path : defaultPath;
		stops.push({
			pct: stops.length ? nextPct : 0,
			path: seedPath || defaultPath
		});
		if (stops.length === 2 && stops[0].pct === 0 && stops[1].pct === 0) {
			stops[1].pct = 100;
		}
		stops = parseIconRamp(stops);
		emit(false);
		rebuild();
	};

	const rebuild = () => {
		closeAddCapTip();
		list.innerHTML = "";
		stops.forEach((stop, index) => {
			const card = document.createElement("div");
			card.className = "color-ramp-card icon-ramp-card";

			const iconCtrl = makeIconControl({
				label: "Icon",
				value: stop.path,
				showName: false,
				onCommit: (path) => {
					const cleaned = normalizeIconAssetPath(path) || defaultPath;
					stops[index] = { ...stops[index], path: cleaned };
					emit(false);
					rebuild();
				}
			});
			tagFieldLabel(iconCtrl, "cog-icon", "Icon");
			card.appendChild(iconCtrl);

			const pctLab = document.createElement("label");
			pctLab.className = "color-ramp-pct";
			const pctInput = document.createElement("input");
			pctInput.type = "text";
			pctInput.inputMode = "decimal";
			pctInput.spellcheck = false;
			pctInput.value = String(stop.pct);
			if (typeof setTranslatedAriaLabel === "function") {
				setTranslatedAriaLabel(pctInput, "cog-percentage", "Percentage");
			} else {
				pctInput.setAttribute("aria-label", "Percentage");
			}
			pctInput.addEventListener("input", () => {
				let n = Number(pctInput.value);
				if (!Number.isFinite(n)) {
					return;
				}
				n = Math.max(0, Math.min(100, n));
				stops[index] = { ...stops[index], pct: n };
				syncAddBtn();
				emit(true);
			});
			pctInput.addEventListener("change", () => {
				let n = Number(pctInput.value);
				if (!Number.isFinite(n)) {
					n = 0;
				}
				n = Math.max(0, Math.min(100, n));
				pctInput.value = String(n);
				stops[index] = { ...stops[index], pct: n };
				stops = parseIconRamp(stops);
				emit(false);
				rebuild();
			});
			pctLab.appendChild(pctInput);
			wrapInputAffix(pctInput, { suffix: "%" });
			card.appendChild(pctLab);

			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "clock-token-remove";
			if (typeof setTranslatedTitle === "function") {
				setTranslatedTitle(remove, "cog-remove", "Remove");
			} else {
				remove.title = "Remove";
			}
			if (typeof setTranslatedAriaLabel === "function") {
				setTranslatedAriaLabel(remove, "cog-remove-icon-stop", "Remove icon stop");
			} else {
				remove.setAttribute("aria-label", "Remove icon stop");
			}
			remove.textContent = "×";
			remove.addEventListener("click", () => {
				stops.splice(index, 1);
				emit(false);
				rebuild();
			});
			card.appendChild(remove);
			list.appendChild(card);
		});

		addWrap = document.createElement("span");
		addWrap.className = "color-ramp-add-wrap info-tip";
		addBtn = document.createElement("button");
		addBtn.type = "button";
		addBtn.className = "color-ramp-add";
		addBtn.textContent = "+";
		addBtn.addEventListener("click", addStop);
		const tipPanel = document.createElement("span");
		tipPanel.className = "info-tip-panel";
		tipPanel.hidden = true;
		if (typeof setTranslatedText === "function") {
			setTranslatedText(
				tipPanel,
				"cog-icon-ramp-at-cap",
				"Already has a 100% stop \u2014 lower one first to add another."
			);
		} else {
			tipPanel.textContent =
				"Already has a 100% stop \u2014 lower one first to add another.";
		}
		addWrap._cogPanel = tipPanel;
		const showCapTip = () => {
			if (!hasHundredStop() || addWrap.classList.contains("is-open")) {
				return;
			}
			beginEditorPopup("info");
			addWrap.classList.add("is-open");
			const place = () => placeAnchoredPopup(tipPanel, addBtn, { gap: 6, align: "start" });
			addWrap._cogPopupId = registerEditorPopup("info", {
				close: () => closeInfoTipWrap(addWrap),
				reposition: place,
				retain: tipPanel
			});
			place();
		};
		addWrap.addEventListener("pointerenter", showCapTip);
		addWrap.addEventListener("pointerleave", closeAddCapTip);
		tipPanel.addEventListener("pointerdown", (ev) => ev.stopPropagation());
		tipPanel.addEventListener("click", (ev) => ev.stopPropagation());
		addWrap.appendChild(addBtn);
		addWrap.appendChild(tipPanel);
		syncAddBtn();
		list.appendChild(addWrap);
	};

	rebuild();
	return wrap;
}

function mapCatalogEntry(item) {
	if (typeof item === "string") {
		return { path: item, section: item.includes("/") ? item.split("/")[0] : "General" };
	}
	const path = String((item && item.path) || "").replace(/\\/g, "/");
	if (!path) {
		return null;
	}
	const section = String((item && item.section) || (path.includes("/") ? path.split("/")[0] : "General"));
	const root = String((item && item.root) || "icons");
	return { path, section: section || "General", root };
}

/** Live icon list from C++ directory scan (snapshot.icons). */
function iconCatalog() {
	const byPath = new Map();
	const list = Array.isArray(snapshot.icons) ? snapshot.icons : [];
	for (const item of list) {
		const entry = mapCatalogEntry(item);
		if (!entry) {
			continue;
		}
		byPath.set(entry.path, entry);
	}
	return [...byPath.values()];
}

/** Icons in a top-level folder under assets/icons/ (e.g. "Pictures", "Frames"). */
function iconsInFolder(folder) {
	const name = String(folder || "").trim();
	if (!name) {
		return iconCatalog();
	}
	const lower = name.toLowerCase();
	return iconCatalog().filter((entry) => String(entry.section || "").toLowerCase() === lower);
}

function compareIconPaths(a, b) {
	return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function firstIconInFolder(folder) {
	const paths = iconsInFolder(folder)
		.map((entry) => entry.path)
		.filter(Boolean)
		.sort(compareIconPaths);
	return paths[0] || "";
}

function iconSections(folder) {
	const locked = String(folder || "").trim();
	const map = new Map();
	for (const icon of locked ? iconsInFolder(locked) : iconCatalog()) {
		const section = locked || icon.section || "General";
		if (!map.has(section)) {
			map.set(section, []);
		}
		map.get(section).push(icon.path);
	}
	const sections = [...map.keys()].sort((a, b) => {
		if (a === "General") {
			return -1;
		}
		if (b === "General") {
			return 1;
		}
		return a.localeCompare(b);
	});
	return sections.map((name) => ({
		name,
		paths: map.get(name).slice().sort(compareIconPaths)
	}));
}

function closeIconPicker() {
	const id = iconPickerState && iconPickerState.popupId;
	if (iconPickerState && iconPickerState.el) {
		if (iconPickerState.el.parentNode) {
			iconPickerState.el.parentNode.removeChild(iconPickerState.el);
		}
	}
	iconPickerState = null;
	unregisterEditorPopup(id);
	hideHoverTip();
}

function paintIconSwatch(btn, rel, _showName, resolveHref = resolveIconHref) {
	btn.innerHTML = "";
	btn.classList.remove("is-raster-preview", "has-name");
	const cleaned = stripIconRootPrefixes(rel);
	const href = resolveHref(cleaned || rel);
	const name = iconDisplayName(cleaned || rel);
	if (!href) {
		btn.classList.add("is-empty");
		setIconButtonTip(btn, "Choose icon");
		return;
	}
	btn.classList.remove("is-empty");
	setIconButtonTip(btn, name || "Choose icon");
	const animated =
		typeof iconHrefIsAnimated === "function"
			? iconHrefIsAnimated(href)
			: /\.(gif|webp)(\?|#|$)/i.test(href);
	btn.classList.toggle("is-raster-preview", !!animated);
	const img = document.createElement("img");
	img.src = href;
	img.alt = "";
	img.addEventListener(
		"error",
		() => {
			const importTry =
				resolveHref === resolveIconHref && !href.startsWith(ICON_IMPORT_ROOT)
					? ICON_IMPORT_ROOT + normalizeIconRelPath(cleaned || rel)
					: "";
			if (importTry && img.getAttribute("src") !== importTry) {
				img.src = importTry;
				bindIconImgFallback(img);
				return;
			}
			const fb = fallbackIconHref();
			if (img.getAttribute("src") !== fb) {
				img.src = fb;
			}
		},
		{ once: true }
	);
	btn.appendChild(img);
}

/** Friendly icon label for tooltips (folder/stem, no extension). */
function iconDisplayName(rel) {
	const normalized = stripIconRootPrefixes(rel);
	if (!normalized) {
		return "";
	}
	return normalized.replace(/\.(svg|png|gif|webp|jpg|jpeg|bmp)$/i, "");
}

function setIconButtonTip(btn, tip) {
	const raw = String(tip || "").trim();
	// Chrome vocabulary only — never tag icon path / displayName tips.
	if (!raw || raw === "Choose icon") {
		const text = typeof t === "function" ? t("cog-choose-icon", "Choose icon") : "Choose icon";
		btn.dataset.tip = text;
		if (typeof setTranslatedAriaLabel === "function") {
			setTranslatedAriaLabel(btn, "cog-choose-icon", "Choose icon");
		} else {
			btn.setAttribute("aria-label", text);
		}
	} else {
		btn.removeAttribute("data-translation-aria-label");
		btn.removeAttribute("data-translation-aria-label-fallback");
		btn.removeAttribute("data-translation-aria-label-vars");
		btn.dataset.tip = raw;
		btn.setAttribute("aria-label", raw);
	}
	btn.removeAttribute("title");
}

function openIconPicker(anchor, opts) {
	beginEditorPopup("icon");
	const paint = () => {
		if (iconPickerState) {
			return;
		}
		const pop = document.createElement("div");
		pop.className = "cog-icon-picker";
		// folder locks the drawer to one assets/icons/<folder> section (any folder name).
		const lockedFolder = String(opts.folder || opts.section || opts.filterToSection || "").trim();
		const isFolderLocked = !!lockedFolder;
		const primarySections = lockedFolder ? iconSections(lockedFolder) : iconSections("");
		const resolvePathHref = (path) =>
			/^Endcaps\//i.test(path) || /^Endcaps$/i.test(lockedFolder)
				? resolveEndcapHref(path)
				: resolveIconHref(path);

		const appendSection = (parent, section) => {
			const block = document.createElement("div");
			block.className = "cip-section";
			const title = document.createElement("div");
			title.className = "cip-section-title";
			title.textContent = section.name;
			block.appendChild(title);
			const grid = document.createElement("div");
			grid.className = "cip-grid";
			for (const path of section.paths) {
				const cell = document.createElement("button");
				cell.type = "button";
				cell.className = "icon-swatch" + (path === opts.value ? " is-selected" : "");
				setIconButtonTip(cell, iconDisplayName(path) || path);
				{
					const img = document.createElement("img");
					img.src = resolvePathHref(path);
					img.alt = "";
					const animated =
						typeof iconHrefIsAnimated === "function"
							? iconHrefIsAnimated(img.src)
							: /\.(gif|webp)(\?|#|$)/i.test(img.src);
					cell.classList.toggle("is-raster-preview", !!animated);
					cell.appendChild(img);
				}
				cell.addEventListener("click", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					if (typeof opts.onChange === "function") {
						opts.onChange(path);
					}
					closeIconPicker();
				});
				grid.appendChild(cell);
			}
			block.appendChild(grid);
			parent.appendChild(block);
		};

		const body = document.createElement("div");
		body.className = "cip-body";
		if (!primarySections.length || !primarySections.some((s) => s.paths && s.paths.length)) {
			const empty = document.createElement("p");
			empty.className = "ccp-empty";
			if (lockedFolder) {
				if (typeof setTranslatedText === "function") {
					setTranslatedText(empty, "cog-no-icons-in-folder", "No icons found in {folder}.", {
						folder: lockedFolder
					});
				} else {
					empty.textContent = `No icons found in ${lockedFolder}.`;
				}
			} else if (typeof setTranslatedText === "function") {
				setTranslatedText(empty, "cog-no-icons-found", "No icons found under assets/icons.");
			} else {
				empty.textContent = "No icons found under assets/icons.";
			}
			body.appendChild(empty);
		} else {
			for (const section of primarySections) {
				appendSection(body, section);
			}
		}

		const extrasHost = document.createElement("div");
		extrasHost.className = "cip-extras";
		extrasHost.hidden = true;

		if (isFolderLocked) {
			const seeAll = document.createElement("label");
			seeAll.className = "cip-see-all";
			const seeAllBox = document.createElement("input");
			seeAllBox.type = "checkbox";
			seeAllBox.dataset.role = "seeAllIcons";
			const seeAllText = document.createElement("span");
			if (typeof setTranslatedText === "function") {
				setTranslatedText(seeAllText, "cog-see-all-icons", "See all Icons");
			} else {
				seeAllText.textContent = "See all Icons";
			}
			seeAll.appendChild(seeAllBox);
			seeAll.appendChild(document.createTextNode(" "));
			seeAll.appendChild(seeAllText);
			seeAllBox.addEventListener("change", () => {
				extrasHost.hidden = !seeAllBox.checked;
				if (seeAllBox.checked && !extrasHost.dataset.filled) {
					const lockedLower = lockedFolder.toLowerCase();
					const others = iconSections("").filter((s) => String(s.name || "").toLowerCase() !== lockedLower);
					if (!others.length) {
						const empty = document.createElement("p");
						empty.className = "ccp-empty";
						if (typeof setTranslatedText === "function") {
							setTranslatedText(
								empty,
								"cog-no-other-icon-folders",
								"No other icon folders found."
							);
						} else {
							empty.textContent = "No other icon folders found.";
						}
						extrasHost.appendChild(empty);
					} else {
						for (const section of others) {
							appendSection(extrasHost, section);
						}
					}
					extrasHost.dataset.filled = "1";
				}
				if (iconPickerState && typeof iconPickerState.reposition === "function") {
					iconPickerState.reposition();
				}
			});
			body.appendChild(seeAll);
			body.appendChild(extrasHost);
		}

		pop.appendChild(body);

		const actions = document.createElement("div");
		actions.className = "cip-actions";
		const clear = document.createElement("button");
		clear.type = "button";
		clear.className = "action";
		if (opts.clearLabel) {
			clear.textContent = opts.clearLabel;
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(clear, "cog-clear-icon", "Clear icon");
		} else {
			clear.textContent = "Clear icon";
		}
		clear.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			if (typeof opts.onChange === "function") {
				opts.onChange("");
			}
			closeIconPicker();
		});
		actions.appendChild(clear);
		pop.appendChild(actions);
		pop.addEventListener("pointerdown", (ev) => ev.stopPropagation());
		document.body.appendChild(pop);

		const place = () => {
			const rect = anchor.getBoundingClientRect();
			const pad = 8;
			const pw = pop.offsetWidth || 260;
			const ph = pop.offsetHeight || 280;
			let left = rect.left;
			let top = rect.bottom + 6;
			if (left + pw > window.innerWidth - pad) {
				left = Math.max(pad, window.innerWidth - pw - pad);
			}
			if (top + ph > window.innerHeight - pad) {
				top = Math.max(pad, rect.top - ph - 6);
			}
			pop.style.left = `${Math.round(left)}px`;
			pop.style.top = `${Math.round(top)}px`;
		};
		place();
		const popupId = registerEditorPopup("icon", {
			close: closeIconPicker,
			reposition: place,
			retain: pop
		});
		iconPickerState = { el: pop, anchor, reposition: place, popupId };
	};
	paint();
}

function makeIconControl(opts) {
	const folder = String(opts.folder || opts.section || "").trim();
	const isEndcap = /^Endcaps$/i.test(folder);
	const isFolderLocked = !!folder;
	const resolveHref = isEndcap ? resolveEndcapHref : resolveIconHref;
	const field = document.createElement("div");
	field.className = "icon-field";
	// Compact named swatch (end art / folder-locked pickers); independent of catalog filter.
	if (isFolderLocked || opts.endArtPicker) {
		field.classList.add("is-endcap-picker");
	}
	field.innerHTML = `<span>${opts.label || "Icon"}</span>
		<button type="button" class="icon-swatch"></button>`;
	const swatch = field.querySelector(".icon-swatch");
	if (typeof setTranslatedAriaLabel === "function") {
		setTranslatedAriaLabel(swatch, "cog-choose-icon", "Choose icon");
	} else {
		swatch.setAttribute("aria-label", "Choose icon");
	}
	let value = isEndcap ? migrateEndCapPath(opts.value) : String(opts.value || "");
	paintIconSwatch(swatch, value, opts.showName, resolveHref);
	swatch.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		if (iconPickerState && iconPickerState.anchor === swatch) {
			closeIconPicker();
			return;
		}
		openIconPicker(swatch, {
			value,
			folder,
			clearLabel: opts.clearLabel || "Clear icon",
			onChange: (next) => {
				value = isEndcap ? migrateEndCapPath(next) : next || "";
				paintIconSwatch(swatch, value, opts.showName, resolveHref);
				if (typeof opts.onCommit === "function") {
					opts.onCommit(value);
				}
			}
		});
	});
	return field;
}

/** Kept for C++ PushImportedIconsToUi; also seeds import roots for resolveIconHref. */
window.applyImportedIcons = (jsonStr) => {
	try {
		const data = typeof jsonStr === "string" ? JSON.parse(jsonStr || "{}") : jsonStr;
		const list = data && Array.isArray(data.icons) ? data.icons : [];
		if (!Array.isArray(snapshot.importedIcons)) {
			snapshot.importedIcons = [];
		}
		const byPath = new Map();
		for (const item of snapshot.importedIcons) {
			const path = String((item && item.path) || "").replace(/\\/g, "/");
			if (path) {
				byPath.set(path.toLowerCase(), { path, section: (item && item.section) || "General" });
			}
		}
		for (const item of list) {
			const path = String((item && item.path) || "").replace(/\\/g, "/");
			if (!path) {
				continue;
			}
			byPath.set(path.toLowerCase(), {
				path,
				section: String((item && item.section) || (path.includes("/") ? path.split("/")[0] : "General"))
			});
		}
		snapshot.importedIcons = [...byPath.values()];
		rebuildIconRootMap();
	} catch (e) {
		/* ignore malformed push */
	}
};

