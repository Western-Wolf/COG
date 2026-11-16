#pragma once

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

// HUD suppress alias packs under Data/SKSE/Plugins/COG/aliases/.
// Canon `_COG.json` is restored from the DLL each load; user packs may append
// targets to existing cog.* aliases or define non-reserved aliases.
namespace CogHudAliases
{
	struct Entry
	{
		std::string alias;
		std::string name;
		std::vector<std::string> targets;
		bool fromUser = false;
	};

	/** Restore `_COG.json`, load canon + user packs into the process catalog. */
	void Load(const std::filesystem::path& dataRoot);

	[[nodiscard]] bool Loaded();

	/** Case-insensitive pack lookup; nullptr if unknown. */
	[[nodiscard]] const Entry* Find(std::string_view token);

	/** True if a user pack defines this alias key (blocks legacy force-migrate). */
	[[nodiscard]] bool IsUserAliasKey(std::string_view token);

	/**
	 * Migration Code for Transition from v1.11 or earlier to v1.2:
	 * If token is on the legacy whitelist and not a user alias key, return cog.*.
	 * Otherwise return the trimmed original.
	 */
	[[nodiscard]] std::string MigrateToken(std::string_view token);

	/** In-place migrate; returns true if any element changed. */
	bool MigrateTokenList(std::vector<std::string>& tokens);

	/** Expand alias token to Scaleform keys; empty if not an alias. */
	[[nodiscard]] std::vector<std::string> ExpandAlias(std::string_view token);

	/** Prefer a cog.* alias whose targets contain key; else any alias; else empty. */
	[[nodiscard]] std::string AliasForTarget(std::string_view scaleformKey);

	[[nodiscard]] std::string NameForAlias(std::string_view aliasOrKey);

	/** JSON array of {value,name,targets,key} for UI (key = first target). */
	[[nodiscard]] std::string KnownAliasesJson();

	[[nodiscard]] std::vector<Entry> AllEntries();
}
