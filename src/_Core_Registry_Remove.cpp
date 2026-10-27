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



void CogRegistry::Unregister(std::int32_t receipt)
{
	std::lock_guard lock(_mutex);
	if (auto it = _sources.find(receipt); it != _sources.end()) {
		const auto mod = it->second.sourceMod;
		const auto name = it->second.varName;
		_index.erase(KeyOf(mod, name));
		std::erase(_order, receipt);
		_sources.erase(it);
		if (DropGearUnlocked(mod, name)) {
			SaveConfigUnlocked();
		}
		return;
	}
	auto typeIt = _gizmoTypeReceipts.find(receipt);
	if (typeIt == _gizmoTypeReceipts.end()) {
		logger::warn("COG_API.Unregister rejected: unknown receipt {}", receipt);
		return;
	}
	const auto typeId = typeIt->second;
	_gizmoTypeReceipts.erase(typeIt);
	_gizmoTypeReceiptIndex.erase(typeId);
	std::unordered_set<std::string> removedRaw;
	_gizmoTypes.erase(
		std::remove_if(
			_gizmoTypes.begin(),
			_gizmoTypes.end(),
			[&](const CogGizmoType& t) {
				if (t.typeId != typeId) {
					return false;
				}
				logger::info("Discarded gizmo type '{}' — Unregister({})", t.typeId, receipt);
				removedRaw.insert(t.typeId);
				return true;
			}),
		_gizmoTypes.end());
	std::unordered_set<std::string> cullTypes;
	for (const auto& raw : removedRaw) {
		const auto normalized = NormalizeGizmoType(raw);
		const bool stillHave = std::any_of(
			_gizmoTypes.begin(),
			_gizmoTypes.end(),
			[&](const CogGizmoType& t) { return NormalizeGizmoType(t.typeId) == normalized; });
		if (!stillHave) {
			cullTypes.insert(normalized);
		}
	}
	const bool culled = CullGizmosOfTypesUnlocked(cullTypes);
	SaveGizmoTypesUnlocked();
	if (culled) {
		SaveConfigUnlocked();
	}
}



bool CogRegistry::DropAllModGearsUnlocked(const std::string& mod)
{
	bool dropped = false;
	for (auto it = _gears.begin(); it != _gears.end();) {
		if (it->sourceMod != mod) {
			++it;
			continue;
		}
		if (it->locked) {
			++it;
			continue;
		}
		logger::info("Discarded gear '{}' — sender '{}' is absent", it->id, mod);
		_seenSources.erase(KeyOf(it->sourceMod, it->varName));
		RemoveGearIdFromAllGroups(_groups, it->id);
		CullGaugesBoundToSourceUnlocked(it->sourceMod, it->varName);
		it = _gears.erase(it);
		dropped = true;
	}
	return dropped;
}



bool CogRegistry::PruneMissingPluginsUnlocked()
{
	bool dirty = false;
	for (auto it = _senders.begin(); it != _senders.end();) {
		if (it->second.plugin.empty()) {
			++it;
			continue;
		}
		// A mod that registered this session is alive even if plugin lookup flickers.
		if (_presentThisSession.contains(it->first)) {
			++it;
			continue;
		}
		if (CogCaller::IsPluginLoaded(it->second.plugin)) {
			++it;
			continue;
		}
		logger::info("Pruning sender '{}' — plugin '{}' is not loaded", it->first, it->second.plugin);
		dirty = DropAllModGearsUnlocked(it->first) || dirty;
		dirty = DropAllModGizmoTypesUnlocked(it->first) || dirty;
		it = _senders.erase(it);
		dirty = true;
	}
	return dirty;
}



bool CogRegistry::ReconcileAbsentSendersUnlocked()
{
	bool dirty = PruneMissingPluginsUnlocked();
	std::vector<std::string> remove;
	for (auto& [mod, sender] : _senders) {
		if (!sender.plugin.empty()) {
			continue;
		}
		if (_presentThisSession.contains(mod)) {
			sender.strikes = 0;
			continue;
		}
		sender.strikes += 1;
		logger::info("Sender '{}' absent this session (strike {}/2)", mod, sender.strikes);
		if (sender.strikes >= 2) {
			dirty = DropAllModGearsUnlocked(mod) || dirty;
			dirty = DropAllModGizmoTypesUnlocked(mod) || dirty;
			remove.push_back(mod);
			dirty = true;
		}
	}
	for (const auto& mod : remove) {
		_senders.erase(mod);
	}
	return dirty;
}



