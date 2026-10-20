#include "pch.h"
#include "_Core_Registry.h"
#include "_Core_Registry_Json.h"
#include "_Core_HudSuppress.h"
#include "_Gears_LiveStats.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_ActiveEffects.h"
#include "_Gizmo_Feed_Skills.h"
#include "_Gizmo_Feed_Inventory.h"
#include "_UI_CogUi.h"
#include "_Core_Json.h"

#include "RE/C/Calendar.h"
#include "RE/S/Sky.h"
#include "RE/T/TESClimate.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

using CogRegistryJson::AppendGauge;
using CogRegistryJson::AppendGear;
using CogRegistryJson::AppendGizmo;
using CogRegistryJson::AppendGroup;
using CogRegistryJson::EscapeJson;
using CogRegistryJson::Lower;
using CogRegistryJson::NormalizeGizmoVisibility;

namespace
{
	std::string ReadFileText(const std::filesystem::path& path)
	{
		std::ifstream in(path, std::ios::binary);
		if (!in) {
			return {};
		}
		return std::string(
			std::istreambuf_iterator<char>(in),
			std::istreambuf_iterator<char>());
	}

	/** Parse a multi-icon pack JSON into snapshot frames ({ path, pct } stops). */
	std::string BuildIconPackFramesJson(const std::filesystem::path& packPath)
	{
		const auto text = ReadFileText(packPath);
		if (text.empty()) {
			return "[]";
		}
		CogJson::Value root;
		std::string err;
		if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
			return "[]";
		}
		CogJson::ParseContext ctx;
		ctx.path = packPath.filename().string();
		const auto* icons = ctx.GetArray(root, "icons");
		if (!icons || !icons->IsArray() || icons->arrayValue.empty()) {
			return "[]";
		}

