#pragma once

#include <string>

namespace CogIconImport
{
	/**
	 * Copy/convert a Data-relative source file into PrismaUI/views/COG/assets/imports/icons/.
	 * Returns the path relative to that imports folder (e.g. "MyMod/icon.png"), or "" on failure.
	 * Does not update COG's import index — call CogRegistry::RegisterImportedIcon afterward.
	 */
	[[nodiscard]] std::string ImportFromDataPath(
		std::string sourceMod,
		std::string iconName,
		std::string dataRelPath);
}
