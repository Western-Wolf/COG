#include "pch.h"
#include "_Core_Registry.h"
#include "_Core_Registry_Json.h"
#include "_Assets_IconImport.h"
#include "_Gears_Inventory.h"
#include "_UI_CogUi.h"
#include "_UI_KeyNames.h"
#include "_Core_Json.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <functional>
#include <sstream>
#include <unordered_map>
#include <unordered_set>

using CogRegistryJson::EscapeJson;
using CogRegistryJson::FileStem;
using CogRegistryJson::Lower;
using CogRegistryJson::NormalizeEditorKey;
using CogRegistryJson::NormalizeHexColor;
using CogRegistryJson::OptionalHexColor;
using CogRegistryJson::NormalizeIcon;
using CogRegistryJson::NormalizeNeutralIconMode;
using CogRegistryJson::ParseGauge;
using CogRegistryJson::ParseGear;
using CogRegistryJson::ParseGizmo;
using CogRegistryJson::ParseGizmoType;
using CogRegistryJson::ParseGroup;
using CogRegistryJson::GearToJson;
using CogRegistryJson::GaugeToJson;
using CogRegistryJson::GizmoToJson;
using CogRegistryJson::GizmoTypeToJson;
using CogRegistryJson::GroupToJson;
using CogRegistryJson::IsBuiltinGizmoTypeId;
using CogRegistryJson::NormalizeGizmoType;

namespace
{
	// Must match KeyOf in _Core_Registry.cpp (case-insensitive mod\x1Fname).
	std::string KeyOf(const std::string& mod, const std::string& name)
	{
		return Lower(mod) + "\x1F" + Lower(name);
	}

	std::string NormalizeLogLevel(std::string raw)
	{
		raw = Lower(std::move(raw));
		if (raw == "debug" || raw == "trace") {
			return raw == "trace" ? "trace" : "debug";
		}
		return "info";
	}

	std::string ReadAll(const std::filesystem::path& path)
	{
		std::ifstream in(path);
		if (!in) {
			return {};
		}
		return std::string(std::istreambuf_iterator<char>(in), {});
	}

	void WriteAll(const std::filesystem::path& path, const std::string& text)
	{
		std::ofstream out(path, std::ios::binary | std::ios::trunc);
		if (!out) {
			logger::error("COG: failed to write {}", path.string());
			return;
		}
		out << text;
	}

	constexpr const char* kIndexFileName = "index.json";

	void SyncDir(const std::filesystem::path& dir, const std::unordered_set<std::string>& keepStems)
	{
		std::error_code ec;
		if (!std::filesystem::exists(dir, ec)) {
			return;
		}
		for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
			if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
				continue;
			}
			// Stacking order file — rewritten by WriteIdIndex; never prune as an orphan entity.
			if (entry.path().filename() == kIndexFileName) {
				continue;
			}
			if (!keepStems.contains(entry.path().stem().string())) {
				const auto path = entry.path();
				std::filesystem::remove(path, ec);
				if (ec) {
					logger::error("COG: failed to prune orphan config {}: {}", path.string(), ec.message());
					ec.clear();
				} else {
					logger::warn(
						"COG: pruned orphan config {} — not present in memory (skipped load, deleted entity, or empty id)",
						path.string());
				}
			}
		}
	}

	std::vector<std::string> ReadIdIndex(const std::filesystem::path& dir)
	{
		const auto path = dir / kIndexFileName;
		const auto text = ReadAll(path);
		if (text.empty()) {
			return {};
		}
		CogJson::Value root;
		std::string err;
		if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
			logger::warn(
				"COG: failed to parse {} — ignoring index ({})",
				path.string(),
				err.empty() ? "root is not an object" : err);
			return {};
		}
		CogJson::ParseContext ctx;
		ctx.path = path.filename().string();
		return ctx.GetStringArray(root, "ids");
	}

	void WriteIdIndex(const std::filesystem::path& dir, const std::vector<std::string>& ids)
	{
		std::ostringstream o;
		o << "{\n\t\"ids\": [";
		bool first = true;
		for (const auto& id : ids) {
			if (id.empty()) {
				continue;
			}
			if (!first) {
				o << ", ";
			}
			first = false;
			o << "\"" << EscapeJson(id) << "\"";
		}
		o << "]\n}\n";
		WriteAll(dir / kIndexFileName, o.str());
	}

	/** Apply index.json order; drop unknown ids; append discovery leftovers. */
	template <typename T>
	std::vector<T> OrderByIdIndex(
		std::vector<T> discovered,
		const std::filesystem::path& dir,
		const std::function<std::string(const T&)>& idOf)
	{
		std::unordered_map<std::string, T> byId;
		std::vector<std::string> discoveryOrder;
		byId.reserve(discovered.size());
		discoveryOrder.reserve(discovered.size());
		for (auto& item : discovered) {
			const auto id = idOf(item);
			if (id.empty() || byId.contains(id)) {
				continue;
			}
			discoveryOrder.push_back(id);
			byId.emplace(id, std::move(item));
		}

		std::vector<T> ordered;
		ordered.reserve(byId.size());
		std::unordered_set<std::string> placed;
		for (const auto& id : ReadIdIndex(dir)) {
			if (id.empty() || placed.contains(id)) {
				continue;
			}
			auto it = byId.find(id);
			if (it == byId.end()) {
				continue;
			}
			ordered.push_back(std::move(it->second));
			placed.insert(id);
			byId.erase(it);
		}
		for (const auto& id : discoveryOrder) {
			if (placed.contains(id)) {
				continue;
			}
			auto it = byId.find(id);
			if (it == byId.end()) {
				continue;
			}
			ordered.push_back(std::move(it->second));
			placed.insert(id);
			byId.erase(it);
		}
		return ordered;
	}
}

