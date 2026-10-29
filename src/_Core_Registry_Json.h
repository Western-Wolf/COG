#pragma once

#include "_Core_Registry.h"
#include "_Core_Json.h"

#include <initializer_list>
#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>

// Entity normalize / parse / serialize shared by Registry core, Config, and UiPush.
// Shared helpers live in _Core_Registry_Json.cpp; entity Parse/Append in
// _Core_Registry_Json_{Gear,Gauge,Gizmo}.cpp (same CogRegistryJson namespace).
namespace CogRegistryJson
{
	std::string Lower(std::string s);
	std::string TrimCopy(std::string raw);
	std::string EscapeJson(const std::string& s);
	std::string FileStem(const std::string& id);

	std::string NormalizeIcon(std::string raw);
	std::string NormalizeHideAt(std::string raw);
	// When varType is count/timer, threshold stays absolute; percent uses 0–1 ratio (or explicit %).
	std::string NormalizeHideAt(std::string raw, std::string_view varType);
	std::string NormalizeHexColor(std::string raw, const char* fallback);
	std::string OptionalHexColor(std::string raw);
	/** True if raw is a plain #hex (not a JSON array). */
	bool LooksLikePlainHexColor(std::string_view raw);
	/** Hex, JSON stop array, or "" — empty if invalid/unset. Migrates legacy start/end when iconColor empty. */
	std::string NormalizeColorRamp(std::string raw);
	std::string MigrateLegacyIconPair(std::string startColor, std::string endColor);
	/** RegisterGear: legacyEnd hex + plain icon hex → two-stop ramp; else normalize iconColor alone. */
	std::string NormalizeRegisterIconColor(std::string iconColor, std::string legacyEndColor);
	/** Read iconColor / barColor field (string or array); apply start/end migration for icon. */
	std::string ReadColorRampField(
		const CogJson::Value& obj,
		CogJson::ParseContext& ctx,
		std::string_view key,
		bool migrateLegacyIconPair = false);
	void WriteColorRampField(CogJson::Writer& w, std::string_view key, const std::string& ramp);
	/** Append `"key":<hex|array>` into a snapshot stream (empty → `""`). */
	void AppendColorRampJson(std::ostringstream& o, std::string_view key, const std::string& ramp);
	/** Read appearance `icon` (plain path string or JSON stop array). */
	std::string ReadIconField(const CogJson::Value& obj, CogJson::ParseContext& ctx, std::string_view key = "icon");
	/** Write `icon` as a string path or raw JSON array (same shape as colour ramps). */
	void WriteIconField(CogJson::Writer& w, std::string_view key, const std::string& icon);
	/** Append `"icon":<path|array>` into a snapshot stream. */
	void AppendIconJson(std::ostringstream& o, std::string_view key, const std::string& icon);
	std::string NormalizeEditorKey(const std::string& raw);
	std::string NormalizeGizmoType(std::string raw);
	/**
	 * Resolve instance product id: prefer typeId, else legacy root "type".
	 * Returns empty when missing/invalid — callers must discard the instance (do not invent cog-clock).
	 * Migration Code for Transition from v1.01 or earlier to v1.1: legacy root "type" → typeId.
	 */
	std::string ResolveGizmoInstanceTypeId(const CogJson::Value& obj, CogJson::ParseContext& ctx);
	/** hud = HUD Visible, ui = UI Visible (menus too). Unknown/empty → hud. */
	std::string NormalizeGizmoVisibility(std::string raw);
	/** Universal/builtin visibility when no type record exists (feed→ui, suppressor→none, else hud). */
	std::string BuiltinDefaultVisibilityForType(std::string_view typeId);
	/** Fill missing settings keys from type schema `default` values. Returns true if any key was added. */
	bool MergeMissingSettingsFromSchema(CogJson::Value& settings, std::string_view settingsSchemaJson);
	/** Merge missing settings on an instance from its type schema. Returns true if settingsJson changed. */
	bool MergeGizmoSettingsFromType(CogGizmo& g, const CogGizmoType* type);
	// visibility != "none" — instance participates in play (divert / HUD mount rules).
	bool GizmoIsPlayActive(const CogGizmo& g);
	bool GizmoSettingsBool(const CogGizmo& g, std::string_view key, bool fallback);
	std::string GizmoSettingsString(const CogGizmo& g, std::string_view key, std::string_view fallback = "");
	std::string GizmoSettingsRawJson(const CogGizmo& g, std::string_view key, std::string_view fallback);
	/** Instance title from settings.displayName (empty if unset). */
	std::string GizmoDisplayName(const CogGizmo& g);
	std::string NormalizeStack(std::string raw);
	std::string NormalizeFillFromHidden(std::string raw);
	std::string NormalizeEndCapMode(std::string raw);
	std::string NormalizeEndCapArt(std::string raw);
	std::string NormalizeGaugePlacement(std::string raw);
	std::string NormalizeFrameSlot(std::string raw);
	std::string NormalizeIconColorMode(std::string raw);
	std::string NormalizeLabelColorMode(std::string raw);
	std::string NormalizeHudKeyListJson(std::string raw);

