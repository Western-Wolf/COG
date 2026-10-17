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
			for (const auto& listed : group.gearIds) {
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
			auto& ids = group.gearIds;
			ids.erase(std::remove(ids.begin(), ids.end(), gearId), ids.end());
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
		group->gearIds.push_back(gearId);
		return true;
	}
}


CogRegistry& CogRegistry::Get()
{
	static CogRegistry instance;
	return instance;
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

void CogRegistry::EnsureGearDefinitionUnlocked(const std::string& mod, const std::string& name, const CogGearAppearance& appearance)
{
	for (auto& gear : _gears) {
		if (KeyOf(gear.mod, gear.name) != KeyOf(mod, name)) {
			continue;
		}
		// Heal case-only drift (e.g. disk "stamina" vs Register "Stamina").
		gear.mod = mod;
		gear.name = name;
		const auto previousDefaultIcon = gear.defaults.icon;
		gear.defaults = appearance;
		if (AppearanceEmpty(gear.settings)) {
			gear.settings = appearance;
		} else if (!appearance.icon.empty() &&
			(gear.settings.icon.empty() || gear.settings.icon == CogIcon::kFallbackRelPath ||
				gear.settings.icon == previousDefaultIcon)) {
			// Track Register's icon when the user hasn't chosen a different custom icon
			// (covers failed-import cog fallback and superseded library remaps).
			gear.settings.icon = appearance.icon;
		}
		return;
	}
	// New gear row — drop a stale seen key so OfferDefaultGear can place it. Survives
	// ApplyStateJson / SyncDir races that removed the entity without clearing seen.
	_seenSources.erase(KeyOf(mod, name));
	CogGear gear;
	gear.id = FileStem(mod + "_" + name);
	gear.mod = mod;
	gear.name = name;
	gear.enabled = true;
	gear.defaults = appearance;
	gear.settings = appearance;
	_gears.push_back(std::move(gear));
}

std::int32_t CogRegistry::Register(
	std::string mod,
	std::string name,
	std::string type,
	std::string display,
	std::string category,
	std::string icon,
	std::string startColor,
	std::string endColor,
	std::string barColor,
	std::string hideAt,
	std::string hudLinkedElement,
	bool hudHideDuplicate)
{
	if (mod.empty() || name.empty()) {
		logger::warn(
			"COG_API.Register rejected: empty mod or name (mod='{}' name='{}' type='{}')",
			mod,
			name,
			type);
		return 0;
	}
	icon = NormalizeIcon(std::move(icon));
	startColor = OptionalHexColor(std::move(startColor));
	endColor = OptionalHexColor(std::move(endColor));
	barColor = OptionalHexColor(std::move(barColor));
	hideAt = NormalizeHideAt(std::move(hideAt), type);
	hudLinkedElement = TrimCopy(std::move(hudLinkedElement));
	std::lock_guard lock(_mutex);
	const auto key = KeyOf(mod, name);
	std::int32_t receipt = 0;
	constexpr const char* kFallbackIcon = CogIcon::kFallbackRelPath;
	bool usedFallbackIcon = false;
	if (auto existing = _index.find(key); existing != _index.end()) {
		auto& src = _sources[existing->second];
		src.type = ParseType(type);
		if (!display.empty()) {
			src.display = std::move(display);
		}
		if (!category.empty()) {
			src.category = std::move(category);
		}
		if (!icon.empty()) {
			src.icon = std::move(icon);
		} else if (src.icon.empty()) {
			src.icon = kFallbackIcon;
			usedFallbackIcon = true;
		}
		AssignIfProvided(src.startColor, std::move(startColor));
		AssignIfProvided(src.endColor, std::move(endColor));
		AssignIfProvided(src.barColor, std::move(barColor));
		AssignIfProvided(src.hideAt, std::move(hideAt));
		AssignIfProvided(src.hudLinkedElement, std::move(hudLinkedElement));
		src.hudHideDuplicate = hudHideDuplicate;
		receipt = src.receipt;
	} else {
		CogSource src;
		src.receipt = _nextReceipt++;
		src.mod = std::move(mod);
		src.name = std::move(name);
		src.display = display.empty() ? src.name : std::move(display);
		src.category = std::move(category);
		src.type = ParseType(type);
		if (icon.empty()) {
			src.icon = kFallbackIcon;
			usedFallbackIcon = true;
		} else {
		src.icon = std::move(icon);
		}
		src.startColor = std::move(startColor);
		src.endColor = std::move(endColor);
		src.barColor = std::move(barColor);
		src.hideAt = std::move(hideAt);
		src.hudLinkedElement = std::move(hudLinkedElement);
		src.hudHideDuplicate = hudHideDuplicate;
		receipt = src.receipt;
		_index[key] = receipt;
		_sources[receipt] = std::move(src);
		_order.push_back(receipt);
	}
	const auto& src = _sources[receipt];
	if (usedFallbackIcon) {
		logger::info(
			"COG: gear '{}':'{}' assigned fallback icon {}",
			src.mod,
			src.name,
			kFallbackIcon);
	}
	CogGearAppearance appearance;
	appearance.display = src.display;
	appearance.icon = src.icon;
	appearance.startColor = src.startColor;
	appearance.endColor = src.endColor;
	appearance.barColor = src.barColor;
	appearance.hideAt = src.hideAt;
	appearance.hudLinkedElement = src.hudLinkedElement;
	appearance.hudHideDuplicate = src.hudHideDuplicate;
	EnsureGearDefinitionUnlocked(src.mod, src.name, appearance);
	// Heal gauges that still point at a case-drifted varName (e.g. "magicka" vs "Magicka").
	for (auto& gauge : _gauges) {
		if (KeyOf(gauge.gearMod, gauge.gearName) == KeyOf(src.mod, src.name)) {
			gauge.gearMod = src.mod;
			gauge.gearName = src.name;
		}
	}
	OfferDefaultGearUnlocked(src.mod, src.name);
	SaveConfigUnlocked();
	return receipt;
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
			mod = src->mod;
			name = src->name;
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

void CogRegistry::Unregister(std::int32_t receipt)
{
	std::lock_guard lock(_mutex);
	if (auto it = _sources.find(receipt); it != _sources.end()) {
		const auto mod = it->second.mod;
		const auto name = it->second.name;
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
	std::unordered_set<std::string> removedTypes;
	_gizmoTypes.erase(
		std::remove_if(
			_gizmoTypes.begin(),
			_gizmoTypes.end(),
			[&](const CogGizmoType& t) {
				if (t.typeId != typeId) {
					return false;
				}
				logger::info("Discarded gizmo type '{}' — Unregister({})", t.typeId, receipt);
				removedTypes.insert(NormalizeGizmoType(t.typeId));
				return true;
			}),
		_gizmoTypes.end());
	const bool culled = CullGizmosOfTypesUnlocked(removedTypes);
	SaveGizmoTypesUnlocked();
	if (culled) {
		SaveConfigUnlocked();
	}
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
			if (gear.mod == mod) {
				++gearCount;
			}
		}
		for (const auto& [receipt, src] : _sources) {
			(void)receipt;
			if (src.mod == mod) {
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

std::int32_t CogRegistry::RegisterGizmo(
	std::string mod,
	std::string typeId,
	std::string displayName,
	std::string galleryIcon,
	float defaultWidth,
	float defaultHeight,
	std::string viewScript,
	std::string settingsSchemaJson,
	std::string defaultVisibility)
{
	mod = TrimCopy(std::move(mod));
	typeId = SanitizeGizmoTypeId(TrimCopy(std::move(typeId)));
	if (mod.empty() || typeId.empty()) {
		logger::warn(
			"RegisterGizmo rejected: empty mod or typeId (mod='{}' typeId='{}')",
			mod,
			typeId);
		return 0;
	}
	if (IsBuiltinGizmoTypeId(typeId) && mod != "COG") {
		logger::warn("RegisterGizmo rejected: '{}' uses reserved cog- prefix (COG only)", typeId);
		return 0;
	}
	viewScript = SanitizeViewScriptPath(std::move(viewScript));
	if (!settingsSchemaJson.empty() && !LooksLikeJsonObjectOrArray(settingsSchemaJson)) {
		settingsSchemaJson = "[]";
	}
	defaultVisibility = NormalizeGizmoVisibility(std::move(defaultVisibility));
	std::lock_guard lock(_mutex);
	CogGizmoType* slot = nullptr;
	for (auto& t : _gizmoTypes) {
		if (t.typeId == typeId) {
			slot = &t;
			break;
		}
	}
	if (slot && slot->sourceMod != mod) {
		logger::warn(
			"RegisterGizmo rejected: typeId '{}' already owned by '{}'",
			typeId,
			slot->sourceMod);
		return 0;
	}
	if (!slot) {
		_gizmoTypes.push_back({});
		slot = &_gizmoTypes.back();
		slot->typeId = typeId;
	}
	slot->sourceMod = mod;
	slot->displayName = displayName.empty() ? typeId : std::move(displayName);
	slot->galleryIcon = NormalizeIcon(std::move(galleryIcon));
	slot->defaultWidth = defaultWidth > 0.0f ? defaultWidth : 240.0f;
	slot->defaultHeight = defaultHeight > 0.0f ? defaultHeight : 48.0f;
	slot->defaultVisibility = std::move(defaultVisibility);
	slot->viewScript = std::move(viewScript);
	slot->settingsSchemaJson =
		settingsSchemaJson.empty() ? "[]" : std::move(settingsSchemaJson);

	std::int32_t receipt = 0;
	if (auto existing = _gizmoTypeReceiptIndex.find(typeId); existing != _gizmoTypeReceiptIndex.end()) {
		receipt = existing->second;
	} else {
		receipt = _nextReceipt++;
		_gizmoTypeReceiptIndex[typeId] = receipt;
		_gizmoTypeReceipts[receipt] = typeId;
	}
	return receipt;
}

const CogGizmoType* CogRegistry::FindGizmoTypeUnlocked(std::string_view typeId) const
{
	const auto normalized = NormalizeGizmoType(std::string(typeId));
	for (const auto& t : _gizmoTypes) {
		if (NormalizeGizmoType(t.typeId) == normalized) {
			return &t;
		}
	}
	return nullptr;
}

std::string CogRegistry::DefaultVisibilityForType(std::string_view typeId) const
{
	std::lock_guard lock(_mutex);
	if (const auto* type = FindGizmoTypeUnlocked(typeId)) {
		return NormalizeGizmoVisibility(type->defaultVisibility);
	}
	return BuiltinDefaultVisibilityForType(NormalizeGizmoType(std::string(typeId)));
}

bool CogRegistry::ApplyGizmoTypeDefaultsUnlocked()
{
	bool changed = false;
	for (auto& g : _gizmos) {
		if (CogRegistryJson::MergeGizmoSettingsFromType(g, FindGizmoTypeUnlocked(g.type))) {
			changed = true;
		}
	}
	return changed;
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
			if (NormalizeGizmoType(g.type) == normalized) {
				g.livePayloadJson = stored;
			}
		}
	}
	PushToUi();
}

void CogRegistry::RegisterBuiltinGizmoTypesUnlocked()
{
	auto upsert = [&](const char* typeId, const char* displayName, const char* icon, float w, float h,
					  const char* defaultVisibility, const char* schema) {
		CogGizmoType* slot = nullptr;
		for (auto& t : _gizmoTypes) {
			if (t.typeId == typeId) {
				slot = &t;
				break;
			}
		}
		if (!slot) {
			_gizmoTypes.push_back({});
			slot = &_gizmoTypes.back();
			slot->typeId = typeId;
		}
		slot->sourceMod = "COG";
		slot->displayName = displayName;
		slot->galleryIcon = icon;
		slot->defaultWidth = w;
		slot->defaultHeight = h;
		slot->defaultVisibility = NormalizeGizmoVisibility(defaultVisibility);
		slot->viewScript.clear();
		slot->settingsSchemaJson = schema;
	};
	upsert("cog-clock", "Clock", "Actions/wait.svg", 275.0f, 40.0f, "hud",
		R"([
{"key":"displayMode","kind":"enum","label":"Mode","default":"celestial","options":["text","celestial"]},
{"key":"fontSize","kind":"int","label":"Font size","default":18,"min":0,"max":128},
{"key":"timeFormat","kind":"enum","label":"Time format","default":"24h","options":["12h","24h"]},
{"key":"endCapMode","kind":"enum","label":"End caps","default":"border","options":["border","endcap"]},
{"key":"endCap","kind":"string","label":"End cap art","default":"Endcaps/circle-half.svg"},
{"key":"endCapOverlap","kind":"float","label":"End cap overlap","default":0,"min":0,"max":100},
{"key":"borderThickness","kind":"float","label":"Border thickness %","default":15,"min":0,"max":50},
{"key":"celestialShow","kind":"enum","label":"Celestial show","default":"always","options":["always","sky","outdoors"]},
{"key":"textAlign","kind":"enum","label":"Align","default":"center","options":["left","center","right"]},
{"key":"clockIcon","kind":"string","label":"Clock icon","default":"season"},
{"key":"iconColor","kind":"color","label":"Icon colour","default":"#e8d2a0"},
{"key":"textColor","kind":"color","label":"Text colour","default":"#e8d2a0"},
{"key":"borderColor","kind":"color","label":"Border colour","default":"#e8d2a0"},
{"key":"celestialColor","kind":"color","label":"Celestial colour","default":"#ffffff"}
])");
	upsert("cog-shout-meter", "Shout Meter", "Actions/shout.svg", 220.0f, 48.0f, "hud",
		R"([
{"key":"fontSize","kind":"int","label":"Font size","default":0,"min":0,"max":128},
{"key":"textAlign","kind":"enum","label":"Align","default":"center","options":["left","center","right"]},
{"key":"drainOrigin","kind":"enum","label":"Fade starts from","default":"center","options":["center","left","right"]},
{"key":"wordsMode","kind":"enum","label":"Words","default":"unlocked","options":["unlocked","known","all"]},
{"key":"primaryColor","kind":"color","label":"Primary","default":"#ffffff"},
{"key":"secondaryColor","kind":"color","label":"Secondary","default":"#5ba4f9"},
{"key":"troughOpacity","kind":"int","label":"Trough opacity %","default":20,"min":0,"max":100}
])");
	// Scalar Feed settings only — complex create()-owned defaults (and section UX) live in JS.
	upsert("cog-feed", "Feed", "Scribe/list.svg", 400.0f, 400.0f, "ui",
		R"([
{"key":"fontSize","kind":"int","label":"Font size","default":18,"min":0,"max":128},
{"key":"textAlign","kind":"enum","label":"Align","default":"left","options":["left","center","right"]},
{"key":"iconPlacement","kind":"enum","label":"Icons","default":"left","options":["left","right"]},
{"key":"textColor","kind":"color","label":"Text colour","default":"#e8d2a0"},
{"key":"addColor","kind":"color","label":"Add colour","default":"#e8d2a0"},
{"key":"removeColor","kind":"color","label":"Remove colour","default":"#e8d2a0"},
{"key":"stolenColor","kind":"color","label":"Stolen colour","default":"#e8d2a0"},
{"key":"maxVisible","kind":"int","label":"Max visible","default":15,"min":1,"max":20},
{"key":"stackOrigin","kind":"enum","label":"Stack from","default":"top","options":["top","bottom"]},
{"key":"durationMs","kind":"int","label":"Duration ms","default":5000,"min":500,"max":60000},
{"key":"fadeMs","kind":"int","label":"Fade ms","default":1000,"min":0,"max":2000},
{"key":"showNotifications","kind":"bool","label":"Notifications","default":false},
{"key":"showInventory","kind":"bool","label":"Inventory","default":false},
{"key":"showLocation","kind":"bool","label":"Location","default":false},
{"key":"showActiveEffects","kind":"bool","label":"Active effects","default":false},
{"key":"showSkills","kind":"bool","label":"Skills","default":false},
{"key":"effectsMinSec","kind":"float","label":"Effects min sec","default":1,"min":0,"max":600},
{"key":"effectsMaxSec","kind":"float","label":"Effects max sec","default":180,"min":0,"max":3600},
{"key":"showEffectIcons","kind":"bool","label":"Effect icons","default":true},
{"key":"showEffectText","kind":"bool","label":"Effect text","default":true},
{"key":"showEffectTimer","kind":"bool","label":"Effect timer","default":true},
{"key":"progressBarWidth","kind":"int","label":"Progress bar width","default":20,"min":5,"max":100},
{"key":"numberFormat","kind":"enum","label":"Number format","default":"barTotal","options":["bar","barPercent","barTotal","percent","total"]},
{"key":"barColor","kind":"color","label":"Bar colour","default":"#c4a35a"},
{"key":"effectIcon","kind":"string","label":"Effect icon","default":"Magic/sparkles.svg"},
{"key":"effectsColor","kind":"color","label":"Effects colour","default":"#e8d2a0"},
{"key":"suppressTransformEffects","kind":"bool","label":"Suppress transform effects","default":true},
{"key":"showNotificationIcons","kind":"bool","label":"Notification icons","default":true},
{"key":"showInventoryIcons","kind":"bool","label":"Inventory icons","default":true},
{"key":"showLocationIcons","kind":"bool","label":"Location icons","default":true},
{"key":"showSkillIcons","kind":"bool","label":"Skill icons","default":true},
{"key":"notificationIcon","kind":"string","label":"Notification icon","default":"Actions/speak.svg"},
{"key":"allowModNotificationIcon","kind":"bool","label":"Allow mod notification icon","default":true},
{"key":"allowModNotificationColor","kind":"bool","label":"Allow mod notification colour","default":true},
{"key":"suppressInventory","kind":"bool","label":"Suppress inventory divert","default":true},
{"key":"showLocationDiscovery","kind":"bool","label":"Location discovery","default":true},
{"key":"showCurrentLocation","kind":"bool","label":"Current location","default":true},
{"key":"locationDiscoveryIcon","kind":"string","label":"Discovery icon","default":"Camping/map.svg"},
{"key":"currentLocationIcon","kind":"string","label":"Current location icon","default":"Camping/compass.svg"},
{"key":"locationDiscoveryColor","kind":"color","label":"Discovery colour","default":"#e8d2a0"},
{"key":"currentLocationColor","kind":"color","label":"Current location colour","default":"#e8d2a0"},
{"key":"skillIcon","kind":"string","label":"Skill icon","default":"Scribe/book-open.svg"},
{"key":"levelIcon","kind":"string","label":"Level icon","default":"Celestial/star.svg"},
{"key":"skillsColor","kind":"color","label":"Skills colour","default":"#e8d2a0"},
{"key":"showLevelProgress","kind":"bool","label":"Level progress","default":true},
{"key":"backdropColor","kind":"color","label":"Backdrop colour","default":"#000000"},
{"key":"backdropOpacity","kind":"int","label":"Backdrop opacity","default":35,"min":0,"max":100},
{"key":"backdropDirection","kind":"enum","label":"Backdrop direction","default":"down","options":["up","down","center"]},
{"key":"icon","kind":"string","label":"Inventory icon","default":"Treasure/bag.svg"}
])");
	// alwaysHide / neverHide are string arrays — not expressible in schema kinds; create() owns defaults.
	upsert("cog-suppressor", "Suppressor", "Actions/stop.svg", 100.0f, 100.0f, "none", "[]");
}