std::filesystem::path CogRegistry::DataRoot() const
{
	return std::filesystem::current_path() / "Data" / "SKSE" / "Plugins" / "COG";
}

void CogRegistry::EnsureDirs() const
{
	std::error_code ec;
	const auto root = DataRoot();
	std::filesystem::create_directories(root / "groups", ec);
	std::filesystem::create_directories(root / "gears", ec);
	std::filesystem::create_directories(root / "gauges", ec);
	std::filesystem::create_directories(root / "gizmos", ec);
	std::filesystem::create_directories(root / "gizmos" / "feed" / "inventory", ec);
	std::filesystem::create_directories(root / "gizmoTypes", ec);
}

void CogRegistry::LoadSeenFile(bool& repaired)
{
	const auto path = DataRoot() / "seen.json";
	const auto text = ReadAll(path);
	if (text.empty()) {
		return;
	}
	CogJson::Value root;
	std::string err;
	if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
		logger::error("COG: failed to parse {}: {}", path.string(), err.empty() ? "root is not an object" : err);
		return;
	}
	CogJson::ParseContext ctx;
	ctx.path = "seen.json";
	for (const auto& key : ctx.GetStringArray(root, "keys")) {
		if (!key.empty()) {
			_seenSources.insert(key);
		}
	}
	repaired = repaired || ctx.repaired;
}

void CogRegistry::LoadSendersFile(bool& repaired)
{
	_senders.clear();
	const auto path = DataRoot() / "senders.json";
	const auto text = ReadAll(path);
	if (text.empty()) {
		return;
	}
	CogJson::Value root;
	std::string err;
	if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
		logger::error("COG: failed to parse {}: {}", path.string(), err.empty() ? "root is not an object" : err);
		return;
	}
	CogJson::ParseContext ctx;
	ctx.path = "senders.json";
	const auto* arr = ctx.GetArray(root, "senders");
	if (!arr) {
		repaired = repaired || ctx.repaired;
		return;
	}
	for (const auto& item : arr->arrayValue) {
		if (!item.IsObject()) {
			continue;
		}
		const auto mod = ctx.GetString(item, "mod");
		if (mod.empty()) {
			continue;
		}
		CogSenderInfo info;
		info.plugin = ctx.GetString(item, "plugin");
		info.strikes = ctx.GetInt(item, "strikes", 0);
		if (info.strikes < 0) {
			info.strikes = 0;
		}
		_senders[mod] = std::move(info);
	}
	repaired = repaired || ctx.repaired;
}

void CogRegistry::SaveSendersUnlocked() const
{
	EnsureDirs();
	std::ostringstream o;
	o << "{\n\t\"senders\":[\n";
	bool first = true;
	for (const auto& [mod, info] : _senders) {
		if (!first) {
			o << ",\n";
		}
		first = false;
		o << "\t\t{\"mod\":\"" << EscapeJson(mod) << "\",\"plugin\":\"" << EscapeJson(info.plugin)
		  << "\",\"strikes\":" << info.strikes << "}";
	}
	o << "\n\t]\n}\n";
	WriteAll(DataRoot() / "senders.json", o.str());
}

void CogRegistry::LoadImportedIconsFile(bool& repaired)
{
	_importedIcons.clear();
	const auto path = DataRoot() / "imported-icons.json";
	const auto text = ReadAll(path);
	if (text.empty()) {
		return;
	}
	CogJson::Value root;
	std::string err;
	if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
		logger::error("COG: failed to parse {}: {}", path.string(), err.empty() ? "root is not an object" : err);
		return;
	}
	CogJson::ParseContext ctx;
	ctx.path = "imported-icons.json";
	const auto* arr = ctx.GetArray(root, "icons");
	if (!arr) {
		repaired = repaired || ctx.repaired;
		return;
	}
	for (const auto& item : arr->arrayValue) {
		if (!item.IsObject()) {
			continue;
		}
		auto iconPath = NormalizeIcon(ctx.GetString(item, "path"));
		if (iconPath.empty()) {
			continue;
		}
		std::string section = ctx.GetString(item, "section");
		if (section.empty()) {
			const auto slash = iconPath.find('/');
			section = (slash != std::string::npos && slash > 0) ? iconPath.substr(0, slash) : "General";
		}
		_importedIcons[std::move(iconPath)] = std::move(section);
	}
	repaired = repaired || ctx.repaired;
}

