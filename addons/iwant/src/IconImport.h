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
	 * Build RegisterGear iconColor from Status Bars colour states.
	 * `rgbLinesJoined`: one "r,g,b" line per state (0..n-1). Percents match
	 * iWant_Status_Bars._statusToPercent. Single hex when all equal; else JSON stops.
	 */
	[[nodiscard]] std::string BuildIconColorRamp(std::string rgbLinesJoined);

	/**
	 * Build RegisterGear icon stop list from Status Bars state assets.
	 * `cogPathsJoined`: one COG-relative icon path per line (repeats allowed).
	 * Consecutive duplicate paths collapse to one stop (first pct of the run).
	 * Single remaining asset → plain path; else JSON [{pct,path}].
	 */
	[[nodiscard]] std::string BuildIconAssetRamp(std::string cogPathsJoined);
}
