#include "pch.h"
#include "_Core_HudAliases.h"
#include "_Core_Json.h"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <mutex>
#include <sstream>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace
{
	std::mutex g_mutex;
	std::vector<CogHudAliases::Entry> g_entries;
	std::unordered_map<std::string, std::size_t> g_byLower;
	std::unordered_set<std::string> g_userKeysLower;
	bool g_loaded = false;

	std::string TrimCopy(std::string_view raw)
	{
		std::size_t begin = 0;
		while (begin < raw.size() &&
			   (raw[begin] == ' ' || raw[begin] == '\t' || raw[begin] == '\r' || raw[begin] == '\n')) {
			++begin;
		}
		std::size_t end = raw.size();
		while (end > begin &&
			   (raw[end - 1] == ' ' || raw[end - 1] == '\t' || raw[end - 1] == '\r' || raw[end - 1] == '\n')) {
			--end;
		}
		return std::string(raw.substr(begin, end - begin));
	}

	std::string LowerAscii(std::string s)
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

	// Keep in sync with plugin/aliases/_COG.json — DLL restores this file each load.
	constexpr std::string_view kCanonAliasesJson = R"JSON({
  "cog.health": {
    "name": "Health",
    "targets": [
      "HUD Menu|HUDMovieBaseInstance.Health",
      "TrueHUD|TrueHUD.TrueHUD_MainVisibilityWidgets.TrueHUD_PlayerWidget.Health"
    ]
  },
  "cog.stamina": {
    "name": "Stamina",
    "targets": [
      "HUD Menu|HUDMovieBaseInstance.Stamina",
      "TrueHUD|TrueHUD.TrueHUD_MainVisibilityWidgets.TrueHUD_PlayerWidget.Stamina"
    ]
  },
  "cog.magicka": {
    "name": "Magicka",
    "targets": [
      "HUD Menu|HUDMovieBaseInstance.Magica",
      "TrueHUD|TrueHUD.TrueHUD_MainVisibilityWidgets.TrueHUD_PlayerWidget.Magicka"
    ]
  },
  "cog.ammo": {
    "name": "Ammo",
    "targets": ["HUD Menu|HUDMovieBaseInstance.ArrowInfoInstance"]
  },
  "cog.o2": {
    "name": "Oxygen",
    "targets": ["oxygenMeter2"]
  },
  "cog.casting": {
    "name": "Casting Bar",
    "targets": ["CastingBar"]
  },
  "cog.charge": {
    "name": "Weapon Charge",
    "targets": ["HUD Menu|HUDMovieBaseInstance.RightChargeMeterAnim"]
  },
  "cog.leftcharge": {
    "name": "Secondary Weapon Charge",
    "targets": ["HUD Menu|HUDMovieBaseInstance.LeftChargeMeterAnim"]
  },
  "cog.activeEffects": {
    "name": "Active Effects",
    "targets": ["HUD Menu|__cog_skyui_activeeffects__"]
  },
  "cog.compass": {
    "name": "Compass",
    "targets": ["HUD Menu|HUDMovieBaseInstance.CompassShoutMeterHolder"]
  },
  "cog.enemyHealth": {
    "name": "Enemy Health",
    "targets": ["HUD Menu|HUDMovieBaseInstance.EnemyHealth_mc"]
  },
  "cog.stealth": {
    "name": "Stealth",
    "targets": ["HUD Menu|HUDMovieBaseInstance.StealthMeterInstance"]
  },
  "cog.crosshair": {
    "name": "Crosshair",
    "targets": ["HUD Menu|HUDMovieBaseInstance.Crosshair"]
  },
  "cog.activate": {
    "name": "Activate",
    "targets": [
      "HUD Menu|HUDMovieBaseInstance.RolloverNameInstance",
      "HUD Menu|HUDMovieBaseInstance.RolloverInfoInstance",
      "HUD Menu|HUDMovieBaseInstance.ActivateButton_tf",
      "HUD Menu|HUDMovieBaseInstance.GrayBarInstance"
    ]
  },
  "cog.subtitles": {
    "name": "Subtitles",
    "targets": ["HUD Menu|HUDMovieBaseInstance.SubtitleTextHolder"]
  },
  "cog.tutorials": {
    "name": "Tutorials",
    "targets": ["HUD Menu|HUDMovieBaseInstance.TutorialLockInstance"]
  },
  "cog.questUpdates": {
    "name": "Quest Updates",
    "targets": ["HUD Menu|HUDMovieBaseInstance.QuestUpdateBaseInstance"]
  },
  "cog.notifications": {
    "name": "Notifications",
    "targets": ["HUD Menu|HUDMovieBaseInstance.MessagesBlock"]
  },
  "cog.currentLocation": {
    "name": "Current Location",
    "targets": ["HUD Menu|HUDMovieBaseInstance.LocationLockBase"]
  },
  "cog.inventory": {
    "name": "Recent Loot",
    "targets": ["TrueHUD|TrueHUD.TrueHUD_PartialVisibilityWidgets.TrueHUD_RecentLootWidget"]
  }
}
)JSON";

	void RebuildIndexUnlocked()
	{
		g_byLower.clear();
		g_userKeysLower.clear();
		for (std::size_t i = 0; i < g_entries.size(); ++i) {
			const auto fold = LowerAscii(g_entries[i].alias);
			g_byLower[fold] = i;
			if (g_entries[i].fromUser) {
				g_userKeysLower.insert(fold);
			}
		}
	}

	bool ParseEntryObject(
		std::string_view alias,
		const CogJson::Value& obj,
		bool fromUser,
		CogHudAliases::Entry& out,
		std::string& err)
	{
		out = {};
		out.alias = TrimCopy(alias);
		out.fromUser = fromUser;
		if (out.alias.empty() || !obj.IsObject()) {
			err = "invalid alias object";
			return false;
		}
		if (const auto* nameVal = obj.Find("name"); nameVal && nameVal->IsString()) {
			out.name = TrimCopy(nameVal->stringValue);
		}
		const auto* targetsVal = obj.Find("targets");
		if (!targetsVal || !targetsVal->IsArray()) {
			err = "missing targets array";
			return false;
		}
		for (const auto& t : targetsVal->arrayValue) {
			if (!t.IsString()) {
				continue;
			}
			auto target = TrimCopy(t.stringValue);
			if (target.empty()) {
				continue;
			}
			out.targets.push_back(std::move(target));
		}
		if (out.targets.empty()) {
			err = "empty targets";
			return false;
		}
		return true;
	}

	void UpsertCanon(CogHudAliases::Entry entry)
	{
		const auto fold = LowerAscii(entry.alias);
		auto it = g_byLower.find(fold);
		if (it != g_byLower.end()) {
			g_entries[it->second] = std::move(entry);
		} else {
			g_byLower[fold] = g_entries.size();
			g_entries.push_back(std::move(entry));
		}
	}

	void AppendTargetsUnique(CogHudAliases::Entry& dest, const std::vector<std::string>& extra)
	{
		std::unordered_set<std::string> seen;
		for (const auto& t : dest.targets) {
			seen.insert(LowerAscii(t));
		}
		for (const auto& t : extra) {
			const auto fold = LowerAscii(t);
			if (seen.contains(fold)) {
				continue;
			}
			seen.insert(fold);
			dest.targets.push_back(t);
		}
	}

	void MergeUserEntry(CogHudAliases::Entry entry)
	{
		const auto fold = LowerAscii(entry.alias);
		const bool reserved = fold.starts_with("cog.");
		auto it = g_byLower.find(fold);
		if (reserved) {
			if (it == g_byLower.end()) {
				logger::warn(
					"COG: aliases — ignored unknown reserved alias '{}' (cannot invent cog.* keys)",
					entry.alias);
				return;
			}
			// Append targets only; keep canon name / alias casing.
			AppendTargetsUnique(g_entries[it->second], entry.targets);
			return;
		}
		entry.fromUser = true;
		if (it != g_byLower.end()) {
			g_entries[it->second] = std::move(entry);
		} else {
			g_byLower[fold] = g_entries.size();
			g_entries.push_back(std::move(entry));
		}
		g_userKeysLower.insert(fold);
	}

	bool LoadObjectRoot(std::string_view text, bool fromUser, const std::filesystem::path& path)
	{
		CogJson::Value root;
		std::string err;
		if (!CogJson::Parse(std::string{ text }, root, err) || !root.IsObject()) {
			logger::error(
				"COG: failed to parse alias file {}: {}",
				path.string(),
				err.empty() ? "root is not an object" : err);
			return false;
		}
		for (const auto& [alias, val] : root.objectValue) {
			CogHudAliases::Entry entry;
			std::string entryErr;
			if (!ParseEntryObject(alias, val, fromUser, entry, entryErr)) {
				logger::warn(
					"COG: aliases — skipped '{}' in {}: {}",
					alias,
					path.filename().string(),
					entryErr);
				continue;
			}
			if (fromUser) {
				MergeUserEntry(std::move(entry));
			} else {
				UpsertCanon(std::move(entry));
			}
		}
		return true;
	}

	void RestoreCanonFile(const std::filesystem::path& path)
	{
		std::error_code ec;
		std::filesystem::create_directories(path.parent_path(), ec);
		std::ofstream out(path, std::ios::binary | std::ios::trunc);
		if (!out) {
			logger::error("COG: aliases — failed to restore {}", path.string());
			return;
		}
		out.write(kCanonAliasesJson.data(), static_cast<std::streamsize>(kCanonAliasesJson.size()));
	}

	std::vector<std::filesystem::path> ListUserJsonSorted(const std::filesystem::path& dir)
	{
		std::vector<std::filesystem::path> files;
		std::error_code ec;
		if (!std::filesystem::is_directory(dir, ec)) {
			return files;
		}
		for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
			if (ec) {
				break;
			}
			if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
				continue;
			}
			const auto name = LowerAscii(entry.path().filename().string());
			if (name == "_cog.json") {
				continue;
			}
			files.push_back(entry.path());
		}
		std::sort(files.begin(), files.end(), [](const std::filesystem::path& a, const std::filesystem::path& b) {
			return LowerAscii(a.filename().string()) < LowerAscii(b.filename().string());
		});
		return files;
	}

	// Migration Code for Transition from v1.11 or earlier to v1.2
	const char* LegacyToCog(std::string_view lower)
	{
		if (lower == "hud.health" || lower == "health") {
			return "cog.health";
		}
		if (lower == "hud.stamina" || lower == "stamina") {
			return "cog.stamina";
		}
		if (lower == "hud.magicka" || lower == "magicka" || lower == "hud.magica") {
			return "cog.magicka";
		}
		if (lower == "hud.ammo" || lower == "hud.arrows" || lower == "ammo" || lower == "arrowinfo" ||
			lower == "arrowinfoinstance") {
			return "cog.ammo";
		}
		if (lower == "hud.oxygen" || lower == "oxygen" || lower == "oxygenmeter2") {
			return "cog.o2";
		}
		if (lower == "hud.casting" || lower == "casting" || lower == "castingbar") {
			return "cog.casting";
		}
		if (lower == "hud.charge" || lower == "hud.weaponcharge" || lower == "hud.rightcharge" ||
			lower == "rightchargemeteranim") {
			return "cog.charge";
		}
		if (lower == "hud.leftcharge" || lower == "hud.secondaryweaponcharge" ||
			lower == "leftchargemeteranim") {
			return "cog.leftcharge";
		}
		if (lower == "hud.activeeffects" || lower == "hud.activeeffect" || lower == "activeeffects") {
			return "cog.activeEffects";
		}
		if (lower == "hud.compass" || lower == "compass" || lower == "compassshoutmeterholder") {
			return "cog.compass";
		}
		if (lower == "hud.enemyhealth" || lower == "enemyhealth" || lower == "enemyhealth_mc") {
			return "cog.enemyHealth";
		}
		if (lower == "hud.stealth" || lower == "stealth" || lower == "stealthmeter" ||
			lower == "stealthmeterinstance") {
			return "cog.stealth";
		}
		if (lower == "hud.crosshair" || lower == "crosshair") {
			return "cog.crosshair";
		}
		if (lower == "hud.activate" || lower == "activate" || lower == "hud.rollover" || lower == "rollover") {
			return "cog.activate";
		}
		if (lower == "hud.subtitles" || lower == "subtitles" || lower == "subtitletextholder") {
			return "cog.subtitles";
		}
		if (lower == "hud.tutorials" || lower == "tutorials" || lower == "tutoriallockinstance") {
			return "cog.tutorials";
		}
		if (lower == "hud.questupdates" || lower == "questupdates" || lower == "questupdatebaseinstance") {
			return "cog.questUpdates";
		}
		if (lower == "hud.notifications" || lower == "notifications" || lower == "messagesblock") {
			return "cog.notifications";
		}
		if (lower == "hud.currentlocation" || lower == "currentlocation" || lower == "locationlockbase") {
			return "cog.currentLocation";
		}
		if (lower == "hud.inventory" || lower == "inventory" || lower == "truehud.recentloot" ||
			lower == "recentloot" || lower == "truehud_recentlootwidget") {
			return "cog.inventory";
		}
		return nullptr;
	}

}

