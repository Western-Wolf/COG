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

	// Rising-edge detector for Transformation timer peak latch. Cleared on load close so
	// beast→beast reloads re-latch maximum to the save's remaining time.
	bool g_wasWerewolfForm = false;

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

	/** Shared play-Feed walk. key2 empty → only key1. Call under CogRegistry::_mutex. */
	bool AnyPlayFeedMatching(
		const std::vector<CogGizmo>& gizmos,
		std::string_view key1,
		bool def1,
		std::string_view key2 = {},
		bool def2 = false)
	{
		for (const auto& g : gizmos) {
			if (!GizmoIsPlayActive(g) || NormalizeGizmoType(g.typeId) != "cog-feed") {
				continue;
			}
			if (!GizmoSettingsBool(g, key1, def1)) {
				continue;
			}
			if (!key2.empty() && !GizmoSettingsBool(g, key2, def2)) {
				continue;
			}
			return true;
		}
		return false;
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



CogVarType CogRegistry::ParseType(const std::string& type)
{
	const auto t = Lower(type);
	if (t == "percent" || t == "percentage") {
		return CogVarType::Percent;
	}
	if (t == "count" || t == "counter") {
		return CogVarType::Count;
	}
	if (t == "timer" || t == "timer update" || t == "countdown") {
		return CogVarType::Timer;
	}
	return CogVarType::Percent;
}

const char* CogRegistry::TypeKey(CogVarType type)
{
	switch (type) {
	case CogVarType::Count:
		return "count";
	case CogVarType::Timer:
		return "timer";
	case CogVarType::Percent:
	default:
		return "percent";
	}
}



CogSource* CogRegistry::FindByReceipt(std::int32_t receipt)
{
	auto it = _sources.find(receipt);
	return it == _sources.end() ? nullptr : &it->second;
}



void CogRegistry::UpdatePercent(std::int32_t receipt, float current, float maximum)
{
	std::string mod;
	std::string name;
	float cur = current;
	float maxv = maximum;
{
	std::lock_guard lock(_mutex);
	if (auto* src = FindByReceipt(receipt); src && src->type == CogVarType::Percent) {
		src->current = static_cast<double>(current);
		src->maximum = (std::max)(0.0, static_cast<double>(maximum));
		if (src->maximum > 0.0) {
			src->value = src->current / src->maximum * 100.0;
		} else {
			src->value = 0.0;
		}
			mod = src->sourceMod;
			name = src->varName;
			cur = static_cast<float>(src->current);
			maxv = static_cast<float>(src->maximum);
		}
	}
	if (!mod.empty()) {
		PushLivePercent(mod.c_str(), name.c_str(), cur, maxv);
	}
}



void CogRegistry::UpdatePercentByKey(std::string mod, std::string name, float current, float maximum)
{
	std::int32_t receipt = 0;
	{
		std::lock_guard lock(_mutex);
		const auto it = _index.find(KeyOf(mod, name));
		if (it == _index.end()) {
			return;
		}
		receipt = it->second;
	}
	UpdatePercent(receipt, current, maximum);
}



void CogRegistry::UpdateCount(std::int32_t receipt, std::int32_t value)
{
	std::lock_guard lock(_mutex);
	if (auto* src = FindByReceipt(receipt); src && src->type == CogVarType::Count) {
		src->value = static_cast<double>(value);
	}
}



void CogRegistry::UpdateTimer(std::int32_t receipt, float remainingSeconds)
{
	std::lock_guard lock(_mutex);
	if (auto* src = FindByReceipt(receipt); src && src->type == CogVarType::Timer) {
		const auto remaining = (std::max)(0.0, static_cast<double>(remainingSeconds));
		src->current = remaining;
		if (remaining <= 0.0) {
			// Drop the peak so the next charge (e.g. a shorter shout) can fill to 100%.
			src->maximum = 0.0;
			src->value = 0.0;
			return;
		}
		if (remaining > src->maximum) {
			src->maximum = remaining;
		}
		if (src->maximum > 0.0) {
			src->value = src->current / src->maximum * 100.0;
		} else {
			src->value = 100.0;
		}
	}
}



void CogRegistry::UpdateGizmoPayload(std::int32_t receipt, std::string payloadJson)
{
	if (receipt == 0) {
		logger::warn("UpdateGizmo rejected: receipt 0");
		return;
	}
	const std::string stored = payloadJson.empty() ? "null" : std::move(payloadJson);
	{
		std::lock_guard lock(_mutex);
		auto typeIt = _gizmoTypeReceipts.find(receipt);
		if (typeIt == _gizmoTypeReceipts.end()) {
			logger::warn("UpdateGizmo rejected: unknown or non-gizmo receipt {}", receipt);
			return;
		}
		const auto normalized = NormalizeGizmoType(typeIt->second);
		CogGizmoType* typeSlot = nullptr;
		for (auto& t : _gizmoTypes) {
			if (NormalizeGizmoType(t.typeId) == normalized) {
				typeSlot = &t;
				break;
			}
		}
		if (!typeSlot) {
			logger::warn("UpdateGizmo rejected: type missing for receipt {}", receipt);
			return;
		}
		typeSlot->livePayloadJson = stored;
		for (auto& g : _gizmos) {
			if (NormalizeGizmoType(g.typeId) == normalized) {
				g.livePayloadJson = stored;
			}
		}
	}
	PushToUi();
}



bool CogRegistry::IsLoading() const
{
	std::lock_guard lock(_mutex);
	return _loadingMenuOpen;
}



void CogRegistry::OnLoadingMenuOpened()
{
	std::lock_guard lock(_mutex);
	// PreLoadGame and LoadingMenu open may both arm the gate — only log the first.
	if (_loadingMenuOpen) {
		return;
	}
	_loadingMenuOpen = true;
	logger::info("COG: loading — pausing live UI / Interop");
}



void CogRegistry::OnLoadingMenuClosed()
{
{
	std::lock_guard lock(_mutex);
		// LoadingMenu close and kPostLoadGame both call this. One resume per open:
		// a second close must not clear _presentThisSession again (would strand mods that
		// already re-registered on the first COG_Ready after the 15s absent-sender grace).
		if (!_loadingMenuOpen) {
			logger::info("COG: loading — close ignored (already resumed this load)");
			return;
		}
		// Each load is a new Papyrus registration session (iWant clears bridge slots and
		// consumers re-loadIcon). Re-arm grace and clear presence so absent-sender rules
		// apply per load — not once per SKSE process.
		_loadingMenuOpen = false;
		_loadingClosedAt = std::chrono::steady_clock::now();
		_senderReconcileDone = false;
		_presentThisSession.clear();
		_modBatchOpen.clear();
		_batchCommitPending = false;
		_gizmoTypeReceipts.clear();
		_gizmoTypeReceiptIndex.clear();
		// Force a full snapshot on the first tick after load (not a lean live patch).
		_layoutDirty = true;
	}
	// Re-register COG.Builtin after the session clear (native catalog + omit-prune).
	EnsureBuiltinSources();
	CogInventory::RegisterFromSaved();
	CogUi::SendReadyEvent();
	logger::info("COG: loading — finished; live UI resumes");
	// Paint immediately. Next JS tick will keep live patches flowing.
	CogUi::SyncVisibility();
	PushToUi();
}



void CogRegistry::MaybeReconcileSenders()
{
	bool dirty = false;
	bool justReconciled = false;
	{
		std::lock_guard lock(_mutex);
		// Skip plugin prune while loading and for a short settle after close — mid-reload
		// LookupLoadedMod* can briefly fail and would DropAllModGears for bridge mods.
		constexpr auto kSettle = std::chrono::seconds(2);
		const bool settling = _loadingMenuOpen ||
			(_loadingClosedAt &&
			 std::chrono::steady_clock::now() - *_loadingClosedAt < kSettle);
		if (!settling) {
		dirty = PruneMissingPluginsUnlocked();
		}
		if (!_senderReconcileDone && _loadingClosedAt) {
			constexpr auto kGrace = std::chrono::seconds(15);
			if (std::chrono::steady_clock::now() - *_loadingClosedAt >= kGrace) {
				dirty = ReconcileAbsentSendersUnlocked() || dirty;
				_senderReconcileDone = true;
				justReconciled = true;
			}
		}
		if (dirty) {
			CogInventory::EnsureBuiltinsUnlocked(*this);
			SaveConfigUnlocked();
		} else if (justReconciled) {
			SaveSendersUnlocked();
		}
	}
	if (dirty) {
		MarkLayoutDirty();
		PushToUi();
	}
}



std::string CogRegistry::EditorKey() const
{
	std::lock_guard lock(_mutex);
	return _general.editorKey.empty() ? CogKeys::kDefaultEditorKey : _general.editorKey;
}



void CogRegistry::SetEditorKey(std::string name)
{
	{
		std::lock_guard lock(_mutex);
		_general.editorKey = NormalizeEditorKey(std::move(name));
		SaveConfigUnlocked();
		_layoutDirty = true;
	}
	CogUi::SyncEditorKey();
}



std::string CogRegistry::HideToggleKey() const
{
	std::lock_guard lock(_mutex);
	return _general.hideToggleKey;
}



void CogRegistry::SetHideToggleKey(std::string name)
{
	{
		std::lock_guard lock(_mutex);
		auto normalized = CogKeys::NormalizeKeyName(name);
		_general.hideToggleKey = std::move(normalized);
		SaveConfigUnlocked();
		_layoutDirty = true;
	}
	CogUi::SyncHideToggleKey();
}



bool CogRegistry::HideIncludesFlash() const
{
	std::lock_guard lock(_mutex);
	return _general.hideIncludesFlash;
}



void CogRegistry::SetHideIncludesFlash(bool on)
{
	bool uiHidden = false;
	{
		std::lock_guard lock(_mutex);
		if (_general.hideIncludesFlash == on) {
			return;
		}
		_general.hideIncludesFlash = on;
		SaveConfigUnlocked();
		_layoutDirty = true;
		uiHidden = _uiHidden;
	}
	if (uiHidden) {
		CogUi::ApplyFlashUiHidden(on);
	}
	PushToUi();
}



bool CogRegistry::IsUiHidden() const
{
	std::lock_guard lock(_mutex);
	return _uiHidden;
}



void CogRegistry::SetUiHidden(bool hidden)
{
	{
		std::lock_guard lock(_mutex);
		if (_uiHidden == hidden) {
			return;
		}
		_uiHidden = hidden;
	}
	// Coalesce Flash + Interop on the main task queue — never thrash Scaleform from input.
	CogUi::ScheduleUiHiddenApply();
}



void CogRegistry::ToggleUiHidden()
{
	SetUiHidden(!IsUiHidden());
}



bool CogRegistry::HasVisibleFeedShowingNotifications() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showNotifications", false);
}



