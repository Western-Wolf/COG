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
/** @type {Map<string, string>} lowercase path -> catalog casing */
let iconCanonicalByPath = new Map();
/** @type {Set<string>} lowercase paths known to live under assets/imports/icons/ */
let importedIconPathSet = new Set();
/**
 * Migration Code for Transition from v1.11 or earlier to v1.2:
 * One-shot per HUD session once the icon catalog is known — remaps are written
 * into the snapshot, then never re-run on resolve/paint.
 */
let iconPathMigration12Done = false;

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

/** True when `rel` is listed in the live icon catalog (case-insensitive). */
function iconExistsInCatalog(rel) {
	const key = String(rel || "")
		.replace(/\\/g, "/")
		.toLowerCase();
	return !!key && iconRootByPath.has(key);
}

/** Prefer catalog casing for a known path (O(1) via rebuildIconRootMap). */
function catalogCanonicalPath(rel) {
	const key = String(rel || "")
		.replace(/\\/g, "/")
		.toLowerCase();
	if (!key) {
		return "";
	}
	return iconCanonicalByPath.get(key) || String(rel || "").replace(/\\/g, "/");
}

/**
 * Migration Code for Transition from v1.11 or earlier to v1.2 (one-shot only):
 * Undo Pictures/Artwork/<file> → Pictures/<file>, and
 * Pictures/Quest Art/<file> → Endcaps/Quest Art/<file>.
 * Missing paths with no equivalent stay as-is (display uses normal cog fallback).
 * Do not call from resolve/paint — only from migrateLegacyIconPathsInSnapshot.
 */
function remapLegacyIconPath(rel) {
	const path = String(rel || "").replace(/\\/g, "/");
	if (!path) {
		return "";
	}
	if (iconExistsInCatalog(path)) {
		return catalogCanonicalPath(path);
	}
	let candidate = "";
	const artwork = /^Pictures\/Artwork\/([^/]+)$/i.exec(path);
	if (artwork) {
		candidate = `Pictures/${artwork[1]}`;
	} else {
		const quest =
			/^Pictures\/(?:Artwork\/)?Quest Art\/([^/]+)$/i.exec(path) ||
			/^Pictures\/QuestArt\/([^/]+)$/i.exec(path);
		if (quest) {
			candidate = `Endcaps/Quest Art/${quest[1]}`;
		}
	}
	if (!candidate || !iconExistsInCatalog(candidate)) {
		return path;
	}
	const next = catalogCanonicalPath(candidate);
	if (typeof noteMigration12If === "function") {
		noteMigration12If(path !== next, `icon ${path} → ${next}`);
	} else if (typeof cogConfigNote === "function" && path !== next) {
		cogConfigNote(
			`Migration Code for Transition from v1.11 or earlier to v1.2: icon ${path} → ${next}`
		);
	}
	return next;
}

/** @deprecated Use remapLegacyIconPath (migration only). */
function migrateLegacyIconPath(rel) {
	return remapLegacyIconPath(rel);
}

/** @deprecated Use remapLegacyIconPath (migration only). */
function migratePictureIconPath(rel) {
	return remapLegacyIconPath(rel);
}

/** Clean a single icon asset path (rejects empty / traversal / .json pack leftovers). No remaps. */
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
			pct = Math.max(0, pct);
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

/** Drop icon stops with pct > 100 — percent/timer must not pick post-100 frames. */
function truncateIconRampAt100(stopsOrRaw) {
	const stops = Array.isArray(stopsOrRaw) ? parseIconRamp(stopsOrRaw) : parseIconRamp(stopsOrRaw);
	return stops.filter((s) => s.pct <= 100 + 1e-9);
}

