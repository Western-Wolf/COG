#include "pch.h"
#include "_Gizmo_Feed_Sources.h"
#include "_Gizmo_Storage.h"
#include "_Core_Registry.h"
#include "_Core_Registry_Json.h"
#include "_Core_Reserved.h"
#include "_Core_Json.h"
#include "_UI_CogUi.h"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <iterator>
#include <mutex>
#include <unordered_map>
#include <unordered_set>

namespace
{
	std::mutex g_mutex;
	bool g_ready = false;
	std::int32_t g_nextReceipt = 1;
	std::vector<CogFeedSources::Entry> g_catalog;
	std::unordered_map<std::string, std::size_t> g_index;  // id → catalog index
	std::unordered_set<std::string> g_batchOpen;           // sourceMod lower
	std::unordered_map<std::string, std::unordered_set<std::string>> g_batchSeen;  // mod → ids this batch
	std::unordered_map<std::string, std::string> g_modPlugin;  // mod → pluginFile

	std::string TrimCopy(std::string s)
	{
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.front()))) {
			s.erase(s.begin());
		}
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back()))) {
			s.pop_back();
		}
		return s;
	}

	std::string LowerCopy(std::string s)
	{
		for (char& c : s) {
			c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
		}
		return s;
	}

	std::string EscapeJson(std::string_view raw)
	{
		std::string out;
		out.reserve(raw.size() + 8);
		for (char c : raw) {
			switch (c) {
			case '\\':
				out += "\\\\";
				break;
			case '"':
				out += "\\\"";
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
				out += c;
				break;
			}
		}
		return out;
	}

	bool ParseSettingsRoot(const CogGizmo& g, CogJson::Value& root)
	{
		std::string err;
		if (!CogJson::Parse(g.settingsJson.empty() ? "{}" : g.settingsJson, root, err) || !root.IsObject()) {
			return false;
		}
		// Heal flat / partial bags on every read so divert + UI never see stale shape.
		if (CogFeedSources::CanonicalizeInstanceSettings(root)) {
			const auto next = CogJson::Stringify(root, false);
			if (!next.empty() && next != g.settingsJson) {
				const_cast<CogGizmo&>(g).settingsJson = next;
			}
		}
		return true;
	}

	const CogJson::Value* SourceObject(const CogJson::Value& root, std::string_view sourceId)
	{
		const auto* sources = root.Find("sources");
		if (!sources || !sources->IsObject()) {
			return nullptr;
		}
		return sources->Find(sourceId);
	}

	/** Legacy flat show* keys for builtin source ids. */
	const char* LegacyShowKey(std::string_view sourceId)
	{
		if (sourceId == CogFeedSources::kIdNotifications) {
			return "showNotifications";
		}
		if (sourceId == CogFeedSources::kIdInventory) {
			return "showInventory";
		}
		if (sourceId == CogFeedSources::kIdLocation) {
			return "showLocation";
		}
		if (sourceId == CogFeedSources::kIdSkills) {
			return "showSkills";
		}
		if (sourceId == CogFeedSources::kIdQuests) {
			return "showQuests";
		}
		if (sourceId == CogFeedSources::kIdEffects) {
			return "showActiveEffects";
		}
		return nullptr;
	}

	std::vector<std::string> ParseStringArrayJson(std::string_view json)
	{
		CogJson::Value root;
		std::string err;
		const std::string text = json.empty() ? "[]" : std::string(json);
		if (!CogJson::Parse(text, root, err) || !root.IsArray()) {
			return {};
		}
		std::vector<std::string> out;
		for (const auto& v : root.arrayValue) {
			if (v.IsString() && !v.stringValue.empty()) {
				out.push_back(v.stringValue);
			}
		}
		return out;
	}

	std::string StringifyStringArray(const std::vector<std::string>& items)
	{
		std::string o = "[";
		for (std::size_t i = 0; i < items.size(); ++i) {
			if (i) {
				o += ',';
			}
			o += '"';
			o += EscapeJson(items[i]);
			o += '"';
		}
		o += ']';
		return o;
	}

	bool DirHasEntries(const std::filesystem::path& dir)
	{
		std::error_code ec;
		if (!std::filesystem::is_directory(dir, ec)) {
			return false;
		}
		auto it = std::filesystem::directory_iterator(dir, ec);
		return !ec && it != std::filesystem::directory_iterator{};
	}

	void MoveLegacyFolder(const std::filesystem::path& feedRoot, const char* legacyName, const char* sourceId)
	{
		const auto legacy = feedRoot / legacyName;
		const auto dest = feedRoot / "sources" / sourceId;
		std::error_code ec;
		if (!std::filesystem::exists(legacy, ec) || !std::filesystem::is_directory(legacy, ec)) {
			return;
		}
		if (std::filesystem::exists(dest, ec) && DirHasEntries(dest)) {
			return;
		}
		std::filesystem::create_directories(dest.parent_path(), ec);
		if (std::filesystem::exists(dest, ec)) {
			std::filesystem::remove_all(dest, ec);
		}
		std::filesystem::rename(legacy, dest, ec);
		if (ec) {
			std::error_code copyEc;
			std::filesystem::copy(
				legacy,
				dest,
				std::filesystem::copy_options::recursive | std::filesystem::copy_options::overwrite_existing,
				copyEc);
			if (!copyEc) {
				std::filesystem::remove_all(legacy, copyEc);
				logger::info(
					"COG: Migration Code for Transition from v1.11 or earlier to v1.2: copied '{}' → '{}'",
					legacy.string(),
					dest.string());
			} else {
				logger::warn(
					"COG: Migration Code for Transition from v1.11 or earlier to v1.2: failed moving '{}' → '{}': {}",
					legacy.string(),
					dest.string(),
					ec.message());
			}
			return;
		}
		logger::info(
			"COG: Migration Code for Transition from v1.11 or earlier to v1.2: moved '{}' → '{}'",
			legacy.string(),
			dest.string());
	}

	void CopySettingsHtmlIfNeeded(const std::string& sourceId, const std::string& settingsHtmlPath)
	{
		auto path = TrimCopy(settingsHtmlPath);
		if (path.empty()) {
			return;
		}
		std::replace(path.begin(), path.end(), '\\', '/');
		const auto destRel = std::string("gizmoTypes/cog-feed/sources/") + sourceId + ".html";
		if (LowerCopy(path) == LowerCopy(destRel)) {
			return;
		}
		const auto dataRoot = CogGizmoStorage::DataRoot();
		std::filesystem::path srcAbs;
		// Already under COG root (dest or author writing into gizmoTypes/…).
		if (path.starts_with("gizmoTypes/")) {
			srcAbs = dataRoot / path;
		} else {
			// Data-relative (same as RegisterGizmo): PrismaUI/views/…, SKSE/…, etc.
			srcAbs = std::filesystem::current_path() / "Data" / path;
		}
		const auto destAbs = dataRoot / "gizmoTypes" / "cog-feed" / "sources" / (sourceId + ".html");
		std::error_code ec;
		if (!std::filesystem::exists(srcAbs, ec)) {
			logger::warn("COG_Feed_API.RegisterSource: settings HTML missing '{}'", srcAbs.string());
			return;
		}
		std::filesystem::create_directories(destAbs.parent_path(), ec);
		std::filesystem::copy_file(srcAbs, destAbs, std::filesystem::copy_options::overwrite_existing, ec);
		if (ec) {
			logger::warn(
				"COG_Feed_API.RegisterSource: could not copy '{}' → '{}': {}",
				srcAbs.string(),
				destAbs.string(),
				ec.message());
		}
	}

	void RebuildIndexUnlocked()
	{
		g_index.clear();
		for (std::size_t i = 0; i < g_catalog.size(); ++i) {
			g_index[g_catalog[i].id] = i;
		}
	}

	void RegisterBuiltinUnlocked(const char* id, const char* display, const char* suppressAlias, std::vector<std::string> colours)
	{
		CogFeedSources::Entry e;
		e.id = id;
		e.sourceMod = CogFeedSources::kBuiltinMod;
		e.displayName = display;
		e.settingsHtmlRel = std::string("gizmoTypes/cog-feed/sources/") + id + ".html";
		e.colourVars = std::move(colours);
		e.hudSuppress.clear();
		if (suppressAlias && suppressAlias[0]) {
			e.hudSuppress.push_back(suppressAlias);
		}
		e.receipt = g_nextReceipt++;
		if (e.receipt <= 0) {
			g_nextReceipt = 1;
			e.receipt = g_nextReceipt++;
		}
		const auto it = g_index.find(e.id);
		if (it != g_index.end()) {
			g_catalog[it->second] = std::move(e);
		} else {
			g_index[e.id] = g_catalog.size();
			g_catalog.push_back(std::move(e));
		}
		g_batchSeen[LowerCopy(CogFeedSources::kBuiltinMod)].insert(id);
		CogFeedSources::SourceStorageDir(id);
	}

	void RegisterAllBuiltinsUnlocked()
	{
		const std::string modKey = LowerCopy(CogFeedSources::kBuiltinMod);
		g_batchOpen.insert(modKey);
		g_batchSeen[modKey].clear();
		RegisterBuiltinUnlocked(
			CogFeedSources::kIdEffects,
			"Active Effects",
			"hud.activeEffects",
			{ "effectsColor" });
		RegisterBuiltinUnlocked(
			CogFeedSources::kIdInventory,
			"Inventory",
			"hud.inventory",
			{ "addColor", "removeColor", "stolenColor" });
		RegisterBuiltinUnlocked(
			CogFeedSources::kIdLocation,
			"Location",
			"hud.currentLocation",
			{ "locationDiscoveryColor", "currentLocationColor" });
		RegisterBuiltinUnlocked(
			CogFeedSources::kIdNotifications,
			"Notifications",
			"hud.notifications",
			{ "textColor" });
		// Skills: divert-only (kSkillIncrease). Do not soft-hide hud.questUpdates — that clip is
		// shared with quest-update banners (same pattern as location discovery).
		RegisterBuiltinUnlocked(
			CogFeedSources::kIdSkills,
			"Skills",
			"",
			{ "skillProgressColor", "levelProgressColor" });
		// Quests: divert-only (kQuest* / kObjective*); same shared clip, no soft-hide.
		RegisterBuiltinUnlocked(
			CogFeedSources::kIdQuests,
			"Quests",
			"",
			{ "questStatusColor", "questObjectiveColor" });
		// EndRegister trim for COG builtins
		std::unordered_set<std::string> keep = g_batchSeen[modKey];
		g_catalog.erase(
			std::remove_if(
				g_catalog.begin(),
				g_catalog.end(),
				[&](const CogFeedSources::Entry& e) {
					return LowerCopy(e.sourceMod) == modKey && !keep.count(e.id);
				}),
			g_catalog.end());
		RebuildIndexUnlocked();
		g_batchOpen.erase(modKey);
		g_batchSeen.erase(modKey);
	}

	void SendFeedReadyEvent()
	{
		SKSE::ModCallbackEvent ev{ "COG_Feed_Ready", "", 0.0f, nullptr };
		if (auto* source = SKSE::GetModCallbackEventSource()) {
			source->SendEvent(&ev);
		}
		logger::info("COG: COG_Feed_Ready sent");
	}
}