		struct Frame
		{
			std::string path;
			double pct = 0;
			bool hasPct = false;
		};
		std::vector<Frame> staged;
		staged.reserve(icons->arrayValue.size());
		for (const auto& item : icons->arrayValue) {
			Frame f;
			if (item.IsString()) {
				f.path = item.stringValue;
			} else if (item.IsObject()) {
				f.path = ctx.GetString(item, "path");
				if (f.path.empty()) {
					f.path = ctx.GetString(item, "icon");
				}
				if (item.Find("pct") && item.Find("pct")->IsNumber()) {
					f.pct = item.Find("pct")->numberValue;
					f.hasPct = true;
				} else if (item.Find("percent") && item.Find("percent")->IsNumber()) {
					f.pct = item.Find("percent")->numberValue;
					f.hasPct = true;
				}
			} else {
				continue;
			}
			std::replace(f.path.begin(), f.path.end(), '\\', '/');
			while (!f.path.empty() && (f.path.front() == '/' || f.path.starts_with("./"))) {
				if (f.path.starts_with("./")) {
					f.path.erase(0, 2);
				} else {
					f.path.erase(f.path.begin());
				}
			}
			constexpr std::string_view kPrefixes[] = {
				"assets/imports/icons/",
				"imports/icons/",
				"assets/icons/",
				"icons/",
			};
			for (const auto prefix : kPrefixes) {
				if (f.path.size() > prefix.size()) {
					auto lower = f.path;
					std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
						return static_cast<char>(std::tolower(c));
					});
					std::string pLower{ prefix };
					if (lower.rfind(pLower, 0) == 0) {
						f.path = f.path.substr(prefix.size());
						break;
					}
				}
			}
			if (f.path.empty() || f.path.find("..") != std::string::npos) {
				continue;
			}
			if (f.hasPct) {
				if (f.pct < 0) {
					f.pct = 0;
				}
				if (f.pct > 100) {
					f.pct = 100;
				}
			}
			staged.push_back(std::move(f));
		}
		if (staged.empty()) {
			return "[]";
		}

		const bool anyPct = std::any_of(staged.begin(), staged.end(), [](const Frame& f) {
			return f.hasPct;
		});
		const std::size_t n = staged.size();
		if (!anyPct) {
			for (std::size_t i = 0; i < n; ++i) {
				staged[i].pct = (static_cast<double>(i) * 100.0) / static_cast<double>(n);
				staged[i].hasPct = true;
			}
		} else {
			for (auto& f : staged) {
				if (!f.hasPct) {
					f.pct = 0;
					f.hasPct = true;
				}
			}
			std::sort(staged.begin(), staged.end(), [](const Frame& a, const Frame& b) {
				return a.pct < b.pct;
			});
		}

		std::vector<Frame> uniq;
		uniq.reserve(staged.size());
		for (auto& f : staged) {
			if (!uniq.empty() && std::abs(uniq.back().pct - f.pct) < 1e-9) {
				uniq.back() = std::move(f);
			} else {
				uniq.push_back(std::move(f));
			}
		}

		std::ostringstream o;
		o << "[";
		for (std::size_t i = 0; i < uniq.size(); ++i) {
			if (i) {
				o << ",";
			}
			o << "{\"path\":\"" << EscapeJson(uniq[i].path) << "\",\"pct\":" << uniq[i].pct << "}";
		}
		o << "]";
		return o.str();
	}

	std::string SkyModeKey(RE::Sky::Mode mode)
	{
		switch (mode) {
		case RE::Sky::Mode::kInterior:
			return "interior";
		case RE::Sky::Mode::kSkyDomeOnly:
			return "skydome";
		case RE::Sky::Mode::kFull:
			return "full";
		default:
			return "none";
		}
	}

	float ClimateHour(std::uint8_t timingByte)
	{
		return static_cast<float>(timingByte) / 6.0f;
	}

	float WrapHours(float hour)
	{
		while (hour < 0.0f) {
			hour += 24.0f;
		}
		while (hour >= 24.0f) {
			hour -= 24.0f;
		}
		return hour;
	}

	float HoursBetween(float fromHour, float toHour)
	{
		return WrapHours(toHour - fromHour);
	}

	float BodyArcFromHour(float hour, float riseBegin, float setEnd)
	{
		if (hour < riseBegin || hour >= setEnd) {
			return -1.0f;
		}
		const auto span = setEnd - riseBegin;
		if (span <= 0.0f) {
			return 0.5f;
		}
		return std::clamp((hour - riseBegin) / span, 0.0f, 1.0f);
	}

	float MoonArcFromHour(float hour, float orbitHours)
	{
		if (orbitHours <= 0.0f) {
			return 0.0f;
		}
		const auto wrapped = std::fmod(hour, orbitHours);
		return static_cast<float>(wrapped / orbitHours);
	}

	void WriteCelestialJson(std::ostringstream& o, const RE::Calendar* cal, const RE::Sky* sky)
	{
		bool sunActive = false;
		bool masserActive = false;
		bool secundaActive = false;
		int masserPhase = 0;
		int secundaPhase = 0;
		float sunArc = -1.0f;
		float masserArc = -1.0f;
		float secundaArc = -1.0f;
		std::string skyMode = "none";

		if (sky) {
			skyMode = SkyModeKey(sky->mode.get());
		}

		if (cal) {
			const auto dayIndex = static_cast<int>(std::floor(cal->GetDaysPassed()));
			auto phaseLen = 3;
			if (sky && sky->currentClimate) {
				phaseLen = (std::max)(1, static_cast<int>(sky->currentClimate->timing.GetPhaseLength()));
			}
			masserPhase = (dayIndex / phaseLen) % 8;
			secundaPhase = masserPhase;

			const auto hour = cal->GetHour();
			const auto& timing = sky && sky->currentClimate ? sky->currentClimate->timing : RE::TESClimate::Timing{};
			const auto sunriseBegin = ClimateHour(timing.sunrise.begin);
			const auto sunsetEnd = ClimateHour(timing.sunset.end);
			sunActive = hour >= sunriseBegin && hour < sunsetEnd;
			sunArc = BodyArcFromHour(hour, sunriseBegin, sunsetEnd);
			if (!sunActive) {
				sunArc = -1.0f;
			}

			const bool nighttime = hour < sunriseBegin || hour >= sunsetEnd;
			const bool includesMasser = sky && sky->currentClimate && sky->currentClimate->timing.IncludesMasser();
			const bool includesSecunda = sky && sky->currentClimate && sky->currentClimate->timing.IncludesSecunda();
			masserActive = includesMasser && nighttime;
			secundaActive = includesSecunda && nighttime;
			if (masserActive) {
				masserArc = MoonArcFromHour(hour, 24.0f);
			}
			if (secundaActive) {
				secundaArc = MoonArcFromHour(hour, 20.0f);
			}
		}

		o << "\"celestial\":{"
		  << "\"skyMode\":\"" << EscapeJson(skyMode) << "\""
		  << ",\"sunActive\":" << (sunActive ? "true" : "false")
		  << ",\"masserActive\":" << (masserActive ? "true" : "false")
		  << ",\"secundaActive\":" << (secundaActive ? "true" : "false")
		  << ",\"sunVisible\":" << (sunActive ? "true" : "false")
		  << ",\"masserVisible\":" << (masserActive ? "true" : "false")
		  << ",\"secundaVisible\":" << (secundaActive ? "true" : "false")
		  << ",\"masserPhase\":" << masserPhase << ",\"secundaPhase\":" << secundaPhase
		  << ",\"sunArc\":" << sunArc << ",\"masserArc\":" << masserArc << ",\"secundaArc\":" << secundaArc
		  << "}";
	}

	void WriteGameTimeJson(std::ostringstream& o, const RE::Calendar* cal, const RE::Sky* sky)
	{
		o << "\"gameTime\":{";
		if (cal) {
			o << "\"value\":" << cal->GetCurrentGameTime() << ",\"year\":" << cal->GetYear()
			  << ",\"month\":" << cal->GetMonth() << ",\"day\":" << cal->GetDay()
			  << ",\"hour\":" << cal->GetHour() << ",\"minute\":" << cal->GetMinutes()
			  << ",\"monthName\":\"" << EscapeJson(cal->GetMonthName()) << "\",\"dayName\":\""
			  << EscapeJson(cal->GetDayName()) << "\",\"ordinalSuffix\":\""
			  << EscapeJson(cal->GetOrdinalSuffix()) << "\",";
		} else {
			o << "\"value\":0,\"year\":0,\"month\":0,\"day\":0,\"hour\":0,\"minute\":0,"
			  << "\"monthName\":\"\",\"dayName\":\"\",\"ordinalSuffix\":\"\",";
		}
		WriteCelestialJson(o, cal, sky);
		o << "}";
	}
}

