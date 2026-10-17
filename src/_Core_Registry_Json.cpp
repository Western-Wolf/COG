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
	std::string NormalizeIcon(std::string raw)
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
		return raw;
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
		g.name = "Default Group";
		g.locked = true;
		g.visible = true;
		g.x = 0.1f;
		g.y = 0.10f;
		g.rotation = 0.0f;
		g.gearSize = kDefaultGearSize;
		g.spacing = kDefaultSpacing;
		g.stack = "below";
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
		return a.display.empty() && a.icon.empty() && a.startColor.empty() && a.endColor.empty() &&
		       a.barColor.empty() && a.hideAt.empty();
	}

	CogGearAppearance ParseAppearance(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		CogGearAppearance a;
		a.display = ctx.GetString(obj, "display");
		a.icon = NormalizeIcon(ctx.GetString(obj, "icon"));
		a.startColor = ctx.GetString(obj, "startColor");
		a.endColor = ctx.GetString(obj, "endColor");
		a.barColor = ctx.GetString(obj, "barColor");
		a.hideAt = ctx.GetString(obj, "hideAt");
		a.hudLinkedElement = ctx.GetString(obj, "hudLinkedElement");
		a.hudHideDuplicate = ctx.GetBool(obj, "hudHideDuplicate", false);
		return a;
	}

	void AppendAppearance(CogJson::Writer& w, const CogGearAppearance& a)
	{
		w.BeginObject();
		w.KeyString("display", a.display);
		w.KeyString("icon", a.icon);
		w.KeyString("startColor", a.startColor);
		w.KeyString("endColor", a.endColor);
		w.KeyString("barColor", a.barColor);
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
		if (g.id.empty()) {
			g.id = FileStem(ctx.GetString(obj, "name"));
		}
		g.id = NormalizeGroupId(g.id);
		const auto name = ctx.GetString(obj, "name");
		if (!name.empty()) {
			g.name = name;
		}
		g.locked = g.id == kDefaultGroupId || ctx.GetBool(obj, "locked", false);
		g.visible = ctx.GetBool(obj, "visible", true);
		g.x = ctx.GetFloat(obj, "x", g.x);
		g.y = ctx.GetFloat(obj, "y", g.y);
		g.rotation = ctx.GetFloat(obj, "rotation", 0.0f);
		if (ctx.Has(obj, "gearSize")) {
			g.gearSize = ctx.GetFloat(obj, "gearSize", kDefaultGearSize);
		}
		g.spacing = ctx.GetFloat(obj, "spacing", kDefaultSpacing);
		if (ctx.Has(obj, "stack")) {
			g.stack = NormalizeStack(ctx.GetString(obj, "stack"));
		}
		if (const auto* style = ctx.GetObject(obj, "style")) {
			g.style.showLabel = ctx.GetBool(*style, "showLabel", false);
			g.style.showIcon = ctx.GetBool(*style, "showIcon", true);
			g.style.showNumber = ctx.GetBool(*style, "showNumber", true);
			g.style.barTrough = ctx.GetBool(*style, "barTrough", true);
			g.style.fillFromHidden = NormalizeFillFromHidden(ctx.GetString(*style, "fillFromHidden"));
			g.style.numberFormat = NormalizeNumberFormat(*style, ctx);
			g.style.useGroupColors = ctx.GetBool(*style, "useGroupColors", false);
			g.style.startColor = ctx.GetString(*style, "startColor");
			g.style.endColor = ctx.GetString(*style, "endColor");
			g.style.barColor = ctx.GetString(*style, "barColor");
			g.style.borderColor = ctx.GetString(*style, "borderColor");
			g.style.neutralIconMode = NormalizeNeutralIconMode(ctx.GetString(*style, "neutralIconMode"));
		}
		if (g.id == kDefaultGroupId) {
			g.locked = true;
			g.name = "Default Group";
		}
		g.gearIds = ctx.GetStringArray(obj, "gearIds");
		return g;
	}

	CogGear ParseGear(const CogJson::Value& obj, CogJson::ParseContext& ctx)
	{
		CogGear g;
		g.mod = ctx.GetString(obj, "mod");
		g.name = ctx.GetString(obj, "name");
		g.id = ctx.GetString(obj, "id");
		if (g.id.empty() && !g.mod.empty() && !g.name.empty()) {
			g.id = FileStem(g.mod + "_" + g.name);
		}
		g.enabled = ctx.GetBool(obj, "enabled", true);
		g.locked = ctx.GetBool(obj, "locked", false);
		g.exemptFromGroupColors = ctx.GetBool(obj, "exemptFromGroupColors", false);
		if (const auto* defaults = ctx.GetObject(obj, "defaults")) {
			g.defaults = ParseAppearance(*defaults, ctx);
		}
		if (const auto* settings = ctx.GetObject(obj, "settings")) {
			g.settings = ParseAppearance(*settings, ctx);
		}
		return g;
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
		g.name = ctx.GetString(obj, "name");
		if (g.id.empty()) {
			g.id = FileStem(g.name);
		}
		g.type = NormalizeGaugeType(ctx.GetString(obj, "type"));
		g.shape = NormalizeGaugeShape(ctx.GetString(obj, "shape"));
		g.locked = ctx.GetBool(obj, "locked", false);
		g.visible = ctx.GetBool(obj, "visible", true);
		g.x = ctx.GetFloat(obj, "x", 0.1f);
		g.y = ctx.GetFloat(obj, "y", 0.1f);
		g.rotation = ctx.GetFloat(obj, "rotation", 0.0f);
		g.width = ctx.GetFloat(obj, "width", 240.0f);
		g.height = ctx.GetFloat(obj, "height", 24.0f);
		if (g.width < 8.0f) {
			g.width = 8.0f;
		}
		if (g.height < 4.0f) {
			g.height = 4.0f;
		}
		g.gearMod = ctx.GetString(obj, "gearMod");
		g.gearName = ctx.GetString(obj, "gearName");
		g.borderColor = ctx.GetString(obj, "borderColor");
		g.borderThickness = ctx.GetFloat(obj, "borderThickness", 15.0f);
		g.troughOpacity = ctx.GetFloat(obj, "troughOpacity", 20.0f);
		g.endCap = NormalizeEndCapArt(ctx.GetString(obj, "endCap"));
		g.endCapMode = NormalizeEndCapMode(ctx.GetString(obj, "endCapMode"));
		if (g.endCapMode.empty()) {
			g.endCapMode = g.endCap.empty() ? "border" : "endcap";
		}
		g.endCapOverlap = ctx.GetFloat(obj, "endCapOverlap", 0.0f);
		{
			const bool isFrame = g.type == "frame";
			auto readPlacement = [&](const char* key) {
				auto raw = ctx.GetString(obj, key);
				return isFrame ? NormalizeFrameSlot(std::move(raw)) : NormalizeGaugePlacement(std::move(raw));
			};
			g.showIcon = readPlacement("showIcon");
			g.showLabel = readPlacement("showLabel");
			g.showNumber = readPlacement("showNumber");
			if (isFrame) {
				// Gear-mode chrome defaults when keys are absent (Title / Icon / Number).
				if (!ctx.Has(obj, "showIcon")) {
					g.showIcon = "middle";
				}
				if (!ctx.Has(obj, "showLabel")) {
					g.showLabel = "top";
				}
				if (!ctx.Has(obj, "showNumber")) {
					g.showNumber = "bottom";
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
				claim(g.showIcon);
				claim(g.showNumber);
				claim(g.showLabel);
			}
		}
		g.fillDirection = ctx.GetString(obj, "fillDirection");
		if (g.fillDirection.empty()) {
			g.fillDirection = "left";
		}
		g.iconColorMode = NormalizeIconColorMode(ctx.GetString(obj, "iconColorMode"));
		if (g.iconColorMode.empty()) {
			g.iconColorMode = "border";
		}
		{
			auto rawLabel = ctx.GetString(obj, "labelColorMode");
			g.labelColorMode = NormalizeLabelColorMode(rawLabel);
			if (rawLabel.empty()) {
				g.labelColorMode = "border";
			}
		}
		{
			auto raw = ctx.GetString(obj, "numberColorMode");
			g.numberColorMode = NormalizeLabelColorMode(raw);
			if (raw.empty()) {
				g.numberColorMode = "border";
			}
		}
		g.numberAsPercent = ctx.GetBool(obj, "numberAsPercent", false);
		g.fontSize = ctx.GetFloat(obj, "fontSize", 0.0f);
		if (g.fontSize < 0.0f) {
			g.fontSize = 0.0f;
		}
		g.posAnchor = ctx.GetString(obj, "posAnchor");
		if (g.posAnchor != "tlc") {
			g.posAnchor = "tlc";
		}
		g.frameShape = ctx.GetString(obj, "frameShape");
		if (g.frameShape.empty()) {
			g.frameShape = "Frames/circle.svg";
		}
		g.frameFillColor = ctx.GetString(obj, "frameFillColor");
		g.frameBorderColor = ctx.GetString(obj, "frameBorderColor");
		g.frameBorderThickness = ctx.GetFloat(obj, "frameBorderThickness", 5.0f);
		if (g.frameBorderThickness < 0.0f) {
			g.frameBorderThickness = 0.0f;
		}
		if (g.frameBorderThickness > 50.0f) {
			g.frameBorderThickness = 50.0f;
		}
		g.insideSize = ctx.GetFloat(obj, "insideSize", 65.0f);
		if (g.insideSize < 5.0f) {
			g.insideSize = 5.0f;
		}
		if (g.insideSize > 100.0f) {
			g.insideSize = 100.0f;
		}
		g.displayMode = NormalizeGaugeDisplayMode(ctx.GetString(obj, "displayMode"));
		// Frames default on; meters default off. Missing key uses type-based default.
		{
			const bool frameDefault = g.type == "frame";
			if (ctx.Has(obj, "alwaysVisible")) {
				g.alwaysVisible = ctx.GetBool(obj, "alwaysVisible", frameDefault);
			} else {
				g.alwaysVisible = frameDefault;
			}
		}
		g.barTrough = ctx.GetBool(obj, "barTrough", false);
		{
			auto raw = ctx.GetString(obj, "numberFormat");
			auto canon = CanonicalPercentMode(raw);
			g.numberFormat = canon.empty() ? "barPercent" : std::move(canon);
		}
		g.pictureIcon = ctx.GetString(obj, "pictureIcon");
		g.pictureDirection = NormalizePictureDirection(ctx.GetString(obj, "pictureDirection"));
		g.pictureRotation = ctx.GetFloat(obj, "pictureRotation", 0.0f);
		g.pictureEmpty = ctx.GetString(obj, "pictureEmpty");
		if (g.pictureEmpty.empty()) {
			g.pictureEmpty = "#000000";
		}
		g.pictureFull = ctx.GetString(obj, "pictureFull");
		if (g.pictureFull.empty()) {
			g.pictureFull = "#ffffff";
		}
		g.pictureFade = ctx.GetString(obj, "pictureFade");
		if (g.pictureFade.empty()) {
			g.pictureFade = "#c4a35a";
		}
		return g;
	}

	void AppendGauge(CogJson::Writer& w, const CogGauge& g)
	{
		w.BeginObject();
		w.KeyString("id", g.id);
		w.KeyString("name", g.name);
		w.KeyString("type", g.type);
		w.KeyString("shape", g.shape);
		w.KeyBool("locked", g.locked);
		w.KeyBool("visible", g.visible);
		w.KeyNumber("x", g.x);
		w.KeyNumber("y", g.y);
		w.KeyNumber("rotation", g.rotation);
		w.KeyNumber("width", g.width);
		w.KeyNumber("height", g.height);
		w.KeyString("gearMod", g.gearMod);
		w.KeyString("gearName", g.gearName);
		w.KeyString("borderColor", g.borderColor);
		w.KeyNumber("borderThickness", g.borderThickness);
		w.KeyNumber("troughOpacity", g.troughOpacity);
		w.KeyString("endCapMode", g.endCapMode);
		w.KeyString("endCap", g.endCap);
		w.KeyNumber("endCapOverlap", g.endCapOverlap);
		w.KeyString("showIcon", g.showIcon);
		w.KeyString("showLabel", g.showLabel);
		w.KeyString("showNumber", g.showNumber);
		w.KeyString("fillDirection", g.fillDirection);
		w.KeyString("iconColorMode", g.iconColorMode);
		w.KeyString("labelColorMode", g.labelColorMode);
		w.KeyString("numberColorMode", g.numberColorMode);
		w.KeyBool("numberAsPercent", g.numberAsPercent);
		w.KeyNumber("fontSize", g.fontSize);
		w.KeyString("posAnchor", g.posAnchor.empty() ? "" : g.posAnchor);
		w.KeyString("frameShape", g.frameShape);
		w.KeyString("frameFillColor", g.frameFillColor);
		w.KeyString("frameBorderColor", g.frameBorderColor);
		w.KeyNumber("frameBorderThickness", g.frameBorderThickness);
		w.KeyNumber("insideSize", g.insideSize);
		w.KeyString("displayMode", g.displayMode);
		w.KeyBool("alwaysVisible", g.alwaysVisible);
		w.KeyBool("barTrough", g.barTrough);
		w.KeyString("numberFormat", g.numberFormat);
		w.KeyString("pictureIcon", g.pictureIcon);
		w.KeyString("pictureDirection", g.pictureDirection);
		w.KeyNumber("pictureRotation", g.pictureRotation);
		w.KeyString("pictureEmpty", g.pictureEmpty);
		w.KeyString("pictureFull", g.pictureFull);
		w.KeyString("pictureFade", g.pictureFade);
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

	std::string GizmoSettingsRawJson(const CogGizmo& g, std::string_view key, std::string_view fallback)
	{
		CogJson::Value root;
		if (!ParseSettingsObject(g.settingsJson, root)) {
			return std::string(fallback);
		}
		CogJson::ParseContext ctx;
		return ctx.GetRawJson(root, key, fallback);
	}

	CogGizmo ParseGizmo(const CogJson::Value& obj, CogJson::ParseContext& ctx, const CogGizmoType* type)
	{
		CogGizmo g;
		g.id = ctx.GetString(obj, "id");
		g.name = ctx.GetString(obj, "name");
		if (g.id.empty()) {
			g.id = FileStem(g.name);
		}
		g.type = NormalizeGizmoType(ctx.GetString(obj, "type"));
		const bool hasVisibility = ctx.Has(obj, "visibility");
		const bool hasWidth = ctx.Has(obj, "width");
		const bool hasHeight = ctx.Has(obj, "height");
		g.x = ctx.GetFloat(obj, "x", 0.1f);
		g.y = ctx.GetFloat(obj, "y", 0.1f);
		g.rotation = ctx.GetFloat(obj, "rotation", 0.0f);
		g.sourceMod = ctx.GetString(obj, "sourceMod");
		g.posAnchor = ctx.GetString(obj, "posAnchor");
		if (g.posAnchor != "tlc") {
			g.posAnchor = "tlc";
		}

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
		// Instance settings ← type schema defaults ← (universal leave-absent for ensure/create).
		if (type) {
			MergeMissingSettingsFromSchema(settings, type->settingsSchemaJson);
		}

		if (hasVisibility) {
			g.visibility = NormalizeGizmoVisibility(ctx.GetString(obj, "visibility"));
		} else if (type) {
			g.visibility = NormalizeGizmoVisibility(type->defaultVisibility);
		} else {
			g.visibility = BuiltinDefaultVisibilityForType(g.type);
		}

		float defaultW = type ? type->defaultWidth : 240.0f;
		float defaultH = type ? type->defaultHeight : 48.0f;
		if (!type) {
			if (g.type == "cog-feed") {
				defaultW = 400.0f;
				defaultH = 400.0f;
			} else if (g.type == "cog-suppressor") {
				defaultW = 100.0f;
				defaultH = 100.0f;
			} else if (g.type == "cog-clock") {
				defaultW = 275.0f;
				defaultH = 40.0f;
			} else if (g.type == "cog-shout-meter") {
				defaultW = 220.0f;
				defaultH = 48.0f;
			}
		}
		if (g.type == "cog-clock") {
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
		g.width = hasWidth ? ctx.GetFloat(obj, "width", defaultW) : defaultW;
		g.height = hasHeight ? ctx.GetFloat(obj, "height", defaultH) : defaultH;
		if (g.width < 32.0f) {
			g.width = 32.0f;
		}
		if (g.height < 6.0f) {
			g.height = 6.0f;
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
		w.KeyString("name", g.name);
		w.KeyString("type", g.type);
		// Always persist visibility. Omitting "hud" made Feed's JS ensure treat a missing
		// key as "ui" (new-feed default) and reset HUD Visible on the next snapshot push.
		w.KeyString("visibility", NormalizeGizmoVisibility(g.visibility));
		w.KeyNumber("x", g.x);
		w.KeyNumber("y", g.y);
		w.KeyNumber("rotation", g.rotation);
		w.KeyNumber("width", g.width);
		w.KeyNumber("height", g.height);
		if (!g.sourceMod.empty()) {
			w.KeyString("sourceMod", g.sourceMod);
		}
		w.KeyString("posAnchor", g.posAnchor.empty() ? "tlc" : g.posAnchor);
		w.KeyRaw("settings", g.settingsJson.empty() ? "{}" : g.settingsJson);
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
		w.KeyString("name", g.name);
		w.KeyBool("locked", g.locked);
		w.KeyBool("visible", g.visible);
		w.KeyNumber("x", g.x);
		w.KeyNumber("y", g.y);
		w.KeyNumber("rotation", g.rotation);
		w.KeyNumber("gearSize", g.gearSize);
		w.KeyNumber("spacing", g.spacing);
		w.KeyString("stack", g.stack);
		w.Key("style");
		w.BeginObject();
		w.KeyBool("showLabel", g.style.showLabel);
		w.KeyBool("showIcon", g.style.showIcon);
		w.KeyBool("showNumber", g.style.showNumber);
		w.KeyBool("barTrough", g.style.barTrough);
		w.KeyString("fillFromHidden", g.style.fillFromHidden);
		w.KeyString("numberFormat", g.style.numberFormat);
		w.KeyBool("useGroupColors", g.style.useGroupColors);
		w.KeyString("startColor", g.style.startColor);
		w.KeyString("endColor", g.style.endColor);
		w.KeyString("barColor", g.style.barColor);
		w.KeyString("borderColor", g.style.borderColor);
		w.KeyString("neutralIconMode", g.style.neutralIconMode);
		w.EndObject();
		w.Key("gearIds");
		w.BeginArray();
		for (const auto& id : g.gearIds) {
			w.String(id);
		}
		w.EndArray();
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
		w.KeyString("mod", g.mod);
		w.KeyString("name", g.name);
		w.KeyBool("enabled", g.enabled);
		w.KeyBool("locked", g.locked);
		w.KeyBool("exemptFromGroupColors", g.exemptFromGroupColors);
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