void CogRegistry::RemoveEmptyIconsRootIfPoisoned()
{
	const auto iconsRoot =
		std::filesystem::current_path() / "Data" / "PrismaUI" / "views" / "COG" / "assets" / "icons";
	std::error_code ec;
	if (!std::filesystem::is_directory(iconsRoot, ec)) {
		return;
	}
	// An empty physical icons/ in Overwrite / output mods still shadows USVFS
	// directory listing of shipped icon folders. Remove it when nothing remains.
	bool iconsHasChildren = false;
	for (const auto& entry : std::filesystem::directory_iterator(iconsRoot, ec)) {
		(void)entry;
		if (ec) {
			break;
		}
		iconsHasChildren = true;
		break;
	}
	if (!ec && !iconsHasChildren) {
		ec.clear();
		if (std::filesystem::remove(iconsRoot, ec)) {
			logger::info("COG: removed empty overlay icons/ to restore shipped icon enumeration");
		} else if (ec) {
			logger::warn("COG: could not remove empty overlay icons/: {}", ec.message());
		}
	}
}

void CogRegistry::SaveImportedIconsUnlocked() const
{
	EnsureDirs();
	std::vector<std::pair<std::string, std::string>> sorted(_importedIcons.begin(), _importedIcons.end());
	std::sort(sorted.begin(), sorted.end(), [](const auto& a, const auto& b) {
		if (a.second != b.second) {
			return a.second < b.second;
		}
		return a.first < b.first;
	});
	std::ostringstream o;
	o << "{\n\t\"icons\":[\n";
	bool first = true;
	for (const auto& [path, section] : sorted) {
		if (!first) {
			o << ",\n";
		}
		first = false;
		o << "\t\t{\"path\":\"" << EscapeJson(path) << "\",\"section\":\"" << EscapeJson(section) << "\"}";
	}
	o << "\n\t]\n}\n";
	WriteAll(DataRoot() / "imported-icons.json", o.str());
}

bool CogRegistry::RegisterImportedIcon(std::string relPath)
{
	return RegisterImportedIcon(std::move(relPath), true);
}

bool CogRegistry::RegisterImportedIcon(std::string relPath, bool requireFile)
{
	relPath = NormalizeIcon(std::move(relPath));
	if (relPath.empty()) {
		return false;
	}
	// Only index paths that actually live under the runtime imports tree. Remapped COG
	// shipped icons (e.g. Food and Drink/apple.svg) must not be recorded as imports.
	// MO2/USVFS: is_regular_file alone can miss files that still open for read.
	const auto file =
		std::filesystem::current_path() / "Data" / "PrismaUI" / "views" / "COG" / "assets" /
		"imports" / "icons" / std::filesystem::path(relPath);
	if (requireFile) {
		std::error_code ec;
		bool present = std::filesystem::is_regular_file(file, ec) && !ec;
		if (!present) {
			std::ifstream in(file, std::ios::binary);
			present = static_cast<bool>(in);
		}
		if (!present) {
			const DWORD attr = GetFileAttributesW(file.c_str());
			present = attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY) == 0;
		}
		if (!present) {
			return false;
		}
	}
	std::string section = "General";
	const auto slash = relPath.find('/');
	if (slash != std::string::npos && slash > 0) {
		section = relPath.substr(0, slash);
	}
	{
		std::lock_guard lock(_mutex);
		const auto [it, inserted] = _importedIcons.emplace(relPath, section);
		if (!inserted) {
			if (it->second == section) {
				return true;
			}
			it->second = section;
		}
		SaveImportedIconsUnlocked();
	}
	MarkCatalogDirty();
	PushImportedIconsToUi();
	PushToUi();
	return true;
}