void CogRegistry::ReconcileGroupMembership()
{
	EnsureDefaultGroup();
	std::unordered_set<std::string> knownGears;
	for (const auto& gear : _gears) {
		knownGears.insert(gear.id);
	}

	std::unordered_set<std::string> placed;
	for (auto& group : _groups) {
		std::vector<std::string> kept;
		for (const auto& gearId : group.settings.gearIds) {
			if (!knownGears.contains(gearId) || placed.contains(gearId)) {
				continue;
			}
			kept.push_back(gearId);
			placed.insert(gearId);
		}
		group.settings.gearIds = std::move(kept);
		std::unordered_set<std::string> memberIds(group.settings.gearIds.begin(), group.settings.gearIds.end());
		for (auto it = group.settings.exemptFromGroupColors.begin();
			 it != group.settings.exemptFromGroupColors.end();) {
			if (!memberIds.contains(it->first) || !it->second) {
				it = group.settings.exemptFromGroupColors.erase(it);
			} else {
				++it;
			}
		}
	}
	CogInventory::EnsureBuiltinsUnlocked(*this);
}



bool CogRegistry::DropGearUnlocked(const std::string& mod, const std::string& name)
{
	bool dropped = false;
	for (auto it = _gears.begin(); it != _gears.end();) {
		if (it->sourceMod != mod || it->varName != name) {
			++it;
			continue;
		}
		if (it->locked) {
			++it;
			continue;
		}
		const auto gearId = it->id;
		logger::info("Discarded gear '{}' — {} / {} was unregistered", gearId, mod, name);
		_seenSources.erase(KeyOf(mod, name));
		RemoveGearIdFromAllGroups(_groups, gearId);
		CullGaugesBoundToSourceUnlocked(mod, name);
		it = _gears.erase(it);
		dropped = true;
	}
	return dropped;
}



bool CogRegistry::PruneModGearsUnlocked(const std::string& mod)
{
	bool dropped = false;
	for (auto it = _gears.begin(); it != _gears.end();) {
		if (it->sourceMod != mod) {
			++it;
			continue;
		}
		if (_index.contains(KeyOf(it->sourceMod, it->varName))) {
			++it;
			continue;
		}
		logger::info("Discarded gear '{}' — {} / {} missing after EndRegister", it->id, it->sourceMod, it->varName);
		_seenSources.erase(KeyOf(it->sourceMod, it->varName));
		RemoveGearIdFromAllGroups(_groups, it->id);
		CullGaugesBoundToSourceUnlocked(it->sourceMod, it->varName);
		it = _gears.erase(it);
		dropped = true;
	}
	return dropped;
}



bool CogRegistry::CullGaugesBoundToSourceUnlocked(const std::string& mod, const std::string& name)
{
	if (mod.empty() && name.empty()) {
		return false;
	}
	const auto key = KeyOf(mod, name);
	bool dropped = false;
	for (auto it = _gauges.begin(); it != _gauges.end();) {
		if (it->sourceMod.empty() && it->varName.empty()) {
			++it;
			continue;
		}
		if (KeyOf(it->sourceMod, it->varName) != key) {
			++it;
			continue;
		}
		logger::info("Discarded gauge '{}' — gear {} / {} is gone", it->id, mod, name);
		it = _gauges.erase(it);
		dropped = true;
	}
	return dropped;
}



bool CogRegistry::ReconcileGaugeBindingsUnlocked()
{
	std::unordered_set<std::string> known;
	for (const auto& gear : _gears) {
		known.insert(KeyOf(gear.sourceMod, gear.varName));
	}
	bool dropped = false;
	for (auto it = _gauges.begin(); it != _gauges.end();) {
		if (it->sourceMod.empty() && it->varName.empty()) {
			++it;
			continue;
		}
		if (known.contains(KeyOf(it->sourceMod, it->varName))) {
			++it;
			continue;
		}
		logger::info(
			"Discarded gauge '{}' — gear {} / {} is gone",
			it->id,
			it->sourceMod,
			it->varName);
		it = _gauges.erase(it);
		dropped = true;
	}
	return dropped;
}