void CogHudAliases::Load(const std::filesystem::path& dataRoot)
{
	std::lock_guard lock(g_mutex);
	g_entries.clear();
	g_byLower.clear();
	g_userKeysLower.clear();
	g_loaded = false;

	const auto dir = dataRoot / "aliases";
	const auto canonPath = dir / "_COG.json";
	RestoreCanonFile(canonPath);

	if (!LoadObjectRoot(kCanonAliasesJson, false, canonPath)) {
		logger::error("COG: aliases — embedded canon failed to parse");
		return;
	}
	RebuildIndexUnlocked();

	for (const auto& file : ListUserJsonSorted(dir)) {
		std::ifstream in(file, std::ios::binary);
		if (!in) {
			continue;
		}
		std::ostringstream ss;
		ss << in.rdbuf();
		LoadObjectRoot(ss.str(), true, file);
	}
	RebuildIndexUnlocked();
	g_loaded = true;
	logger::info(
		"COG: aliases — loaded {} entries ({} user keys) from {}",
		g_entries.size(),
		g_userKeysLower.size(),
		dir.string());
}

bool CogHudAliases::Loaded()
{
	std::lock_guard lock(g_mutex);
	return g_loaded;
}

const CogHudAliases::Entry* CogHudAliases::Find(std::string_view token)
{
	const auto fold = LowerAscii(TrimCopy(token));
	if (fold.empty()) {
		return nullptr;
	}
	std::lock_guard lock(g_mutex);
	auto it = g_byLower.find(fold);
	if (it == g_byLower.end()) {
		return nullptr;
	}
	return &g_entries[it->second];
}