std::filesystem::path CogFeedSources::FeedStorageDir()
{
	return CogGizmoStorage::EnsureDir("cog-feed");
}

std::string CogFeedSources::FeedStorageRelative()
{
	return CogGizmoStorage::Relative("cog-feed");
}

std::filesystem::path CogFeedSources::SourceStorageDir(std::string_view sourceId)
{
	auto id = TrimCopy(std::string(sourceId));
	if (id.empty()) {
		return {};
	}
	const auto dir = FeedStorageDir() / "sources" / id;
	std::error_code ec;
	std::filesystem::create_directories(dir, ec);
	if (ec) {
		logger::warn("COG: could not create Feed source storage {}: {}", dir.string(), ec.message());
	}
	return dir;
}

std::string CogFeedSources::SourceStorageRelative(std::string_view sourceId)
{
	auto id = TrimCopy(std::string(sourceId));
	if (id.empty()) {
		return {};
	}
	return FeedStorageRelative() + "/sources/" + id;
}

void CogFeedSources::MigrateLegacySourceFolders()
{
	const auto feedRoot = FeedStorageDir();
	std::error_code ec;
	std::filesystem::create_directories(feedRoot / "sources", ec);
	// Migration Code for Transition from v1.11 or earlier to v1.2
	MoveLegacyFolder(feedRoot, "notifications", kIdNotifications);
	MoveLegacyFolder(feedRoot, "inventory", kIdInventory);
	MoveLegacyFolder(feedRoot, "location", kIdLocation);
	MoveLegacyFolder(feedRoot, "skills", kIdSkills);
	MoveLegacyFolder(feedRoot, "effects", kIdEffects);
}