void CogRegistry::RegisterBuiltinGizmoTypes()
{
	std::lock_guard lock(_mutex);
	RegisterBuiltinGizmoTypesUnlocked();
}

void CogRegistry::EnsureBuiltinSources()
{
	// Keep in sync with _cog/papyrus/COG_Builtin.psc Setup().
	BeginRegister("COG.Builtin", kCogPluginFile);
	Register("COG.Builtin", "Health", "percent", "Health", "Stat", "Survival/health.svg", "", "", "#DF2020", "", "hud.health", true);
	Register("COG.Builtin", "Stamina", "percent", "Stamina", "Stat", "Camping/hiker.svg", "", "", "#20DF20", "", "hud.stamina", true);
	Register("COG.Builtin", "MountStamina", "percent", "Mount Stamina", "Mount", "Animals/horse-head.svg", "", "", "#20DF20", "<0.01");
	Register("COG.Builtin", "Magicka", "percent", "Magicka", "Stat", "Magic/crystal-ball-shiny.svg", "", "", "#2020DF", "", "hud.magicka", true);
	Register("COG.Builtin", "CarryWeight", "percent", "Carry Weight", "Stat", "Camping/backpack.svg");
	Register("COG.Builtin", "Arrows", "count", "Arrows (Equipped)", "Equipment", "Weapons/arrows.svg", "", "", "", "<0.01", "hud.ammo", true);
	Register("COG.Builtin", "Bolts", "count", "Bolts (Equipped)", "Equipment", "Weapons/quiver.svg", "", "", "", "<0.01", "hud.ammo", true);
	Register("COG.Builtin", "Werewolf", "timer", "Transformation", "Werewolf", "Werewolf/wolf.svg", "", "", "#EEEEFF");
	Register("COG.Builtin", "Bloodlust", "percent", "Vampiric Hunger", "Vampire", "Vampire/fangs.svg", "", "", "", "<0.01");
	Register("COG.Builtin", "Oxygen", "timer", "Oxygen", "Survival", "Survival/oxygen.svg", "", "", "#44DDCC", "", "hud.oxygen", true);
	Register("COG.Builtin", "BowDraw", "percent", "Bow Draw", "Charge", "Weapons/bow.svg", "", "", "#AA6633", "<0.01", "hud.casting", true);
	Register("COG.Builtin", "SpellCharge", "percent", "Spell Casting", "Charge", "Magic/sparkles.svg", "", "", "#7744DD", "<0.01", "hud.casting", true);
	Register("COG.Builtin", "WeaponCharge", "percent", "Weapon Charge", "Charge", "Actions/hand-right.svg", "", "", "", "<0.01", "hud.charge", true);
	Register("COG.Builtin", "SecondaryWeaponCharge", "percent", "Secondary Weapon Charge", "Charge", "Actions/hand-left.svg", "", "", "", "<0.01", "hud.leftcharge", true);
	Register("COG.Builtin", "Shout", "timer", "Shout Cooldown", "Charge", "Actions/shout.svg", "", "", "#5ba4f9", "", "hud.casting", true);
	Register("COG.Builtin", "Howl", "timer", "Howl Cooldown", "Charge", "Werewolf/wolf-side.svg");
	Register("COG.Builtin", "FireResist", "percent", "Fire Resistance", "Resistance", "Survival/fire.svg", "#ffffff", "#ffffff");
	Register("COG.Builtin", "FrostResist", "percent", "Frost Resistance", "Resistance", "Weather/snowflake.svg", "#ffffff", "#ffffff");
	Register("COG.Builtin", "ShockResist", "percent", "Shock Resistance", "Resistance", "Weather/lightning.svg", "#ffffff", "#ffffff");
	Register("COG.Builtin", "PoisonResist", "percent", "Poison Resistance", "Resistance", "Alchemy/skull-and-bones.svg", "#ffffff", "#ffffff");
	Register("COG.Builtin", "MagicResist", "percent", "Magic Resistance", "Resistance", "Magic/sparkles.svg", "#ffffff", "#ffffff");
	Register("COG.Builtin", "DiseaseResist", "percent", "Disease Resistance", "Resistance", "Survival/virus.svg", "#ffffff", "#ffffff");
	EndRegister("COG.Builtin");
}

