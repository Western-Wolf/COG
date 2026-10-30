#pragma once

#include <filesystem>
#include <string>
#include <string_view>

/**
 * Per-type data root under SKSE/Plugins/COG/gizmoTypes/<typeId>/.
 * COG creates the folder on EnsureDir / RegisterGizmo; gizmos build subpaths
 * (e.g. storage / "translations", storage / "effects") without hard-coding the type id segment.
 * Coexists with the type catalog file gizmoTypes/<typeId>.json (file vs directory).
 */
namespace CogGizmoStorage
{
	/** Absolute Data/SKSE/Plugins/COG root (same as CogRegistry::DataRoot). */
	std::filesystem::path DataRoot();

	/**
	 * Path relative to the COG data root, e.g. "gizmoTypes/cog-feed".
	 * Empty if typeId is empty after trim. Aliases normalize (feed → cog-feed).
	 */
	std::string Relative(std::string_view typeId);

	/**
	 * Absolute gizmo storage directory; creates it if missing.
	 * Empty path if typeId is empty after trim.
	 */
	std::filesystem::path EnsureDir(std::string_view typeId);
}