void CogFeedSources::Bootstrap()
{
	{
		std::lock_guard lock(g_mutex);
		FeedStorageDir();
		MigrateLegacySourceFolders();
		RegisterAllBuiltinsUnlocked();
		g_ready = true;
	}
	CogRegistry::Get().MarkCatalogDirty();
	CogRegistry::Get().MarkLayoutDirty();
	SendFeedReadyEvent();
}

void CogFeedSources::OnLoadSessionReady()
{
	{
		std::lock_guard lock(g_mutex);
		MigrateLegacySourceFolders();
		RegisterAllBuiltinsUnlocked();
		g_ready = true;
	}
	CogRegistry::Get().MarkCatalogDirty();
	CogRegistry::Get().MarkLayoutDirty();
	SendFeedReadyEvent();
}

bool CogFeedSources::IsReady()
{
	std::lock_guard lock(g_mutex);
	return g_ready;
}

void CogFeedSources::BeginRegister(std::string sourceMod, std::string pluginFile)
{
	sourceMod = TrimCopy(std::move(sourceMod));
	if (sourceMod.empty()) {
		logger::warn("COG_Feed_API.BeginRegister rejected: empty sourceMod");
		return;
	}
	// Reserved COG / COG.* gate lives in the Papyrus wrapper (PapyrusBeginRegister).
	const auto key = LowerCopy(sourceMod);
	std::lock_guard lock(g_mutex);
	g_batchOpen.insert(key);
	g_batchSeen[key].clear();
	pluginFile = TrimCopy(std::move(pluginFile));
	if (!pluginFile.empty()) {
		g_modPlugin[key] = std::move(pluginFile);
	}
}