/** Active icon path = last stop whose pct ≤ axis value (holds past last stop). */
function pickIconRampFrame(stopsOrRaw, axisValue) {
	const stops = Array.isArray(stopsOrRaw) ? parseIconRamp(stopsOrRaw) : parseIconRamp(stopsOrRaw);
	if (!stops.length) {
		return "";
	}
	const pct = Math.max(0, Number(axisValue) || 0);
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
	const axis =
		typeof meterAxis === "function"
			? meterAxis(src)
			: typeof barPercent === "function"
				? barPercent(src)
				: Math.max(0, Math.min(100, Number(src && src.value) || 0));
	const stops =
		typeof usesRatio === "function" && usesRatio(src) ? truncateIconRampAt100(raw) : parseIconRamp(raw);
	return pickIconRampFrame(stops, axis);
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
	iconCanonicalByPath = new Map();
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
		const path = String(item.path).replace(/\\/g, "/");
		const key = path.toLowerCase();
		const root = String(item.root || "icons");
		iconRootByPath.set(key, root);
		iconCanonicalByPath.set(key, path);
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
			iconCanonicalByPath.set(key, path);
		}
	}
}

/**
 * Migration Code for Transition from v1.11 or earlier to v1.2 (one-shot only):
 * Rewrite one stored icon field (plain path or icon ramp JSON).
 */
function migrateStoredIconField(raw) {
	if (raw == null || raw === "") {
		return raw;
	}
	const stops = parseIconRamp(raw);
	if (!stops.length) {
		return remapLegacyIconPath(normalizeIconAssetPath(raw) || normalizeIconRelPath(raw));
	}
	const migrated = stops.map((s) => ({
		pct: s.pct,
		path: remapLegacyIconPath(s.path)
	}));
	return formatIconRamp(migrated) || migrated[0].path;
}

/**
 * v1.1 (and early v1.2) flat Endcaps/<file> → nested Shapes/Knots paths.
 * Only applied when the old path is missing from the catalog (migration only).
 */
const ENDCAP_PATH_ALIASES = {
	"endcaps/knot.svg": "Endcaps/Knots/trinity-knot.svg",
	"endcaps/triangle.svg": "Endcaps/Shapes/triangle.svg",
	"endcaps/circle-half.svg": "Endcaps/Shapes/circle-half.svg",
	"endcaps/arrow.svg": "Endcaps/Knots/vanilla-map-arrow.svg",
	"endcaps/compass.svg": "Endcaps/Knots/vanilla-compass.svg"
};

