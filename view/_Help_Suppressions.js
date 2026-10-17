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
		const label = String(c.label || c.id || "Unknown");
		span.textContent = c.winning ? `${label} (winning)` : label;
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
		const hay = [row.alias, row.label, row.key].join(" ").toLowerCase();
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
			av = String(a.label || "").toLowerCase();
			bv = String(b.label || "").toLowerCase();
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
		td.textContent =
			suppressionsFilterText.trim() || suppressionsFilterVisibility !== "all"
				? "No suppressions match this filter."
				: "No HUD suppressions are active. Place a Gear with a HUD link, a Feed section, or a Suppressor entry to see rows here.";
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
			tip.textContent = row.label;
			el.appendChild(tip);
		}
		if (row.key && row.key !== row.alias) {
			el.title = row.key;
		}
		const vis = document.createElement("td");
		vis.className = "suppressions-visibility";
		vis.textContent = row.hidden ? "Hidden" : "Visible";
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
		td.textContent = aliasIndexFilterText.trim()
			? "No aliases match this filter."
			: "No suppression aliases are available.";
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
		titleTd.textContent = row.label || "—";
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
	search.placeholder = opts.placeholder;
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
		const visSel = visField.querySelector("select");
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
		th.textContent = col.label;
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

function makeSuppressionsAccordion(title, open) {
	const details = document.createElement("details");
	details.className = "accordion";
	details.dataset.helpGroup = "cog-suppressions";
	details.setAttribute("name", "cog-suppressions");
	details.open = !!open;
	const summary = document.createElement("summary");
	summary.textContent = title;
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
	lede.textContent =
		"Gears can be registered to suppress default HUD elements while they are displayed, so the same information is not shown twice. Certain Gizmos — especially Feed — also suppress the vanilla notices they replace. The Suppressor gizmo can Always Hide extra targets or Never Hide ones that would otherwise be soft-hidden. Never Hide always wins over hide sources; (winning) marks the primary controller among those that support the current outcome (Suppressor > other Gizmos > Gauges > Groups).";
	wrap.appendChild(lede);

	const active = makeSuppressionsAccordion("Active Suppressions", true);
	const hint = document.createElement("p");
	hint.className = "hint";
	hint.textContent =
		"This list updates live. Green controllers would make the element Visible; red would make it Hidden. Bold (winning) is the primary among the active side.";
	active.body.appendChild(hint);
	appendSuppressionsFilters(active.body, {
		placeholder: "Filter by element, status, or gadget…",
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
			{ id: "element", label: "Element" },
			{ id: "visibility", label: "Visibility" },
			{ id: "controllers", label: "Controlling Gadget(s)" }
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

	const aliases = makeSuppressionsAccordion("Alias Index", false);
	const aliasHint = document.createElement("p");
	aliasHint.className = "hint";
	aliasHint.textContent =
		"Known short names you can use in the Suppressor or HUD-linked Gears, with the CanonicalKey each alias resolves to.";
	aliases.body.appendChild(aliasHint);
	appendSuppressionsFilters(aliases.body, {
		placeholder: "Filter by alias, CanonicalKey, or friendly name…",
		getText: () => aliasIndexFilterText,
		setText: (v) => {
			aliasIndexFilterText = v;
		}
	});
	appendSortableTable(aliases.body, {
		role: "aliases",
		columns: [
			{ id: "alias", label: "Alias" },
			{ id: "key", label: "CanonicalKey" },
			{ id: "title", label: "Friendly Name" }
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
