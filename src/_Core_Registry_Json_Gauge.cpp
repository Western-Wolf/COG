#include "pch.h"
#include "_Core_Registry_Json.h"
#include "_UI_KeyNames.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace CogRegistryJson
{

	std::string NormalizeGaugePlacement(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "left" || raw == "right" || raw == "up" || raw == "down") {
			return raw;
		}
		if (raw == "centered" || raw == "centre" || raw == "center" || raw == "middle") {
			return "centered";
		}
		return "none";
	}


	/** Frame gear slots: Off | Top | Middle | Bottom. */
	std::string NormalizeFrameSlot(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "top" || raw == "middle" || raw == "bottom") {
			return raw;
		}
		return "none";
	}


	/** Real colour sources only: bar | border | icon. Empty = unrecognized (caller migrates). */
	std::string NormalizeIconColorMode(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "border" || raw == "useborder" || raw == "use border colour" || raw == "use border color") {
			return "border";
		}
		if (raw == "bar" || raw == "usebar" || raw == "use bar colour" || raw == "use bar color") {
			return "bar";
		}
		if (raw == "icon" || raw == "matchicon" || raw == "match icon colours" || raw == "match icon colors") {
			return "icon";
		}
		return {};
	}


	/** Real colour sources only: bar | border | icon. Empty = unrecognized (caller migrates). */
	std::string NormalizeLabelColorMode(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "border" || raw == "matchborder" || raw == "match border colour" || raw == "match border color") {
			return "border";
		}
		if (raw == "bar" || raw == "matchbar" || raw == "match bar colour" || raw == "match bar color") {
			return "bar";
		}
		if (raw == "icon" || raw == "matchicon" || raw == "match icon colours" || raw == "match icon colors") {
			return "icon";
		}
		return {};
	}


	std::string NormalizeGaugeType(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "frame") {
			return "frame";
		}
		return "meter";
	}


	std::string NormalizeGaugeDisplayMode(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "picture" || raw == "group") {
			return raw == "group" ? "gear" : "picture";
		}
		return "gear";
	}


	std::string NormalizePictureDirection(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "in" || raw == "up" || raw == "down" || raw == "left" || raw == "right") {
			return raw;
		}
		return "out";
	}


	std::string NormalizeGaugeShape(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "arc") {
			return "arc";
		}
		return "bar";
	}


	CogGauge ParseGauge(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		CogGauge g;
		g.id = ctx.GetString(obj, "id");
		g.locked = ctx.GetBool(obj, "locked", false);
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy root bool "visible" becomes visibility none|hud|ui (never written back as bool).
		if (ctx.Has(obj, "visibility")) {
			g.visibility = NormalizeGizmoVisibility(ctx.GetString(obj, "visibility"));
		} else if (ctx.Has(obj, "visible")) {
			g.visibility = ctx.GetBool(obj, "visible", true) ? "hud" : "none";
			NoteMigration(ctx, "visible → visibility");
		} else {
			g.visibility = "hud";
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy flat placement keys x/y/rotation/width/height move under nested "display" (never written back flat on save).
		// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
		{
			const CogJson::Value* displayObj = ctx.GetObject(obj, "display");
			if (!displayObj) {
				NoteIfHasAny(
					ctx, obj, { "x", "y", "rotation", "width", "height", "posAnchor" },
					"flat placement / posAnchor → nested display (posAnchor ignored)");
			}
			g.display.x = ReadPlacementFloat(obj, displayObj, ctx, "x", 0.1f);
			g.display.y = ReadPlacementFloat(obj, displayObj, ctx, "y", 0.1f);
			g.display.rotation = ReadPlacementFloat(obj, displayObj, ctx, "rotation", 0.0f);
			g.display.width = ReadPlacementFloat(obj, displayObj, ctx, "width", 240.0f);
			g.display.height = ReadPlacementFloat(obj, displayObj, ctx, "height", 24.0f);
			g.display.maxAlpha = ReadPlacementFloat(obj, displayObj, ctx, "maxAlpha", 100.0f);
			if (g.display.width < 8.0f) {
				g.display.width = 8.0f;
			}
			if (g.display.height < 4.0f) {
				g.display.height = 4.0f;
			}
			if (g.display.maxAlpha < 0.0f) {
				g.display.maxAlpha = 0.0f;
			} else if (g.display.maxAlpha > 100.0f) {
				g.display.maxAlpha = 100.0f;
			}
			if (displayObj) {
				WarnUnknownKeys(
					ctx, *displayObj, { "x", "y", "rotation", "width", "height", "maxAlpha" }, {},
					"gauge.display");
			}
		}
		g.sourceMod = ctx.GetString(obj, "sourceMod");
		g.varName = ctx.GetString(obj, "varName");
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy gauge binding keys "gearMod"/"gearName" become sourceMod/varName (never written back on save).
		if (g.sourceMod.empty() && NoteIfHas(ctx, obj, "gearMod", "gearMod → sourceMod")) {
			g.sourceMod = ctx.GetString(obj, "gearMod");
		}
		if (g.varName.empty() && NoteIfHas(ctx, obj, "gearName", "gearName → varName")) {
			g.varName = ctx.GetString(obj, "gearName");
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Builtin Vampiric Hunger varName Bloodlust → VampiricHunger on gauge bindings.
		MigrateBuiltinBloodlustIdentity(g.sourceMod, g.varName, nullptr, &ctx);

		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy flat gauge chrome keys move under nested "settings" (never written back flat on save).
		const CogJson::Value* settingsObj = ctx.GetObject(obj, "settings");
		auto hasSetting = [&](const char* key) {
			return (settingsObj && ctx.Has(*settingsObj, key)) || ctx.Has(obj, key);
		};
		auto settingString = [&](const char* key) {
			if (settingsObj && ctx.Has(*settingsObj, key)) {
				return ctx.GetString(*settingsObj, key);
			}
			return ctx.GetString(obj, key);
		};
		auto settingBool = [&](const char* key, bool fallback) {
			if (settingsObj && ctx.Has(*settingsObj, key)) {
				return ctx.GetBool(*settingsObj, key, fallback);
			}
			return ctx.GetBool(obj, key, fallback);
		};
		auto settingFloat = [&](const char* key, float fallback) {
			if (settingsObj && ctx.Has(*settingsObj, key)) {
				return ctx.GetFloat(*settingsObj, key, fallback);
			}
			return ctx.GetFloat(obj, key, fallback);
		};

		auto& s = g.settings;
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy root displayName (and older title key name) move under nested settings.displayName (never written on root again).
		// Prefer settings.displayName; else root displayName; else legacy root name.
		{
			std::string title;
			if (settingsObj && ctx.Has(*settingsObj, "displayName")) {
				title = ctx.GetString(*settingsObj, "displayName");
			}
			if (title.empty() && NoteIfHas(ctx, obj, "displayName", "root displayName → settings.displayName")) {
				title = ctx.GetString(obj, "displayName");
			}
			if (title.empty() && NoteIfHas(ctx, obj, "name", "root name → settings.displayName")) {
				title = ctx.GetString(obj, "name");
			}
			s.displayName = std::move(title);
		}
		if (g.id.empty()) {
			g.id = FileStem(s.displayName);
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy root type moves under nested settings.type (never written on root again).
		// Prefer settings.type; else root type.
		{
			std::string typeRaw;
			if (settingsObj && ctx.Has(*settingsObj, "type")) {
				typeRaw = ctx.GetString(*settingsObj, "type");
			} else if (NoteIfHas(ctx, obj, "type", "root type → settings.type")) {
				typeRaw = ctx.GetString(obj, "type");
			}
			s.type = NormalizeGaugeType(std::move(typeRaw));
		}
		// Flat chrome on the root (when settings bag exists or not) is migrated by settingString/hasSetting.
		{
			static constexpr const char* kFlatChrome[] = {
				"shape", "borderColor", "borderThickness", "troughOpacity", "endCapMode", "endCap",
				"endCapOverlap", "showIcon", "showLabel", "showNumber", "fillDirection", "iconColorMode",
				"labelColorMode", "numberColorMode", "numberAsPercent", "fontSize", "frameShape",
				"frameFillColor", "frameBorderColor", "frameBorderThickness", "insideSize", "displayMode",
				"neverHide", "alwaysVisible", "barTrough", "numberFormat", "pictureIcon", "pictureDirection",
				"pictureRotation", "pictureEmpty", "pictureFull", "pictureFade"
			};
			bool anyFlatChrome = false;
			for (const char* key : kFlatChrome) {
				if ((!settingsObj || !ctx.Has(*settingsObj, key)) && ctx.Has(obj, key)) {
					anyFlatChrome = true;
					break;
				}
			}
			if (anyFlatChrome) {
				NoteMigration(ctx, "flat gauge chrome → settings");
			}
		}
		s.shape = NormalizeGaugeShape(settingString("shape"));
		s.borderColor = settingString("borderColor");
		s.borderThickness = settingFloat("borderThickness", 15.0f);
		s.troughOpacity = settingFloat("troughOpacity", 20.0f);
		s.endCap = NormalizeEndCapArt(settingString("endCap"));
		s.endCapMode = NormalizeEndCapMode(settingString("endCapMode"));
		if (s.endCapMode.empty()) {
			s.endCapMode = s.endCap.empty() ? "border" : "endcap";
		}
		s.endCapOverlap = settingFloat("endCapOverlap", 0.0f);
		{
			const bool isFrame = s.type == "frame";
			auto readPlacement = [&](const char* key) {
				auto raw = settingString(key);
				return isFrame ? NormalizeFrameSlot(std::move(raw)) : NormalizeGaugePlacement(std::move(raw));
			};
			s.showIcon = readPlacement("showIcon");
			s.showLabel = readPlacement("showLabel");
			s.showNumber = readPlacement("showNumber");
			if (isFrame) {
				// Gear-mode chrome defaults when keys are absent (Title / Icon / Number).
				if (!hasSetting("showIcon")) {
					s.showIcon = "middle";
				}
				if (!hasSetting("showLabel")) {
					s.showLabel = "top";
				}
				if (!hasSetting("showNumber")) {
					s.showNumber = "bottom";
				}
				// Keep first claim by Icon → Number → Title; clear duplicates to none.
				std::unordered_set<std::string> claimed;
				auto claim = [&](std::string& slot) {
					if (slot == "none") {
						return;
					}
					if (claimed.count(slot)) {
						slot = "none";
					} else {
						claimed.insert(slot);
					}
				};
				claim(s.showIcon);
				claim(s.showNumber);
				claim(s.showLabel);
			}
		}
		s.fillDirection = settingString("fillDirection");
		if (s.fillDirection.empty()) {
			s.fillDirection = "left";
		}
		{
			// Migration Code for Transition from v1.01 or earlier to v1.1:
			// Colour modes are bar | border | icon only (drop keep / title / number copies).
			auto rawIcon = settingString("iconColorMode");
			auto next = NormalizeIconColorMode(rawIcon);
			if (next.empty()) {
				if (!rawIcon.empty()) {
					NoteMigration(ctx, "iconColorMode '" + rawIcon + "' → border");
				}
				s.iconColorMode = "border";
			} else {
				s.iconColorMode = std::move(next);
			}
		}
		{
			// Migration Code for Transition from v1.01 or earlier to v1.1:
			auto rawLabel = settingString("labelColorMode");
			auto next = NormalizeLabelColorMode(rawLabel);
			if (next.empty()) {
				if (!rawLabel.empty()) {
					NoteMigration(ctx, "labelColorMode '" + rawLabel + "' → border");
				}
				s.labelColorMode = "border";
			} else {
				s.labelColorMode = std::move(next);
			}
		}
		{
			// Migration Code for Transition from v1.01 or earlier to v1.1:
			auto raw = settingString("numberColorMode");
			auto next = NormalizeLabelColorMode(raw);
			if (next.empty()) {
				if (!raw.empty()) {
					NoteMigration(ctx, "numberColorMode '" + raw + "' → border");
				}
				s.numberColorMode = "border";
			} else {
				s.numberColorMode = std::move(next);
			}
		}
		s.numberAsPercent = settingBool("numberAsPercent", false);
		s.fontSize = settingFloat("fontSize", 0.0f);
		if (s.fontSize < 0.0f) {
			s.fontSize = 0.0f;
		}
		s.frameShape = settingString("frameShape");
		if (s.frameShape.empty()) {
			s.frameShape = "Frames/circle.svg";
		}
		s.frameFillColor = settingString("frameFillColor");
		s.frameBorderColor = settingString("frameBorderColor");
		s.frameBorderThickness = settingFloat("frameBorderThickness", 5.0f);
		if (s.frameBorderThickness < 0.0f) {
			s.frameBorderThickness = 0.0f;
		}
		if (s.frameBorderThickness > 50.0f) {
			s.frameBorderThickness = 50.0f;
		}
		s.insideSize = settingFloat("insideSize", 65.0f);
		if (s.insideSize < 5.0f) {
			s.insideSize = 5.0f;
		}
		if (s.insideSize > 100.0f) {
			s.insideSize = 100.0f;
		}
		s.displayMode = NormalizeGaugeDisplayMode(settingString("displayMode"));
		// Frames default on; meters default off. Missing key uses type-based default.
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// alwaysVisible → neverHide (blocks soft-hide from Hide when / inactive timers; does not override Gauge Visibility HUD).
		{
			const bool frameDefault = s.type == "frame";
			if (hasSetting("neverHide")) {
				s.neverHide = settingBool("neverHide", frameDefault);
			} else if (hasSetting("alwaysVisible")) {
				s.neverHide = settingBool("alwaysVisible", frameDefault);
				NoteMigration(ctx, "alwaysVisible → neverHide");
			} else {
				s.neverHide = frameDefault;
			}
		}
		s.barTrough = settingBool("barTrough", false);
		{
			auto raw = settingString("numberFormat");
			auto canon = CanonicalPercentMode(raw);
			s.numberFormat = canon.empty() ? "barPercent" : std::move(canon);
		}
		s.pictureIcon = settingString("pictureIcon");
		s.pictureDirection = NormalizePictureDirection(settingString("pictureDirection"));
		s.pictureRotation = settingFloat("pictureRotation", 0.0f);
		s.pictureEmpty = settingString("pictureEmpty");
		if (s.pictureEmpty.empty()) {
			s.pictureEmpty = "#000000";
		}
		s.pictureFull = settingString("pictureFull");
		if (s.pictureFull.empty()) {
			s.pictureFull = "#ffffff";
		}
		s.pictureFade = settingString("pictureFade");
		if (s.pictureFade.empty()) {
			s.pictureFade = "#c4a35a";
		}
		if (settingsObj) {
			WarnUnknownKeys(
				ctx,
				*settingsObj,
				{ "displayName", "type", "shape", "borderColor", "borderThickness", "troughOpacity", "endCapMode",
				  "endCap", "endCapOverlap", "showIcon", "showLabel", "showNumber", "fillDirection",
				  "iconColorMode", "labelColorMode", "numberColorMode", "numberAsPercent", "fontSize",
				  "frameShape", "frameFillColor", "frameBorderColor", "frameBorderThickness", "insideSize",
				  "displayMode", "neverHide", "barTrough", "numberFormat", "pictureIcon", "pictureDirection",
				  "pictureRotation", "pictureEmpty", "pictureFull", "pictureFade" },
				{ "alwaysVisible" },
				"gauge.settings");
		}
		WarnUnknownKeys(
			ctx,
			obj,
			{ "id", "locked", "visibility", "display", "sourceMod", "varName", "settings" },
			{ "visible", "gearMod", "gearName", "displayName", "name", "type", "shape", "borderColor",
			  "borderThickness", "troughOpacity", "endCapMode", "endCap", "endCapOverlap", "showIcon",
			  "showLabel", "showNumber", "fillDirection", "iconColorMode", "labelColorMode", "numberColorMode",
			  "numberAsPercent", "fontSize", "frameShape", "frameFillColor", "frameBorderColor",
			  "frameBorderThickness", "insideSize", "displayMode", "neverHide", "alwaysVisible", "barTrough",
			  "numberFormat", "pictureIcon", "pictureDirection", "pictureRotation", "pictureEmpty",
			  "pictureFull", "pictureFade", "x", "y", "rotation", "width", "height", "posAnchor" },
			"gauge");
		return g;
	}


	void AppendGauge(CogJson::Writer& w, const CogGauge& g)
	{
		const auto& s = g.settings;
		w.BeginObject();
		w.KeyString("id", g.id);
		w.KeyBool("locked", g.locked);
		w.KeyString("visibility", NormalizeGizmoVisibility(g.visibility));
		w.KeyString("sourceMod", g.sourceMod);
		w.KeyString("varName", g.varName);
		w.Key("settings");
		w.BeginObject();
		w.KeyString("displayName", s.displayName);
		w.KeyString("type", s.type);
		w.KeyString("shape", s.shape);
		w.KeyString("borderColor", s.borderColor);
		w.KeyNumber("borderThickness", s.borderThickness);
		w.KeyNumber("troughOpacity", s.troughOpacity);
		w.KeyString("endCapMode", s.endCapMode);
		w.KeyString("endCap", s.endCap);
		w.KeyNumber("endCapOverlap", s.endCapOverlap);
		w.KeyString("showIcon", s.showIcon);
		w.KeyString("showLabel", s.showLabel);
		w.KeyString("showNumber", s.showNumber);
		w.KeyString("fillDirection", s.fillDirection);
		w.KeyString("iconColorMode", s.iconColorMode);
		w.KeyString("labelColorMode", s.labelColorMode);
		w.KeyString("numberColorMode", s.numberColorMode);
		w.KeyBool("numberAsPercent", s.numberAsPercent);
		w.KeyNumber("fontSize", s.fontSize);
		w.KeyString("frameShape", s.frameShape);
		w.KeyString("frameFillColor", s.frameFillColor);
		w.KeyString("frameBorderColor", s.frameBorderColor);
		w.KeyNumber("frameBorderThickness", s.frameBorderThickness);
		w.KeyNumber("insideSize", s.insideSize);
		w.KeyString("displayMode", s.displayMode);
		w.KeyBool("neverHide", s.neverHide);
		w.KeyBool("barTrough", s.barTrough);
		w.KeyString("numberFormat", s.numberFormat);
		w.KeyString("pictureIcon", s.pictureIcon);
		w.KeyString("pictureDirection", s.pictureDirection);
		w.KeyNumber("pictureRotation", s.pictureRotation);
		w.KeyString("pictureEmpty", s.pictureEmpty);
		w.KeyString("pictureFull", s.pictureFull);
		w.KeyString("pictureFade", s.pictureFade);
		w.EndObject();
		AppendBoxDisplay(w, g.display);
		w.EndObject();
	}


	std::string GaugeToJson(const CogGauge& g)
	{
		CogJson::Writer w(true);
		AppendGauge(w, g);
		auto s = w.str();
		if (!s.empty() && s.back() != '\n') {
			s.push_back('\n');
		}
		return s;
	}

}