bool CogHudAliases::IsUserAliasKey(std::string_view token)
{
	const auto fold = LowerAscii(TrimCopy(token));
	if (fold.empty()) {
		return false;
	}
	std::lock_guard lock(g_mutex);
	return g_userKeysLower.contains(fold);
}

std::string CogHudAliases::MigrateToken(std::string_view token)
{
	auto raw = TrimCopy(token);
	if (raw.empty()) {
		return raw;
	}
	const auto fold = LowerAscii(raw);
	{
		std::lock_guard lock(g_mutex);
		if (g_userKeysLower.contains(fold)) {
			return raw;
		}
	}
	if (const char* cog = LegacyToCog(fold)) {
		return cog;
	}
	return raw;
}

bool CogHudAliases::MigrateTokenList(std::vector<std::string>& tokens)
{
	bool changed = false;
	for (auto& t : tokens) {
		auto next = MigrateToken(t);
		if (next != t) {
			t = std::move(next);
			changed = true;
		}
	}
	return changed;
}

std::vector<std::string> CogHudAliases::ExpandAlias(std::string_view token)
{
	if (const auto* e = Find(token)) {
		return e->targets;
	}
	return {};
}

std::string CogHudAliases::AliasForTarget(std::string_view scaleformKey)
{
	const auto key = TrimCopy(scaleformKey);
	if (key.empty()) {
		return {};
	}
	const auto keyFold = LowerAscii(key);
	std::lock_guard lock(g_mutex);
	std::string fallback;
	for (const auto& e : g_entries) {
		for (const auto& t : e.targets) {
			if (LowerAscii(t) != keyFold) {
				continue;
			}
			if (LowerAscii(e.alias).starts_with("cog.")) {
				return e.alias;
			}
			if (fallback.empty()) {
				fallback = e.alias;
			}
		}
	}
	return fallback;
}

