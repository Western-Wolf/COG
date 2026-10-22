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

	std::string Lower(std::string s)
	{
		std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return s;
	}

	// Case-insensitive — older gear JSON used "stamina"/"magicka" while Register uses "Stamina"/"Magicka".
	/** Single asset path (not a JSON stop list). Rejects .json pack-file leftovers. */
	std::string NormalizeIconPathOnly(std::string raw)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		for (char& c : raw) {
			if (c == '\\') {
				c = '/';
			}
		}
		if (raw.empty() || raw.find("..") != std::string::npos || raw.find(':') != std::string::npos) {
			return {};
		}
		while (raw.starts_with("./") || raw.starts_with("/")) {
			raw.erase(0, raw.starts_with("./") ? 2 : 1);
		}
		const auto lower = Lower(raw);
		if (lower.starts_with("assets/imports/icons/")) {
			raw.erase(0, 22);
		} else if (lower.starts_with("imports/icons/")) {
			raw.erase(0, 14);
		} else if (lower.starts_with("assets/icons/")) {
			raw.erase(0, 13);
		} else if (lower.starts_with("icons/")) {
			raw.erase(0, 6);
		}
		const auto slash = raw.rfind('/');
		const auto base = slash == std::string::npos ? raw : raw.substr(slash + 1);
		if (!raw.empty() && base.find('.') == std::string::npos) {
			raw += ".svg";
		}
		if (Lower(base).ends_with(".json") || Lower(raw).ends_with(".json")) {
			return {};
		}
		return raw;
	}

	std::string FormatIconRamp(
		std::vector<std::pair<double, std::string>> stops)
	{
		if (stops.empty()) {
			return {};
		}
		std::sort(stops.begin(), stops.end(), [](const auto& a, const auto& b) {
			return a.first < b.first;
		});
		std::vector<std::pair<double, std::string>> uniq;
		uniq.reserve(stops.size());
		for (auto& s : stops) {
			if (!uniq.empty() && std::abs(uniq.back().first - s.first) < 1e-9) {
				uniq.back() = std::move(s);
			} else {
				uniq.push_back(std::move(s));
			}
		}
		if (uniq.size() == 1) {
			return uniq.front().second;
		}
		std::ostringstream o;
		o << "[";
		for (std::size_t i = 0; i < uniq.size(); ++i) {
			if (i) {
				o << ",";
			}
			o << "{\"pct\":" << uniq[i].first << ",\"path\":\"" << EscapeJson(uniq[i].second) << "\"}";
		}
		o << "]";
		return o.str();
	}

	/** Plain path or JSON [{pct,path|icon}] stop list (mirrors iconColor ramps). */
	std::string NormalizeIcon(std::string raw)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		if (raw.empty()) {
			return {};
		}
		if (raw.front() == '[') {
			CogJson::Value root;
			std::string err;
			if (!CogJson::Parse(raw, root, err) || !root.IsArray()) {
				return {};
			}
			std::vector<std::pair<double, std::string>> stops;
			stops.reserve(root.arrayValue.size());
			for (const auto& item : root.arrayValue) {
				std::string path;
				double pct = 0;
				if (item.IsString()) {
					path = NormalizeIconPathOnly(item.stringValue);
				} else if (item.IsObject()) {
					if (const auto* p = item.Find("path"); p && p->IsString()) {
						path = NormalizeIconPathOnly(p->stringValue);
					} else if (const auto* ic = item.Find("icon"); ic && ic->IsString()) {
						path = NormalizeIconPathOnly(ic->stringValue);
					}
					if (const auto* pctKey = item.Find("pct"); pctKey && pctKey->IsNumber()) {
						pct = pctKey->numberValue;
					} else if (const auto* percentKey = item.Find("percent"); percentKey && percentKey->IsNumber()) {
						pct = percentKey->numberValue;
					}
				}
				if (path.empty()) {
					continue;
				}
				if (pct < 0) {
					pct = 0;
				}
				if (pct > 100) {
					pct = 100;
				}
				stops.emplace_back(pct, std::move(path));
			}
			return FormatIconRamp(std::move(stops));
		}
		return NormalizeIconPathOnly(std::move(raw));
	}

	std::string NormalizeEndCapMode(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "border") {
			return "border";
		}
		if (raw == "endcap") {
			return "endcap";
		}
		return {};
	}

	/** Icon path for end art under Endcaps/. */
	std::string NormalizeEndCapArt(std::string raw)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		for (char& c : raw) {
			if (c == '\\') {
				c = '/';
			}
		}
		if (raw.empty() || raw.find("..") != std::string::npos || raw.find(':') != std::string::npos) {
			return {};
		}
		while (raw.starts_with("./") || raw.starts_with("/")) {
			raw.erase(0, raw.starts_with("./") ? 2 : 1);
		}
		auto lower = Lower(raw);
		if (lower.starts_with("assets/icons/")) {
			raw.erase(0, 13);
			lower = Lower(raw);
		} else if (lower.starts_with("icons/")) {
			raw.erase(0, 6);
			lower = Lower(raw);
		}
		if (lower.starts_with("endcaps/")) {
			raw = "Endcaps/" + raw.substr(8);
			lower = Lower(raw);
		}
		if (raw.find('/') == std::string::npos) {
			if (raw.find('.') == std::string::npos) {
				raw += ".svg";
			}
			raw = "Endcaps/" + raw;
			lower = Lower(raw);
		} else {
			const auto slash = raw.rfind('/');
			const auto base = slash == std::string::npos ? raw : raw.substr(slash + 1);
			if (!raw.empty() && base.find('.') == std::string::npos) {
				raw += ".svg";
			}
			lower = Lower(raw);
		}
		return raw;
	}

	std::string NormalizeStack(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "left" || raw == "right" || raw == "above" || raw == "below") {
			return raw;
		}
		if (raw == "top") {
			return "above";
		}
		if (raw == "bottom") {
			return "below";
		}
		return "below";
	}

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

	std::string NormalizeIconColorMode(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "border" || raw == "useborder" || raw == "use border colour" || raw == "use border color") {
			return "border";
		}
		if (raw == "bar" || raw == "usebar" || raw == "use bar colour" || raw == "use bar color") {
			return "bar";
		}
		if (raw == "label" || raw == "uselabel" || raw == "use label colour" || raw == "use label color") {
			return "label";
		}
		return "keep";
	}

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
		return "keep";
	}

	std::string CanonicalPercentMode(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "bar") {
			return "bar";
		}
		if (raw == "barpercent" || raw == "bar-percent" || raw == "bar_percentage" || raw == "barpercentage") {
			return "barPercent";
		}
		if (raw == "bartotal" || raw == "bar-total" || raw == "bar_total") {
			return "barTotal";
		}
		if (raw == "percent" || raw == "percentage") {
			return "percent";
		}
		if (raw == "total") {
			return "total";
		}
		return {};
	}

	std::string NormalizeHexColor(std::string raw, const char* fallback)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		if (raw.empty()) {
			return fallback;
		}
		if (raw.front() != '#') {
			return fallback;
		}
		auto hexOk = [](unsigned char c) {
			return std::isxdigit(c) != 0;
		};
		if (raw.size() == 4) {
			if (!hexOk(raw[1]) || !hexOk(raw[2]) || !hexOk(raw[3])) {
				return fallback;
			}
			std::string out = "#";
			for (int i = 1; i <= 3; ++i) {
				const char c = static_cast<char>(std::tolower(static_cast<unsigned char>(raw[static_cast<std::size_t>(i)])));
				out.push_back(c);
				out.push_back(c);
			}
			return out;
		}
		if (raw.size() == 7) {
			for (std::size_t i = 1; i < raw.size(); ++i) {
				if (!hexOk(static_cast<unsigned char>(raw[i]))) {
					return fallback;
				}
			}
			for (std::size_t i = 1; i < raw.size(); ++i) {
				raw[i] = static_cast<char>(std::tolower(static_cast<unsigned char>(raw[i])));
			}
			return raw;
		}
		// Scaleform / mods often use #AARRGGBB — drop alpha, keep RGB.
		if (raw.size() == 9) {
			for (std::size_t i = 1; i < raw.size(); ++i) {
				if (!hexOk(static_cast<unsigned char>(raw[i]))) {
					return fallback;
				}
			}
			std::string out = "#";
			for (std::size_t i = 3; i < raw.size(); ++i) {
				out.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(raw[i]))));
			}
			return out;
		}
		return fallback;
	}

	std::string OptionalHexColor(std::string raw)
	{
		return NormalizeHexColor(std::move(raw), "");
	}

	bool LooksLikePlainHexColor(std::string_view raw)
	{
		std::string t(raw);
		while (!t.empty() && std::isspace(static_cast<unsigned char>(t.front()))) {
			t.erase(t.begin());
		}
		while (!t.empty() && std::isspace(static_cast<unsigned char>(t.back()))) {
			t.pop_back();
		}
		if (t.empty() || t.front() != '#') {
			return false;
		}
		return !OptionalHexColor(t).empty();
	}

	namespace
	{
		struct ColorStop
		{
			double pct = 0;
			std::string color;
		};

		std::string FormatColorRamp(std::vector<ColorStop> stops)
		{
			if (stops.empty()) {
				return {};
			}
			std::sort(stops.begin(), stops.end(), [](const ColorStop& a, const ColorStop& b) {
				return a.pct < b.pct;
			});
			// Collapse duplicate pct — last wins.
			std::vector<ColorStop> uniq;
			uniq.reserve(stops.size());
			for (const auto& s : stops) {
				if (!uniq.empty() && std::abs(uniq.back().pct - s.pct) < 1e-9) {
					uniq.back() = s;
				} else {
					uniq.push_back(s);
				}
			}
			if (uniq.size() == 1) {
				return uniq.front().color;
			}
			std::ostringstream o;
			o << "[";
			for (std::size_t i = 0; i < uniq.size(); ++i) {
				if (i) {
					o << ",";
				}
				o << "{\"pct\":" << uniq[i].pct << ",\"color\":\"" << EscapeJson(uniq[i].color) << "\"}";
			}
			o << "]";
			return o.str();
		}

		std::vector<ColorStop> ParseColorStopsJson(std::string_view json)
		{
			CogJson::Value root;
			std::string err;
			if (!CogJson::Parse(std::string(json), root, err) || !root.IsArray()) {
				return {};
			}
			std::vector<ColorStop> stops;
			stops.reserve(root.arrayValue.size());
			for (const auto& item : root.arrayValue) {
				if (!item.IsObject()) {
					continue;
				}
				const auto* colorVal = item.Find("color");
				if (!colorVal || !colorVal->IsString()) {
					continue;
				}
				auto color = OptionalHexColor(colorVal->stringValue);
				if (color.empty()) {
					continue;
				}
				double pct = 0;
				if (const auto* pctKey = item.Find("pct"); pctKey && pctKey->IsNumber()) {
					pct = pctKey->numberValue;
				} else if (const auto* percentKey = item.Find("percent"); percentKey && percentKey->IsNumber()) {
					pct = percentKey->numberValue;
				}
				if (pct < 0) {
					pct = 0;
				}
				if (pct > 100) {
					pct = 100;
				}
				stops.push_back(ColorStop{ pct, std::move(color) });
			}
			return stops;
		}
	}

	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Older startColor/endColor (and Register legacyEndColor) pairs become iconColor (single hex or 0%/100% ramp).
	std::string MigrateLegacyIconPair(std::string startColor, std::string endColor)
	{
		auto start = OptionalHexColor(std::move(startColor));
		auto end = OptionalHexColor(std::move(endColor));
		if (start.empty() && end.empty()) {
			return {};
		}
		if (start.empty()) {
			return end;
		}
		if (end.empty() || end == start) {
			return start;
		}
		return FormatColorRamp({ { 0, start }, { 100, end } });
	}

	std::string NormalizeColorRamp(std::string raw)
	{
		raw = TrimCopy(std::move(raw));
		if (raw.empty()) {
			return {};
		}
		if (raw.front() == '[') {
			auto stops = ParseColorStopsJson(raw);
			return FormatColorRamp(std::move(stops));
		}
		return OptionalHexColor(std::move(raw));
	}

	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Register callers that still pass plain hex iconColor + legacyEndColor become a two-stop ramp.
	std::string NormalizeRegisterIconColor(std::string iconColor, std::string legacyEndColor)
	{
		auto end = OptionalHexColor(std::move(legacyEndColor));
		const auto trimmed = TrimCopy(iconColor);
		if (!end.empty() && LooksLikePlainHexColor(trimmed)) {
			return MigrateLegacyIconPair(trimmed, end);
		}
		return NormalizeColorRamp(std::move(iconColor));
	}

	std::string ReadColorRampField(
		const CogJson::Value& obj,
		CogJson::ParseContext& ctx,
		std::string_view key,
		bool migrateLegacyIconPair)
	{
		std::string ramp;
		if (const auto* v = obj.Find(std::string(key)); v) {
			if (v->IsString()) {
				ramp = NormalizeColorRamp(v->stringValue);
			} else if (v->IsArray()) {
				ramp = NormalizeColorRamp(ctx.GetRawJson(obj, key, "[]"));
			}
		}
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// Disk JSON with startColor/endColor and no iconColor migrates into iconColor.
		if (ramp.empty() && migrateLegacyIconPair) {
			ramp = MigrateLegacyIconPair(ctx.GetString(obj, "startColor"), ctx.GetString(obj, "endColor"));
		}
		return ramp;
	}

	void WriteColorRampField(CogJson::Writer& w, std::string_view key, const std::string& ramp)
	{
		if (ramp.empty()) {
			w.KeyString(key, "");
			return;
		}
		if (!ramp.empty() && ramp.front() == '[') {
			w.KeyRaw(key, ramp);
			return;
		}
		w.KeyString(key, ramp);
	}

	void AppendColorRampJson(std::ostringstream& o, std::string_view key, const std::string& ramp)
	{
		o << "\"" << key << "\":";
		if (ramp.empty()) {
			o << "\"\"";
		} else if (ramp.front() == '[') {
			o << ramp;
		} else {
			o << "\"" << EscapeJson(ramp) << "\"";
		}
	}

	std::string ReadIconField(const CogJson::Value& obj, CogJson::ParseContext& ctx, std::string_view key)
	{
		if (const auto* v = obj.Find(std::string(key)); v) {
			if (v->IsString()) {
				return NormalizeIcon(v->stringValue);
			}
			if (v->IsArray()) {
				return NormalizeIcon(ctx.GetRawJson(obj, key, "[]"));
			}
		}
		return {};
	}

	void WriteIconField(CogJson::Writer& w, std::string_view key, const std::string& icon)
	{
		WriteColorRampField(w, key, icon);
	}

	void AppendIconJson(std::ostringstream& o, std::string_view key, const std::string& icon)
	{
		AppendColorRampJson(o, key, icon);
	}

	std::string TrimCopy(std::string raw)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		return raw;
	}

	std::string NormalizeHideAt(std::string raw)
	{
		return NormalizeHideAt(std::move(raw), {});
	}

	std::string NormalizeHideAt(std::string raw, std::string_view varType)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		if (raw.empty()) {
			return {};
		}
		const char op = raw.front();
		if (op != '<' && op != '>') {
			return {};
		}
		raw.erase(raw.begin());
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		if (raw.empty()) {
			return {};
		}
		char* end = nullptr;
		const double parsed = std::strtod(raw.c_str(), &end);
		if (!end || end == raw.c_str()) {
			return {};
		}
		bool asPercent = false;
		while (*end && std::isspace(static_cast<unsigned char>(*end))) {
			++end;
		}
		if (*end == '%') {
			asPercent = true;
			++end;
			while (*end && std::isspace(static_cast<unsigned char>(*end))) {
				++end;
			}
		}
		if (*end != '\0' || !std::isfinite(parsed) || parsed < 0.0) {
			return {};
		}

		const auto t = Lower(std::string(varType));
		const bool absolute =
			t == "count" || t == "counter" || t == "timer" || t == "countdown" || t == "timer update";

		double value = parsed;
		if (absolute && !asPercent) {
			// Count / timer: keep the number as entered (seconds or raw count).
		} else {
			// Percent: explicit % → 0–1 ratio; otherwise value must already be 0–1.
			if (asPercent) {
				value /= 100.0;
			}
			if (value > 1.0) {
				return {};
			}
		}

		char buf[32];
		std::snprintf(buf, sizeof(buf), "%c%.6f", op, value);
		std::string out = buf;
		while (out.size() > 3 && out.back() == '0') {
			out.pop_back();
		}
		if (!out.empty() && out.back() == '.') {
			out.pop_back();
		}
		return out;
	}

	std::string NormalizeEditorKey(const std::string& raw)
	{
		auto name = CogKeys::NormalizeKeyName(raw);
		if (name.empty()) {
			return CogKeys::kDefaultEditorKey;
		}
		return name;
	}

	std::string NormalizeNeutralIconMode(std::string raw)
	{
		const auto mode = Lower(raw);
		if (mode == "bar" || mode == "border" || mode == "icon0" || mode == "icon50" || mode == "icon100") {
			return mode;
		}
		return "white";
	}

	std::string NormalizeFillFromHidden(std::string raw)
	{
		const auto mode = Lower(std::move(raw));
		if (mode == "alpha" || mode == "up" || mode == "down" || mode == "alphaup" || mode == "alphadown") {
			if (mode == "alphaup") {
				return "alphaUp";
			}
			if (mode == "alphadown") {
				return "alphaDown";
			}
			return mode;
		}
		return {};
	}

	std::string EscapeJson(const std::string& s)
	{
		std::string out;
		out.reserve(s.size() + 8);
		for (unsigned char c : s) {
			switch (c) {
			case '"':
				out += "\\\"";
				break;
			case '\\':
				out += "\\\\";
				break;
			case '\n':
				out += "\\n";
				break;
			case '\r':
				out += "\\r";
				break;
			case '\t':
				out += "\\t";
				break;
			default:
				if (c < 0x20) {
					char buf[8];
					std::snprintf(buf, sizeof(buf), "\\u%04x", c);
					out += buf;
				} else {
					out += static_cast<char>(c);
				}
				break;
			}
		}
		return out;
	}

	std::string FileStem(const std::string& id)
	{
		std::string s;
		s.reserve(id.size());
		for (unsigned char c : id) {
			if (std::isalnum(c) || c == '-' || c == '_') {
				s += static_cast<char>(c);
			} else {
				s += '_';
			}
		}
		return s.empty() ? "item" : s;
	}

	std::string NormalizeHudKeyListJson(std::string raw)
	{
		raw = TrimCopy(std::move(raw));
		if (raw.size() < 2 || raw.front() != '[' || raw.back() != ']') {
			return "[]";
		}
		return raw;
	}

	std::vector<std::string> ParseStringArrayJson(std::string_view raw)
	{
		if (raw.empty() || raw == "[]") {
			return {};
		}
		CogJson::Value v;
		std::string err;
		if (!CogJson::Parse(raw, v, err) || !v.IsArray()) {
			return {};
		}
		std::vector<std::string> out;
		out.reserve(v.arrayValue.size());
		for (const auto& elem : v.arrayValue) {
			if (elem.IsString()) {
				out.push_back(elem.stringValue);
			}
		}
		return out;
	}

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

	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation[/width/height] move under nested "position" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	float ReadPlacementFloat(
		const CogJson::Value& obj,
		const CogJson::Value* posObj,
		CogJson::ParseContext& ctx,
		const char* key,
		float fallback)
	{
		if (posObj && ctx.Has(*posObj, key)) {
			return ctx.GetFloat(*posObj, key, fallback);
		}
		return ctx.GetFloat(obj, key, fallback);
	}

	bool HasPlacementKey(const CogJson::Value& obj, const CogJson::Value* posObj, CogJson::ParseContext& ctx, const char* key)
	{
		return (posObj && ctx.Has(*posObj, key)) || ctx.Has(obj, key);
	}

	void AppendPositionXYR(CogJson::Writer& w, const CogPosition& p)
	{
		w.Key("position");
		w.BeginObject();
		w.KeyNumber("x", p.x);
		w.KeyNumber("y", p.y);
		w.KeyNumber("rotation", p.rotation);
		w.EndObject();
	}

	void AppendBoxPosition(CogJson::Writer& w, const CogBoxPosition& p)
	{
		w.Key("position");
		w.BeginObject();
		w.KeyNumber("x", p.x);
		w.KeyNumber("y", p.y);
		w.KeyNumber("rotation", p.rotation);
		w.KeyNumber("width", p.width);
		w.KeyNumber("height", p.height);
		w.EndObject();
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

	void NoteMigration(CogJson::ParseContext& ctx, std::string_view detail)
	{
		logger::info(
			"COG: Migration Code for Transition from v1.01 or earlier to v1.1: {} — {}",
			ctx.path.empty() ? "(config)" : ctx.path,
			detail);
		ctx.repaired = true;
	}

	bool NoteIfHas(CogJson::ParseContext& ctx, const CogJson::Value& obj, const char* key, std::string_view detail)
	{
		if (!ctx.Has(obj, key)) {
			return false;
		}
		NoteMigration(ctx, detail);
		return true;
	}

	bool NoteIfHasAny(
		CogJson::ParseContext& ctx,
		const CogJson::Value& obj,
		std::initializer_list<const char*> keys,
		std::string_view detail)
	{
		for (const char* key : keys) {
			if (ctx.Has(obj, key)) {
				NoteMigration(ctx, detail);
				return true;
			}
		}
		return false;
	}

	bool KeyInList(std::string_view key, std::initializer_list<const char*> keys)
	{
		for (const char* k : keys) {
			if (key == k) {
				return true;
			}
		}
		return false;
	}

	/** Log + mark repaired for keys that are neither allowlisted nor consumed legacy. */
	void WarnUnknownKeys(
		CogJson::ParseContext& ctx,
		const CogJson::Value& obj,
		std::initializer_list<const char*> allowed,
		std::initializer_list<const char*> legacyConsumed,
		std::string_view bagLabel)
	{
		if (!obj.IsObject()) {
			return;
		}
		for (const auto& [key, _] : obj.objectValue) {
			if (KeyInList(key, allowed) || KeyInList(key, legacyConsumed)) {
				continue;
			}
			logger::warn(
				"COG: stripped unknown {} key '{}' from {}",
				bagLabel,
				key,
				ctx.path.empty() ? "(config)" : ctx.path);
			ctx.repaired = true;
		}
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
		// Legacy flat placement keys x/y/rotation/width/height move under nested "position" (never written back flat on save).
		// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
		{
			const CogJson::Value* posObj = ctx.GetObject(obj, "position");
			if (!posObj) {
				NoteIfHasAny(
					ctx, obj, { "x", "y", "rotation", "width", "height", "posAnchor" },
					"flat placement / posAnchor → nested position (posAnchor ignored)");
			}
			g.position.x = ReadPlacementFloat(obj, posObj, ctx, "x", 0.1f);
			g.position.y = ReadPlacementFloat(obj, posObj, ctx, "y", 0.1f);
			g.position.rotation = ReadPlacementFloat(obj, posObj, ctx, "rotation", 0.0f);
			g.position.width = ReadPlacementFloat(obj, posObj, ctx, "width", 240.0f);
			g.position.height = ReadPlacementFloat(obj, posObj, ctx, "height", 24.0f);
			if (g.position.width < 8.0f) {
				g.position.width = 8.0f;
			}
			if (g.position.height < 4.0f) {
				g.position.height = 4.0f;
			}
			if (posObj) {
				WarnUnknownKeys(
					ctx, *posObj, { "x", "y", "rotation", "width", "height" }, {}, "gauge.position");
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
				"alwaysVisible", "barTrough", "numberFormat", "pictureIcon", "pictureDirection",
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
			auto rawIcon = settingString("iconColorMode");
			s.iconColorMode = NormalizeIconColorMode(rawIcon);
			if (rawIcon.empty()) {
				s.iconColorMode = "border";
			}
		}
		{
			auto rawLabel = settingString("labelColorMode");
			s.labelColorMode = NormalizeLabelColorMode(rawLabel);
			if (rawLabel.empty()) {
				s.labelColorMode = "border";
			}
		}
		{
			auto raw = settingString("numberColorMode");
			s.numberColorMode = NormalizeLabelColorMode(raw);
			if (raw.empty()) {
				s.numberColorMode = "border";
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
		{
			const bool frameDefault = s.type == "frame";
			if (hasSetting("alwaysVisible")) {
				s.alwaysVisible = settingBool("alwaysVisible", frameDefault);
			} else {
				s.alwaysVisible = frameDefault;
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
				  "displayMode", "alwaysVisible", "barTrough", "numberFormat", "pictureIcon", "pictureDirection",
				  "pictureRotation", "pictureEmpty", "pictureFull", "pictureFade" },
				{},
				"gauge.settings");
		}
		WarnUnknownKeys(
			ctx,
			obj,
			{ "id", "locked", "visibility", "position", "sourceMod", "varName", "settings" },
			{ "visible", "gearMod", "gearName", "displayName", "name", "type", "shape", "borderColor",
			  "borderThickness", "troughOpacity", "endCapMode", "endCap", "endCapOverlap", "showIcon",
			  "showLabel", "showNumber", "fillDirection", "iconColorMode", "labelColorMode", "numberColorMode",
			  "numberAsPercent", "fontSize", "frameShape", "frameFillColor", "frameBorderColor",
			  "frameBorderThickness", "insideSize", "displayMode", "alwaysVisible", "barTrough", "numberFormat",
			  "pictureIcon", "pictureDirection", "pictureRotation", "pictureEmpty", "pictureFull", "pictureFade",
			  "x", "y", "rotation", "width", "height", "posAnchor" },
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
		w.KeyBool("alwaysVisible", s.alwaysVisible);
		w.KeyBool("barTrough", s.barTrough);
		w.KeyString("numberFormat", s.numberFormat);
		w.KeyString("pictureIcon", s.pictureIcon);
		w.KeyString("pictureDirection", s.pictureDirection);
		w.KeyNumber("pictureRotation", s.pictureRotation);
		w.KeyString("pictureEmpty", s.pictureEmpty);
		w.KeyString("pictureFull", s.pictureFull);
		w.KeyString("pictureFade", s.pictureFade);
		w.EndObject();
		AppendBoxPosition(w, g.position);
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

	std::string NormalizeGizmoVisibility(std::string raw)
	{
		std::transform(raw.begin(), raw.end(), raw.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		if (raw == "none") {
			return "none";
		}
		if (raw == "ui") {
			return "ui";
		}
		// Default / "hud": HUD Visible — only while the vanilla HUD is shown.
		return "hud";
	}

	std::string BuiltinDefaultVisibilityForType(std::string_view typeId)
	{
		if (typeId == "cog-feed") {
			return "ui";
		}
		if (typeId == "cog-suppressor") {
			return "none";
		}
		return "hud";
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
