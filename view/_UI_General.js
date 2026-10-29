// COG overlay - General tab
// Classic script; shares globals with _UI.js and feature modules.

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
			group.visibility = box.checked ? "hud" : "none";
			delete group.visible;
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
		const fromLang = currentLang;
		const toLang = langSel.value || "en-CA";
		snapshot.general.language = toLang;
		if (
			snapshot.general.updateStockTitlesOnTranslation &&
			typeof pushStockEntityTitles === "function"
		) {
			pushStockEntityTitles(fromLang, toLang);
		}
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

	const pushTitlesRow = document.createElement("label");
	pushTitlesRow.className = "check-row compact";
	const pushTitlesBox = document.createElement("input");
	pushTitlesBox.type = "checkbox";
	pushTitlesBox.checked = !!snapshot.general.updateStockTitlesOnTranslation;
	pushTitlesBox.dataset.role = "updateStockTitlesOnTranslation";
	pushTitlesBox.addEventListener("change", () => {
		snapshot.general.updateStockTitlesOnTranslation = pushTitlesBox.checked;
		scheduleSave(true);
	});
	pushTitlesRow.appendChild(pushTitlesBox);
	const pushTitlesTitle = document.createElement("span");
	pushTitlesTitle.className = "field-title-row";
	const pushTitlesLabel = document.createElement("span");
	if (typeof setTranslatedText === "function") {
		setTranslatedText(
			pushTitlesLabel,
			"cog-push-stock-titles",
			"Update stock titles on translation"
		);
	} else {
		pushTitlesLabel.textContent = "Update stock titles on translation";
	}
	pushTitlesTitle.appendChild(pushTitlesLabel);
	pushTitlesTitle.appendChild(
		makeInfoTip(
			"When changing language, rewrite gears, groups, gauges, and gizmos that still use the default name.",
			"cog-push-stock-titles-tip"
		)
	);
	pushTitlesRow.appendChild(pushTitlesTitle);
	prefsRow.appendChild(pushTitlesRow);

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
			"Used when a gear or group does not set its own. Bar Fill is the meter fill; Border & Text is the bar trough plus titles and numbers; Icon is a single tint for meter icons. Fancy multi-stop colours belong on a gear or group."
		);
	} else {
		colorLede.textContent =
			"Used when a gear or group does not set its own. Bar Fill is the meter fill; Border & Text is the bar trough plus titles and numbers; Icon is a single tint for meter icons. Fancy multi-stop colours belong on a gear or group.";
	}
	body.appendChild(colorLede);

	const colors = document.createElement("div");
	colors.className = "color-row";
	if (!snapshot.general.iconColor && (snapshot.general.iconStartColor || snapshot.general.iconEndColor)) {
		snapshot.general.iconColor = themeIconColor();
	}
	const backupBar = makeColorField("Bar Fill", "fillColor", snapshot.general.fillColor, defaultFillColor());
	tagFieldLabel(backupBar, "cog-backup-bar", "Bar Fill");
	colors.appendChild(backupBar);
	const backupBorder = makeColorField(
		"Border & Text",
		"borderColor",
		snapshot.general.borderColor,
		defaultBorderColor()
	);
	tagFieldLabel(backupBorder, "cog-backup-border", "Border & Text");
	colors.appendChild(backupBorder);
	const backupIcon = makeColorField(
		"Icon",
		"iconColor",
		snapshot.general.iconColor || themeIconColor(),
		defaultIconColor()
	);
	tagFieldLabel(backupIcon, "cog-backup-icon", "Icon");
	colors.appendChild(backupIcon);
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
		delete snapshot.general.neutralIconMode;
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