void CogRegistry::PushImportedIconsToUi()
{
	if (!CogUi::HasView()) {
		return;
	}
	std::string json;
	{
		std::lock_guard lock(_mutex);
		std::vector<std::pair<std::string, std::string>> sorted(_importedIcons.begin(), _importedIcons.end());
		std::sort(sorted.begin(), sorted.end(), [](const auto& a, const auto& b) {
			if (a.second != b.second) {
				return a.second < b.second;
			}
			return a.first < b.first;
		});
		std::ostringstream o;
		o << "{\"icons\":[";
		bool first = true;
		for (const auto& [path, section] : sorted) {
			if (!first) {
				o << ",";
			}
			first = false;
			o << "{\"path\":\"" << EscapeJson(path) << "\",\"section\":\"" << EscapeJson(section) << "\"}";
		}
		o << "]}";
		json = o.str();
	}
	CogUi::Interop("applyImportedIcons", json);
}

std::string CogRegistry::BuildSnapshotJson()
{
	std::lock_guard lock(_mutex);
	EnsureDefaultGroup();
	RefreshLiveUnlocked();
	const bool emitCatalog = _catalogDirty;
	if (emitCatalog) {
		_catalogDirty = false;
	}
	_layoutDirty = false;
	const auto* sky = RE::Sky::GetSingleton();
	const auto* cal = RE::Calendar::GetSingleton();
	std::ostringstream o;
	// languages early (en-CA + codes discovered from loaded translation JSON). Full
	// catalogs go via applyTranslationCatalogs — keep them out of this payload so
	// Interop size limits cannot drop locales when the entity snapshot is huge.
	{
		std::vector<std::string> languages;
		languages.push_back("en-CA");
		CogTranslations::CollectLanguages(_translations, languages);
		for (const auto& [typeId, cat] : _gizmoTranslations) {
			(void)typeId;
			CogTranslations::CollectLanguages(cat, languages);
		}
		std::sort(languages.begin(), languages.end());
		languages.erase(std::unique(languages.begin(), languages.end()), languages.end());
		o << "{\"languages\":[";
		bool firstLang = true;
		for (const auto& lang : languages) {
			if (!firstLang) {
				o << ",";
			}
			firstLang = false;
			o << "\"" << EscapeJson(lang) << "\"";
		}
		o << "],\"sources\":[";
	}
	bool first = true;
	for (const auto receipt : _order) {
		auto srcIt = _sources.find(receipt);
		if (srcIt == _sources.end()) {
			continue;
		}
		const auto& src = srcIt->second;
		if (!first) {
			o << ",";
		}
		first = false;
		o << "{\"receipt\":" << src.receipt << ",\"mod\":\"" << EscapeJson(src.mod) << "\",\"name\":\""
		  << EscapeJson(src.name) << "\",\"display\":\"" << EscapeJson(src.display) << "\",\"category\":\""
		  << EscapeJson(src.category) << "\",\"icon\":\"" << EscapeJson(src.icon) << "\",";
		CogRegistryJson::AppendColorRampJson(o, "iconColor", src.iconColor);
		o << ",";
		CogRegistryJson::AppendColorRampJson(o, "barColor", src.barColor);
		o << ",\"hideAt\":\"" << EscapeJson(src.hideAt)
		  << "\",\"hudLinkedElement\":\"" << EscapeJson(src.hudLinkedElement)
		  << "\",\"hudHideDuplicate\":" << (src.hudHideDuplicate ? "true" : "false") << ",\"type\":\""
		  << TypeKey(src.type) << "\",\"value\":" << src.value;
		if (src.type == CogVarType::Percent || src.type == CogVarType::Timer) {
			o << ",\"current\":" << src.current << ",\"maximum\":" << src.maximum;
		}
		o << "}";
	}
	o << "],";
	WriteGameTimeJson(o, cal, sky);
	o << ",";
	CogLive::WriteShoutMeterSnapshotJson(o);
	o << ",\"general\":{\"showDefaultGroup\":" << (_general.showDefaultGroup ? "true" : "false")
	  << ",\"editorKey\":\"" << EscapeJson(_general.editorKey) << "\",\"hideToggleKey\":\""
	  << EscapeJson(_general.hideToggleKey) << "\",\"hideIncludesFlash\":"
	  << (_general.hideIncludesFlash ? "true" : "false") << ",\"uiHidden\":" << (_uiHidden ? "true" : "false")
	  << ",\"fillColor\":\"" << EscapeJson(_general.fillColor) << "\",\"borderColor\":\""
	  << EscapeJson(_general.borderColor) << "\",\"iconColor\":\"" << EscapeJson(_general.iconColor)
	  << "\",\"neutralIconMode\":\"" << EscapeJson(_general.neutralIconMode)
	  << "\",\"gadgetFont\":\"" << EscapeJson(_general.gadgetFont) << "\",\"language\":\""
	  << EscapeJson(_general.language.empty() ? "en-CA" : _general.language)
	  << "\",\"highlightMissingTranslations\":"
	  << (_general.highlightMissingTranslations ? "true" : "false") << "},\"groups\":[";
	first = true;
	for (const auto& g : _groups) {
		if (!first) {
			o << ",";
		}
		first = false;
		CogJson::Writer w(false);
		AppendGroup(w, g);
		o << w.str();
	}
	o << "],\"gears\":[";
	first = true;
	for (const auto& g : _gears) {
		if (!first) {
			o << ",";
		}
		first = false;
		CogJson::Writer w(false);
		AppendGear(w, g);
		o << w.str();
	}
	o << "],\"gauges\":[";
	first = true;
	for (const auto& g : _gauges) {
		if (!first) {
			o << ",";
		}
		first = false;
		CogJson::Writer w(false);
		AppendGauge(w, g);
		o << w.str();
	}
	o << "],\"gizmos\":[";
	first = true;
	for (const auto& g : _gizmos) {
		if (!first) {
			o << ",";
		}
		first = false;
		CogJson::Writer w(false);
		AppendGizmo(w, g);
		auto s = w.str();
		if (!s.empty() && s.back() == '}') {
			s.pop_back();
			s += ",\"livePayload\":";
			s += g.livePayloadJson.empty() ? "null" : g.livePayloadJson;
			s.push_back('}');
		}
		o << s;
	}
	o << "],\"gizmoTypes\":[";
	first = true;
	for (const auto& t : _gizmoTypes) {
		if (!first) {
			o << ",";
		}
		first = false;
		o << "{\"sourceMod\":\"" << EscapeJson(t.sourceMod) << "\",\"typeId\":\"" << EscapeJson(t.typeId)
		  << "\",\"displayName\":\"" << EscapeJson(t.displayName) << "\",\"galleryIcon\":\""
		  << EscapeJson(t.galleryIcon) << "\",\"defaultWidth\":" << t.defaultWidth
		  << ",\"defaultHeight\":" << t.defaultHeight << ",\"defaultVisibility\":\""
		  << EscapeJson(NormalizeGizmoVisibility(t.defaultVisibility)) << "\",\"viewScript\":\""
		  << EscapeJson(t.viewScript) << "\",\"settingsSchema\":"
		  << (t.settingsSchemaJson.empty() ? "[]" : t.settingsSchemaJson) << "}";
	}
	if (emitCatalog) {
		o << "],\"fonts\":[";
		{
			struct FontEntry {
				std::string file;
				std::string root;
			};
			std::vector<FontEntry> fonts;
			const auto assetsRoot =
				std::filesystem::current_path() / "Data" / "PrismaUI" / "views" / "COG" / "assets";
			const std::pair<std::filesystem::path, std::string_view> fontRoots[] = {
				{ assetsRoot / "fonts", "fonts" },
				{ assetsRoot / "imports" / "fonts", "imports/fonts" },
			};
			for (const auto& [rootPath, rootTag] : fontRoots) {
				std::error_code existsEc;
				if (!std::filesystem::exists(rootPath, existsEc)) {
					continue;
				}
				std::error_code iterEc;
				for (const auto& entry : std::filesystem::directory_iterator(rootPath, iterEc)) {
					if (iterEc) {
						break;
					}
					std::error_code fileEc;
					if (!entry.is_regular_file(fileEc)) {
						continue;
					}
					auto ext = Lower(entry.path().extension().string());
					if (ext != ".ttf" && ext != ".otf" && ext != ".woff" && ext != ".woff2") {
						continue;
					}
					auto name = entry.path().filename().string();
					if (name.empty() || name.find("..") != std::string::npos) {
						continue;
					}
					fonts.push_back(FontEntry{ std::move(name), std::string(rootTag) });
				}
			}
			std::sort(fonts.begin(), fonts.end(), [](const FontEntry& a, const FontEntry& b) {
				if (a.root != b.root) {
					return a.root < b.root;
				}
				return a.file < b.file;
			});
			first = true;
			for (const auto& font : fonts) {
				if (!first) {
					o << ",";
				}
				first = false;
				o << "{\"file\":\"" << EscapeJson(font.file) << "\",\"root\":\"" << EscapeJson(font.root) << "\"}";
			}
		}
		o << "],\"icons\":[";
		{
			struct IconEntry {
				std::string path;
				std::string section;
				std::string root;
				std::string framesJson;  // multi-icon pack frames, or empty
			};
			std::unordered_map<std::string, IconEntry> iconsByPath;
			const auto assetsRoot =
				std::filesystem::current_path() / "Data" / "PrismaUI" / "views" / "COG" / "assets";
			const std::pair<std::filesystem::path, std::string_view> iconRoots[] = {
				{ assetsRoot / "icons", "icons" },
				{ assetsRoot / "imports" / "icons", "imports/icons" },
			};
			for (const auto& [rootPath, rootTag] : iconRoots) {
				std::error_code existsEc;
				if (!std::filesystem::exists(rootPath, existsEc)) {
					continue;
				}
				std::error_code iterEc;
				std::filesystem::recursive_directory_iterator it(
					rootPath, std::filesystem::directory_options::skip_permission_denied, iterEc);
				if (iterEc) {
					continue;
				}
				for (; it != std::filesystem::recursive_directory_iterator(); it.increment(iterEc)) {
					if (iterEc) {
						iterEc.clear();
						continue;
					}
					std::error_code fileEc;
					if (!it->is_regular_file(fileEc)) {
						continue;
					}
					auto ext = Lower(it->path().extension().string());
					if (ext != ".svg" && ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".gif" &&
						ext != ".webp" && ext != ".bmp" && ext != ".json") {
						continue;
					}
					std::error_code relEc;
					auto rel = std::filesystem::relative(it->path(), rootPath, relEc).generic_string();
					if (relEc || rel.empty() || rel.starts_with("..") || rel.find(':') != std::string::npos) {
						continue;
					}
					if (Lower(rel) == "manifest.json") {
						continue;
					}
					std::string section = "General";
					const auto slash = rel.find('/');
					if (slash != std::string::npos && slash > 0) {
						section = rel.substr(0, slash);
					}
					IconEntry entry{ rel, std::move(section), std::string(rootTag), {} };
					if (ext == ".json") {
						entry.framesJson = BuildIconPackFramesJson(it->path());
					}
					const auto [itInsert, inserted] = iconsByPath.try_emplace(rel, entry);
					if (!inserted && rootTag == "icons") {
						itInsert->second = std::move(entry);
					}
				}
			}
			for (const auto& [path, section] : _importedIcons) {
				IconEntry entry{ path, section.empty() ? "General" : section, "imports/icons", {} };
				if (Lower(path).ends_with(".json")) {
					const auto abs = assetsRoot / "imports" / "icons" / std::filesystem::path(path);
					entry.framesJson = BuildIconPackFramesJson(abs);
				}
				iconsByPath.try_emplace(path, std::move(entry));
			}
			std::vector<IconEntry> icons;
			icons.reserve(iconsByPath.size());
			for (auto& [_, entry] : iconsByPath) {
				icons.push_back(std::move(entry));
			}
			std::sort(icons.begin(), icons.end(), [](const IconEntry& a, const IconEntry& b) {
				if (a.section != b.section) {
					if (a.section == "General") {
						return true;
					}
					if (b.section == "General") {
						return false;
					}
					return a.section < b.section;
				}
				// Multi-icon packs after still frames in the same folder.
				const bool aPack = Lower(a.path).ends_with(".json");
				const bool bPack = Lower(b.path).ends_with(".json");
				if (aPack != bPack) {
					return !aPack;
				}
				return a.path < b.path;
			});
			first = true;
			for (const auto& icon : icons) {
				if (!first) {
					o << ",";
				}
				first = false;
				o << "{\"path\":\"" << EscapeJson(icon.path) << "\",\"section\":\"" << EscapeJson(icon.section)
				  << "\",\"root\":\"" << EscapeJson(icon.root) << "\"";
				if (!icon.framesJson.empty() && icon.framesJson != "[]") {
					o << ",\"frames\":" << icon.framesJson;
				}
				o << "}";
			}
		}
		o << "],\"importedIcons\":[";
		{
			first = true;
			for (const auto& [path, section] : _importedIcons) {
				if (!first) {
					o << ",";
				}
				first = false;
				o << "{\"path\":\"" << EscapeJson(path) << "\",\"section\":\"" << EscapeJson(section) << "\"}";
			}
		}
		o << "]";
	} else {
		o << "]";
	}
	o << ",\"suppressions\":" << CogHudSuppress::SuppressionsJson(*this);
	o << ",\"suppressionAliases\":" << CogHudSuppress::KnownAliasesJson();
	o << "}";
	return o.str();
}