void CogRegistry::BindSenderPluginUnlocked(const std::string& mod, std::string pluginFile)
{
	if (mod.empty() || pluginFile.empty()) {
		return;
	}
	auto& sender = _senders[mod];
	if (sender.plugin != pluginFile) {
		logger::info("Bound sender '{}' to plugin '{}'", mod, pluginFile);
		sender.plugin = std::move(pluginFile);
	}
}

/** Bind sniffed plugin for a sender; upgrades stale iWant Status Bars.esp proxy bindings. */
void CogRegistry::BindSniffedSenderPluginUnlocked(const std::string& mod, std::string sniffedPlugin)
{
	if (mod.empty()) {
		return;
	}
	if (sniffedPlugin.empty()) {
		_senders.try_emplace(mod);
		return;
	}
	const auto it = _senders.find(mod);
	if (it == _senders.end() || it->second.plugin.empty()) {
		BindSenderPluginUnlocked(mod, std::move(sniffedPlugin));
		return;
	}
	if (CogCaller::IsBridgeProxyPlugin(it->second.plugin) &&
		!CogCaller::IsBridgeProxyPlugin(sniffedPlugin)) {
		BindSenderPluginUnlocked(mod, std::move(sniffedPlugin));
	}
}

bool CogRegistry::DropAllModGearsUnlocked(const std::string& mod)
{
	bool dropped = false;
	for (auto it = _gears.begin(); it != _gears.end();) {
		if (it->mod != mod) {
			++it;
			continue;
		}
		if (it->locked) {
			++it;
			continue;
		}
		logger::info("Discarded gear '{}' — sender '{}' is absent", it->id, mod);
		_seenSources.erase(KeyOf(it->mod, it->name));
		RemoveGearIdFromAllGroups(_groups, it->id);
		CullGaugesBoundToSourceUnlocked(it->mod, it->name);
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
		_gizmoTypeReceipts.clear();
		_gizmoTypeReceiptIndex.clear();
		// Force a full snapshot on the first tick after load (not a lean live patch).
		_layoutDirty = true;
	}
	// Re-mark internal senders present immediately after the clear (Papyrus may miss COG_Ready).
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

bool CogRegistry::EnsureDefaultGroup()
{
	auto it = std::find_if(_groups.begin(), _groups.end(), [](const CogGroup& g) {
		return g.id == kDefaultGroupId;
	});
	if (it == _groups.end()) {
		_groups.insert(_groups.begin(), DefaultGroup());
		return true;
	}
	it->locked = true;
	it->name = "Default Group";
	if (it != _groups.begin()) {
		std::rotate(_groups.begin(), it, std::next(it));
	}
	return false;
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
		for (const auto& gearId : group.gearIds) {
			if (!knownGears.contains(gearId) || placed.contains(gearId)) {
				continue;
			}
			kept.push_back(gearId);
			placed.insert(gearId);
		}
		group.gearIds = std::move(kept);
	}
	CogInventory::EnsureBuiltinsUnlocked(*this);
}

