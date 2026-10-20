// COG overlay — Help > Suppressions (live map + alias catalog)
// Classic script; shares globals with _Core.js / _UI.js.

let suppressionsFilterText = "";
let suppressionsFilterVisibility = "all";
let suppressionsSortCol = "element";
let suppressionsSortDir = 1;

let aliasIndexFilterText = "";
let aliasIndexSortCol = "alias";
let aliasIndexSortDir = 1;

function suppressionsFingerprint() {
	return JSON.stringify({
		suppressions: Array.isArray(snapshot.suppressions) ? snapshot.suppressions : [],
		aliases: Array.isArray(snapshot.suppressionAliases) ? snapshot.suppressionAliases : []
	});
}

function suppressionControllersPlain(controllers) {
	if (!Array.isArray(controllers) || !controllers.length) {
		return "—";
	}
	return controllers
		.map((c) => {
			const label = String(c.label || c.id || "Unknown");
			return c.winning ? `${label} (winning)` : label;
		})
		.join(", ");
}

function appendSuppressionControllers(host, controllers) {
	host.replaceChildren();
	if (!Array.isArray(controllers) || !controllers.length) {
		host.textContent = "—";
		return;
	}
	controllers.forEach((c, index) => {
		if (index > 0) {
			host.appendChild(document.createTextNode(", "));
		}
		const span = document.createElement("span");
		const role = String(c.role || "hide");
		const active = c.active !== false;
		span.className =
			"suppressions-controller" +
			(role === "exempt" ? " is-exempt" : " is-hide") +
			(c.winning ? " is-winning" : "") +
			(active ? "" : " is-inactive");
		const rawLabel = c.label || c.id;
		if (rawLabel) {
			span.textContent = String(rawLabel);
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(span, "cog-unknown", "Unknown");
		} else {
			span.textContent = "Unknown";
		}
		if (c.winning) {
			const mark = document.createElement("span");
			if (typeof setTranslatedText === "function") {
				setTranslatedText(mark, "cog-winning", " (winning)");
			} else {
				mark.textContent = " (winning)";
			}
			span.appendChild(mark);
		}
		host.appendChild(span);
	});
}

function sortedFilteredSuppressions() {
	const rows = Array.isArray(snapshot.suppressions) ? snapshot.suppressions.slice() : [];
	const q = suppressionsFilterText.trim().toLowerCase();
	const vis = suppressionsFilterVisibility;
	const filtered = rows.filter((row) => {
		const hidden = !!row.hidden;
		if (vis === "hidden" && !hidden) {
			return false;
		}
		if (vis === "visible" && hidden) {
			return false;
		}
		if (!q) {
			return true;
		}
		const hay = [
			row.alias,
			row.label,
			row.key,
			hidden ? "hidden" : "visible",
			suppressionControllersPlain(row.controllers)
		]
			.join(" ")
			.toLowerCase();
		return hay.includes(q);
	});
	const dir = suppressionsSortDir >= 0 ? 1 : -1;
	const col = suppressionsSortCol;
	filtered.sort((a, b) => {
		let av = "";
		let bv = "";
		if (col === "visibility") {
			av = a.hidden ? "1" : "0";
			bv = b.hidden ? "1" : "0";
		} else if (col === "controllers") {
			av = suppressionControllersPlain(a.controllers).toLowerCase();
			bv = suppressionControllersPlain(b.controllers).toLowerCase();
		} else {
			av = String(a.alias || a.key || "").toLowerCase();
			bv = String(b.alias || b.key || "").toLowerCase();
		}
		if (av < bv) {
			return -1 * dir;
		}
		if (av > bv) {
			return 1 * dir;
		}
		return 0;
	});
	return filtered;
}

function aliasIndexRows() {
	const fromSnap = Array.isArray(snapshot.suppressionAliases) ? snapshot.suppressionAliases : [];
	const out = [];
	for (const item of fromSnap) {
		const alias = String(item && item.value != null ? item.value : "").trim();
		if (!alias) {
			continue;
		}
		out.push({
			alias,
			label: String((item && item.label) || alias),
			key: String((item && item.key) || "").trim()
		});
	}
	return out;
}

