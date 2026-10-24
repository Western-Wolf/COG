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
	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy gear-root exemptFromGroupColors moves onto the owning group's settings.exemptFromGroupColors[gearId]
	// (never written on the gear again). Stashed during ParseGear; folded by MigrateLegacyGearExemptOntoGroups.
	std::unordered_map<std::string, bool> g_pendingLegacyGearExempt;


	CogGroup DefaultGroup()
	{
		CogGroup g;
		g.id = kDefaultGroupId;
		g.locked = true;
		g.visibility = "hud";
		g.position.x = 0.1f;
		g.position.y = 0.10f;
		g.position.rotation = 0.0f;
		g.settings.displayName = "Default Group";
		g.settings.gearSize = kDefaultGearSize;
		g.settings.spacing = kDefaultSpacing;
		g.settings.stack = "below";
		return g;
	}


	std::string NormalizeGroupId(std::string id)
	{
		if (id.empty() || Lower(id) == kDefaultGroupId) {
			return kDefaultGroupId;
		}
		return id;
	}


	// Empty stays empty (unplaced). Non-empty unknown ids are left as-is for reconcile to clear.
	std::string PlacementGroupId(std::string id)
	{
		if (id.empty()) {
			return {};
		}
		if (Lower(id) == kDefaultGroupId) {
			return kDefaultGroupId;
		}
		return id;
	}


	bool AppearanceEmpty(const CogGearAppearance& a)
	{
		return a.displayName.empty() && a.icon.empty() && a.iconColor.empty() && a.barColor.empty() &&
		       a.hideAt.empty();
	}


	CogGearAppearance ParseAppearance(const CogJson::Value& obj, CogJson::ParseContext& ctx, std::string_view bagLabel)
	{
		CogGearAppearance a;
		a.displayName = ctx.GetString(obj, "displayName");
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy appearance title key "display" becomes displayName (never written back on save).
		if (a.displayName.empty() && ctx.Has(obj, "display")) {
			a.displayName = ctx.GetString(obj, "display");
			NoteMigration(ctx, std::string(bagLabel) + " display → displayName");
		}
		a.icon = ReadIconField(obj, ctx, "icon");
		const bool hadIconColor = ctx.Has(obj, "iconColor");
		const bool hadLegacyPair = ctx.Has(obj, "startColor") || ctx.Has(obj, "endColor");
		a.iconColor = ReadColorRampField(obj, ctx, "iconColor", true);
		if (!hadIconColor && hadLegacyPair && !a.iconColor.empty()) {
			NoteMigration(ctx, std::string(bagLabel) + " startColor/endColor → iconColor");
		}
		a.barColor = ReadColorRampField(obj, ctx, "barColor", false);
		a.hideAt = ctx.GetString(obj, "hideAt");
		a.hudLinkedElement = ctx.GetString(obj, "hudLinkedElement");
		a.hudHideDuplicate = ctx.GetBool(obj, "hudHideDuplicate", false);
		WarnUnknownKeys(
			ctx,
			obj,
			{ "displayName", "icon", "iconColor", "barColor", "hideAt", "hudLinkedElement", "hudHideDuplicate" },
			{ "display", "startColor", "endColor" },
			bagLabel);
		return a;
	}


	CogGearAppearance ParseAppearance(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		return ParseAppearance(obj, ctx, "appearance");
	}


	void AppendAppearance(CogJson::Writer& w, const CogGearAppearance& a)
	{
		w.BeginObject();
		w.KeyString("displayName", a.displayName);
		WriteIconField(w, "icon", a.icon);
		WriteColorRampField(w, "iconColor", a.iconColor);
		WriteColorRampField(w, "barColor", a.barColor);
		w.KeyString("hideAt", a.hideAt);
		w.KeyString("hudLinkedElement", a.hudLinkedElement);
		w.KeyBool("hudHideDuplicate", a.hudHideDuplicate);
		w.EndObject();
	}


	std::string NormalizeNumberFormat(const CogJson::Value& style, CogJson::ParseContext& ctx)
	{
		auto fromKey = CanonicalPercentMode(ctx.GetString(style, "numberFormat"));
		return fromKey.empty() ? "barPercent" : fromKey;
	}


	CogGroup ParseGroup(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		CogGroup g = DefaultGroup();
		g.id = ctx.GetString(obj, "id");
		g.locked = g.id == kDefaultGroupId || ctx.GetBool(obj, "locked", false);
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
		// Legacy flat placement keys x/y/rotation move under nested "position" (never written back flat on save).
		// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
		{
			const CogJson::Value* posObj = ctx.GetObject(obj, "position");
			if (!posObj) {
				NoteIfHasAny(
					ctx, obj, { "x", "y", "rotation", "posAnchor" },
					"flat placement / posAnchor → nested position (posAnchor ignored)");
			}
			g.position.x = ReadPlacementFloat(obj, posObj, ctx, "x", g.position.x);
			g.position.y = ReadPlacementFloat(obj, posObj, ctx, "y", g.position.y);
			g.position.rotation = ReadPlacementFloat(obj, posObj, ctx, "rotation", 0.0f);
			if (posObj) {
				WarnUnknownKeys(ctx, *posObj, { "x", "y", "rotation" }, {}, "group.position");
			}
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy group options bag "style" becomes "settings" (never written back on save).
		const CogJson::Value* settingsBag = ctx.GetObject(obj, "settings");
		if (!settingsBag) {
			settingsBag = ctx.GetObject(obj, "style");
			if (settingsBag) {
				NoteMigration(ctx, "style → settings");
			}
		}
		if (settingsBag) {
			g.settings.showLabel = ctx.GetBool(*settingsBag, "showLabel", false);
			g.settings.showIcon = ctx.GetBool(*settingsBag, "showIcon", true);
			g.settings.showNumber = ctx.GetBool(*settingsBag, "showNumber", true);
			g.settings.barTrough = ctx.GetBool(*settingsBag, "barTrough", true);
			g.settings.fillFromHidden = NormalizeFillFromHidden(ctx.GetString(*settingsBag, "fillFromHidden"));
			g.settings.numberFormat = NormalizeNumberFormat(*settingsBag, ctx);
			g.settings.useGroupColors = ctx.GetBool(*settingsBag, "useGroupColors", false);
			const bool hadIconColor = ctx.Has(*settingsBag, "iconColor");
			const bool hadLegacyPair = ctx.Has(*settingsBag, "startColor") || ctx.Has(*settingsBag, "endColor");
			g.settings.iconColor = ReadColorRampField(*settingsBag, ctx, "iconColor", true);
			if (!hadIconColor && hadLegacyPair && !g.settings.iconColor.empty()) {
				NoteMigration(ctx, "group settings startColor/endColor → iconColor");
			}
			g.settings.barColor = ReadColorRampField(*settingsBag, ctx, "barColor", false);
			g.settings.borderColor = ctx.GetString(*settingsBag, "borderColor");
			g.settings.neutralIconMode = NormalizeNeutralIconMode(ctx.GetString(*settingsBag, "neutralIconMode"));
			if (const auto* exemptObj = ctx.GetObject(*settingsBag, "exemptFromGroupColors")) {
				for (const auto& [gearId, val] : exemptObj->objectValue) {
					if (val.IsBool() && val.boolValue && !gearId.empty()) {
						g.settings.exemptFromGroupColors[gearId] = true;
					}
				}
			}
			WarnUnknownKeys(
				ctx,
				*settingsBag,
				{ "displayName", "showLabel", "showIcon", "showNumber", "barTrough", "fillFromHidden",
				  "numberFormat", "useGroupColors", "iconColor", "barColor", "borderColor", "neutralIconMode",
				  "gearSize", "spacing", "stack", "exemptFromGroupColors", "gearIds" },
				{ "startColor", "endColor" },
				"group.settings");
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy root displayName (and older title key name) move under nested settings.displayName (never written on root again).
		// Prefer settings.displayName; else root displayName; else legacy root name.
		{
			std::string title;
			if (settingsBag && ctx.Has(*settingsBag, "displayName")) {
				title = ctx.GetString(*settingsBag, "displayName");
			}
			if (title.empty() && NoteIfHas(ctx, obj, "displayName", "root displayName → settings.displayName")) {
				title = ctx.GetString(obj, "displayName");
			}
			if (title.empty() && NoteIfHas(ctx, obj, "name", "root name → settings.displayName")) {
				title = ctx.GetString(obj, "name");
			}
			if (!title.empty()) {
				g.settings.displayName = std::move(title);
			}
		}
		if (g.id.empty()) {
			g.id = FileStem(g.settings.displayName);
		}
		g.id = NormalizeGroupId(g.id);
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy flat group line keys gearSize/spacing/stack move under nested "settings" (never written back flat on save).
		// Prefer settings.*; if missing, fall back to flat root keys.
		if (settingsBag && ctx.Has(*settingsBag, "gearSize")) {
			g.settings.gearSize = ctx.GetFloat(*settingsBag, "gearSize", kDefaultGearSize);
		} else if (NoteIfHas(ctx, obj, "gearSize", "root gearSize → settings.gearSize")) {
			g.settings.gearSize = ctx.GetFloat(obj, "gearSize", kDefaultGearSize);
		}
		if (settingsBag && ctx.Has(*settingsBag, "spacing")) {
			g.settings.spacing = ctx.GetFloat(*settingsBag, "spacing", kDefaultSpacing);
		} else if (NoteIfHas(ctx, obj, "spacing", "root spacing → settings.spacing")) {
			g.settings.spacing = ctx.GetFloat(obj, "spacing", kDefaultSpacing);
		} else {
			g.settings.spacing = kDefaultSpacing;
		}
		if (settingsBag && ctx.Has(*settingsBag, "stack")) {
			g.settings.stack = NormalizeStack(ctx.GetString(*settingsBag, "stack"));
		} else if (NoteIfHas(ctx, obj, "stack", "root stack → settings.stack")) {
			g.settings.stack = NormalizeStack(ctx.GetString(obj, "stack"));
		}
		if (g.id == kDefaultGroupId) {
			g.locked = true;
			g.settings.displayName = "Default Group";
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy root gearIds move under nested settings.gearIds (never written on root again).
		// Prefer settings.gearIds; else root gearIds.
		if (settingsBag && ctx.Has(*settingsBag, "gearIds")) {
			g.settings.gearIds = ctx.GetStringArray(*settingsBag, "gearIds");
		} else if (NoteIfHas(ctx, obj, "gearIds", "root gearIds → settings.gearIds")) {
			g.settings.gearIds = ctx.GetStringArray(obj, "gearIds");
		} else {
			g.settings.gearIds = ctx.GetStringArray(obj, "gearIds");
		}
		WarnUnknownKeys(
			ctx,
			obj,
			{ "id", "locked", "visibility", "position", "settings" },
			{ "visible", "style", "displayName", "name", "gearSize", "spacing", "stack", "gearIds", "x", "y",
			  "rotation", "posAnchor" },
			"group");
		return g;
	}


	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Builtin Vampiric Hunger was registered as varName Bloodlust; rename to VampiricHunger.
	bool IsBuiltinBloodlustSource(const std::string& sourceMod, const std::string& varName)
	{
		return Lower(sourceMod) == "cog.builtin" && Lower(varName) == "bloodlust";
	}


	std::string BuiltinBloodlustGearId()
	{
		return FileStem("COG.Builtin_Bloodlust");
	}


	std::string BuiltinVampiricHungerGearId()
	{
		return FileStem("COG.Builtin_VampiricHunger");
	}


	bool MigrateBuiltinBloodlustIdentity(
		std::string& sourceMod,
		std::string& varName,
		std::string* id,
		CogJson::ParseContext* ctx)
	{
		if (!IsBuiltinBloodlustSource(sourceMod, varName)) {
			return false;
		}
		varName = "VampiricHunger";
		if (sourceMod != "COG.Builtin") {
			sourceMod = "COG.Builtin";
		}
		if (id) {
			const auto oldId = BuiltinBloodlustGearId();
			if (id->empty() || Lower(*id) == Lower(oldId)) {
				*id = BuiltinVampiricHungerGearId();
			}
		}
		if (ctx) {
			NoteMigration(*ctx, "COG.Builtin Bloodlust → VampiricHunger");
		}
		return true;
	}


	CogGear ParseGear(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		CogGear g;
		g.sourceMod = ctx.GetString(obj, "sourceMod");
		g.varName = ctx.GetString(obj, "varName");
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy gear identity keys "mod"/"name" become sourceMod/varName (never written back on save).
		if (g.sourceMod.empty() && NoteIfHas(ctx, obj, "mod", "mod → sourceMod")) {
			g.sourceMod = ctx.GetString(obj, "mod");
		}
		if (g.varName.empty() && NoteIfHas(ctx, obj, "name", "name → varName")) {
			g.varName = ctx.GetString(obj, "name");
		}
		g.id = ctx.GetString(obj, "id");
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Builtin Vampiric Hunger varName Bloodlust → VampiricHunger (id COG_Builtin_Bloodlust → COG_Builtin_VampiricHunger).
		MigrateBuiltinBloodlustIdentity(g.sourceMod, g.varName, &g.id, &ctx);
		if (g.id.empty() && !g.sourceMod.empty() && !g.varName.empty()) {
			g.id = FileStem(g.sourceMod + "_" + g.varName);
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy gear-root "enabled" is ignored (group membership + hideAt / visibility control display).
		NoteIfHas(ctx, obj, "enabled", "ignored legacy root enabled");
		g.locked = ctx.GetBool(obj, "locked", false);
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy gear-root exemptFromGroupColors moves onto the owning group's settings.exemptFromGroupColors[gearId]
		// (never written on the gear again).
		if (ctx.GetBool(obj, "exemptFromGroupColors", false) && !g.id.empty()) {
			g_pendingLegacyGearExempt[g.id] = true;
			NoteMigration(ctx, "root exemptFromGroupColors → group.settings.exemptFromGroupColors (pending fold)");
		}
		if (const auto* defaults = ctx.GetObject(obj, "defaults")) {
			g.defaults = ParseAppearance(*defaults, ctx, "gear.defaults");
		}
		if (const auto* settings = ctx.GetObject(obj, "settings")) {
			g.settings = ParseAppearance(*settings, ctx, "gear.settings");
		}
		WarnUnknownKeys(
			ctx,
			obj,
			{ "id", "locked", "sourceMod", "varName", "defaults", "settings" },
			{ "mod", "name", "enabled", "exemptFromGroupColors" },
			"gear");
		return g;
	}


	bool MigrateBuiltinBloodlustToVampiricHunger(
		std::vector<CogGear>& gears,
		std::vector<CogGroup>& groups,
		std::vector<CogGauge>& gauges,
		std::unordered_set<std::string>& seenSources)
	{
		bool changed = false;
		const auto oldId = BuiltinBloodlustGearId();
		const auto newId = BuiltinVampiricHungerGearId();
		const auto oldSeen = Lower("COG.Builtin") + "\x1F" + Lower("Bloodlust");
		const auto newSeen = Lower("COG.Builtin") + "\x1F" + Lower("VampiricHunger");

		for (auto& gear : gears) {
			if (MigrateBuiltinBloodlustIdentity(gear.sourceMod, gear.varName, &gear.id, nullptr)) {
				changed = true;
			} else if (Lower(gear.id) == Lower(oldId) && Lower(gear.sourceMod) == "cog.builtin" &&
				Lower(gear.varName) == "vampirichunger") {
				gear.id = newId;
				changed = true;
			}
		}

		for (auto& group : groups) {
			for (auto& gearId : group.settings.gearIds) {
				if (Lower(gearId) == Lower(oldId)) {
					gearId = newId;
					changed = true;
				}
			}
			std::unordered_map<std::string, bool> nextExempt;
			bool exemptChanged = false;
			for (const auto& [id, on] : group.settings.exemptFromGroupColors) {
				if (Lower(id) == Lower(oldId)) {
					nextExempt[newId] = on;
					exemptChanged = true;
					changed = true;
				} else {
					nextExempt[id] = on;
				}
			}
			if (exemptChanged) {
				group.settings.exemptFromGroupColors = std::move(nextExempt);
			}
		}

		for (auto& gauge : gauges) {
			if (MigrateBuiltinBloodlustIdentity(gauge.sourceMod, gauge.varName, nullptr, nullptr)) {
				changed = true;
			}
		}

		if (seenSources.erase(oldSeen)) {
			seenSources.insert(newSeen);
			changed = true;
		}

		if (changed) {
			logger::info(
				"COG: Migration Code for Transition from v1.01 or earlier to v1.1: "
				"COG.Builtin Bloodlust → VampiricHunger");
		}
		return changed;
	}


	bool MigrateLegacyGearExemptOntoGroups(std::vector<CogGroup>& groups)
	{
		if (g_pendingLegacyGearExempt.empty()) {
			return false;
		}
		bool folded = false;
		for (const auto& [gearId, on] : g_pendingLegacyGearExempt) {
			if (!on || gearId.empty()) {
				continue;
			}
			// Migration Code for Transition from v1.01 or earlier to v1.1:
			// Pending exempt may still name the pre-rename Bloodlust gear id.
			const auto foldId =
				Lower(gearId) == Lower(BuiltinBloodlustGearId()) ? BuiltinVampiricHungerGearId() : gearId;
			for (auto& group : groups) {
				if (std::find(group.settings.gearIds.begin(), group.settings.gearIds.end(), foldId) ==
					group.settings.gearIds.end()) {
					continue;
				}
				group.settings.exemptFromGroupColors[foldId] = true;
				folded = true;
				logger::info(
					"COG: Migration Code for Transition from v1.01 or earlier to v1.1: "
					"folded gear '{}' exemptFromGroupColors onto group '{}'",
					foldId,
					group.id);
				break;
			}
		}
		g_pendingLegacyGearExempt.clear();
		return folded;
	}


	void AppendGroup(CogJson::Writer& w, const CogGroup& g)
	{
		w.BeginObject();
		w.KeyString("id", g.id);
		w.KeyBool("locked", g.locked);
		w.KeyString("visibility", NormalizeGizmoVisibility(g.visibility));
		w.Key("settings");
		w.BeginObject();
		w.KeyString("displayName", g.settings.displayName);
		w.KeyBool("showLabel", g.settings.showLabel);
		w.KeyBool("showIcon", g.settings.showIcon);
		w.KeyBool("showNumber", g.settings.showNumber);
		w.KeyBool("barTrough", g.settings.barTrough);
		w.KeyString("fillFromHidden", g.settings.fillFromHidden);
		w.KeyString("numberFormat", g.settings.numberFormat);
		w.KeyBool("useGroupColors", g.settings.useGroupColors);
		WriteColorRampField(w, "iconColor", g.settings.iconColor);
		WriteColorRampField(w, "barColor", g.settings.barColor);
		w.KeyString("borderColor", g.settings.borderColor);
		w.KeyString("neutralIconMode", g.settings.neutralIconMode);
		w.KeyNumber("gearSize", g.settings.gearSize);
		w.KeyNumber("spacing", g.settings.spacing);
		w.KeyString("stack", g.settings.stack);
		{
			bool anyExempt = false;
			for (const auto& [id, on] : g.settings.exemptFromGroupColors) {
				if (on && !id.empty()) {
					anyExempt = true;
					break;
				}
			}
			if (anyExempt) {
				w.Key("exemptFromGroupColors");
				w.BeginObject();
				for (const auto& [id, on] : g.settings.exemptFromGroupColors) {
					if (on && !id.empty()) {
						w.KeyBool(id, true);
					}
				}
				w.EndObject();
			}
		}
		w.Key("gearIds");
		w.BeginArray();
		for (const auto& id : g.settings.gearIds) {
			w.String(id);
		}
		w.EndArray();
		w.EndObject();
		AppendPositionXYR(w, g.position);
		w.EndObject();
	}


	std::string GroupToJson(const CogGroup& g)
	{
		CogJson::Writer w(true);
		AppendGroup(w, g);
		auto s = w.str();
		if (!s.empty() && s.back() != '\n') {
			s.push_back('\n');
		}
		return s;
	}


	void AppendGear(CogJson::Writer& w, const CogGear& g)
	{
		w.BeginObject();
		w.KeyString("id", g.id);
		w.KeyString("sourceMod", g.sourceMod);
		w.KeyString("varName", g.varName);
		w.KeyBool("locked", g.locked);
		w.Key("defaults");
		AppendAppearance(w, g.defaults);
		w.Key("settings");
		AppendAppearance(w, g.settings);
		w.EndObject();
	}


	std::string GearToJson(const CogGear& g)
	{
		CogJson::Writer w(true);
		AppendGear(w, g);
		auto s = w.str();
		if (!s.empty() && s.back() != '\n') {
			s.push_back('\n');
		}
		return s;
	}

}
