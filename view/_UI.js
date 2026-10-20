// COG overlay - UI (editor chrome, theme, pickers, help)
// Classic script; shares globals with _Core.js.
// Load first among section scripts so feature modules can call UI helpers at runtime.

const ICON_ROOT = "assets/icons/";
const ICON_IMPORT_ROOT = "assets/imports/icons/";
const FONT_IMPORT_ROOT = "assets/imports/fonts/";
/** Shipped fallback when a gear/feed icon path is empty or missing from the catalog. */
const FALLBACK_ICON_REL = "COG/cog.svg";
/** Hrefs that failed to load; resolveDisplayIconHref / paintMaskedFace use fallback. */
const missingIconHrefSet = new Set();

/** @type {Map<string, string>} path -> "icons" | "imports/icons" */
let iconRootByPath = new Map();
/** @type {Set<string>} lowercase paths known to live under assets/imports/icons/ */
let importedIconPathSet = new Set();

let editorKey = "";
let rebindListening = false;
let rebindArmedAt = 0;
const REBIND_ARM_MS = 450;

let helpMode = false;
let helpSubTab = "about";
const helpCache = { about: null, definitions: null, help: null };
let helpLoadPromise = null;

let colorPickerState = null;
let iconPickerState = null;

/** Portaled editor overlays (color / icon / select / info / clockToken). */
const editorPopupRegistry = new Map();
let editorPopupSeq = 0;

/**
 * Shared number-format vocabulary for Groups/Gears and Feed (same menu modes).
 * Normalizers keep their own defaults (groups: barPercent; feed: barTotal).
 */
const NUMBER_FORMATS = ["bar", "barPercent", "barTotal", "percent", "total"];

function numberFormatShowsBar(mode) {
	return mode === "bar" || mode === "barPercent" || mode === "barTotal";
}

function numberFormatShowsValue(mode) {
	return mode !== "bar";
}

function numberFormatShowsTotal(mode) {
	return mode === "barTotal" || mode === "total";
}

function registerEditorPopup(kind, api) {
	const id = `${kind}:${++editorPopupSeq}`;
	editorPopupRegistry.set(id, {
		kind,
		close: api.close,
		reposition: typeof api.reposition === "function" ? api.reposition : null,
		retain: api.retain || null
	});
	return id;
}

function unregisterEditorPopup(id) {
	if (id) {
		editorPopupRegistry.delete(id);
	}
}

/**
 * Exclusive open: tear down every registered popup (and the in-panel group picker)
 * before a new overlay opens. Pass exceptId to keep one entry (rare; prefer close+reopen).
 * @param {string} [_kind] caller label (color|icon|select|info|clockToken)
 * @param {string|null} [exceptId]
 */
function beginEditorPopup(_kind, exceptId) {
	// Keep the in-panel group gear picker open when a filter <select> inside it opens;
	// tearing it down clears pickerGroupId and would send adds to the Default Group.
	const selectInsideOpenPicker =
		_kind === "select" &&
		typeof pickerRoot !== "undefined" &&
		pickerRoot &&
		pickerRoot.querySelector &&
		pickerRoot.querySelector(".group-picker:not([hidden])");
	if (!selectInsideOpenPicker && typeof closePicker === "function") {
		closePicker();
	}
	for (const [id, entry] of [...editorPopupRegistry.entries()]) {
		if (exceptId && id === exceptId) {
			continue;
		}
		try {
			entry.close();
		} catch (e) {
			console.error("beginEditorPopup", e);
			unregisterEditorPopup(id);
		}
	}
}

/** Run fn; on throw, log via cogReportError and return fallback (never rethrows). */
function safeCall(where, fn, fallback) {
	try {
		return fn();
	} catch (e) {
		if (typeof window.cogReportError === "function") {
			window.cogReportError(where, e);
		} else {
			console.error(where, e);
		}
		return fallback;
	}
}
window.safeCall = safeCall;

function sourceIconRel(src, gear) {
	const raw = appearanceOf(gear, src).icon;
	const pct =
		typeof barPercent === "function"
			? barPercent(src)
			: Math.max(0, Math.min(100, Number(src && src.value) || 0));
	return resolveActiveIconRel(raw, pct);
}

function sourceIconPath(src, gear) {
	return resolveDisplayIconHref(sourceIconRel(src, gear));
}

function normalizeIconRelPath(raw) {
	return String(raw || "").trim().replace(/\\/g, "/");
}

function iconRelBasename(rel) {
	const n = normalizeIconRelPath(rel);
	const slash = n.lastIndexOf("/");
	return slash >= 0 ? n.slice(slash + 1) : n;
}

function isIconPackPath(raw) {
	return /\.json$/i.test(iconRelBasename(raw));
}

/** Parsed pack cache: lowercased rel path → { frames: [{ path, pct }], href } */
const iconPackCache = new Map();
const iconPackFetchInflight = new Map();

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

function clampIconPercent(pct) {
	const n = Number(pct);
	if (!Number.isFinite(n)) {
		return 0;
	}
	return Math.max(0, Math.min(100, n));
}

/**
 * Expand pack JSON into sorted stops { path, pct }.
 * Same shape as colour ramps: each stop is active from its pct until the next.
 * Bare packs (no pct on any row) get equal-width starts (0, 100/n, …).
 */
function expandIconPackFrames(rawIcons) {
	const list = Array.isArray(rawIcons) ? rawIcons : [];
	const staged = [];
	for (const item of list) {
		if (typeof item === "string") {
			const path = stripIconRootPrefixes(item);
			if (path) {
				staged.push({ path, pct: null });
			}
			continue;
		}
		if (!item || typeof item !== "object") {
			continue;
		}
		const path = stripIconRootPrefixes(item.path || item.icon || "");
		if (!path) {
			continue;
		}
		const pctRaw = item.pct != null ? item.pct : item.percent;
		const hasPct = pctRaw != null && pctRaw !== "" && Number.isFinite(Number(pctRaw));
		staged.push({
			path,
			pct: hasPct ? clampIconPercent(pctRaw) : null
		});
	}
	if (!staged.length) {
		return [];
	}
	const anyPct = staged.some((f) => f.pct != null);
	const n = staged.length;
	if (!anyPct) {
		for (let i = 0; i < n; i += 1) {
			staged[i].pct = (i * 100) / n;
		}
	} else {
		for (const f of staged) {
			if (f.pct == null) {
				f.pct = 0;
			}
		}
		staged.sort((a, b) => a.pct - b.pct);
	}
	const uniq = [];
	for (const f of staged) {
		if (uniq.length && Math.abs(uniq[uniq.length - 1].pct - f.pct) < 1e-9) {
			uniq[uniq.length - 1] = f;
		} else {
			uniq.push(f);
		}
	}
	return uniq;
}

/** Active frame = last stop whose pct ≤ gear percent (holds through 100). */
function pickIconPackFrame(frames, percent) {
	const pct = clampIconPercent(percent);
	if (!frames || !frames.length) {
		return "";
	}
	let best = frames[0];
	for (let i = 0; i < frames.length; i += 1) {
		if (frames[i].pct <= pct + 1e-9) {
			best = frames[i];
		} else {
			break;
		}
	}
	return best.path || "";
}

function getCachedIconPack(rel) {
	const key = stripIconRootPrefixes(rel).toLowerCase();
	return iconPackCache.get(key) || null;
}

/** Seed pack cache from C++ catalog `frames` (Prisma CEF often cannot fetch local JSON). */
function seedIconPackFromCatalogEntry(item) {
	const path = String((item && item.path) || "")
		.trim()
		.replace(/\\/g, "/");
	if (!isIconPackPath(path)) {
		return null;
	}
	const cleaned = stripIconRootPrefixes(path);
	const key = cleaned.toLowerCase();
	const rawFrames = item && Array.isArray(item.frames) ? item.frames : null;
	if (!rawFrames || !rawFrames.length) {
		return null;
	}
	const frames = expandIconPackFrames(rawFrames);
	if (!frames.length) {
		return null;
	}
	const entry = { frames, href: resolveIconHref(cleaned), path: cleaned, fromCatalog: true };
	iconPackCache.set(key, entry);
	return entry;
}

function ensureIconPackLoaded(rel) {
	const cleaned = stripIconRootPrefixes(rel);
	if (!cleaned || !isIconPackPath(cleaned)) {
		return null;
	}
	const key = cleaned.toLowerCase();
	const hit = iconPackCache.get(key);
	if (hit && hit.frames && hit.frames.length) {
		return hit;
	}
	// Prefer frames embedded in the live catalog / importedIcons snapshot.
	const catalog = Array.isArray(snapshot.icons) ? snapshot.icons : [];
	for (const item of catalog) {
		const p = stripIconRootPrefixes(String((item && item.path) || "")).toLowerCase();
		if (p === key) {
			const seeded = seedIconPackFromCatalogEntry(item);
			if (seeded) {
				return seeded;
			}
			break;
		}
	}
	const imported = Array.isArray(snapshot.importedIcons) ? snapshot.importedIcons : [];
	for (const item of imported) {
		const p = stripIconRootPrefixes(String((item && item.path) || "")).toLowerCase();
		if (p === key) {
			const seeded = seedIconPackFromCatalogEntry(item);
			if (seeded) {
				return seeded;
			}
			break;
		}
	}
	if (iconPackFetchInflight.has(key)) {
		return null;
	}
	const href = resolveIconHref(cleaned);
	if (!href) {
		return null;
	}
	// Fallback only — Prisma CEF often cannot fetch view-relative JSON.
	const fetchPromise = fetch(href, { cache: "no-cache" })
		.then((res) => (res.ok ? res.json() : Promise.reject(new Error("pack fetch failed"))))
		.then((data) => {
			const frames = expandIconPackFrames(data && data.icons);
			const entry = { frames, href, path: cleaned };
			iconPackCache.set(key, entry);
			iconPackFetchInflight.delete(key);
			if (typeof renderGears === "function") {
				try {
					renderGears();
				} catch (_) {
					/* ignore */
				}
			}
			return entry;
		})
		.catch(() => {
			if (!iconPackCache.has(key) || !(iconPackCache.get(key).frames || []).length) {
				iconPackCache.set(key, { frames: [], href, path: cleaned, failed: true });
			}
			iconPackFetchInflight.delete(key);
			return null;
		});
	iconPackFetchInflight.set(key, fetchPromise);
	return null;
}

/** Active frame rel path for a pack (or passthrough for normal icons). */
function resolveActiveIconRel(raw, percent) {
	const cleaned = stripIconRootPrefixes(raw);
	if (!cleaned) {
		return "";
	}
	if (!isIconPackPath(cleaned)) {
		return cleaned;
	}
	const pack = getCachedIconPack(cleaned) || ensureIconPackLoaded(cleaned);
	if (!pack || !pack.frames || !pack.frames.length) {
		return FALLBACK_ICON_REL;
	}
	return pickIconPackFrame(pack.frames, percent) || FALLBACK_ICON_REL;
}

function prefetchIconPacksFromCatalog() {
	const list = Array.isArray(snapshot.icons) ? snapshot.icons : [];
	for (const item of list) {
		if (item && Array.isArray(item.frames) && item.frames.length) {
			seedIconPackFromCatalogEntry(item);
		} else {
			const path = String((item && item.path) || item || "")
				.trim()
				.replace(/\\/g, "/");
			if (isIconPackPath(path)) {
				ensureIconPackLoaded(path);
			}
		}
	}
	const imported = Array.isArray(snapshot.importedIcons) ? snapshot.importedIcons : [];
	for (const item of imported) {
		if (item && Array.isArray(item.frames) && item.frames.length) {
			seedIconPackFromCatalogEntry(item);
		} else {
			const path = String((item && item.path) || item || "")
				.trim()
				.replace(/\\/g, "/");
			if (isIconPackPath(path)) {
				ensureIconPackLoaded(path);
			}
		}
	}
}

/** Stop 0–100% pack preview timers on a button (or all under root). */
function stopIconPackPreview(root) {
	const nodes = [];
	if (!root) {
		return;
	}
	if (root.classList && root.classList.contains("icon-swatch")) {
		nodes.push(root);
	} else if (root.querySelectorAll) {
		nodes.push(...root.querySelectorAll(".icon-swatch.is-icon-pack"));
	}
	for (const btn of nodes) {
		if (btn._cogPackTimer) {
			clearInterval(btn._cogPackTimer);
			btn._cogPackTimer = null;
		}
	}
}

