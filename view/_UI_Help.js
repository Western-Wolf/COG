// COG overlay - Help tab and help-mode chrome
// Classic script; shares globals with _UI.js and feature modules.

let helpMode = false;
let helpSubTab = "about";
const helpCache = { about: null, definitions: null, help: null };
let helpLoadPromise = null;

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