std::string CogHudAliases::NameForAlias(std::string_view aliasOrKey)
{
	if (const auto* e = Find(aliasOrKey)) {
		return e->name.empty() ? e->alias : e->name;
	}
	const auto alias = AliasForTarget(aliasOrKey);
	if (!alias.empty()) {
		if (const auto* e = Find(alias)) {
			return e->name.empty() ? e->alias : e->name;
		}
	}
	return {};
}

std::string CogHudAliases::KnownAliasesJson()
{
	std::lock_guard lock(g_mutex);
	std::string out = "[";
	bool first = true;
	for (const auto& e : g_entries) {
		if (!first) {
			out += ',';
		}
		first = false;
		out += "{\"value\":\"";
		out += EscapeJson(e.alias);
		out += "\",\"name\":\"";
		out += EscapeJson(e.name);
		out += "\",\"key\":\"";
		out += EscapeJson(e.targets.empty() ? std::string{} : e.targets.front());
		out += "\",\"targets\":[";
		for (std::size_t i = 0; i < e.targets.size(); ++i) {
			if (i) {
				out += ',';
			}
			out += '"';
			out += EscapeJson(e.targets[i]);
			out += '"';
		}
		out += "]}";
	}
	out += ']';
	return out;
}

std::vector<CogHudAliases::Entry> CogHudAliases::AllEntries()
{
	std::lock_guard lock(g_mutex);
	return g_entries;
}