std::string CogRegistry::ImportIcon(std::string sourceMod, std::string iconName, std::string dataRelPath)
{
	std::replace(dataRelPath.begin(), dataRelPath.end(), '\\', '/');
	while (!dataRelPath.empty() && (dataRelPath.front() == '/' || dataRelPath.front() == '\\')) {
		dataRelPath.erase(dataRelPath.begin());
	}

	// Short-circuit: source already under the imports tree — index and return the relative path.
	constexpr std::string_view kImportsPrefix = "PrismaUI/views/COG/assets/imports/icons/";
	{
		std::string lower = dataRelPath;
		std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		std::string prefixLower{ kImportsPrefix };
		std::transform(prefixLower.begin(), prefixLower.end(), prefixLower.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		if (lower.rfind(prefixLower, 0) == 0) {
			std::string rel = dataRelPath.substr(kImportsPrefix.size());
			rel = NormalizeIcon(std::move(rel));
			if (rel.empty()) {
				logger::warn(
					"COG ImportIcon short-circuit failed (mod='{}' icon='{}' path='{}')",
					sourceMod,
					iconName,
					dataRelPath);
				return {};
			}
			if (!RegisterImportedIcon(rel) && !RegisterImportedIcon(rel, false)) {
				logger::warn(
					"COG ImportIcon short-circuit index failed (mod='{}' icon='{}' path='{}')",
					sourceMod,
					iconName,
					dataRelPath);
				return {};
			}
			return rel;
		}
	}

	std::string rel = CogIconImport::ImportFromDataPath(
		sourceMod,
		iconName,
		dataRelPath);
	if (rel.empty()) {
		logger::warn(
			"COG ImportIcon failed (mod='{}' icon='{}' path='{}')",
			sourceMod,
			iconName,
			dataRelPath);
		return {};
	}
	// Write already succeeded — never discard the path because the index file-probe lagged
	// under MO2/USVFS (that used to force callers onto COG/cog.svg).
	if (!RegisterImportedIcon(rel) && !RegisterImportedIcon(rel, false)) {
		logger::warn("COG ImportIcon wrote {} but failed to index it", rel);
	}
	return rel;
}

void CogRegistry::LoadGeneralFile(bool& repaired)
{
	const auto path = DataRoot() / "general.json";
	const auto text = ReadAll(path);
	if (text.empty()) {
		_general = {};
		return;
	}
	CogJson::Value root;
	std::string err;
	if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
		logger::error("COG: failed to parse {}: {}", path.string(), err.empty() ? "root is not an object" : err);
		return;
	}
	CogJson::ParseContext ctx;
	ctx.path = "general.json";
	_general.showDefaultGroup = ctx.GetBool(root, "showDefaultGroup", true);
	_general.editorKey = NormalizeEditorKey(ctx.GetString(root, "editorKey"));
	_general.hideToggleKey = CogKeys::NormalizeKeyName(ctx.GetString(root, "hideToggleKey"));
	_general.hideIncludesFlash = ctx.GetBool(root, "hideIncludesFlash", true);
	_general.fillColor = NormalizeHexColor(ctx.GetString(root, "fillColor"), "#c4a35a");
	_general.borderColor = NormalizeHexColor(ctx.GetString(root, "borderColor"), "#e8d2a0");
	{
		auto icon = OptionalHexColor(ctx.GetString(root, "iconColor"));
		if (icon.empty()) {
			icon = OptionalHexColor(ctx.GetString(root, "iconStartColor"));
		}
		if (icon.empty()) {
			icon = OptionalHexColor(ctx.GetString(root, "iconEndColor"));
		}
		_general.iconColor = icon.empty() ? "#ffffff" : std::move(icon);
	}
	_general.neutralIconMode = NormalizeNeutralIconMode(ctx.GetString(root, "neutralIconMode"));
	{
		auto font = ctx.GetString(root, "gadgetFont");
		_general.gadgetFont = font.empty() ? "Roboto" : std::move(font);
	}
	if (ctx.Has(root, "logLevel")) {
		_general.logLevel = NormalizeLogLevel(ctx.GetString(root, "logLevel"));
	} else {
		_general.logLevel = "info";
	}
	repaired = repaired || ctx.repaired;
}

void CogRegistry::ApplyLogLevelUnlocked() const
{
	const auto level = NormalizeLogLevel(_general.logLevel);
	spdlog::level::level_enum lvl = spdlog::level::info;
	if (level == "trace") {
		lvl = spdlog::level::trace;
	} else if (level == "debug") {
		lvl = spdlog::level::debug;
	}
	if (auto log = spdlog::default_logger()) {
		log->set_level(lvl);
		log->flush_on(lvl);
	}
	logger::info("COG: logLevel={}", level);
}

void CogRegistry::LoadGroupFiles(bool& repaired)
{
	_groups.clear();
	std::error_code ec;
	const auto dir = DataRoot() / "groups";
	std::vector<CogGroup> discovered;
	if (std::filesystem::exists(dir, ec)) {
		for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
			if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
				continue;
			}
			if (entry.path().filename() == kIndexFileName) {
				continue;
			}
			const auto text = ReadAll(entry.path());
			CogJson::Value root;
			std::string err;
			if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
				logger::error(
					"COG: failed to parse {} — skipped load ({}); file may be pruned on next save",
					entry.path().string(),
					err.empty() ? "root is not an object" : err);
				continue;
			}
			CogJson::ParseContext ctx;
			ctx.path = "groups/" + entry.path().filename().string();
			auto group = ParseGroup(root, ctx);
			repaired = repaired || ctx.repaired;
			if (group.id.empty()) {
				logger::warn("COG: skipped group {} — empty id after parse", ctx.path);
				continue;
			}
			discovered.push_back(std::move(group));
		}
	}
	_groups = OrderByIdIndex<CogGroup>(std::move(discovered), dir, [](const CogGroup& g) {
		return g.id;
	});
	EnsureDefaultGroup();
}

