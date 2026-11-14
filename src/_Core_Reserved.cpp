#include "pch.h"
#include "_Core_Reserved.h"

#include <cctype>
#include <string>

namespace
{
	std::string TrimCopy(std::string_view in)
	{
		std::string s(in);
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.front()))) {
			s.erase(s.begin());
		}
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back()))) {
			s.pop_back();
		}
		return s;
	}

	std::string LowerAscii(std::string s)
	{
		for (char& c : s) {
			c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
		}
		return s;
	}
}

namespace CogReserved
{
	bool IsReservedCogSourceMod(std::string_view sourceMod)
	{
		// Fold first so COG / cog / CoG / cog.Builtin / COG.BUILTIN behave identically.
		const auto lower = LowerAscii(TrimCopy(sourceMod));
		if (lower.empty()) {
			return false;
		}
		if (lower == "cog") {
			return true;
		}
		return lower.size() >= 4 && lower.compare(0, 4, "cog.") == 0;
	}

	bool IsReservedCogPrefixedId(std::string_view id)
	{
		// Fold first so cog-feed / COG-Feed / CoG-clock behave identically.
		const auto lower = LowerAscii(TrimCopy(id));
		return lower.size() >= 4 && lower.compare(0, 4, "cog-") == 0;
	}
}
