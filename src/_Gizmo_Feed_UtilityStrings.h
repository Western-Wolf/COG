#pragma once

#include <string>

namespace CogFeed::Strings
{
	[[nodiscard]] std::string Trim(std::string s);
	[[nodiscard]] std::string Lower(std::string s);
	/** Scrub icon path for feed *.txt rules (slash normalize, reject .. / :, strip icons/ prefix, default .svg). */
	[[nodiscard]] std::string NormalizeIconPath(std::string raw);
}