std::string CogRegistry::BuildTranslationCatalogsJson()
{
	std::lock_guard lock(_mutex);
	std::vector<std::string> languages;
	languages.push_back("en-CA");
	CogTranslations::CollectLanguages(_translations, languages);
	for (const auto& [typeId, cat] : _gizmoTranslations) {
		(void)typeId;
		CogTranslations::CollectLanguages(cat, languages);
	}
	std::sort(languages.begin(), languages.end());
	languages.erase(std::unique(languages.begin(), languages.end()), languages.end());
	std::ostringstream o;
	o << "{\"languages\":[";
	bool firstLang = true;
	for (const auto& lang : languages) {
		if (!firstLang) {
			o << ",";
		}
		firstLang = false;
		o << "\"" << EscapeJson(lang) << "\"";
	}
	o << "],\"translations\":" << CogTranslations::CatalogToJson(_translations);
	o << ",\"gizmoTranslations\":" << CogTranslations::GizmoCatalogsToJson(_gizmoTranslations);
	o << "}";
	return o.str();
}

std::string CogRegistry::BuildLivePatchJson()
{
	std::lock_guard lock(_mutex);
	EnsureDefaultGroup();
	RefreshLiveUnlocked();
	const auto* sky = RE::Sky::GetSingleton();
	const auto* cal = RE::Calendar::GetSingleton();
	std::ostringstream o;
	o << "{\"sources\":[";
	bool first = true;
	for (const auto receipt : _order) {
		auto srcIt = _sources.find(receipt);
		if (srcIt == _sources.end()) {
			continue;
		}
		const auto& src = srcIt->second;
		if (!first) {
			o << ",";
		}
		first = false;
		o << "{\"receipt\":" << src.receipt << ",\"mod\":\"" << EscapeJson(src.mod) << "\",\"name\":\""
		  << EscapeJson(src.name) << "\",\"display\":\"" << EscapeJson(src.display) << "\",\"category\":\""
		  << EscapeJson(src.category) << "\",\"icon\":\"" << EscapeJson(src.icon) << "\",";
		CogRegistryJson::AppendColorRampJson(o, "iconColor", src.iconColor);
		o << ",";
		CogRegistryJson::AppendColorRampJson(o, "barColor", src.barColor);
		o << ",\"hideAt\":\"" << EscapeJson(src.hideAt)
		  << "\",\"hudLinkedElement\":\"" << EscapeJson(src.hudLinkedElement)
		  << "\",\"hudHideDuplicate\":" << (src.hudHideDuplicate ? "true" : "false") << ",\"type\":\""
		  << TypeKey(src.type) << "\",\"value\":" << src.value;
		if (src.type == CogVarType::Percent || src.type == CogVarType::Timer) {
			o << ",\"current\":" << src.current << ",\"maximum\":" << src.maximum;
		}
		o << "}";
	}
	o << "],";
	WriteGameTimeJson(o, cal, sky);
	o << ",";
	CogLive::WriteShoutMeterSnapshotJson(o);
	o << ",\"gizmos\":[";
	first = true;
	for (const auto& g : _gizmos) {
		if (!first) {
			o << ",";
		}
		first = false;
		o << "{\"id\":\"" << EscapeJson(g.id) << "\",\"livePayload\":";
		o << (g.livePayloadJson.empty() ? "null" : g.livePayloadJson);
		o << "}";
	}
	o << "]}";
	return o.str();
}

void CogRegistry::PushToUi()
{
	if (!CogUi::HasView()) {
		return;
	}
	// Skip Interop + ActiveEffect/ShoutMeter reads while LoadingMenu / PreLoadGame is active.
	if (IsLoading()) {
		return;
	}
	// Suppress vanilla HUD before painting COG so duplicates never flash on load.
	SyncHudDuplicates();
	bool fullSnapshot = false;
	{
		std::lock_guard lock(_mutex);
		fullSnapshot = _layoutDirty || _catalogDirty;
	}
	if (fullSnapshot) {
		// Catalogs first — smaller payload so Interop limits cannot drop locale discovery.
		CogUi::Interop("applyTranslationCatalogs", BuildTranslationCatalogsJson());
		CogUi::Interop("applySnapshot", BuildSnapshotJson());
	} else {
		CogUi::Interop("applyLivePatch", BuildLivePatchJson());
	}
	CogFeed::PushActiveEffectsToUi();
	CogFeed::PushLevelProgressToUi();
	// Batched toast drain on the same tick path as effects (one Interop when pending).
	CogFeed::PushPendingFeedEventsToUi();
}
