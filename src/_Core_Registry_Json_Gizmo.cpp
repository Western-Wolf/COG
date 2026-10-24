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

	std::string SanitizeGizmoTypeId(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		std::string out;
		out.reserve(raw.size());
		for (char ch : raw) {
			if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.') {
				out.push_back(ch);
			}
		}
		return out;
	}


	bool IsBuiltinGizmoTypeId(std::string_view typeId)
	{
		// Any typeId starting with "cog-" is reserved for COG (built-ins + future products).
		return typeId.size() >= 4 && typeId.substr(0, 4) == "cog-";
	}


	std::string NormalizeGizmoType(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "cog-shout-meter" || raw == "shout-meter" || raw == "shoutmeter" || raw == "shout") {
			return "cog-shout-meter";
		}
		if (raw == "cog-feed" || raw == "feed" || raw == "feeds") {
			return "cog-feed";
		}
		if (raw == "cog-suppressor" || raw == "suppressor" || raw == "suppress") {
			return "cog-suppressor";
		}
		if (raw.empty() || raw == "cog-clock" || raw == "clock") {
			return "cog-clock";
		}
		auto cleaned = SanitizeGizmoTypeId(std::move(raw));
		return cleaned.empty() ? "cog-clock" : cleaned;
	}


	std::string ResolveGizmoInstanceTypeId(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy gizmo instance product key "type" becomes typeId (never written back on save).
		// Read raw before any normalize — NormalizeGizmoType("") invents cog-clock (create default only).
		std::string raw;
		if (ctx.Has(obj, "typeId")) {
			raw = ctx.GetString(obj, "typeId");
		}
		if (raw.empty() && ctx.Has(obj, "type")) {
			raw = ctx.GetString(obj, "type");
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		if (raw.empty()) {
			return {};
		}
		std::string lower = raw;
		std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		if (lower == "cog-shout-meter" || lower == "shout-meter" || lower == "shoutmeter" || lower == "shout") {
			return "cog-shout-meter";
		}
		if (lower == "cog-feed" || lower == "feed" || lower == "feeds") {
			return "cog-feed";
		}
		if (lower == "cog-suppressor" || lower == "suppressor" || lower == "suppress") {
			return "cog-suppressor";
		}
		if (lower == "cog-clock" || lower == "clock") {
			return "cog-clock";
		}
		auto cleaned = SanitizeGizmoTypeId(std::move(lower));
		// Invalid junk (sanitizes to empty) — unrecognized, not a silent clock.
		return cleaned;
	}


	std::string SanitizeViewScriptPath(std::string path)
	{
		path = TrimCopy(std::move(path));
		if (path.empty()) {
			return {};
		}
		std::replace(path.begin(), path.end(), '\\', '/');
		while (!path.empty() && path.front() == '/') {
			path.erase(path.begin());
		}
		if (path.find("..") != std::string::npos || path.find(':') != std::string::npos) {
			return {};
		}
		return path;
	}


	bool LooksLikeJsonObjectOrArray(std::string_view s)
	{
		std::size_t i = 0;
		while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) {
			++i;
		}
		if (i >= s.size()) {
			return false;
		}
		return s[i] == '{' || s[i] == '[';
	}


	std::string NormalizeFeedIconPlacement(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "right") {
			return "right";
		}
		return "left";
	}


	std::string NormalizeStackOrigin(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "top") {
			return "top";
		}
		return "bottom";
	}


	std::string NormalizeEffectsTimerMode(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "bar" || raw == "both") {
			return raw;
		}
		return "timer";
	}


	std::string NormalizeNotificationBackdropDirection(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "down") {
			return "down";
		}
		if (raw == "center") {
			return "center";
		}
		return "up";
	}


	std::string NormalizeShoutDrainOrigin(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "left") {
			return "left";
		}
		if (raw == "right") {
			return "right";
		}
		return "center";
	}


	std::string NormalizeShoutWordsMode(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "known") {
			return "known";
		}
		if (raw == "all") {
			return "all";
		}
		return "unlocked";
	}


	std::string NormalizeTimeFormat(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "12h" || raw == "12" || raw == "ampm") {
			return "12h";
		}
		return "24h";
	}


	std::string NormalizeGizmoDisplayMode(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "celestial") {
			return "celestial";
		}
		return "text";
	}


	std::string NormalizeCelestialShow(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "always" || raw == "all") {
			return "always";
		}
		if (raw == "sky") {
			return "sky";
		}
		return "outdoors";
	}


	std::string NormalizeClockTextAlign(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "left") {
			return "left";
		}
		if (raw == "right") {
			return "right";
		}
		return "center";
	}


	std::string NormalizeClockIcon(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "clock" || raw == "wait") {
			return "clock";
		}
		if (raw == "season" || raw == "seasons") {
			return "season";
		}
		return "none";
	}


	std::string DefaultDisplayLinesJson()
	{
		return "[[\"dayOfWeek\"],[\"day\",\"month\",\"year\"],[\"time24\"]]";
	}


	bool MergeMissingSettingsFromSchema(CogJson::Value& settings, std::string_view settingsSchemaJson)
	{
		if (!settings.IsObject()) {
			settings = CogJson::Value{};
			settings.type = CogJson::Type::Object;
		}
		if (settingsSchemaJson.empty() || settingsSchemaJson == "[]") {
			return false;
		}
		CogJson::Value schema;
		std::string err;
		if (!CogJson::Parse(settingsSchemaJson, schema, err) || !schema.IsArray()) {
			return false;
		}
		bool changed = false;
		for (const auto& field : schema.arrayValue) {
			if (!field.IsObject()) {
				continue;
			}
			const auto keyIt = field.objectValue.find("key");
			const auto defIt = field.objectValue.find("default");
			if (keyIt == field.objectValue.end() || !keyIt->second.IsString() || keyIt->second.stringValue.empty()) {
				continue;
			}
			if (defIt == field.objectValue.end()) {
				continue;
			}
			const auto& key = keyIt->second.stringValue;
			if (settings.objectValue.contains(key)) {
				continue;
			}
			settings.objectValue.emplace(key, defIt->second);
			changed = true;
		}
		return changed;
	}


	bool ParseSettingsObject(const std::string& settingsJson, CogJson::Value& out)
	{
		std::string err;
		if (!CogJson::Parse(settingsJson.empty() ? "{}" : settingsJson, out, err) || !out.IsObject()) {
			out = CogJson::Value{};
			out.type = CogJson::Type::Object;
			return false;
		}
		return true;
	}


	bool MergeGizmoSettingsFromType(CogGizmo& g, const CogGizmoType* type)
	{
		if (!type) {
			return false;
		}
		CogJson::Value settings;
		ParseSettingsObject(g.settingsJson, settings);
		if (!MergeMissingSettingsFromSchema(settings, type->settingsSchemaJson)) {
			return false;
		}
		auto next = CogJson::Stringify(settings, false);
		if (next.empty() || !LooksLikeJsonObjectOrArray(next)) {
			next = "{}";
		}
		if (g.settingsJson == next) {
			return false;
		}
		g.settingsJson = std::move(next);
		return true;
	}


	bool GizmoIsPlayActive(const CogGizmo& g)
	{
		return NormalizeGizmoVisibility(g.visibility) != "none";
	}


	bool GizmoSettingsBool(const CogGizmo& g, std::string_view key, bool fallback)
	{
		CogJson::Value root;
		if (!ParseSettingsObject(g.settingsJson, root)) {
			return fallback;
		}
		CogJson::ParseContext ctx;
		return ctx.GetBool(root, key, fallback);
	}


	std::string GizmoSettingsString(const CogGizmo& g, std::string_view key, std::string_view fallback)
	{
		CogJson::Value root;
		if (!ParseSettingsObject(g.settingsJson, root)) {
			return std::string(fallback);
		}
		CogJson::ParseContext ctx;
		auto value = ctx.GetString(root, key);
		if (value.empty()) {
			return std::string(fallback);
		}
		return value;
	}


	std::string GizmoSettingsRawJson(const CogGizmo& g, std::string_view key, std::string_view fallback)
	{
		CogJson::Value root;
		if (!ParseSettingsObject(g.settingsJson, root)) {
			return std::string(fallback);
		}
		CogJson::ParseContext ctx;
		return ctx.GetRawJson(root, key, fallback);
	}


	std::string GizmoDisplayName(const CogGizmo& g)
	{
		return GizmoSettingsString(g, "displayName");
	}


	CogGizmo ParseGizmo(const CogJson::Value& obj, CogJson::ParseContext& ctx, const CogGizmoType* type)
	{
		CogGizmo g;
		g.id = ctx.GetString(obj, "id");
		g.typeId = ResolveGizmoInstanceTypeId(obj, ctx);
		const bool hasVisibility = ctx.Has(obj, "visibility");
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy flat placement keys x/y/rotation/width/height move under nested "position" (never written back flat on save).
		// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
		const CogJson::Value* posObj = ctx.GetObject(obj, "position");
		const bool hasWidth = HasPlacementKey(obj, posObj, ctx, "width");
		const bool hasHeight = HasPlacementKey(obj, posObj, ctx, "height");
		g.position.x = ReadPlacementFloat(obj, posObj, ctx, "x", 0.1f);
		g.position.y = ReadPlacementFloat(obj, posObj, ctx, "y", 0.1f);
		g.position.rotation = ReadPlacementFloat(obj, posObj, ctx, "rotation", 0.0f);
		g.sourceMod = ctx.GetString(obj, "sourceMod");

		CogJson::Value settings;
		settings.type = CogJson::Type::Object;
		if (ctx.Has(obj, "settings")) {
			const auto raw = ctx.GetRawJson(obj, "settings", "{}");
			std::string err;
			CogJson::Value parsed;
			if (CogJson::Parse(raw, parsed, err) && parsed.IsObject()) {
				settings = std::move(parsed);
			}
		}
		// Caller may have looked up `type` before Resolve — drop a mismatched record.
		if (type && type->typeId != g.typeId) {
			type = nullptr;
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Legacy root displayName (and older title key name) move under nested settings.displayName (never written on root again).
		// Prefer settings.displayName; else root displayName; else legacy root name.
		{
			std::string title;
			const auto it = settings.objectValue.find("displayName");
			if (it != settings.objectValue.end() && it->second.IsString() && !it->second.stringValue.empty()) {
				title = it->second.stringValue;
			}
			if (title.empty()) {
				title = ctx.GetString(obj, "displayName");
			}
			if (title.empty()) {
				title = ctx.GetString(obj, "name");
			}
			if (!title.empty()) {
				CogJson::Value titleVal;
				titleVal.type = CogJson::Type::String;
				titleVal.stringValue = title;
				settings.objectValue["displayName"] = std::move(titleVal);
			}
			if (g.id.empty()) {
				g.id = FileStem(title);
			}
		}
		// Instance settings ← type schema defaults ← (universal leave-absent for ensure/create).
		if (type) {
			MergeMissingSettingsFromSchema(settings, type->settingsSchemaJson);
		}

		if (hasVisibility) {
			g.visibility = NormalizeGizmoVisibility(ctx.GetString(obj, "visibility"));
		} else if (type) {
			g.visibility = NormalizeGizmoVisibility(type->defaultVisibility);
		} else {
			g.visibility = BuiltinDefaultVisibilityForType(g.typeId);
		}

		float defaultW = type ? type->defaultWidth : 240.0f;
		float defaultH = type ? type->defaultHeight : 48.0f;
		if (!type) {
			if (g.typeId == "cog-feed") {
				defaultW = 400.0f;
				defaultH = 400.0f;
			} else if (g.typeId == "cog-suppressor") {
				defaultW = 100.0f;
				defaultH = 100.0f;
			} else if (g.typeId == "cog-clock") {
				defaultW = 275.0f;
				defaultH = 40.0f;
			} else if (g.typeId == "cog-shout-meter") {
				defaultW = 220.0f;
				defaultH = 48.0f;
			}
		}
		if (g.typeId == "cog-clock") {
			std::string modeRaw;
			const auto it = settings.objectValue.find("displayMode");
			if (it != settings.objectValue.end() && it->second.IsString()) {
				modeRaw = it->second.stringValue;
			}
			if (NormalizeGizmoDisplayMode(modeRaw) == "celestial") {
				defaultW = 275.0f;
				defaultH = 40.0f;
			}
		}
		g.position.width = hasWidth ? ReadPlacementFloat(obj, posObj, ctx, "width", defaultW) : defaultW;
		g.position.height = hasHeight ? ReadPlacementFloat(obj, posObj, ctx, "height", defaultH) : defaultH;
		if (g.position.width < 32.0f) {
			g.position.width = 32.0f;
		}
		if (g.position.height < 6.0f) {
			g.position.height = 6.0f;
		}

		g.settingsJson = CogJson::Stringify(settings, false);
		if (g.settingsJson.empty() || !LooksLikeJsonObjectOrArray(g.settingsJson)) {
			g.settingsJson = "{}";
		}
		// Seed from type-scoped UpdateGizmo stash (runtime-only; not on disk).
		if (type && !type->livePayloadJson.empty()) {
			g.livePayloadJson = type->livePayloadJson;
		}
		return g;
	}


	CogGizmoType ParseGizmoType(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		CogGizmoType t;
		t.typeId = SanitizeGizmoTypeId(ctx.GetString(obj, "typeId"));
		if (t.typeId.empty()) {
			t.typeId = SanitizeGizmoTypeId(ctx.GetString(obj, "id"));
		}
		t.sourceMod = ctx.GetString(obj, "sourceMod");
		t.displayName = ctx.GetString(obj, "displayName");
		if (t.displayName.empty()) {
			t.displayName = t.typeId;
		}
		t.galleryIcon = NormalizeIcon(ctx.GetString(obj, "galleryIcon"));
		t.defaultWidth = ctx.GetFloat(obj, "defaultWidth", 240.0f);
		t.defaultHeight = ctx.GetFloat(obj, "defaultHeight", 48.0f);
		if (t.defaultWidth <= 0.0f) {
			t.defaultWidth = 240.0f;
		}
		if (t.defaultHeight <= 0.0f) {
			t.defaultHeight = 48.0f;
		}
		t.defaultVisibility = NormalizeGizmoVisibility(ctx.GetString(obj, "defaultVisibility"));
		t.viewScript = SanitizeViewScriptPath(ctx.GetString(obj, "viewScript"));
		if (ctx.Has(obj, "settingsSchema")) {
			t.settingsSchemaJson = ctx.GetRawJson(obj, "settingsSchema", "[]");
		} else if (ctx.Has(obj, "settingsSchemaJson")) {
			t.settingsSchemaJson = ctx.GetRawJson(obj, "settingsSchemaJson", "[]");
		} else {
			t.settingsSchemaJson = "[]";
		}
		if (t.settingsSchemaJson.empty() || !LooksLikeJsonObjectOrArray(t.settingsSchemaJson)) {
			t.settingsSchemaJson = "[]";
		}
		return t;
	}


	void AppendGizmo(CogJson::Writer& w, const CogGizmo& g)
	{
		w.BeginObject();
		w.KeyString("id", g.id);
		w.KeyString("typeId", g.typeId);
		// Always persist visibility. Omitting "hud" made Feed's JS ensure treat a missing
		// key as "ui" (new-feed default) and reset HUD Visible on the next snapshot push.
		w.KeyString("visibility", NormalizeGizmoVisibility(g.visibility));
		if (!g.sourceMod.empty()) {
			w.KeyString("sourceMod", g.sourceMod);
		}
		// Instance title lives in settings.displayName (never written on root).
		w.KeyRaw("settings", g.settingsJson.empty() ? "{}" : g.settingsJson);
		AppendBoxPosition(w, g.position);
		w.EndObject();
	}


	std::string GizmoToJson(const CogGizmo& g)
	{
		CogJson::Writer w(true);
		AppendGizmo(w, g);
		auto s = w.str();
		if (!s.empty() && s.back() != '\n') {
			s.push_back('\n');
		}
		return s;
	}


	void AppendGizmoType(CogJson::Writer& w, const CogGizmoType& t)
	{
		w.BeginObject();
		w.KeyString("typeId", t.typeId);
		w.KeyString("sourceMod", t.sourceMod);
		w.KeyString("displayName", t.displayName);
		w.KeyString("galleryIcon", t.galleryIcon);
		w.KeyNumber("defaultWidth", t.defaultWidth);
		w.KeyNumber("defaultHeight", t.defaultHeight);
		w.KeyString("defaultVisibility", NormalizeGizmoVisibility(t.defaultVisibility));
		w.KeyString("viewScript", t.viewScript);
		w.KeyRaw("settingsSchema", t.settingsSchemaJson.empty() ? "[]" : t.settingsSchemaJson);
		w.EndObject();
	}


	std::string GizmoTypeToJson(const CogGizmoType& t)
	{
		CogJson::Writer w(true);
		AppendGizmoType(w, t);
		auto s = w.str();
		if (!s.empty() && s.back() != '\n') {
			s.push_back('\n');
		}
		return s;
	}

}
