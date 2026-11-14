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
#include "_Gizmo_Feed_Sources.h"
#include "_Gizmo_Storage.h"
#include "_API_Core.h"

#include "_Core_Json.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
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



void CogRegistry::EnsureGearDefinitionUnlocked(const std::string& mod, const std::string& name, const CogGearAppearance& appearance)
{
	for (auto& gear : _gears) {
		if (KeyOf(gear.sourceMod, gear.varName) != KeyOf(mod, name)) {
			continue;
		}
		// Heal case-only drift (e.g. disk "stamina" vs Register "Stamina").
		gear.sourceMod = mod;
		gear.varName = name;
		const auto previousDefaultIcon = gear.defaults.icon;
		gear.defaults = appearance;
		if (AppearanceEmpty(gear.settings)) {
			gear.settings = appearance;
		} else {
			// Same title with drifted casing (disk "stamina" vs Register "Stamina") —
			// heal so name: catalog keys resolve; leave truly custom titles alone.
			if (!appearance.displayName.empty() &&
				Lower(gear.settings.displayName) == Lower(appearance.displayName) &&
				gear.settings.displayName != appearance.displayName) {
				gear.settings.displayName = appearance.displayName;
			}
			if (!appearance.icon.empty() &&
				(gear.settings.icon.empty() || gear.settings.icon == CogIcon::kFallbackRelPath ||
					gear.settings.icon == previousDefaultIcon)) {
				// Track Register's icon when the user hasn't chosen a different custom icon
				// (covers failed-import cog fallback and superseded library remaps).
				gear.settings.icon = appearance.icon;
			}
			// Fill blank iconColor from Register so the Gears editor shows the on-screen tint
			// (builtins ship #ffffff rather than an empty inherit).
			if (gear.settings.iconColor.empty() && !appearance.iconColor.empty()) {
				gear.settings.iconColor = appearance.iconColor;
			}
		}
		return;
	}
	// New gear row — drop a stale seen key so OfferDefaultGear can place it. Survives
	// ApplyStateJson / SyncDir races that removed the entity without clearing seen.
	_seenSources.erase(KeyOf(mod, name));
	CogGear gear;
	gear.id = FileStem(mod + "_" + name);
	gear.sourceMod = mod;
	gear.varName = name;
	gear.defaults = appearance;
	gear.settings = appearance;
	_gears.push_back(std::move(gear));
}



std::int32_t CogRegistry::Register(
	std::string mod,
	std::string name,
	std::string type,
	std::string displayName,
	std::string category,
	std::string icon,
	std::string iconColor,
	std::string legacyEndColor,
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
	iconColor = CogRegistryJson::NormalizeRegisterIconColor(std::move(iconColor), std::move(legacyEndColor));
	barColor = CogRegistryJson::NormalizeColorRamp(std::move(barColor));
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
		if (!displayName.empty()) {
			src.displayName = std::move(displayName);
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
		AssignIfProvided(src.iconColor, std::move(iconColor));
		AssignIfProvided(src.barColor, std::move(barColor));
		AssignIfProvided(src.hideAt, std::move(hideAt));
		AssignIfProvided(src.hudLinkedElement, std::move(hudLinkedElement));
		src.hudHideDuplicate = hudHideDuplicate;
		receipt = src.receipt;
	} else {
		CogSource src;
		src.receipt = _nextReceipt++;
		src.sourceMod = std::move(mod);
		src.varName = std::move(name);
		src.displayName = displayName.empty() ? src.varName : std::move(displayName);
		src.category = std::move(category);
		src.type = ParseType(type);
		if (icon.empty()) {
			src.icon = kFallbackIcon;
			usedFallbackIcon = true;
		} else {
		src.icon = std::move(icon);
		}
		src.iconColor = std::move(iconColor);
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
			src.sourceMod,
			src.varName,
			kFallbackIcon);
	}
	CogGearAppearance appearance;
	appearance.displayName = src.displayName;
	appearance.icon = src.icon;
	appearance.iconColor = src.iconColor;
	appearance.barColor = src.barColor;
	appearance.hideAt = src.hideAt;
	appearance.hudLinkedElement = src.hudLinkedElement;
	appearance.hudHideDuplicate = src.hudHideDuplicate;
	EnsureGearDefinitionUnlocked(src.sourceMod, src.varName, appearance);
	// Heal gauges that still point at a case-drifted varName (e.g. "magicka" vs "Magicka").
	for (auto& gauge : _gauges) {
		if (KeyOf(gauge.sourceMod, gauge.varName) == KeyOf(src.sourceMod, src.varName)) {
			gauge.sourceMod = src.sourceMod;
			gauge.varName = src.varName;
		}
	}
	OfferDefaultGearUnlocked(src.sourceMod, src.varName);
	// BeginRegister…EndRegister: defer disk write; FlushBatchCommit / EndRegister / PushToUi commit once.
	if (_modBatchOpen.contains(src.sourceMod)) {
		_batchCommitPending = true;
	} else {
		SaveConfigUnlocked();
	}
	return receipt;
}



