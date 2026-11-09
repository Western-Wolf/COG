#pragma once

#include <string>
#include <string_view>

#ifndef COG_PRODUCT_VERSION
#	define COG_PRODUCT_VERSION "?"
#endif

/** Exact tools/releases Version label (e.g. "1.20"), baked in at compile time. */
[[nodiscard]] inline std::string_view CogProductVersion() noexcept
{
	return COG_PRODUCT_VERSION;
}

[[nodiscard]] inline std::string CogProductVersionString()
{
	return std::string{ CogProductVersion() };
}
