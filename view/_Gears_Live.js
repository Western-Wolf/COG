// COG overlay - Gears live HUD (percent patches, buildGearEl, renderGears)
// Classic script; shares globals with _Gears.js / _Groups.js / gauges / gizmos.

function normalizeGearsSnapshot() {
	if (!Array.isArray(snapshot.gears)) {
		snapshot.gears = [];
	}
	for (const gear of snapshot.gears) {
		const gid = (gear && (gear.id || gear.varName)) || "?";
		delete gear.style;
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy gear identity keys "mod"/"name" become sourceMod/varName.
		if (!String(gear.sourceMod || "").trim() && String(gear.mod || "").trim()) {
			gear.sourceMod = String(gear.mod).trim();
			noteMigration(`gear ${gid} mod → sourceMod`);
		}
		if (!String(gear.varName || "").trim() && String(gear.name || "").trim()) {
			gear.varName = String(gear.name).trim();
			noteMigration(`gear ${gid} name → varName`);
		}
		delete gear.mod;
		delete gear.name;
		gear.sourceMod = String(gear.sourceMod || "");
		gear.varName = String(gear.varName || "");
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Builtin Vampiric Hunger varName Bloodlust → VampiricHunger (id COG_Builtin_Bloodlust → COG_Builtin_VampiricHunger).
		if (
			String(gear.sourceMod).toLowerCase() === "cog.builtin" &&
			String(gear.varName).toLowerCase() === "bloodlust"
		) {
			noteMigration(`gear ${gid} COG.Builtin Bloodlust → VampiricHunger`);
			gear.varName = "VampiricHunger";
			gear.sourceMod = "COG.Builtin";
			const oldId = gearIdFor("COG.Builtin", "Bloodlust");
			if (!gear.id || String(gear.id).toLowerCase() === oldId.toLowerCase()) {
				gear.id = gearIdFor("COG.Builtin", "VampiricHunger");
			}
		}
		ensureGearAppearance(gear);
	}
}

/** Live AV/percent push from SKSE — update matching HUD gear nodes without a full rebuild. */
function applyLivePercentToHud(incoming) {
	if (!incoming) {
		return;
	}
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Prefer sourceMod/varName; accept legacy live keys mod/name.
	const sourceMod = String(incoming.sourceMod || incoming.mod || "");
	const varName = String(incoming.varName || incoming.name || "");
	if (!sourceMod || !varName) {
		return;
	}
	const src = sourceFor(sourceMod, varName);
	if (!src) {
		return;
	}
	src.value = Number(incoming.value) || 0;
	if (incoming.current != null) {
		src.current = Number(incoming.current);
	}
	if (incoming.maximum != null) {
		src.maximum = Number(incoming.maximum);
	}
	if (drag) {
		return;
	}
	const gear = gearBySource(sourceMod, varName);
	const preview = document.body.classList.contains("is-focused");
	const needle = `\t${sourceMod}\t${varName}`;
	let saw = false;
	let needsRebuild = false;
	for (const el of document.querySelectorAll(".gear[data-gear-key]")) {
		if (!String(el.dataset.gearKey || "").endsWith(needle)) {
			continue;
		}
		saw = true;
		safeCall(`applyLivePercent:gear:${el.dataset.gearKey || "?"}`, () => {
			const groupId = String(el.dataset.gearKey).split("\t")[0];
			const group = (snapshot.groups || []).find((g) => g.id === groupId);
			const alpha = gearHudAlpha(src, gear, group);
			if (alpha <= 0 && !preview) {
				needsRebuild = true;
				return;
			}
			applyGearHideFadeOpacity(el, src, gear, group, preview);
			if (preview) {
				el.classList.toggle("is-preview", alpha < 1);
			}
			const fill = el.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(src));
				fill.style.backgroundColor = sourceBarColor(src, gear, group);
				const trough = el.querySelector(".gear-bar.has-trough .gear-bar-clip");
				if (trough) {
					trough.style.borderColor = sourceBorderColor(src, gear, group);
				}
			}
			const style = ensureGroupSettings(group || {});
			const showTotal =
				style.showNumber !== false && usesRatio(src) && numberFormatShowsTotal(style.numberFormat);
			const chrome = sourceBorderColor(src, gear, group);
			for (const value of el.querySelectorAll(".gear-value")) {
				value.textContent = formatValue(src, showTotal);
				value.style.color = chrome;
			}
			for (const label of el.querySelectorAll(".gear-label")) {
				label.style.color = chrome;
			}
			applyIconFillFromHidden(el, src, gear, group);
			applyIconPaint(el, src, gear, group);
		});
	}
	if (!saw && gear) {
		const wouldShow = (snapshot.groups || []).some((g) => {
			const ids = (g.settings && g.settings.gearIds) || g.gearIds || [];
			if (!ids.includes(gear.id)) {
				return false;
			}
			return preview || gearHudAlpha(src, gear, g) > 0;
		});
		if (wouldShow) {
			needsRebuild = true;
		}
	}
	const gaugeRebuild = applyLivePercentToBoundGauges(incoming, preview);
	if (needsRebuild || gaugeRebuild) {
		renderGears();
	}
}