function sortedFilteredAliasIndex() {
	const rows = aliasIndexRows();
	const q = aliasIndexFilterText.trim().toLowerCase();
	const filtered = rows.filter((row) => {
		if (!q) {
			return true;
		}
		const translated =
			typeof translateHudAliasLabel === "function"
				? translateHudAliasLabel(row.alias || row.key, row.label)
				: row.label;
		const hay = [row.alias, row.label, translated, row.key].join(" ").toLowerCase();
		return hay.includes(q);
	});
	const dir = aliasIndexSortDir >= 0 ? 1 : -1;
	const col = aliasIndexSortCol;
	filtered.sort((a, b) => {
		let av = "";
		let bv = "";
		if (col === "key") {
			av = String(a.key || "").toLowerCase();
			bv = String(b.key || "").toLowerCase();
		} else if (col === "title") {
			av = String(
				typeof translateHudAliasLabel === "function"
					? translateHudAliasLabel(a.alias || a.key, a.label)
					: a.label || ""
			).toLowerCase();
			bv = String(
				typeof translateHudAliasLabel === "function"
					? translateHudAliasLabel(b.alias || b.key, b.label)
					: b.label || ""
			).toLowerCase();
		} else {
			av = String(a.alias || "").toLowerCase();
			bv = String(b.alias || "").toLowerCase();
		}
		if (av < bv) {
			return -1 * dir;
		}
		if (av > bv) {
			return 1 * dir;
		}
		return 0;
	});
	return filtered;
}

function paintSuppressionsTableBody(tbody) {
	tbody.replaceChildren();
	const rows = sortedFilteredSuppressions();
	if (!rows.length) {
		const tr = document.createElement("tr");
		const td = document.createElement("td");
		td.colSpan = 3;
		td.className = "suppressions-empty";
		if (suppressionsFilterText.trim() || suppressionsFilterVisibility !== "all") {
			if (typeof setTranslatedText === "function") {
				setTranslatedText(td, "cog-no-suppressions-match", "No suppressions match this filter.");
			} else {
				td.textContent = "No suppressions match this filter.";
			}
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(
				td,
				"cog-no-hud-suppressions",
				"No HUD suppressions are active. Place a Gear with a HUD link, a Feed section, or a Suppressor entry to see rows here."
			);
		} else {
			td.textContent =
				"No HUD suppressions are active. Place a Gear with a HUD link, a Feed section, or a Suppressor entry to see rows here.";
		}
		tr.appendChild(td);
		tbody.appendChild(tr);
		return;
	}
	for (const row of rows) {
		const tr = document.createElement("tr");
		tr.className = row.hidden ? "is-hidden" : "is-visible";
		const el = document.createElement("td");
		el.className = "suppressions-element";
		const alias = document.createElement("div");
		alias.className = "suppressions-alias";
		alias.textContent = row.alias || row.key || "—";
		el.appendChild(alias);
		if (row.label && row.label !== row.alias) {
			const tip = document.createElement("div");
			tip.className = "suppressions-label";
			const entry =
				typeof hudAliasLabelEntry === "function" ? hudAliasLabelEntry(row.alias || row.key) : null;
			if (entry && typeof setTranslatedText === "function") {
				setTranslatedText(tip, entry[0], entry[1]);
			} else if (typeof translateHudAliasLabel === "function") {
				tip.textContent = translateHudAliasLabel(row.alias || row.key, row.label);
			} else {
				tip.textContent = row.label;
			}
			el.appendChild(tip);
		}
		if (row.key && row.key !== row.alias) {
			el.title = row.key;
		}
		const vis = document.createElement("td");
		vis.className = "suppressions-visibility";
		if (typeof setTranslatedText === "function") {
			if (row.hidden) {
				setTranslatedText(vis, "cog-hidden", "Hidden");
			} else {
				setTranslatedText(vis, "cog-visible", "Visible");
			}
		} else {
			vis.textContent = row.hidden ? "Hidden" : "Visible";
		}
		const ctrl = document.createElement("td");
		ctrl.className = "suppressions-controllers";
		appendSuppressionControllers(ctrl, row.controllers);
		tr.appendChild(el);
		tr.appendChild(vis);
		tr.appendChild(ctrl);
		tbody.appendChild(tr);
	}
}