bool CogRegistry::HasVisibleFeedShowingInventory() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showInventory", false);
}



bool CogRegistry::HasVisibleFeedDivertingLocationDiscovery() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showLocation", false, "showLocationDiscovery", true);
}



bool CogRegistry::HasVisibleFeedDivertingCurrentLocation() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showLocation", false, "showCurrentLocation", true);
}



bool CogRegistry::HasVisibleFeedShowingSkills() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showSkills", false);
}



bool CogRegistry::HasVisibleFeedShowingSkillProgress() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showSkills", false, "showSkillProgress", true);
}



bool CogRegistry::HasVisibleFeedShowingLevelProgress() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showSkills", false, "showLevelProgress", true);
}



std::string CogRegistry::FirstVisibleFeedSetting(
	std::string_view showKey,
	std::string_view settingKey,
	std::string_view fallback) const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (!GizmoIsPlayActive(g) || NormalizeGizmoType(g.typeId) != "cog-feed") {
			continue;
		}
		if (!GizmoSettingsBool(g, showKey, false)) {
			continue;
		}
		auto v = CogRegistryJson::GizmoSettingsString(g, settingKey, fallback);
		if (!v.empty()) {
			return v;
		}
	}
	return std::string{ fallback };
}



bool CogRegistry::FirstVisibleFeedSettingBool(
	std::string_view showKey,
	std::string_view settingKey,
	bool fallback) const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (!GizmoIsPlayActive(g) || NormalizeGizmoType(g.typeId) != "cog-feed") {
			continue;
		}
		if (!GizmoSettingsBool(g, showKey, false)) {
			continue;
		}
		return CogRegistryJson::GizmoSettingsBool(g, settingKey, fallback);
	}
	return fallback;
}



