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


	// Migration Code for Transition from v1.01 or earlier to v1.1:
	// Legacy flat placement keys x/y/rotation[/width/height] move under nested "display" (never written back flat on save).
	// Legacy posAnchor is ignored (placement is always AABB top-left / tlc).
	float ReadPlacementFloat(
		const CogJson::Value& obj,
		const CogJson::Value* displayObj,
		CogJson::ParseContext& ctx,
		const char* key,
		float fallback)
	{
		if (displayObj && ctx.Has(*displayObj, key)) {
			return ctx.GetFloat(*displayObj, key, fallback);
		}
		return ctx.GetFloat(obj, key, fallback);
	}


	bool HasPlacementKey(const CogJson::Value& obj, const CogJson::Value* displayObj, CogJson::ParseContext& ctx, const char* key)
	{
		return (displayObj && ctx.Has(*displayObj, key)) || ctx.Has(obj, key);
	}


	float ClampMaxAlpha(float v)
	{
		if (v < 0.0f) {
			return 0.0f;
		}
		if (v > 100.0f) {
			return 100.0f;
		}
		return v;
	}


	void AppendDisplayXYR(CogJson::Writer& w, const CogDisplay& p)
	{
		w.Key("display");
		w.BeginObject();
		w.KeyNumber("x", p.x);
		w.KeyNumber("y", p.y);
		w.KeyNumber("rotation", p.rotation);
		w.KeyNumber("maxAlpha", ClampMaxAlpha(p.maxAlpha));
		w.EndObject();
	}


	void AppendBoxDisplay(CogJson::Writer& w, const CogBoxDisplay& p)
	{
		w.Key("display");
		w.BeginObject();
		w.KeyNumber("x", p.x);
		w.KeyNumber("y", p.y);
		w.KeyNumber("rotation", p.rotation);
		w.KeyNumber("width", p.width);
		w.KeyNumber("height", p.height);
		w.KeyNumber("maxAlpha", ClampMaxAlpha(p.maxAlpha));
		w.EndObject();
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

}