function paintAliasIndexTableBody(tbody) {
	tbody.replaceChildren();
	const rows = sortedFilteredAliasIndex();
	if (!rows.length) {
		const tr = document.createElement("tr");
		const td = document.createElement("td");
		td.colSpan = 3;
		td.className = "suppressions-empty";
		if (aliasIndexFilterText.trim()) {
			if (typeof setTranslatedText === "function") {
				setTranslatedText(td, "cog-no-aliases-match", "No aliases match this filter.");
			} else {
				td.textContent = "No aliases match this filter.";
			}
		} else if (typeof setTranslatedText === "function") {
			setTranslatedText(td, "cog-no-suppression-aliases", "No suppression aliases are available.");
		} else {
			td.textContent = "No suppression aliases are available.";
		}
		tr.appendChild(td);
		tbody.appendChild(tr);
		return;
	}
	for (const row of rows) {
		const tr = document.createElement("tr");
		const aliasTd = document.createElement("td");
		aliasTd.className = "suppressions-element";
		const alias = document.createElement("div");
		alias.className = "suppressions-alias";
		alias.textContent = row.alias;
		aliasTd.appendChild(alias);
		const keyTd = document.createElement("td");
		keyTd.className = "suppressions-key";
		keyTd.textContent = row.key || "—";
		if (row.key) {
			keyTd.title = row.key;
		}
		const titleTd = document.createElement("td");
		titleTd.className = "suppressions-title";
		const titleEntry =
			typeof hudAliasLabelEntry === "function" ? hudAliasLabelEntry(row.alias || row.key) : null;
		if (titleEntry && typeof setTranslatedText === "function") {
			setTranslatedText(titleTd, titleEntry[0], titleEntry[1]);
		} else if (typeof translateHudAliasLabel === "function") {
			titleTd.textContent = translateHudAliasLabel(row.alias || row.key, row.label) || "—";
		} else {
			titleTd.textContent = row.label || "—";
		}
		tr.appendChild(aliasTd);
		tr.appendChild(keyTd);
		tr.appendChild(titleTd);
		tbody.appendChild(tr);
	}
}

function syncSortHeaderState(tableSel, sortCol, sortDir) {
	const headers = document.querySelectorAll(`${tableSel} th[data-sort]`);
	for (const th of headers) {
		const col = th.dataset.sort;
		th.classList.toggle("is-sorted", col === sortCol);
		th.classList.toggle("is-asc", col === sortCol && sortDir > 0);
		th.classList.toggle("is-desc", col === sortCol && sortDir < 0);
		th.setAttribute(
			"aria-sort",
			col === sortCol ? (sortDir > 0 ? "ascending" : "descending") : "none"
		);
	}
}

function refreshSuppressionsTable() {
	const activeBody = document.querySelector("#tab-body .suppressions-table[data-role='active'] tbody");
	if (activeBody) {
		paintSuppressionsTableBody(activeBody);
		syncSortHeaderState(
			"#tab-body .suppressions-table[data-role='active']",
			suppressionsSortCol,
			suppressionsSortDir
		);
	}
	const aliasBody = document.querySelector("#tab-body .suppressions-table[data-role='aliases'] tbody");
	if (aliasBody) {
		paintAliasIndexTableBody(aliasBody);
		syncSortHeaderState(
			"#tab-body .suppressions-table[data-role='aliases']",
			aliasIndexSortCol,
			aliasIndexSortDir
		);
	}
}