std::int32_t CogRegistry::RegisterGizmo(
	std::string mod,
	std::string typeId,
	std::string displayName,
	std::string galleryIcon,
	float defaultWidth,
	float defaultHeight,
	std::string viewScript,
	std::string settingsSchema,
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
	// Reserved COG / COG.* / cog-* gates live in the Papyrus wrapper (_API_Gizmos).
	// Builtins seed via RegisterBuiltinGizmoTypesUnlocked and never call this.
	viewScript = SanitizeViewScriptPath(std::move(viewScript));
	settingsSchema = TrimCopy(std::move(settingsSchema));
	defaultVisibility = NormalizeGizmoVisibility(std::move(defaultVisibility));

	// Detect settingsSchema: legacy JSON vs Data-relative HTML path.
	// Migration Code for Transition from v1.11 or earlier to v1.2: `[`/`{` → schema editor.
	const bool htmlMode = !settingsSchema.empty() && !LooksLikeJsonObjectOrArray(settingsSchema);
	std::string htmlSourcePath;
	std::filesystem::path htmlSourceAbs;
	if (htmlMode) {
		htmlSourcePath = SanitizeViewScriptPath(settingsSchema);
		if (htmlSourcePath.empty()) {
			logger::warn(
				"RegisterGizmo rejected: invalid settings HTML path for typeId '{}' (mod='{}')",
				typeId,
				mod);
			return 0;
		}
		htmlSourceAbs = std::filesystem::current_path() / "Data" / htmlSourcePath;
		std::error_code existsEc;
		if (!std::filesystem::is_regular_file(htmlSourceAbs, existsEc)) {
			logger::warn(
				"RegisterGizmo rejected: settings HTML missing or unreadable '{}' for typeId '{}' (mod='{}')",
				htmlSourceAbs.string(),
				typeId,
				mod);
			return 0;
		}
	}

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

	if (htmlMode) {
		const auto htmlDestAbs = CogGizmoStorage::EnsureDir(typeId) / "settings.html";
		std::error_code canonSrcEc;
		std::error_code canonDstEc;
		const auto canonSrc = std::filesystem::weakly_canonical(htmlSourceAbs, canonSrcEc);
		const auto canonDst = std::filesystem::weakly_canonical(htmlDestAbs, canonDstEc);
		const bool sameFile =
			!canonSrcEc && !canonDstEc && !canonSrc.empty() && canonSrc == canonDst;
		if (!sameFile) {
			std::error_code copyEc;
			std::filesystem::create_directories(htmlDestAbs.parent_path(), copyEc);
			std::filesystem::copy_file(
				htmlSourceAbs,
				htmlDestAbs,
				std::filesystem::copy_options::overwrite_existing,
				copyEc);
			if (copyEc) {
				logger::warn(
					"RegisterGizmo rejected: could not copy settings HTML '{}' → '{}' ({}) for typeId '{}' (mod='{}')",
					htmlSourceAbs.string(),
					htmlDestAbs.string(),
					copyEc.message(),
					typeId,
					mod);
				return 0;
			}
		}
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
	if (htmlMode) {
		slot->settingsMode = "html";
		slot->settingsHtmlSourcePath = std::move(htmlSourcePath);
		slot->settingsSchemaJson = "[]";
	} else {
		slot->settingsMode = "schema";
		slot->settingsHtmlSourcePath.clear();
		slot->settingsSchemaJson = settingsSchema.empty() ? "[]" : std::move(settingsSchema);
	}

	std::int32_t receipt = 0;
	if (auto existing = _gizmoTypeReceiptIndex.find(typeId); existing != _gizmoTypeReceiptIndex.end()) {
		receipt = existing->second;
	} else {
		receipt = _nextReceipt++;
		_gizmoTypeReceiptIndex[typeId] = receipt;
		_gizmoTypeReceipts[receipt] = typeId;
	}
	// Ensure type-owned data folder (gizmoTypes/<typeId>/) exists for icon maps, translations, etc.
	CogGizmoStorage::EnsureDir(typeId);
	_catalogDirty = true;
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
		if (CogRegistryJson::MergeGizmoSettingsFromType(g, FindGizmoTypeUnlocked(g.typeId))) {
			changed = true;
		}
	}
	return changed;
}



