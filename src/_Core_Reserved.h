#pragma once

#include <string_view>

/**
 * COG-owned namespace rules for the Papyrus interpretation layer.
 * Comparisons are ASCII case-insensitive after trim (COG / cog / CoG all match).
 * Call only from Papyrus natives (and Notify routing); native builtin seeders never hit these gates.
 */
namespace CogReserved
{
	/** Exact "COG" or starts with "COG." (e.g. COG.Builtin, COG.Inventory) — any letter case. */
	[[nodiscard]] bool IsReservedCogSourceMod(std::string_view sourceMod);

	/** Starts with "cog-" (Feed sourceId, Gizmo typeId, Notify asSource, …) — any letter case. */
	[[nodiscard]] bool IsReservedCogPrefixedId(std::string_view id);
}
