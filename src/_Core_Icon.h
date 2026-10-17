#pragma once

namespace CogIcon
{
	/** Relative path under PrismaUI/views/COG/assets/icons/ */
	constexpr const char* kFallbackRelPath = "COG/cog.svg";

	/** Ensure assets/icons/COG/cog.svg exists (rewrite if missing or empty). */
	void EnsureFallbackIconOnDisk();
}