bool CogRegistry::PruneModGizmoTypesUnlocked(const std::string& mod)
{
	std::unordered_set<std::string> removedRaw;
	bool dropped = false;
	for (auto it = _gizmoTypes.begin(); it != _gizmoTypes.end();) {
		if (it->sourceMod != mod) {
			++it;
			continue;
		}
		if (CogRegistryJson::IsBuiltinGizmoTypeId(it->typeId)) {
			++it;
			continue;
		}
		if (_gizmoTypeReceiptIndex.contains(it->typeId)) {
			++it;
			continue;
		}
		logger::info(
			"Discarded gizmo type '{}' — {} missing after EndRegister",
			it->typeId,
			it->sourceMod);
		removedRaw.insert(it->typeId);
		it = _gizmoTypes.erase(it);
		dropped = true;
	}
	// Only cull instances when no remaining type maps to the same normalized id
	// (legacy clock → cog-clock must not wipe live cog-clock gizmos).
	std::unordered_set<std::string> cullTypes;
	for (const auto& raw : removedRaw) {
		const auto normalized = NormalizeGizmoType(raw);
		const bool stillHave = std::any_of(
			_gizmoTypes.begin(),
			_gizmoTypes.end(),
			[&](const CogGizmoType& t) { return NormalizeGizmoType(t.typeId) == normalized; });
		if (!stillHave) {
			cullTypes.insert(normalized);
		}
	}
	dropped = CullGizmosOfTypesUnlocked(cullTypes) || dropped;
	return dropped;
}



bool CogRegistry::DropAllModGizmoTypesUnlocked(const std::string& mod)
{
	std::unordered_set<std::string> removedRaw;
	bool dropped = false;
	for (auto it = _gizmoTypes.begin(); it != _gizmoTypes.end();) {
		if (it->sourceMod != mod) {
			++it;
			continue;
		}
		if (CogRegistryJson::IsBuiltinGizmoTypeId(it->typeId)) {
			++it;
			continue;
		}
		logger::info("Discarded gizmo type '{}' — sender '{}' is absent", it->typeId, mod);
		removedRaw.insert(it->typeId);
		if (auto rit = _gizmoTypeReceiptIndex.find(it->typeId); rit != _gizmoTypeReceiptIndex.end()) {
			_gizmoTypeReceipts.erase(rit->second);
			_gizmoTypeReceiptIndex.erase(rit);
		}
		it = _gizmoTypes.erase(it);
		dropped = true;
	}
	// Instances tagged with this sourceMod (even if types never re-registered this session).
	dropped = CullGizmosOfSourceModUnlocked(mod) || dropped;
	std::unordered_set<std::string> cullTypes;
	for (const auto& raw : removedRaw) {
		const auto normalized = NormalizeGizmoType(raw);
		const bool stillHave = std::any_of(
			_gizmoTypes.begin(),
			_gizmoTypes.end(),
			[&](const CogGizmoType& t) { return NormalizeGizmoType(t.typeId) == normalized; });
		if (!stillHave) {
			cullTypes.insert(normalized);
		}
	}
	// Plus any instances of types we just dropped (covers empty sourceMod on older JSON).
	dropped = CullGizmosOfTypesUnlocked(cullTypes) || dropped;
	return dropped;
}



bool CogRegistry::CullGizmosOfSourceModUnlocked(const std::string& mod)
{
	if (mod.empty()) {
		return false;
	}
	const auto modKey = Lower(mod);
	bool dropped = false;
	for (auto it = _gizmos.begin(); it != _gizmos.end();) {
		if (Lower(it->sourceMod) != modKey) {
			++it;
					continue;
				}
		if (CogRegistryJson::IsBuiltinGizmoTypeId(it->typeId)) {
			++it;
					continue;
				}
		logger::info("Discarded gizmo '{}' — sender '{}' is absent", it->id, mod);
		it = _gizmos.erase(it);
		dropped = true;
	}
	return dropped;
}



bool CogRegistry::CullGizmosOfTypesUnlocked(const std::unordered_set<std::string>& typeIds)
{
	if (typeIds.empty()) {
		return false;
	}
	bool dropped = false;
	for (auto it = _gizmos.begin(); it != _gizmos.end();) {
		const auto type = NormalizeGizmoType(it->typeId);
		if (!typeIds.contains(type)) {
			++it;
					continue;
				}
		logger::info("Discarded gizmo '{}' — type '{}' no longer registered", it->id, it->typeId);
		it = _gizmos.erase(it);
		dropped = true;
	}
	return dropped;
}