void CogRegistry::LoadGearFiles(bool& repaired)
{
	_gears.clear();
	std::error_code ec;
	const auto dir = DataRoot() / "gears";
	if (!std::filesystem::exists(dir, ec)) {
		return;
	}
	for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
		if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
			continue;
		}
		const auto text = ReadAll(entry.path());
		CogJson::Value root;
		std::string err;
		if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
			logger::error(
				"COG: failed to parse {} — skipped load ({}); file may be pruned on next save",
				entry.path().string(),
				err.empty() ? "root is not an object" : err);
			continue;
		}
		CogJson::ParseContext ctx;
		ctx.path = "gears/" + entry.path().filename().string();
		auto gear = ParseGear(root, ctx);
		repaired = repaired || ctx.repaired;
		if (gear.id.empty() || gear.mod.empty() || gear.name.empty()) {
			logger::warn(
				"COG: skipped gear {} — missing id/mod/name after parse (id='{}' mod='{}' name='{}')",
				ctx.path,
				gear.id,
				gear.mod,
				gear.name);
			continue;
		}
		_gears.push_back(std::move(gear));
	}
}

void CogRegistry::LoadGaugeFiles(bool& repaired)
{
	_gauges.clear();
	std::error_code ec;
	const auto dir = DataRoot() / "gauges";
	if (!std::filesystem::exists(dir, ec)) {
		return;
	}
	std::vector<CogGauge> discovered;
	for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
		if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
			continue;
		}
		if (entry.path().filename() == kIndexFileName) {
			continue;
		}
		const auto text = ReadAll(entry.path());
		CogJson::Value root;
		std::string err;
		if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
			logger::error(
				"COG: failed to parse {} — skipped load ({}); file may be pruned on next save",
				entry.path().string(),
				err.empty() ? "root is not an object" : err);
			continue;
		}
		CogJson::ParseContext ctx;
		ctx.path = "gauges/" + entry.path().filename().string();
		auto gauge = ParseGauge(root, ctx);
		repaired = repaired || ctx.repaired;
		if (gauge.id.empty()) {
			logger::warn("COG: skipped gauge {} — empty id after parse", ctx.path);
			continue;
		}
		discovered.push_back(std::move(gauge));
	}
	_gauges = OrderByIdIndex<CogGauge>(std::move(discovered), dir, [](const CogGauge& g) {
		return g.id;
	});
}

void CogRegistry::LoadGizmoTypeFiles(bool& repaired)
{
	// Drop prior custom types; builtins are re-seeded after this load.
	_gizmoTypes.erase(
		std::remove_if(
			_gizmoTypes.begin(),
			_gizmoTypes.end(),
			[](const CogGizmoType& t) { return !IsBuiltinGizmoTypeId(t.typeId); }),
		_gizmoTypes.end());

	std::error_code ec;
	const auto dir = DataRoot() / "gizmoTypes";
	if (!std::filesystem::exists(dir, ec)) {
		return;
	}
	std::vector<CogGizmoType> discovered;
	for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
		if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
			continue;
		}
		if (entry.path().filename() == kIndexFileName) {
			continue;
		}
		const auto text = ReadAll(entry.path());
		CogJson::Value root;
		std::string err;
		if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
			logger::error(
				"COG: failed to parse {} — skipped load ({}); file may be pruned on next save",
				entry.path().string(),
				err.empty() ? "root is not an object" : err);
			continue;
		}
		CogJson::ParseContext ctx;
		ctx.path = "gizmoTypes/" + entry.path().filename().string();
		auto type = ParseGizmoType(root, ctx);
		repaired = repaired || ctx.repaired;
		if (type.typeId.empty()) {
			logger::warn("COG: skipped gizmo type {} — empty typeId after parse", ctx.path);
			continue;
		}
		// Builtins are owned by RegisterBuiltinGizmoTypesUnlocked (code is source of truth).
		if (IsBuiltinGizmoTypeId(type.typeId)) {
			continue;
		}
		if (type.sourceMod.empty()) {
			logger::warn("COG: skipped gizmo type {} — empty sourceMod", ctx.path);
			continue;
		}
		discovered.push_back(std::move(type));
	}
	for (auto& type : OrderByIdIndex<CogGizmoType>(
			 std::move(discovered),
			 dir,
			 [](const CogGizmoType& t) { return t.typeId; })) {
		_gizmoTypes.push_back(std::move(type));
	}
}

