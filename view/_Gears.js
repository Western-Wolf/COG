// COG overlay - Gears shell (shared titles / inventory mod id)
// Classic script; load after _Gears_Paint, before Live / Editor.
// Paint / Live / Editor own the bulk.

const INVENTORY_GEAR_MOD = "COG.Inventory";

function titleCaseLabel(text) {
	return String(text || "—").replace(/(^|[\s\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function sourceTitle(src, fallback, gear) {
	const look = appearanceOf(gear, src);
	// Prefer a candidate that exists in the name: catalog (case-insensitive). Live
	// registration displayName is first; defaults/settings may be case-drifted
	// ("stamina") or already localized; gear.varName covers Health/Stamina/Magicka when
	// displayName is missing (not CarryWeight — that needs "Carry Weight").
	const candidates = [
		src && (src.displayName || src.display),
		gear && gear.defaults && gear.defaults.displayName,
		look && look.displayName,
		src && src.varName,
		gear && gear.varName,
		fallback
	];
	let englishKey = "";
	if (typeof hasStockNameKey === "function") {
		for (const candidate of candidates) {
			const key = String(candidate || "").trim();
			if (key && hasStockNameKey(key)) {
				englishKey = key;
				break;
			}
		}
	}
	if (!englishKey) {
		for (const candidate of candidates) {
			const key = String(candidate || "").trim();
			if (key) {
				englishKey = key;
				break;
			}
		}
	}
	let display = look.displayName || "";
	if (typeof resolveStockDisplayName === "function" && englishKey) {
		display = resolveStockDisplayName(display || englishKey, englishKey, {
			defaultsDisplayName:
				(gear && gear.defaults && gear.defaults.displayName) || englishKey
		});
	}
	if (display) {
		return titleCaseLabel(display);
	}
	if (src && src.varName) {
		return titleCaseLabel(src.varName);
	}
	return titleCaseLabel(fallback || "—");
}

/** Fingerprint slice so HUD rebuilds when language or resolved label changes. */
function gearTitleSig(src, gear) {
	const lang =
		(typeof snapshot !== "undefined" && snapshot.general && snapshot.general.language) || "";
	return `${lang}|${sourceTitle(src, gear && gear.varName, gear)}`;
}
