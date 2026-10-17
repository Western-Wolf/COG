// COG overlay — small DOM-safe markdown subset for Help docs.
// Classic script; exposes window.renderMarkdown / window.appendMarkdown.

(function (global) {
	"use strict";

	function appendText(parent, text) {
		if (text) {
			parent.appendChild(document.createTextNode(text));
		}
	}

	function isSafeHref(href) {
		const h = String(href || "").trim();
		return /^https?:\/\//i.test(h);
	}

	/** Inline: **bold**, *italic* / _italic_, `code`, [text](url) */
	function appendInline(parent, text) {
		const s = String(text || "");
		const re =
			/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
		let last = 0;
		let m;
		while ((m = re.exec(s))) {
			appendText(parent, s.slice(last, m.index));
			const token = m[0];
			if (token.startsWith("**") && token.endsWith("**")) {
				const strong = document.createElement("strong");
				appendInline(strong, token.slice(2, -2));
				parent.appendChild(strong);
			} else if (
				(token.startsWith("*") && token.endsWith("*")) ||
				(token.startsWith("_") && token.endsWith("_"))
			) {
				const em = document.createElement("em");
				appendInline(em, token.slice(1, -1));
				parent.appendChild(em);
			} else if (token.startsWith("`") && token.endsWith("`")) {
				const code = document.createElement("code");
				code.textContent = token.slice(1, -1);
				parent.appendChild(code);
			} else if (token.startsWith("[")) {
				const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
				if (linkMatch && isSafeHref(linkMatch[2])) {
					const a = document.createElement("a");
					a.href = linkMatch[2].trim();
					a.rel = "noopener noreferrer";
					a.target = "_blank";
					appendInline(a, linkMatch[1]);
					parent.appendChild(a);
				} else {
					appendText(parent, token);
				}
			} else {
				appendText(parent, token);
			}
			last = m.index + token.length;
		}
		appendText(parent, s.slice(last));
	}

	function headingLevel(line) {
		const m = /^(#{1,3})\s+(.+)$/.exec(line);
		if (!m) {
			return null;
		}
		return { level: m[1].length, text: m[2].trim() };
	}

	function unorderedItem(line) {
		const m = /^[-*]\s+(.+)$/.exec(line);
		return m ? m[1] : null;
	}

	function orderedItem(line) {
		const m = /^\d+\.\s+(.+)$/.exec(line);
		return m ? m[1] : null;
	}

	function flushParagraph(host, lines) {
		const text = lines.join("\n").trim();
		if (!text) {
			return;
		}
		const p = document.createElement("p");
		p.className = "help-block";
		appendInline(p, text);
		host.appendChild(p);
	}

	/**
	 * Render markdown subset into host (createElement / textContent only).
	 * @param {HTMLElement} host
	 * @param {string} markdown
	 */
	function renderMarkdown(host, markdown) {
		const lines = String(markdown || "").replace(/^\uFEFF/, "").split(/\r?\n/);
		let i = 0;
		let para = [];

		const flushPara = () => {
			flushParagraph(host, para);
			para = [];
		};

		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.trim();

			if (!trimmed) {
				flushPara();
				i += 1;
				continue;
			}

			const heading = headingLevel(trimmed);
			if (heading) {
				flushPara();
				const el = document.createElement("h" + heading.level);
				el.className = "help-heading";
				appendInline(el, heading.text);
				host.appendChild(el);
				i += 1;
				continue;
			}

			const ulText = unorderedItem(trimmed);
			if (ulText != null) {
				flushPara();
				const ul = document.createElement("ul");
				ul.className = "help-list";
				while (i < lines.length) {
					const item = unorderedItem(lines[i].trim());
					if (item == null) {
						break;
					}
					const li = document.createElement("li");
					appendInline(li, item);
					ul.appendChild(li);
					i += 1;
				}
				host.appendChild(ul);
				continue;
			}

			const olText = orderedItem(trimmed);
			if (olText != null) {
				flushPara();
				const ol = document.createElement("ol");
				ol.className = "help-list";
				while (i < lines.length) {
					const item = orderedItem(lines[i].trim());
					if (item == null) {
						break;
					}
					const li = document.createElement("li");
					appendInline(li, item);
					ol.appendChild(li);
					i += 1;
				}
				host.appendChild(ol);
				continue;
			}

			para.push(line);
			i += 1;
		}
		flushPara();
	}

	function appendMarkdown(host, markdown) {
		renderMarkdown(host, markdown);
	}

	global.renderMarkdown = renderMarkdown;
	global.appendMarkdown = appendMarkdown;
})(typeof window !== "undefined" ? window : this);