function appendSuppressionsFilters(host, opts) {
	const filters = document.createElement("div");
	filters.className = "suppressions-filters";
	const search = document.createElement("input");
	search.type = "search";
	search.className = "picker-filter";
	const ph = Array.isArray(opts.placeholder) ? opts.placeholder : null;
	if (ph && typeof setTranslatedPlaceholder === "function") {
		setTranslatedPlaceholder(search, ph[0], ph[1]);
	} else if (opts.placeholderTag && typeof setTranslatedPlaceholder === "function") {
		setTranslatedPlaceholder(search, opts.placeholderTag, opts.placeholder);
	} else {
		search.placeholder = ph ? ph[1] : opts.placeholder;
	}
	search.value = opts.getText();
	search.addEventListener("input", () => {
		opts.setText(search.value);
		refreshSuppressionsTable();
	});
	filters.appendChild(search);
	if (opts.getVisibility && opts.setVisibility) {
		const visField = document.createElement("label");
		visField.className = "pos-field compact";
		visField.innerHTML = `<span>Visibility</span><select>
			<option value="all">All</option>
			<option value="hidden">Hidden</option>
			<option value="visible">Visible</option>
		</select>`;
		tagFieldLabel(visField, "cog-visibility", "Visibility");
		const visSel = visField.querySelector("select");
		tagSelectOptions(visSel, {
			all: ["cog-all", "All"],
			hidden: ["cog-hidden", "Hidden"],
			visible: ["cog-visible", "Visible"]
		});
		visSel.value = opts.getVisibility();
		visSel.addEventListener("change", () => {
			opts.setVisibility(visSel.value || "all");
			refreshSuppressionsTable();
		});
		filters.appendChild(visField);
	}
	host.appendChild(filters);
}

function appendSortableTable(host, opts) {
	const table = document.createElement("table");
	table.className = "suppressions-table";
	table.dataset.role = opts.role;
	const thead = document.createElement("thead");
	const headRow = document.createElement("tr");
	for (const col of opts.columns) {
		const th = document.createElement("th");
		th.dataset.sort = col.id;
		th.scope = "col";
		th.tabIndex = 0;
		const header = Array.isArray(col.tag) ? col.tag : null;
		const tag = header ? header[0] : col.tag;
		const label = header ? header[1] : col.label;
		if (tag && typeof setTranslatedText === "function") {
			setTranslatedText(th, tag, label);
		} else {
			th.textContent = label;
		}
		const applySort = () => {
			opts.onSort(col.id);
			refreshSuppressionsTable();
		};
		th.addEventListener("click", applySort);
		th.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" || ev.key === " ") {
				ev.preventDefault();
				applySort();
			}
		});
		headRow.appendChild(th);
	}
	thead.appendChild(headRow);
	table.appendChild(thead);
	const tbody = document.createElement("tbody");
	table.appendChild(tbody);
	host.appendChild(table);
	return tbody;
}

function makeSuppressionsAccordion(titleTag, title, open) {
	const details = document.createElement("details");
	details.className = "accordion";
	details.dataset.helpGroup = "cog-suppressions";
	details.setAttribute("name", "cog-suppressions");
	details.open = !!open;
	const summary = document.createElement("summary");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(summary, titleTag, title);
	} else {
		summary.textContent = title;
	}
	const body = document.createElement("div");
	body.className = "accordion-body";
	details.appendChild(summary);
	details.appendChild(body);
	return { details, body };
}

