#pragma once

#include <string>

namespace CogIWant
{
	void MarkReady();
	[[nodiscard]] bool IsReady();

	/** Widgets library remap → shipped COG assets/icons path, or "". */
	[[nodiscard]] std::string MapWidgetsLibraryIcon(std::string exportedRelPath);

	/**
	 * Resolve an iWant export path to a Data-relative source file path
	 * (e.g. "Interface/exported/foo/bar.png"), applying PreferSibling. "" if missing.
	 */
	[[nodiscard]] std::string ResolveExportedIconPath(std::string exportedRelPath);

	/**
	 * Write a multi-icon pack JSON under PrismaUI/views/COG/assets/imports/icons/<Mod>/<Name>.json.
	 * `cogPathsJoined` is one COG-relative icon path per line (repeats allowed). Consecutive
	 * duplicate paths are collapsed into { pct, path } stops (aligned with setIconStatus).
	 * Returns the pack rel path, or the single icon path when collapse leaves one asset
	 * (no JSON written).
	 */
	[[nodiscard]] std::string WriteIconPack(
		std::string sourceMod,
		std::string iconName,
		std::string cogPathsJoined);

	/**
	 * Build RegisterGear iconColor from Status Bars colour states.
	 * `rgbLinesJoined`: one "r,g,b" line per state (0..n-1). Percents match
	 * iWant_Status_Bars._statusToPercent. Single hex when all equal; else JSON stops.
	 */
	[[nodiscard]] std::string BuildIconColorRamp(std::string rgbLinesJoined);
}
