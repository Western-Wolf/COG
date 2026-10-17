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
}
