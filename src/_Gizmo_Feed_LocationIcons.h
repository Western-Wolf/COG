#pragma once

#include <string>
#include <string_view>

namespace CogFeed
{
	void LoadLocationIconRules();

	/** Resolve icon from <gizmoStorage>/location/*.txt (name = place text, kind = discovery|current). */
	[[nodiscard]] std::string ResolveLocationIcon(std::string_view placeText, std::string_view kind);
}