std::int32_t CogFeedSources::RegisterSource(
	std::string sourceMod,
	std::string sourceId,
	std::string displayName,
	std::string settingsHtmlPath,
	std::string colourVarsJson,
	std::string hudSuppressJson)
{
	sourceMod = TrimCopy(std::move(sourceMod));
	sourceId = TrimCopy(std::move(sourceId));
	displayName = TrimCopy(std::move(displayName));
	if (sourceMod.empty() || sourceId.empty()) {
		logger::warn("COG_Feed_API.RegisterSource rejected: empty mod or id");
		return 0;
	}
	// Reserved COG / COG.* / cog-* gates live in the Papyrus wrapper (PapyrusRegisterSource).
	// Builtins seed via RegisterBuiltinUnlocked and never call this.
	const auto modKey = LowerCopy(sourceMod);
	std::lock_guard lock(g_mutex);
	if (!g_batchOpen.count(modKey)) {
		logger::warn(
			"COG_Feed_API.RegisterSource '{}' rejected: no open BeginRegister for '{}'",
			sourceId,
			sourceMod);
		return 0;
	}
	if (displayName.empty()) {
		displayName = sourceId;
	}
	Entry e;
	e.id = sourceId;
	e.sourceMod = sourceMod;
	e.displayName = std::move(displayName);
	e.settingsHtmlRel = std::string("gizmoTypes/cog-feed/sources/") + sourceId + ".html";
	e.colourVars = ParseStringArrayJson(colourVarsJson);
	e.hudSuppress = ParseStringArrayJson(hudSuppressJson);
	e.receipt = g_nextReceipt++;
	if (e.receipt <= 0) {
		g_nextReceipt = 1;
		e.receipt = g_nextReceipt++;
	}
	CopySettingsHtmlIfNeeded(sourceId, settingsHtmlPath);
	SourceStorageDir(sourceId);
	g_batchSeen[modKey].insert(sourceId);
	const auto receipt = e.receipt;
	const auto it = g_index.find(sourceId);
	if (it != g_index.end()) {
		g_catalog[it->second] = std::move(e);
		return receipt;
	}
	g_index[sourceId] = g_catalog.size();
	g_catalog.push_back(std::move(e));
	return receipt;
}

