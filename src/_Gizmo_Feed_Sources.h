#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

struct CogGizmo;

namespace CogJson
{
	struct Value;
}

namespace RE::BSScript
{
	class IVirtualMachine;
}

/**
 * Feed source module catalog: COG_Feed_Ready + BeginRegister / RegisterSource / EndRegister,
 * SourceStorage, folder migrate 1.11→1.2, nested settings helpers.
 */
namespace CogFeedSources
{
	inline constexpr const char* kBuiltinMod = "COG";
	inline constexpr const char* kIdNotifications = "cog-notifications";
	inline constexpr const char* kIdInventory = "cog-inventory";
	inline constexpr const char* kIdLocation = "cog-location";
	inline constexpr const char* kIdSkills = "cog-skills";
	inline constexpr const char* kIdQuests = "cog-quests";
	inline constexpr const char* kIdEffects = "cog-effects";

	struct Entry
	{
		std::string id;
		std::string sourceMod;
		std::string displayName;
		std::string settingsHtmlRel;  // gizmoTypes/cog-feed/sources/<id>.html
		std::vector<std::string> colourVars;
		std::vector<std::string> hudSuppress;
		std::int32_t receipt = 0;
	};

	/** Absolute Data/SKSE/Plugins/COG/gizmoTypes/cog-feed (create if missing). */
	std::filesystem::path FeedStorageDir();

	/** Relative "gizmoTypes/cog-feed". */
	std::string FeedStorageRelative();

	/**
	 * Absolute …/sources/<sourceId> (folder only — rules/packs).
	 * Empty if sourceId empty after trim.
	 */
	std::filesystem::path SourceStorageDir(std::string_view sourceId);

	/** Relative "gizmoTypes/cog-feed/sources/<sourceId>". */
	std::string SourceStorageRelative(std::string_view sourceId);

	/**
	 * Migration Code for Transition from v1.11 or earlier to v1.2:
	 * Move legacy notifications|inventory|location|skills|effects → sources/cog-*.
	 * Call from main Feed path before icon-rule load / source registry.
	 */
	void MigrateLegacySourceFolders();

	/** Ensure feed dir + migrate + mark ready + register builtins + fire COG_Feed_Ready. */
	void Bootstrap();

	/** Re-arm after load-session clear (same timing idea as gear COG_Ready). */
	void OnLoadSessionReady();

	[[nodiscard]] bool IsReady();

	void BeginRegister(std::string sourceMod, std::string pluginFile = {});
	[[nodiscard]] std::int32_t RegisterSource(
		std::string sourceMod,
		std::string sourceId,
		std::string displayName,
		std::string settingsHtmlPath = {},
		std::string colourVarsJson = "[]",
		std::string hudSuppressJson = "[]");
	void EndRegister(std::string sourceMod);

	[[nodiscard]] bool IsRegistered(std::string_view sourceId);
	/** Copy of catalog entry when present. */
	[[nodiscard]] std::optional<Entry> Find(std::string_view sourceId);

	/** Map legacy cog-feed* / empty → canonical id used for routing (empty/unknown → notifications). */
	[[nodiscard]] std::string CanonicalSourceId(std::string_view raw);

	/** Log label: omitted → "empty"; else trimmed as provided (no coerce to general). */
	[[nodiscard]] std::string LogSourceLabel(std::string_view raw);

	/** Route bucket for Notify: registered id, else notifications. */
	[[nodiscard]] std::string RouteSourceId(std::string_view raw);

	/**
	 * Migration / heal: flat show* + colour keys → settings.sources.<id>, ensure builtin
	 * blocks exist, drop legacy flats, stamp feedSourcesVersion. Idempotent.
	 * @return true when settings were rewritten.
	 */
	bool CanonicalizeInstanceSettings(CogJson::Value& settings);

	/** Nested settings.sources.<id>.enabled with legacy flat show* fallback. */
	[[nodiscard]] bool SourceEnabled(const CogGizmo& g, std::string_view sourceId);

	[[nodiscard]] bool SourceFieldBool(
		const CogGizmo& g,
		std::string_view sourceId,
		std::string_view field,
		bool fallback);

	[[nodiscard]] std::string SourceFieldString(
		const CogGizmo& g,
		std::string_view sourceId,
		std::string_view field,
		std::string_view fallback);

	/** Compact JSON array of catalog entries (for UI snapshot). */
	[[nodiscard]] std::string CatalogJson(bool includeHtmlBodies);

	/** Union of hudSuppress aliases for enabled sources on this Feed instance. */
	[[nodiscard]] std::vector<std::string> HudSuppressForGizmo(const CogGizmo& g);
}

namespace CogApiFeedSources
{
	bool Bind(RE::BSScript::IVirtualMachine* vm);
}
