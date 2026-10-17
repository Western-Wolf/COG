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
#include <filesystem>
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
		  << EscapeJson(src.category) << "\",\"icon\":\"" << EscapeJson(src.icon) << "\",\"startColor\":\""
		  << EscapeJson(src.startColor) << "\",\"endColor\":\"" << EscapeJson(src.endColor) << "\",\"barColor\":\""
		  << EscapeJson(src.barColor) << "\",\"hideAt\":\"" << EscapeJson(src.hideAt)
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
	  << EscapeJson(_general.borderColor) << "\",\"iconStartColor\":\"" << EscapeJson(_general.iconStartColor)
	  << "\",\"iconEndColor\":\"" << EscapeJson(_general.iconEndColor)
	  << "\",\"neutralIconMode\":\"" << EscapeJson(_general.neutralIconMode)
	  << "\",\"gadgetFont\":\"" << EscapeJson(_general.gadgetFont)
	  << "\"},\"groups\":[";
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
					const IconEntry entry{ rel, std::move(section), std::string(rootTag) };
					const auto [itInsert, inserted] = iconsByPath.try_emplace(rel, entry);
					if (!inserted && rootTag == "icons") {
						itInsert->second = entry;
					}
				}
			}
			for (const auto& [path, section] : _importedIcons) {
				iconsByPath.try_emplace(
					path,
					IconEntry{ path, section.empty() ? "General" : section, "imports/icons" });
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
				return a.path < b.path;
			});
			first = true;
			for (const auto& icon : icons) {
				if (!first) {
					o << ",";
				}
				first = false;
				o << "{\"path\":\"" << EscapeJson(icon.path) << "\",\"section\":\"" << EscapeJson(icon.section)
				  << "\",\"root\":\"" << EscapeJson(icon.root) << "\"}";
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
		  << EscapeJson(src.category) << "\",\"icon\":\"" << EscapeJson(src.icon) << "\",\"startColor\":\""
		  << EscapeJson(src.startColor) << "\",\"endColor\":\"" << EscapeJson(src.endColor) << "\",\"barColor\":\""
		  << EscapeJson(src.barColor) << "\",\"hideAt\":\"" << EscapeJson(src.hideAt)
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
		CogUi::Interop("applySnapshot", BuildSnapshotJson());
	} else {
		CogUi::Interop("applyLivePatch", BuildLivePatchJson());
	}
	CogFeed::PushActiveEffectsToUi();
	CogFeed::PushLevelProgressToUi();
	// Batched toast drain on the same tick path as effects (one Interop when pending).
	CogFeed::PushPendingFeedEventsToUi();
}