void CogRegistry::SaveGizmoTypesUnlocked() const
{
	EnsureDirs();
	const auto dir = DataRoot() / "gizmoTypes";
	std::unordered_set<std::string> stems;
	std::vector<std::string> ids;
	ids.reserve(_gizmoTypes.size());
	for (const auto& type : _gizmoTypes) {
		if (type.typeId.empty()) {
			continue;
		}
		const auto stem = FileStem(type.typeId);
		stems.insert(stem);
		ids.push_back(type.typeId);
		WriteAll(dir / (stem + ".json"), GizmoTypeToJson(type));
	}
	WriteIdIndex(dir, ids);
	SyncDir(dir, stems);
}

void CogRegistry::LoadGizmoFiles(bool& repaired)
{
	_gizmos.clear();
	std::error_code ec;
	const auto dir = DataRoot() / "gizmos";
	if (!std::filesystem::exists(dir, ec)) {
		return;
	}
	std::vector<CogGizmo> discovered;
	for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
		if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
			continue;
		}
		if (entry.path().filename() == kIndexFileName) {
			continue;
		}
		const auto text = ReadAll(entry.path());
		CogJson::Value root;
		std::string err;
		if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
			logger::error(
				"COG: failed to parse {} — skipped load ({}); file may be pruned on next save",
				entry.path().string(),
				err.empty() ? "root is not an object" : err);
			continue;
		}
		CogJson::ParseContext ctx;
		ctx.path = "gizmos/" + entry.path().filename().string();
		const auto* type = FindGizmoTypeUnlocked(NormalizeGizmoType(ctx.GetString(root, "type")));
		auto gizmo = ParseGizmo(root, ctx, type);
		repaired = repaired || ctx.repaired;
		if (gizmo.id.empty()) {
			logger::warn("COG: skipped gizmo {} — empty id after parse", ctx.path);
			continue;
		}
		discovered.push_back(std::move(gizmo));
	}
	_gizmos = OrderByIdIndex<CogGizmo>(std::move(discovered), dir, [](const CogGizmo& g) {
		return g.id;
	});
}

bool CogRegistry::ApplyStateJson(const std::string& json)
{
	CogJson::Value root;
	std::string err;
	if (!CogJson::Parse(json, root, err) || !root.IsObject()) {
		logger::error("COG: failed to parse state JSON: {}", err.empty() ? "root is not an object" : err);
		return false;
	}
	CogJson::ParseContext ctx;
	ctx.path = "state";

	if (ctx.Has(root, "general") || ctx.Has(root, "showDefaultGroup")) {
		const CogJson::Value* src = &root;
		if (const auto* general = ctx.GetObject(root, "general")) {
			src = general;
		}
		_general.showDefaultGroup = ctx.GetBool(*src, "showDefaultGroup", true);
		if (ctx.Has(*src, "editorKey")) {
			_general.editorKey = NormalizeEditorKey(ctx.GetString(*src, "editorKey"));
		}
		if (ctx.Has(*src, "hideToggleKey")) {
			_general.hideToggleKey = CogKeys::NormalizeKeyName(ctx.GetString(*src, "hideToggleKey"));
		}
		if (ctx.Has(*src, "hideIncludesFlash")) {
			_general.hideIncludesFlash = ctx.GetBool(*src, "hideIncludesFlash", true);
		}
		if (ctx.Has(*src, "fillColor")) {
			_general.fillColor = NormalizeHexColor(ctx.GetString(*src, "fillColor"), "#c4a35a");
		}
		if (ctx.Has(*src, "borderColor")) {
			_general.borderColor = NormalizeHexColor(ctx.GetString(*src, "borderColor"), "#e8d2a0");
		}
		if (ctx.Has(*src, "iconColor")) {
			_general.iconColor = NormalizeHexColor(ctx.GetString(*src, "iconColor"), "#ffffff");
		} else if (ctx.Has(*src, "iconStartColor")) {
			_general.iconColor = NormalizeHexColor(ctx.GetString(*src, "iconStartColor"), "#ffffff");
		} else if (ctx.Has(*src, "iconEndColor")) {
			_general.iconColor = NormalizeHexColor(ctx.GetString(*src, "iconEndColor"), "#ffffff");
		}
		if (ctx.Has(*src, "neutralIconMode")) {
			_general.neutralIconMode = NormalizeNeutralIconMode(ctx.GetString(*src, "neutralIconMode"));
		}
		if (ctx.Has(*src, "gadgetFont")) {
			auto font = ctx.GetString(*src, "gadgetFont");
			_general.gadgetFont = font.empty() ? "Roboto" : std::move(font);
		}
		if (ctx.Has(*src, "logLevel")) {
			_general.logLevel = NormalizeLogLevel(ctx.GetString(*src, "logLevel"));
			ApplyLogLevelUnlocked();
		}
	}

	if (const auto* arr = ctx.GetArray(root, "groups")) {
		_groups.clear();
		for (const auto& item : arr->arrayValue) {
			if (!item.IsObject()) {
				continue;
			}
			auto group = ParseGroup(item, ctx);
			if (group.id.empty()) {
				continue;
			}
			bool dup = false;
			for (const auto& existing : _groups) {
				if (existing.id == group.id) {
					dup = true;
					break;
				}
			}
			if (!dup) {
				_groups.push_back(std::move(group));
			}
		}
	}
	EnsureDefaultGroup();

	if (const auto* arr = ctx.GetArray(root, "gears")) {
		if (arr->arrayValue.empty() && !_gears.empty()) {
			logger::warn(
				"COG: state JSON has gears=[] while {} gear(s) are loaded — keeping prior gears (refusing wipe)",
				_gears.size());
		} else {
			std::unordered_set<std::string> keptKeys;
			std::vector<CogGear> next;
			next.reserve(arr->arrayValue.size());
			for (const auto& item : arr->arrayValue) {
				if (!item.IsObject()) {
					continue;
				}
				auto gear = ParseGear(item, ctx);
				if (gear.id.empty() || gear.mod.empty() || gear.name.empty()) {
					continue;
				}
				keptKeys.insert(KeyOf(gear.mod, gear.name));
				next.push_back(std::move(gear));
			}
			// Mirror Drop*: gears removed from the entity list must clear seen, or a later
			// Register recreates the JSON while OfferDefaultGear refuses Default Group placement.
			for (const auto& old : _gears) {
				const auto key = KeyOf(old.mod, old.name);
				if (!keptKeys.contains(key)) {
					_seenSources.erase(key);
				}
			}
			_gears = std::move(next);
		}
	}

	if (const auto* arr = ctx.GetArray(root, "gauges")) {
		_gauges.clear();
		for (const auto& item : arr->arrayValue) {
			if (!item.IsObject()) {
				continue;
			}
			auto gauge = ParseGauge(item, ctx);
			if (gauge.id.empty()) {
				continue;
			}
			_gauges.push_back(std::move(gauge));
		}
	}

	if (const auto* arr = ctx.GetArray(root, "gizmos")) {
		_gizmos.clear();
		for (const auto& item : arr->arrayValue) {
			if (!item.IsObject()) {
				continue;
			}
			const auto typeName = NormalizeGizmoType(ctx.GetString(item, "type"));
			auto gizmo = ParseGizmo(item, ctx, FindGizmoTypeUnlocked(typeName));
			if (gizmo.id.empty()) {
				continue;
			}
			_gizmos.push_back(std::move(gizmo));
		}
	}

	ReconcileGroupMembership();

	RememberGearKeysUnlocked();
	for (auto& group : _groups) {
		if (group.id == kDefaultGroupId) {
			group.visible = _general.showDefaultGroup;
			group.locked = true;
			group.name = "Default Group";
		}
	}
	return true;
}