function renderSuppressionsTab(host) {
	const wrap = document.createElement("div");
	wrap.className = "help-doc suppressions-doc";

	const lede = document.createElement("p");
	lede.className = "lede";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			lede,
			"cog-suppressions-lede",
			"Gears can be registered to suppress default HUD elements while they are displayed, so the same information is not shown twice. Certain Gizmos — especially Feed — also suppress the vanilla notices they replace. The Suppressor gizmo can Always Hide extra targets or Never Hide ones that would otherwise be soft-hidden. Never Hide always wins over hide sources; (winning) marks the primary controller among those that support the current outcome (Suppressor > other Gizmos > Gauges > Groups)."
		);
	} else {
		lede.textContent =
			"Gears can be registered to suppress default HUD elements while they are displayed, so the same information is not shown twice. Certain Gizmos — especially Feed — also suppress the vanilla notices they replace. The Suppressor gizmo can Always Hide extra targets or Never Hide ones that would otherwise be soft-hidden. Never Hide always wins over hide sources; (winning) marks the primary controller among those that support the current outcome (Suppressor > other Gizmos > Gauges > Groups).";
	}
	wrap.appendChild(lede);

	const active = makeSuppressionsAccordion("cog-active-suppressions", "Active Suppressions", true);
	const hint = document.createElement("p");
	hint.className = "hint";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			hint,
			"cog-active-suppressions-hint",
			"This list updates live. Green controllers would make the element Visible; red would make it Hidden. Bold (winning) is the primary among the active side."
		);
	} else {
		hint.textContent =
			"This list updates live. Green controllers would make the element Visible; red would make it Hidden. Bold (winning) is the primary among the active side.";
	}
	active.body.appendChild(hint);
	appendSuppressionsFilters(active.body, {
		placeholder: ["cog-filter-suppressions", "Filter by element, status, or gadget…"],
		getText: () => suppressionsFilterText,
		setText: (v) => {
			suppressionsFilterText = v;
		},
		getVisibility: () => suppressionsFilterVisibility,
		setVisibility: (v) => {
			suppressionsFilterVisibility = v;
		}
	});
	appendSortableTable(active.body, {
		role: "active",
		columns: [
			{ id: "element", tag: ["cog-element", "Element"] },
			{ id: "visibility", tag: ["cog-visibility", "Visibility"] },
			{ id: "controllers", tag: ["cog-controlling-gadgets", "Controlling Gadget(s)"] }
		],
		onSort: (colId) => {
			if (suppressionsSortCol === colId) {
				suppressionsSortDir *= -1;
			} else {
				suppressionsSortCol = colId;
				suppressionsSortDir = 1;
			}
		}
	});
	wrap.appendChild(active.details);

	const aliases = makeSuppressionsAccordion("cog-alias-index", "Alias Index", false);
	const aliasHint = document.createElement("p");
	aliasHint.className = "hint";
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			aliasHint,
			"cog-alias-index-hint",
			"Known short names you can use in the Suppressor or HUD-linked Gears, with the CanonicalKey each alias resolves to."
		);
	} else {
		aliasHint.textContent =
			"Known short names you can use in the Suppressor or HUD-linked Gears, with the CanonicalKey each alias resolves to.";
	}
	aliases.body.appendChild(aliasHint);
	appendSuppressionsFilters(aliases.body, {
		placeholder: ["cog-filter-aliases", "Filter by alias, CanonicalKey, or friendly name…"],
		getText: () => aliasIndexFilterText,
		setText: (v) => {
			aliasIndexFilterText = v;
		}
	});
	appendSortableTable(aliases.body, {
		role: "aliases",
		columns: [
			{ id: "alias", tag: ["cog-alias", "Alias"] },
			{ id: "key", tag: ["cog-canonical-key", "CanonicalKey"] },
			{ id: "title", tag: ["cog-friendly-name", "Friendly Name"] }
		],
		onSort: (colId) => {
			if (aliasIndexSortCol === colId) {
				aliasIndexSortDir *= -1;
			} else {
				aliasIndexSortCol = colId;
				aliasIndexSortDir = 1;
			}
		}
	});
	wrap.appendChild(aliases.details);

	host.appendChild(wrap);
	if (typeof bindExclusiveAccordions === "function") {
		bindExclusiveAccordions(wrap, "cog-suppressions");
	}
	refreshSuppressionsTable();
	enhanceSelects(wrap);
}