function paintIconPackPreview(btn, packRel, resolveHref = resolveIconHref) {
	if (!btn) {
		return;
	}
	stopIconPackPreview(btn);
	btn.classList.add("is-icon-pack");
	btn.classList.remove("is-empty", "has-name");
	const name = iconDisplayName(packRel);
	setIconButtonTip(btn, name || "Icon pack");
	let img = btn.querySelector("img");
	if (!img) {
		btn.innerHTML = "";
		img = document.createElement("img");
		img.alt = "";
		btn.appendChild(img);
	}
	const applyPct = (pct) => {
		const frameRel = resolveActiveIconRel(packRel, pct);
		const href = resolveDisplayIconHref(frameRel);
		const animated =
			typeof iconHrefIsAnimated === "function"
				? iconHrefIsAnimated(href)
				: /\.(gif|webp)(\?|#|$)/i.test(href);
		btn.classList.toggle("is-raster-preview", !!animated);
		if (img.getAttribute("src") !== href) {
			img.src = href;
		}
	};
	ensureIconPackLoaded(packRel);
	applyPct(0);
	let t = 0;
	let holdAtTop = 0;
	const topHoldTicks = 10; // ~500ms at 100% so the peak frame reads clearly before loop
	btn._cogPackTimer = setInterval(() => {
		if (t >= 100) {
			holdAtTop += 1;
			applyPct(100);
			if (holdAtTop < topHoldTicks) {
				return;
			}
			holdAtTop = 0;
			t = 0;
			ensureIconPackLoaded(packRel);
			applyPct(0);
			return;
		}
		t = Math.min(100, t + 2);
		applyPct(t);
	}, 50);
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
	prefetchIconPacksFromCatalog();
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

function gaugeUsesEndArt(gaugeOrGizmo) {
	return normalizeEndCapMode(gaugeOrGizmo && gaugeOrGizmo.endCapMode, gaugeOrGizmo && gaugeOrGizmo.endCap) === "endcap";
}

function resolveGaugeEndArtHref(gaugeOrGizmo) {
	if (!gaugeUsesEndArt(gaugeOrGizmo)) {
		return "";
	}
	return resolveIconHref(migrateEndCapPath(gaugeOrGizmo.endCap));
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

function normalizeHexColor(value, fallback) {
	const raw = String(value == null ? "" : value).trim().replace(/\s+/g, "");
	if (!raw) {
		return fallback;
	}
	const bare = raw.replace(/^#+/, "");
	if (/^[0-9a-fA-F]{6}$/i.test(bare)) {
		return `#${bare.toLowerCase()}`;
	}
	if (/^[0-9a-fA-F]{3}$/i.test(bare)) {
		return `#${bare[0]}${bare[0]}${bare[1]}${bare[1]}${bare[2]}${bare[2]}`.toLowerCase();
	}
	return fallback;
}

/** Digits only for hex fields that show a permanent # affix. */
function bareHexDigits(value) {
	return String(value == null ? "" : value)
		.trim()
		.replace(/\s+/g, "")
		.replace(/^#+/, "")
		.toLowerCase();
}

function sanitizeHexDigits(raw, maxLen) {
	const limit = Number.isFinite(maxLen) ? maxLen : 6;
	return String(raw == null ? "" : raw).replace(/[^0-9a-fA-F]/g, "").slice(0, limit);
}

/** Full #rrggbb only — 3-digit shorthand expands on Enter / blur, not while typing. */
function isFullHexColor(value) {
	const bare = bareHexDigits(value);
	return /^[0-9a-fA-F]{6}$/i.test(bare);
}

function isShorthandHexColor(value) {
	const bare = bareHexDigits(value);
	return /^[0-9a-fA-F]{3}$/i.test(bare);
}

/**
 * Wrap an input with a faded permanent prefix/suffix (e.g. # / % / s).
 * Moves `input` into the wrapper in-place. Idempotent.
 */
function wrapInputAffix(input, opts) {
	if (!input) {
		return null;
	}
	const existing = input.closest(".field-affix");
	if (existing) {
		return existing;
	}
	const prefix = opts && opts.prefix ? String(opts.prefix) : "";
	const suffix = opts && opts.suffix ? String(opts.suffix) : "";
	if (!prefix && !suffix) {
		return null;
	}
	const wrap = document.createElement("span");
	wrap.className = "field-affix";
	if (prefix) {
		wrap.classList.add("has-prefix");
	}
	if (suffix) {
		wrap.classList.add("has-suffix");
	}
	if (input.parentNode) {
		input.parentNode.insertBefore(wrap, input);
	}
	if (prefix) {
		const mark = document.createElement("span");
		mark.className = "field-affix-mark field-affix-prefix";
		mark.textContent = prefix;
		mark.setAttribute("aria-hidden", "true");
		wrap.appendChild(mark);
	}
	wrap.appendChild(input);
	if (suffix) {
		const mark = document.createElement("span");
		mark.className = "field-affix-mark field-affix-suffix";
		mark.textContent = suffix;
		mark.setAttribute("aria-hidden", "true");
		wrap.appendChild(mark);
	}
	return wrap;
}

/** Keep only 0-9a-f in a hex digit field; preserve caret when possible. */
function bindHexDigitFilter(input) {
	if (!input || input.dataset.hexFilter === "1") {
		return;
	}
	input.dataset.hexFilter = "1";
	input.maxLength = 6;
	input.spellcheck = false;
	input.autocomplete = "off";
	input.addEventListener("beforeinput", (ev) => {
		if (ev.inputType && ev.inputType.indexOf("insert") === 0 && ev.data != null && /[^0-9a-fA-F]/.test(ev.data)) {
			ev.preventDefault();
		}
	});
	input.addEventListener("input", () => {
		const start = input.selectionStart;
		const before = input.value;
		const cleaned = sanitizeHexDigits(before, 6);
		if (cleaned === before) {
			return;
		}
		input.value = cleaned;
		if (typeof start === "number") {
			const delta = before.length - cleaned.length;
			const next = Math.max(0, start - delta);
			try {
				input.setSelectionRange(next, next);
			} catch {
				/* ignore */
			}
		}
	});
}

function defaultFillColor() {
	return "#c4a35a";
}

function defaultBorderColor() {
	return "#e8d2a0";
}

function defaultIconStartColor() {
	return "#ffffff";
}

function defaultIconEndColor() {
	return "#ffffff";
}

function editorKeyName() {
	return snapshot.general && snapshot.general.editorKey ? snapshot.general.editorKey : "F3";
}

function applyTheme() {
	const fill = themeFill();
	const border = themeBorder();
	const fontStack = gadgetFontStack();
	syncFontFaces();
	for (const el of [document.documentElement, document.body, document.getElementById("hud"), document.getElementById("hud-front")]) {
		if (!el) {
			continue;
		}
		el.style.setProperty("--cog-fill", fill);
		el.style.setProperty("--cog-border", border);
		el.style.setProperty("--cog-font-gadget", fontStack);
		el.style.setProperty("--cog-font-ui", fontStack);
	}
	updateKeybindHint();
}

const DEFAULT_GADGET_FONT = "Roboto";

/** CSS font-family stack: chosen gadget face → shipped Roboto → system sans-serif. */
function gadgetFontStack(family = resolvedGadgetFont()) {
	const name = String(family || DEFAULT_GADGET_FONT).trim() || DEFAULT_GADGET_FONT;
	if (name === DEFAULT_GADGET_FONT) {
		return `"${DEFAULT_GADGET_FONT}", sans-serif`;
	}
	return `"${name}", "${DEFAULT_GADGET_FONT}", sans-serif`;
}

function fontStem(fileName) {
	const name = String(fileName || "").trim().replace(/^.*[\\/]/, "");
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}

function fontFormatHint(fileName) {
	const lower = String(fileName || "").toLowerCase();
	if (lower.endsWith(".otf")) {
		return "opentype";
	}
	if (lower.endsWith(".woff2")) {
		return "woff2";
	}
	if (lower.endsWith(".woff")) {
		return "woff";
	}
	return "truetype";
}

function fontEntryFile(entry) {
	if (typeof entry === "string") {
		return String(entry || "").trim().replace(/^.*[\\/]/, "");
	}
	return String((entry && entry.file) || "").trim().replace(/^.*[\\/]/, "");
}

function fontEntryRoot(entry) {
	if (typeof entry === "string") {
		return "fonts";
	}
	return String((entry && entry.root) || "fonts");
}

function fontEntryUrl(entry) {
	const file = fontEntryFile(entry);
	if (!file) {
		return "";
	}
	return fontEntryRoot(entry) === "imports/fonts" ? FONT_IMPORT_ROOT + file : `assets/fonts/${file}`;
}

function availableFontFiles() {
	const list = Array.isArray(snapshot.fonts) ? snapshot.fonts : [];
	return list.map(fontEntryFile).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f));
}

function availableFontFamilies() {
	const stems = availableFontFiles().map(fontStem).filter(Boolean);
	const seen = new Set();
	const out = [];
	for (const stem of stems) {
		if (seen.has(stem)) {
			continue;
		}
		seen.add(stem);
		out.push(stem);
	}
	if (!seen.has(DEFAULT_GADGET_FONT)) {
		out.unshift(DEFAULT_GADGET_FONT);
	}
	return out;
}

function normalizeGadgetFont(value) {
	const raw = String(value || "").trim();
	const families = availableFontFamilies();
	if (raw && families.includes(raw)) {
		return raw;
	}
	if (raw === DEFAULT_GADGET_FONT || families.includes(DEFAULT_GADGET_FONT)) {
		return DEFAULT_GADGET_FONT;
	}
	return families[0] || DEFAULT_GADGET_FONT;
}

function resolvedGadgetFont() {
	return normalizeGadgetFont(snapshot.general && snapshot.general.gadgetFont);
}

function syncFontFaces() {
	let style = document.getElementById("cog-font-faces");
	if (!style) {
		style = document.createElement("style");
		style.id = "cog-font-faces";
		document.head.appendChild(style);
	}
	const rules = [];
	for (const file of availableFontFiles()) {
		const family = fontStem(file);
		if (!family) {
			continue;
		}
		const format = fontFormatHint(file);
		const srcEntry = (Array.isArray(snapshot.fonts) ? snapshot.fonts : []).find(
			(entry) => fontEntryFile(entry) === file
		);
		const url = fontEntryUrl(srcEntry || file);
		rules.push(
			`@font-face{font-family:"${family}";src:url("${url}") format("${format}");font-weight:normal;font-style:normal;}`
		);
	}
	style.textContent = rules.join("\n");
}

function themeFill() {
	return normalizeHexColor(snapshot.general && snapshot.general.fillColor, defaultFillColor());
}

function defaultIconColor() {
	return "#ffffff";
}

/** Single General backup icon tint.
 * Migration Code for Transition from v1.01 or earlier to v1.1: iconStartColor/iconEndColor → iconColor. */
function themeIconColor() {
	const g = snapshot.general || {};
	const direct = normalizeHexColor(g.iconColor, "");
	if (direct) {
		return direct;
	}
	const start = normalizeHexColor(g.iconStartColor, "");
	if (start) {
		return start;
	}
	return normalizeHexColor(g.iconEndColor, defaultIconColor()) || defaultIconColor();
}

function themeIconStart() {
	return themeIconColor();
}

function themeIconEnd() {
	return themeIconColor();
}

function optionalHex(value) {
	return normalizeHexColor(value, "") || "";
}

/** Migration Code for Transition from v1.01 or earlier to v1.1:
 * Older startColor/endColor pairs become iconColor (single hex or 0%/100% ramp). */
function migrateLegacyIconPair(startColor, endColor) {
	const start = optionalHex(startColor);
	const end = optionalHex(endColor);
	if (!start && !end) {
		return "";
	}
	if (!start) {
		return end;
	}
	if (!end || end === start) {
		return start;
	}
	return formatColorRamp([
		{ pct: 0, color: start },
		{ pct: 100, color: end }
	]);
}

/** Parse hex or JSON stop array → sorted [{pct,color}, …]. */
function parseColorRamp(raw) {
	if (raw == null) {
		return [];
	}
	if (Array.isArray(raw)) {
		const stops = [];
		for (const item of raw) {
			if (!item || typeof item !== "object") {
				continue;
			}
			const color = optionalHex(item.color);
			if (!color) {
				continue;
			}
			let pct = Number(item.pct != null ? item.pct : item.percent);
			if (!Number.isFinite(pct)) {
				pct = 0;
			}
			pct = Math.max(0, Math.min(100, pct));
			stops.push({ pct, color });
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
			return parseColorRamp(JSON.parse(text));
		} catch {
			return [];
		}
	}
	const hex = optionalHex(text);
	return hex ? [{ pct: 0, color: hex }] : [];
}

function formatColorRamp(stops) {
	const list = parseColorRamp(Array.isArray(stops) ? stops : []);
	if (!list.length) {
		return "";
	}
	if (list.length === 1) {
		return list[0].color;
	}
	return JSON.stringify(list.map((s) => ({ pct: s.pct, color: s.color })));
}

/** Normalize wire value (hex, array, or legacy start/end) → hex or JSON string.
 * Migration Code for Transition from v1.01 or earlier to v1.1: legacyStart/legacyEnd fill empty iconColor. */
function normalizeColorRampValue(raw, legacyStart, legacyEnd) {
	if (raw != null && raw !== "") {
		const stops = parseColorRamp(raw);
		if (stops.length) {
			return formatColorRamp(stops);
		}
	}
	return migrateLegacyIconPair(legacyStart, legacyEnd);
}

function mixHexColors(a, b, t) {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	if (!ca && !cb) {
		return "";
	}
	if (!ca) {
		return optionalHex(b);
	}
	if (!cb) {
		return optionalHex(a);
	}
	const u = Math.max(0, Math.min(1, Number(t) || 0));
	const ch = (x, y) => Math.round(x + (y - x) * u);
	return `#${[ch(ca.r, cb.r), ch(ca.g, cb.g), ch(ca.b, cb.b)]
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("")}`;
}

function sampleColorRamp(stopsOrRaw, percent) {
	const stops = Array.isArray(stopsOrRaw) ? parseColorRamp(stopsOrRaw) : parseColorRamp(stopsOrRaw);
	if (!stops.length) {
		return "";
	}
	if (stops.length === 1) {
		return stops[0].color;
	}
	const pct = Math.max(0, Math.min(100, Number(percent) || 0));
	if (pct <= stops[0].pct) {
		return stops[0].color;
	}
	const last = stops[stops.length - 1];
	if (pct >= last.pct) {
		return last.color;
	}
	for (let i = 0; i < stops.length - 1; i += 1) {
		const a = stops[i];
		const b = stops[i + 1];
		if (pct + 1e-9 >= a.pct && pct - 1e-9 <= b.pct) {
			const span = b.pct - a.pct;
			const t = span <= 1e-9 ? 0 : (pct - a.pct) / span;
			return mixHexColors(a.color, b.color, t) || a.color;
		}
	}
	return last.color;
}

function clampByte(n) {
	const v = Math.round(Number(n));
	if (!Number.isFinite(v)) {
		return 0;
	}
	return Math.max(0, Math.min(255, v));
}

function hexToRgb(hex) {
	const h = normalizeHexColor(hex, "");
	if (!h) {
		return null;
	}
	return {
		r: parseInt(h.slice(1, 3), 16),
		g: parseInt(h.slice(3, 5), 16),
		b: parseInt(h.slice(5, 7), 16)
	};
}

function rgbToHex(r, g, b) {
	return `#${[clampByte(r), clampByte(g), clampByte(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsv(r, g, b) {
	r = clampByte(r) / 255;
	g = clampByte(g) / 255;
	b = clampByte(b) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d > 0) {
		if (max === r) {
			h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
		} else if (max === g) {
			h = ((b - r) / d + 2) * 60;
		} else {
			h = ((r - g) / d + 4) * 60;
		}
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h, s, v) {
	h = ((Number(h) % 360) + 360) % 360;
	s = Math.max(0, Math.min(1, Number(s) || 0));
	v = Math.max(0, Math.min(1, Number(v) || 0));
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

function closeColorPicker() {
	const id = colorPickerState && colorPickerState.popupId;
	const finalize = colorPickerState && colorPickerState.finalize;
	if (colorPickerState && colorPickerState.el && colorPickerState.el.parentNode) {
		colorPickerState.el.parentNode.removeChild(colorPickerState.el);
	}
	colorPickerState = null;
	unregisterEditorPopup(id);
	// Flush any live-only drag so the last colour is persisted once on close.
	if (typeof finalize === "function") {
		finalize();
	}
}

/**
 * Prisma/CEF clipboard (execCommand / navigator.clipboard) can hitch mouse capture
 * and sometimes "succeed" without updating the OS clipboard. Prefer Win32 via
 * cogToSKSE("clipboard:…"); only fall back to DOM/async when the bridge is missing.
 */
function copyTextToClipboardSync(text) {
	const value = String(text || "");
	if (!value) {
		return false;
	}
	try {
		const ta = document.createElement("textarea");
		ta.value = value;
		ta.setAttribute("readonly", "");
		ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
		document.body.appendChild(ta);
		ta.focus({ preventScroll: true });
		ta.select();
		ta.setSelectionRange(0, value.length);
		const ok = document.execCommand("copy");
		document.body.removeChild(ta);
		return !!ok;
	} catch (_) {
		return false;
	}
}

function copyInputTextOnShortcut(input, ev) {
	if (!input || !ev || !(ev.ctrlKey || ev.metaKey)) {
		return false;
	}
	const key = String(ev.key || "").toLowerCase();
	if (key !== "c" && key !== "x") {
		return false;
	}
	const start = Number(input.selectionStart);
	const end = Number(input.selectionEnd);
	const hasRange = Number.isFinite(start) && Number.isFinite(end) && end > start;
	const selected = hasRange ? String(input.value).slice(start, end) : String(input.value || "");
	if (!selected) {
		return false;
	}
	ev.preventDefault();
	ev.stopPropagation();

	const refocus = (forCut) => {
		try {
			input.focus({ preventScroll: true });
			if (hasRange && !forCut) {
				input.setSelectionRange(start, end);
			} else if (forCut && hasRange) {
				input.setSelectionRange(start, start);
			}
		} catch (_) {
			try {
				input.focus();
			} catch (__) {
				/* ignore */
			}
		}
	};

	const doCut = () => {
		if (key !== "x" || !hasRange || input.readOnly) {
			return false;
		}
		const next = String(input.value).slice(0, start) + String(input.value).slice(end);
		input.value = next;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		return true;
	};

	let nativeSent = false;
	try {
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE("clipboard:" + selected);
			nativeSent = true;
		}
	} catch (_) {
		nativeSent = false;
	}

	// Win32 path is enough — skip CEF copy (avoids Prisma mouse-capture hitch).
	if (nativeSent) {
		const cut = doCut();
		refocus(cut);
		return true;
	}

	const syncOk = copyTextToClipboardSync(selected);
	if (syncOk) {
		const cut = doCut();
		refocus(cut);
		return true;
	}

	if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
		navigator.clipboard
			.writeText(selected)
			.then(() => {
				const cut = doCut();
				refocus(cut);
			})
			.catch(() => {
				refocus(false);
			});
		return true;
	}

	refocus(false);
	return true;
}

function openColorPicker(anchor, opts) {
	beginEditorPopup("color");
	const allowEmpty = !!opts.allowEmpty;
	const fallback = opts.fallback || "#ffffff";
	let current = normalizeHexColor(opts.value, allowEmpty ? "" : fallback) || (allowEmpty ? "" : fallback);
	if (!current && !allowEmpty) {
		current = fallback;
	}
	let lastCommitted = current;
	let liveDirty = false;
	const rgb0 = hexToRgb(current) || hexToRgb(fallback) || { r: 255, g: 255, b: 255 };
	let hsv = rgbToHsv(rgb0.r, rgb0.g, rgb0.b);

	const pop = document.createElement("div");
	pop.className = "cog-color-picker";
	pop.innerHTML = `
		<div class="ccp-sv" tabindex="-1">
			<div class="ccp-sv-white"></div>
			<div class="ccp-sv-black"></div>
			<div class="ccp-sv-cursor"></div>
		</div>
		<div class="ccp-hue" tabindex="-1">
			<div class="ccp-hue-thumb"></div>
		</div>
		<div class="ccp-preview-row">
			<span class="ccp-preview"></span>
			<label class="ccp-hex-wrap"><span class="ccp-hex-label">Hex</span> <input type="text" class="ccp-hex" spellcheck="false" maxlength="6" autocomplete="off"></label>
		</div>
		<div class="ccp-rgb-row">
			<label>R <input type="number" class="ccp-r" min="0" max="255" step="1"></label>
			<label>G <input type="number" class="ccp-g" min="0" max="255" step="1"></label>
			<label>B <input type="number" class="ccp-b" min="0" max="255" step="1"></label>
		</div>
		${allowEmpty ? `<div class="ccp-actions"><button type="button" class="action ccp-clear">Clear</button></div>` : ""}`;

	const sv = pop.querySelector(".ccp-sv");
	const hueEl = pop.querySelector(".ccp-hue");
	const cursor = pop.querySelector(".ccp-sv-cursor");
	const hueThumb = pop.querySelector(".ccp-hue-thumb");
	const preview = pop.querySelector(".ccp-preview");
	const hexLabel = pop.querySelector(".ccp-hex-label");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(hexLabel, "cog-hex", "Hex");
	}
	const hexInput = pop.querySelector(".ccp-hex");
	wrapInputAffix(hexInput, { prefix: "#" });
	bindHexDigitFilter(hexInput);
	const rInput = pop.querySelector(".ccp-r");
	const gInput = pop.querySelector(".ccp-g");
	const bInput = pop.querySelector(".ccp-b");

	const emitLive = (hex) => {
		if (hex === current) {
			return;
		}
		current = hex;
		liveDirty = true;
		if (typeof opts.onLive === "function") {
			opts.onLive(hex);
		} else if (typeof opts.onChange === "function") {
			opts.onChange(hex, true);
		}
	};

	const emitCommit = (hex) => {
		current = hex;
		const need = hex !== lastCommitted || liveDirty;
		lastCommitted = hex;
		liveDirty = false;
		if (!need) {
			return;
		}
		if (typeof opts.onChange === "function") {
			opts.onChange(hex, false);
		}
	};

	const syncFromHsv = (mode, rewriteHex) => {
		const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
		const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
		sv.style.backgroundColor = `hsl(${hsv.h}, 100%, 50%)`;
		cursor.style.left = `${hsv.s * 100}%`;
		cursor.style.top = `${(1 - hsv.v) * 100}%`;
		hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
		preview.style.background = hex;
		if (rewriteHex !== false) {
			hexInput.value = bareHexDigits(hex);
		}
		rInput.value = String(rgb.r);
		gInput.value = String(rgb.g);
		bInput.value = String(rgb.b);
		if (mode === "live") {
			emitLive(hex);
		} else if (mode === "commit") {
			emitCommit(hex);
		}
	};

	const setFromHex = (hex, mode, rewriteHex) => {
		const rgb = hexToRgb(hex);
		if (!rgb) {
			return false;
		}
		hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
		syncFromHsv(mode, rewriteHex);
		return true;
	};

	const setFromRgb = (mode) => {
		hsv = rgbToHsv(rInput.value, gInput.value, bInput.value);
		syncFromHsv(mode, document.activeElement !== hexInput);
	};

	const pickSv = (clientX, clientY) => {
		const rect = sv.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		hsv.s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		hsv.v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
		syncFromHsv("live");
	};

	const pickHue = (clientX) => {
		const rect = hueEl.getBoundingClientRect();
		if (rect.width <= 0) {
			return;
		}
		hsv.h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
		syncFromHsv("live");
	};

	const bindDrag = (el, onMove) => {
		let dragging = false;
		el.addEventListener("pointerdown", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			el.setPointerCapture(ev.pointerId);
			dragging = true;
			onMove(ev.clientX, ev.clientY);
		});
		el.addEventListener("pointermove", (ev) => {
			if (!el.hasPointerCapture(ev.pointerId)) {
				return;
			}
			onMove(ev.clientX, ev.clientY);
		});
		const release = (ev) => {
			if (el.hasPointerCapture && el.hasPointerCapture(ev.pointerId)) {
				el.releasePointerCapture(ev.pointerId);
			}
			if (dragging) {
				dragging = false;
				emitCommit(current);
			}
		};
		el.addEventListener("pointerup", release);
		el.addEventListener("pointercancel", release);
	};
	bindDrag(sv, pickSv);
	bindDrag(hueEl, (x) => pickHue(x));

	const commitPickerHex = (raw, expandShorthand) => {
		const t = sanitizeHexDigits(raw, 6);
		if (allowEmpty && !t) {
			emitCommit("");
			preview.style.background = "transparent";
			return;
		}
		const ok = isFullHexColor(t) || (expandShorthand && isShorthandHexColor(t));
		if (!ok || !setFromHex(normalizeHexColor(t, current || fallback), "commit", true)) {
			hexInput.value = bareHexDigits(current);
		}
	};
	hexInput.addEventListener("input", () => {
		const t = sanitizeHexDigits(hexInput.value, 6);
		if (isFullHexColor(t)) {
			// Apply colour without rewriting the hex field (preserves backspace / caret).
			setFromHex(normalizeHexColor(t, current || fallback), "live", false);
		}
	});
	hexInput.addEventListener("blur", () => commitPickerHex(hexInput.value, true));
	hexInput.addEventListener("keydown", (ev) => {
		if (copyInputTextOnShortcut(hexInput, ev)) {
			return;
		}
		if (ev.key === "Enter") {
			ev.preventDefault();
			commitPickerHex(hexInput.value, true);
			hexInput.blur();
		}
	});
	const onRgbKeydown = (ev) => {
		const t = ev.target;
		if (t === rInput || t === gInput || t === bInput) {
			copyInputTextOnShortcut(t, ev);
		}
	};
	rInput.addEventListener("keydown", onRgbKeydown);
	gInput.addEventListener("keydown", onRgbKeydown);
	bInput.addEventListener("keydown", onRgbKeydown);
	const onRgbLive = () => setFromRgb("live");
	const onRgbCommit = () => setFromRgb("commit");
	rInput.addEventListener("input", onRgbLive);
	gInput.addEventListener("input", onRgbLive);
	bInput.addEventListener("input", onRgbLive);
	rInput.addEventListener("change", onRgbCommit);
	gInput.addEventListener("change", onRgbCommit);
	bInput.addEventListener("change", onRgbCommit);

	const clearBtn = pop.querySelector(".ccp-clear");
	if (clearBtn) {
		if (typeof setTranslatedText === "function") {
			setTranslatedText(clearBtn, "cog-clear", "Clear");
		}
		clearBtn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			emitCommit("");
			preview.style.background = "transparent";
			hexInput.value = "";
			closeColorPicker();
		});
	}

	pop.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	document.body.appendChild(pop);

	const place = () => {
		const rect = anchor.getBoundingClientRect();
		const pad = 8;
		const pw = pop.offsetWidth || 220;
		const ph = pop.offsetHeight || 260;
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

	if (current) {
		setFromHex(current, false);
	} else {
		syncFromHsv(false);
		preview.style.background = "transparent";
		hexInput.value = "";
	}
	place();

	const popupId = registerEditorPopup("color", {
		close: closeColorPicker,
		reposition: place,
		retain: pop
	});
	colorPickerState = {
		el: pop,
		anchor,
		onChange: opts.onChange,
		onLive: opts.onLive,
		allowEmpty,
		reposition: place,
		popupId,
		finalize: () => {
			if (liveDirty) {
				emitCommit(current);
			}
		}
	};
	hexInput.focus();
	hexInput.select();
}

function makeColorControl(opts) {
	const label = opts.label || "Colour";
	const allowEmpty = !!opts.allowEmpty;
	const fallback = opts.fallback || "#ffffff";
	let value = allowEmpty
		? optionalHex(opts.value)
		: normalizeHexColor(opts.value, fallback);

	const field = document.createElement("div");
	field.className = "color-field";
	field.innerHTML = `<span>${label}</span>
		<span class="color-controls">
			<button type="button" class="color-swatch"></button>
			<input type="text" class="color-hex" spellcheck="false" maxlength="6" autocomplete="off">
		</span>`;
	const swatch = field.querySelector(".color-swatch");
	const text = field.querySelector(".color-hex");
	if (typeof setTranslatedAriaLabel === "function") {
		setTranslatedAriaLabel(swatch, "cog-colour-picker", "Colour picker");
	} else {
		swatch.setAttribute("aria-label", "Colour picker");
	}
	text.setAttribute("aria-label", label);
	wrapInputAffix(text, { prefix: "#" });
	bindHexDigitFilter(text);
	let hexFocused = false;

	const swatchDisplayColor = (hex) => {
		const stored = optionalHex(hex);
		if (stored) {
			return stored;
		}
		if (allowEmpty) {
			return optionalHex(fallback);
		}
		return normalizeHexColor(hex, fallback);
	};

	const paintSwatch = (hex) => {
		const display = swatchDisplayColor(hex);
		if (display) {
			swatch.style.background = display;
			swatch.classList.remove("is-empty");
		} else {
			swatch.style.background = "transparent";
			swatch.classList.add("is-empty");
		}
	};

	const paint = (hex, rewriteText) => {
		value = hex;
		if (rewriteText || !hexFocused) {
			text.value = bareHexDigits(hex);
		}
		paintSwatch(hex);
		if (allowEmpty && opts.placeholder) {
			text.placeholder = bareHexDigits(opts.placeholder);
		}
	};

	const commit = (raw, expandShorthand) => {
		const trimmed = sanitizeHexDigits(raw, 6);
		if (allowEmpty && !trimmed) {
			const changed = value !== "";
			paint("", true);
			if (changed && typeof opts.onCommit === "function") {
				opts.onCommit("", false);
			}
			return true;
		}
		const ok = isFullHexColor(trimmed) || (expandShorthand && isShorthandHexColor(trimmed));
		if (!ok) {
			return false;
		}
		const next = normalizeHexColor(trimmed, allowEmpty ? "" : (value || fallback));
		if (!next) {
			return false;
		}
		const changed = next !== value;
		paint(next, true);
		if (changed && typeof opts.onCommit === "function") {
			opts.onCommit(next, false);
		}
		return true;
	};

	paint(value, true);
	if (allowEmpty) {
		text.placeholder = bareHexDigits(opts.placeholder || fallback || "");
	}

	text.addEventListener("focus", () => {
		hexFocused = true;
	});
	text.addEventListener("input", () => {
		const t = sanitizeHexDigits(text.value, 6);
		if (allowEmpty && t === "") {
			value = "";
			paintSwatch("");
			if (typeof opts.onCommit === "function") {
				opts.onCommit("", true);
			}
			return;
		}
		// Live-apply full rrggbb only — never rewrite the field (keeps caret / backspace intact).
		if (isFullHexColor(t)) {
			const next = normalizeHexColor(t, value || fallback);
			if (!next) {
				return;
			}
			value = next;
			paintSwatch(next);
			if (typeof opts.onLive === "function") {
				opts.onLive(next);
			} else if (typeof opts.onCommit === "function") {
				opts.onCommit(next, true);
			}
		}
	});
	text.addEventListener("blur", () => {
		hexFocused = false;
		if (!commit(text.value, true)) {
			paint(value, true);
		}
	});
	text.addEventListener("keydown", (ev) => {
		if (copyInputTextOnShortcut(text, ev)) {
			return;
		}
		if (ev.key === "Enter") {
			ev.preventDefault();
			commit(text.value, true);
			text.blur();
		}
	});

	swatch.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		if (colorPickerState && colorPickerState.anchor === swatch) {
			closeColorPicker();
			return;
		}
		openColorPicker(swatch, {
			value: value || (allowEmpty ? "" : fallback),
			fallback,
			allowEmpty,
			onLive: (hex) => {
				paint(hex, true);
				if (typeof opts.onLive === "function") {
					opts.onLive(hex);
				} else if (typeof opts.onCommit === "function") {
					opts.onCommit(hex, true);
				}
			},
			onChange: (hex) => {
				paint(hex, true);
				if (typeof opts.onCommit === "function") {
					opts.onCommit(hex, false);
				}
			}
		});
	});

	return field;
}

/** Colour field with Clear (resets to empty → runtime fallback) and placeholder showing the default. */
function makeOptionalColorField(label, value, fallback, onCommit) {
	return makeColorControl({
		label,
		value,
		fallback,
		allowEmpty: true,
		placeholder: fallback || "",
		onCommit
	});
}

/**
 * Multi-stop colour ramp editor (iconColor / barColor).
 * Single-line chips (colour + % + ×) with inline +. Empty stops → inherit fallback.
 */
function makeColorRampEditor(label, value, fallback, onCommit) {
	const wrap = document.createElement("div");
	wrap.className = "color-ramp-editor";
	const heading = document.createElement("div");
	heading.className = "color-ramp-heading";
	heading.textContent = label;
	wrap.appendChild(heading);
	const hint = document.createElement("p");
	hint.className = "lede color-ramp-hint";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			hint,
			"cog-color-ramp-hint",
			"Empty inherits the backup. Multiple stops fade between percentages."
		);
	} else {
		hint.textContent = "Empty inherits the backup. Multiple stops fade between percentages.";
	}
	wrap.appendChild(hint);
	const list = document.createElement("div");
	list.className = "color-ramp-stops";
	wrap.appendChild(list);
	let stops = parseColorRamp(value);

	const emit = (live) => {
		if (typeof onCommit === "function") {
			onCommit(formatColorRamp(stops), !!live);
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
					"cog-cannot-add-colour-stop",
					"Cannot add \u2014 already has a 100% stop"
				);
			} else {
				setTranslatedAriaLabel(addBtn, "cog-add-colour-stop", "Add colour stop");
			}
		} else {
			addBtn.setAttribute(
				"aria-label",
				atCap ? "Cannot add \u2014 already has a 100% stop" : "Add colour stop"
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
		const nextPct = stops.length ? Math.min(100, lastPct + (stops.length === 1 ? 100 : 25)) : 0;
		stops.push({
			pct: stops.length ? nextPct : 0,
			color: optionalHex(fallback) || "#ffffff"
		});
		if (stops.length === 2 && stops[0].pct === 0 && stops[1].pct === 0) {
			stops[1].pct = 100;
		}
		stops = parseColorRamp(stops);
		emit(false);
		rebuild();
	};

	const rebuild = () => {
		closeAddCapTip();
		list.innerHTML = "";
		stops.forEach((stop, index) => {
			const card = document.createElement("div");
			card.className = "color-ramp-card";

			const colourCtrl = makeColorControl({
				label: "Colour",
				value: stop.color,
				fallback: fallback || "#ffffff",
				allowEmpty: false,
				onCommit: (hex, live) => {
					stops[index] = {
						...stops[index],
						color: hex || optionalHex(fallback) || "#ffffff"
					};
					emit(!!live);
				}
			});
			tagFieldLabel(colourCtrl, "cog-colour", "Colour");
			card.appendChild(colourCtrl);

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
				stops = parseColorRamp(stops);
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
				setTranslatedAriaLabel(remove, "cog-remove-colour-stop", "Remove colour stop");
			} else {
				remove.setAttribute("aria-label", "Remove colour stop");
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
				"cog-color-ramp-at-cap",
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

function appendEditorRule(parent) {
	const hr = document.createElement("hr");
	hr.className = "editor-rule";
	parent.appendChild(hr);
	return hr;
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

/** Within a folder: still frames first, then .json packs; alpha within each group. */
function compareIconPaths(a, b) {
	const aPack = /\.json$/i.test(String(a || "")) ? 1 : 0;
	const bPack = /\.json$/i.test(String(b || "")) ? 1 : 0;
	if (aPack !== bPack) {
		return aPack - bPack;
	}
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
		stopIconPackPreview(iconPickerState.el);
		if (iconPickerState.el.parentNode) {
			iconPickerState.el.parentNode.removeChild(iconPickerState.el);
		}
	}
	iconPickerState = null;
	unregisterEditorPopup(id);
	hideHoverTip();
}

function paintIconSwatch(btn, rel, _showName, resolveHref = resolveIconHref) {
	stopIconPackPreview(btn);
	btn.innerHTML = "";
	btn.classList.remove("is-icon-pack", "is-raster-preview", "has-name");
	const cleaned = stripIconRootPrefixes(rel);
	if (isIconPackPath(cleaned)) {
		paintIconPackPreview(btn, cleaned, resolveHref);
		return;
	}
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
	return normalized.replace(/\.(svg|json|png|gif|webp|jpg|jpeg|bmp)$/i, "");
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
	} else if (raw === "Icon pack") {
		const text = typeof t === "function" ? t("cog-icon-pack", "Icon pack") : "Icon pack";
		btn.dataset.tip = text;
		if (typeof setTranslatedAriaLabel === "function") {
			setTranslatedAriaLabel(btn, "cog-icon-pack", "Icon pack");
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

let hoverTipEl = null;
let hoverTipAnchor = null;

function ensureHoverTip() {
	if (!hoverTipEl) {
		hoverTipEl = document.createElement("div");
		hoverTipEl.className = "cog-hover-tip";
		hoverTipEl.hidden = true;
		document.body.appendChild(hoverTipEl);
	}
	return hoverTipEl;
}

function showHoverTip(anchor, text) {
	if (!anchor || !text) {
		hideHoverTip();
		return;
	}
	const el = ensureHoverTip();
	hoverTipAnchor = anchor;
	el.textContent = text;
	el.hidden = false;
	placeHoverTip();
}

function placeHoverTip() {
	if (!hoverTipEl || hoverTipEl.hidden || !hoverTipAnchor) {
		return;
	}
	const tip = hoverTipEl;
	const r = hoverTipAnchor.getBoundingClientRect();
	tip.style.left = "0px";
	tip.style.top = "0px";
	const tw = tip.offsetWidth;
	const th = tip.offsetHeight;
	let left = r.left + (r.width - tw) / 2;
	let top = r.top - th - 6;
	if (top < 4) {
		top = r.bottom + 6;
	}
	left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));
	tip.style.left = `${Math.round(left)}px`;
	tip.style.top = `${Math.round(top)}px`;
}

function hideHoverTip() {
	hoverTipAnchor = null;
	if (hoverTipEl) {
		hoverTipEl.hidden = true;
	}
}

/** Prisma/Ultralight does not show native title= tooltips — use .cog-hover-tip via data-tip. */
function bindDataTipHover() {
	if (document.documentElement.dataset.dataTipsBound === "1") {
		return;
	}
	document.documentElement.dataset.dataTipsBound = "1";
	document.addEventListener("mouseover", (ev) => {
		const host = ev.target.closest && ev.target.closest("[data-tip]");
		if (host) {
			if (hoverTipAnchor !== host) {
				showHoverTip(host, host.dataset.tip);
			}
			return;
		}
		if (hoverTipAnchor) {
			hideHoverTip();
		}
	});
	document.addEventListener("scroll", () => {
		if (hoverTipAnchor) {
			placeHoverTip();
		}
	}, true);
	window.addEventListener("resize", () => {
		if (hoverTipAnchor) {
			placeHoverTip();
		}
	});
}

bindDataTipHover();

function closeAllEditorPopups() {
	beginEditorPopup();
	hideHoverTip();
	// Safety: clear leftover state / orphans if a path skipped unregister.
	if (colorPickerState) {
		closeColorPicker();
	}
	if (iconPickerState) {
		closeIconPicker();
	}
	closeCogSelects();
	closeInfoTips();
	closeClockTokenPopovers();
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
				const pack = isIconPackPath(path);
				cell.className =
					"icon-swatch" +
					(pack ? " is-icon-pack" : "") +
					(path === opts.value ? " is-selected" : "");
				setIconButtonTip(cell, iconDisplayName(path) || path);
				if (pack) {
					paintIconPackPreview(cell, path, resolvePathHref);
				} else {
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

function themeBorder() {
	return normalizeHexColor(snapshot.general && snapshot.general.borderColor, defaultBorderColor());
}

function isEditingField() {
	if (rebindListening || iconPickerState || colorPickerState) {
		return true;
	}
	const el = document.activeElement;
	if (!el) {
		return false;
	}
	if (el.closest(".cog-select") || el.closest(".color-field") || el.closest(".icon-field") || el.closest(".cog-color-picker") || el.closest(".cog-icon-picker") || el.closest("#editor-keybind") || el.closest("#editor-help")) {
		return true;
	}
	const tag = el.tagName;
	return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON";
}

function currentEditorKey() {
	const groups = snapshot.groups.map((g) => `${g.id}:${g.name || ""}`).join("|");
	const gears = snapshot.gears.map((g) => g.id).join("|");
	const gauges = (snapshot.gauges || []).map((g) => `${g.id}:${g.name || ""}:${g.type || ""}:${g.shape || ""}`).join("|");
	const gizmos = (snapshot.gizmos || []).map((z) =>
		`${z.id}:${z.name || ""}:${z.type || ""}:${z.visibility || ""}:${z.width || ""}:${z.height || ""}:${typeof z.settingsJson === "string" ? z.settingsJson : JSON.stringify(z.settings || {})}`
	).join("|");
	return `${activeTab}|${helpMode ? "help" : "main"}|${helpSubTab}|${snapshot.general.showDefaultGroup}|${snapshot.general.editorKey}|${snapshot.general.hideToggleKey || ""}|${snapshot.general.hideIncludesFlash !== false}|${!!window.__cogHideKeyListening}|${snapshot.general.fillColor}|${snapshot.general.borderColor}|${snapshot.general.iconColor || themeIconColor()}|${snapshot.general.neutralIconMode}|${snapshot.general.gadgetFont}|${snapshot.general.language || ""}|${!!snapshot.general.highlightMissingTranslations}|${groups}|${gears}|${gauges}|${gizmos}|${typeof suppressionsFingerprint === "function" ? suppressionsFingerprint() : ""}`;
}

/** Tag a .pos-field / label's leading <span> via data-translation helpers. */
function tagFieldLabel(field, tag, fallback, typeId) {
	if (!field) {
		return field;
	}
	const span = field.querySelector(":scope > span");
	if (!span) {
		return field;
	}
	if (typeof setTranslatedText === "function") {
		setTranslatedText(span, tag, fallback, undefined, typeId);
	} else {
		span.textContent = fallback;
	}
	return field;
}

/**
 * Tag <option> labels. map: value → { tag, fallback } or [tag, fallback].
 * Never put badges on options — setTranslatedOption skips nesting.
 */
function tagSelectOptions(select, map, typeId) {
	if (!select || !map) {
		return select;
	}
	for (const opt of select.querySelectorAll("option")) {
		const entry = map[opt.value];
		if (!entry) {
			continue;
		}
		const tag = entry.tag != null ? entry.tag : entry[0];
		const fallback = entry.fallback != null ? entry.fallback : entry[1];
		if (typeof setTranslatedOption === "function") {
			setTranslatedOption(opt, tag, fallback, typeId);
		} else if (fallback != null) {
			opt.textContent = fallback;
		}
	}
	return select;
}

function closeCogSelectWrap(wrap) {
	if (!wrap) {
		return;
	}
	wrap.classList.remove("is-open");
	const menu = wrap._cogMenu || wrap.querySelector(".cog-select-menu");
	if (menu) {
		menu.hidden = true;
		clearAnchoredPopupPlacement(menu);
	}
	const id = wrap._cogPopupId;
	wrap._cogPopupId = null;
	unregisterEditorPopup(id);
}

function closeCogSelects(except) {
	for (const wrap of document.querySelectorAll(".cog-select.is-open")) {
		if (wrap !== except) {
			closeCogSelectWrap(wrap);
		}
	}
	// Portaled menus can outlive their wraps after #tab-body rebuild — sweep orphans.
	for (const menu of document.querySelectorAll("body > .cog-select-menu.is-placed")) {
		const home = menu._cogHome;
		if (except && home && (home === except || except.contains(home))) {
			continue;
		}
		menu.hidden = true;
		clearAnchoredPopupPlacement(menu);
		if (home && !home.isConnected) {
			menu.remove();
		}
	}
}

function closeInfoTipWrap(wrap) {
	if (!wrap) {
		return;
	}
	wrap.classList.remove("is-open");
	const panel = wrap._cogPanel || wrap.querySelector(".info-tip-panel");
	if (panel) {
		panel.hidden = true;
		clearAnchoredPopupPlacement(panel);
	}
	const id = wrap._cogPopupId;
	wrap._cogPopupId = null;
	unregisterEditorPopup(id);
}

function closeInfoTips(except) {
	for (const wrap of document.querySelectorAll(".info-tip.is-open")) {
		if (wrap !== except) {
			closeInfoTipWrap(wrap);
		}
	}
	for (const panel of document.querySelectorAll("body > .info-tip-panel.is-placed")) {
		const home = panel._cogHome;
		if (except && home && (home === except || except.contains(home))) {
			continue;
		}
		panel.hidden = true;
		clearAnchoredPopupPlacement(panel);
		if (home && !home.isConnected) {
			panel.remove();
		}
	}
}

function closeClockTokenPopover(popover) {
	if (!popover) {
		return;
	}
	popover.hidden = true;
	clearAnchoredPopupPlacement(popover);
	const id = popover._cogPopupId;
	popover._cogPopupId = null;
	unregisterEditorPopup(id);
}

function closeClockTokenPopovers() {
	for (const pop of document.querySelectorAll(".clock-token-popover.is-placed, .clock-token-popover:not([hidden])")) {
		closeClockTokenPopover(pop);
	}
}

/** Clip popups to the editor tab body (or panel), not the full window. */
function editorPopupClipRect() {
	const el = document.getElementById("tab-body") || document.getElementById("editor-panel");
	if (el) {
		return el.getBoundingClientRect();
	}
	return {
		left: 0,
		top: 0,
		right: window.innerWidth,
		bottom: window.innerHeight,
		width: window.innerWidth,
		height: window.innerHeight
	};
}

function clearAnchoredPopupPlacement(el) {
	if (!el) {
		return;
	}
	el.classList.remove("is-placed");
	el.style.position = "";
	el.style.left = "";
	el.style.top = "";
	el.style.right = "";
	el.style.bottom = "";
	el.style.width = "";
	el.style.maxHeight = "";
	el.style.zIndex = "";
	el.style.fontFamily = "";
	el.style.fontSize = "";
	el.style.fontWeight = "";
	el.style.lineHeight = "";
	// Return portaled popup to its home so layout/cleanup stay predictable.
	if (el._cogHome && el.parentElement !== el._cogHome) {
		el._cogHome.appendChild(el);
	}
}

/**
 * Fixed-position a popup next to an anchor, flipping up/down and shifting
 * left/right so it stays inside the editor clip rect (avoids tab-body scrollbars).
 * Portals to document.body — #editor-panel has transform, which would otherwise
 * make position:fixed resolve against the panel instead of the viewport.
 */
function placeAnchoredPopup(el, anchor, opts) {
	if (!el || !anchor) {
		return;
	}
	if (!el._cogHome) {
		el._cogHome = el.parentElement;
	}
	if (el.parentElement !== document.body) {
		document.body.appendChild(el);
	}

	const gap = opts && opts.gap != null ? opts.gap : 6;
	const pad = opts && opts.pad != null ? opts.pad : 6;
	const matchWidth = !!(opts && opts.matchAnchorWidth);
	const clip = editorPopupClipRect();
	const ar = anchor.getBoundingClientRect();

	el.classList.add("is-placed");
	el.hidden = false;
	el.style.position = "fixed";
	el.style.zIndex = "10020";
	el.style.right = "auto";
	el.style.bottom = "auto";
	el.style.left = "0px";
	el.style.top = "0px";
	// Match the trigger/button type size — body portal loses #editor-panel / .pos-field em cascade.
	const anchorStyle = window.getComputedStyle(anchor);
	el.style.fontFamily = anchorStyle.fontFamily;
	el.style.fontSize = anchorStyle.fontSize;
	el.style.fontWeight = anchorStyle.fontWeight;
	el.style.lineHeight = anchorStyle.lineHeight;
	if (matchWidth) {
		el.style.width = `${Math.max(1, Math.round(ar.width))}px`;
	} else {
		el.style.width = "";
	}
	el.style.maxHeight = "";

	const spaceBelow = Math.max(0, clip.bottom - ar.bottom - gap - pad);
	const spaceAbove = Math.max(0, ar.top - clip.top - gap - pad);
	const placeBelow = spaceBelow >= spaceAbove || spaceBelow >= 64;
	const maxH = Math.max(48, placeBelow ? spaceBelow : spaceAbove);
	if (opts && opts.capMaxHeight) {
		el.style.maxHeight = `${Math.min(opts.capMaxHeight, maxH)}px`;
	} else {
		el.style.maxHeight = `${maxH}px`;
	}

	const pw = el.offsetWidth || (matchWidth ? ar.width : 220);
	const ph = el.offsetHeight || 80;

	let top = placeBelow ? ar.bottom + gap : ar.top - ph - gap;
	if (placeBelow && top + ph > clip.bottom - pad && spaceAbove > spaceBelow) {
		top = ar.top - ph - gap;
	} else if (!placeBelow && top < clip.top + pad && spaceBelow > spaceAbove) {
		top = ar.bottom + gap;
	}
	top = Math.max(clip.top + pad, Math.min(top, clip.bottom - Math.min(ph, maxH) - pad));

	let left = ar.left;
	if (opts && opts.align === "end") {
		left = ar.right - pw;
	}
	if (left + pw > clip.right - pad) {
		left = ar.right - pw;
	}
	if (left < clip.left + pad) {
		left = clip.left + pad;
	}
	if (left + pw > clip.right - pad) {
		left = Math.max(clip.left + pad, clip.right - pw - pad);
	}

	el.style.left = `${Math.round(left)}px`;
	el.style.top = `${Math.round(top)}px`;
}

function repositionOpenEditorPopups() {
	for (const entry of editorPopupRegistry.values()) {
		if (typeof entry.reposition === "function") {
			entry.reposition();
		}
	}
}

/** Info (i) control. Optional `tag` marks the panel for editor translations. */
function makeInfoTip(text, tag) {
	const wrap = document.createElement("span");
	wrap.className = "info-tip";
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "info-tip-btn";
	btn.textContent = "i";
	if (typeof setTranslatedAriaLabel === "function") {
		setTranslatedAriaLabel(btn, "cog-more-info", "More info");
	} else {
		btn.setAttribute("aria-label", "More info");
	}
	const panel = document.createElement("span");
	panel.className = "info-tip-panel";
	panel.hidden = true;
	const fallback = text == null ? "" : String(text);
	if (tag && typeof setTranslatedText === "function") {
		setTranslatedText(panel, tag, fallback);
	} else {
		panel.textContent = fallback;
	}
	wrap._cogPanel = panel;
	btn.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		const open = panel.hidden;
		if (!open) {
			closeInfoTipWrap(wrap);
			return;
		}
		beginEditorPopup("info");
		wrap.classList.add("is-open");
		const place = () => placeAnchoredPopup(panel, btn, { gap: 6, align: "start" });
		wrap._cogPopupId = registerEditorPopup("info", {
			close: () => closeInfoTipWrap(wrap),
			reposition: place,
			retain: panel
		});
		place();
	});
	panel.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	panel.addEventListener("click", (ev) => ev.stopPropagation());
	wrap.appendChild(btn);
	wrap.appendChild(panel);
	return wrap;
}

function makeColorField(label, key, value, fallback) {
	return makeOptionalColorField(label, value, fallback, (hex, live) => {
		if (snapshot.general[key] === hex) {
			if (live === false) {
				scheduleSave(true);
			}
			return;
		}
		snapshot.general[key] = hex;
		applyTheme();
		if (live === true) {
			softRefreshHudPaint();
			return;
		}
		scheduleSave(true);
		if (live === false) {
			softRefreshHudPaint();
			return;
		}
		renderGears();
	});
}

/** Repaint existing HUD nodes from settings (no full rebuild / fade bookkeeping). */
function softRefreshHudPaint() {
	for (const group of snapshot.groups || []) {
		syncHudGroup(group);
	}
	for (const gauge of snapshot.gauges || []) {
		syncHudGauge(gauge);
	}
	for (const gizmo of snapshot.gizmos || []) {
		syncHudGizmo(gizmo);
	}
}

function enhanceSelect(select) {
	if (!select || select.dataset.enhanced === "1") {
		return;
	}
	select.dataset.enhanced = "1";
	const wrap = document.createElement("div");
	wrap.className = "cog-select";
	select.parentNode.insertBefore(wrap, select);
	wrap.appendChild(select);
	select.classList.add("cog-select-native");
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "cog-select-trigger";
	const menu = document.createElement("ul");
	menu.className = "cog-select-menu";
	menu.hidden = true;
	wrap._cogMenu = menu;
	const sync = () => {
		menu.innerHTML = "";
		for (const opt of select.options) {
			const li = document.createElement("li");
			li.dataset.value = opt.value;
			li.textContent = opt.textContent;
			if (opt.value === select.value) {
				li.classList.add("is-selected");
			}
			li.addEventListener("mousedown", (ev) => ev.preventDefault());
			li.addEventListener("click", () => {
				select.value = opt.value;
				select.dispatchEvent(new Event("change", { bubbles: true }));
				closeCogSelects();
				sync();
			});
			menu.appendChild(li);
		}
		const cur = select.options[select.selectedIndex];
		btn.textContent = cur ? cur.textContent : "—";
	};
	sync();
	btn.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		const open = menu.hidden;
		if (!open) {
			closeCogSelectWrap(wrap);
			return;
		}
		beginEditorPopup("select");
		wrap.classList.add("is-open");
		const place = () =>
			placeAnchoredPopup(menu, btn, {
				matchAnchorWidth: true,
				gap: 3,
				capMaxHeight: 12 * 16
			});
		wrap._cogPopupId = registerEditorPopup("select", {
			close: () => closeCogSelectWrap(wrap),
			reposition: place,
			retain: menu
		});
		place();
	});
	menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	select.addEventListener("change", sync);
	select.addEventListener("cog:options", sync);
	wrap.appendChild(btn);
	wrap.appendChild(menu);
}

function enhanceSelects(root) {
	if (!root) {
		return;
	}
	for (const select of root.querySelectorAll("select")) {
		enhanceSelect(select);
	}
}

function renderGeneral(body) {
	const row = document.createElement("label");
	row.className = "check-row";
	const box = document.createElement("input");
	box.type = "checkbox";
	box.checked = !!snapshot.general.showDefaultGroup;
	box.addEventListener("change", () => {
		snapshot.general.showDefaultGroup = box.checked;
		const group = groupFor(DEFAULT_GROUP_ID);
		if (group) {
			group.visible = box.checked;
		}
		scheduleSave(true);
		renderGears();
	});
	row.appendChild(box);
	const showDefaultLabel = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(showDefaultLabel, "cog-show-default-group", "Show Default Group");
	} else {
		showDefaultLabel.textContent = "Show Default Group";
	}
	row.appendChild(showDefaultLabel);
	body.appendChild(row);
	const groupLede = document.createElement("p");
	groupLede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			groupLede,
			"cog-show-default-group-lede",
			"Gears that are not assigned to another group appear on the Default Group line. Turn this off to hide that line without deleting gears. The Default Group itself cannot be removed."
		);
	} else {
		groupLede.textContent =
			"Gears that are not assigned to another group appear on the Default Group line. Turn this off to hide that line without deleting gears. The Default Group itself cannot be removed.";
	}
	body.appendChild(groupLede);

	appendEditorRule(body);

	const prefsHeading = document.createElement("p");
	prefsHeading.className = "lede section-heading";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(prefsHeading, "cog-editor-preferences", "Editor preferences");
	} else {
		prefsHeading.textContent = "Editor preferences";
	}
	body.appendChild(prefsHeading);
	const prefsLede = document.createElement("p");
	prefsLede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(prefsLede, "cog-editor-preferences-lede", "Language applies to the editor and help.");
	} else {
		prefsLede.textContent = "Language applies to the editor and help.";
	}
	body.appendChild(prefsLede);

	const prefsRow = document.createElement("div");
	prefsRow.className = "style-row";

	const fontField = document.createElement("label");
	fontField.className = "pos-field compact wide";
	const fontTitle = document.createElement("span");
	fontTitle.className = "field-title-row";
	const fontLabel = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(fontLabel, "cog-font", "Font");
	} else {
		fontLabel.textContent = "Font";
	}
	fontTitle.appendChild(fontLabel);
	fontTitle.appendChild(
		makeInfoTip(
			"Used for group, gauge, and gizmo text. The shout meter always uses Dragon Script.",
			"cog-font-tip"
		)
	);
	fontField.appendChild(fontTitle);
	const fontSel = document.createElement("select");
	fontSel.dataset.role = "gadgetFont";
	const families = availableFontFamilies();
	const currentFont = resolvedGadgetFont();
	for (const family of families) {
		const opt = document.createElement("option");
		opt.value = family;
		opt.textContent = family;
		if (family === currentFont) {
			opt.selected = true;
		}
		fontSel.appendChild(opt);
	}
	fontSel.addEventListener("change", () => {
		snapshot.general.gadgetFont = normalizeGadgetFont(fontSel.value);
		applyTheme();
		scheduleSave(true);
		renderGears();
	});
	fontField.appendChild(fontSel);
	prefsRow.appendChild(fontField);

	const langField = document.createElement("label");
	langField.className = "pos-field compact";
	langField.innerHTML = `<span>Language</span>`;
	tagFieldLabel(langField, "cog-language", "Language");
	const langSel = document.createElement("select");
	langSel.dataset.role = "editorLanguage";
	const langs =
		typeof availableLanguages === "function" ? availableLanguages() : ["en-CA"];
	const currentLang =
		(snapshot.general && snapshot.general.language) ||
		(typeof COG_FALLBACK_LANG !== "undefined" ? COG_FALLBACK_LANG : "en-CA");
	for (const code of langs) {
		const opt = document.createElement("option");
		opt.value = code;
		opt.textContent =
			typeof languageDisplayName === "function" ? languageDisplayName(code) : code;
		if (code === currentLang) {
			opt.selected = true;
		}
		langSel.appendChild(opt);
	}
	langSel.addEventListener("change", () => {
		snapshot.general.language = langSel.value || "en-CA";
		scheduleSave(true);
		if (typeof syncDocumentLang === "function") {
			syncDocumentLang();
		}
		renderEditor(true);
		renderGears();
		updateKeybindHint();
	});
	langField.appendChild(langSel);
	prefsRow.appendChild(langField);

	const highlightRow = document.createElement("label");
	highlightRow.className = "check-row compact";
	const highlightBox = document.createElement("input");
	highlightBox.type = "checkbox";
	highlightBox.checked = !!snapshot.general.highlightMissingTranslations;
	highlightBox.addEventListener("change", () => {
		snapshot.general.highlightMissingTranslations = highlightBox.checked;
		scheduleSave(true);
		renderEditor(true);
	});
	highlightRow.appendChild(highlightBox);
	const highlightTitle = document.createElement("span");
	highlightTitle.className = "field-title-row";
	const highlightLabel = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(highlightLabel, "cog-highlight-missing", "Highlight missing translations");
	} else {
		highlightLabel.textContent = "Highlight missing translations";
	}
	highlightTitle.appendChild(highlightLabel);
	highlightTitle.appendChild(
		makeInfoTip(
			"Marks missing catalog strings with a gold badge (shows the en-CA fallback).",
			"cog-highlight-missing-tip"
		)
	);
	highlightRow.appendChild(highlightTitle);
	prefsRow.appendChild(highlightRow);

	body.appendChild(prefsRow);
	enhanceSelects(prefsRow);

	appendEditorRule(body);

	const colorHeading = document.createElement("p");
	colorHeading.className = "lede section-heading";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(colorHeading, "cog-backup-colours", "Backup colours");
	} else {
		colorHeading.textContent = "Backup colours";
	}
	body.appendChild(colorHeading);
	const colorLede = document.createElement("p");
	colorLede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			colorLede,
			"cog-backup-colours-lede",
			"Used when a gear or group does not set its own. Bar is the meter fill; border is the bar trough; icon is a single tint for meter icons. Fancy multi-stop colours belong on a gear or group. Neutral icon colour is only for count gears — Always White, or Bar / Border / Icon 0%–100% sampled from the effective ramp."
		);
	} else {
		colorLede.textContent =
			"Used when a gear or group does not set its own. Bar is the meter fill; border is the bar trough; icon is a single tint for meter icons. Fancy multi-stop colours belong on a gear or group. Neutral icon colour is only for count gears — Always White, or Bar / Border / Icon 0%–100% sampled from the effective ramp.";
	}
	body.appendChild(colorLede);

	const colors = document.createElement("div");
	colors.className = "color-row";
	if (!snapshot.general.iconColor && (snapshot.general.iconStartColor || snapshot.general.iconEndColor)) {
		snapshot.general.iconColor = themeIconColor();
	}
	const backupBar = makeColorField("Backup bar", "fillColor", snapshot.general.fillColor, defaultFillColor());
	tagFieldLabel(backupBar, "cog-backup-bar", "Backup bar");
	colors.appendChild(backupBar);
	const backupBorder = makeColorField("Backup border", "borderColor", snapshot.general.borderColor, defaultBorderColor());
	tagFieldLabel(backupBorder, "cog-backup-border", "Backup border");
	colors.appendChild(backupBorder);
	const backupIcon = makeColorField("Backup icon", "iconColor", snapshot.general.iconColor || themeIconColor(), defaultIconColor());
	tagFieldLabel(backupIcon, "cog-backup-icon", "Backup icon");
	colors.appendChild(backupIcon);
	colors.appendChild(
		makeNeutralIconField(
			makeNeutralIconSelect(snapshot.general.neutralIconMode, (mode) => {
				snapshot.general.neutralIconMode = mode;
				scheduleSave(true);
				renderGears();
			})
		)
	);
	body.appendChild(colors);
	enhanceSelects(colors);
	const reset = document.createElement("button");
	reset.type = "button";
	reset.className = "action";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(reset, "cog-reset-backup-colours", "Reset backup colours");
	} else {
		reset.textContent = "Reset backup colours";
	}
	reset.addEventListener("click", () => {
		snapshot.general.fillColor = defaultFillColor();
		snapshot.general.borderColor = defaultBorderColor();
		snapshot.general.iconColor = defaultIconColor();
		delete snapshot.general.iconStartColor;
		delete snapshot.general.iconEndColor;
		snapshot.general.neutralIconMode = "white";
		applyTheme();
		scheduleSave(true);
		renderGears();
		renderEditor();
	});
	body.appendChild(reset);

	appendEditorRule(body);

	const hideHeading = document.createElement("p");
	hideHeading.className = "lede section-heading toggle-ui-heading";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(hideHeading, "cog-toggle-ui", "Toggle UI");
	} else {
		hideHeading.textContent = "Toggle UI";
	}
	body.appendChild(hideHeading);
	const hideLede = document.createElement("p");
	hideLede.className = "lede toggle-ui-lede";
	// Em dash as \u2014 (literal in the setTranslatedText call so harvest sees it).
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			hideLede,
			"cog-toggle-ui-lede",
			"Clear view for photos/immersion \u2014 not a vanilla-HUD mode. Hides all COG play gadgets (same idea as visibility None); does not undo gear links, Feed hides, or the Suppressor. Optional hotkey works only while playing with menus closed (not console, COG editor, or search fields). Click a bound key to clear it, click again to set a new one. Mods can call COG_API.SetUiHidden / ToggleUiHidden anytime."
		);
	} else {
		hideLede.textContent =
			"Clear view for photos/immersion \u2014 not a vanilla-HUD mode. Hides all COG play gadgets (same idea as visibility None); does not undo gear links, Feed hides, or the Suppressor. Optional hotkey works only while playing with menus closed (not console, COG editor, or search fields). Click a bound key to clear it, click again to set a new one. Mods can call COG_API.SetUiHidden / ToggleUiHidden anytime.";
	}
	body.appendChild(hideLede);

	const hideKeyRow = document.createElement("div");
	hideKeyRow.className = "check-row toggle-ui-row";
	hideKeyRow.style.alignItems = "center";
	hideKeyRow.style.gap = "0.6rem";
	const hideKeyLabel = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(hideKeyLabel, "cog-toggle-key", "Toggle key");
	} else {
		hideKeyLabel.textContent = "Toggle key";
	}
	hideKeyRow.appendChild(hideKeyLabel);
	const hideKeyBtn = document.createElement("button");
	hideKeyBtn.type = "button";
	hideKeyBtn.className = "action";
	hideKeyBtn.dataset.role = "hideToggleKey";
	const boundKey = String((snapshot.general && snapshot.general.hideToggleKey) || "").trim();
	const hideListening = !!window.__cogHideKeyListening;
	if (hideListening) {
		if (typeof setTranslatedText === "function") {
			setTranslatedText(hideKeyBtn, "cog-press-a-key", "Press a key\u2026");
		} else {
			hideKeyBtn.textContent = "Press a key\u2026";
		}
		hideKeyBtn.classList.add("is-listening");
	} else if (boundKey) {
		hideKeyBtn.textContent = boundKey;
		hideKeyBtn.removeAttribute("data-translation");
		hideKeyBtn.removeAttribute("data-translation-fallback");
	} else if (typeof setTranslatedText === "function") {
		setTranslatedText(hideKeyBtn, "cog-none-click-to-set", "None \u2014 click to set");
	} else {
		hideKeyBtn.textContent = "None \u2014 click to set";
	}
	if (hideListening) {
		if (typeof setTranslatedTitle === "function") {
			setTranslatedTitle(hideKeyBtn, "cog-listening-esc-cancels", "Listening\u2026 Esc cancels");
		} else {
			hideKeyBtn.title = "Listening\u2026 Esc cancels";
		}
	} else if (boundKey) {
		if (typeof setTranslatedTitle === "function") {
			setTranslatedTitle(hideKeyBtn, "cog-click-to-clear-hotkey", "Click to clear this hotkey");
		} else {
			hideKeyBtn.title = "Click to clear this hotkey";
		}
	} else if (typeof setTranslatedTitle === "function") {
		setTranslatedTitle(hideKeyBtn, "cog-click-then-press-key", "Click then press a key to bind");
	} else {
		hideKeyBtn.title = "Click then press a key to bind";
	}
	hideKeyBtn.addEventListener("click", () => {
		if (window.__cogHideKeyListening) {
			window.__cogHideKeyListening = false;
			if (typeof window.cogToSKSE === "function") {
				window.cogToSKSE("hideRebindCancel");
			}
			renderEditor(false);
			return;
		}
		const current = String((snapshot.general && snapshot.general.hideToggleKey) || "").trim();
		if (current) {
			snapshot.general.hideToggleKey = "";
			scheduleSave(true);
			if (typeof window.cogToSKSE === "function") {
				window.cogToSKSE("hideToggleKeyClear");
			}
			renderEditor(false);
			return;
		}
		window.__cogHideKeyListening = true;
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE("hideRebindStart");
		}
		renderEditor(false);
	});
	hideKeyRow.appendChild(hideKeyBtn);
	body.appendChild(hideKeyRow);

	const flashRow = document.createElement("label");
	flashRow.className = "check-row toggle-ui-row";
	const flashBox = document.createElement("input");
	flashBox.type = "checkbox";
	flashBox.checked = snapshot.general.hideIncludesFlash !== false;
	flashBox.addEventListener("change", () => {
		snapshot.general.hideIncludesFlash = flashBox.checked;
		scheduleSave(true);
	});
	flashRow.appendChild(flashBox);
	const flashTitle = document.createElement("span");
	flashTitle.className = "field-title-row";
	const flashLabel = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(flashLabel, "cog-toggle-hides-flash", "Toggle also hides Flash HUD");
	} else {
		flashLabel.textContent = "Toggle also hides Flash HUD";
	}
	flashTitle.appendChild(flashLabel);
	flashTitle.appendChild(
		makeInfoTip(
			"On (default): also hide Flash HUD (vanilla, TrueHUD, MiniMap, and similar). Off: only COG gadgets hide; soft-suppressed Flash stays suppressed.",
			"cog-toggle-hides-flash-tip"
		)
	);
	flashRow.appendChild(flashTitle);
	body.appendChild(flashRow);
}

function clampPx(n, min, max) {
	const v = Math.round(Number(n));
	if (!Number.isFinite(v)) {
		return min;
	}
	return Math.max(min, Math.min(max, v));
}

function bindNumberField(el, opts) {
	if (!el || !opts) {
		return;
	}
	if (opts.prefix || opts.suffix) {
		wrapInputAffix(el, { prefix: opts.prefix || "", suffix: opts.suffix || "" });
	}
	const decimals = opts.decimals != null && Number.isFinite(Number(opts.decimals)) ? Number(opts.decimals) : null;
	const format =
		opts.format ||
		((v) => (decimals != null ? fmtDec(v, decimals) : String(v)));
	const parseRaw = opts.parse;
	const commit = (snap) => {
		let parsed = parseRaw(el.value);
		if (parsed == null) {
			if (snap) {
				el.value = format(opts.current());
			}
			return;
		}
		if (decimals != null) {
			parsed = quantizeDec(parsed, decimals);
		}
		// Same pattern as patchGizmo: skip apply/save when the value did not change
		// (duplicate input/change/mouseup events from one gesture).
		let cur = opts.current();
		if (decimals != null && Number.isFinite(Number(cur))) {
			cur = quantizeDec(Number(cur), decimals);
		}
		if (parsed === cur) {
			if (snap) {
				el.value = format(parsed);
			}
			return;
		}
		opts.apply(parsed);
		if (snap) {
			el.value = format(parsed);
		}
	};
	el.addEventListener("input", () => commit(false));
	el.addEventListener("change", () => commit(true));
	el.addEventListener("blur", () => commit(true));
	el.addEventListener("click", () => commit(false));
	el.addEventListener("mouseup", () => {
		commit(false);
		requestAnimationFrame(() => commit(false));
	});
	el.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			commit(true);
			el.blur();
		}
	});
	el.addEventListener("keyup", (ev) => {
		if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
			commit(false);
		}
	});
}

function stopHeaderToggle(el) {
	if (!el) {
		return;
	}
	el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
	el.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
	});
}

/**
 * Enter / Escape for accordion rename — same commit-and-blur pattern as bindNumberField
 * and colour hex fields. Capture + stopPropagation so Ultralight does not also toggle
 * the parent <details> on Enter.
 */
function bindAccordionRenameKeys(nameInput, finishRename) {
	if (!nameInput || typeof finishRename !== "function") {
		return;
	}
	nameInput.addEventListener(
		"keydown",
		(ev) => {
			if (ev.key === "Enter" || ev.code === "Enter" || ev.code === "NumpadEnter") {
				ev.preventDefault();
				ev.stopPropagation();
				finishRename(true);
				nameInput.blur();
				return;
			}
			if (ev.key === "Escape" || ev.code === "Escape") {
				ev.preventDefault();
				ev.stopPropagation();
				finishRename(false);
				nameInput.blur();
			}
		},
		true
	);
	nameInput.addEventListener("blur", () => finishRename(true));
}

/**
 * Ultralight still toggles <details> when Space is typed in an <input> inside <summary>.
 * Park the field as a direct child of <details> (outside summary) for the rename, and
 * absolutely cover a flex slot left in the header so layout stays the same.
 */
function parkRenameFieldForEdit(details, nameInput) {
	if (!details || !nameInput || nameInput._cogRenameHome) {
		return;
	}
	const home = nameInput.parentElement;
	if (!home) {
		return;
	}
	const slot = document.createElement("span");
	slot.className = "name-field-slot";
	slot.setAttribute("aria-hidden", "true");
	home.insertBefore(slot, nameInput);
	nameInput._cogRenameHome = home;
	nameInput._cogRenameNext = nameInput.nextSibling;
	nameInput._cogRenameSlot = slot;
	const summary = details.querySelector(":scope > summary");
	if (summary && summary.nextSibling) {
		details.insertBefore(nameInput, summary.nextSibling);
	} else if (summary) {
		details.appendChild(nameInput);
	} else {
		details.insertBefore(nameInput, details.firstChild);
	}
	layoutParkedRenameField(nameInput);
}

function layoutParkedRenameField(nameInput) {
	const slot = nameInput && nameInput._cogRenameSlot;
	const details = nameInput && nameInput.parentElement;
	if (!slot || !details) {
		return;
	}
	const dr = details.getBoundingClientRect();
	const sr = slot.getBoundingClientRect();
	if (!(sr.width > 0) || !(sr.height > 0)) {
		return;
	}
	nameInput.style.position = "absolute";
	nameInput.style.left = `${Math.round(sr.left - dr.left)}px`;
	nameInput.style.top = `${Math.round(sr.top - dr.top)}px`;
	nameInput.style.width = `${Math.round(sr.width)}px`;
	nameInput.style.height = `${Math.round(sr.height)}px`;
	nameInput.style.boxSizing = "border-box";
	nameInput.style.margin = "0";
	nameInput.style.zIndex = "3";
}

function restoreRenameField(nameInput) {
	if (!nameInput || !nameInput._cogRenameHome) {
		return;
	}
	const home = nameInput._cogRenameHome;
	const next = nameInput._cogRenameNext;
	const slot = nameInput._cogRenameSlot;
	nameInput.style.position = "";
	nameInput.style.left = "";
	nameInput.style.top = "";
	nameInput.style.width = "";
	nameInput.style.height = "";
	nameInput.style.boxSizing = "";
	nameInput.style.margin = "";
	nameInput.style.zIndex = "";
	if (next && next.parentElement === home) {
		home.insertBefore(nameInput, next);
	} else {
		home.appendChild(nameInput);
	}
	if (slot && slot.parentElement) {
		slot.remove();
	}
	nameInput._cogRenameHome = null;
	nameInput._cogRenameNext = null;
	nameInput._cogRenameSlot = null;
}

/** Replace `### Title #cog-help-tag` (any ATX level) with the translated title. */
function translateHelpMarkdown(md) {
	return String(md || "").replace(
		/^(#{1,6})\s+(.+?)\s+(#cog-[a-z0-9-]+)\s*$/gim,
		(_, hashes, title, hashTag) => {
			const tag = String(hashTag).slice(1).toLowerCase();
			const fb = String(title).trim();
			const translated = typeof t === "function" ? t(tag, fb) : fb;
			return `${hashes} ${translated}`;
		}
	);
}

/**
 * Help markdown: accordion openers may end with a catalog tag, e.g.
 *   +++ Opening the editor #cog-help-opening-editor
 * Body English is harvested as `{tag}-body`. Section headings: `### Title #cog-help-sec-…`.
 */
function parseHelpDocument(text) {
	const raw = String(text || "").replace(/^\uFEFF/, "");
	const lines = raw.split(/\r?\n/);
	const blocks = [];
	let prose = [];
	let openTitle = null;
	let openTag = "";
	let openBody = [];

	const flushProse = () => {
		const md = prose.join("\n").trim();
		prose = [];
		if (md) {
			blocks.push({ type: "markdown", text: md });
		}
	};

	const flushDetails = () => {
		if (openTitle == null) {
			return;
		}
		blocks.push({
			type: "details",
			title: openTitle,
			tag: openTag,
			text: openBody.join("\n").trim()
		});
		openTitle = null;
		openTag = "";
		openBody = [];
	};

	const openTitleOf = (line) => {
		const m = /^\+\+\+\s+(.+)$/.exec(line);
		if (!m) {
			return { title: "", tag: "" };
		}
		let rawTitle = m[1].trim();
		const tm = /\s+(#cog-[a-z0-9-]+)\s*$/i.exec(rawTitle);
		if (tm) {
			return {
				title: rawTitle.slice(0, tm.index).trim(),
				tag: tm[1].slice(1).toLowerCase()
			};
		}
		return { title: rawTitle, tag: "" };
	};
	const isOpenLine = (line) => /^\+\+\+\s+\S/.test(line) && !/\s\+\+\+\s*$/.test(line);
	const isCloseLine = (line) => /\s\+\+\+\s*$/.test(line);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (openTitle == null) {
			if (isOpenLine(line)) {
				flushProse();
				const opened = openTitleOf(line);
				openTitle = opened.title;
				openTag = opened.tag;
				openBody = [];
				continue;
			}
			prose.push(line);
			continue;
		}
		if (isCloseLine(line)) {
			flushDetails();
			continue;
		}
		if (isOpenLine(line)) {
			flushDetails();
			const opened = openTitleOf(line);
			openTitle = opened.title;
			openTag = opened.tag;
			openBody = [];
			continue;
		}
		openBody.push(line);
	}
	flushDetails();
	flushProse();
	return blocks;
}

async function ensureHelpDocs() {
	if (helpCache.about != null && helpCache.definitions != null && helpCache.help != null) {
		return helpCache;
	}
	if (helpLoadPromise) {
		return helpLoadPromise;
	}
	helpLoadPromise = (async () => {
		const load = async (key, file) => {
			try {
				const res = await fetch(`help/${file}`, { cache: "no-store" });
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				helpCache[key] = await res.text();
			} catch (err) {
				console.error("help load", file, err);
				helpCache[key] =
					typeof tf === "function"
						? tf(
								"cog-help-load-failed",
								"Could not load help/{file}. Redeploy the view/help folder with the mod.",
								{ file }
							)
						: `Could not load help/${file}. Redeploy the view/help folder with the mod.`;
			}
		};
		await Promise.all([
			load("about", "about.md"),
			load("definitions", "definitions.md"),
			load("help", "help.md")
		]);
		return helpCache;
	})();
	try {
		return await helpLoadPromise;
	} finally {
		helpLoadPromise = null;
	}
}

function bindExclusiveAccordions(root, groupName) {
	const items = [...root.querySelectorAll(`details.accordion[data-help-group="${groupName}"]`)];
	for (const details of items) {
		details.addEventListener("toggle", () => {
			if (!details.open) {
				return;
			}
			for (const other of items) {
				if (other !== details) {
					other.open = false;
				}
			}
		});
	}
}

function renderHelpDocument(host, text, opts) {
	const exclusiveGroup = opts && opts.exclusiveGroup ? String(opts.exclusiveGroup) : "";
	const docTag = opts && opts.docTag ? String(opts.docTag) : "";
	const doc = document.createElement("div");
	doc.className = "help-doc";
	let sourceText = String(text || "");
	if (docTag && typeof t === "function") {
		sourceText = t(docTag, sourceText);
	}
	sourceText = translateHelpMarkdown(sourceText);
	const blocks = parseHelpDocument(sourceText);
	if (!blocks.length) {
		const p = document.createElement("p");
		p.className = "lede";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(
				p,
				"cog-help-empty",
				"No entries yet. Edit the matching markdown file under view/help/."
			);
		} else {
			p.textContent = "No entries yet. Edit the matching markdown file under view/help/.";
		}
		doc.appendChild(p);
		host.appendChild(doc);
		return;
	}
	const renderMd = typeof window.renderMarkdown === "function" ? window.renderMarkdown : null;
	let firstDetails = true;
	for (const block of blocks) {
		if (block.type === "details") {
			const details = document.createElement("details");
			details.className = "accordion";
			if (exclusiveGroup) {
				details.dataset.helpGroup = exclusiveGroup;
				details.setAttribute("name", exclusiveGroup);
			}
			if (exclusiveGroup && firstDetails) {
				details.open = true;
				firstDetails = false;
			}
			const summary = document.createElement("summary");
			const tag = block.tag || "";
			const titleFb = block.title || "Section";
			if (tag && typeof setTranslatedText === "function") {
				setTranslatedText(summary, tag, titleFb);
			} else if (!block.title && typeof setTranslatedText === "function") {
				setTranslatedText(summary, "cog-section", "Section");
			} else {
				summary.textContent = titleFb;
			}
			const body = document.createElement("div");
			body.className = "accordion-body";
			let bodyMd = block.text || "";
			if (tag && typeof t === "function") {
				bodyMd = t(`${tag}-body`, bodyMd);
			}
			bodyMd = translateHelpMarkdown(bodyMd);
			if (renderMd) {
				renderMd(body, bodyMd);
			} else {
				const p = document.createElement("p");
				p.textContent = bodyMd;
				body.appendChild(p);
			}
			details.appendChild(summary);
			details.appendChild(body);
			doc.appendChild(details);
			continue;
		}
		const proseMd = translateHelpMarkdown(block.text || "");
		if (renderMd) {
			renderMd(doc, proseMd);
		} else {
			const p = document.createElement("p");
			p.className = "help-block";
			p.textContent = proseMd;
			doc.appendChild(p);
		}
	}
	host.appendChild(doc);
	if (exclusiveGroup) {
		bindExclusiveAccordions(doc, exclusiveGroup);
	}
	if (typeof applyTranslations === "function") {
		applyTranslations(doc);
	}
}


function syncHelpChrome() {
	const helpBtn = document.getElementById("editor-help");
	if (helpBtn) {
		helpBtn.classList.toggle("is-active", helpMode);
		if (typeof setTranslatedTitle === "function") {
			setTranslatedTitle(helpBtn, "cog-help-button-tip", "About, Definitions, Help, and Suppressions");
		} else {
			helpBtn.title = "About, Definitions, Help, and Suppressions";
		}
		if (typeof setTranslatedAriaLabel === "function") {
			setTranslatedAriaLabel(helpBtn, "cog-help-button-tip", "About, Definitions, Help, and Suppressions");
		} else {
			helpBtn.setAttribute("aria-label", "About, Definitions, Help, and Suppressions");
		}
		helpBtn.dataset.tip =
			typeof t === "function"
				? t("cog-help-button-tip", "About, Definitions, Help, and Suppressions")
				: "About, Definitions, Help, and Suppressions";
	}
	const tabs = document.getElementById("tabs");
	if (!tabs) {
		return;
	}
	if (helpMode) {
		tabs.innerHTML = `
			<button type="button" class="tab${helpSubTab === "about" ? " is-active" : ""}" data-help-tab="about">About</button>
			<button type="button" class="tab${helpSubTab === "definitions" ? " is-active" : ""}" data-help-tab="definitions">Definitions</button>
			<button type="button" class="tab${helpSubTab === "help" ? " is-active" : ""}" data-help-tab="help">Help</button>
			<button type="button" class="tab${helpSubTab === "suppressions" ? " is-active" : ""}" data-help-tab="suppressions">Suppressions</button>`;
	} else {
		tabs.innerHTML = `
			<button type="button" class="tab${activeTab === "general" ? " is-active" : ""}" data-tab="general">General</button>
			<button type="button" class="tab${activeTab === "gears" ? " is-active" : ""}" data-tab="gears">Gears</button>
			<button type="button" class="tab${activeTab === "groups" ? " is-active" : ""}" data-tab="groups">Groups</button>
			<button type="button" class="tab${activeTab === "gauges" ? " is-active" : ""}" data-tab="gauges">Gauges</button>
			<button type="button" class="tab${activeTab === "gizmos" ? " is-active" : ""}" data-tab="gizmos">Gizmos</button>`;
	}
	if (typeof setTranslatedText === "function") {
		const tabTags = {
			general: ["cog-tab-general", "General"],
			gears: ["cog-tab-gears", "Gears"],
			groups: ["cog-tab-groups", "Groups"],
			gauges: ["cog-tab-gauges", "Gauges"],
			gizmos: ["cog-tab-gizmos", "Gizmos"],
			about: ["cog-tab-about", "About"],
			definitions: ["cog-tab-definitions", "Definitions"],
			help: ["cog-tab-help", "Help"],
			suppressions: ["cog-tab-suppressions", "Suppressions"]
		};
		for (const btn of tabs.querySelectorAll(".tab")) {
			const key = btn.dataset.tab || btn.dataset.helpTab;
			const entry = tabTags[key];
			if (entry) {
				setTranslatedText(btn, entry[0], entry[1]);
			}
		}
	}
}

async function renderHelpTab(body) {
	if (helpSubTab === "suppressions") {
		body.innerHTML = "";
		if (typeof renderSuppressionsTab === "function") {
			try {
				renderSuppressionsTab(body);
			} catch (err) {
				if (typeof window.cogReportError === "function") {
					window.cogReportError("renderSuppressionsTab", err);
				}
				const fail = document.createElement("p");
				fail.className = "lede";
				if (typeof setTranslatedText === "function") {
					setTranslatedText(
						fail,
						"cog-suppressions-render-failed",
						"Could not render Suppressions. Check COG.log / the browser console."
					);
				} else {
					fail.textContent =
						"Could not render Suppressions. Check COG.log / the browser console.";
				}
				body.appendChild(fail);
			}
		} else {
			const missing = document.createElement("p");
			missing.className = "lede";
			if (typeof setTranslatedText === "function") {
				setTranslatedText(
					missing,
					"cog-suppressions-script-missing",
					"Suppressions UI script is missing from the deployed view. Redeploy COG (xmake -y) so _Help_Suppressions.js is copied."
				);
			} else {
				missing.textContent =
					"Suppressions UI script is missing from the deployed view. Redeploy COG (xmake -y) so _Help_Suppressions.js is copied.";
			}
			body.appendChild(missing);
		}
		return;
	}
	const pending = document.createElement("p");
	pending.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(pending, "cog-loading", "Loading\u2026");
	} else {
		pending.textContent = "Loading\u2026";
	}
	body.appendChild(pending);
	const docs = await ensureHelpDocs();
	if (!helpMode || !body.isConnected) {
		return;
	}
	body.innerHTML = "";
	if (helpSubTab === "definitions") {
		renderHelpDocument(body, docs.definitions, { exclusiveGroup: "cog-definitions" });
	} else if (helpSubTab === "help") {
		renderHelpDocument(body, docs.help, { exclusiveGroup: "cog-help" });
	} else {
		renderHelpDocument(body, docs.about, { exclusiveGroup: null, docTag: "cog-help-about" });
	}
}

function setHelpMode(on) {
	helpMode = !!on;
	if (helpMode) {
		closeAllEditorPopups();
	}
	syncHelpChrome();
	renderEditor(true);
	renderGears();
}

function bindEditorHelpButton() {
	const el = document.getElementById("editor-help");
	if (!el || el.dataset.bound === "1") {
		return;
	}
	el.dataset.bound = "1";
	el.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		setHelpMode(!helpMode);
	});
}

function renderEditor(force) {
	const body = document.getElementById("tab-body");
	if (!body || !document.body.classList.contains("is-focused")) {
		return;
	}
	const key = currentEditorKey();
	// Never tear down fields while the user is typing (even if general colours changed).
	if (!force && isEditingField()) {
		return;
	}
	if (!force && key === editorKey) {
		if (activeTab === "groups" && pickerRoot) {
			const picker = pickerRoot.querySelector(".group-picker");
			if (picker && !picker.hidden) {
				fillPicker();
			}
		}
		return;
	}
	editorKey = key;
	// Tear down portaled selects/info before wiping wraps (same funnel as setFocused(false)).
	closeAllEditorPopups();
	body.innerHTML = "";
	if (helpMode) {
		renderHelpTab(body);
		if (typeof applyTranslations === "function") {
			applyTranslations(body);
		}
		return;
	}
	if (activeTab === "general") {
		renderGeneral(body);
	} else if (activeTab === "groups") {
		renderGroups(body);
	} else if (activeTab === "gears") {
		renderGearsTab(body);
	} else if (activeTab === "gizmos") {
		renderGizmos(body);
	} else {
		renderGauges(body);
	}
	// Project-wide custom dropdowns (matches Show Celestial Objects / Groups styling).
	enhanceSelects(body);
	if (typeof applyTranslations === "function") {
		applyTranslations(body);
	}
}

document.getElementById("tabs").addEventListener("click", (ev) => {
	const helpBtn = ev.target.closest("[data-help-tab]");
	if (helpBtn) {
		helpSubTab = helpBtn.dataset.helpTab || "about";
		for (const tab of document.querySelectorAll("#tabs .tab")) {
			tab.classList.toggle("is-active", tab === helpBtn);
		}
		closeAllEditorPopups();
		renderEditor(true);
		return;
	}
	const btn = ev.target.closest(".tab[data-tab]");
	if (!btn) {
		return;
	}
	helpMode = false;
	activeTab = btn.dataset.tab || "general";
	syncHelpChrome();
	closeAllEditorPopups();
	renderEditor(true);
	renderGears();
});

document.addEventListener("pointerdown", (ev) => {
	const t = ev.target;
	if (
		t.closest(".cog-color-picker") ||
		t.closest(".color-swatch") ||
		t.closest(".cog-icon-picker") ||
		t.closest(".icon-swatch") ||
		t.closest(".cog-select") ||
		t.closest(".cog-select-menu") ||
		t.closest(".info-tip") ||
		t.closest(".info-tip-panel") ||
		t.closest(".clock-token-popover") ||
		t.closest(".clock-line-btn") ||
		// Groups-tab Add gear picker only (not Edit Gears). pointerdown must not clear
		// pickerGroupId before the list item's mousedown runs addGear(src, groupId).
		(t.closest(".group-picker") && !t.closest(".gear-edit-picker"))
	) {
		return;
	}
	closeAllEditorPopups();
});

window.addEventListener("resize", () => {
	repositionOpenEditorPopups();
	placeHoverTip();
});

document.addEventListener(
	"scroll",
	(ev) => {
		const t = ev.target;
		if (t === document.getElementById("tab-body") || (t && t.id === "tab-body")) {
			repositionOpenEditorPopups();
		}
	},
	true
);

document.addEventListener("keydown", (ev) => {
	if (ev.key !== "Escape") {
		return;
	}
	if (editorPopupRegistry.size > 0 || colorPickerState || iconPickerState) {
		ev.preventDefault();
		closeAllEditorPopups();
	}
});

const SKIP_BIND_CODES = new Set([
	"ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
	"AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock", "Tab"
]);

const EVENT_CODE_KEYS = {
	Space: "Space",
	Enter: "Enter",
	Backspace: "Backspace",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Backquote: "`",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Insert: "Insert",
	Delete: "Delete",
	Home: "Home",
	End: "End",
	PageUp: "PageUp",
	PageDown: "PageDown",
	ArrowUp: "Up",
	ArrowDown: "Down",
	ArrowLeft: "Left",
	ArrowRight: "Right",
	NumLock: "NumLock",
	ScrollLock: "ScrollLock"
};

function eventToKeyName(ev) {
	const code = ev.code || "";
	if (SKIP_BIND_CODES.has(code)) {
		return "";
	}
	if (code.startsWith("Key") && /^Key[A-Z]$/.test(code)) {
		return code.slice(3);
	}
	if (code.startsWith("Digit") && /^Digit[0-9]$/.test(code)) {
		return code.slice(5);
	}
	if (/^F([1-9]|1[0-2])$/.test(code)) {
		return code;
	}
	if (code.startsWith("Numpad")) {
		const rest = code.slice(6);
		const mapped = { Add: "Num+", Subtract: "Num-", Multiply: "Num*", Divide: "Num/", Decimal: "Num.", Enter: "NumEnter" };
		if (mapped[rest]) {
			return mapped[rest];
		}
		if (/^[0-9]$/.test(rest)) {
			return `Num${rest}`;
		}
	}
	if (EVENT_CODE_KEYS[code]) {
		return EVENT_CODE_KEYS[code];
	}
	const key = ev.key || "";
	if (key === "Escape" || key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
		return "";
	}
	if (/^F([1-9]|1[0-2])$/.test(key)) {
		return key;
	}
	if (key.length === 1 && /[a-zA-Z]/.test(key)) {
		return key.toUpperCase();
	}
	if (key.length === 1 && /[0-9]/.test(key)) {
		return key;
	}
	const codeNo = ev.keyCode || ev.which || 0;
	if (codeNo >= 112 && codeNo <= 123) {
		return `F${codeNo - 111}`;
	}
	if (codeNo >= 65 && codeNo <= 90) {
		return String.fromCharCode(codeNo);
	}
	if (codeNo >= 48 && codeNo <= 57) {
		return String.fromCharCode(codeNo);
	}
	return "";
}

window.setEditorKeyName = (name) => {
	const next = String(name || "").trim();
	if (next) {
		snapshot.general.editorKey = next;
	}
	rebindListening = false;
	rebindArmedAt = 0;
	updateKeybindHint();
};

window.cancelEditorRebind = () => {
	rebindListening = false;
	rebindArmedAt = 0;
	updateKeybindHint();
};

window.setHideToggleKeyName = (name) => {
	const next = String(name || "").trim();
	if (!snapshot.general) {
		snapshot.general = {};
	}
	snapshot.general.hideToggleKey = next;
	window.__cogHideKeyListening = false;
	if (activeTab === "general") {
		renderEditor(false);
	}
};

window.cancelHideKeyRebind = () => {
	window.__cogHideKeyListening = false;
	if (activeTab === "general") {
		renderEditor(false);
	}
};

function updateKeybindHint() {
	const el = document.getElementById("editor-keybind");
	if (!el) {
		return;
	}
	const key = editorKeyName();
	// Visible label is "{key} closes". Hover tip explains rebind (Prisma ignores title=).
	let tip;
	if (rebindListening) {
		const label =
			typeof t === "function" ? t("cog-editor-key-listening-label", "\u2026 closes") : "\u2026 closes";
		tip =
			typeof t === "function"
				? t("cog-editor-key-listening", "Press a new key\u2026 (click to cancel)")
				: "Press a new key\u2026 (click to cancel)";
		el.removeAttribute("data-translation");
		el.removeAttribute("data-translation-fallback");
		el.removeAttribute("data-translation-vars");
		el.textContent = label;
		if (typeof setTranslatedAriaLabel === "function") {
			setTranslatedAriaLabel(
				el,
				"cog-editor-key-listening-aria",
				"Listening for a new editor key. Click to cancel."
			);
		} else {
			el.setAttribute("aria-label", "Listening for a new editor key. Click to cancel.");
		}
	} else {
		tip =
			typeof t === "function"
				? t("cog-editor-key-rebind-tip", "Click to rebind the editor key")
				: "Click to rebind the editor key";
		if (typeof setTranslatedText === "function") {
			setTranslatedText(el, "cog-editor-key-closes", "{key} closes", { key });
		} else {
			el.textContent = `${key} closes`;
		}
		if (typeof setTranslatedAriaLabel === "function") {
			setTranslatedAriaLabel(el, "cog-editor-key-closes-aria", "Editor key {key}. Click to rebind.", {
				key
			});
		} else {
			el.setAttribute("aria-label", `Editor key ${key}. Click to rebind.`);
		}
	}
	el.classList.toggle("is-listening", rebindListening);
	el.removeAttribute("title");
	el.dataset.tip = tip;
	if (hoverTipAnchor === el) {
		showHoverTip(el, tip);
	}
}
window.updateKeybindHint = updateKeybindHint;

function setRebindListening(on) {
	const next = !!on;
	if (rebindListening === next) {
		updateKeybindHint();
		return;
	}
	rebindListening = next;
	rebindArmedAt = next ? Date.now() : 0;
	updateKeybindHint();
	// Defer native capture until after the pointer event finishes.
	const msg = next ? "rebindStart" : "rebindCancel";
	setTimeout(() => {
		if (rebindListening !== next) {
			return;
		}
		if (typeof window.cogToSKSE === "function") {
			window.cogToSKSE(msg);
		}
	}, 0);
}

function bindEditorKeyHint() {
	const el = document.getElementById("editor-keybind");
	if (!el || el.dataset.bound === "1") {
		return;
	}
	el.dataset.bound = "1";
	let pressPointerId = null;
	el.addEventListener("pointerdown", (ev) => {
		if (ev.button !== 0) {
			return;
		}
		pressPointerId = ev.pointerId;
		ev.stopPropagation();
	});
	el.addEventListener("pointerup", (ev) => {
		if (ev.button !== 0 || pressPointerId !== ev.pointerId) {
			return;
		}
		pressPointerId = null;
		ev.preventDefault();
		ev.stopPropagation();
		setRebindListening(!rebindListening);
	});
	el.addEventListener("pointercancel", () => {
		pressPointerId = null;
	});
	el.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter" || ev.key === " ") {
			ev.preventDefault();
			ev.stopPropagation();
			setRebindListening(!rebindListening);
		}
	});
	updateKeybindHint();
}

document.addEventListener("keydown", (ev) => {
	if (!rebindListening) {
		return;
	}
	ev.preventDefault();
	ev.stopPropagation();
	if (ev.key === "Escape") {
		setRebindListening(false);
		return;
	}
	if (Date.now() - rebindArmedAt < REBIND_ARM_MS) {
		return;
	}
	const name = eventToKeyName(ev);
	if (!name) {
		return;
	}
	snapshot.general.editorKey = name;
	rebindListening = false;
	rebindArmedAt = 0;
	updateKeybindHint();
	if (typeof window.cogToSKSE === "function") {
		window.cogToSKSE("editorKey:" + name);
	}
	scheduleSave(true);
}, true);

/** Called from _Core.js after all section scripts have loaded. */
function bootEditorChrome() {
	bindEditorHelpButton();
	bindEditorKeyHint();
	applyTheme();
}
