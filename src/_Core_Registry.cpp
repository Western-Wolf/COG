// CogRegistry shell: Get + BeginRegister / EndRegister (session containers).
// Task peels: _Core_Registry_Create / _Remove / _Update.cpp (same class).
#include "pch.h"
#include "_Core_Registry.h"
#include "_Core_Registry_Json.h"
#include "_Core_Icon.h"
#include "_UI_CogUi.h"
#include "_Core_HudSuppress.h"
#include "_UI_KeyNames.h"
#include "_Gears_LiveStats.h"
#include "_Gears_Inventory.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Storage.h"
#include "_API_Core.h"

#include "_Core_Json.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iterator>
#include <sstream>
#include <unordered_map>
#include <unordered_set>


namespace
{
	std::string Lower(std::string s)
	{
		return CogRegistryJson::Lower(std::move(s));
	}

	// Case-insensitive — older gear JSON used "stamina"/"magicka" while Register uses "Stamina"/"Magicka".
	std::string KeyOf(const std::string& mod, const std::string& name)
	{
		return Lower(mod) + "\x1F" + Lower(name);
	}

	void AssignIfProvided(std::string& dest, std::string value)
	{
		if (!value.empty()) {
			dest = std::move(value);
		}
	}

	std::string TrimCopy(std::string raw)
	{
		return CogRegistryJson::TrimCopy(std::move(raw));
	}

	std::string EscapeJson(const std::string& s)
	{
		return CogRegistryJson::EscapeJson(s);
	}

	std::string FileStem(const std::string& id)
	{
		return CogRegistryJson::FileStem(id);
	}

	std::string NormalizeIcon(std::string raw)
	{
		return CogRegistryJson::NormalizeIcon(std::move(raw));
	}

	std::string NormalizeHideAt(std::string raw, std::string_view varType = {})
	{
		return CogRegistryJson::NormalizeHideAt(std::move(raw), varType);
	}

	std::string OptionalHexColor(std::string raw)
	{
		return CogRegistryJson::OptionalHexColor(std::move(raw));
	}

	std::string NormalizeEditorKey(std::string raw)
	{
		return CogRegistryJson::NormalizeEditorKey(std::move(raw));
	}

	std::string NormalizeGizmoType(std::string raw)
	{
		return CogRegistryJson::NormalizeGizmoType(std::move(raw));
	}

	std::string NormalizeGizmoVisibility(std::string raw)
	{
		return CogRegistryJson::NormalizeGizmoVisibility(std::move(raw));
	}

	std::string BuiltinDefaultVisibilityForType(std::string_view typeId)
	{
		return CogRegistryJson::BuiltinDefaultVisibilityForType(typeId);
	}

	bool GizmoIsPlayActive(const CogGizmo& g)
	{
		return CogRegistryJson::GizmoIsPlayActive(g);
	}

	bool GizmoSettingsBool(const CogGizmo& g, std::string_view key, bool fallback)
	{
		return CogRegistryJson::GizmoSettingsBool(g, key, fallback);
	}

	std::string SanitizeGizmoTypeId(std::string raw)
	{
		return CogRegistryJson::SanitizeGizmoTypeId(std::move(raw));
	}

	bool IsBuiltinGizmoTypeId(std::string_view typeId)
	{
		return CogRegistryJson::IsBuiltinGizmoTypeId(typeId);
	}

	std::string SanitizeViewScriptPath(std::string path)
	{
		return CogRegistryJson::SanitizeViewScriptPath(std::move(path));
	}

	bool LooksLikeJsonObjectOrArray(std::string_view s)
	{
		return CogRegistryJson::LooksLikeJsonObjectOrArray(s);
	}

	bool AppearanceEmpty(const CogGearAppearance& a)
	{
		return CogRegistryJson::AppearanceEmpty(a);
	}

	CogGroup DefaultGroup()
	{
		return CogRegistryJson::DefaultGroup();
	}

	CogGroup* FindGroup(std::vector<CogGroup>& groups, const std::string& id)
	{
		for (auto& group : groups) {
			if (group.id == id) {
				return &group;
			}
		}
		return nullptr;
	}