void CogRegistry::RegisterBuiltinGizmoTypesUnlocked()
{
	// Builtins ship settings.html under plugin/gizmoTypes/<typeId>/ (xmake stages it).
	// Defaults remain in JS create(); complex UX (clock lines, suppressor lists, Feed sections) uses HTML scripts.
	auto upsert = [&](const char* typeId, const char* displayName, const char* icon, float w, float h,
					  const char* defaultVisibility) {
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
		slot->settingsMode = "html";
		slot->settingsHtmlSourcePath =
			std::string("SKSE/Plugins/COG/gizmoTypes/") + typeId + "/settings.html";
		slot->settingsSchemaJson = "[]";
		CogGizmoStorage::EnsureDir(typeId);
	};
	upsert("cog-clock", "Clock", "Actions/wait.svg", 275.0f, 40.0f, "hud");
	upsert("cog-shout-meter", "Shout Meter", "Actions/shout.svg", 220.0f, 48.0f, "hud");
	upsert("cog-feed", "Feed", "Scribe/list.svg", 400.0f, 400.0f, "ui");
	upsert("cog-suppressor", "Suppressor", "Actions/stop.svg", 100.0f, 100.0f, "none");
}



void CogRegistry::RegisterBuiltinGizmoTypes()
{
	std::lock_guard lock(_mutex);
	RegisterBuiltinGizmoTypesUnlocked();
}



void CogRegistry::EnsureBuiltinSources()
{
	// Sole register path for COG.Builtin (not Papyrus). Live values: RefreshLiveUnlocked.
	BeginRegister("COG.Builtin", kCogPluginFile);
	Register("COG.Builtin", "Health", "percent", "Health", "Stat", "Survival/health.svg", "#ffffff", "", "#DF2020", "", "hud.health", true);
	Register("COG.Builtin", "Stamina", "percent", "Stamina", "Stat", "Camping/hiker.svg", "#ffffff", "", "#20DF20", "", "hud.stamina", true);
	Register("COG.Builtin", "MountStamina", "percent", "Mount Stamina", "Mount", "Animals/horse-head.svg", "#ffffff", "", "#20DF20", "<0.01");
	Register("COG.Builtin", "Magicka", "percent", "Magicka", "Stat", "Magic/crystal-ball-shiny.svg", "#ffffff", "", "#2020DF", "", "hud.magicka", true);
	Register("COG.Builtin", "CarryWeight", "percent", "Carry Weight", "Stat", "Camping/backpack.svg", "#ffffff");
	Register("COG.Builtin", "Arrows", "count", "Arrows (Equipped)", "Equipment", "Weapons/arrows.svg", "#ffffff", "", "", "<0.01", "hud.ammo", true);
	Register("COG.Builtin", "Bolts", "count", "Bolts (Equipped)", "Equipment", "Weapons/quiver.svg", "#ffffff", "", "", "<0.01", "hud.ammo", true);
	Register("COG.Builtin", "Werewolf", "timer", "Transformation", "Werewolf", "Werewolf/wolf.svg", "#ffffff", "", "#777780");
	Register("COG.Builtin", "VampiricHunger", "percent", "Vampiric Hunger", "Vampire", "Vampire/fangs.svg", "#ffffff", "", "", "<0.01");
	Register("COG.Builtin", "Oxygen", "timer", "Oxygen", "Survival", "Survival/oxygen.svg", "#ffffff", "", "#44DDCC", "", "hud.oxygen", true);
	Register("COG.Builtin", "BowDraw", "percent", "Bow Draw", "Charge", "Weapons/bow.svg", "#ffffff", "", "#AA6633", "<0.01", "hud.casting", true);
	Register("COG.Builtin", "SpellCharge", "percent", "Spell Casting", "Charge", "Magic/sparkles.svg", "#ffffff", "", "#7744DD", "<0.01", "hud.casting", true);
	Register("COG.Builtin", "WeaponCharge", "percent", "Weapon Charge", "Charge", "Actions/hand-right.svg", "#ffffff", "", "", "<0.01", "hud.charge", true);
	Register("COG.Builtin", "SecondaryWeaponCharge", "percent", "Secondary Weapon Charge", "Charge", "Actions/hand-left.svg", "#ffffff", "", "", "<0.01", "hud.leftcharge", true);
	Register("COG.Builtin", "Shout", "timer", "Shout Cooldown", "Charge", "Actions/shout.svg", "#ffffff", "", "#5ba4f9", "", "hud.casting", true);
	Register("COG.Builtin", "Howl", "timer", "Howl Cooldown", "Charge", "Werewolf/wolf-side.svg", "#ffffff");
	Register("COG.Builtin", "FireResist", "percent", "Fire Resistance", "Resistance", "Survival/fire.svg", "#ffffff");
	Register("COG.Builtin", "FrostResist", "percent", "Frost Resistance", "Resistance", "Weather/snowflake.svg", "#ffffff");
	Register("COG.Builtin", "ShockResist", "percent", "Shock Resistance", "Resistance", "Weather/lightning.svg", "#ffffff");
	Register("COG.Builtin", "PoisonResist", "percent", "Poison Resistance", "Resistance", "Alchemy/skull-and-bones.svg", "#ffffff");
	Register("COG.Builtin", "MagicResist", "percent", "Magic Resistance", "Resistance", "Magic/sparkles.svg", "#ffffff");
	Register("COG.Builtin", "DiseaseResist", "percent", "Disease Resistance", "Resistance", "Survival/virus.svg", "#ffffff");
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
	it->settings.displayName = "Default Group";
	if (it != _groups.begin()) {
		std::rotate(_groups.begin(), it, std::next(it));
	}
	return false;
}