/**
 * Batch live refresh after applyLivePatch replaced snapshot.sources / shout / gameTime / payloads.
 * Patches gears + gauges in place; full renderGears only if hideAt visibility needs DOM create/destroy.
 */
function applyLivePatchToHud() {
	if (drag) {
		if (typeof paintAllHudGizmosLive === "function") {
			paintAllHudGizmosLive();
		}
		return;
	}
	const preview = document.body.classList.contains("is-focused");
	let needsRebuild = false;
	const presentGearKeys = new Set();

	for (const el of document.querySelectorAll(".gear[data-gear-key]")) {
		presentGearKeys.add(String(el.dataset.gearKey || ""));
		safeCall(`applyLivePatch:gear:${el.dataset.gearKey || "?"}`, () => {
			const parts = String(el.dataset.gearKey || "").split("\t");
			if (parts.length < 3) {
				return;
			}
			const groupId = parts[0];
			const mod = parts[1];
			const name = parts.slice(2).join("\t");
			const src = sourceFor(mod, name);
			const gear = gearBySource(mod, name);
			const group = (snapshot.groups || []).find((g) => g.id === groupId);
			if (!src) {
				return;
			}
			const alpha = gearHudAlpha(src, gear, group);
			if (alpha <= 0 && !preview) {
				needsRebuild = true;
				return;
			}
			applyGearHideFadeOpacity(el, src, gear, group, preview);
			if (preview) {
				el.classList.toggle("is-preview", alpha < 1);
			}
			const fill = el.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(src));
				fill.style.backgroundColor = sourceBarColor(src, gear, group);
				const trough = el.querySelector(".gear-bar.has-trough .gear-bar-clip");
				if (trough) {
					trough.style.borderColor = sourceBorderColor(src, gear, group);
				}
			}
			const style = ensureGroupSettings(group || {});
			const showTotal =
				style.showNumber !== false && usesRatio(src) && numberFormatShowsTotal(style.numberFormat);
			const chrome = sourceBorderColor(src, gear, group);
			for (const value of el.querySelectorAll(".gear-value")) {
				value.textContent = formatValue(src, showTotal);
				value.style.color = chrome;
			}
			for (const label of el.querySelectorAll(".gear-label")) {
				label.style.color = chrome;
			}
			applyIconFillFromHidden(el, src, gear, group);
			applyIconPaint(el, src, gear, group);
		});
	}

	// hideAt can remove gears from the DOM; when they should reappear there is no node to patch.
	if (!needsRebuild) {
		for (const group of snapshot.groups || []) {
			const vis = typeof groupVisibility === "function" ? groupVisibility(group) : "hud";
			if (vis === "none" && !preview) {
				continue;
			}
			if (vis === "hud" && !hudVisible && !preview) {
				continue;
			}
			for (const gear of gearsInGroup(group.id)) {
				const src = sourceFor(gear.sourceMod, gear.varName);
				if (!src) {
					continue;
				}
				if (!(preview || gearHudAlpha(src, gear, group) > 0)) {
					continue;
				}
				const key = hudGearKey(group.id, gear);
				if (!presentGearKeys.has(key)) {
					needsRebuild = true;
					break;
				}
			}
			if (needsRebuild) {
				break;
			}
		}
	}

	if (typeof patchHudGaugeLive === "function" && typeof findHudGaugeEl === "function") {
		for (const gauge of snapshot.gauges || []) {
			safeCall(`applyLivePatch:gauge:${gauge.id != null ? gauge.id : "?"}`, () => {
				const el = findHudGaugeEl(gauge.id);
				const { src, gear } = typeof gaugeLinked === "function" ? gaugeLinked(gauge) : { src: null, gear: null };
				const neverHide = !!gaugeSettings(gauge).neverHide;
				const hidden = !neverHide && !!(src && typeof isHudHidden === "function" && isHudHidden(src, gear));
				if (!el) {
					if (preview || neverHide || !hidden) {
						needsRebuild = true;
					}
					return;
				}
				if (hidden && !preview && !neverHide) {
					needsRebuild = true;
					return;
				}
				patchHudGaugeLive(el, gauge);
			});
		}
	}

	if (typeof paintAllHudGizmosLive === "function") {
		paintAllHudGizmosLive();
	}

	if (needsRebuild) {
		renderGears();
	}
}