/** Cheap structural normalize for Endcaps/ paths (safe on paint/resolve). No remaps. */
function normalizeEndCapPath(raw) {
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

/**
 * Migration Code for Transition from v1.11 or earlier to v1.2 (one-shot only):
 * Remap flat / legacy endcap paths after normalizeEndCapPath.
 */
function remapLegacyEndCapPath(raw) {
	let rel = normalizeEndCapPath(raw);
	if (!rel) {
		return "";
	}
	if (/^Pictures\//i.test(rel)) {
		rel = remapLegacyIconPath(rel);
	}
	if (iconExistsInCatalog(rel)) {
		return catalogCanonicalPath(rel);
	}
	const alias = ENDCAP_PATH_ALIASES[rel.toLowerCase()];
	if (alias && iconExistsInCatalog(alias)) {
		const next = catalogCanonicalPath(alias);
		if (typeof noteMigration12If === "function") {
			noteMigration12If(rel !== next, `endcap ${rel} → ${next}`);
		} else if (typeof cogConfigNote === "function" && rel !== next) {
			cogConfigNote(
				`Migration Code for Transition from v1.11 or earlier to v1.2: endcap ${rel} → ${next}`
			);
		}
		return next;
	}
	const flat = /^Endcaps\/([^/]+)$/i.exec(rel);
	if (flat) {
		const file = flat[1];
		for (const folder of ["Shapes", "Knots", "Quest Art"]) {
			const candidate = `Endcaps/${folder}/${file}`;
			if (iconExistsInCatalog(candidate)) {
				const next = catalogCanonicalPath(candidate);
				if (typeof noteMigration12If === "function") {
					noteMigration12If(true, `endcap ${rel} → ${next}`);
				} else if (typeof cogConfigNote === "function") {
					cogConfigNote(
						`Migration Code for Transition from v1.11 or earlier to v1.2: endcap ${rel} → ${next}`
					);
				}
				return next;
			}
		}
	}
	return rel;
}

/**
 * Hot-path endcap path cleaner (prefix / extension only).
 * Legacy remaps run once via migrateLegacyIconPathsInSnapshot → remapLegacyEndCapPath.
 */
function migrateEndCapPath(raw) {
	return normalizeEndCapPath(raw);
}

/**
 * Migration Code for Transition from v1.11 or earlier to v1.2:
 * One-shot after the icon catalog is known — rewrite moved icon / endcap paths
 * into the snapshot (Artwork undo, Quest Art → Endcaps, flat Endcaps → Shapes/Knots).
 */
function migrateLegacyIconPathsInSnapshot() {
	if (typeof snapshot === "undefined" || !snapshot) {
		return;
	}
	if (iconPathMigration12Done) {
		return;
	}
	if (!iconRootByPath.size) {
		return;
	}
	for (const src of snapshot.sources || []) {
		if (!src || !src.icon) {
			continue;
		}
		src.icon = migrateStoredIconField(src.icon);
	}
	for (const gear of snapshot.gears || []) {
		if (!gear) {
			continue;
		}
		if (gear.defaults && gear.defaults.icon) {
			gear.defaults.icon = migrateStoredIconField(gear.defaults.icon);
		}
		if (gear.settings && gear.settings.icon) {
			gear.settings.icon = migrateStoredIconField(gear.settings.icon);
		}
	}
	for (const gauge of snapshot.gauges || []) {
		const bag = gauge && gauge.settings;
		if (!bag) {
			continue;
		}
		if (bag.pictureIcon) {
			const cleaned = normalizeIconAssetPath(bag.pictureIcon) || String(bag.pictureIcon || "").trim();
			const next = remapLegacyIconPath(cleaned);
			if (next) {
				bag.pictureIcon = next;
			}
		}
		if (bag.endCap) {
			const next = remapLegacyEndCapPath(bag.endCap);
			if (next) {
				bag.endCap = next;
			}
		}
	}
	for (const z of snapshot.gizmos || []) {
		const s = z && z.settings;
		if (!s || typeof s !== "object") {
			continue;
		}
		if (s.endCap) {
			const next = remapLegacyEndCapPath(s.endCap);
			if (next) {
				s.endCap = next;
			}
		}
		for (const key of Object.keys(s)) {
			if (!/icon/i.test(key) || typeof s[key] !== "string") {
				continue;
			}
			const raw = String(s[key]).replace(/\\/g, "/");
			if (!/^(Pictures|Endcaps)\//i.test(raw)) {
				continue;
			}
			const cleaned = normalizeIconAssetPath(s[key]) || normalizeIconRelPath(s[key]);
			const next = /^Endcaps\//i.test(cleaned)
				? remapLegacyEndCapPath(cleaned)
				: remapLegacyIconPath(cleaned);
			if (next) {
				s[key] = next;
			}
		}
	}
	iconPathMigration12Done = true;
}

/** @deprecated Use migrateLegacyIconPathsInSnapshot. */
function migratePictureIconPathsInSnapshot() {
	return migrateLegacyIconPathsInSnapshot();
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
 * Same chrome as colour ramps; assets switch at axis values (no fade).
 * @param {{ axis?: "percent"|"count" }} [options] count = unbounded number fields (no % / no 100 cap).
 */
function makeIconRampEditor(label, value, fallbackPath, onCommit, options) {
	const axis = options && options.axis === "count" ? "count" : "percent";
	const isCountAxis = axis === "count";
	const wrap = document.createElement("div");
	wrap.className = "color-ramp-editor icon-ramp-editor";
	wrap.dataset.rampAxis = axis;
	const heading = document.createElement("div");
	heading.className = "color-ramp-heading";
	heading.textContent = label;
	wrap.appendChild(heading);
	const hint = document.createElement("p");
	hint.className = "lede color-ramp-hint";
	if (typeof setTranslatedText === "function") {
		if (isCountAxis) {
			setTranslatedText(
				hint,
				"cog-icon-ramp-hint-count",
				"Each stop switches the icon at that value. Icons do not fade between stops. Counts may go past 100."
			);
		} else {
			setTranslatedText(
				hint,
				"cog-icon-ramp-hint",
				"Each stop switches the icon at that percentage. Icons do not fade between stops."
			);
		}
	} else {
		hint.textContent = isCountAxis
			? "Each stop switches the icon at that value. Icons do not fade between stops. Counts may go past 100."
			: "Each stop switches the icon at that percentage. Icons do not fade between stops.";
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

	const clampAxis = (n) => {
		if (!Number.isFinite(n)) {
			return 0;
		}
		n = Math.max(0, n);
		return isCountAxis ? n : quantizePct(Math.min(100, n));
	};
	const formatAxis = (n) => (isCountAxis ? String(n) : fmtPct(n));

	const hasHundredStop = () => !isCountAxis && stops.some((s) => s.pct >= 100 - 1e-9);
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
		const nextPct = stops.length
			? isCountAxis
				? lastPct + 10
				: Math.min(100, lastPct + 10)
			: 0;
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
			pctInput.value = formatAxis(stop.pct);
			if (typeof setTranslatedAriaLabel === "function") {
				if (isCountAxis) {
					setTranslatedAriaLabel(pctInput, "cog-ramp-value", "Value");
				} else {
					setTranslatedAriaLabel(pctInput, "cog-percentage", "Percentage");
				}
			} else {
				pctInput.setAttribute("aria-label", isCountAxis ? "Value" : "Percentage");
			}
			pctInput.addEventListener("input", () => {
				let n = Number(pctInput.value);
				if (!Number.isFinite(n)) {
					return;
				}
				n = clampAxis(n);
				stops[index] = { ...stops[index], pct: n };
				syncAddBtn();
				emit(true);
			});
			pctInput.addEventListener("change", () => {
				let n = Number(pctInput.value);
				n = clampAxis(n);
				pctInput.value = formatAxis(n);
				stops[index] = { ...stops[index], pct: n };
				stops = parseIconRamp(stops);
				emit(false);
				rebuild();
			});
			pctLab.appendChild(pctInput);
			if (!isCountAxis) {
				wrapInputAffix(pctInput, { suffix: "%" });
			}
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

/**
 * Icon picker folder tree: at most MAX_ICON_ACCORDION_DEPTH accordion levels from
 * catalog root (assets/icons/). Deeper path segments flatten into the depth-3 node
 * as direct icon swatches (full path preserved for selection).
 * Example: 1/2/3/4/5/icon.svg → accordions 1 → 2 → 3, then swatch icon.svg.
 */
const MAX_ICON_ACCORDION_DEPTH = 3;

/** Normalize a folder lock / prefix under assets/icons/ (any depth). */
function normalizeIconFolderPrefix(folder) {
	return String(folder || "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

/** True when path is inside folder (folder-boundary prefix; Map does not match Mapper/…). */
function iconPathUnderFolder(path, folder) {
	const prefix = normalizeIconFolderPrefix(folder).toLowerCase();
	if (!prefix) {
		return true;
	}
	const lower = String(path || "")
		.replace(/\\/g, "/")
		.toLowerCase();
	return lower.startsWith(prefix + "/");
}

/** Icons under a folder prefix of any depth (e.g. "Frames", "Map/Cities"). */
function iconsInFolder(folder) {
	const name = normalizeIconFolderPrefix(folder);
	if (!name) {
		return iconCatalog();
	}
	return iconCatalog().filter((entry) => iconPathUnderFolder(entry.path, name));
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

function titleCaseFolderName(segment) {
	return String(segment || "")
		.replace(/[-_]+/g, " ")
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

function iconFolderLabel(name, count) {
	return `${titleCaseFolderName(name)} (${count})`;
}

function makeIconFolderNode(name, catalogDepth) {
	return {
		name: String(name || ""),
		catalogDepth: catalogDepth | 0,
		children: new Map(),
		icons: [],
		count: 0
	};
}

function insertIconUnderFolder(parent, folderSegs, fullPath, parentDepth) {
	let node = parent;
	for (let i = 0; i < folderSegs.length; i++) {
		const depth = parentDepth + i + 1;
		if (depth > MAX_ICON_ACCORDION_DEPTH) {
			node.icons.push(fullPath);
			return;
		}
		const seg = folderSegs[i];
		const key = String(seg).toLowerCase();
		if (!node.children.has(key)) {
			node.children.set(key, makeIconFolderNode(seg, depth));
		}
		node = node.children.get(key);
	}
	node.icons.push(fullPath);
}

function finalizeIconFolderNode(node) {
	let n = node.icons.length;
	for (const child of node.children.values()) {
		n += finalizeIconFolderNode(child);
	}
	node.count = n;
	return n;
}

function sortIconFolderNodes(nodes) {
	return nodes.slice().sort((a, b) => {
		if (a.name === "General") {
			return -1;
		}
		if (b.name === "General") {
			return 1;
		}
		return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
	});
}

/**
 * Build accordion forest from icon paths.
 * @param {string[]} paths
 * @param {{ lockPrefix?: string }} [opts] If lockPrefix is set, forest is a single root
 *   at that folder (any depth); depth budget still counts from catalog root.
 */
function buildIconFolderTree(paths, opts) {
	const lockPrefix = normalizeIconFolderPrefix(opts && opts.lockPrefix);
	const forest = new Map();

	const ensureGeneral = () => {
		if (!forest.has("__general__")) {
			forest.set("__general__", makeIconFolderNode("General", 1));
		}
		return forest.get("__general__");
	};

	for (const raw of paths || []) {
		const path = String(raw || "").replace(/\\/g, "/");
		if (!path) {
			continue;
		}
		if (lockPrefix) {
			if (!iconPathUnderFolder(path, lockPrefix)) {
				continue;
			}
			const lockParts = lockPrefix.split("/").filter(Boolean);
			const lockDepth = lockParts.length;
			const lockName = lockParts[lockParts.length - 1];
			const rootKey = lockPrefix.toLowerCase();
			if (!forest.has(rootKey)) {
				forest.set(rootKey, makeIconFolderNode(lockName, lockDepth));
			}
			const root = forest.get(rootKey);
			const rest = path.slice(lockPrefix.length + 1);
			const restParts = rest.split("/").filter(Boolean);
			if (restParts.length <= 1) {
				root.icons.push(path);
				continue;
			}
			insertIconUnderFolder(root, restParts.slice(0, -1), path, lockDepth);
			continue;
		}
		const parts = path.split("/").filter(Boolean);
		if (parts.length === 1) {
			ensureGeneral().icons.push(path);
			continue;
		}
		const first = parts[0];
		const key = first.toLowerCase();
		if (!forest.has(key)) {
			forest.set(key, makeIconFolderNode(first, 1));
		}
		if (parts.length === 2) {
			forest.get(key).icons.push(path);
			continue;
		}
		insertIconUnderFolder(forest.get(key), parts.slice(1, -1), path, 1);
	}

	const roots = [...forest.values()].filter((node) => finalizeIconFolderNode(node) > 0);
	return sortIconFolderNodes(roots);
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

function appendIconPickerGrid(parent, paths, resolvePathHref, selectedValue, onPick) {
	const list = (paths || []).slice().sort(compareIconPaths);
	if (!list.length) {
		return;
	}
	const grid = document.createElement("div");
	grid.className = "cip-grid";
	for (const path of list) {
		const cell = document.createElement("button");
		cell.type = "button";
		cell.className = "icon-swatch" + (path === selectedValue ? " is-selected" : "");
		setIconButtonTip(cell, iconDisplayName(path) || path);
		const img = document.createElement("img");
		img.src = resolvePathHref(path);
		img.alt = "";
		const animated =
			typeof iconHrefIsAnimated === "function"
				? iconHrefIsAnimated(img.src)
				: /\.(gif|webp)(\?|#|$)/i.test(img.src);
		cell.classList.toggle("is-raster-preview", !!animated);
		cell.appendChild(img);
		cell.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			if (typeof onPick === "function") {
				onPick(path);
			}
		});
		grid.appendChild(cell);
	}
	parent.appendChild(grid);
}

function renderIconFolderNode(parent, node, renderOpts) {
	if (!node || !node.count) {
		return;
	}
	const details = document.createElement("details");
	details.className = "accordion cip-acc" + (node.catalogDepth > 1 ? " nested-acc" : "");
	if (renderOpts && renderOpts.open) {
		details.open = true;
	}
	const summary = document.createElement("summary");
	summary.textContent = iconFolderLabel(node.name, node.count);
	details.appendChild(summary);
	const body = document.createElement("div");
	body.className = "accordion-body";
	const children = sortIconFolderNodes([...node.children.values()]);
	for (const child of children) {
		renderIconFolderNode(body, child, { ...renderOpts, open: false });
	}
	if (typeof bindExclusiveAccordionSiblings === "function") {
		bindExclusiveAccordionSiblings(body);
	}
	appendIconPickerGrid(
		body,
		node.icons,
		renderOpts.resolvePathHref,
		renderOpts.selectedValue,
		renderOpts.onPick
	);
	details.appendChild(body);
	parent.appendChild(details);
}

function renderIconFolderForest(parent, nodes, renderOpts) {
	const list = sortIconFolderNodes(nodes || []).filter((node) => node && node.count > 0);
	for (const node of list) {
		renderIconFolderNode(parent, node, {
			...renderOpts,
			open: !!(renderOpts && renderOpts.openRoot)
		});
	}
	if (typeof bindExclusiveAccordionSiblings === "function") {
		bindExclusiveAccordionSiblings(parent);
	}
	return list.length > 0;
}

function openIconPicker(anchor, opts) {
	beginEditorPopup("icon");
	const paint = () => {
		if (iconPickerState) {
			return;
		}
		const pop = document.createElement("div");
		pop.className = "cog-icon-picker";
		// folder locks the drawer to any assets/icons/… prefix (e.g. Frames, Map/Cities).
		const lockedFolder = normalizeIconFolderPrefix(
			opts.folder || opts.section || opts.filterToSection || ""
		);
		const isFolderLocked = !!lockedFolder;
		const resolvePathHref = (path) =>
			/^Endcaps\//i.test(path) || /^Endcaps$/i.test(lockedFolder)
				? resolveEndcapHref(path)
				: resolveIconHref(path);
		const onPick = (path) => {
			if (typeof opts.onChange === "function") {
				opts.onChange(path);
			}
			closeIconPicker();
		};
		const renderOpts = {
			resolvePathHref,
			selectedValue: opts.value,
			onPick,
			openRoot: isFolderLocked
		};

		const primaryPaths = isFolderLocked
			? iconsInFolder(lockedFolder).map((entry) => entry.path)
			: iconCatalog().map((entry) => entry.path);
		const primaryTree = buildIconFolderTree(primaryPaths, {
			lockPrefix: isFolderLocked ? lockedFolder : ""
		});

		const body = document.createElement("div");
		body.className = "cip-body";
		const hasPrimary = renderIconFolderForest(body, primaryTree, renderOpts);
		if (!hasPrimary) {
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
					const primarySet = new Set(primaryPaths);
					const otherPaths = iconCatalog()
						.map((entry) => entry.path)
						.filter((path) => path && !primarySet.has(path));
					const extrasTree = buildIconFolderTree(otherPaths, {});
					const filled = renderIconFolderForest(extrasHost, extrasTree, {
						...renderOpts,
						openRoot: false
					});
					if (!filled) {
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
	const folder = normalizeIconFolderPrefix(opts.folder || opts.section || "");
	const isEndcap = /^Endcaps$/i.test(folder);
	const isFolderLocked = !!folder;
	const resolveHref = isEndcap ? resolveEndcapHref : resolveIconHref;
	const field = document.createElement("div");
	field.className = "icon-field";
	// Compact named swatch (end art / folder-locked pickers). folder may be any depth under assets/icons/.
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