void CogRegistry::RememberGearKeysUnlocked()
{
	for (const auto& gear : _gears) {
		_seenSources.insert(KeyOf(gear.mod, gear.name));
	}
}

void CogRegistry::OfferDefaultGearUnlocked(const std::string& mod, const std::string& name)
{
	// Builtin / internal COG sources stay off the Default Group until the user adds them.
	// Gate on sourceMod (not category) so third-party mods can use "Base Game" and still auto-offer.
	if (mod == "COG.Builtin" || mod == kInventoryGearMod) {
		return;
	}
	const auto key = KeyOf(mod, name);
	if (_seenSources.contains(key)) {
		return;
	}
	EnsureDefaultGroup();
	CogGear* target = nullptr;
	for (auto& gear : _gears) {
		if (KeyOf(gear.mod, gear.name) == key) {
			target = &gear;
			break;
		}
	}
	// Only burn the "seen" offer once we have a gear row. Marking seen with no target
	// permanently blocks Default Group placement after a later Register recreates it.
	if (!target) {
		return;
	}
	if (!FindGroupIdForGear(_groups, target->id).empty()) {
			_seenSources.insert(key);
		return;
	}
	_seenSources.insert(key);
	AppendGearToGroup(_groups, kDefaultGroupId, target->id);
	target->enabled = true;
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

void CogRegistry::SetViewReady(bool ready)
{
	{
		std::lock_guard lock(_mutex);
		_viewReady = ready;
	}
	if (ready) {
		int feedCount = 0;
		int feedVisible = 0;
		std::string visibleDetail;
		{
			std::lock_guard lock(_mutex);
			for (const auto& g : _gizmos) {
				if (NormalizeGizmoType(g.type) != "cog-feed") {
					continue;
				}
				++feedCount;
				if (!GizmoIsPlayActive(g)) {
					continue;
				}
				++feedVisible;
				if (!visibleDetail.empty()) {
					visibleDetail += "; ";
				}
				std::ostringstream one;
				one << "id=\"" << g.id << "\" name=\"" << g.name << "\" visibility=" << g.visibility
					<< " notif=" << (GizmoSettingsBool(g, "showNotifications", false) ? 1 : 0)
					<< " inv=" << (GizmoSettingsBool(g, "showInventory", false) ? 1 : 0)
					<< " loc=" << (GizmoSettingsBool(g, "showLocation", false) ? 1 : 0)
					<< " discovery=" << (GizmoSettingsBool(g, "showLocationDiscovery", true) ? 1 : 0)
					<< " current=" << (GizmoSettingsBool(g, "showCurrentLocation", true) ? 1 : 0)
					<< " icons=" << (GizmoSettingsBool(g, "showLocationIcons", true) ? 1 : 0)
					<< " x=" << std::fixed << std::setprecision(3) << g.x << " y=" << g.y;
				visibleDetail += one.str();
			}
		}
		if (visibleDetail.empty()) {
			logger::info("Feed: view ready — {} feed gizmo(s), {} visible", feedCount, feedVisible);
		} else {
			logger::info(
				"Feed: view ready — {} feed gizmo(s), {} visible [{}]",
				feedCount,
				feedVisible,
				visibleDetail);
		}
		logger::info(
			"Feed: divert armed — notifications={} inventory={} locationDiscovery={} currentLocation={} skills={}",
			HasVisibleFeedShowingNotifications(),
			HasVisibleFeedShowingInventory(),
			HasVisibleFeedDivertingLocationDiscovery(),
			HasVisibleFeedDivertingCurrentLocation(),
			HasVisibleFeedShowingSkills());
		MarkCatalogDirty();
		CogFeed::PushPendingFeedEventsToUi();
	}
}

bool CogRegistry::HasVisibleFeedShowingNotifications() const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (GizmoIsPlayActive(g) && NormalizeGizmoType(g.type) == "cog-feed" && GizmoSettingsBool(g, "showNotifications", false)) {
	return true;
}
	}
	return false;
}