	std::string SanitizeGizmoTypeId(std::string raw);
	bool IsBuiltinGizmoTypeId(std::string_view typeId);
	std::string SanitizeViewScriptPath(std::string path);
	bool LooksLikeJsonObjectOrArray(std::string_view s);

	/** Shared helpers used by Gear / Gauge / Gizmo Json TUs. */
	std::string CanonicalPercentMode(std::string raw);
	float ReadPlacementFloat(
		const CogJson::Value& obj,
		const CogJson::Value* posObj,
		CogJson::ParseContext& ctx,
		const char* key,
		float fallback);
	bool HasPlacementKey(
		const CogJson::Value& obj,
		const CogJson::Value* posObj,
		CogJson::ParseContext& ctx,
		const char* key);
	void AppendDisplayXYR(CogJson::Writer& w, const CogDisplay& p);
	void AppendBoxDisplay(CogJson::Writer& w, const CogBoxDisplay& p);
	void NoteMigration(CogJson::ParseContext& ctx, std::string_view detail);
	bool NoteIfHas(CogJson::ParseContext& ctx, const CogJson::Value& obj, const char* key, std::string_view detail);
	bool NoteIfHasAny(
		CogJson::ParseContext& ctx,
		const CogJson::Value& obj,
		std::initializer_list<const char*> keys,
		std::string_view detail);
	bool KeyInList(std::string_view key, std::initializer_list<const char*> keys);
	void WarnUnknownKeys(
		CogJson::ParseContext& ctx,
		const CogJson::Value& obj,
		std::initializer_list<const char*> allowed,
		std::initializer_list<const char*> legacyConsumed,
		std::string_view bagLabel);

	CogGroup DefaultGroup();
	bool AppearanceEmpty(const CogGearAppearance& a);
	CogGearAppearance ParseAppearance(const CogJson::Value& obj, CogJson::ParseContext& ctx);
	void AppendAppearance(CogJson::Writer& w, const CogGearAppearance& a);

	CogGroup ParseGroup(const CogJson::Value& obj, CogJson::ParseContext& ctx);
	CogGear ParseGear(const CogJson::Value& obj, CogJson::ParseContext& ctx);
	/** Migration Code for Transition from v1.01 or earlier to v1.1: fold legacy gear-root exemptFromGroupColors into group settings maps. Returns true if any flag was folded. */
	bool MigrateLegacyGearExemptOntoGroups(std::vector<CogGroup>& groups);
	/** Single gear/gauge identity Bloodlust → VampiricHunger (shared by ParseGear / ParseGauge). */
	bool MigrateBuiltinBloodlustIdentity(
		std::string& sourceMod,
		std::string& varName,
		std::string* id,
		CogJson::ParseContext* ctx);
	/**
	 * Migration Code for Transition from v1.01 or earlier to v1.1:
	 * Builtin Vampiric Hunger `Bloodlust` → `VampiricHunger` (gear id, group gearIds/exempt, gauges, seen keys).
	 * Returns true if anything changed.
	 */
	bool MigrateBuiltinBloodlustToVampiricHunger(
		std::vector<CogGear>& gears,
		std::vector<CogGroup>& groups,
		std::vector<CogGauge>& gauges,
		std::unordered_set<std::string>& seenSources);
	CogGauge ParseGauge(const CogJson::Value& obj, CogJson::ParseContext& ctx);
	CogGizmo ParseGizmo(const CogJson::Value& obj, CogJson::ParseContext& ctx, const CogGizmoType* type = nullptr);
	CogGizmoType ParseGizmoType(const CogJson::Value& obj, CogJson::ParseContext& ctx);

	void AppendGroup(CogJson::Writer& w, const CogGroup& g);
	void AppendGear(CogJson::Writer& w, const CogGear& g);
	void AppendGauge(CogJson::Writer& w, const CogGauge& g);
	void AppendGizmo(CogJson::Writer& w, const CogGizmo& g);
	void AppendGizmoType(CogJson::Writer& w, const CogGizmoType& t);

	std::string GroupToJson(const CogGroup& g);
	std::string GearToJson(const CogGear& g);
	std::string GaugeToJson(const CogGauge& g);
	std::string GizmoToJson(const CogGizmo& g);
	std::string GizmoTypeToJson(const CogGizmoType& t);
}