void CogRegistry::SaveConfigUnlocked() const
{
	EnsureDirs();
	const auto root = DataRoot();

	std::ostringstream general;
	general << "{\n\t\"showDefaultGroup\": " << (_general.showDefaultGroup ? "true" : "false")
			<< ",\n\t\"editorKey\": \"" << EscapeJson(_general.editorKey)
			<< "\",\n\t\"hideToggleKey\": \"" << EscapeJson(_general.hideToggleKey)
			<< "\",\n\t\"hideIncludesFlash\": " << (_general.hideIncludesFlash ? "true" : "false")
			<< ",\n\t\"fillColor\": \"" << EscapeJson(_general.fillColor)
			<< "\",\n\t\"borderColor\": \"" << EscapeJson(_general.borderColor)
			<< "\",\n\t\"iconColor\": \"" << EscapeJson(_general.iconColor)
			<< "\",\n\t\"neutralIconMode\": \"" << EscapeJson(_general.neutralIconMode)
			<< "\",\n\t\"gadgetFont\": \"" << EscapeJson(_general.gadgetFont)
			<< "\",\n\t\"logLevel\": \"" << EscapeJson(NormalizeLogLevel(_general.logLevel)) << "\"\n}\n";
	WriteAll(root / "general.json", general.str());

	std::unordered_set<std::string> groupStems;
	std::vector<std::string> groupIds;
	groupIds.reserve(_groups.size());
	for (const auto& group : _groups) {
		const auto stem = FileStem(group.id);
		groupStems.insert(stem);
		groupIds.push_back(group.id);
		WriteAll(root / "groups" / (stem + ".json"), GroupToJson(group));
	}
	WriteIdIndex(root / "groups", groupIds);
	SyncDir(root / "groups", groupStems);

	std::unordered_set<std::string> gearStems;
	for (const auto& gear : _gears) {
		const auto stem = FileStem(gear.id);
		gearStems.insert(stem);
		WriteAll(root / "gears" / (stem + ".json"), GearToJson(gear));
	}
	SyncDir(root / "gears", gearStems);

	std::unordered_set<std::string> gaugeStems;
	std::vector<std::string> gaugeIds;
	gaugeIds.reserve(_gauges.size());
	for (const auto& gauge : _gauges) {
		const auto stem = FileStem(gauge.id);
		gaugeStems.insert(stem);
		gaugeIds.push_back(gauge.id);
		WriteAll(root / "gauges" / (stem + ".json"), GaugeToJson(gauge));
	}
	WriteIdIndex(root / "gauges", gaugeIds);
	SyncDir(root / "gauges", gaugeStems);

	std::unordered_set<std::string> gizmoStems;
	std::vector<std::string> gizmoIds;
	gizmoIds.reserve(_gizmos.size());
	for (const auto& gizmo : _gizmos) {
		const auto stem = FileStem(gizmo.id);
		gizmoStems.insert(stem);
		gizmoIds.push_back(gizmo.id);
		WriteAll(root / "gizmos" / (stem + ".json"), GizmoToJson(gizmo));
	}
	WriteIdIndex(root / "gizmos", gizmoIds);
	SyncDir(root / "gizmos", gizmoStems);
	SaveGizmoTypesUnlocked();

	std::ostringstream seen;
	seen << "{\n\t\"keys\":[";
	bool firstSeen = true;
	for (const auto& key : _seenSources) {
		if (!firstSeen) {
			seen << ", ";
		}
		firstSeen = false;
		seen << "\"" << EscapeJson(key) << "\"";
	}
	seen << "]\n}\n";
	WriteAll(root / "seen.json", seen.str());
	SaveSendersUnlocked();
	logger::info(
		"COG: saved config — root={} | groups={} gears={} gauges={} gizmos={}",
		root.string(),
		_groups.size(),
		_gears.size(),
		_gauges.size(),
		_gizmos.size());
}

