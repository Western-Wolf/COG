#include "pch.h"
#include "_Core_Icon.h"

#include <filesystem>
#include <fstream>

namespace
{
	// Kept in sync with view/assets/icons/COG/cog.svg (currentColor stroke).
	constexpr char kFallbackSvg[] =
		R"(<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="100" height="100" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M19.995 12a8 8 0 1 0-16 0a8 8 0 0 0 16 0"/><path d="M13.995 12a2 2 0 1 0-4 0a2 2 0 0 0 4 0m-2-8V2m0 18v2m4-16.93l1-1.733m-10 17.32l4.002-6.932m7.929-5.73l1.732-1m-15.589 9l-1.732 1m18.663-5h-8.005m-9.995 0H2m16.93 4l1.733 1m-15.589-9l-1.732-1m12.662 11.93l1 1.733m-10-17.32l3.924 6.805"/></g></svg>
)";
}

namespace CogIcon
{
	void EnsureFallbackIconOnDisk()
	{
		const auto path = std::filesystem::current_path() / "Data" / "PrismaUI" / "views" / "COG" /
		                  "assets" / "icons" / "COG" / "cog.svg";
		std::error_code ec;
		const bool missing = !std::filesystem::is_regular_file(path, ec);
		const auto size = missing ? static_cast<std::uintmax_t>(0)
		                          : std::filesystem::file_size(path, ec);
		if (!missing && !ec && size > 0) {
			return;
		}

		std::filesystem::create_directories(path.parent_path(), ec);
		std::ofstream out(path, std::ios::binary | std::ios::trunc);
		if (!out) {
			logger::warn("COG: failed to restore fallback icon {}", path.string());
			return;
		}
		out.write(kFallbackSvg, sizeof(kFallbackSvg) - 1);
		out.close();
		if (!out) {
			logger::warn("COG: failed writing fallback icon {}", path.string());
			return;
		}
		logger::info("COG: restored fallback icon {}", kFallbackRelPath);
	}
}