bool CogRegistry::HasVisibleFeedShowingInventory() const
	{
		std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (GizmoIsPlayActive(g) && NormalizeGizmoType(g.type) == "cog-feed" && GizmoSettingsBool(g, "showInventory", false)) {
			return true;
		}
	}
	return false;
}

bool CogRegistry::HasVisibleFeedDivertingLocationDiscovery() const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (GizmoIsPlayActive(g) && NormalizeGizmoType(g.type) == "cog-feed" && GizmoSettingsBool(g, "showLocation", false) &&
			GizmoSettingsBool(g, "showLocationDiscovery", true)) {
			return true;
		}
	}
	return false;
}

bool CogRegistry::HasVisibleFeedDivertingCurrentLocation() const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (GizmoIsPlayActive(g) && NormalizeGizmoType(g.type) == "cog-feed" && GizmoSettingsBool(g, "showLocation", false) &&
			GizmoSettingsBool(g, "showCurrentLocation", true)) {
			return true;
		}
	}
	return false;
}

bool CogRegistry::HasVisibleFeedShowingSkills() const
		{
			std::lock_guard lock(_mutex);
			for (const auto& g : _gizmos) {
		if (GizmoIsPlayActive(g) && NormalizeGizmoType(g.type) == "cog-feed" &&
			GizmoSettingsBool(g, "showSkills", false)) {
			return true;
		}
	}
	return false;
}