void CogRegistry::LoadConfig()
{
	{
		std::lock_guard lock(_mutex);
		if (_configLoaded) {
			return;
		}
		_configLoaded = true;
		EnsureDirs();
		bool repaired = false;
		LoadGeneralFile(repaired);
		ApplyLogLevelUnlocked();
		LoadGroupFiles(repaired);
		std::error_code defaultEc;
		const bool defaultGroupMissingOnDisk =
			!std::filesystem::exists(DataRoot() / "groups" / "default.json", defaultEc);
		LoadSeenFile(repaired);
		LoadSendersFile(repaired);
		LoadImportedIconsFile(repaired);
		RemoveEmptyIconsRootIfPoisoned();
		LoadGearFiles(repaired);
		LoadGaugeFiles(repaired);
		// All type records (disk customs + builtins) before instances so missing
		// fields can fall back to the type, then universal defaults.
		LoadGizmoTypeFiles(repaired);
		RegisterBuiltinGizmoTypesUnlocked();
		LoadGizmoFiles(repaired);
		ReconcileGroupMembership();
		ReconcileGaugeBindingsUnlocked();
		PruneMissingPluginsUnlocked();
		CogInventory::EnsureBuiltinsUnlocked(*this);
		RememberGearKeysUnlocked();
		for (auto& group : _groups) {
			if (group.id == kDefaultGroupId) {
				group.visible = _general.showDefaultGroup;
			}
		}
		// First-load Default Group (and any JSON repair) must hit disk so MO2 writes
		// groups/default.json into Overwrite — not a ship-with-mod path that gets wiped.
		if (repaired || defaultGroupMissingOnDisk) {
			if (defaultGroupMissingOnDisk) {
				logger::info("COG: creating groups/default.json on first load");
			} else {
				logger::warn("COG: rewrote config after JSON repair — see prior warnings for details");
			}
			SaveConfigUnlocked();
		}
	}
	CogInventory::RegisterFromSaved();
	EnsureBuiltinSources();
	{
		std::lock_guard lock(_mutex);
		logger::info(
			"COG: [phase] config — root={} | groups={} gears={} gauges={} gizmos={} types={} senders={} importedIcons={} | editorKey={}",
			DataRoot().string(),
			_groups.size(),
			_gears.size(),
			_gauges.size(),
			_gizmos.size(),
			_gizmoTypes.size(),
			_senders.size(),
			_importedIcons.size(),
			_general.editorKey.empty() ? CogKeys::kDefaultEditorKey : _general.editorKey.c_str());
	}
	MarkLayoutDirty();
	PushToUi();
	CogUi::SyncHideToggleKey();
}

void CogRegistry::SaveConfig() const
{
	std::lock_guard lock(_mutex);
	SaveConfigUnlocked();
}

bool CogRegistry::SetStateFromJson(const std::string& json)
{
	bool ok = false;
	bool uiHidden = false;
	bool includeFlash = true;
	{
		std::lock_guard lock(_mutex);
		ok = ApplyStateJson(json);
		SaveConfigUnlocked();
		_layoutDirty = true;
		uiHidden = _uiHidden;
		includeFlash = _general.hideIncludesFlash;
	}
	CogUi::SyncEditorKey();
	CogUi::SyncHideToggleKey();
	if (uiHidden) {
		CogUi::ApplyFlashUiHidden(includeFlash);
	}
	SyncHudDuplicates();
	return ok;
}