void CogFeedSources::EndRegister(std::string sourceMod)
{
	sourceMod = TrimCopy(std::move(sourceMod));
	if (sourceMod.empty()) {
		logger::warn("COG_Feed_API.EndRegister rejected: empty sourceMod");
		return;
	}
	// Reserved COG / COG.* gate lives in the Papyrus wrapper (PapyrusEndRegister).
	const auto modKey = LowerCopy(sourceMod);
	std::lock_guard lock(g_mutex);
	if (!g_batchOpen.count(modKey)) {
		logger::warn("COG_Feed_API.EndRegister '{}' — no open batch", sourceMod);
		return;
	}
	const auto keep = g_batchSeen[modKey];
	g_catalog.erase(
		std::remove_if(
			g_catalog.begin(),
			g_catalog.end(),
			[&](const Entry& e) { return LowerCopy(e.sourceMod) == modKey && !keep.count(e.id); }),
		g_catalog.end());
	RebuildIndexUnlocked();
	g_batchOpen.erase(modKey);
	g_batchSeen.erase(modKey);
	logger::info(
		"COG_Feed_API.EndRegister '{}' — {} source(s) kept",
		sourceMod,
		keep.size());
	// Unlock before UI dirty flags (Push needs registry mutex).
}

namespace
{
	void MarkFeedCatalogDirtyOnMain()
	{
		CogUi::RunOnMainThread([]() {
			CogRegistry::Get().MarkCatalogDirty();
			CogRegistry::Get().MarkLayoutDirty();
			CogRegistry::Get().PushToUi();
		});
	}
}

bool CogFeedSources::IsRegistered(std::string_view sourceId)
{
	auto id = TrimCopy(std::string(sourceId));
	if (id.empty()) {
		return false;
	}
	std::lock_guard lock(g_mutex);
	return g_index.find(id) != g_index.end();
}

std::optional<CogFeedSources::Entry> CogFeedSources::Find(std::string_view sourceId)
{
	auto id = TrimCopy(std::string(sourceId));
	if (id.empty()) {
		return std::nullopt;
	}
	std::lock_guard lock(g_mutex);
	const auto it = g_index.find(id);
	if (it == g_index.end() || it->second >= g_catalog.size()) {
		return std::nullopt;
	}
	return g_catalog[it->second];
}

std::string CogFeedSources::CanonicalSourceId(std::string_view raw)
{
	auto s = TrimCopy(std::string(raw));
	if (s.empty()) {
		return {};
	}
	const auto lower = LowerCopy(s);
	if (lower == "cog-feednotifications" || lower == kIdNotifications) {
		return kIdNotifications;
	}
	if (lower == "cog-feedinventory" || lower == kIdInventory) {
		return kIdInventory;
	}
	if (lower == "cog-feedlocation" || lower == kIdLocation) {
		return kIdLocation;
	}
	if (lower == "cog-feedskills" || lower == kIdSkills) {
		return kIdSkills;
	}
	if (lower == "cog-feedquests" || lower == kIdQuests) {
		return kIdQuests;
	}
	if (lower == "cog-feedeffects" || lower == kIdEffects) {
		return kIdEffects;
	}
	return s;
}

std::string CogFeedSources::LogSourceLabel(std::string_view raw)
{
	auto s = TrimCopy(std::string(raw));
	if (s.empty()) {
		return "empty";
	}
	return s;
}

std::string CogFeedSources::RouteSourceId(std::string_view raw)
{
	auto canon = CanonicalSourceId(raw);
	if (canon.empty()) {
		return kIdNotifications;
	}
	if (IsRegistered(canon)) {
		return canon;
	}
	return kIdNotifications;
}

