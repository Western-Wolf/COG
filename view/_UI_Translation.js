// COG editor UI translations — catalogs from C++ snapshot; hardcoded English is the ultimate fallback.
(function (global) {
	"use strict";

	const FALLBACK_LANG = "en-CA";

	function selectedLanguage() {
		const lang = global.snapshot && global.snapshot.general && global.snapshot.general.language;
		return lang && String(lang).trim() ? String(lang).trim() : FALLBACK_LANG;
	}

	function highlightMissing() {
		return !!(global.snapshot && global.snapshot.general && global.snapshot.general.highlightMissingTranslations);
	}

	function catalogFor(typeId) {
		const snap = global.snapshot || {};
		if (typeId && snap.gizmoTranslations && snap.gizmoTranslations[typeId]) {
			return snap.gizmoTranslations[typeId];
		}
		return null;
	}

	function lookupRaw(tag, typeId) {
		const key = String(tag || "");
		if (!key) {
			return null;
		}
		const lang = selectedLanguage();
		const gizmoCat = catalogFor(typeId);
		if (gizmoCat && gizmoCat[key] && gizmoCat[key][lang] != null && gizmoCat[key][lang] !== "") {
			return String(gizmoCat[key][lang]);
		}
		const globalCat = (global.snapshot && global.snapshot.translations) || null;
		if (globalCat && globalCat[key] && globalCat[key][lang] != null && globalCat[key][lang] !== "") {
			return String(globalCat[key][lang]);
		}
		return null;
	}

	/** @returns {{ text: string, missing: boolean }} */
	function resolve(tag, fallback, typeId) {
		const fb = fallback == null ? "" : String(fallback);
		const hit = lookupRaw(tag, typeId);
		if (hit != null) {
			return { text: hit, missing: false };
		}
		return { text: fb, missing: true };
	}

	function formatVars(template, vars) {
		let out = String(template == null ? "" : template);
		if (!vars || typeof vars !== "object") {
			return out;
		}
		out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, name) => {
			if (Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null) {
				return String(vars[name]);
			}
			return m;
		});
		return out;
	}

	function t(tag, fallback, typeId) {
		return resolve(tag, fallback, typeId).text;
	}

	function tf(tag, fallback, vars, typeId) {
		return formatVars(resolve(tag, fallback, typeId).text, vars);
	}

	function tResult(tag, fallback, typeId) {
		return resolve(tag, fallback, typeId);
	}

	function tfResult(tag, fallback, vars, typeId) {
		const r = resolve(tag, fallback, typeId);
		return { text: formatVars(r.text, vars), missing: r.missing };
	}

	function parseVarsAttr(el, which) {
		const raw = el.getAttribute(which);
		if (!raw) {
			return null;
		}
		try {
			const v = JSON.parse(raw);
			return v && typeof v === "object" ? v : null;
		} catch {
			return null;
		}
	}

	function ensureFallbackBadge(host, missing) {
		const existing = host.querySelector(":scope > .translation-fallback-badge");
		// <option> text feeds custom dropdowns via textContent — never nest a badge there.
		if (host && host.tagName === "OPTION") {
			if (existing) {
				existing.remove();
			}
			host.classList.remove("has-translation-fallback");
			if (highlightMissing() && missing && selectedLanguage() !== FALLBACK_LANG) {
				host.classList.add("has-translation-fallback-attr");
				const tip = tf(
					"cog-missing-translation-title",
					"Missing {missing} — showing {fallback} fallback",
					{ missing: selectedLanguage(), fallback: FALLBACK_LANG }
				);
				if (!host.getAttribute("data-translation-title")) {
					host.title = tip;
				}
			} else {
				host.classList.remove("has-translation-fallback-attr");
			}
			return;
		}
		if (!highlightMissing() || !missing || selectedLanguage() === FALLBACK_LANG) {
			if (existing) {
				existing.remove();
			}
			host.classList.remove("has-translation-fallback");
			return;
		}
		let badge = existing;
		if (!badge) {
			badge = document.createElement("sup");
			badge.className = "translation-fallback-badge";
			host.appendChild(badge);
		}
		badge.textContent = FALLBACK_LANG;
		const titleR = tfResult(
			"cog-missing-translation-title",
			"Missing {missing} — showing {fallback} fallback",
			{ missing: selectedLanguage(), fallback: FALLBACK_LANG }
		);
		badge.title = titleR.text;
		badge.setAttribute("data-translation-title", "cog-missing-translation-title");
		badge.setAttribute(
			"data-translation-title-fallback",
			"Missing {missing} — showing {fallback} fallback"
		);
		badge.setAttribute(
			"data-translation-title-vars",
			JSON.stringify({ missing: selectedLanguage(), fallback: FALLBACK_LANG })
		);
		host.classList.add("has-translation-fallback");
	}

	function applyOneText(el) {
		const tag = el.getAttribute("data-translation");
		if (!tag) {
			return;
		}
		const fallback = el.getAttribute("data-translation-fallback");
		const typeId = el.getAttribute("data-translation-type") || undefined;
		const vars = parseVarsAttr(el, "data-translation-vars");
		const fb = fallback != null ? fallback : el.textContent;
		const r = vars ? tfResult(tag, fb, vars, typeId) : tResult(tag, fb, typeId);
		const badge = el.querySelector(":scope > .translation-fallback-badge");
		if (badge) {
			badge.remove();
		}
		const rich = [...el.children].some((n) => !n.classList.contains("translation-fallback-badge"));
		// Keep authored HTML (help <strong>/<code>) when showing the English fallback.
		if (rich && (r.missing || selectedLanguage() === FALLBACK_LANG)) {
			ensureFallbackBadge(el, r.missing && selectedLanguage() !== FALLBACK_LANG);
			return;
		}
		el.textContent = r.text;
		ensureFallbackBadge(el, r.missing);
	}

	function applyOneAttr(el, dataAttr, prop, fallbackAttr, varsAttr) {
		const tag = el.getAttribute(dataAttr);
		if (!tag) {
			return;
		}
		const fallback = el.getAttribute(fallbackAttr);
		const typeId = el.getAttribute("data-translation-type") || undefined;
		const vars = parseVarsAttr(el, varsAttr);
		const fb = fallback != null ? fallback : el.getAttribute(prop) || "";
		const r = vars ? tfResult(tag, fb, vars, typeId) : tResult(tag, fb, typeId);
		el.setAttribute(prop, r.text);
		if (prop === "title" || prop === "aria-label" || prop === "placeholder") {
			// Badge on control for missing attr translations when highlight is on.
			if (highlightMissing() && r.missing && selectedLanguage() !== FALLBACK_LANG) {
				el.classList.add("has-translation-fallback-attr");
				const tip = tf(
					"cog-missing-translation-title",
					"Missing {missing} — showing {fallback} fallback",
					{ missing: selectedLanguage(), fallback: FALLBACK_LANG }
				);
				if (!el.getAttribute("data-translation-title")) {
					el.title = el.title ? `${el.title} (${tip})` : tip;
				}
			} else {
				el.classList.remove("has-translation-fallback-attr");
			}
		}
	}

	function applyTranslations(root) {
		const scope = root || document;
		const nodes = scope.querySelectorAll
			? scope.querySelectorAll(
					"[data-translation], [data-translation-title], [data-translation-placeholder], [data-translation-aria-label], [data-translation-summary]"
				)
			: [];
		for (const el of nodes) {
			if (el.hasAttribute("data-translation")) {
				applyOneText(el);
			}
			if (el.hasAttribute("data-translation-summary")) {
				const summary = el.tagName === "SUMMARY" ? el : el.querySelector(":scope > summary");
				if (summary) {
					const tag = el.getAttribute("data-translation-summary") || summary.getAttribute("data-translation");
					if (tag) {
						if (!summary.hasAttribute("data-translation")) {
							summary.setAttribute("data-translation", tag);
						}
						if (!summary.hasAttribute("data-translation-fallback") && el.hasAttribute("data-translation-summary-fallback")) {
							summary.setAttribute(
								"data-translation-fallback",
								el.getAttribute("data-translation-summary-fallback")
							);
						}
						applyOneText(summary);
					}
				}
			}
			applyOneAttr(el, "data-translation-title", "title", "data-translation-title-fallback", "data-translation-title-vars");
			applyOneAttr(
				el,
				"data-translation-placeholder",
				"placeholder",
				"data-translation-placeholder-fallback",
				"data-translation-placeholder-vars"
			);
			applyOneAttr(
				el,
				"data-translation-aria-label",
				"aria-label",
				"data-translation-aria-label-fallback",
				"data-translation-aria-label-vars"
			);
		}
		syncDocumentLang();
		if (typeof global.updateKeybindHint === "function") {
			global.updateKeybindHint();
		}
	}

	function syncDocumentLang() {
		try {
			document.documentElement.lang = selectedLanguage();
		} catch {
			/* ignore */
		}
	}

	function setTranslatedText(el, tag, fallback, vars, typeId) {
		if (!el) {
			return el;
		}
		// Back-compat: 4th arg may be typeId string (older call sites).
		let v = vars;
		let tid = typeId;
		if (typeof vars === "string" && typeId == null) {
			tid = vars;
			v = undefined;
		}
		el.setAttribute("data-translation", tag);
		el.setAttribute("data-translation-fallback", fallback == null ? "" : String(fallback));
		if (v) {
			el.setAttribute("data-translation-vars", JSON.stringify(v));
		} else {
			el.removeAttribute("data-translation-vars");
		}
		if (tid) {
			el.setAttribute("data-translation-type", tid);
		}
		const r = v ? tfResult(tag, fallback, v, tid) : tResult(tag, fallback, tid);
		el.textContent = r.text;
		ensureFallbackBadge(el, r.missing);
		return el;
	}

	function setTranslatedTitle(el, tag, fallback, vars, typeId) {
		if (!el) {
			return el;
		}
		el.setAttribute("data-translation-title", tag);
		el.setAttribute("data-translation-title-fallback", fallback == null ? "" : String(fallback));
		if (vars) {
			el.setAttribute("data-translation-title-vars", JSON.stringify(vars));
		}
		if (typeId) {
			el.setAttribute("data-translation-type", typeId);
		}
		el.title = vars ? tf(tag, fallback, vars, typeId) : t(tag, fallback, typeId);
		return el;
	}

	function setTranslatedPlaceholder(el, tag, fallback, typeId) {
		if (!el) {
			return el;
		}
		el.setAttribute("data-translation-placeholder", tag);
		el.setAttribute("data-translation-placeholder-fallback", fallback == null ? "" : String(fallback));
		if (typeId) {
			el.setAttribute("data-translation-type", typeId);
		}
		el.placeholder = t(tag, fallback, typeId);
		return el;
	}

	function setTranslatedAriaLabel(el, tag, fallback, vars, typeId) {
		if (!el) {
			return el;
		}
		el.setAttribute("data-translation-aria-label", tag);
		el.setAttribute("data-translation-aria-label-fallback", fallback == null ? "" : String(fallback));
		if (vars) {
			el.setAttribute("data-translation-aria-label-vars", JSON.stringify(vars));
		}
		if (typeId) {
			el.setAttribute("data-translation-type", typeId);
		}
		el.setAttribute("aria-label", vars ? tf(tag, fallback, vars, typeId) : t(tag, fallback, typeId));
		return el;
	}

	function setTranslatedOption(option, tag, fallback, typeId) {
		return setTranslatedText(option, tag, fallback, undefined, typeId);
	}

	/** BCP 47 codes only — no friendly names (avoids maintaining a locale directory). */
	function languageDisplayName(code) {
		return code && String(code).trim() ? String(code).trim() : FALLBACK_LANG;
	}

	function collectCatalogLanguages(catalog, into) {
		if (!catalog || typeof catalog !== "object") {
			return;
		}
		for (const tag of Object.keys(catalog)) {
			const langs = catalog[tag];
			if (!langs || typeof langs !== "object") {
				continue;
			}
			for (const lang of Object.keys(langs)) {
				const code = String(lang || "").trim();
				if (code) {
					into.add(code);
				}
			}
		}
	}

	/**
	 * Languages from the C++ `languages` array plus any locale keys present in
	 * loaded catalogs. Always include en-CA (hardcoded fallback). Every other
	 * locale must come from translation JSON — never seed locales in code.
	 */
	function availableLanguages() {
		const into = new Set();
		const list = (global.snapshot && global.snapshot.languages) || [];
		if (Array.isArray(list)) {
			for (const code of list) {
				const c = String(code || "").trim();
				if (c) {
					into.add(c);
				}
			}
		}
		collectCatalogLanguages(global.snapshot && global.snapshot.translations, into);
		const gizmos = (global.snapshot && global.snapshot.gizmoTranslations) || {};
		if (gizmos && typeof gizmos === "object") {
			for (const typeId of Object.keys(gizmos)) {
				collectCatalogLanguages(gizmos[typeId], into);
			}
		}
		into.add(FALLBACK_LANG);
		return [...into].sort();
	}

	global.t = t;
	global.tf = tf;
	global.tResult = tResult;
	global.tfResult = tfResult;
	global.applyTranslations = applyTranslations;
	global.setTranslatedText = setTranslatedText;
	global.setTranslatedTitle = setTranslatedTitle;
	global.setTranslatedPlaceholder = setTranslatedPlaceholder;
	global.setTranslatedAriaLabel = setTranslatedAriaLabel;
	global.setTranslatedOption = setTranslatedOption;
	global.syncDocumentLang = syncDocumentLang;
	global.languageDisplayName = languageDisplayName;
	global.availableLanguages = availableLanguages;
	global.COG_FALLBACK_LANG = FALLBACK_LANG;
})(window);