bool CogRegistry::AnyVisibleFeedShowsActiveEffects() const
{
	std::lock_guard lock(_mutex);
	return AnyPlayFeedMatching(_gizmos, "showActiveEffects", false);
}



bool CogRegistry::ShouldSuppressInventoryNotifications() const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (!GizmoIsPlayActive(g) || NormalizeGizmoType(g.typeId) != "cog-feed") {
			continue;
		}
		if (GizmoSettingsBool(g, "showInventory", false)) {
			return true;
		}
		if (GizmoSettingsBool(g, "showNotifications", false) && GizmoSettingsBool(g, "suppressInventory", true)) {
			return true;
		}
	}
	return false;
}



void CogRegistry::RefreshLiveUnlocked()
{
	auto sourceNamed = [this](const char* mod, const char* name) -> CogSource* {
		const auto it = _index.find(KeyOf(mod, name));
		return it == _index.end() ? nullptr : FindByReceipt(it->second);
	};
	auto setPercent = [](CogSource* src, float current, float maximum) {
		if (!src || src->type != CogVarType::Percent) {
			return;
		}
		src->current = static_cast<double>(current);
		src->maximum = static_cast<double>(maximum);
		src->value = maximum > 0.0f ? src->current / src->maximum * 100.0 : 0.0;
	};
	auto setTimer = [](CogSource* src, float remainingSeconds) {
		if (!src || src->type != CogVarType::Timer) {
			return;
		}
		const auto remaining = (std::max)(0.0, static_cast<double>(remainingSeconds));
		src->current = remaining;
		if (remaining <= 0.0) {
			// Drop the peak so the next charge (e.g. a shorter shout) can fill to 100%.
			src->maximum = 0.0;
			src->value = 0.0;
			return;
		}
		if (remaining > src->maximum) {
			src->maximum = remaining;
		}
		src->value = src->maximum > 0.0 ? src->current / src->maximum * 100.0 : 100.0;
	};
	auto setCount = [](CogSource* src, std::int32_t value) {
		if (!src || src->type != CogVarType::Count) {
			return;
		}
		src->value = static_cast<double>((std::max)(0, value));
	};

	float current = 0.0f;
	float maximum = 0.0f;
	CogLive::PlayerActorPercent(RE::ActorValue::kHealth, current, maximum);
	setPercent(sourceNamed("COG.Builtin", "Health"), current, maximum);
	CogLive::PlayerActorPercent(RE::ActorValue::kStamina, current, maximum);
	setPercent(sourceNamed("COG.Builtin", "Stamina"), current, maximum);
	CogLive::ReadMountStamina(current, maximum);
	setPercent(sourceNamed("COG.Builtin", "MountStamina"), current, maximum);
	CogLive::PlayerActorPercent(RE::ActorValue::kMagicka, current, maximum);
	setPercent(sourceNamed("COG.Builtin", "Magicka"), current, maximum);
	CogLive::PlayerActorPercent(RE::ActorValue::kInventoryWeight, current, maximum);
	float carry = 0.0f;
	float carryMax = 0.0f;
	CogLive::PlayerActorPercent(RE::ActorValue::kCarryWeight, carry, carryMax);
	setPercent(sourceNamed("COG.Builtin", "CarryWeight"), current, carryMax);

	setPercent(sourceNamed("COG.Builtin", "BowDraw"), CogLive::PlayerBowDraw(), 1.0f);
	setPercent(sourceNamed("COG.Builtin", "SpellCharge"), CogLive::PlayerSpellCharge(), 1.0f);
	setPercent(sourceNamed("COG.Builtin", "WeaponCharge"), CogLive::PlayerWeaponCharge(false), 1.0f);
	setPercent(sourceNamed("COG.Builtin", "SecondaryWeaponCharge"), CogLive::PlayerWeaponCharge(true), 1.0f);
	setCount(sourceNamed("COG.Builtin", "Arrows"), CogLive::PlayerEquippedArrowCount());
	setCount(sourceNamed("COG.Builtin", "Bolts"), CogLive::PlayerEquippedBoltCount());

	CogLive::ReadPlayerBreath(current, maximum);
	setTimer(sourceNamed("COG.Builtin", "Oxygen"), current);
	const bool isWerewolf = CogLive::PlayerIsWerewolf();
	const float werewolfRemaining = CogLive::BeastSecondsLeft(0xCDD84, "Skyrim.esm", 0x2BA19, "Skyrim.esm");
	if (auto* werewolf = sourceNamed("COG.Builtin", "Werewolf")) {
		if (isWerewolf && !g_wasWerewolfForm && werewolfRemaining > 0.0f) {
			werewolf->maximum = 0.0;
		}
		setTimer(werewolf, werewolfRemaining);
	}
	g_wasWerewolfForm = isWerewolf;
	setTimer(sourceNamed("COG.Builtin", "Shout"), CogLive::PlayerShoutRemaining());
	setTimer(sourceNamed("COG.Builtin", "Howl"), CogLive::PlayerHowlRemaining());
	setPercent(sourceNamed("COG.Builtin", "VampiricHunger"), static_cast<float>(CogLive::VampireStage()), 4.0f);

	if (auto* player = RE::PlayerCharacter::GetSingleton()) {
		if (auto* values = player->AsActorValueOwner()) {
			constexpr float kResistCap = 100.0f;
			setPercent(sourceNamed("COG.Builtin", "FireResist"), values->GetActorValue(RE::ActorValue::kResistFire), kResistCap);
			setPercent(sourceNamed("COG.Builtin", "FrostResist"), values->GetActorValue(RE::ActorValue::kResistFrost), kResistCap);
			setPercent(sourceNamed("COG.Builtin", "ShockResist"), values->GetActorValue(RE::ActorValue::kResistShock), kResistCap);
			setPercent(sourceNamed("COG.Builtin", "PoisonResist"), values->GetActorValue(RE::ActorValue::kPoisonResist), kResistCap);
			setPercent(sourceNamed("COG.Builtin", "MagicResist"), values->GetActorValue(RE::ActorValue::kResistMagic), kResistCap);
			setPercent(sourceNamed("COG.Builtin", "DiseaseResist"), values->GetActorValue(RE::ActorValue::kResistDisease), kResistCap);
		}
	}

	CogInventory::RefreshCountsUnlocked(*this);
}