bool CogFeedSources::CanonicalizeInstanceSettings(CogJson::Value& settings)
{
	// Migration Code for Transition from v1.11 or earlier to v1.2 (+ heal stale bags):
	// flat show*/colours → settings.sources.<id>; always ensure builtin blocks exist.
	constexpr int kSourcesVersion = 3;
	bool changed = false;
	if (!settings.IsObject()) {
		settings = {};
		settings.type = CogJson::Type::Object;
		changed = true;
	}

	auto ensureObject = [&](CogJson::Value& parent, const char* key) -> CogJson::Value& {
		auto& slot = parent.objectValue[key];
		if (!slot.IsObject()) {
			slot = {};
			slot.type = CogJson::Type::Object;
			changed = true;
		}
		return slot;
	};

	auto setBool = [&](CogJson::Value& obj, const char* key, bool value) {
		auto* existing = obj.Find(key);
		if (existing && existing->IsBool() && existing->boolValue == value) {
			return;
		}
		CogJson::Value v;
		v.type = CogJson::Type::Bool;
		v.boolValue = value;
		obj.objectValue[key] = std::move(v);
		changed = true;
	};

	auto setNumber = [&](CogJson::Value& obj, const char* key, double value) {
		auto* existing = obj.Find(key);
		if (existing && existing->IsNumber() && existing->numberValue == value) {
			return;
		}
		CogJson::Value v;
		v.type = CogJson::Type::Number;
		v.numberValue = value;
		obj.objectValue[key] = std::move(v);
		changed = true;
	};

	struct BuiltinSpec
	{
		const char* id;
		const char* showKey;
		const char* const* fields;
		std::size_t fieldCount;
	};
	static constexpr const char* kNotifFields[] = {
		"textColor", "notificationIcon", "showNotificationIcons", "allowModNotificationIcon",
		"allowModNotificationColor", "suppressInventory"
	};
	static constexpr const char* kInvFields[] = {
		"addColor", "removeColor", "stolenColor", "icon", "showInventoryIcons"
	};
	static constexpr const char* kLocFields[] = {
		"showLocationDiscovery", "showCurrentLocation", "locationDiscoveryIcon", "currentLocationIcon",
		"locationDiscoveryColor", "currentLocationColor", "showLocationIcons"
	};
	static constexpr const char* kSkillFields[] = {
		"showSkillProgress", "showLevelProgress", "skillProgressIcon", "levelProgressIcon",
		"skillProgressColor", "levelProgressColor", "showSkillIcons"
	};
	static constexpr const char* kQuestFields[] = {
		"showQuestStatus", "showQuestObjectives", "questStatusIcon", "questObjectiveIcon",
		"questStatusColor", "questObjectiveColor", "showQuestIcons"
	};
	static constexpr const char* kFxFields[] = {
		"effectsColor", "effectIcon", "showEffectIcons", "showEffectText", "showEffectTimer",
		"suppressTransformEffects"
	};
	static constexpr BuiltinSpec kBuiltins[] = {
		{ kIdNotifications, "showNotifications", kNotifFields, std::size(kNotifFields) },
		{ kIdInventory, "showInventory", kInvFields, std::size(kInvFields) },
		{ kIdLocation, "showLocation", kLocFields, std::size(kLocFields) },
		{ kIdSkills, "showSkills", kSkillFields, std::size(kSkillFields) },
		{ kIdQuests, "showQuests", kQuestFields, std::size(kQuestFields) },
		{ kIdEffects, "showActiveEffects", kFxFields, std::size(kFxFields) }
	};

	CogJson::Value& sources = ensureObject(settings, "sources");
	CogJson::ParseContext ctx;
	bool hadLegacyFlat = false;

	for (const auto& spec : kBuiltins) {
		CogJson::Value& block = ensureObject(sources, spec.id);
		if (settings.Has(spec.showKey)) {
			hadLegacyFlat = true;
			setBool(block, "enabled", ctx.GetBool(settings, spec.showKey, false));
			settings.objectValue.erase(spec.showKey);
			changed = true;
		} else if (!block.Find("enabled")) {
			setBool(block, "enabled", false);
		}
		for (std::size_t i = 0; i < spec.fieldCount; ++i) {
			const char* field = spec.fields[i];
			auto it = settings.objectValue.find(field);
			if (it == settings.objectValue.end()) {
				continue;
			}
			hadLegacyFlat = true;
			if (!block.Find(field)) {
				block.objectValue[field] = it->second;
			}
			settings.objectValue.erase(it);
			changed = true;
		}
	}

	// Drop leftover flat keys that may remain from partial heals.
	static constexpr const char* kOrphanFlats[] = {
		"textColor", "addColor", "removeColor", "stolenColor", "effectsColor", "effectIcon",
		"notificationIcon", "icon", "showEffectIcons", "showEffectText", "showEffectTimer",
		"suppressTransformEffects", "showNotificationIcons", "showInventoryIcons", "showLocationIcons",
		"showSkillIcons", "allowModNotificationIcon", "allowModNotificationColor", "suppressInventory",
		"showLocationDiscovery", "showCurrentLocation", "locationDiscoveryIcon", "currentLocationIcon",
		"locationDiscoveryColor", "currentLocationColor", "showSkillProgress", "showLevelProgress",
		"skillProgressIcon", "levelProgressIcon", "skillProgressColor", "levelProgressColor",
		"showQuestStatus", "showQuestObjectives", "questStatusIcon", "questObjectiveIcon",
		"questStatusColor", "questObjectiveColor", "showQuestIcons",
		"showNotifications", "showInventory", "showLocation", "showSkills", "showQuests", "showActiveEffects"
	};
	for (const char* key : kOrphanFlats) {
		if (settings.objectValue.erase(key)) {
			hadLegacyFlat = true;
			changed = true;
		}
	}

	int haveVersion = 0;
	if (const auto* ver = settings.Find("feedSourcesVersion"); ver && ver->IsNumber()) {
		haveVersion = static_cast<int>(ver->numberValue);
	} else if (settings.Find("feedSourcesMigrated")) {
		haveVersion = 1;
	}
	if (haveVersion < kSourcesVersion || hadLegacyFlat || changed) {
		setNumber(settings, "feedSourcesVersion", static_cast<double>(kSourcesVersion));
		if (settings.objectValue.erase("feedSourcesMigrated")) {
			changed = true;
		}
	}
	return changed;
}