bool CogRegistry::HasVisibleFeedShowingLevelProgress() const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (GizmoIsPlayActive(g) && NormalizeGizmoType(g.type) == "cog-feed" &&
			GizmoSettingsBool(g, "showSkills", false) && GizmoSettingsBool(g, "showLevelProgress", true)) {
			return true;
		}
	}
	return false;
}

bool CogRegistry::AnyVisibleFeedShowsActiveEffects() const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (GizmoIsPlayActive(g) && NormalizeGizmoType(g.type) == "cog-feed" && GizmoSettingsBool(g, "showActiveEffects", false)) {
			return true;
		}
	}
	return false;
}

bool CogRegistry::ShouldSuppressInventoryNotifications() const
{
	std::lock_guard lock(_mutex);
	for (const auto& g : _gizmos) {
		if (!GizmoIsPlayActive(g) || NormalizeGizmoType(g.type) != "cog-feed") {
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
	static bool wasWerewolf = false;
	const bool isWerewolf = CogLive::PlayerIsWerewolf();
	const float werewolfRemaining = CogLive::BeastSecondsLeft(0xCDD84, "Skyrim.esm", 0x2BA19, "Skyrim.esm");
	if (auto* werewolf = sourceNamed("COG.Builtin", "Werewolf")) {
		if (isWerewolf && !wasWerewolf && werewolfRemaining > 0.0f) {
			werewolf->maximum = 0.0;
		}
		setTimer(werewolf, werewolfRemaining);
	}
	wasWerewolf = isWerewolf;
	setTimer(sourceNamed("COG.Builtin", "Shout"), CogLive::PlayerShoutRemaining());
	setTimer(sourceNamed("COG.Builtin", "Howl"), CogLive::PlayerHowlRemaining());
	setPercent(sourceNamed("COG.Builtin", "Bloodlust"), static_cast<float>(CogLive::VampireStage()), 4.0f);

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

bool CogRegistry::DropGearUnlocked(const std::string& mod, const std::string& name)
{
	bool dropped = false;
	for (auto it = _gears.begin(); it != _gears.end();) {
		if (it->mod != mod || it->name != name) {
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
		if (it->mod != mod) {
			++it;
			continue;
		}
		if (_index.contains(KeyOf(it->mod, it->name))) {
			++it;
			continue;
		}
		logger::info("Discarded gear '{}' — {} / {} missing after EndRegister", it->id, it->mod, it->name);
		_seenSources.erase(KeyOf(it->mod, it->name));
		RemoveGearIdFromAllGroups(_groups, it->id);
		CullGaugesBoundToSourceUnlocked(it->mod, it->name);
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
		if (it->gearMod.empty() && it->gearName.empty()) {
			++it;
			continue;
		}
		if (KeyOf(it->gearMod, it->gearName) != key) {
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
		known.insert(KeyOf(gear.mod, gear.name));
	}
	bool dropped = false;
	for (auto it = _gauges.begin(); it != _gauges.end();) {
		if (it->gearMod.empty() && it->gearName.empty()) {
			++it;
			continue;
		}
		if (known.contains(KeyOf(it->gearMod, it->gearName))) {
			++it;
			continue;
		}
		logger::info(
			"Discarded gauge '{}' — gear {} / {} is gone",
			it->id,
			it->gearMod,
			it->gearName);
		it = _gauges.erase(it);
		dropped = true;
	}
	return dropped;
}

bool CogRegistry::PruneModGizmoTypesUnlocked(const std::string& mod)
{
	if (mod.empty() || mod == "COG") {
		return false;
	}
	std::unordered_set<std::string> removedTypes;
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
		removedTypes.insert(NormalizeGizmoType(it->typeId));
		it = _gizmoTypes.erase(it);
		dropped = true;
	}
	dropped = CullGizmosOfTypesUnlocked(removedTypes) || dropped;
	return dropped;
}

bool CogRegistry::DropAllModGizmoTypesUnlocked(const std::string& mod)
{
	if (mod.empty() || mod == "COG") {
		return false;
	}
	std::unordered_set<std::string> removedTypes;
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
		removedTypes.insert(NormalizeGizmoType(it->typeId));
		if (auto rit = _gizmoTypeReceiptIndex.find(it->typeId); rit != _gizmoTypeReceiptIndex.end()) {
			_gizmoTypeReceipts.erase(rit->second);
			_gizmoTypeReceiptIndex.erase(rit);
		}
		it = _gizmoTypes.erase(it);
		dropped = true;
	}
	// Instances tagged with this sourceMod (even if types never re-registered this session).
	dropped = CullGizmosOfSourceModUnlocked(mod) || dropped;
	// Plus any instances of types we just dropped (covers empty sourceMod on older JSON).
	dropped = CullGizmosOfTypesUnlocked(removedTypes) || dropped;
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
		if (CogRegistryJson::IsBuiltinGizmoTypeId(it->type)) {
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
		const auto type = NormalizeGizmoType(it->type);
		if (!typeIds.contains(type)) {
			++it;
					continue;
				}
		logger::info("Discarded gizmo '{}' — type '{}' no longer registered", it->id, it->type);
		it = _gizmos.erase(it);
		dropped = true;
	}
	return dropped;
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
	std::ostringstream o;
	o << "{\"mod\":\"" << EscapeJson(mod) << "\",\"name\":\"" << EscapeJson(name)
	  << "\",\"value\":" << value << ",\"current\":" << current << ",\"maximum\":" << maximum << "}";
	CogUi::Interop("applyLivePercent", o.str());

	// Bow draw / spell charge remount HUD clips; re-assert all soft-hides (ungated).
	if (std::strcmp(name, "BowDraw") == 0 || std::strcmp(name, "SpellCharge") == 0) {
		CogHudSuppress::ReapplyHidden();
	if (auto* tasks = SKSE::GetTaskInterface()) {
			tasks->AddTask([]() { CogHudSuppress::ReapplyHidden(); });
		}
	}
}