void CogRegistry::MarkCatalogDirty()
{
	std::lock_guard lock(_mutex);
	_catalogDirty = true;
}



void CogRegistry::MarkLayoutDirty()
{
	std::lock_guard lock(_mutex);
	_layoutDirty = true;
}



void CogRegistry::SyncHudDuplicates()
{
	bool unchanged = false;
	{
		std::lock_guard lock(_mutex);
		EnsureDefaultGroup();
		CogHudSuppress::PrepareSync(*this, unchanged);
	}
	CogHudSuppress::ApplyPreparedSync(unchanged);
}



void CogRegistry::PushLivePercent(const char* mod, const char* name, float current, float maximum)
{
	if (!mod || !name || !CogUi::HasView()) {
		return;
	}
	double value = 0.0;
	{
		std::lock_guard lock(_mutex);
		const auto it = _index.find(KeyOf(mod, name));
		auto* src = it == _index.end() ? nullptr : FindByReceipt(it->second);
		if (!src || src->type != CogVarType::Percent) {
			return;
		}
		src->current = static_cast<double>(current);
		src->maximum = static_cast<double>(maximum);
		src->value = src->maximum > 0.0 ? src->current / src->maximum * 100.0 : 0.0;
		value = src->value;
		current = static_cast<float>(src->current);
		maximum = static_cast<float>(src->maximum);
	}
	// Keep registry values current, but do not Interop / touch Scaleform mid-reload.
	if (IsLoading()) {
		return;
	}

	/*
	 * V3 — coalesce PushLivePercent into pending tick live patch
	 * ----------------------------------------------------------
	 * BowDraw is pushed every PlayerUpdate frame for smooth draw (see
	 * Gears_LiveStats PlayerUpdateHook). The overlay also gets a lean
	 * applyLivePatch every ~50 ms via JS "tick" → PushToUi. When a tick is
	 * already queued, the next applyLivePatch will carry this source
	 * (RefreshLiveUnlocked / BuildLivePatchJson) — a separate applyLivePercent
	 * Interop the same frame is redundant.
	 *
	 * Between ticks (no queue), we still Interop applyLivePercent so bow draw
	 * stays frame-rate smooth.
	 *
	 * REVERT: set COG_COALESCE_LIVE_PERCENT_INTO_TICK to 0.
	 */
#ifndef COG_COALESCE_LIVE_PERCENT_INTO_TICK
#	define COG_COALESCE_LIVE_PERCENT_INTO_TICK 1
#endif
#if COG_COALESCE_LIVE_PERCENT_INTO_TICK
	const bool coalesceIntoPendingLivePatch = CogUi::IsJsTickQueued();
#else
	const bool coalesceIntoPendingLivePatch = false;
#endif
	if (!coalesceIntoPendingLivePatch) {
		std::ostringstream o;
		o << "{\"sourceMod\":\"" << EscapeJson(mod) << "\",\"varName\":\"" << EscapeJson(name)
		  << "\",\"value\":" << value << ",\"current\":" << current << ",\"maximum\":" << maximum << "}";
		CogUi::Interop("applyLivePercent", o.str());
	}

	// Bow draw / spell charge remount HUD clips; re-assert all soft-hides (ungated).
	if (std::strcmp(name, "BowDraw") == 0 || std::strcmp(name, "SpellCharge") == 0) {
		CogHudSuppress::ReapplyHidden();
	}
}