function applyLivePercentToBoundGauges(incoming, preview) {
	if (!incoming || typeof patchHudGaugeLive !== "function" || typeof findHudGaugeEl !== "function") {
		return false;
	}
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Prefer sourceMod/varName; accept legacy live keys mod/name.
	const sourceMod = String(incoming.sourceMod || incoming.mod || "");
	const varName = String(incoming.varName || incoming.name || "");
	if (!sourceMod || !varName) {
		return false;
	}
	let needsRebuild = false;
	let saw = false;
	for (const gauge of snapshot.gauges || []) {
		if (gauge.sourceMod !== sourceMod || gauge.varName !== varName) {
			continue;
		}
		saw = true;
		safeCall(`patchHudGaugeLive:${gauge.id != null ? gauge.id : "?"}`, () => {
			const el = findHudGaugeEl(gauge.id);
			const { src, gear } = typeof gaugeLinked === "function" ? gaugeLinked(gauge) : { src: null, gear: null };
			const neverHide = !!gaugeSettings(gauge).neverHide;
			const hidden = !neverHide && !!(src && typeof isHudHidden === "function" && isHudHidden(src, gear));
			if (!el) {
				if (preview || neverHide || !hidden) {
					needsRebuild = true;
				}
				return;
			}
			// Keep existing DOM when hideAt trips; syncHudGauges owns fade/remove on the next sync.
			patchHudGaugeLive(el, gauge);
		});
	}
	return needsRebuild && saw;
}

function isInventoryGear(gear) {
	return gear && gear.sourceMod === INVENTORY_GEAR_MOD;
}

function isProtectedInventoryGear(gear) {
	return isInventoryGear(gear) && gear.locked;
}

function inventoryGears() {
	return [...(snapshot.gears || [])]
		.filter(isInventoryGear)
		.sort((a, b) => {
			if (a.locked !== b.locked) {
				return a.locked ? -1 : 1;
			}
			const an = appearanceOf(a, sourceFor(a.sourceMod, a.varName)).displayName || a.varName || "";
			const bn = appearanceOf(b, sourceFor(b.sourceMod, b.varName)).displayName || b.varName || "";
			return an.localeCompare(bn) || String(a.id).localeCompare(String(b.id));
		});
}

function isPickableGearSource(src) {
	return !!src;
}

function gearFor(id) {
	return snapshot.gears.find((g) => g.id === id);
}

function gearIdFor(sourceMod, varName) {
	return `${sourceMod}_${varName}`.replace(/[^A-Za-z0-9_-]+/g, "_");
}

function gearBySource(sourceMod, varName) {
	const m = String(sourceMod || "").toLowerCase();
	const n = String(varName || "").toLowerCase();
	return snapshot.gears.find(
		(g) =>
			String(g.sourceMod || g.mod || "").toLowerCase() === m &&
			String(g.varName || g.name || "").toLowerCase() === n
	);
}

function formatValue(src, asTotal) {
	if (!src) {
		return "—";
	}
	if (src.type === "percent") {
		if (asTotal) {
			const max = Number(src.maximum);
			if (Number.isFinite(max) && max > 0) {
				const cur = Number.isFinite(Number(src.current)) ? Number(src.current) : (Number(src.value) || 0) / 100 * max;
				return `${Math.round(cur)}/${Math.round(max)}`;
			}
		}
		return `${Math.round(src.value)}%`;
	}
	if (src.type === "count") {
		return String(Math.round(src.value));
	}
	if (src.type === "timer") {
		const remaining = Number.isFinite(Number(src.current)) ? Number(src.current) : 0;
		if (!asTotal) {
			return `${Math.round(src.value)}%`;
		}
		const sec = Math.max(0, Math.round(remaining));
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		const clock = `${m}:${String(s).padStart(2, "0")}`;
		return remaining <= 0 ? `${clock} (inactive)` : clock;
	}
	return String(src.value);
}