bool CogFeedSources::SourceEnabled(const CogGizmo& g, std::string_view sourceId)
{
	auto id = CanonicalSourceId(sourceId);
	if (id.empty()) {
		id = kIdNotifications;
	}
	CogJson::Value root;
	if (!ParseSettingsRoot(g, root)) {
		return false;
	}
	CogJson::ParseContext ctx;
	if (const auto* src = SourceObject(root, id)) {
		if (src->IsObject() && src->Find("enabled")) {
			return ctx.GetBool(*src, "enabled", false);
		}
	}
	// Legacy flat show* still wins when nested enabled was never written (stale migrate).
	if (const char* legacy = LegacyShowKey(id)) {
		return ctx.GetBool(root, legacy, false);
	}
	if (const auto* src = SourceObject(root, id)) {
		if (src->IsObject()) {
			return ctx.GetBool(*src, "enabled", false);
		}
	}
	return false;
}

bool CogFeedSources::SourceFieldBool(
	const CogGizmo& g,
	std::string_view sourceId,
	std::string_view field,
	bool fallback)
{
	auto id = CanonicalSourceId(sourceId);
	CogJson::Value root;
	if (!ParseSettingsRoot(g, root)) {
		return fallback;
	}
	CogJson::ParseContext ctx;
	if (const auto* src = SourceObject(root, id)) {
		if (src->IsObject() && src->Has(field)) {
			return ctx.GetBool(*src, field, fallback);
		}
	}
	return ctx.GetBool(root, field, fallback);
}

std::string CogFeedSources::SourceFieldString(
	const CogGizmo& g,
	std::string_view sourceId,
	std::string_view field,
	std::string_view fallback)
{
	auto id = CanonicalSourceId(sourceId);
	CogJson::Value root;
	if (!ParseSettingsRoot(g, root)) {
		return std::string(fallback);
	}
	CogJson::ParseContext ctx;
	if (const auto* src = SourceObject(root, id)) {
		if (src->IsObject() && src->Has(field)) {
			auto v = ctx.GetString(*src, field);
			if (!v.empty()) {
				return v;
			}
		}
	}
	auto v = ctx.GetString(root, field);
	if (!v.empty()) {
		return v;
	}
	return std::string(fallback);
}

std::string CogFeedSources::CatalogJson(bool includeHtmlBodies)
{
	std::lock_guard lock(g_mutex);
	std::string o = "[";
	bool first = true;
	const auto dataRoot = CogGizmoStorage::DataRoot();
	for (const auto& e : g_catalog) {
		if (!first) {
			o += ',';
		}
		first = false;
		o += "{\"id\":\"";
		o += EscapeJson(e.id);
		o += "\",\"sourceMod\":\"";
		o += EscapeJson(e.sourceMod);
		o += "\",\"displayName\":\"";
		o += EscapeJson(e.displayName);
		o += "\",\"settingsHtmlRel\":\"";
		o += EscapeJson(e.settingsHtmlRel);
		o += "\",\"colourVars\":";
		o += StringifyStringArray(e.colourVars);
		o += ",\"hudSuppress\":";
		o += StringifyStringArray(e.hudSuppress);
		o += ",\"receipt\":";
		o += std::to_string(e.receipt);
		if (includeHtmlBodies) {
			std::string htmlBody;
			const auto htmlPath = dataRoot / "gizmoTypes" / "cog-feed" / "sources" / (e.id + ".html");
			std::ifstream in(htmlPath, std::ios::binary);
			if (in) {
				htmlBody.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
			}
			o += ",\"settingsHtml\":\"";
			o += EscapeJson(htmlBody);
			o += '"';
		}
		o += '}';
	}
	o += ']';
	return o;
}