	std::string FindGroupIdForGear(const std::vector<CogGroup>& groups, const std::string& gearId)
	{
		for (const auto& group : groups) {
			for (const auto& listed : group.settings.gearIds) {
				if (listed == gearId) {
					return group.id;
				}
			}
		}
		return {};
	}

	void RemoveGearIdFromAllGroups(std::vector<CogGroup>& groups, const std::string& gearId)
	{
		for (auto& group : groups) {
			auto& ids = group.settings.gearIds;
			ids.erase(std::remove(ids.begin(), ids.end(), gearId), ids.end());
			group.settings.exemptFromGroupColors.erase(gearId);
		}
	}

	bool AppendGearToGroup(std::vector<CogGroup>& groups, const std::string& groupId, const std::string& gearId)
	{
		if (gearId.empty() || groupId.empty()) {
			return false;
		}
		RemoveGearIdFromAllGroups(groups, gearId);
		auto* group = FindGroup(groups, groupId);
		if (!group) {
			return false;
		}
		group->settings.gearIds.push_back(gearId);
		return true;
	}
}


CogRegistry& CogRegistry::Get()
{
	static CogRegistry instance;
	return instance;
}



void CogRegistry::BeginRegister(std::string mod, std::string pluginFile, std::string sniffedPlugin)
{
	if (mod.empty()) {
		logger::warn("COG_API.BeginRegister rejected: empty sourceMod");
		return;
	}
	std::lock_guard lock(_mutex);
	_modBatchOpen.insert(mod);
	// Mark present even without EndRegister — bridges that register one gear at a
	// time must not take absent-sender strikes and drop gears after two loads.
	_presentThisSession.insert(mod);
	pluginFile = TrimCopy(std::move(pluginFile));
	sniffedPlugin = TrimCopy(std::move(sniffedPlugin));
	if (!pluginFile.empty()) {
		BindSenderPluginUnlocked(mod, std::move(pluginFile));
	} else {
		BindSniffedSenderPluginUnlocked(mod, std::move(sniffedPlugin));
	}
	auto& sender = _senders[mod];
	sender.strikes = 0;
}



void CogRegistry::EndRegister(std::string mod)
{
	if (mod.empty()) {
		logger::warn("COG_API.EndRegister rejected: empty sourceMod");
		return;
	}
	bool layoutDirty = false;
	{
		std::lock_guard lock(_mutex);
		_modBatchOpen.erase(mod);
		_presentThisSession.insert(mod);
		auto& sender = _senders[mod];
		sender.strikes = 0;
		// Only prune this mod's missing varNames / typeIds. Global missing-plugin cleanup
		// belongs to MaybeReconcileSenders (settle grace) — calling it here wiped
		// ESL-flagged senders when LookupLoaded* briefly failed right after Register.
		bool dirty = PruneModGearsUnlocked(mod);
		dirty = PruneModGizmoTypesUnlocked(mod) || dirty;
		const bool filled = ApplyGizmoTypeDefaultsUnlocked();
		SaveGizmoTypesUnlocked();
		if (dirty || filled) {
			SaveConfigUnlocked();
			layoutDirty = dirty || filled;
		} else {
			SaveSendersUnlocked();
		}

		std::size_t gearCount = 0;
		std::size_t liveCount = 0;
		std::size_t typeCount = 0;
		for (const auto& gear : _gears) {
			if (gear.sourceMod == mod) {
				++gearCount;
			}
		}
		for (const auto& [receipt, src] : _sources) {
			(void)receipt;
			if (src.sourceMod == mod) {
				++liveCount;
			}
		}
		for (const auto& t : _gizmoTypes) {
			if (t.sourceMod == mod) {
				++typeCount;
			}
		}
		logger::info(
			"COG: EndRegister '{}' — {} gear(s), {} live source(s), {} gizmo type(s), plugin='{}'",
			mod,
			gearCount,
			liveCount,
			typeCount,
			sender.plugin);
	}
	if (layoutDirty) {
		MarkLayoutDirty();
	}
}