function isInactiveTimer(src) {
	return src && src.type === "timer" && Number(src.current) <= 0;
}

function isHudHidden(src, gear, group) {
	return gearHudAlpha(src, gear, group) <= 0;
}

function fitGearLabels() {
	for (const label of document.querySelectorAll(".gear-label:not(.gauge-gear-label)")) {
		const stack = label.parentElement;
		fitLabelFont(label, stack ? stack.clientWidth : 0);
	}
}

function hudGearKey(groupId, gear) {
	return `${groupId}\t${gear.sourceMod}\t${gear.varName}`;
}

function barPercent(src) {
	return Math.max(0, Math.min(100, Number(src && src.value) || 0));
}

function sizeBarSheen(fill) {
	let sheen = fill.querySelector(".gear-bar-sheen");
	if (!sheen) {
		sheen = document.createElement("span");
		sheen.className = "gear-bar-sheen";
		fill.appendChild(sheen);
	}
	const bar = fill.parentElement;
	if (!bar) {
		return;
	}
	const trough = bar.clientWidth;
	if (trough > 0 && sheen.dataset.trough !== String(trough)) {
		sheen.dataset.trough = String(trough);
		sheen.style.width = `${trough}px`;
	}
}

function isBowDrawFill(fill) {
	const gear = fill.closest(".gear");
	return !!(gear && String(gear.dataset.gearKey || "").endsWith("\tCOG.Builtin\tBowDraw"));
}

function setBarFill(fill, pct) {
	const target = Math.max(0, Math.min(100, Number(pct) || 0));
	sizeBarSheen(fill);
	fill.classList.toggle("is-bow", isBowDrawFill(fill));
	fill.style.width = `${target}%`;
}

function buildGearEl(groupId, gear, src, style, stack, preview, group) {
	const el = document.createElement("div");
	el.dataset.gearKey = hudGearKey(groupId, gear);
	const playAlpha = gearHudAlpha(src, gear, group);
	el.className =
		"gear" +
		(preview && playAlpha < 1 ? " is-preview" : "") +
		(style.showIcon ? ` has-icon stack-${stack}` : " no-icon");
	applyGearHideFadeOpacity(el, src, gear, group, preview);
	if (style.showIcon) {
		const icon = document.createElement("div");
		icon.className = "gear-icon";
		const href = sourceIconPath(src, gear);
		const paint = href ? sourceIconPaint(src, gear, group) : "";
		if (href) {
			const img = document.createElement("img");
			img.src = href;
			img.alt = "";
			if (typeof bindIconImgFallback === "function") {
				bindIconImgFallback(img);
			}
			icon.appendChild(img);
			if (groupUsesIconFill(group, src, gear)) {
				paintGearIconFill(
					icon,
					href,
					paint || "#ffffff",
					groupFillMode(group, src, gear),
					gearFillProgress(src, gear),
					rasterIconColorPlan(src, gear, group)
				);
			} else if (iconHrefIsAnimated(href)) {
				applyRasterIconLook(icon, href, rasterIconColorPlan(src, gear, group));
			} else if (paint) {
				icon.classList.add("is-painted");
				paintMaskedFace(icon, "gear-icon-face", { color: paint, href });
				img.hidden = true;
			}
		}
		el.appendChild(icon);
	}
	const isRatio = usesRatio(src);
	const wantNumber = style.showNumber !== false;
	const showBar = wantNumber && isRatio && numberFormatShowsBar(style.numberFormat);
	const showValue = wantNumber && (isRatio ? numberFormatShowsValue(style.numberFormat) : true);
	const showTotal = wantNumber && isRatio && numberFormatShowsTotal(style.numberFormat);
	const needStack = style.showLabel || showValue || showBar;
	if (needStack) {
		const copy = document.createElement("div");
		copy.className = "gear-stack";
		const chrome = sourceBorderColor(src, gear, group);
		if (showBar) {
			const bar = document.createElement("div");
			bar.className = "gear-bar" + (style.barTrough ? " has-trough" : "") + (showValue ? " has-value" : "");
			const clip = document.createElement("div");
			clip.className = "gear-bar-clip";
			if (style.barTrough) {
				clip.style.borderColor = chrome;
			}
			const fill = document.createElement("span");
			fill.className = "gear-bar-fill";
			const sheen = document.createElement("span");
			sheen.className = "gear-bar-sheen";
			fill.appendChild(sheen);
			fill.style.backgroundColor = sourceBarColor(src, gear, group);
			clip.appendChild(fill);
			bar.appendChild(clip);
			if (showValue) {
				const value = document.createElement("div");
				value.className = "gear-value";
				value.textContent = formatValue(src, showTotal);
				value.style.color = chrome;
				bar.appendChild(value);
			}
			copy.appendChild(bar);
		} else if (showValue) {
			const value = document.createElement("div");
			value.className = "gear-value";
			value.textContent = formatValue(src, showTotal);
			value.style.color = chrome;
			copy.appendChild(value);
		}
		if (style.showLabel) {
			const label = document.createElement("div");
			label.className = "gear-label";
			label.textContent = sourceTitle(src, gear.varName, gear);
			label.style.color = chrome;
			copy.appendChild(label);
		}
		el.appendChild(copy);
		if (showBar) {
			const fill = copy.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(src));
			}
		}
	}
	el.dataset.styleSig = `${style.showIcon}|${style.showLabel}|${style.showNumber}|${style.numberFormat}|${style.barTrough}|${style.fillFromHidden || ""}|${stack}|${sourceIconPath(src, gear)}|${iconPaintSig(src, gear, group)}|${gearTitleSig(src, gear)}`;
	return el;
}