std::vector<std::string> CogFeedSources::HudSuppressForGizmo(const CogGizmo& g)
{
	std::vector<std::string> keys;
	std::unordered_set<std::string> seen;
	std::vector<Entry> snapshot;
	{
		std::lock_guard lock(g_mutex);
		snapshot = g_catalog;
	}
	for (const auto& e : snapshot) {
		if (!SourceEnabled(g, e.id)) {
			continue;
		}
		for (const auto& alias : e.hudSuppress) {
			if (alias.empty() || !seen.insert(alias).second) {
				continue;
			}
			keys.push_back(alias);
		}
	}
	return keys;
}

namespace
{
	void PapyrusBeginRegister(
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string pluginFile)
	{
		if (CogReserved::IsReservedCogSourceMod(sourceMod)) {
			logger::warn(
				"COG_Feed_API.BeginRegister rejected: sourceMod '{}' is reserved for COG (native builtins only)",
				sourceMod);
			return;
		}
		CogFeedSources::BeginRegister(std::move(sourceMod), std::move(pluginFile));
	}

	std::int32_t PapyrusRegisterSource(
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string sourceId,
		std::string displayName,
		std::string settingsHtmlPath,
		std::string colourVarsJson,
		std::string hudSuppressJson)
	{
		if (CogReserved::IsReservedCogSourceMod(sourceMod)) {
			logger::warn(
				"COG_Feed_API.RegisterSource rejected: sourceMod '{}' is reserved for COG (native builtins only)",
				sourceMod);
			return 0;
		}
		if (CogReserved::IsReservedCogPrefixedId(sourceId)) {
			logger::warn(
				"COG_Feed_API.RegisterSource rejected: sourceId '{}' uses reserved cog- prefix",
				sourceId);
			return 0;
		}
		return CogFeedSources::RegisterSource(
			std::move(sourceMod),
			std::move(sourceId),
			std::move(displayName),
			std::move(settingsHtmlPath),
			std::move(colourVarsJson),
			std::move(hudSuppressJson));
	}

	void PapyrusEndRegister(RE::StaticFunctionTag*, std::string sourceMod)
	{
		if (CogReserved::IsReservedCogSourceMod(sourceMod)) {
			logger::warn(
				"COG_Feed_API.EndRegister rejected: sourceMod '{}' is reserved for COG (native builtins only)",
				sourceMod);
			return;
		}
		CogFeedSources::EndRegister(std::move(sourceMod));
		// Catalog dirty → applyFeedSourceCatalog with settingsHtml (layout-only push is metadata-only).
		MarkFeedCatalogDirtyOnMain();
	}

	bool PapyrusIsFeedReady(RE::StaticFunctionTag*)
	{
		return CogFeedSources::IsReady();
	}

	std::string PapyrusSourceStorage(RE::StaticFunctionTag*, std::string sourceId)
	{
		CogFeedSources::SourceStorageDir(sourceId);
		return CogFeedSources::SourceStorageRelative(sourceId);
	}
}

bool CogApiFeedSources::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("BeginRegister", "COG_Feed_API", PapyrusBeginRegister);
	vm->RegisterFunction("RegisterSource", "COG_Feed_API", PapyrusRegisterSource);
	vm->RegisterFunction("EndRegister", "COG_Feed_API", PapyrusEndRegister);
	vm->RegisterFunction("IsFeedReady", "COG_Feed_API", PapyrusIsFeedReady);
	vm->RegisterFunction("SourceStorage", "COG_Feed_API", PapyrusSourceStorage);
	vm->SetCallableFromTasklets("COG_Feed_API", "BeginRegister", true);
	vm->SetCallableFromTasklets("COG_Feed_API", "RegisterSource", true);
	vm->SetCallableFromTasklets("COG_Feed_API", "EndRegister", true);
	vm->SetCallableFromTasklets("COG_Feed_API", "IsFeedReady", true);
	vm->SetCallableFromTasklets("COG_Feed_API", "SourceStorage", true);
	return true;
}
