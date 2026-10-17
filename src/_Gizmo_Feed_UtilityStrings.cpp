#include "pch.h"
#include "_Gizmo_Feed_UtilityStrings.h"

#include <algorithm>
#include <cctype>

namespace CogFeed::Strings
{
	std::string Trim(std::string s)
	{
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.front()))) {
			s.erase(s.begin());
		}
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back()))) {
			s.pop_back();
		}
		return s;
	}

	std::string Lower(std::string s)
	{
		std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return s;
	}

	std::string NormalizeIconPath(std::string raw)
	{
		raw = Trim(std::move(raw));
		for (char& c : raw) {
			if (c == '\\') {
				c = '/';
			}
		}
		// Reject path traversal and absolute/drive paths; ':' is reserved for form keys, not icons.
		if (raw.empty() || raw.find("..") != std::string::npos || raw.find(':') != std::string::npos) {
			return {};
		}
		while (raw.starts_with("./") || raw.starts_with("/")) {
			raw.erase(0, raw.starts_with("./") ? 2 : 1);
		}
		const auto lower = Lower(raw);
		if (lower.starts_with("assets/icons/")) {
			raw.erase(0, 13);
		} else if (lower.starts_with("icons/")) {
			raw.erase(0, 6);
		}
		const auto slash = raw.rfind('/');
		const auto base = slash == std::string::npos ? raw : raw.substr(slash + 1);
		if (!raw.empty() && base.find('.') == std::string::npos) {
			raw += ".svg";
		}
		// Windows-only: canonicalize path case so catalog/rules agree.
		return Lower(std::move(raw));
	}
}