void CogRegistry::RememberGearKeysUnlocked()
{
	for (const auto& gear : _gears) {
		_seenSources.insert(KeyOf(gear.sourceMod, gear.varName));
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
		if (KeyOf(gear.sourceMod, gear.varName) == key) {
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
}



void CogRegistry::OnViewReady()
{
	int feedCount = 0;
	int feedVisible = 0;
	std::string visibleDetail;
	{
		std::lock_guard lock(_mutex);
		for (const auto& g : _gizmos) {
			if (NormalizeGizmoType(g.typeId) != "cog-feed") {
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
			one << "id=\"" << g.id << "\" displayName=\"" << CogRegistryJson::GizmoDisplayName(g)
				<< "\" visibility=" << g.visibility
				<< " notif="
				<< (CogFeedSources::SourceEnabled(g, CogFeedSources::kIdNotifications) ? 1 : 0)
				<< " inv=" << (CogFeedSources::SourceEnabled(g, CogFeedSources::kIdInventory) ? 1 : 0)
				<< " loc=" << (CogFeedSources::SourceEnabled(g, CogFeedSources::kIdLocation) ? 1 : 0)
				<< " discovery="
				<< (CogFeedSources::SourceFieldBool(g, CogFeedSources::kIdLocation, "showLocationDiscovery", true)
						? 1
						: 0)
				<< " current="
				<< (CogFeedSources::SourceFieldBool(g, CogFeedSources::kIdLocation, "showCurrentLocation", true) ? 1
																												 : 0)
				<< " icons="
				<< (CogFeedSources::SourceFieldBool(g, CogFeedSources::kIdLocation, "showLocationIcons", true) ? 1
																											   : 0)
				<< " x=" << std::fixed << std::setprecision(3) << g.display.x << " y=" << g.display.y;
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
		"Feed: divert armed — notifications={} inventory={} locationDiscovery={} currentLocation={} skillsSection={} skillProgress={} levelProgress={} questStatus={} questObjectives={}",
		HasVisibleFeedShowingNotifications(),
		HasVisibleFeedShowingInventory(),
		HasVisibleFeedDivertingLocationDiscovery(),
		HasVisibleFeedDivertingCurrentLocation(),
		HasVisibleFeedShowingSkills(),
		HasVisibleFeedShowingSkillProgress(),
		HasVisibleFeedShowingLevelProgress(),
		HasVisibleFeedDivertingQuestStatus(),
		HasVisibleFeedDivertingQuestObjectives());
	MarkCatalogDirty();
	CogFeed::PushPendingFeedEventsToUi();
}