function renderGears() {
	if (drag) {
		return;
	}
	const root = document.getElementById("hud");
	const frontRoot = document.getElementById("hud-front");
	const preview = document.body.classList.contains("is-focused");
	if (preview !== hudPreviewMode) {
		hudPreviewMode = preview;
		root.innerHTML = "";
		if (frontRoot) {
			frontRoot.innerHTML = "";
		}
		hudShownAt.clear();
		hudHideUntil.clear();
	}
	if (!hudVisible && !preview) {
		// Keep HUD DOM mounted; body.hud-hidden hides it via CSS. Destroying here made
		// quicksave/Loading Menu flash every element as it was rebuilt on show.
		// Still sync gauges/gizmos so visibility "ui" gauges can mount.
		syncHudGauges(root, frontRoot, false);
		syncHudGizmos(root, frontRoot, false);
		syncHudFrontLayer();
		return;
	}
	const now = Date.now();
	const keepGroups = new Set();
	for (const group of snapshot.groups) {
		const isFront = preview && activeTab === "groups" && openGroupId === group.id;
		const visibility = typeof groupVisibility === "function" ? groupVisibility(group) : "hud";
		// none: editor preview only; hud: with vanilla HUD; ui: also while soft-hidden (menus).
		if (visibility === "none" && !preview) {
			continue;
		}
		if (visibility === "hud" && !hudVisible && !preview) {
			continue;
		}
		const dest = isFront && frontRoot ? frontRoot : root;
		const style = ensureGroupSettings(group);
		const stack = normalizeStack(ensureGroupSettings(group).stack);
		const wanted = [];
		for (const gear of gearsInGroup(group.id)) {
			const src = sourceFor(gear.sourceMod, gear.varName);
			if (!src) {
				continue;
			}
			const key = hudGearKey(group.id, gear);
			const fadeMode = groupUsesHideFade(group, src, gear);
			const hidden = isHudHidden(src, gear, group);
			if (hidden && !preview) {
				if (fadeMode) {
					hudShownAt.delete(key);
					hudHideUntil.delete(key);
					continue;
				}
				if (hudShownAt.has(key) && !hudHideUntil.has(key)) {
					hudHideUntil.set(key, now + HUD_FADE_MS);
				}
				if (!hudHideUntil.has(key) || now >= hudHideUntil.get(key)) {
					hudShownAt.delete(key);
					hudHideUntil.delete(key);
					continue;
				}
			} else {
				hudHideUntil.delete(key);
				if (!hudShownAt.has(key)) {
					hudShownAt.set(key, now);
				}
			}
			wanted.push({ gear, src, key });
		}
		if (!wanted.length && !preview) {
			continue;
		}
		keepGroups.add(group.id);
		const host = ensureHudGroupHost(group, dest, visibility, isFront);
		const groupEl = host.groupEl;
		const slots = host.slots;
		const created = host.created;
		const keepKeys = new Set(wanted.map((item) => item.key));
		for (const child of [...slots.children]) {
			if (!keepKeys.has(child.dataset.gearKey)) {
				child.remove();
			}
		}
		let labelsDirty = created;
		let slotIndex = 0;
		for (const item of wanted) {
			const fadingOut = hudHideUntil.has(item.key) && now < hudHideUntil.get(item.key);
			const fadeMode = groupUsesHideFade(group, item.src, item.gear);
			const fillMode = groupUsesIconFill(group, item.src, item.gear);
			const fadingIn =
				!preview && !fadingOut && !fadeMode && !fillMode && now - (hudShownAt.get(item.key) || now) < HUD_FADE_MS;
			const styleSig = `${style.showIcon}|${style.showLabel}|${style.showNumber}|${style.numberFormat}|${style.barTrough}|${style.fillFromHidden || ""}|${stack}|${sourceIconPath(item.src, item.gear)}|${iconPaintSig(item.src, item.gear, group)}|${gearTitleSig(item.src, item.gear)}`;
			let el = slots.querySelector(`[data-gear-key="${cssAttr(item.key)}"]`);
			if (!el || el.dataset.styleSig !== styleSig) {
				const next = buildGearEl(group.id, item.gear, item.src, style, stack, preview, group);
				if (el) {
					slots.replaceChild(next, el);
				} else {
					slots.appendChild(next);
				}
				el = next;
				labelsDirty = true;
			}
			if (slots.children[slotIndex] !== el) {
				slots.insertBefore(el, slots.children[slotIndex] || null);
			}
			slotIndex += 1;
			const showTotal =
				style.showNumber !== false &&
				usesRatio(item.src) &&
				numberFormatShowsTotal(style.numberFormat);
			const playAlpha = gearHudAlpha(item.src, item.gear, group);
			const wouldHide = playAlpha < 1;
			el.classList.toggle("is-preview", !!(preview && wouldHide));
			// Always: opacity = relativeAlpha × maxAlpha (Fade from Alpha keeps per-gear differences).
			applyGearHideFadeOpacity(el, item.src, item.gear, group, preview);
			if (fadeMode || fillMode) {
				el.classList.toggle("is-fading-in", false);
				el.classList.toggle("is-fading-out", false);
			} else {
				el.classList.toggle("is-fading-in", fadingIn);
				el.classList.toggle("is-fading-out", fadingOut);
			}
			const fill = el.querySelector(".gear-bar-fill");
			if (fill) {
				setBarFill(fill, barPercent(item.src));
				fill.style.backgroundColor = sourceBarColor(item.src, item.gear, group);
			}
			const trough = el.querySelector(".gear-bar.has-trough .gear-bar-clip");
			if (trough) {
				trough.style.borderColor = sourceBorderColor(item.src, item.gear, group);
			}
			applyIconFillFromHidden(el, item.src, item.gear, group);
			applyIconPaint(el, item.src, item.gear, group);
			const chrome = sourceBorderColor(item.src, item.gear, group);
			for (const value of el.querySelectorAll(".gear-value")) {
				value.textContent = formatValue(item.src, showTotal);
				value.style.color = chrome;
			}
			for (const label of el.querySelectorAll(".gear-label")) {
				label.style.color = chrome;
			}
		}
		// Layout after children exist so rotation vars apply to a real box.
		layoutHudGroup(groupEl, group, wanted.length);
		if (labelsDirty) {
			for (const label of slots.querySelectorAll(".gear-label")) {
				const stackEl = label.parentElement;
				fitLabelFont(label, stackEl ? stackEl.clientWidth : 0);
			}
		}
		syncHudGroupEditHandles(groupEl, preview);
	}
	reconcileHudGroupHosts(root, frontRoot, keepGroups, preview);
	syncHudGauges(root, frontRoot, preview);
	syncHudGizmos(root, frontRoot, preview);
	syncHudFrontLayer();
}
